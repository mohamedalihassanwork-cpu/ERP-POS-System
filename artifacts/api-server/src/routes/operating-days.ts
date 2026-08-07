import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import {
  db,
  operationalDaysTable,
  cashierBalanceSnapshotsTable,
  treasuryAccountsTable,
  treasuryTransactionsTable,
  treasuryTransfersTable,
  usersTable,
} from "@workspace/db";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, ensureCashierAccounts, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
import { postTreasuryTransaction } from "../lib/treasury";
import { postJournalEntry } from "../lib/accounting";
import { money, toNum } from "../lib/money";
import { getShiftStartHour, computeShiftStart } from "../lib/shift";
import { requireAuth, requirePermission } from "../middleware/auth";
import { hasPermission } from "@workspace/shared";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

/** Serialize an operational day row for API response */
function serializeDay(row: any) {
  return {
    ...row,
    openedAt: row.openedAt instanceof Date ? row.openedAt.toISOString() : row.openedAt,
    closedAt: row.closedAt instanceof Date ? row.closedAt.toISOString() : (row.closedAt ?? null),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

/** Snapshot all 4 cashier accounts at the current moment (OPENING or CLOSING) */
async function snapshotCashierAccounts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  storeId: string,
  userId: string,
  operationalDayId: string,
  snapshotType: "OPENING" | "CLOSING",
  shiftStart?: Date,
): Promise<void> {
  const accounts = await tx
    .select({
      id: treasuryAccountsTable.id,
      type: treasuryAccountsTable.type,
      balance: treasuryAccountsTable.balance,
    })
    .from(treasuryAccountsTable)
    .where(
      and(
        eq(treasuryAccountsTable.storeId, storeId),
        eq(treasuryAccountsTable.userId, userId),
      ),
    );

  for (const acct of accounts) {
    // Compute inflow and outflow during this operational day
    let totalIn = "0";
    let totalOut = "0";

    if (shiftStart) {
      const [flows] = await tx
        .select({
          totalIn: sql<string>`coalesce(sum(case when ${treasuryTransactionsTable.direction} = 'IN' then CAST(${treasuryTransactionsTable.amount} AS REAL) else 0 end), 0)`,
          totalOut: sql<string>`coalesce(sum(case when ${treasuryTransactionsTable.direction} = 'OUT' then CAST(${treasuryTransactionsTable.amount} AS REAL) else 0 end), 0)`,
        })
        .from(treasuryTransactionsTable)
        .where(
          and(
            eq(treasuryTransactionsTable.treasuryAccountId, acct.id),
            gte(treasuryTransactionsTable.createdAt, shiftStart),
          ),
        );

      if (flows) {
        totalIn = money(toNum(flows.totalIn));
        totalOut = money(toNum(flows.totalOut));
      }
    }

    await tx
      .insert(cashierBalanceSnapshotsTable)
      .values({
        storeId,
        operationalDayId,
        treasuryAccountId: acct.id,
        snapshotType,
        balance: acct.balance,
        totalIn,
        totalOut,
      });
  }
}

// =============================================================================
// GET /operating-days
// List operational days (own for cashier, all for managers with treasury.view_all)
// =============================================================================
router.get(
  "/operating-days",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;
    const canViewAll = hasPermission(perms, "treasury.view_all") || hasPermission(perms, "*");

    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query["pageSize"] ?? "20"))));
    const status = req.query["status"] as string | undefined;

    const conditions = [eq(operationalDaysTable.storeId, storeId)];
    if (!canViewAll) {
      // Cashier can only see their own days
      conditions.push(eq(operationalDaysTable.userId, userId));
    }
    if (status === "OPEN" || status === "CLOSED") {
      conditions.push(eq(operationalDaysTable.status, status));
    }

    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(operationalDaysTable)
      .where(where);

    const opUser = usersTable;
    const rows = await db
      .select({
        id: operationalDaysTable.id,
        userId: operationalDaysTable.userId,
        userName: opUser.fullName,
        status: operationalDaysTable.status,
        openedAt: operationalDaysTable.openedAt,
        closedAt: operationalDaysTable.closedAt,
        openingCashBalance: operationalDaysTable.openingCashBalance,
        carryOverCash: operationalDaysTable.carryOverCash,
        actualClosingCashBalance: operationalDaysTable.actualClosingCashBalance,
        expectedClosingCashBalance: operationalDaysTable.expectedClosingCashBalance,
        cashVariance: operationalDaysTable.cashVariance,
        totalTransferredToMainSafe: operationalDaysTable.totalTransferredToMainSafe,
        cashVarianceReason: operationalDaysTable.cashVarianceReason,
        cashVarianceNotes: operationalDaysTable.cashVarianceNotes,
        notes: operationalDaysTable.notes,
      })
      .from(operationalDaysTable)
      .leftJoin(opUser, eq(operationalDaysTable.userId, opUser.id))
      .where(where)
      .orderBy(desc(operationalDaysTable.openedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);


    res.json({
      items: rows.map(serializeDay),
      total: count,
      page,
      pageSize,
    });
  },
);

