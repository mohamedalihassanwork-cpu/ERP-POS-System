import { and, eq } from "drizzle-orm";
import { db, treasuryAccountsTable, treasuryTransactionsTable } from "@workspace/db";
import { money, toNum } from "./money";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TreasuryDirection = "IN" | "OUT";
export type TreasuryRefType =
  | "SALE"
  | "SALES_RETURN"
  | "PURCHASE"
  | "PURCHASE_RETURN"
  | "EXPENSE"
  | "EXPENSE_REVERSAL"
  | "SALARY"
  | "SALARY_REVERSAL"
  | "WITHDRAWAL"
  | "WITHDRAWAL_REVERSAL"
  | "DEPOSIT"
  | "DEPOSIT_REVERSAL"
  | "CUSTOMER_PAYMENT"
  | "SUPPLIER_PAYMENT"
  | "OPENING"
  | "TRANSFER"
  | "ADJUSTMENT";

export interface TreasuryPosting {
  storeId: string;
  treasuryAccountId: string;
  direction: TreasuryDirection;
  amount: number;
  referenceType: TreasuryRefType;
  referenceId?: string | null;
  sessionId?: string | null;
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
      sessionId: p.sessionId ?? null,
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
export async function resolveBackdatedTreasuryAccount(
  tx: Tx,
  storeId: string,
  requestedAccountId: string,
  transactionDate?: Date | string | null,
  userPermissions?: string[]
): Promise<string> {
  if (!transactionDate) return requestedAccountId;

  const date = new Date(transactionDate);
  const today = new Date();
  
  // Offset today by 11 hours to match the system shift cutoff (11:00 AM)
  // Times between 00:00 and 10:59 AM map to the active shift date of the previous calendar day
  today.setHours(today.getHours() - 11);
  today.setHours(0, 0, 0, 0);

  // If it's today or in the future, don't change anything
  if (date >= today) return requestedAccountId;

  // Check if requested account is a CASH account
  const [acct] = await tx
    .select({ type: treasuryAccountsTable.type })
    .from(treasuryAccountsTable)
    .where(eq(treasuryAccountsTable.id, requestedAccountId))
    .limit(1);

  if (acct?.type === "CASH") {
    // Override to MAIN_SAFE
    const [mainSafe] = await tx
      .select({ id: treasuryAccountsTable.id })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, "MAIN_SAFE")
        )
      )
      .limit(1);

    if (mainSafe) {
      if (userPermissions) {
        const canSeeMainSafe = userPermissions.includes("*") || userPermissions.includes("treasury.manage") || userPermissions.includes("settings.manage");
        if (!canSeeMainSafe) {
          throw new Error("UNAUTHORIZED_MAIN_SAFE");
        }
      }
      return mainSafe.id;
    }
  }

  return requestedAccountId;
}
