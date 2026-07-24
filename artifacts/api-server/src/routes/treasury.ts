import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  treasuryAccountsTable,
  treasuryTransactionsTable,
  treasurySessionsTable,
  treasuryTransfersTable,
  treasuryAdjustmentsTable,
  usersTable,
} from "@workspace/db";
import {
  ListTreasuryTransactionsQueryParams,
  ListTreasurySessionsQueryParams,
  OpenTreasurySessionBody,
  GetCurrentTreasurySessionQueryParams,
  CloseTreasurySessionBody,
  CreateTreasuryTransferBody,
  CreateTreasuryAdjustmentBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
import { postTreasuryTransaction } from "../lib/treasury";
import { postJournalEntry } from "../lib/accounting";
import { money, toNum } from "../lib/money";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

const DIRECTIONS = ["IN", "OUT"] as const;
const REF_TYPES = [
  "SALE",
  "SALES_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
  "EXPENSE",
  "SALARY",
  "WITHDRAWAL",
  "DEPOSIT",
  "CUSTOMER_PAYMENT",
  "SUPPLIER_PAYMENT",
  "OPENING",
  "TRANSFER",
  "ADJUSTMENT",
] as const;
const SESSION_STATUSES = ["OPEN", "CLOSED"] as const;

type Direction = (typeof DIRECTIONS)[number];
type RefType = (typeof REF_TYPES)[number];
type SessionStatus = (typeof SESSION_STATUSES)[number];

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// GET /treasury/accounts — drawers with cached balances (auto-seeds defaults)
router.get(
  "/treasury/accounts",
  requireAuth,
  async (req, res) => {
    const storeId = req.auth!.storeId;
    await ensureStoreFinancials(db, storeId);
    const rows = await db
      .select({
        id: treasuryAccountsTable.id,
        type: treasuryAccountsTable.type,
        name: treasuryAccountsTable.name,
        balance: treasuryAccountsTable.balance,
        isActive: treasuryAccountsTable.isActive,
      })
      .from(treasuryAccountsTable)
      .where(eq(treasuryAccountsTable.storeId, storeId))
      .orderBy(treasuryAccountsTable.type);

    const perms = req.auth!.permissions;
    const canSeeMainSafe = perms.includes("*") || perms.includes("treasury.manage") || perms.includes("settings.manage");
    const filteredRows = rows.filter(r => canSeeMainSafe || r.type !== "MAIN_SAFE");

    res.json(filteredRows);
  },
);

// GET /treasury/transactions — immutable money ledger
router.get(
  "/treasury/transactions",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const parsed = ListTreasuryTransactionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, treasuryAccountId, direction, referenceType, dateFrom, dateTo } =
      parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(treasuryTransactionsTable.storeId, storeId)];
    if (treasuryAccountId) {
      conditions.push(eq(treasuryTransactionsTable.treasuryAccountId, treasuryAccountId));
    }
    if (direction) {
      if (!(DIRECTIONS as readonly string[]).includes(direction)) {
        res.status(400).json({ error: "اتجاه غير صالح" });
        return;
      }
      conditions.push(eq(treasuryTransactionsTable.direction, direction as Direction));
    }
    if (referenceType) {
      if (!(REF_TYPES as readonly string[]).includes(referenceType)) {
        res.status(400).json({ error: "نوع مرجع غير صالح" });
        return;
      }
      conditions.push(eq(treasuryTransactionsTable.referenceType, referenceType as RefType));
    }
    if (dateFrom) conditions.push(gte(treasuryTransactionsTable.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(treasuryTransactionsTable.createdAt, new Date(dateTo)));
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(treasuryTransactionsTable)
      .where(where);

    const rows = await db
      .select({
        id: treasuryTransactionsTable.id,
        treasuryAccountId: treasuryTransactionsTable.treasuryAccountId,
        accountName: treasuryAccountsTable.name,
        sessionId: treasuryTransactionsTable.sessionId,
        direction: treasuryTransactionsTable.direction,
        amount: treasuryTransactionsTable.amount,
        balanceAfter: treasuryTransactionsTable.balanceAfter,
        referenceType: treasuryTransactionsTable.referenceType,
        referenceId: treasuryTransactionsTable.referenceId,
        description: treasuryTransactionsTable.description,
        userName: usersTable.fullName,
        createdAt: treasuryTransactionsTable.createdAt,
      })
      .from(treasuryTransactionsTable)
      .leftJoin(
        treasuryAccountsTable,
        eq(treasuryTransactionsTable.treasuryAccountId, treasuryAccountsTable.id),
      )
      .leftJoin(usersTable, eq(treasuryTransactionsTable.createdBy, usersTable.id))
      .where(where)
      .orderBy(desc(treasuryTransactionsTable.createdAt))
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

// GET /treasury/sessions — shift history
router.get(
  "/treasury/sessions",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const parsed = ListTreasurySessionsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, treasuryAccountId, status } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(treasurySessionsTable.storeId, storeId)];
    if (treasuryAccountId) {
      conditions.push(eq(treasurySessionsTable.treasuryAccountId, treasuryAccountId));
    }
    if (status) {
      if (!(SESSION_STATUSES as readonly string[]).includes(status)) {
        res.status(400).json({ error: "حالة غير صالحة" });
        return;
      }
      conditions.push(eq(treasurySessionsTable.status, status as SessionStatus));
    }
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(treasurySessionsTable)
      .where(where);

    const rows = await sessionSelect(where)
      .orderBy(desc(treasurySessionsTable.openedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({ items: rows.map(serializeSession), total: count, page, pageSize });
  },
);

