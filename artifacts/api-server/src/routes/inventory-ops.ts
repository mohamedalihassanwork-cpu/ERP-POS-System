import { Router, type IRouter, type Request } from "express";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  colorsTable,
  db,
  inventoryItemsTable,
  inventoryMovementsTable,
  productsTable,
  productVariantsTable,
  sizesTable,
  stockCountItemsTable,
  stockCountsTable,
  usersTable,
  warehouseTransferItemsTable,
  warehouseTransfersTable,
  warehousesTable,
} from "@workspace/db";
import {
  CreateStockCountBody,
  CreateTransferBody,
  ListStockCountsQueryParams,
  ListTransfersQueryParams,
  UpdateStockCountItemsBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { nextDocumentNumber } from "../lib/sequences";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Applies a stock delta to the cached inventory row, books an immutable movement,
// and returns the resulting balance. Mirrors the adjustment-posting pattern.
async function postMovement(
  tx: Tx,
  args: {
    storeId: string;
    variantId: string;
    warehouseId: string;
    type: "TRANSFER_OUT" | "TRANSFER_IN" | "STOCK_COUNT_CORRECTION";
    delta: number;
    referenceType: string;
    referenceId: string;
    userId: string;
    notes?: string | null;
    allowNegative?: boolean;
  },
): Promise<number> {
  const [item] = await tx
    .insert(inventoryItemsTable)
    .values({
      storeId: args.storeId,
      variantId: args.variantId,
      warehouseId: args.warehouseId,
      quantity: args.delta,
    })
    .onConflictDoUpdate({
      target: [inventoryItemsTable.variantId, inventoryItemsTable.warehouseId],
      set: { quantity: sql`${inventoryItemsTable.quantity} + ${args.delta}` },
    })
    .returning({ quantity: inventoryItemsTable.quantity });

  const newQty = item.quantity;
  if (newQty < 0 && !args.allowNegative) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  await tx.insert(inventoryMovementsTable).values({
    storeId: args.storeId,
    variantId: args.variantId,
    warehouseId: args.warehouseId,
    type: args.type,
    quantityChange: args.delta,
    balanceAfter: newQty,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    notes: args.notes ?? null,
    createdBy: args.userId,
  });

  return newQty;
}

const variantLabel = sql<string>`concat(${colorsTable.name}, ' / ', ${sizesTable.name})`;

// ---------------------------------------------------------------------------
// Warehouse transfers
// ---------------------------------------------------------------------------

async function loadTransferDetail(storeId: string, id: string) {
  const [t] = await db
    .select({
      id: warehouseTransfersTable.id,
      transferNumber: warehouseTransfersTable.transferNumber,
      fromWarehouseId: warehouseTransfersTable.fromWarehouseId,
      toWarehouseId: warehouseTransfersTable.toWarehouseId,
      status: warehouseTransfersTable.status,
      notes: warehouseTransfersTable.notes,
      createdByName: usersTable.fullName,
      createdAt: warehouseTransfersTable.createdAt,
      confirmedAt: warehouseTransfersTable.confirmedAt,
    })
    .from(warehouseTransfersTable)
    .leftJoin(usersTable, eq(warehouseTransfersTable.createdBy, usersTable.id))
    .where(and(eq(warehouseTransfersTable.id, id), eq(warehouseTransfersTable.storeId, storeId)))
    .limit(1);
  if (!t) return null;

  const [fromWh] = await db
    .select({ name: warehousesTable.name })
    .from(warehousesTable)
    .where(eq(warehousesTable.id, t.fromWarehouseId))
    .limit(1);
  const [toWh] = await db
    .select({ name: warehousesTable.name })
    .from(warehousesTable)
    .where(eq(warehousesTable.id, t.toWarehouseId))
    .limit(1);

  const items = await db
    .select({
      id: warehouseTransferItemsTable.id,
      variantId: warehouseTransferItemsTable.variantId,
      productName: productsTable.name,
      sku: productVariantsTable.sku,
      variantLabel,
      quantity: warehouseTransferItemsTable.quantity,
    })
    .from(warehouseTransferItemsTable)
    .leftJoin(
      productVariantsTable,
      eq(warehouseTransferItemsTable.variantId, productVariantsTable.id),
    )
    .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .leftJoin(colorsTable, eq(productVariantsTable.colorId, colorsTable.id))
    .leftJoin(sizesTable, eq(productVariantsTable.sizeId, sizesTable.id))
    .where(eq(warehouseTransferItemsTable.transferId, id));

  return {
    id: t.id,
    transferNumber: t.transferNumber,
    fromWarehouseId: t.fromWarehouseId,
    toWarehouseId: t.toWarehouseId,
    fromWarehouseName: fromWh?.name ?? null,
    toWarehouseName: toWh?.name ?? null,
    status: t.status,
    itemCount: items.length,
    notes: t.notes,
    createdByName: t.createdByName,
    createdAt: t.createdAt.toISOString(),
    confirmedAt: t.confirmedAt ? t.confirmedAt.toISOString() : null,
    items,
  };
}

// GET /inventory/transfers
router.get(
  "/inventory/transfers",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const parsed = ListTransfersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { status, page, pageSize } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(warehouseTransfersTable.storeId, storeId)];
    if (status) conditions.push(eq(warehouseTransfersTable.status, status));
    const where = and(...conditions);

    const [{ total }] = await db
      .select({ total: count() })
      .from(warehouseTransfersTable)
      .where(where);

    const fromWh = warehousesTable;
    const rows = await db
      .select({
        id: warehouseTransfersTable.id,
        transferNumber: warehouseTransfersTable.transferNumber,
        fromWarehouseName: sql<string | null>`${fromWh.name}`,
        toWarehouseName: sql<string | null>`(select name from warehouses w2 where w2.id = ${warehouseTransfersTable.toWarehouseId})`,
        status: warehouseTransfersTable.status,
        itemCount: sql<number>`(select count(*) from warehouse_transfer_items i where i.transfer_id = ${warehouseTransfersTable.id})`,
        notes: warehouseTransfersTable.notes,
        createdByName: usersTable.fullName,
        createdAt: warehouseTransfersTable.createdAt,
        confirmedAt: warehouseTransfersTable.confirmedAt,
      })
      .from(warehouseTransfersTable)
      .leftJoin(fromWh, eq(warehouseTransfersTable.fromWarehouseId, fromWh.id))
      .leftJoin(usersTable, eq(warehouseTransfersTable.createdBy, usersTable.id))
      .where(where)
      .orderBy(desc(warehouseTransfersTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      })),
      total,
      page,
      pageSize,
    });
  },
);

