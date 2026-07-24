import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gt, like, or, sql } from "drizzle-orm";
import {
  db,
  suppliersTable,
  supplierTransactionsTable,
  treasuryAccountsTable,
  storeSettingsTable,
  purchaseInvoicesTable,
} from "@workspace/db";
import {
  ListSuppliersQueryParams,
  CreateSupplierBody,
  UpdateSupplierBody,
  CreateSupplierPaymentBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
import { postTreasuryTransaction } from "../lib/treasury";
import { postJournalEntry } from "../lib/accounting";
import { money, toNum } from "../lib/money";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

const supplierColumns = {
  id: suppliersTable.id,
  name: suppliersTable.name,
  phone: suppliersTable.phone,
  address: suppliersTable.address,
  taxNumber: suppliersTable.taxNumber,
  currentBalance: suppliersTable.currentBalance,
  notes: suppliersTable.notes,
  isActive: suppliersTable.isActive,
  createdAt: suppliersTable.createdAt,
};

function serializeSupplier<T extends { createdAt: Date }>(s: T) {
  return { ...s, createdAt: s.createdAt.toISOString() };
}

// GET /suppliers
router.get("/suppliers", requireAuth, requirePermission("suppliers.view"), async (req, res) => {
  const parsed = ListSuppliersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { page, pageSize, search, includeInactive, withDebtOnly } = parsed.data;
  const storeId = req.auth!.storeId;

  const conditions = [eq(suppliersTable.storeId, storeId)];
  if (!includeInactive) conditions.push(eq(suppliersTable.isActive, true));
  if (withDebtOnly) conditions.push(gt(suppliersTable.currentBalance, "0"));
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const cond = or(like(suppliersTable.name, term), like(suppliersTable.phone, term));
    if (cond) conditions.push(cond);
  }
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(suppliersTable)
    .where(where);

  const rows = await db
    .select(supplierColumns)
    .from(suppliersTable)
    .where(where)
    .orderBy(desc(suppliersTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({ items: rows.map(serializeSupplier), total: count, page, pageSize });
});

// POST /suppliers
router.post("/suppliers", requireAuth, requirePermission("suppliers.create"), async (req, res) => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { name, phone, address, taxNumber, notes } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const [created] = await db
    .insert(suppliersTable)
    .values({
      storeId,
      name: name.trim(),
      phone: phone.trim(),
      address: address ?? null,
      taxNumber: taxNumber ?? null,
      notes: notes ?? null,
    })
    .returning(supplierColumns);

  await writeAuditLog({
    storeId,
    userId,
    action: "supplier.created",
    entityType: "supplier",
    entityId: created.id,
    newValue: { name: created.name, phone: created.phone },
    ipAddress: clientIp(req),
  });

  res.status(201).json(serializeSupplier(created));
});

// GET /suppliers/:id
router.get("/suppliers/:id", requireAuth, requirePermission("suppliers.view"), async (req, res) => {
  const storeId = req.auth!.storeId;
  const [row] = await db
    .select(supplierColumns)
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, String(req.params["id"])), eq(suppliersTable.storeId, storeId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }
  res.json(serializeSupplier(row));
});

// PATCH /suppliers/:id
router.patch("/suppliers/:id", requireAuth, requirePermission("suppliers.edit"), async (req, res) => {
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { name, phone, address, taxNumber, notes } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const [existing] = await db
    .select({ id: suppliersTable.id })
    .from(suppliersTable)
    .where(and(eq(suppliersTable.id, String(req.params["id"])), eq(suppliersTable.storeId, storeId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "المورد غير موجود" });
    return;
  }

  const [updated] = await db
    .update(suppliersTable)
    .set({
      name: name.trim(),
      phone: phone.trim(),
      address: address ?? null,
      taxNumber: taxNumber ?? null,
      notes: notes ?? null,
    })
    .where(eq(suppliersTable.id, String(req.params["id"])))
    .returning(supplierColumns);

  await writeAuditLog({
    storeId,
    userId,
    action: "supplier.updated",
    entityType: "supplier",
    entityId: updated.id,
    newValue: { name: updated.name, phone: updated.phone },
    ipAddress: clientIp(req),
  });

  res.json(serializeSupplier(updated));
});