// =============================================================================
// GET /operating-days/current
// Get the currently open operational day for the authenticated user
// =============================================================================
router.get(
  "/operating-days/current",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    const [cashAcctForExpected] = await db
      .select({ 
        id: treasuryAccountsTable.id,
        balance: treasuryAccountsTable.balance
      })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, "CASH"),
          eq(treasuryAccountsTable.userId, userId),
        ),
      )
      .limit(1);

    const opUser = usersTable;
    const [row] = await db
      .select({
        id: operationalDaysTable.id,
        userId: operationalDaysTable.userId,
        userName: opUser.fullName,
        status: operationalDaysTable.status,
        openedAt: operationalDaysTable.openedAt,
        closedAt: operationalDaysTable.closedAt,
        openingCashBalance: operationalDaysTable.openingCashBalance,
        carryOverCash: operationalDaysTable.carryOverCash,
        actualClosingCashBalance: operationalDaysTable.actualClosingCashBalance,
        expectedClosingCashBalance: operationalDaysTable.expectedClosingCashBalance,
        cashVariance: operationalDaysTable.cashVariance,
        totalTransferredToMainSafe: operationalDaysTable.totalTransferredToMainSafe,
        cashVarianceReason: operationalDaysTable.cashVarianceReason,
        cashVarianceNotes: operationalDaysTable.cashVarianceNotes,
        notes: operationalDaysTable.notes,
      })
      .from(operationalDaysTable)
      .leftJoin(opUser, eq(operationalDaysTable.userId, opUser.id))
      .where(
        and(
          eq(operationalDaysTable.storeId, storeId),
          eq(operationalDaysTable.userId, userId),
          eq(operationalDaysTable.status, "OPEN"),
        ),
      )
      .orderBy(desc(operationalDaysTable.openedAt))
      .limit(1);

    // Compute expected cash balance for the UI preview (only when day is OPEN)
    let expectedCashBalance: string | null = null;
    if (row && cashAcctForExpected) {
      expectedCashBalance = money(toNum(cashAcctForExpected.balance));
    }

    res.json({
      operationalDay: row ? serializeDay(row) : null,
      expectedCashBalance,
    });
  },
);

// =============================================================================
// GET /operating-days/:id
// Get a specific operational day's details + balance snapshots
// =============================================================================
router.get(
  "/operating-days/:id",
  requireAuth,
  requirePermission("treasury.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;
    const canViewAll = hasPermission(perms, "treasury.view_all") || hasPermission(perms, "*");
    const dayId = String(req.params["id"]);

    const opUser = usersTable;
    const [day] = await db
      .select({
        id: operationalDaysTable.id,
        userId: operationalDaysTable.userId,
        userName: opUser.fullName,
        status: operationalDaysTable.status,
        openedAt: operationalDaysTable.openedAt,
        closedAt: operationalDaysTable.closedAt,
        openingCashBalance: operationalDaysTable.openingCashBalance,
        carryOverCash: operationalDaysTable.carryOverCash,
        actualClosingCashBalance: operationalDaysTable.actualClosingCashBalance,
        expectedClosingCashBalance: operationalDaysTable.expectedClosingCashBalance,
        cashVariance: operationalDaysTable.cashVariance,
        totalTransferredToMainSafe: operationalDaysTable.totalTransferredToMainSafe,
        notes: operationalDaysTable.notes,
      })
      .from(operationalDaysTable)
      .leftJoin(opUser, eq(operationalDaysTable.userId, opUser.id))
      .where(and(eq(operationalDaysTable.id, dayId), eq(operationalDaysTable.storeId, storeId)))
      .limit(1);

    if (!day) {
      res.status(404).json({ error: "اليوم التشغيلي غير موجود" });
      return;
    }

    // Cashier can only see their own days
    if (!canViewAll && day.userId !== userId) {
      res.status(403).json({ error: "غير مصرح لك بعرض هذا اليوم التشغيلي" });
      return;
    }

    // Include balance snapshots
    const snapshots = await db
      .select({
        id: cashierBalanceSnapshotsTable.id,
        treasuryAccountId: cashierBalanceSnapshotsTable.treasuryAccountId,
        accountName: treasuryAccountsTable.name,
        accountType: treasuryAccountsTable.type,
        snapshotType: cashierBalanceSnapshotsTable.snapshotType,
        balance: cashierBalanceSnapshotsTable.balance,
        totalIn: cashierBalanceSnapshotsTable.totalIn,
        totalOut: cashierBalanceSnapshotsTable.totalOut,
        createdAt: cashierBalanceSnapshotsTable.createdAt,
      })
      .from(cashierBalanceSnapshotsTable)
      .leftJoin(
        treasuryAccountsTable,
        eq(cashierBalanceSnapshotsTable.treasuryAccountId, treasuryAccountsTable.id),
      )
      .where(eq(cashierBalanceSnapshotsTable.operationalDayId, dayId));

    res.json({ operationalDay: serializeDay(day), snapshots });
  },
);

