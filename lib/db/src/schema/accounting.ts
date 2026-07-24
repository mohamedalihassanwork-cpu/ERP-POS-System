import crypto from "crypto";
import { integer, index, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";

export const accountTypeEnum = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

export const normalBalanceEnum = ["DEBIT", "CREDIT"] as const;

// Chart of accounts. Seeded per store from a fixed catalog (codes 1000..5200).
// `code` is the stable accounting code used by posting logic.
export const accountingAccountsTable = sqliteTable(
  "accounting_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    type: text("type", { enum: accountTypeEnum }).notNull(),
    normalBalance: text("normal_balance", { enum: normalBalanceEnum }).notNull(),
    isContra: integer("is_contra", { mode: 'boolean' }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("accounting_accounts_store_code_unique").on(table.storeId, table.code)],
);

// Journal entry header. Every financial event creates one of these with two or
// more balanced debit/credit lines.
export const accountingTransactionsTable = sqliteTable(
  "accounting_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    entryDate: integer("entry_date", { mode: "timestamp_ms" }).notNull().defaultNow(),
    description: text("description"),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("accounting_tx_store_date_idx").on(table.storeId, table.entryDate),
    index("accounting_tx_reference_idx").on(table.referenceId, table.referenceType),
  ],
);

// Individual debit/credit line of a journal entry. Sum(debit) === Sum(credit)
// per transaction is enforced by the posting helper.
export const accountingTransactionLinesTable = sqliteTable(
  "accounting_transaction_lines",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => accountingTransactionsTable.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accountingAccountsTable.id, { onDelete: "restrict" }),
    debit: text("debit").notNull().default("0"),
    credit: text("credit").notNull().default("0"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("accounting_lines_tx_idx").on(table.transactionId),
    index("accounting_lines_account_idx").on(table.accountId),
  ],
);

export type AccountingAccount = typeof accountingAccountsTable.$inferSelect;
export type InsertAccountingAccount = typeof accountingAccountsTable.$inferInsert;
export type AccountingTransaction = typeof accountingTransactionsTable.$inferSelect;
export type InsertAccountingTransaction = typeof accountingTransactionsTable.$inferInsert;
export type AccountingTransactionLine = typeof accountingTransactionLinesTable.$inferSelect;
export type InsertAccountingTransactionLine = typeof accountingTransactionLinesTable.$inferInsert;