// POST /suppliers/:id/adjust
router.post(
  "/suppliers/:id/adjust",
  requireAuth,
  requirePermission("suppliers.edit"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const { newBalance, notes } = req.body;

    if (typeof newBalance !== "number") {
      res.status(400).json({ error: "الرصيد الجديد غير صحيح" });
      return;
    }

    const [existing] = await db
      .select({ id: suppliersTable.id, currentBalance: suppliersTable.currentBalance })
      .from(suppliersTable)
      .where(and(eq(suppliersTable.id, String(req.params["id"])), eq(suppliersTable.storeId, storeId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "المورد غير موجود" });
      return;
    }

    const diff = newBalance - toNum(existing.currentBalance);
    if (diff === 0) {
      res.json({ success: true });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.insert(supplierTransactionsTable).values({
        storeId,
        supplierId: existing.id,
        type: "ADJUSTMENT",
        debit: diff < 0 ? money(Math.abs(diff)) : money(0),
        credit: diff > 0 ? money(Math.abs(diff)) : money(0),
        balanceAfter: money(newBalance),
        description: notes || "تسوية رصيد يدوية",
        createdBy: userId,
      });

      await tx
        .update(suppliersTable)
        .set({ currentBalance: money(newBalance) })
        .where(eq(suppliersTable.id, existing.id));
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "supplier.adjusted",
      entityType: "supplier",
      entityId: existing.id,
      newValue: { newBalance },
      ipAddress: clientIp(req),
    });

    res.json({ success: true });
  }
);

