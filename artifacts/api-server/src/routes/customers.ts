import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gt, like, or, sql } from "drizzle-orm";
import { db, customersTable, customerTransactionsTable, treasuryAccountsTable } from "@workspace/db";
import {
  ListCustomersQueryParams,
  CreateCustomerBody,
  UpdateCustomerBody,
  CreateCustomerPaymentBody,
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

const customerColumns = {
  id: customersTable.id,
  name: customersTable.name,
  phone: customersTable.phone,
  address: customersTable.address,
  creditLimit: customersTable.creditLimit,
  currentBalance: customersTable.currentBalance,
  notes: customersTable.notes,
  isActive: customersTable.isActive,
  createdAt: customersTable.createdAt,
};

function serializeCustomer<T extends { createdAt: Date }>(c: T) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

// GET /customers — paginated, searchable
router.get("/customers", requireAuth, requirePermission("customers.view"), async (req, res) => {
  const parsed = ListCustomersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { page, pageSize, search, includeInactive, withDebtOnly } = parsed.data;
  const storeId = req.auth!.storeId;

  const conditions = [eq(customersTable.storeId, storeId)];
  if (!includeInactive) conditions.push(eq(customersTable.isActive, true));
  if (withDebtOnly) conditions.push(gt(customersTable.currentBalance, "0"));
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const cond = or(like(customersTable.name, term), like(customersTable.phone, term));
    if (cond) conditions.push(cond);
  }
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(customersTable)
    .where(where);

  const rows = await db
    .select(customerColumns)
    .from(customersTable)
    .where(where)
    .orderBy(desc(customersTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({ items: rows.map(serializeCustomer), total: count, page, pageSize });
});

// POST /customers
router.post("/customers", requireAuth, requirePermission("customers.create"), async (req, res) => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { name, phone, address, creditLimit, notes } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const [created] = await db
    .insert(customersTable)
    .values({
      storeId,
      name: name.trim(),
      phone: phone.trim(),
      address: address ?? null,
      creditLimit: money(creditLimit ?? 0),
      notes: notes ?? null,
    })
    .returning(customerColumns);

  await writeAuditLog({
    storeId,
    userId,
    action: "customer.created",
    entityType: "customer",
    entityId: created.id,
    newValue: { name: created.name, phone: created.phone },
    ipAddress: clientIp(req),
  });

  res.status(201).json(serializeCustomer(created));
});

// GET /customers/:id
router.get("/customers/:id", requireAuth, requirePermission("customers.view"), async (req, res) => {
  const storeId = req.auth!.storeId;
  const [row] = await db
    .select(customerColumns)
    .from(customersTable)
    .where(and(eq(customersTable.id, String(req.params["id"])), eq(customersTable.storeId, storeId)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "العميل غير موجود" });
    return;
  }
  res.json(serializeCustomer(row));
});

// PATCH /customers/:id
router.patch("/customers/:id", requireAuth, requirePermission("customers.edit"), async (req, res) => {
  const parsed = UpdateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { name, phone, address, creditLimit, notes } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const [existing] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(and(eq(customersTable.id, String(req.params["id"])), eq(customersTable.storeId, storeId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "العميل غير موجود" });
    return;
  }

  const [updated] = await db
    .update(customersTable)
    .set({
      name: name.trim(),
      phone: phone.trim(),
      address: address ?? null,
      creditLimit: money(creditLimit ?? 0),
      notes: notes ?? null,
    })
    .where(eq(customersTable.id, String(req.params["id"])))
    .returning(customerColumns);

  await writeAuditLog({
    storeId,
    userId,
    action: "customer.updated",
    entityType: "customer",
    entityId: updated.id,
    newValue: { name: updated.name, phone: updated.phone },
    ipAddress: clientIp(req),
  });

  res.json(serializeCustomer(updated));
});

// DELETE /customers/:id — soft deactivate
router.delete(
  "/customers/:id",
  requireAuth,
  requirePermission("customers.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    const [existing] = await db
      .select({ id: customersTable.id, currentBalance: customersTable.currentBalance })
      .from(customersTable)
      .where(and(eq(customersTable.id, String(req.params["id"])), eq(customersTable.storeId, storeId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "العميل غير موجود" });
      return;
    }
    if (toNum(existing.currentBalance) !== 0) {
      res.status(400).json({ error: "لا يمكن حذف عميل عليه رصيد" });
      return;
    }

    await db
      .update(customersTable)
      .set({ isActive: false })
      .where(eq(customersTable.id, String(req.params["id"])));

    await writeAuditLog({
      storeId,
      userId,
      action: "customer.deactivated",
      entityType: "customer",
      entityId: String(req.params["id"]),
      ipAddress: clientIp(req),
    });

    res.status(204).end();
  },
);

