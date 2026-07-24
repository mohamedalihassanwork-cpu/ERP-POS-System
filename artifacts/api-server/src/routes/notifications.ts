import { Router, type IRouter } from "express";
import { and, count, desc, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
import {
  customersTable,
  db,
  inventoryItemsTable,
  notificationsTable,
  productsTable,
  productVariantsTable,
  suppliersTable,
  treasuryAccountsTable,
  warehousesTable,
} from "@workspace/db";
import { ListNotificationsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

type NewNotification = {
  type: "LOW_STOCK" | "NEGATIVE_TREASURY" | "CUSTOMER_DEBT" | "SUPPLIER_DEBT";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string | null;
  referenceType: string | null;
  referenceId: string | null;
  dedupeKey: string;
};

async function unreadCount(storeId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.storeId, storeId),
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.isRead, false),
      ),
    );
  return row?.c ?? 0;
}

// Recomputes alert notifications for the current user. Each candidate alert has a
// stable dedupeKey; we skip any that already has an unread notification so
// repeated refreshes do not spam duplicates.
async function buildAlerts(storeId: string): Promise<NewNotification[]> {
  const alerts: NewNotification[] = [];

  // LOW_STOCK — cached stock at/under the product reorder point.
  const lowStock = await db
    .select({
      variantId: inventoryItemsTable.variantId,
      warehouseId: inventoryItemsTable.warehouseId,
      productName: productsTable.name,
      sku: productVariantsTable.sku,
      warehouseName: warehousesTable.name,
      quantity: inventoryItemsTable.quantity,
      reorderPoint: productsTable.reorderPoint,
    })
    .from(inventoryItemsTable)
    .innerJoin(productVariantsTable, eq(inventoryItemsTable.variantId, productVariantsTable.id))
    .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .innerJoin(warehousesTable, eq(inventoryItemsTable.warehouseId, warehousesTable.id))
    .where(
      and(
        eq(inventoryItemsTable.storeId, storeId),
        gt(productsTable.reorderPoint, 0),
        sql`${inventoryItemsTable.quantity} <= ${productsTable.reorderPoint}`,
      ),
    )
    .limit(100);
  for (const r of lowStock) {
    alerts.push({
      type: "LOW_STOCK",
      severity: r.quantity <= 0 ? "CRITICAL" : "WARNING",
      title: `مخزون منخفض: ${r.productName} (${r.sku})`,
      body: `الكمية ${r.quantity} في ${r.warehouseName} عند حد إعادة الطلب ${r.reorderPoint}`,
      referenceType: "variant",
      referenceId: r.variantId,
      dedupeKey: `LOW_STOCK:${r.variantId}:${r.warehouseId}`,
    });
  }

  // NEGATIVE_TREASURY — any drawer in the red.
  const negTreasury = await db
    .select({ id: treasuryAccountsTable.id, name: treasuryAccountsTable.name, balance: treasuryAccountsTable.balance })
    .from(treasuryAccountsTable)
    .where(and(eq(treasuryAccountsTable.storeId, storeId), lt(treasuryAccountsTable.balance, "0")));
  for (const a of negTreasury) {
    alerts.push({
      type: "NEGATIVE_TREASURY",
      severity: "CRITICAL",
      title: `رصيد سالب في الخزينة: ${a.name}`,
      body: `الرصيد الحالي ${a.balance}`,
      referenceType: "treasury_account",
      referenceId: a.id,
      dedupeKey: `NEGATIVE_TREASURY:${a.id}`,
    });
  }

  // CUSTOMER_DEBT — customers over their credit limit.
  const overLimit = await db
    .select({
      id: customersTable.id,
      name: customersTable.name,
      balance: customersTable.currentBalance,
      limit: customersTable.creditLimit,
    })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.storeId, storeId),
        gt(customersTable.creditLimit, "0"),
        sql`${customersTable.currentBalance} > ${customersTable.creditLimit}`,
      ),
    )
    .limit(100);
  for (const c of overLimit) {
    alerts.push({
      type: "CUSTOMER_DEBT",
      severity: "WARNING",
      title: `تجاوز حد ائتمان العميل: ${c.name}`,
      body: `المديونية ${c.balance} تتجاوز الحد ${c.limit}`,
      referenceType: "customer",
      referenceId: c.id,
      dedupeKey: `CUSTOMER_DEBT:${c.id}`,
    });
  }

  // SUPPLIER_DEBT — outstanding payables.
  const payables = await db
    .select({ id: suppliersTable.id, name: suppliersTable.name, balance: suppliersTable.currentBalance })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.storeId, storeId), gt(suppliersTable.currentBalance, "0")))
    .limit(100);
  for (const s of payables) {
    alerts.push({
      type: "SUPPLIER_DEBT",
      severity: "INFO",
      title: `مستحقات لمورد: ${s.name}`,
      body: `الرصيد المستحق ${s.balance}`,
      referenceType: "supplier",
      referenceId: s.id,
      dedupeKey: `SUPPLIER_DEBT:${s.id}`,
    });
  }

  return alerts;
}

