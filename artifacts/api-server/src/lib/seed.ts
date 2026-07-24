import {
  db,
  accountingAccountsTable,
  treasuryAccountsTable,
  storeSettingsTable,
} from "@workspace/db";

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

const TREASURY_ACCOUNTS: { type: TreasuryType; name: string }[] = [
  { type: "CASH", name: "درج الكاشير" },
  { type: "MAIN_SAFE", name: "الخزينة الرئيسية" },
  { type: "CARD", name: "البطاقات" },
  { type: "INSTAPAY", name: "إنستا باي" },
  { type: "WALLET", name: "المحفظة" },
];

// Treasury drawer → chart-of-accounts code. Used by treasury postings that also
// need to hit the matching asset account in the general ledger.
export const TREASURY_TYPE_TO_ACCOUNT_CODE: Record<TreasuryType, string> = {
  CASH: "1000",
  MAIN_SAFE: "1001",
  CARD: "1010",
  INSTAPAY: "1020",
  WALLET: "1030",
};

// Idempotently provisions every per-store financial prerequisite: chart of
// accounts, the four treasury drawers, and a settings row. Safe to call on every
// financial request — conflicts on the per-store unique indexes are ignored.
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

  await dbc
    .insert(treasuryAccountsTable)
    .values(TREASURY_ACCOUNTS.map((t) => ({ storeId, type: t.type, name: t.name })))
    .onConflictDoNothing();

  await dbc.insert(storeSettingsTable).values({ storeId }).onConflictDoNothing();
}
