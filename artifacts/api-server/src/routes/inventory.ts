import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, like, inArray, or, sql } from "drizzle-orm";
import {
  db,
  colorsTable,
  inventoryItemsTable,
  inventoryMovementsTable,
  productsTable,
  productVariantsTable,
  sizesTable,
  usersTable,
  warehousesTable,
} from "@workspace/db";
import {
  CreateAdjustmentBody,
  ListMovementsQueryParams,
  ListStockQueryParams,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

// Allowed values of the movement_type pg enum; used to validate the optional
// `type` filter on the movements list so a bad value returns 400, not a DB 500.
const MOVEMENT_TYPES = [
  "SALE",
  "SALE_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "STOCK_COUNT_CORRECTION",
] as const;

type MovementType = (typeof MOVEMENT_TYPES)[number];

function isMovementType(value: string): value is MovementType {
  return (MOVEMENT_TYPES as readonly string[]).includes(value);
}

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// GET /inventory/stock — current on-hand per variant per warehouse
router.get(
  "/inventory/stock",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const parsed = ListStockQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, search, warehouseId, lowStockOnly } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(inventoryItemsTable.storeId, storeId)];
    if (warehouseId) conditions.push(eq(inventoryItemsTable.warehouseId, warehouseId));
    if (lowStockOnly === true) {
      conditions.push(sql`${inventoryItemsTable.quantity} <= ${productsTable.reorderPoint}`);
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const cond = or(
        like(productsTable.name, term),
        like(productVariantsTable.sku, term),
        like(productVariantsTable.barcode, term),
      );
      if (cond) conditions.push(cond);
    }
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryItemsTable)
      .innerJoin(productVariantsTable, eq(inventoryItemsTable.variantId, productVariantsTable.id))
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(where);

    const rows = await db
      .select({
        variantId: productVariantsTable.id,
        productId: productsTable.id,
        productName: productsTable.name,
        sku: productVariantsTable.sku,
        barcode: productVariantsTable.barcode,
        colorName: colorsTable.name,
        sizeName: sizesTable.name,
        warehouseId: warehousesTable.id,
        warehouseName: warehousesTable.name,
        quantity: inventoryItemsTable.quantity,
        reorderPoint: productsTable.reorderPoint,
      })
      .from(inventoryItemsTable)
      .innerJoin(productVariantsTable, eq(inventoryItemsTable.variantId, productVariantsTable.id))
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .innerJoin(warehousesTable, eq(inventoryItemsTable.warehouseId, warehousesTable.id))
      .innerJoin(colorsTable, eq(productVariantsTable.colorId, colorsTable.id))
      .innerJoin(sizesTable, eq(productVariantsTable.sizeId, sizesTable.id))
      .where(where)
      .orderBy(desc(inventoryItemsTable.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items: rows, total: count, page, pageSize });
  },
);

// GET /inventory/movements — immutable movement history
router.get(
  "/inventory/movements",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const parsed = ListMovementsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, variantId, warehouseId, type } = parsed.data;
    const storeId = req.auth!.storeId;

    let movementType: MovementType | undefined;
    if (type) {
      if (!isMovementType(type)) {
        res.status(400).json({ error: "نوع حركة غير صالح" });
        return;
      }
      movementType = type;
    }

    const conditions = [eq(inventoryMovementsTable.storeId, storeId)];
    if (variantId) conditions.push(eq(inventoryMovementsTable.variantId, variantId));
    if (warehouseId) conditions.push(eq(inventoryMovementsTable.warehouseId, warehouseId));
    if (movementType) {
      conditions.push(eq(inventoryMovementsTable.type, movementType));
    }
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(inventoryMovementsTable)
      .where(where);

    const rows = await db
      .select({
        id: inventoryMovementsTable.id,
        variantId: inventoryMovementsTable.variantId,
        sku: productVariantsTable.sku,
        productName: productsTable.name,
        warehouseId: inventoryMovementsTable.warehouseId,
        warehouseName: warehousesTable.name,
        type: inventoryMovementsTable.type,
        quantityChange: inventoryMovementsTable.quantityChange,
        balanceAfter: inventoryMovementsTable.balanceAfter,
        referenceType: inventoryMovementsTable.referenceType,
        referenceId: inventoryMovementsTable.referenceId,
        notes: inventoryMovementsTable.notes,
        userName: usersTable.fullName,
        createdAt: inventoryMovementsTable.createdAt,
      })
      .from(inventoryMovementsTable)
      .leftJoin(productVariantsTable, eq(inventoryMovementsTable.variantId, productVariantsTable.id))
      .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .leftJoin(warehousesTable, eq(inventoryMovementsTable.warehouseId, warehousesTable.id))
      .leftJoin(usersTable, eq(inventoryMovementsTable.createdBy, usersTable.id))
      .where(where)
      .orderBy(desc(inventoryMovementsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: count,
      page,
      pageSize,
    });
  },
);

