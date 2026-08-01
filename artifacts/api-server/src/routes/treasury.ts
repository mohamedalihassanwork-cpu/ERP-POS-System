import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, isNull, lte, sql, inArray } from "drizzle-orm";
import * as z from "zod";
import {
  db,
  treasuryAccountsTable,
  treasuryTransactionsTable,
  treasuryTransfersTable,
  treasuryAdjustmentsTable,
  usersTable,
} from "@workspace/db";
import { ListTreasuryTransactionsQueryParams } from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
import { postTreasuryTransaction } from "../lib/treasury";
import { postJournalEntry } from "../lib/accounting";
import { money } from "../lib/money";
import { requireAuth, requirePermission } from "../middleware/auth";
import { hasPermission } from "@workspace/shared";

// These bodies are defined inline to avoid TypeScript project-reference issues
// with the manual-schemas that live only in api-zod/dist.
const CreateTreasuryTransferBody = z.object({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.number().positive(),
  description: z.string().max(500).nullish(),
});

const CreateTreasuryAdjustmentBody = z.object({
  treasuryAccountId: z.string(),
  direction: z.enum(["IN", "OUT"]),
  amount: z.number().positive(),
  reason: z.string().min(1),
});

const router: IRouter = Router();

const DIRECTIONS = ["IN", "OUT"] as const;
const REF_TYPES = [
  "SALE", "SALES_RETURN", "PURCHASE", "PURCHASE_RETURN",
  "EXPENSE", "SALARY", "WITHDRAWAL", "DEPOSIT",
  "CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "OPENING",
  "TRANSFER", "ADJUSTMENT", "DAY_CLOSE_RESET", "DAY_OPEN_CARRY",
] as const;

type Direction = (typeof DIRECTIONS)[number];
type RefType = (typeof REF_TYPES)[number];

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// GET /treasury/accounts — drawers with cached balances
// - Cashier (treasury.view only): their own 4 accounts (no MAIN_SAFE)
// - Manager/Accountant (treasury.view_all): all accounts for all cashiers + MAIN_SAFE (if treasury.main_safe)
router.get(
  "/treasury/accounts",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;
    await ensureStoreFinancials(db, storeId);

    const canViewAll = hasPermission(perms, "treasury.view_all") || hasPermission(perms, "*");
    const canSeeMainSafe = hasPermission(perms, "treasury.main_safe") || hasPermission(perms, "*");

    if (canViewAll) {
      // Manager/Accountant: return all accounts grouped by user, plus MAIN_SAFE if permitted
      const rows = await db
        .select({
          id: treasuryAccountsTable.id,
          userId: treasuryAccountsTable.userId,
          userName: usersTable.fullName,
          type: treasuryAccountsTable.type,
          name: treasuryAccountsTable.name,
          balance: treasuryAccountsTable.balance,
          isActive: treasuryAccountsTable.isActive,
        })
        .from(treasuryAccountsTable)
        .leftJoin(usersTable, eq(treasuryAccountsTable.userId, usersTable.id))
        .where(eq(treasuryAccountsTable.storeId, storeId))
        .orderBy(usersTable.fullName, treasuryAccountsTable.type);

      const filtered = rows.filter(r => {
        if (r.type === "MAIN_SAFE") return canSeeMainSafe;
        return true;
      });

      res.json(filtered);
      return;
    }

    // Cashier: return only their own accounts (CASH, CARD, INSTAPAY, WALLET)
    const rows = await db
      .select({
        id: treasuryAccountsTable.id,
        userId: treasuryAccountsTable.userId,
        type: treasuryAccountsTable.type,
        name: treasuryAccountsTable.name,
        balance: treasuryAccountsTable.balance,
        isActive: treasuryAccountsTable.isActive,
      })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.userId, userId),
        ),
      )
      .orderBy(treasuryAccountsTable.type);

    res.json(rows);
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
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;
    const canViewAll = hasPermission(perms, "treasury.view_all") || hasPermission(perms, "*");

    const conditions = [eq(treasuryTransactionsTable.storeId, storeId)];
    if (treasuryAccountId) {
      conditions.push(eq(treasuryTransactionsTable.treasuryAccountId, treasuryAccountId));
    }

    // If not a manager, restrict to own accounts only
    if (!canViewAll) {
      const userAccountsQuery = db.select({ id: treasuryAccountsTable.id })
        .from(treasuryAccountsTable)
        .where(eq(treasuryAccountsTable.userId, userId));
      conditions.push(inArray(treasuryTransactionsTable.treasuryAccountId, userAccountsQuery));
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
        accountType: treasuryAccountsTable.type,
        accountUserId: treasuryAccountsTable.userId,
        operationalDayId: treasuryTransactionsTable.operationalDayId,
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

// ===========================================================================
// TREASURY TRANSFER — move money between two drawers
// Requires treasury.transfer permission (separate from treasury.session)
// ===========================================================================

router.post(
  "/treasury/transfers",
  requireAuth,
  requirePermission("treasury.transfer"),
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
        const fromCode = TREASURY_TYPE_TO_ACCOUNT_CODE[fromAcct.type as keyof typeof TREASURY_TYPE_TO_ACCOUNT_CODE];
        const toCode = TREASURY_TYPE_TO_ACCOUNT_CODE[toAcct.type as keyof typeof TREASURY_TYPE_TO_ACCOUNT_CODE];
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
// Requires treasury.adjustment permission (separate from treasury.session)
// ===========================================================================

router.post(
  "/treasury/adjustments",
  requireAuth,
  requirePermission("treasury.adjustment"),
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
        const assetCode = TREASURY_TYPE_TO_ACCOUNT_CODE[acct.type as keyof typeof TREASURY_TYPE_TO_ACCOUNT_CODE];
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
