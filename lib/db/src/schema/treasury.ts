import crypto from "crypto";
import { integer, index, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";

// The kinds of money "drawers" a store keeps.
// MAIN_SAFE: store-level (user_id = NULL)
// CASH, CARD, INSTAPAY, WALLET: per-cashier (user_id = cashier's user ID)
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
  "DAY_CLOSE_RESET",
  "DAY_OPEN_CARRY",
] as const;

export const operationalDayStatusEnum = ["OPEN", "CLOSED"] as const;

// A money drawer with a cached running balance. Every money movement in the
// whole system funnels through a treasury_transactions row against one of these.
// user_id is NULL for the store-level MAIN_SAFE; set to a cashier's user ID
// for their personal CASH/CARD/INSTAPAY/WALLET drawers.
export const treasuryAccountsTable = sqliteTable(
  "treasury_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "restrict" }),
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
  (table) => [
    // UNIQUE per (store, type, user_id). SQLite treats each NULL as distinct so
    // the store-level MAIN_SAFE (userId=NULL) won't collide with cashier rows,
    // and two different cashiers get separate sets of CASH/CARD/INSTAPAY/WALLET.
    // This constraint is what makes ensureCashierAccounts idempotent via
    // onConflictDoNothing — without UNIQUE the insert would silently create
    // duplicate rows every time (the original bug).
    uniqueIndex("treasury_accounts_store_type_user_idx").on(table.storeId, table.type, table.userId),
    index("treasury_accounts_store_user_idx").on(table.storeId, table.userId),
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
    operationalDayId: text("operational_day_id"),
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
    index("treasury_tx_opday_idx").on(table.operationalDayId),
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

// Formal operational day per cashier. Replaces the old treasury_sessions concept
// for CASH accounts. Each cashier opens one operational day per shift.
export const operationalDaysTable = sqliteTable(
  "operational_days",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    status: text("status", { enum: operationalDayStatusEnum }).notNull().default("OPEN"),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    // CASH drawer figures
    openingCashBalance: text("opening_cash_balance").notNull().default("0"),
    carryOverCash: text("carry_over_cash").notNull().default("0"),
    actualClosingCashBalance: text("actual_closing_cash_balance"),
    expectedClosingCashBalance: text("expected_closing_cash_balance"),
    cashVariance: text("cash_variance"),
    // Totals for all 4 cashier accounts (computed at close)
    totalTransferredToMainSafe: text("total_transferred_to_main_safe").notNull().default("0"),
    notes: text("notes"),
    openedBy: text("opened_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    closedBy: text("closed_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("op_days_store_user_idx").on(table.storeId, table.userId),
    index("op_days_store_status_idx").on(table.storeId, table.status),
    index("op_days_store_created_idx").on(table.storeId, table.createdAt),
  ],
);

// Balance snapshot for each of the cashier's 4 accounts at day open/close.
export const cashierBalanceSnapshotsTable = sqliteTable(
  "cashier_balance_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    operationalDayId: text("operational_day_id")
      .notNull()
      .references(() => operationalDaysTable.id, { onDelete: "restrict" }),
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    snapshotType: text("snapshot_type", { enum: ["OPENING", "CLOSING"] }).notNull(),
    balance: text("balance").notNull().default("0"),
    totalIn: text("total_in").notNull().default("0"),
    totalOut: text("total_out").notNull().default("0"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("balance_snapshots_opday_idx").on(table.operationalDayId),
    index("balance_snapshots_account_idx").on(table.treasuryAccountId),
  ],
);

export type TreasuryAccount = typeof treasuryAccountsTable.$inferSelect;
export type InsertTreasuryAccount = typeof treasuryAccountsTable.$inferInsert;
export type TreasuryTransaction = typeof treasuryTransactionsTable.$inferSelect;
export type InsertTreasuryTransaction = typeof treasuryTransactionsTable.$inferInsert;
export type TreasuryTransfer = typeof treasuryTransfersTable.$inferSelect;
export type InsertTreasuryTransfer = typeof treasuryTransfersTable.$inferInsert;
export type TreasuryAdjustment = typeof treasuryAdjustmentsTable.$inferSelect;
export type InsertTreasuryAdjustment = typeof treasuryAdjustmentsTable.$inferInsert;
export type OperationalDay = typeof operationalDaysTable.$inferSelect;
export type InsertOperationalDay = typeof operationalDaysTable.$inferInsert;
export type CashierBalanceSnapshot = typeof cashierBalanceSnapshotsTable.$inferSelect;
export type InsertCashierBalanceSnapshot = typeof cashierBalanceSnapshotsTable.$inferInsert;