// =============================================================================
// POST /operating-days — Open a new operational day
// =============================================================================
router.post(
  "/operating-days",
  requireAuth,
  requirePermission("treasury.session"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const { openingCashBalance = 0, notes } = req.body ?? {};

    // Only the cashier themselves can open their own day (per Q2)
    // Validate: no other OPEN day for this user in this operational period
    const shiftHour = await getShiftStartHour(storeId);
    const shiftStart = computeShiftStart(shiftHour);

    const [existingOpen] = await db
      .select({ id: operationalDaysTable.id })
      .from(operationalDaysTable)
      .where(
        and(
          eq(operationalDaysTable.storeId, storeId),
          eq(operationalDaysTable.userId, userId),
          eq(operationalDaysTable.status, "OPEN"),
        ),
      )
      .limit(1);

    if (existingOpen) {
      res.status(409).json({ error: "لديك يوم تشغيلي مفتوح بالفعل. يجب إغلاقه أولاً." });
      return;
    }



    // Ensure store financials and cashier accounts exist
    await ensureStoreFinancials(db, storeId);
    await ensureCashierAccounts(db, storeId, userId);

    const result = await db.transaction(async (tx) => {
      const [cashAcct] = await tx
        .select({ id: treasuryAccountsTable.id, balance: treasuryAccountsTable.balance })
        .from(treasuryAccountsTable)
        .where(
          and(
            eq(treasuryAccountsTable.storeId, storeId),
            eq(treasuryAccountsTable.type, "CASH"),
            eq(treasuryAccountsTable.userId, userId),
          ),
        )
        .limit(1);

      const [day] = await tx
        .insert(operationalDaysTable)
        .values({
          storeId,
          userId,
          status: "OPEN",
          openingCashBalance: money(Number(openingCashBalance)),
          carryOverCash: money(Number(openingCashBalance)),
          openedBy: userId,
          notes: notes ?? null,
        })
        .returning({ id: operationalDaysTable.id });

      if (cashAcct) {
        const expectedOpening = toNum(cashAcct.balance);
        const actualOpening = Number(openingCashBalance);
        const difference = actualOpening - expectedOpening;

        if (Math.abs(difference) > 0.001) {
          const isShortage = difference < 0;
          const absVariance = Math.abs(difference);
          const varianceDesc = `فارق فتح اليوم التشغيلي — ${isShortage ? "عجز نقدي" : "زيادة نقدية"}`;

          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: cashAcct.id,
            direction: isShortage ? "OUT" : "IN",
            amount: absVariance,
            referenceType: "DAY_OPEN_VARIANCE",
            referenceId: day.id,
            operationalDayId: day.id,
            description: varianceDesc,
            userId,
            allowNegative: true,
          });

          await postJournalEntry(tx, {
            storeId,
            userId,
            description: varianceDesc,
            referenceType: "DAY_OPEN_VARIANCE",
            referenceId: day.id,
            lines: isShortage
              ? [
                  { code: "6000", debit:  absVariance },  // DR Treasury Variance
                  { code: "1000", credit: absVariance },  // CR Cash
                ]
              : [
                  { code: "1000", debit:  absVariance },  // DR Cash
                  { code: "6000", credit: absVariance },  // CR Treasury Variance
                ],
          });
        }
      }

      // Snapshot balances of all 4 accounts at opening
      await snapshotCashierAccounts(tx, storeId, userId, day.id, "OPENING");

      return day;
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "treasury.operational_day_opened",
      entityType: "operational_day",
      entityId: result.id,
      newValue: { openingCashBalance, userId },
      ipAddress: clientIp(req),
    });

    // Return the created day
    const opUser = usersTable;
    const [full] = await db
      .select({
        id: operationalDaysTable.id,
        userId: operationalDaysTable.userId,
        userName: opUser.fullName,
        status: operationalDaysTable.status,
        openedAt: operationalDaysTable.openedAt,
        closedAt: operationalDaysTable.closedAt,
        openingCashBalance: operationalDaysTable.openingCashBalance,
        carryOverCash: operationalDaysTable.carryOverCash,
        totalTransferredToMainSafe: operationalDaysTable.totalTransferredToMainSafe,
        notes: operationalDaysTable.notes,
      })
      .from(operationalDaysTable)
      .leftJoin(opUser, eq(operationalDaysTable.userId, opUser.id))
      .where(eq(operationalDaysTable.id, result.id))
      .limit(1);

    res.status(201).json(serializeDay(full));
  },
);

