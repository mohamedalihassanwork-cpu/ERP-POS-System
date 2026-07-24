import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  db,
  associationsTable,
  associationTransactionsTable,
  treasuryAccountsTable,
} from "@workspace/db";
import { requireAuth, requirePermission, requireAnyPermission } from "../middleware/auth";
import { postTreasuryTransaction } from "../lib/treasury";
import { toNum, money } from "../lib/money";
import { writeAuditLog } from "../lib/audit";
import { z } from "zod";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────────────────────────

const CreateAssociationBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  expectedReturnDate: z.string().optional(),
  contributionFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM", "NONE"]).default("NONE"),
  contributionAmount: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateAssociationBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  expectedReturnDate: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "CLOSED"]).optional(),
  contributionFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM", "NONE"]).optional(),
  contributionAmount: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const CreateTransactionBody = z.object({
  type: z.enum(["WITHDRAWAL", "RETURN"]),
  amount: z.string().min(1),
  transactionDate: z.string().default(todayStr),
  treasuryAccountId: z.string().uuid(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: compute summary for one or many associations from the transactions table
// Balance = totalWithdrawals - totalReturns (never stored; always computed)
// ─────────────────────────────────────────────────────────────────────────────
async function computeSummary(storeId: string, associationId?: string) {
  const conditions: SQL[] = [eq(associationTransactionsTable.storeId, storeId)];
  if (associationId) conditions.push(eq(associationTransactionsTable.associationId, associationId));

  const rows = await db
    .select({
      associationId: associationTransactionsTable.associationId,
      type: associationTransactionsTable.type,
      totalAmount: sql<number>`CAST(coalesce(sum(cast(${associationTransactionsTable.amount} as REAL)), 0) AS REAL)`,
    })
    .from(associationTransactionsTable)
    .where(and(...conditions, eq(associationTransactionsTable.isReversed, false)))
    .groupBy(associationTransactionsTable.associationId, associationTransactionsTable.type);

  // Aggregate per association
  const map = new Map<string, { totalWithdrawals: number; totalReturns: number }>();
  for (const r of rows) {
    if (!map.has(r.associationId)) map.set(r.associationId, { totalWithdrawals: 0, totalReturns: 0 });
    const entry = map.get(r.associationId)!;
    if (r.type === "WITHDRAWAL") entry.totalWithdrawals += Number(r.totalAmount);
    else entry.totalReturns += Number(r.totalAmount);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /associations — list all associations with computed summaries
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/associations",
  requireAuth,
  requireAnyPermission(["associations.view", "associations.create", "associations.edit", "associations.transactions", "associations.report"]),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const status = req.query["status"] as string | undefined;
    const search = req.query["search"] as string | undefined;

    const conditions: SQL[] = [eq(associationsTable.storeId, storeId)];
    if (status === "ACTIVE" || status === "CLOSED")
      conditions.push(eq(associationsTable.status, status));
    if (search)
      conditions.push(sql`lower(${associationsTable.name}) like lower(${"%" + search + "%"})`);

    const rows = await db
      .select()
      .from(associationsTable)
      .where(and(...conditions))
      .orderBy(asc(associationsTable.name));

    const summaryMap = await computeSummary(storeId);

    const result = rows.map((r) => {
      const s = summaryMap.get(r.id) ?? { totalWithdrawals: 0, totalReturns: 0 };
      return {
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        totalWithdrawals: s.totalWithdrawals,
        totalReturns: s.totalReturns,
        balance: s.totalWithdrawals - s.totalReturns,
      };
    });

    res.json(result);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /associations — create a new association
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/associations",
  requireAuth,
  requirePermission("associations.create"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const parsed = CreateAssociationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const d = parsed.data;

    // Check name uniqueness
    const existing = await db
      .select({ id: associationsTable.id })
      .from(associationsTable)
      .where(and(eq(associationsTable.storeId, storeId), eq(associationsTable.name, d.name)))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "يوجد جمعية بهذا الاسم مسبقاً" });
      return;
    }

    const [row] = await db
      .insert(associationsTable)
      .values({
        storeId,
        name: d.name,
        description: d.description ?? null,
        startDate: d.startDate,
        endDate: d.endDate ?? null,
        expectedReturnDate: d.expectedReturnDate ?? null,
        status: "ACTIVE",
        contributionFrequency: d.contributionFrequency,
        contributionAmount: d.contributionAmount ?? null,
        notes: d.notes ?? null,
        createdBy: userId,
      })
      .returning();

    await writeAuditLog({
      storeId,
      userId,
      action: "CREATE",
      entityType: "association",
      entityId: row.id,
      newValue: row,
      ipAddress: clientIp(req),
    });

    res.status(201).json({ ...row, totalWithdrawals: 0, totalReturns: 0, balance: 0 });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /associations/:id — single association with computed summary
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/associations/:id",
  requireAuth,
  requirePermission("associations.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const id = String(req.params.id);

    const [row] = await db
      .select()
      .from(associationsTable)
      .where(and(eq(associationsTable.id, id), eq(associationsTable.storeId, storeId)))
      .limit(1);
    if (!row) { res.status(404).json({ error: "الجمعية غير موجودة" }); return; }

    const summaryMap = await computeSummary(storeId, id);
    const s = summaryMap.get(id) ?? { totalWithdrawals: 0, totalReturns: 0 };

    res.json({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      totalWithdrawals: s.totalWithdrawals,
      totalReturns: s.totalReturns,
      balance: s.totalWithdrawals - s.totalReturns,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /associations/:id — update association details
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  "/associations/:id",
  requireAuth,
  requirePermission("associations.edit"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params.id);
    const parsed = UpdateAssociationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }

    const [existing] = await db
      .select()
      .from(associationsTable)
      .where(and(eq(associationsTable.id, id), eq(associationsTable.storeId, storeId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "الجمعية غير موجودة" }); return; }

    const d = parsed.data;
    const updates: Partial<typeof associationsTable.$inferInsert> = {};
    if (d.name !== undefined) updates.name = d.name;
    if (d.description !== undefined) updates.description = d.description ?? null;
    if (d.endDate !== undefined) updates.endDate = d.endDate ?? null;
    if (d.expectedReturnDate !== undefined) updates.expectedReturnDate = d.expectedReturnDate ?? null;
    if (d.status !== undefined) updates.status = d.status;
    if (d.contributionFrequency !== undefined) updates.contributionFrequency = d.contributionFrequency;
    if (d.contributionAmount !== undefined) updates.contributionAmount = d.contributionAmount ?? null;
    if (d.notes !== undefined) updates.notes = d.notes ?? null;

    const [updated] = await db
      .update(associationsTable)
      .set(updates)
      .where(eq(associationsTable.id, id))
      .returning();

    await writeAuditLog({
      storeId,
      userId,
      action: "UPDATE",
      entityType: "association",
      entityId: id,
      oldValue: existing,
      newValue: updated,
      ipAddress: clientIp(req),
    });

    const summaryMap = await computeSummary(storeId, id);
    const s = summaryMap.get(id) ?? { totalWithdrawals: 0, totalReturns: 0 };
    res.json({
      ...updated,
      totalWithdrawals: s.totalWithdrawals,
      totalReturns: s.totalReturns,
      balance: s.totalWithdrawals - s.totalReturns,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /associations/:id — delete an association (only if no transactions exist)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/associations/:id",
  requireAuth,
  requirePermission("associations.edit"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params.id);

    // 1. Check if it exists
    const [existing] = await db
      .select()
      .from(associationsTable)
      .where(and(eq(associationsTable.id, id), eq(associationsTable.storeId, storeId)))
      .limit(1);
    
    if (!existing) {
      res.status(404).json({ error: "الجمعية غير موجودة" });
      return;
    }

    // 2. Prevent deletion if there are any transactions (even reversed ones)
    const [txCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(associationTransactionsTable)
      .where(
        and(
          eq(associationTransactionsTable.associationId, id),
          eq(associationTransactionsTable.storeId, storeId)
        )
      );

    if (txCount && Number(txCount.count) > 0) {
      res.status(400).json({ error: "لا يمكن حذف الجمعية لوجود معاملات مالية مرتبطة بها. يرجى إغلاقها بدلاً من الحذف." });
      return;
    }

    // 3. Delete the association
    await db
      .delete(associationsTable)
      .where(and(eq(associationsTable.id, id), eq(associationsTable.storeId, storeId)));

    await writeAuditLog({
      storeId,
      userId,
      action: "DELETE",
      entityType: "association",
      entityId: id,
      oldValue: existing,
      ipAddress: clientIp(req),
    });

    res.json({ success: true, message: "تم حذف الجمعية بنجاح" });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /associations/:id/transactions — paginated ledger with running balance
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/associations/:id/transactions",
  requireAuth,
  requirePermission("associations.transactions"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const id = String(req.params.id);
    const fromDate = req.query["fromDate"] as string | undefined;
    const toDate = req.query["toDate"] as string | undefined;

    const [assoc] = await db
      .select({ id: associationsTable.id })
      .from(associationsTable)
      .where(and(eq(associationsTable.id, id), eq(associationsTable.storeId, storeId)))
      .limit(1);
    if (!assoc) { res.status(404).json({ error: "الجمعية غير موجودة" }); return; }

    const conditions: SQL[] = [
      eq(associationTransactionsTable.associationId, id),
      eq(associationTransactionsTable.storeId, storeId),
    ];
    if (fromDate) conditions.push(sql`${associationTransactionsTable.transactionDate} >= ${fromDate}`);
    if (toDate) conditions.push(sql`${associationTransactionsTable.transactionDate} <= ${toDate}`);

    const rows = await db
      .select({
        id: associationTransactionsTable.id,
        type: associationTransactionsTable.type,
        amount: associationTransactionsTable.amount,
        transactionDate: associationTransactionsTable.transactionDate,
        treasuryAccountId: associationTransactionsTable.treasuryAccountId,
        treasuryAccountName: treasuryAccountsTable.name,
        referenceNumber: associationTransactionsTable.referenceNumber,
        notes: associationTransactionsTable.notes,
        isReversed: associationTransactionsTable.isReversed,
        reversalOfId: associationTransactionsTable.reversalOfId,
        createdAt: associationTransactionsTable.createdAt,
      })
      .from(associationTransactionsTable)
      .leftJoin(
        treasuryAccountsTable,
        eq(treasuryAccountsTable.id, associationTransactionsTable.treasuryAccountId),
      )
      .where(and(...conditions))
      .orderBy(asc(associationTransactionsTable.transactionDate), asc(associationTransactionsTable.createdAt));

    // Compute running balance in app layer
    let runningBalance = 0;
    const rowsWithBalance = rows.map((r) => {
      const amt = toNum(r.amount);
      // Reversed transactions do not affect the running balance
      if (!r.isReversed) {
        if (r.type === "WITHDRAWAL") runningBalance += amt;
        else runningBalance -= amt;
      }
      return {
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        runningBalance,
      };
    });

    // Final summary (non-reversed only)
    const summaryMap = await computeSummary(storeId, id);
    const s = summaryMap.get(id) ?? { totalWithdrawals: 0, totalReturns: 0 };

    res.json({
      rows: rowsWithBalance,
      count: rowsWithBalance.length,
      totalWithdrawals: s.totalWithdrawals,
      totalReturns: s.totalReturns,
      balance: s.totalWithdrawals - s.totalReturns,
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /associations/:id/transactions — record a withdrawal or return
//
// Accounting:
//   WITHDRAWAL → Treasury OUT (cash leaves the register)
//   RETURN     → Treasury IN  (cash returns to the register)
//
// Financial records are NEVER deleted. Use the /reverse endpoint instead.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/associations/:id/transactions",
  requireAuth,
  requirePermission("associations.transactions"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params.id);
    const parsed = CreateTransactionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const d = parsed.data;
    const amount = toNum(d.amount);
    if (amount <= 0) {
      res.status(400).json({ error: "يجب أن يكون المبلغ أكبر من الصفر" });
      return;
    }

    const [assoc] = await db
      .select({ id: associationsTable.id, name: associationsTable.name })
      .from(associationsTable)
      .where(and(eq(associationsTable.id, id), eq(associationsTable.storeId, storeId)))
      .limit(1);
    if (!assoc) { res.status(404).json({ error: "الجمعية غير موجودة" }); return; }

    // Run everything atomically
    const result = await db.transaction(async (tx) => {
      // Post the treasury movement
      const direction = d.type === "WITHDRAWAL" ? "OUT" : "IN";
      await postTreasuryTransaction(tx, {
        storeId,
        treasuryAccountId: d.treasuryAccountId,
        direction,
        amount,
        referenceType: "WITHDRAWAL", // reuse existing refType for cash flow categorisation
        referenceId: id,
        description: d.type === "WITHDRAWAL"
          ? `سحب لجمعية: ${assoc.name}`
          : `عودة من جمعية: ${assoc.name}`,
        userId,
        allowNegative: true, // per the treasury settings of the store
      });

      // Record the association transaction
      const [txRow] = await tx
        .insert(associationTransactionsTable)
        .values({
          storeId,
          associationId: id,
          type: d.type,
          amount: money(amount),
          transactionDate: d.transactionDate,
          treasuryAccountId: d.treasuryAccountId,
          referenceNumber: d.referenceNumber ?? null,
          notes: d.notes ?? null,
          isReversed: false,
          reversalOfId: null,
          createdBy: userId,
        })
        .returning();

      return txRow;
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "CREATE",
      entityType: "association_transaction",
      entityId: result.id,
      newValue: result,
      ipAddress: clientIp(req),
    });

    res.status(201).json(result);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /associations/:id/transactions/:txId/reverse
//
// Creates an OPPOSITE transaction to cancel the effect of the original.
// The original row is marked isReversed=true.
// The new reversal row carries reversalOfId pointing to the original.
// Financial records are NEVER deleted.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/associations/:id/transactions/:txId/reverse",
  requireAuth,
  requirePermission("associations.transactions"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);
    const txId = String(req.params["txId"]);
    const notes = (req.body as { notes?: string }).notes ?? null;

    const [original] = await db
      .select()
      .from(associationTransactionsTable)
      .where(
        and(
          eq(associationTransactionsTable.id, txId),
          eq(associationTransactionsTable.associationId, id),
          eq(associationTransactionsTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!original) { res.status(404).json({ error: "المعاملة غير موجودة" }); return; }
    if (original.isReversed) { res.status(409).json({ error: "هذه المعاملة محوّلة مسبقاً" }); return; }

    const [assoc] = await db
      .select({ name: associationsTable.name })
      .from(associationsTable)
      .where(eq(associationsTable.id, id))
      .limit(1);

    const result = await db.transaction(async (tx) => {
      // Post the opposite treasury movement
      const reversalType = original.type === "WITHDRAWAL" ? "RETURN" : "WITHDRAWAL";
      const direction = reversalType === "WITHDRAWAL" ? "OUT" : "IN";
      await postTreasuryTransaction(tx, {
        storeId,
        treasuryAccountId: original.treasuryAccountId,
        direction,
        amount: toNum(original.amount),
        referenceType: "WITHDRAWAL",
        referenceId: id,
        description: `عكس معاملة جمعية: ${assoc?.name ?? id}`,
        userId,
        allowNegative: true,
      });

      // Mark original as reversed
      await tx
        .update(associationTransactionsTable)
        .set({ isReversed: true })
        .where(eq(associationTransactionsTable.id, txId));

      // Create the reversal row
      const [reversalRow] = await tx
        .insert(associationTransactionsTable)
        .values({
          storeId,
          associationId: id,
          type: reversalType,
          amount: original.amount,
          transactionDate: todayStr(),
          treasuryAccountId: original.treasuryAccountId,
          referenceNumber: null,
          notes: notes ?? `عكس معاملة رقم: ${txId}`,
          isReversed: false,
          reversalOfId: txId,
          createdBy: userId,
        })
        .returning();

      return reversalRow;
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "REVERSE",
      entityType: "association_transaction",
      entityId: txId,
      newValue: { reversalId: result.id },
      ipAddress: clientIp(req),
    });

    res.status(201).json(result);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /associations/summary — aggregate KPIs for dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  "/associations/summary",
  requireAuth,
  requirePermission("associations.report"),
  async (req, res) => {
    const storeId = req.auth!.storeId;

    const activeCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(associationsTable)
      .where(and(eq(associationsTable.storeId, storeId), eq(associationsTable.status, "ACTIVE")));

    const totals = await db
      .select({
        type: associationTransactionsTable.type,
        total: sql<number>`CAST(coalesce(sum(cast(${associationTransactionsTable.amount} as REAL)), 0) AS REAL)`,
      })
      .from(associationTransactionsTable)
      .where(
        and(
          eq(associationTransactionsTable.storeId, storeId),
          eq(associationTransactionsTable.isReversed, false),
        ),
      )
      .groupBy(associationTransactionsTable.type);

    let totalWithdrawn = 0;
    let totalReturned = 0;
    for (const r of totals) {
      if (r.type === "WITHDRAWAL") totalWithdrawn = Number(r.total);
      else totalReturned = Number(r.total);
    }

    res.json({
      activeAssociationsCount: Number(activeCount[0]?.count ?? 0),
      totalWithdrawn,
      totalReturned,
      totalOutstandingBalance: totalWithdrawn - totalReturned,
    });
  },
);

export default router;