// POST /notifications/refresh — recompute alerts for the current user
router.post("/notifications/refresh", requireAuth, async (req, res) => {
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const alerts = await buildAlerts(storeId);

  // Skip alerts that already have an unread notification with the same key.
  const existing = await db
    .select({ dedupeKey: notificationsTable.dedupeKey })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.storeId, storeId),
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.isRead, false),
        isNotNull(notificationsTable.dedupeKey),
      ),
    );
  const seen = new Set(existing.map((e) => e.dedupeKey));

  const toInsert = alerts
    .filter((a) => !seen.has(a.dedupeKey))
    .map((a) => ({ ...a, storeId, userId }));

  if (toInsert.length > 0) {
    // The partial unique index (userId, dedupeKey) WHERE is_read = false makes
    // concurrent refresh calls safe: duplicate active alerts are dropped.
    await db.insert(notificationsTable).values(toInsert).onConflictDoNothing();
  }

  res.json({ unread: await unreadCount(storeId, userId) });
});

// GET /notifications
router.get("/notifications", requireAuth, async (req, res) => {
  const parsed = ListNotificationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { unreadOnly, page, pageSize } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const conditions = [
    eq(notificationsTable.storeId, storeId),
    eq(notificationsTable.userId, userId),
  ];
  if (unreadOnly === true) conditions.push(eq(notificationsTable.isRead, false));
  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(notificationsTable)
    .where(where);

  const rows = await db
    .select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      severity: notificationsTable.severity,
      title: notificationsTable.title,
      body: notificationsTable.body,
      referenceType: notificationsTable.referenceType,
      referenceId: notificationsTable.referenceId,
      isRead: notificationsTable.isRead,
      createdAt: notificationsTable.createdAt,
      readAt: notificationsTable.readAt,
    })
    .from(notificationsTable)
    .where(where)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
    })),
    total,
    unread: await unreadCount(storeId, userId),
    page,
    pageSize,
  });
});

// GET /notifications/unread-count
router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  res.json({ unread: await unreadCount(req.auth!.storeId, req.auth!.userId) });
});

// POST /notifications/read-all
router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;
  await db
    .update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.storeId, storeId),
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.isRead, false),
      ),
    );
  res.json({ unread: 0 });
});

// POST /notifications/:id/read
router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;
  const [row] = await db
    .update(notificationsTable)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notificationsTable.id, String(req.params["id"])),
        eq(notificationsTable.storeId, storeId),
        eq(notificationsTable.userId, userId),
      ),
    )
    .returning({
      id: notificationsTable.id,
      type: notificationsTable.type,
      severity: notificationsTable.severity,
      title: notificationsTable.title,
      body: notificationsTable.body,
      referenceType: notificationsTable.referenceType,
      referenceId: notificationsTable.referenceId,
      isRead: notificationsTable.isRead,
      createdAt: notificationsTable.createdAt,
      readAt: notificationsTable.readAt,
    });
  if (!row) {
    res.status(404).json({ error: "الإشعار غير موجود" });
    return;
  }
  res.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  });
});

export default router;