// =============================================================================
// POST /operating-days/:id/close — Close an operational day
// =============================================================================
router.post(
  "/operating-days/:id/close",
  requireAuth,
  requirePermission("treasury.session"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;
    const dayId = String(req.params["id"]);

    const {
      actualClosingCashBalance,
      carryOverCash = 0,
      notes,
      varianceReason,
      varianceNotes,
    } = req.body ?? {};

    // Validate required field
    if (actualClosingCashBalance === undefined || actualClosingCashBalance === null) {
      res.status(400).json({ error: "يجب إدخال رصيد الإغلاق الفعلي للنقد" });
      return;
    }

    // Validate variance reason if provided
    const VALID_VARIANCE_REASONS = [
      "CASH_SHORTAGE",
      "CASH_OVERAGE",
      "COUNTING_ERROR",
      "THEFT_OR_LOSS",
      "PENDING_INVESTIGATION",
      "OTHER",
    ] as const;
    if (varianceReason !== undefined && !VALID_VARIANCE_REASONS.includes(varianceReason)) {
      res.status(400).json({ error: "سبب الفارق النقدي غير صالح" });
      return;
    }

    const [day] = await db
      .select({
        id: operationalDaysTable.id,
        userId: operationalDaysTable.userId,
        status: operationalDaysTable.status,
        openingCashBalance: operationalDaysTable.openingCashBalance,
        openedAt: operationalDaysTable.openedAt,
      })
      .from(operationalDaysTable)
      .where(and(eq(operationalDaysTable.id, dayId), eq(operationalDaysTable.storeId, storeId)))
      .limit(1);

    if (!day) {
      res.status(404).json({ error: "اليوم التشغيلي غير موجود" });
      return;
    }
    if (day.status !== "OPEN") {
      res.status(400).json({ error: "اليوم التشغيلي مغلق بالفعل" });
      return;
    }

    // Only the cashier or someone with treasury.close_others can close it
    const canCloseOthers = hasPermission(perms, "treasury.close_others") || hasPermission(perms, "*");
    if (day.userId !== userId && !canCloseOthers) {
      res.status(403).json({ error: "لا يمكنك إغلاق يوم تشغيلي لكاشير آخر" });
      return;
    }

    // Get the cashier's CASH account
    const cashierUserId = day.userId;
    const [cashAcct] = await db
      .select({
        id: treasuryAccountsTable.id,
        balance: treasuryAccountsTable.balance,
      })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, "CASH"),
          eq(treasuryAccountsTable.userId, cashierUserId),
        ),
      )
      .limit(1);

    if (!cashAcct) {
      res.status(400).json({ error: "لم يتم العثور على حساب النقد للكاشير" });
      return;
    }

    // Get MAIN_SAFE
    const [mainSafe] = await db
      .select({ id: treasuryAccountsTable.id })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, "MAIN_SAFE"),
          isNull(treasuryAccountsTable.userId),
        ),
      )
      .limit(1);

    if (!mainSafe) {
      res.status(500).json({ error: "الخزينة الرئيسية غير موجودة" });
      return;
    }

    // Compute expected CASH balance
    const shiftHour = await getShiftStartHour(storeId);
    const shiftStart = day.openedAt instanceof Date ? day.openedAt : new Date(day.openedAt);

    const expectedCashBalance = toNum(cashAcct.balance);
    const actualCash = Number(actualClosingCashBalance);
    const carryOver = Math.min(Number(carryOverCash), actualCash);
    const transferToCash = Math.max(0, actualCash - carryOver);
    const cashVariance = actualCash - expectedCashBalance;

    // Get all cashier accounts (CASH, CARD, INSTAPAY, WALLET)
    const cashierAccounts = await db
      .select({
        id: treasuryAccountsTable.id,
        type: treasuryAccountsTable.type,
        balance: treasuryAccountsTable.balance,
      })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.userId, cashierUserId),
        ),
      );

    await db.transaction(async (tx) => {
      let totalTransferred = 0;

      // 1. Snapshot closing balances of all accounts before zeroing
      await snapshotCashierAccounts(tx, storeId, cashierUserId, dayId, "CLOSING", shiftStart);

      // 2. Transfer all non-CASH balances (CARD, INSTAPAY, WALLET) → MAIN_SAFE (per Q4)
      for (const acct of cashierAccounts) {
        if (acct.type === "CASH") continue; // CASH handled separately
        const balance = toNum(acct.balance);
        if (balance <= 0) continue;

        const acctCode = TREASURY_TYPE_TO_ACCOUNT_CODE[acct.type as keyof typeof TREASURY_TYPE_TO_ACCOUNT_CODE];
        const description = `إغلاق يوم تشغيلي — تحويل رصيد ${acct.type} إلى الخزينة الرئيسية`;

        const [transfer] = await tx
          .insert(treasuryTransfersTable)
          .values({
            storeId,
            fromAccountId: acct.id,
            toAccountId: mainSafe.id,
            amount: money(balance),
            description,
            createdBy: userId,
          })
          .returning({ id: treasuryTransfersTable.id });

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: acct.id,
          direction: "OUT",
          amount: balance,
          referenceType: "DAY_CLOSE_RESET",
          referenceId: transfer.id,
          operationalDayId: dayId,
          description,
          userId,
          allowNegative: true,
        });

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: mainSafe.id,
          direction: "IN",
          amount: balance,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          operationalDayId: dayId,
          description,
          userId,
        });

        await postJournalEntry(tx, {
          storeId,
          userId,
          description,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          lines: [
            { code: "1001", debit: balance },       // MAIN_SAFE
            { code: acctCode, credit: balance },     // source account
          ],
        });

        totalTransferred += balance;
      }

      // 3. Handle CASH: transfer (actualCash - carryOver) → MAIN_SAFE
      const cashToTransfer = transferToCash;
      if (cashToTransfer > 0) {
        const description = "إغلاق يوم تشغيلي — تحويل نقد إلى الخزينة الرئيسية";
        const [transfer] = await tx
          .insert(treasuryTransfersTable)
          .values({
            storeId,
            fromAccountId: cashAcct.id,
            toAccountId: mainSafe.id,
            amount: money(cashToTransfer),
            description,
            createdBy: userId,
          })
          .returning({ id: treasuryTransfersTable.id });

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: cashAcct.id,
          direction: "OUT",
          amount: cashToTransfer,
          referenceType: "DAY_CLOSE_RESET",
          referenceId: transfer.id,
          operationalDayId: dayId,
          description,
          userId,
          allowNegative: true,
        });

        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: mainSafe.id,
          direction: "IN",
          amount: cashToTransfer,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          operationalDayId: dayId,
          description,
          userId,
        });

        await postJournalEntry(tx, {
          storeId,
          userId,
          description,
          referenceType: "TRANSFER",
          referenceId: transfer.id,
          lines: [
            { code: "1001", debit: cashToTransfer },
            { code: "1000", credit: cashToTransfer },
          ],
        });

        totalTransferred += cashToTransfer;
      }

      // 4. Reconcile cash variance with a proper double-entry GL journal entry.
      //    The old DAY_CLOSE_RESET approach silently zeroed the balance with no
      //    corresponding accounting entry, violating double-entry principles.
      //    Now: shortage → DR Treasury Variance (6000) / CR Cash (1000)
      //         overage  → DR Cash (1000) / CR Treasury Variance (6000)
      if (Math.abs(cashVariance) > 0.001) {
        const isShortage = cashVariance < 0;
        const absVariance = Math.abs(cashVariance);

        // Build a rich description including reason + notes for audit trail
        const VARIANCE_REASON_LABELS: Record<string, string> = {
          CASH_SHORTAGE:         "عجز نقدي",
          CASH_OVERAGE:          "زيادة نقدية",
          COUNTING_ERROR:        "خطأ في العد",
          THEFT_OR_LOSS:         "سرقة أو ضياع",
          PENDING_INVESTIGATION: "قيد التحقيق",
          OTHER:                 "أخرى",
        };
        const baseDesc = isShortage
          ? "فارق عجز نقدي عند إغلاق اليوم التشغيلي"
          : "فارق زيادة نقدية عند إغلاق اليوم التشغيلي";
        const descParts = [baseDesc];
        if (varianceReason) descParts.push(`السبب: ${VARIANCE_REASON_LABELS[varianceReason] ?? varianceReason}`);
        if (varianceNotes)  descParts.push(`ملاحظات: ${varianceNotes}`);
        const varianceDesc = descParts.join(" — ");

        // Treasury side: adjust CASH balance to match physical reality
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: cashAcct.id,
          direction: isShortage ? "OUT" : "IN",
          amount: absVariance,
          referenceType: "DAY_CLOSE_VARIANCE",
          referenceId: dayId,
          operationalDayId: dayId,
          description: varianceDesc,
          userId,
          allowNegative: true,
        });

        // Accounting side: balanced GL entry to Treasury Variance account (6000)
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: varianceDesc,
          referenceType: "DAY_CLOSE_VARIANCE",
          referenceId: dayId,
          lines: isShortage
            ? [
                { code: "6000", debit:  absVariance },  // DR Treasury Variance
                { code: "1000", credit: absVariance },  // CR Cash (Drawer)
              ]
            : [
                { code: "1000", debit:  absVariance },  // DR Cash (Drawer)
                { code: "6000", credit: absVariance },  // CR Treasury Variance
              ],
        });
      }

      // 5. Close the operational day
      await tx
        .update(operationalDaysTable)
        .set({
          status: "CLOSED",
          closedAt: new Date(),
          closedBy: userId,
          actualClosingCashBalance: money(actualCash),
          expectedClosingCashBalance: money(expectedCashBalance),
          cashVariance: money(cashVariance),
          carryOverCash: money(carryOver),
          totalTransferredToMainSafe: money(totalTransferred),
          notes: notes ?? null,
          cashVarianceReason: varianceReason ?? null,
          cashVarianceNotes: varianceNotes ?? null,
        })
        .where(eq(operationalDaysTable.id, dayId));
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "treasury.operational_day_closed",
      entityType: "operational_day",
      entityId: dayId,
      newValue: {
        actualClosingCashBalance,
        expectedCashBalance,
        cashVariance,
        carryOverCash: carryOver,
      },
      ipAddress: clientIp(req),
    });

    // Return the updated day
    const opUser = usersTable;
    const [full] = await db
      .select({
        id: operationalDaysTable.id,
        userId: operationalDaysTable.userId,
        userName: opUser.fullName,
        status: operationalDaysTable.status,
        openedAt: operationalDaysTable.openedAt,
        closedAt: operationalDaysTable.closedAt,
        openingCashBalance: operationalDaysTable.openingCashBalance,
        carryOverCash: operationalDaysTable.carryOverCash,
        actualClosingCashBalance: operationalDaysTable.actualClosingCashBalance,
        expectedClosingCashBalance: operationalDaysTable.expectedClosingCashBalance,
        cashVariance: operationalDaysTable.cashVariance,
        totalTransferredToMainSafe: operationalDaysTable.totalTransferredToMainSafe,
        cashVarianceReason: operationalDaysTable.cashVarianceReason,
        cashVarianceNotes: operationalDaysTable.cashVarianceNotes,
        notes: operationalDaysTable.notes,
      })
      .from(operationalDaysTable)
      .leftJoin(opUser, eq(operationalDaysTable.userId, opUser.id))
      .where(eq(operationalDaysTable.id, dayId))
      .limit(1);

    res.json(serializeDay(full));

  },
);

export default router;