// GET /treasury/sessions/current — the open session for an account, or null
router.get(
  "/treasury/sessions/current",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const parsed = GetCurrentTreasurySessionQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [row] = await sessionSelect(
      and(
        eq(treasurySessionsTable.storeId, storeId),
        eq(treasurySessionsTable.treasuryAccountId, parsed.data.treasuryAccountId),
        eq(treasurySessionsTable.status, "OPEN"),
      ),
    )
      .orderBy(desc(treasurySessionsTable.openedAt))
      .limit(1);
    res.json({ session: row ? serializeSession(row) : null });
  },
);

// POST /treasury/sessions — open a shift
router.post(
  "/treasury/sessions",
  requireAuth,
  requirePermission("treasury.session"),
  async (req, res) => {
    const parsed = OpenTreasurySessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { treasuryAccountId, openingBalance, notes } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    const [account] = await db
      .select({ id: treasuryAccountsTable.id })
      .from(treasuryAccountsTable)
      .where(
        and(eq(treasuryAccountsTable.id, treasuryAccountId), eq(treasuryAccountsTable.storeId, storeId)),
      )
      .limit(1);
    if (!account) {
      res.status(404).json({ error: "حساب الخزينة غير موجود" });
      return;
    }

    const [existing] = await db
      .select({ id: treasurySessionsTable.id })
      .from(treasurySessionsTable)
      .where(
        and(
          eq(treasurySessionsTable.treasuryAccountId, treasuryAccountId),
          eq(treasurySessionsTable.status, "OPEN"),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "توجد وردية مفتوحة بالفعل لهذا الحساب" });
      return;
    }

    const [created] = await db
      .insert(treasurySessionsTable)
      .values({
        storeId,
        treasuryAccountId,
        openingBalance: money(openingBalance),
        notes: notes ?? null,
        openedBy: userId,
      })
      .returning({ id: treasurySessionsTable.id });

    await writeAuditLog({
      storeId,
      userId,
      action: "treasury.session_opened",
      entityType: "treasury_session",
      entityId: created.id,
      newValue: { treasuryAccountId, openingBalance },
      ipAddress: clientIp(req),
    });

    const [row] = await sessionSelect(eq(treasurySessionsTable.id, created.id)).limit(1);
    res.status(201).json(serializeSession(row));
  },
);