// POST /inventory/adjustments — manual stock change; creates immutable movements
// and syncs cached quantities atomically.
router.post(
  "/inventory/adjustments",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const parsed = CreateAdjustmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { warehouseId, notes, lines } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    // Quantities map to integer DB columns; reject non-integers with a clean 400
    // (codegen emits number().min(1), not int()).
    if (lines.some((line) => !Number.isInteger(line.quantity))) {
      res.status(400).json({ error: "الكمية يجب أن تكون عدداً صحيحاً" });
      return;
    }

    const [warehouse] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.storeId, storeId)))
      .limit(1);
    if (!warehouse) {
      res.status(404).json({ error: "المخزن غير موجود" });
      return;
    }

    // Validate all variants belong to the store up-front.
    for (const line of lines) {
      const [variant] = await db
        .select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(
          and(eq(productVariantsTable.id, line.variantId), eq(productVariantsTable.storeId, storeId)),
        )
        .limit(1);
      if (!variant) {
        res.status(404).json({ error: "أحد المتغيرات غير موجود" });
        return;
      }
    }

    let createdIds: string[];
    try {
      createdIds = await db.transaction(async (tx) => {
        const ids: string[] = [];
        for (const line of lines) {
          const delta = line.type === "ADJUSTMENT_IN" ? line.quantity : -line.quantity;

          // Atomic upsert of the cached stock row. ON CONFLICT avoids a race
          // where two concurrent first-time adjustments for the same
          // (variant, warehouse) both insert and one aborts on the unique index.
          // The negative-stock guard runs after, inside the same transaction, so
          // an over-deduction rolls everything back.
          const [item] = await tx
            .insert(inventoryItemsTable)
            .values({
              storeId,
              variantId: line.variantId,
              warehouseId,
              quantity: delta,
            })
            .onConflictDoUpdate({
              target: [inventoryItemsTable.variantId, inventoryItemsTable.warehouseId],
              set: { quantity: sql`${inventoryItemsTable.quantity} + ${delta}` },
            })
            .returning({ quantity: inventoryItemsTable.quantity });

          const newQty = item.quantity;
          if (newQty < 0) {
            throw new Error("INSUFFICIENT_STOCK");
          }

          const [movement] = await tx
            .insert(inventoryMovementsTable)
            .values({
              storeId,
              variantId: line.variantId,
              warehouseId,
              type: line.type,
              quantityChange: delta,
              balanceAfter: newQty,
              referenceType: "ADJUSTMENT",
              notes: line.notes ?? notes ?? null,
              createdBy: userId,
            })
            .returning({ id: inventoryMovementsTable.id });
          ids.push(movement.id);
        }
        return ids;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
        res.status(400).json({ error: "الكمية غير كافية في المخزن" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "inventory.adjusted",
      entityType: "warehouse",
      entityId: warehouseId,
      newValue: { lines: lines.length, movementIds: createdIds },
      ipAddress: clientIp(req),
    });

    const rows = await db
      .select({
        id: inventoryMovementsTable.id,
        variantId: inventoryMovementsTable.variantId,
        sku: productVariantsTable.sku,
        productName: productsTable.name,
        warehouseId: inventoryMovementsTable.warehouseId,
        warehouseName: warehousesTable.name,
        type: inventoryMovementsTable.type,
        quantityChange: inventoryMovementsTable.quantityChange,
        balanceAfter: inventoryMovementsTable.balanceAfter,
        referenceType: inventoryMovementsTable.referenceType,
        referenceId: inventoryMovementsTable.referenceId,
        notes: inventoryMovementsTable.notes,
        userName: usersTable.fullName,
        createdAt: inventoryMovementsTable.createdAt,
      })
      .from(inventoryMovementsTable)
      .leftJoin(productVariantsTable, eq(inventoryMovementsTable.variantId, productVariantsTable.id))
      .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .leftJoin(warehousesTable, eq(inventoryMovementsTable.warehouseId, warehousesTable.id))
      .leftJoin(usersTable, eq(inventoryMovementsTable.createdBy, usersTable.id))
      .where(inArray(inventoryMovementsTable.id, createdIds))
      .orderBy(desc(inventoryMovementsTable.createdAt));

    res.status(201).json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  },
);

export default router;