// GET /inventory/transfers/:id
router.get(
  "/inventory/transfers/:id",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const detail = await loadTransferDetail(req.auth!.storeId, String(req.params["id"]));
    if (!detail) {
      res.status(404).json({ error: "التحويل غير موجود" });
      return;
    }
    res.json(detail);
  },
);

// POST /inventory/transfers
router.post(
  "/inventory/transfers",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const parsed = CreateTransferBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { fromWarehouseId, toWarehouseId, notes, items } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    if (fromWarehouseId === toWarehouseId) {
      res.status(400).json({ error: "لا يمكن التحويل إلى نفس المخزن" });
      return;
    }
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
      res.status(400).json({ error: "الكمية يجب أن تكون عدداً صحيحاً موجباً" });
      return;
    }

    const warehouses = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(
        and(
          eq(warehousesTable.storeId, storeId),
          inArray(warehousesTable.id, [fromWarehouseId, toWarehouseId]),
        ),
      );
    if (warehouses.length !== 2) {
      res.status(404).json({ error: "أحد المخازن غير موجود" });
      return;
    }

    for (const i of items) {
      const [variant] = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(and(eq(productVariantsTable.id, i.variantId), eq(productVariantsTable.storeId, storeId)))
        .limit(1);
      if (!variant) {
        res.status(404).json({ error: "أحد المتغيرات غير موجود" });
        return;
      }
    }

    let transferId: string;
    try {
      transferId = await db.transaction(async (tx) => {
        const transferNumber = await nextDocumentNumber(tx, storeId, "TRANSFER");
        const [transfer] = await tx
          .insert(warehouseTransfersTable)
          .values({
            storeId,
            transferNumber,
            fromWarehouseId,
            toWarehouseId,
            status: "PENDING",
            notes: notes ?? null,
            createdBy: userId,
          })
          .returning({ id: warehouseTransfersTable.id });

        for (const i of items) {
          await tx.insert(warehouseTransferItemsTable).values({
            storeId,
            transferId: transfer.id,
            variantId: i.variantId,
            quantity: i.quantity,
          });
          // Source stock leaves immediately; destination waits for confirmation.
          await postMovement(tx, {
            storeId,
            variantId: i.variantId,
            warehouseId: fromWarehouseId,
            type: "TRANSFER_OUT",
            delta: -i.quantity,
            referenceType: "TRANSFER",
            referenceId: transfer.id,
            userId,
          });
        }
        return transfer.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
        res.status(400).json({ error: "الكمية غير كافية في المخزن المصدر" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "transfer.created",
      entityType: "warehouse_transfer",
      entityId: transferId,
      newValue: { fromWarehouseId, toWarehouseId, items: items.length },
      ipAddress: clientIp(req),
    });

    res.status(201).json(await loadTransferDetail(storeId, transferId));
  },
);

// POST /inventory/transfers/:id/complete
router.post(
  "/inventory/transfers/:id/complete",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    try {
      await db.transaction(async (tx) => {
        const [transfer] = await tx
          .select()
          .from(warehouseTransfersTable)
          .where(
            and(eq(warehouseTransfersTable.id, id), eq(warehouseTransfersTable.storeId, storeId)),
          )
          
          .limit(1);
        if (!transfer) throw new Error("NOT_FOUND");
        if (transfer.status !== "PENDING") throw new Error("BAD_STATE");

        const lines = await tx
          .select()
          .from(warehouseTransferItemsTable)
          .where(eq(warehouseTransferItemsTable.transferId, id));

        for (const line of lines) {
          await postMovement(tx, {
            storeId,
            variantId: line.variantId,
            warehouseId: transfer.toWarehouseId,
            type: "TRANSFER_IN",
            delta: line.quantity,
            referenceType: "TRANSFER",
            referenceId: id,
            userId,
            allowNegative: true,
          });
        }

        await tx
          .update(warehouseTransfersTable)
          .set({ status: "COMPLETED", confirmedBy: userId, confirmedAt: new Date() })
          .where(eq(warehouseTransfersTable.id, id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        res.status(404).json({ error: "التحويل غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "BAD_STATE") {
        res.status(400).json({ error: "لا يمكن تأكيد تحويل غير معلّق" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "transfer.completed",
      entityType: "warehouse_transfer",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json(await loadTransferDetail(storeId, id));
  },
);

// POST /inventory/transfers/:id/cancel
router.post(
  "/inventory/transfers/:id/cancel",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    try {
      await db.transaction(async (tx) => {
        const [transfer] = await tx
          .select()
          .from(warehouseTransfersTable)
          .where(
            and(eq(warehouseTransfersTable.id, id), eq(warehouseTransfersTable.storeId, storeId)),
          )
          
          .limit(1);
        if (!transfer) throw new Error("NOT_FOUND");
        if (transfer.status !== "PENDING") throw new Error("BAD_STATE");

        const lines = await tx
          .select()
          .from(warehouseTransferItemsTable)
          .where(eq(warehouseTransferItemsTable.transferId, id));

        // Return the reserved stock to the source warehouse.
        for (const line of lines) {
          await postMovement(tx, {
            storeId,
            variantId: line.variantId,
            warehouseId: transfer.fromWarehouseId,
            type: "TRANSFER_IN",
            delta: line.quantity,
            referenceType: "TRANSFER_CANCEL",
            referenceId: id,
            userId,
            allowNegative: true,
          });
        }

        await tx
          .update(warehouseTransfersTable)
          .set({ status: "CANCELLED" })
          .where(eq(warehouseTransfersTable.id, id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        res.status(404).json({ error: "التحويل غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "BAD_STATE") {
        res.status(400).json({ error: "لا يمكن إلغاء تحويل غير معلّق" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "transfer.cancelled",
      entityType: "warehouse_transfer",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json(await loadTransferDetail(storeId, id));
  },
);

// ---------------------------------------------------------------------------
// Stock counts
// ---------------------------------------------------------------------------

async function loadStockCountDetail(storeId: string, id: string) {
  const [c] = await db
    .select({
      id: stockCountsTable.id,
      countNumber: stockCountsTable.countNumber,
      warehouseId: stockCountsTable.warehouseId,
      warehouseName: warehousesTable.name,
      status: stockCountsTable.status,
      notes: stockCountsTable.notes,
      createdByName: usersTable.fullName,
      createdAt: stockCountsTable.createdAt,
      completedAt: stockCountsTable.completedAt,
    })
    .from(stockCountsTable)
    .leftJoin(warehousesTable, eq(stockCountsTable.warehouseId, warehousesTable.id))
    .leftJoin(usersTable, eq(stockCountsTable.createdBy, usersTable.id))
    .where(and(eq(stockCountsTable.id, id), eq(stockCountsTable.storeId, storeId)))
    .limit(1);
  if (!c) return null;

  const items = await db
    .select({
      id: stockCountItemsTable.id,
      variantId: stockCountItemsTable.variantId,
      productName: productsTable.name,
      sku: productVariantsTable.sku,
      variantLabel,
      expectedQuantity: stockCountItemsTable.expectedQuantity,
      countedQuantity: stockCountItemsTable.countedQuantity,
    })
    .from(stockCountItemsTable)
    .leftJoin(productVariantsTable, eq(stockCountItemsTable.variantId, productVariantsTable.id))
    .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .leftJoin(colorsTable, eq(productVariantsTable.colorId, colorsTable.id))
    .leftJoin(sizesTable, eq(productVariantsTable.sizeId, sizesTable.id))
    .where(eq(stockCountItemsTable.countId, id));

  return {
    id: c.id,
    countNumber: c.countNumber,
    warehouseId: c.warehouseId,
    warehouseName: c.warehouseName,
    status: c.status,
    itemCount: items.length,
    notes: c.notes,
    createdByName: c.createdByName,
    createdAt: c.createdAt.toISOString(),
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
    items,
  };
}

// GET /inventory/stock-counts
router.get(
  "/inventory/stock-counts",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const parsed = ListStockCountsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { status, page, pageSize } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(stockCountsTable.storeId, storeId)];
    if (status) conditions.push(eq(stockCountsTable.status, status));
    const where = and(...conditions);

    const [{ total }] = await db.select({ total: count() }).from(stockCountsTable).where(where);

    const rows = await db
      .select({
        id: stockCountsTable.id,
        countNumber: stockCountsTable.countNumber,
        warehouseName: warehousesTable.name,
        status: stockCountsTable.status,
        itemCount: sql<number>`(select count(*) from stock_count_items i where i.count_id = ${stockCountsTable.id})`,
        notes: stockCountsTable.notes,
        createdByName: usersTable.fullName,
        createdAt: stockCountsTable.createdAt,
        completedAt: stockCountsTable.completedAt,
      })
      .from(stockCountsTable)
      .leftJoin(warehousesTable, eq(stockCountsTable.warehouseId, warehousesTable.id))
      .leftJoin(usersTable, eq(stockCountsTable.createdBy, usersTable.id))
      .where(where)
      .orderBy(desc(stockCountsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      })),
      total,
      page,
      pageSize,
    });
  },
);

// GET /inventory/stock-counts/:id
router.get(
  "/inventory/stock-counts/:id",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const detail = await loadStockCountDetail(req.auth!.storeId, String(req.params["id"]));
    if (!detail) {
      res.status(404).json({ error: "الجرد غير موجود" });
      return;
    }
    res.json(detail);
  },
);

// POST /inventory/stock-counts — opens a session and snapshots expected quantities
router.post(
  "/inventory/stock-counts",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const parsed = CreateStockCountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { warehouseId, notes } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    const [warehouse] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.storeId, storeId)))
      .limit(1);
    if (!warehouse) {
      res.status(404).json({ error: "المخزن غير موجود" });
      return;
    }

    const countId = await db.transaction(async (tx) => {
      const countNumber = await nextDocumentNumber(tx, storeId, "STOCK_COUNT");
      const [countRow] = await tx
        .insert(stockCountsTable)
        .values({
          storeId,
          countNumber,
          warehouseId,
          status: "OPEN",
          notes: notes ?? null,
          createdBy: userId,
        })
        .returning({ id: stockCountsTable.id });

      const stock = await tx
        .select({
          variantId: inventoryItemsTable.variantId,
          quantity: inventoryItemsTable.quantity,
        })
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.storeId, storeId),
            eq(inventoryItemsTable.warehouseId, warehouseId),
          ),
        );

      if (stock.length > 0) {
        await tx.insert(stockCountItemsTable).values(
          stock.map((s) => ({
            storeId,
            countId: countRow.id,
            variantId: s.variantId,
            expectedQuantity: s.quantity,
          })),
        );
      }
      return countRow.id;
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "stock_count.opened",
      entityType: "stock_count",
      entityId: countId,
      newValue: { warehouseId },
      ipAddress: clientIp(req),
    });

    res.status(201).json(await loadStockCountDetail(storeId, countId));
  },
);

// PATCH /inventory/stock-counts/:id/items — record counted quantities
router.patch(
  "/inventory/stock-counts/:id/items",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const parsed = UpdateStockCountItemsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const id = String(req.params["id"]);

    const [countRow] = await db
      .select({ status: stockCountsTable.status })
      .from(stockCountsTable)
      .where(and(eq(stockCountsTable.id, id), eq(stockCountsTable.storeId, storeId)))
      .limit(1);
    if (!countRow) {
      res.status(404).json({ error: "الجرد غير موجود" });
      return;
    }
    if (countRow.status !== "OPEN") {
      res.status(400).json({ error: "لا يمكن تعديل جرد غير مفتوح" });
      return;
    }
    if (parsed.data.items.some((i) => !Number.isInteger(i.countedQuantity) || i.countedQuantity < 0)) {
      res.status(400).json({ error: "الكمية المجرودة يجب أن تكون عدداً صحيحاً غير سالب" });
      return;
    }

    await db.transaction(async (tx) => {
      for (const entry of parsed.data.items) {
        await tx
          .update(stockCountItemsTable)
          .set({ countedQuantity: entry.countedQuantity })
          .where(
            and(
              eq(stockCountItemsTable.id, entry.itemId),
              eq(stockCountItemsTable.countId, id),
              eq(stockCountItemsTable.storeId, storeId),
            ),
          );
      }
    });

    res.json(await loadStockCountDetail(storeId, id));
  },
);

// POST /inventory/stock-counts/:id/complete — apply corrections (manager approval)
router.post(
  "/inventory/stock-counts/:id/complete",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    try {
      await db.transaction(async (tx) => {
        const [countRow] = await tx
          .select()
          .from(stockCountsTable)
          .where(and(eq(stockCountsTable.id, id), eq(stockCountsTable.storeId, storeId)))
          
          .limit(1);
        if (!countRow) throw new Error("NOT_FOUND");
        if (countRow.status !== "OPEN") throw new Error("BAD_STATE");

        const lines = await tx
          .select()
          .from(stockCountItemsTable)
          .where(eq(stockCountItemsTable.countId, id));

        for (const line of lines) {
          if (line.countedQuantity === null) continue;
          const delta = line.countedQuantity - line.expectedQuantity;
          if (delta === 0) continue;
          await postMovement(tx, {
            storeId,
            variantId: line.variantId,
            warehouseId: countRow.warehouseId,
            type: "STOCK_COUNT_CORRECTION",
            delta,
            referenceType: "STOCK_COUNT",
            referenceId: id,
            userId,
            notes: `تصحيح جرد ${countRow.countNumber}`,
            allowNegative: true,
          });
        }

        await tx
          .update(stockCountsTable)
          .set({ status: "COMPLETED", approvedBy: userId, completedAt: new Date() })
          .where(eq(stockCountsTable.id, id));
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        res.status(404).json({ error: "الجرد غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "BAD_STATE") {
        res.status(400).json({ error: "لا يمكن اعتماد جرد غير مفتوح" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "stock_count.completed",
      entityType: "stock_count",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json(await loadStockCountDetail(storeId, id));
  },
);

// POST /inventory/stock-counts/:id/cancel
router.post(
  "/inventory/stock-counts/:id/cancel",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    const [countRow] = await db
      .select({ status: stockCountsTable.status })
      .from(stockCountsTable)
      .where(and(eq(stockCountsTable.id, id), eq(stockCountsTable.storeId, storeId)))
      .limit(1);
    if (!countRow) {
      res.status(404).json({ error: "الجرد غير موجود" });
      return;
    }
    if (countRow.status !== "OPEN") {
      res.status(400).json({ error: "لا يمكن إلغاء جرد غير مفتوح" });
      return;
    }

    await db
      .update(stockCountsTable)
      .set({ status: "CANCELLED" })
      .where(and(eq(stockCountsTable.id, id), eq(stockCountsTable.storeId, storeId)));

    await writeAuditLog({
      storeId,
      userId,
      action: "stock_count.cancelled",
      entityType: "stock_count",
      entityId: id,
      ipAddress: clientIp(req),
    });

    res.json(await loadStockCountDetail(storeId, id));
  },
);

export default router;
