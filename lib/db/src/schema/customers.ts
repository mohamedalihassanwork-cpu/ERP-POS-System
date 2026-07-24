import crypto from "crypto";
import { integer, index, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";

// Customers are OPTIONAL in this system — most sales are anonymous walk-in cash
// sales. A customer account exists mainly to track credit (debt) and history.
// currentBalance is a cached running balance kept in sync with customer_transactions.
export const customersTable = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address"),
    creditLimit: text("credit_limit").notNull().default("0"),
    // Positive balance = customer owes the store (debt).
    currentBalance: text("current_balance").notNull().default("0"),
    notes: text("notes"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("customers_store_name_idx").on(table.storeId, table.name),
    index("customers_store_phone_idx").on(table.storeId, table.phone),
  ],
);

// What kind of ledger entry this is. INVOICE/RETURN affect debt; PAYMENT reduces it.
export const customerTxTypeEnum = [
  "INVOICE",
  "PAYMENT",
  "RETURN",
  "OPENING_BALANCE",
  "ADJUSTMENT",
] as const;

// Immutable running-balance ledger for a customer. debit increases what the
// customer owes; credit decreases it. balanceAfter is the resulting debt.
export const customerTransactionsTable = sqliteTable(
  "customer_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: customerTxTypeEnum }).notNull(),
    debit: text("debit").notNull().default("0"),
    credit: text("credit").notNull().default("0"),
    balanceAfter: text("balance_after").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    description: text("description"),
    createdBy: text("created_by"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("customer_tx_customer_idx").on(table.customerId, table.createdAt),
    index("customer_tx_store_idx").on(table.storeId),
  ],
);

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
export type CustomerTransaction = typeof customerTransactionsTable.$inferSelect;
export type InsertCustomerTransaction = typeof customerTransactionsTable.$inferInsert;