// GET /customers/:id/statement — full ledger
router.get(
  "/customers/:id/statement",
  requireAuth,
  requirePermission("customers.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const [customer] = await db
      .select(customerColumns)
      .from(customersTable)
      .where(and(eq(customersTable.id, String(req.params["id"])), eq(customersTable.storeId, storeId)))
      .limit(1);
    if (!customer) {
      res.status(404).json({ error: "العميل غير موجود" });
      return;
    }

    const rows = await db
      .select({
        id: customerTransactionsTable.id,
        customerId: customerTransactionsTable.customerId,
        type: customerTransactionsTable.type,
        debit: customerTransactionsTable.debit,
        credit: customerTransactionsTable.credit,
        balanceAfter: customerTransactionsTable.balanceAfter,
        referenceType: customerTransactionsTable.referenceType,
        referenceId: customerTransactionsTable.referenceId,
        description: customerTransactionsTable.description,
        createdAt: customerTransactionsTable.createdAt,
      })
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.customerId, String(req.params["id"])))
      .orderBy(desc(customerTransactionsTable.createdAt))
      .limit(1000);

    res.json({
      customer: serializeCustomer(customer),
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: rows.length,
      page: 1,
      pageSize: rows.length,
    });
  },
);

// POST /customers/:id/payments — collect against debt (treasury IN + AR credit)
router.post(
  "/customers/:id/payments",
  requireAuth,
  requirePermission("customers.edit"),
  async (req, res) => {
    const parsed = CreateCustomerPaymentBody.safeParse(req.body);
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

    let resultId: string;
    try {
      resultId = await db.transaction(async (tx) => {
        const [customer] = await tx
          .select({ id: customersTable.id, currentBalance: customersTable.currentBalance })
          .from(customersTable)
          .where(and(eq(customersTable.id, String(req.params["id"])), eq(customersTable.storeId, storeId)))
          
          .limit(1);
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");

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

        const newBalance = toNum(customer.currentBalance) - amount;

        const [ctx] = await tx
          .insert(customerTransactionsTable)
          .values({
            storeId,
            customerId: customer.id,
            type: "PAYMENT",
            credit: money(amount),
            balanceAfter: money(newBalance),
            referenceType: "CUSTOMER_PAYMENT",
            description: notes ?? "تحصيل دفعة",
            createdBy: userId,
          })
          .returning({ id: customerTransactionsTable.id });

        await tx
          .update(customersTable)
          .set({ currentBalance: money(newBalance) })
          .where(eq(customersTable.id, customer.id));

        const treasuryRes = await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawer.id,
          direction: "IN",
          amount,
          referenceType: "CUSTOMER_PAYMENT",
          referenceId: ctx.id,
          description: notes ?? "تحصيل من عميل",
          userId,
        });

        await postJournalEntry(tx, {
          storeId,
          userId,
          description: notes ?? "تحصيل دفعة من عميل",
          referenceType: "CUSTOMER_PAYMENT",
          referenceId: ctx.id,
          lines: [
            { code: TREASURY_TYPE_TO_ACCOUNT_CODE[drawer.type], debit: amount },
            { code: "1100", credit: amount },
          ],
        });

        void treasuryRes;
        return ctx.id;
      });
    } catch (err) {
      if (err instanceof Error && err.message === "CUSTOMER_NOT_FOUND") {
        res.status(404).json({ error: "العميل غير موجود" });
        return;
      }
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "حساب الخزينة غير موجود" });
        return;
      }
      throw err;
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "customer.payment",
      entityType: "customer",
      entityId: String(req.params["id"]),
      newValue: { amount, treasuryAccountId },
      ipAddress: clientIp(req),
    });

    const [row] = await db
      .select({
        id: customerTransactionsTable.id,
        customerId: customerTransactionsTable.customerId,
        type: customerTransactionsTable.type,
        debit: customerTransactionsTable.debit,
        credit: customerTransactionsTable.credit,
        balanceAfter: customerTransactionsTable.balanceAfter,
        referenceType: customerTransactionsTable.referenceType,
        referenceId: customerTransactionsTable.referenceId,
        description: customerTransactionsTable.description,
        createdAt: customerTransactionsTable.createdAt,
      })
      .from(customerTransactionsTable)
      .where(eq(customerTransactionsTable.id, resultId))
      .limit(1);

    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  },
);

export default router;
