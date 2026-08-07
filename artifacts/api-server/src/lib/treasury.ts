import { and, eq, isNull } from "drizzle-orm";
import { db, treasuryAccountsTable, treasuryTransactionsTable, treasuryRefTypeEnum } from "@workspace/db";
import { money, toNum } from "./money";
import { getShiftStartHour, computeShiftStart } from "./shift";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TreasuryDirection = "IN" | "OUT";
// Derived from the schema enum so it stays in sync with the DB column automatically
export type TreasuryRefType = (typeof treasuryRefTypeEnum)[number];

export interface TreasuryPosting {
  storeId: string;
  treasuryAccountId: string;
  direction: TreasuryDirection;
  amount: number;
  referenceType: TreasuryRefType;
  referenceId?: string | null;
  operationalDayId?: string | null;
  description?: string | null;
  userId?: string | null;
  allowNegative?: boolean;
  createdAt?: Date;
}

// Posts a single immutable treasury movement inside the caller's transaction:
// locks the drawer row (FOR UPDATE), updates its cached balance, and writes a
// ledger row carrying the resulting balanceAfter. Throws INSUFFICIENT_TREASURY
// when a withdrawal would overdraw a drawer that does not allow negatives.
export async function postTreasuryTransaction(
  tx: Tx,
  p: TreasuryPosting,
): Promise<{ id: string; balanceAfter: string }> {
  const [acct] = await tx
    .select({ id: treasuryAccountsTable.id, balance: treasuryAccountsTable.balance })
    .from(treasuryAccountsTable)
    .where(
      and(
        eq(treasuryAccountsTable.id, p.treasuryAccountId),
        eq(treasuryAccountsTable.storeId, p.storeId),
      ),
    )
    .limit(1);
  if (!acct) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");

  const delta = p.direction === "IN" ? p.amount : -p.amount;
  const newBalance = toNum(acct.balance) + delta;
  if (!p.allowNegative && newBalance < 0 && delta < 0) {
    throw new Error("INSUFFICIENT_TREASURY");
  }

  await tx
    .update(treasuryAccountsTable)
    .set({ balance: money(newBalance) })
    .where(eq(treasuryAccountsTable.id, acct.id));

  const [row] = await tx
    .insert(treasuryTransactionsTable)
    .values({
      storeId: p.storeId,
      treasuryAccountId: acct.id,
      operationalDayId: p.operationalDayId ?? null,
      direction: p.direction,
      amount: money(p.amount),
      balanceAfter: money(newBalance),
      referenceType: p.referenceType,
      referenceId: p.referenceId ?? null,
      description: p.description ?? null,
      createdBy: p.userId ?? null,
      ...(p.createdAt ? { createdAt: p.createdAt } : {}),
    })
    .returning({ id: treasuryTransactionsTable.id });

  return { id: row.id, balanceAfter: money(newBalance) };
}

// Intercepts backdated cash transactions and routes them to the main safe.
// This preserves the active cashier drawer balance which should only reflect today's physical cash.
// Now uses configurable shift hour from store_settings instead of hardcoded 11.
export async function resolveBackdatedTreasuryAccount(
  tx: Tx,
  storeId: string,
  requestedAccountId: string,
  transactionDate?: Date | string | null,
  userPermissions?: string[]
): Promise<string> {
  if (!transactionDate) return requestedAccountId;

  const shiftHour = await getShiftStartHour(storeId);
  const shiftStart = computeShiftStart(shiftHour, new Date());

  // Extract YYYY-MM-DD from transactionDate
  const inputDateStr = typeof transactionDate === "string" 
    ? transactionDate.slice(0, 10) 
    : transactionDate instanceof Date 
      ? transactionDate.toISOString().slice(0, 10) 
      : "";

  // Extract local YYYY-MM-DD from shiftStart
  const shiftStartStr = `${shiftStart.getFullYear()}-${String(shiftStart.getMonth() + 1).padStart(2, '0')}-${String(shiftStart.getDate()).padStart(2, '0')}`;

  // If the date is in the current shift or future, don't change anything
  if (inputDateStr >= shiftStartStr) return requestedAccountId;

  // Check if requested account is a CASH account
  const [acct] = await tx
    .select({ type: treasuryAccountsTable.type })
    .from(treasuryAccountsTable)
    .where(eq(treasuryAccountsTable.id, requestedAccountId))
    .limit(1);

  if (acct?.type === "CASH") {
    // Check permission to post to MAIN_SAFE
    if (userPermissions) {
      const canAccessMainSafe =
        userPermissions.includes("*") ||
        userPermissions.includes("treasury.main_safe") ||
        userPermissions.includes("settings.manage");
      if (!canAccessMainSafe) {
        throw new Error("UNAUTHORIZED_MAIN_SAFE");
      }
    }

    // Override to MAIN_SAFE (store-level, user_id IS NULL)
    const [mainSafe] = await tx
      .select({ id: treasuryAccountsTable.id })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, "MAIN_SAFE"),
          isNull(treasuryAccountsTable.userId),
        )
      )
      .limit(1);

    if (mainSafe) {
      return mainSafe.id;
    }
  }

  return requestedAccountId;
}