// DELETE /suppliers/:id — soft deactivate
router.delete(
  "/suppliers/:id",
  requireAuth,
  requirePermission("suppliers.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    const [existing] = await db
      .select({ id: suppliersTable.id, currentBalance: suppliersTable.currentBalance })
      .from(suppliersTable)
      .where(and(eq(suppliersTable.id, String(req.params["id"])), eq(suppliersTable.storeId, storeId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "المورد غير موجود" });
      return;
    }
    if (toNum(existing.currentBalance) !== 0) {
      res.status(400).json({ error: "لا يمكن حذف مورد عليه رصيد" });
      return;
    }

    await db
      .update(suppliersTable)
      .set({ isActive: false })
      .where(eq(suppliersTable.id, String(req.params["id"])));

    await writeAuditLog({
      storeId,
      userId,
      action: "supplier.deactivated",
      entityType: "supplier",
      entityId: String(req.params["id"]),
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

// GET /suppliers/:id/statement
router.get(
  "/suppliers/:id/statement",
  requireAuth,
  requirePermission("suppliers.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const [supplier] = await db
      .select(supplierColumns)
      .from(suppliersTable)
      .where(and(eq(suppliersTable.id, String(req.params["id"])), eq(suppliersTable.storeId, storeId)))
      .limit(1);
    if (!supplier) {
      res.status(404).json({ error: "المورد غير موجود" });
      return;
    }

    const rows = await db
      .select({
        id: supplierTransactionsTable.id,
        supplierId: supplierTransactionsTable.supplierId,
        type: supplierTransactionsTable.type,
        debit: supplierTransactionsTable.debit,
        credit: supplierTransactionsTable.credit,
        balanceAfter: supplierTransactionsTable.balanceAfter,
        referenceType: supplierTransactionsTable.referenceType,
        referenceId: supplierTransactionsTable.referenceId,
        description: supplierTransactionsTable.description,
        createdAt: supplierTransactionsTable.createdAt,
        invoiceNumber: purchaseInvoicesTable.invoiceNumber,
      })
      .from(supplierTransactionsTable)
      .leftJoin(
        purchaseInvoicesTable,
        and(
          eq(supplierTransactionsTable.referenceType, "PURCHASE"),
          eq(supplierTransactionsTable.referenceId, purchaseInvoicesTable.id)
        )
      )
      .where(eq(supplierTransactionsTable.supplierId, String(req.params["id"])))
      .orderBy(desc(supplierTransactionsTable.createdAt))
      .limit(1000);

    res.json({
      supplier: serializeSupplier(supplier),
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: rows.length,
      page: 1,
      pageSize: rows.length,
    });
  },
);

// POST /suppliers/:id/payments — pay supplier (treasury OUT + AP debit)
router.post(
  "/suppliers/:id/payments",
  requireAuth,
  requirePermission("suppliers.edit"),
  async (req, res) => {
    const parsed = CreateSupplierPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { amount, treasuryAccountId, notes } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    if (amount <= 0) {
      res.status(400).json({ error: "المبلغ يجب أن يكون أكبر من صفر" });
      return;
    }

    await ensureStoreFinancials(db, storeId);

    const [settings] = await db
      .select({ allowNegativeTreasury: storeSettingsTable.allowNegativeTreasury })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.storeId, storeId))
      .limit(1);
    const allowNegative = settings?.allowNegativeTreasury ?? false;

    let resultId: string;
    try {
      resultId = await db.transaction(async (tx) => {
        const [supplier] = await tx
          .select({ id: suppliersTable.id, currentBalance: suppliersTable.currentBalance })
          .from(suppliersTable)
          .where(and(eq(suppliersTable.id, String(req.params["id"])), eq(suppliersTable.storeId, storeId)))
          
          .limit(1);
        if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");

        const [drawer] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(
            and(
              eq(treasuryAccountsTable.id, treasuryAccountId),
              eq(treasuryAccountsTable.storeId, storeId),
            ),
          )
          .limit(1);
        if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const newBalance = toNum(supplier.currentBalance) - amount;

        const [stx] = await tx
          .insert(supplierTransactionsTable)
          .values({
            storeId,
            supplierId: supplier.id,
            type: "PAYMENT",
            debit: money(amount),
            balanceAfter: money(newBalance),
            referenceType: "SUPPLIER_PAYMENT",
            description: notes ?? "سداد دفعة",
            createdBy: userId,
          })
          .returning({ id: supplierTransactionsTable.id });

        await tx
          .update(suppliersTable)
          .set({ currentBalance: money(newBalance) })
          .where(eq(suppliersTable.id, supplier.id));

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "OUT",
          amount,
          referenceType: "SUPPLIER_PAYMENT",
          referenceId: stx.id,
          description: notes ?? "سداد لمورد",
          userId,
          allowNegative,
        });

        await postJournalEntry(tx, {
          storeId,
          userId,
          description: notes ?? "سداد دفعة لمورد",
          referenceType: "SUPPLIER_PAYMENT",
          referenceId: stx.id,
          lines: [
            { code: "2000", debit: amount },
            { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], credit: amount },
          ],
        });

        return stx.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "SUPPLIER_NOT_FOUND") {
        res.status(404).json({ error: "المورد غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة غير كافٍ" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "supplier.payment",
      entityType: "supplier",
      entityId: String(req.params["id"]),
      newValue: { amount, treasuryAccountId },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select({
        id: supplierTransactionsTable.id,
        supplierId: supplierTransactionsTable.supplierId,
        type: supplierTransactionsTable.type,
        debit: supplierTransactionsTable.debit,
        credit: supplierTransactionsTable.credit,
        balanceAfter: supplierTransactionsTable.balanceAfter,
        referenceType: supplierTransactionsTable.referenceType,
        referenceId: supplierTransactionsTable.referenceId,
        description: supplierTransactionsTable.description,
        createdAt: supplierTransactionsTable.createdAt,
      })
      .from(supplierTransactionsTable)
      .where(eq(supplierTransactionsTable.id, resultId))
      .limit(1);

    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  },
);

export default router;
