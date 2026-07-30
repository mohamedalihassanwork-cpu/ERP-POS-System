import {
  db,
  accountingAccountsTable,
  treasuryAccountsTable,
  storeSettingsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

// Both the connection and a transaction expose the insert builder used here.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = typeof db | Tx;

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
type NormalBalance = "DEBIT" | "CREDIT";

interface ChartEntry {
  code: string;
  name: string;
  nameEn: string;
  type: AccountType;
  normalBalance: NormalBalance;
  isContra: boolean;
}

// Fixed per-store chart of accounts (SRS §10). Codes are stable identifiers used
// by the posting logic; do not renumber. 1020/1030 extend the SRS chart so each
// digital treasury drawer maps 1:1 to an asset account for clean double-entry.
export const CHART_OF_ACCOUNTS: ChartEntry[] = [
  { code: "1000", name: "درج الكاشير", nameEn: "Cash", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1001", name: "الخزينة الرئيسية", nameEn: "Main Safe", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1010", name: "ذمم البطاقات", nameEn: "Card Receivable", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1020", name: "إنستا باي", nameEn: "InstaPay", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1030", name: "المحفظة الإلكترونية", nameEn: "Wallet", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1100", name: "ذمم العملاء", nameEn: "Accounts Receivable", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1200", name: "المخزون", nameEn: "Inventory", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "1300", name: "سلف الموظفين", nameEn: "Employee Advances", type: "ASSET", normalBalance: "DEBIT", isContra: false },
  { code: "2000", name: "ذمم الموردين", nameEn: "Accounts Payable", type: "LIABILITY", normalBalance: "CREDIT", isContra: false },
  { code: "2100", name: "رواتب مستحقة", nameEn: "Salaries Payable", type: "LIABILITY", normalBalance: "CREDIT", isContra: false },
  { code: "3000", name: "رأس مال المالك", nameEn: "Owner Equity", type: "EQUITY", normalBalance: "CREDIT", isContra: false },
  { code: "3100", name: "مسحوبات المالك", nameEn: "Owner Drawings", type: "EQUITY", normalBalance: "DEBIT", isContra: true },
  { code: "4000", name: "إيرادات المبيعات", nameEn: "Sales Revenue", type: "REVENUE", normalBalance: "CREDIT", isContra: false },
  { code: "4100", name: "مردودات المبيعات", nameEn: "Sales Returns", type: "REVENUE", normalBalance: "DEBIT", isContra: true },
  { code: "5000", name: "تكلفة البضاعة المباعة", nameEn: "COGS", type: "EXPENSE", normalBalance: "DEBIT", isContra: false },
  { code: "5100", name: "مصاريف تشغيلية", nameEn: "Operating Expenses", type: "EXPENSE", normalBalance: "DEBIT", isContra: false },
  { code: "5200", name: "مصروف الرواتب", nameEn: "Salary Expense", type: "EXPENSE", normalBalance: "DEBIT", isContra: false },
  { code: "6000", name: "فروق الخزينة", nameEn: "Treasury Variance", type: "EQUITY", normalBalance: "CREDIT", isContra: false },
];

type TreasuryType = "CASH" | "CARD" | "INSTAPAY" | "WALLET" | "MAIN_SAFE";

// Treasury drawer → chart-of-accounts code. Used by treasury postings that also
// need to hit the matching asset account in the general ledger.
export const TREASURY_TYPE_TO_ACCOUNT_CODE: Record<TreasuryType, string> = {
  CASH: "1000",
  MAIN_SAFE: "1001",
  CARD: "1010",
  INSTAPAY: "1020",
  WALLET: "1030",
};

// Cashier-owned account types (one set per user)
const CASHIER_ACCOUNT_TYPES: { type: TreasuryType; nameTemplate: string }[] = [
  { type: "CASH", nameTemplate: "درج الكاشير" },
  { type: "CARD", nameTemplate: "البطاقات" },
  { type: "INSTAPAY", nameTemplate: "إنستا باي" },
  { type: "WALLET", nameTemplate: "المحفظة" },
];

// Idempotently provisions every per-store financial prerequisite: chart of
// accounts, the store-level MAIN_SAFE treasury account, and a settings row.
// Safe to call on every financial request.
export async function ensureStoreFinancials(dbc: DbLike, storeId: string): Promise<void> {
  await dbc
    .insert(accountingAccountsTable)
    .values(
      CHART_OF_ACCOUNTS.map((c) => ({
        storeId,
        code: c.code,
        name: c.name,
        nameEn: c.nameEn,
        type: c.type,
        normalBalance: c.normalBalance,
        isContra: c.isContra,
      })),
    )
    .onConflictDoNothing();

  // Seed the store-level MAIN_SAFE (user_id = NULL) if it doesn't exist
  const [existingMainSafe] = await (dbc as typeof db)
    .select({ id: treasuryAccountsTable.id })
    .from(treasuryAccountsTable)
    .where(
      and(
        eq(treasuryAccountsTable.storeId, storeId),
        eq(treasuryAccountsTable.type, "MAIN_SAFE"),
        isNull(treasuryAccountsTable.userId)
      )
    )
    .limit(1);

  if (!existingMainSafe) {
    await dbc
      .insert(treasuryAccountsTable)
      .values({ storeId, type: "MAIN_SAFE", name: "الخزينة الرئيسية", userId: null })
      .onConflictDoNothing();
  }

  await dbc.insert(storeSettingsTable).values({ storeId }).onConflictDoNothing();
}

// Idempotently creates CASH, CARD, INSTAPAY, WALLET accounts for a specific cashier.
// Safe to call before any sale or session operation.
export async function ensureCashierAccounts(
  dbc: DbLike,
  storeId: string,
  userId: string,
  userName?: string,
): Promise<void> {
  const existingAccounts = await (dbc as typeof db)
    .select({ type: treasuryAccountsTable.type })
    .from(treasuryAccountsTable)
    .where(
      and(
        eq(treasuryAccountsTable.storeId, storeId),
        eq(treasuryAccountsTable.userId, userId)
      )
    );
  
  const existingTypes = new Set(existingAccounts.map((a) => a.type));

  for (const acctDef of CASHIER_ACCOUNT_TYPES) {
    if (!existingTypes.has(acctDef.type)) {
      await dbc
        .insert(treasuryAccountsTable)
        .values({
          storeId,
          userId,
          type: acctDef.type,
          name: userName ? `${acctDef.nameTemplate} — ${userName}` : acctDef.nameTemplate,
        })
        .onConflictDoNothing();
    }
  }
}

// Resolves the correct treasury account ID for a given account type and user.
// For MAIN_SAFE: returns the store-level account (user_id IS NULL).
// For others: returns the cashier's personal account.
// Creates the account if it doesn't exist yet.
export async function resolveTreasuryAccount(
  dbc: DbLike,
  storeId: string,
  type: TreasuryType,
  userId: string | null,
): Promise<string> {
  if (type === "MAIN_SAFE" || userId === null) {
    // Store-level account
    const [acct] = await (dbc as typeof db)
      .select({ id: treasuryAccountsTable.id })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, type),
          isNull(treasuryAccountsTable.userId),
        ),
      )
      .limit(1);
    if (!acct) throw new Error(`TREASURY_ACCOUNT_NOT_FOUND:${type}`);
    return acct.id;
  }

  // Cashier-level account
  const [acct] = await (dbc as typeof db)
    .select({ id: treasuryAccountsTable.id })
    .from(treasuryAccountsTable)
    .where(
      and(
        eq(treasuryAccountsTable.storeId, storeId),
        eq(treasuryAccountsTable.type, type),
        eq(treasuryAccountsTable.userId, userId),
      ),
    )
    .limit(1);

  if (!acct) {
    // Lazily provision cashier accounts
    await ensureCashierAccounts(dbc, storeId, userId);
    const [newAcct] = await (dbc as typeof db)
      .select({ id: treasuryAccountsTable.id })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, type),
          eq(treasuryAccountsTable.userId, userId),
        ),
      )
      .limit(1);
    if (!newAcct) throw new Error(`TREASURY_ACCOUNT_NOT_FOUND:${type}`);
    return newAcct.id;
  }

  return acct.id;
}