// POST /treasury/sessions/:id/close — close a shift, recording variance
router.post(
  "/treasury/sessions/:id/close",
  requireAuth,
  requirePermission("treasury.session"),
  async (req, res) => {
    const parsed = CloseTreasurySessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { actualClosingBalance, notes, transferToMainSafe, transferAmount } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const sessionId = String(req.params["id"]);

    const [session] = await db
      .select({
        id: treasurySessionsTable.id,
        status: treasurySessionsTable.status,
        openingBalance: treasurySessionsTable.openingBalance,
        treasuryAccountId: treasurySessionsTable.treasuryAccountId,
      })
      .from(treasurySessionsTable)
      .where(and(eq(treasurySessionsTable.id, sessionId), eq(treasurySessionsTable.storeId, storeId)))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "الوردية غير موجودة" });
      return;
    }
    if (session.status !== "OPEN") {
      res.status(400).json({ error: "الوردية مغلقة بالفعل" });
      return;
    }

    // Expected close = opening count + net of money moved during the session.
    const [{ net }] = await db
      .select({
        net: sql<string>`coalesce(sum(case when ${treasuryTransactionsTable.direction} = 'IN' then ${treasuryTransactionsTable.amount} else -${treasuryTransactionsTable.amount} end), 0)`,
      })
      .from(treasuryTransactionsTable)
      .where(eq(treasuryTransactionsTable.sessionId, sessionId));

    const expected = toNum(session.openingBalance) + toNum(net);
    const variance = actualClosingBalance - expected;

    const [row] = await db
      .update(treasurySessionsTable)
      .set({
        status: "CLOSED",
        expectedClosingBalance: money(expected),
        actualClosingBalance: money(actualClosingBalance),
        variance: money(variance),
        notes: notes ?? null,
        closedBy: userId,
        closedAt: new Date(),
      })
      .where(eq(treasurySessionsTable.id, sessionId))
      .returning({ id: treasurySessionsTable.id });

    // Auto-transfer to Main Safe if requested
    if (transferToMainSafe && transferAmount && transferAmount > 0) {
      // Find the main safe for this store
      const [mainSafe] = await db
        .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
        .from(treasuryAccountsTable)
        .where(
          and(
            eq(treasuryAccountsTable.storeId, storeId),
            eq(treasuryAccountsTable.type, "MAIN_SAFE")
          )
        )
        .limit(1);

      if (mainSafe && session.treasuryAccountId !== mainSafe.id) {
        const desc = "ترحيل رصيد الوردية إلى الخزينة الرئيسية";
        await db.transaction(async (tx) => {
          const [transfer] = await tx
            .insert(treasuryTransfersTable)
            .values({
              storeId,
              fromAccountId: session.treasuryAccountId,
              toAccountId: mainSafe.id,
              amount: money(transferAmount),
              description: desc,
              createdBy: userId,
            })
            .returning({ id: treasuryTransfersTable.id });

          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: session.treasuryAccountId,
            direction: "OUT",
            amount: transferAmount,
            referenceType: "TRANSFER",
            referenceId: transfer.id,
            description: desc,
            userId,
            allowNegative: true,
          });

          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: mainSafe.id,
            direction: "IN",
            amount: transferAmount,
            referenceType: "TRANSFER",
            referenceId: transfer.id,
            description: desc,
            userId,
          });

          const fromCode = "1000"; // Assuming CASH is the drawer
          const toCode = "1001"; // MAIN_SAFE
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: desc,
            referenceType: "TRANSFER",
            referenceId: transfer.id,
            lines: [
              { code: toCode, debit: transferAmount },
              { code: fromCode, credit: transferAmount },
            ],
          });
        });
      }
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "treasury.session_closed",
      entityType: "treasury_session",
      entityId: row.id,
      newValue: { expected, actualClosingBalance, variance },
      ipAddress: clientIp(req),
    });

    const [full] = await sessionSelect(eq(treasurySessionsTable.id, sessionId)).limit(1);
    res.json(serializeSession(full));
  },
);

const openedByUser = usersTable;

