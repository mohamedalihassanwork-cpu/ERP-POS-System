import crypto from "crypto";
import { integer, index, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";
import { treasuryAccountsTable } from "./treasury";

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const associationStatusEnum = ["ACTIVE", "CLOSED"] as const;

export const associationContributionFrequencyEnum = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
  "NONE",
] as const;

export const associationTransactionTypeEnum = ["WITHDRAWAL", "RETURN"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// associations table
//
// One row per savings association (ROSCA / rotating savings group).
// NOTE: balance, totalWithdrawals, totalReturns are NOT stored here.
//       They are always computed dynamically from association_transactions
//       to prevent data inconsistency and maintain a single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
export const associationsTable = sqliteTable(
  "associations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    // Dates stored as "YYYY-MM-DD" strings for SQLite compatibility
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    // When the business expects money to be returned from this association
    expectedReturnDate: text("expected_return_date"),
    status: text("status", { enum: associationStatusEnum }).notNull().default("ACTIVE"),
    // Optional fixed-schedule contribution metadata (informational only)
    contributionFrequency: text("contribution_frequency", {
      enum: associationContributionFrequencyEnum,
    })
      .notNull()
      .default("NONE"),
    contributionAmount: text("contribution_amount"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("associations_store_idx").on(table.storeId, table.status),
    uniqueIndex("associations_store_name_unique").on(table.storeId, table.name),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// association_transactions table
//
// Immutable ledger of every withdrawal and return for an association.
//
// Accounting effect:
//   WITHDRAWAL → Treasury OUT (cash leaves the register) + Association receivable increases
//   RETURN     → Treasury IN  (cash re-enters the register) + Association receivable decreases
//
// Financial records are NEVER deleted. Mistakes are corrected by posting a
// Reverse Transaction (an opposite entry) via the reverse endpoint.
// The isReversed / reversalOfId columns maintain the audit trail.
// ─────────────────────────────────────────────────────────────────────────────
export const associationTransactionsTable = sqliteTable(
  "association_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    associationId: text("association_id")
      .notNull()
      .references(() => associationsTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: associationTransactionTypeEnum }).notNull(),
    amount: text("amount").notNull(),
    transactionDate: text("transaction_date").notNull(), // "YYYY-MM-DD"
    // The treasury account from which money was withdrawn / returned to
    treasuryAccountId: text("treasury_account_id")
      .notNull()
      .references(() => treasuryAccountsTable.id, { onDelete: "restrict" }),
    referenceNumber: text("reference_number"),
    notes: text("notes"),
    // Reversal tracking — financial records are NEVER deleted
    isReversed: integer("is_reversed", { mode: "boolean" }).notNull().default(false),
    // If this row IS a reversal, this points to the original transaction
    reversalOfId: text("reversal_of_id"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("assoc_tx_association_idx").on(table.associationId, table.transactionDate),
    index("assoc_tx_store_idx").on(table.storeId, table.createdAt),
    index("assoc_tx_treasury_idx").on(table.treasuryAccountId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────────────────────
export type Association = typeof associationsTable.$inferSelect;
export type InsertAssociation = typeof associationsTable.$inferInsert;
export type AssociationTransaction = typeof associationTransactionsTable.$inferSelect;
export type InsertAssociationTransaction = typeof associationTransactionsTable.$inferInsert;
