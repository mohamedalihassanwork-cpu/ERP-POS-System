import crypto from "crypto";
import { integer, index, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";

// The kinds of money "drawers" a store keeps. One account per type per store.
export const treasuryAccountTypeEnum = [
  "CASH",
  "CARD",
  "INSTAPAY",
  "WALLET",
  "MAIN_SAFE",
] as const;

export const treasuryTxDirectionEnum = ["IN", "OUT"] as const;

export const treasuryRefTypeEnum = [
  "SALE",
  "SALES_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
  "EXPENSE",
  "EXPENSE_REVERSAL",
  "SALARY",
  "SALARY_REVERSAL",
  "WITHDRAWAL",
  "WITHDRAWAL_REVERSAL",
  "DEPOSIT",
  "DEPOSIT_REVERSAL",
  "CUSTOMER_PAYMENT",
  "SUPPLIER_PAYMENT",
  "OPENING",
  "TRANSFER",
  "ADJUSTMENT",
] as const;

export const treasurySessionStatusEnum = ["OPEN", "CLOSED"] as const;

// A money drawer with a cached running balance. Every money movement in the
// whole system funnels through a treasury_transactions row against one of these.
export const treasuryAccountsTable = sqliteTable(
  "treasury_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: treasuryAccountTypeEnum }).notNull(),
    name: text("name").notNull(),
    balance: text("balance").notNull().default("0"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("treasury_accounts_store_type_unique").on(table.storeId, table.type)],
);

// A daily cash-management shift. Opened with a counted opening balance; closed
// with a counted actual balance, recording any variance vs. the expected total.
export const treasurySessionsTable = sqliteTable(
  "treasury_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    status: text("status", { enum: treasurySessionStatusEnum }).notNull().default("OPEN"),
    openingBalance: text("opening_balance").notNull().default("0"),
    expectedClosingBalance: text("expected_closing_balance"),
    actualClosingBalance: text("actual_closing_balance"),
    variance: text("variance"),
    notes: text("notes"),
    openedBy: text("opened_by").references(() => usersTable.id, { onDelete: "restrict" }),
    closedBy: text("closed_by").references(() => usersTable.id, { onDelete: "restrict" }),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("treasury_sessions_account_idx").on(table.treasuryAccountId, table.status),
    index("treasury_sessions_store_idx").on(table.storeId),
  ],
);

// Immutable ledger of every money movement. balanceAfter is the account balance
// right after this transaction. Never updated or deleted.
export const treasuryTransactionsTable = sqliteTable(
  "treasury_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    sessionId: text("session_id").references(() => treasurySessionsTable.id, { onDelete: "restrict" }),
    direction: text("direction", { enum: treasuryTxDirectionEnum }).notNull(),
    amount: text("amount").notNull(),
    balanceAfter: text("balance_after").notNull(),
    referenceType: text("reference_type", { enum: treasuryRefTypeEnum }).notNull(),
    referenceId: text("reference_id"),
    description: text("description"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("treasury_tx_account_idx").on(table.treasuryAccountId, table.createdAt),
    index("treasury_tx_store_created_idx").on(table.storeId, table.createdAt),
    index("treasury_tx_reference_idx").on(table.referenceId, table.referenceType),
  ],
);

// Records an inter-account transfer for clean audit trail. Referenced by two
// treasury_transactions rows (OUT from source, IN to destination).
export const treasuryTransfersTable = sqliteTable(
  "treasury_transfers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    fromAccountId: text("from_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    toAccountId: text("to_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    amount: text("amount").notNull(),
    description: text("description"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("treasury_transfers_store_idx").on(table.storeId, table.createdAt),
  ],
);

// Records a manual treasury adjustment (reconciliation). Referenced by one
// treasury_transaction row.
export const treasuryAdjustmentsTable = sqliteTable(
  "treasury_adjustments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    direction: text("direction", { enum: treasuryTxDirectionEnum }).notNull(),
    amount: text("amount").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("treasury_adjustments_store_idx").on(table.storeId, table.createdAt),
  ],
);

export type TreasuryAccount = typeof treasuryAccountsTable.$inferSelect;
export type InsertTreasuryAccount = typeof treasuryAccountsTable.$inferInsert;
export type TreasurySession = typeof treasurySessionsTable.$inferSelect;
export type InsertTreasurySession = typeof treasurySessionsTable.$inferInsert;
export type TreasuryTransaction = typeof treasuryTransactionsTable.$inferSelect;
export type InsertTreasuryTransaction = typeof treasuryTransactionsTable.$inferInsert;
export type TreasuryTransfer = typeof treasuryTransfersTable.$inferSelect;
export type InsertTreasuryTransfer = typeof treasuryTransfersTable.$inferInsert;
export type TreasuryAdjustment = typeof treasuryAdjustmentsTable.$inferSelect;
export type InsertTreasuryAdjustment = typeof treasuryAdjustmentsTable.$inferInsert;