// Shared session select with account name + opener/closer names resolved.
function sessionSelect(where: ReturnType<typeof and> | ReturnType<typeof eq>) {
  return db
    .select({
      id: treasurySessionsTable.id,
      treasuryAccountId: treasurySessionsTable.treasuryAccountId,
      accountName: treasuryAccountsTable.name,
      status: treasurySessionsTable.status,
      openingBalance: treasurySessionsTable.openingBalance,
      expectedClosingBalance: treasurySessionsTable.expectedClosingBalance,
      actualClosingBalance: treasurySessionsTable.actualClosingBalance,
      variance: treasurySessionsTable.variance,
      notes: treasurySessionsTable.notes,
      openedByName: openedByUser.fullName,
      openedAt: treasurySessionsTable.openedAt,
      closedAt: treasurySessionsTable.closedAt,
    })
    .from(treasurySessionsTable)
    .leftJoin(
      treasuryAccountsTable,
      eq(treasurySessionsTable.treasuryAccountId, treasuryAccountsTable.id),
    )
    .leftJoin(openedByUser, eq(treasurySessionsTable.openedBy, openedByUser.id))
    .where(where);
}

type SessionRow = Awaited<ReturnType<ReturnType<typeof sessionSelect>["limit"]>>[number];

function serializeSession(r: SessionRow) {
  return {
    ...r,
    closedByName: null as string | null,
    openedAt: r.openedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  };
}

// ===========================================================================
// TREASURY TRANSFER — move money between two drawers
// ===========================================================================

router.post(
  "/treasury/transfers",
  requireAuth,
  requirePermission("treasury.session"),
  async (req, res) => {
    const parsed = CreateTreasuryTransferBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { fromAccountId, toAccountId, amount, description } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    if (fromAccountId === toAccountId) {
      res.status(400).json({ error: "الخزينة المصدر والوجهة يجب أن تكون مختلفتين" });
      return;
    }

    await ensureStoreFinancials(db, storeId);

    try {
      const transfer = await db.transaction(async (tx) => {
        // Validate both accounts belong to this store.
        const [fromAcct] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type, balance: treasuryAccountsTable.balance })
          .from(treasuryAccountsTable)
          .where(and(eq(treasuryAccountsTable.id, fromAccountId), eq(treasuryAccountsTable.storeId, storeId)))
          .limit(1);
        if (!fromAcct) throw new Error("FROM_ACCOUNT_NOT_FOUND");

        const [toAcct] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(and(eq(treasuryAccountsTable.id, toAccountId), eq(treasuryAccountsTable.storeId, storeId)))
          .limit(1);
        if (!toAcct) throw new Error("TO_ACCOUNT_NOT_FOUND");

        // Create the transfer record first so we have its ID.
        const [row] = await tx
          .insert(treasuryTransfersTable)
          .values({
            storeId,
            fromAccountId: fromAcct.id,
            toAccountId: toAcct.id,
            amount: money(amount),
            description: description ?? null,
            createdBy: userId,
          })
          .returning({ id: treasuryTransfersTable.id, createdAt: treasuryTransfersTable.createdAt });

        // OUT from source (will throw INSUFFICIENT_TREASURY if balance too low).
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: fromAcct.id,
          direction: "OUT",
          amount,
          referenceType: "TRANSFER",
          referenceId: row.id,
          description: description ?? `تحويل إلى ${toAccountId}`,
          userId,
        });

        // IN to destination.
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: toAcct.id,
          direction: "IN",
          amount,
          referenceType: "TRANSFER",
          referenceId: row.id,
          description: description ?? `تحويل من ${fromAccountId}`,
          userId,
        });

        // Journal entry: Dr destination asset, Cr source asset.
        const fromCode = TREASURY_TYPE_TO_ACCOUNT_CODE[fromAcct.type];
        const toCode = TREASURY_TYPE_TO_ACCOUNT_CODE[toAcct.type];
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: description ?? `تحويل خزينة`,
          referenceType: "TRANSFER",
          referenceId: row.id,
          lines: [
            { code: toCode, debit: amount },
            { code: fromCode, credit: amount },
          ],
        });

        return { id: row.id, fromAccountId: fromAcct.id, toAccountId: toAcct.id, amount: money(amount), description: description ?? null, createdAt: row.createdAt };
      });

      await writeAuditLog({
        storeId,
        userId,
        action: "treasury.transfer",
        entityType: "treasury_transfer",
        entityId: transfer.id,
        newValue: { fromAccountId, toAccountId, amount },
        ipAddress: clientIp(req),
      });

      res.status(201).json({ ...transfer, createdAt: new Date(transfer.createdAt).toISOString() });
    } catch (err) {
      if (err instanceof Error && err.message === "FROM_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "الخزينة المصدر غير موجودة" });
        return;
      }
      if (err instanceof Error && err.message === "TO_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "الخزينة الوجهة غير موجودة" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة المصدر غير كافٍ" });
        return;
      }
      throw err;
    }
  },
);

// ===========================================================================
// TREASURY ADJUSTMENT — manual reconciliation
// ===========================================================================

router.post(
  "/treasury/adjustments",
  requireAuth,
  requirePermission("treasury.session"),
  async (req, res) => {
    const parsed = CreateTreasuryAdjustmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { treasuryAccountId, direction, amount, reason } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    await ensureStoreFinancials(db, storeId);

    try {
      const adjustment = await db.transaction(async (tx) => {
        const [acct] = await tx
          .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
          .from(treasuryAccountsTable)
          .where(and(eq(treasuryAccountsTable.id, treasuryAccountId), eq(treasuryAccountsTable.storeId, storeId)))
          .limit(1);
        if (!acct) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

        const [row] = await tx
          .insert(treasuryAdjustmentsTable)
          .values({
            storeId,
            treasuryAccountId: acct.id,
            direction: direction as "IN" | "OUT",
            amount: money(amount),
            reason,
            createdBy: userId,
          })
          .returning({ id: treasuryAdjustmentsTable.id, createdAt: treasuryAdjustmentsTable.createdAt });

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: acct.id,
          direction: direction as "IN" | "OUT",
          amount,
          referenceType: "ADJUSTMENT",
          referenceId: row.id,
          description: reason,
          userId,
          allowNegative: direction === "OUT",
        });

        // Journal entry against Treasury Variance (6000).
        // Increase (IN):  Dr treasury asset, Cr 6000 Treasury Variance
        // Decrease (OUT): Dr 6000 Treasury Variance, Cr treasury asset
        const assetCode = TREASURY_TYPE_TO_ACCOUNT_CODE[acct.type];
        const lines =
          direction === "IN"
            ? [{ code: assetCode, debit: amount }, { code: "6000", credit: amount }]
            : [{ code: "6000", debit: amount }, { code: assetCode, credit: amount }];

        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `تسوية خزينة — ${reason}`,
          referenceType: "ADJUSTMENT",
          referenceId: row.id,
          lines,
        });

        return { id: row.id, treasuryAccountId: acct.id, direction, amount: money(amount), reason, createdAt: row.createdAt };
      });

      await writeAuditLog({
        storeId,
        userId,
        action: "treasury.adjustment",
        entityType: "treasury_adjustment",
        entityId: adjustment.id,
        newValue: { treasuryAccountId, direction, amount, reason },
        ipAddress: clientIp(req),
      });

      res.status(201).json({ ...adjustment, createdAt: new Date(adjustment.createdAt).toISOString() });
    } catch (err) {
      if (err instanceof Error && err.message === "TREASURY_ACCOUNT_NOT_FOUND") {
        res.status(404).json({ error: "الخزينة غير موجودة" });
        return;
      }
      if (err instanceof Error && err.message === "INSUFFICIENT_TREASURY") {
        res.status(400).json({ error: "رصيد الخزينة أقل من مبلغ التسوية" });
        return;
      }
      throw err;
    }
  },
);

export default router;
