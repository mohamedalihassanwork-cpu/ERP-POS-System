import crypto from "crypto";
import { integer, index, text, sqliteTable } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";

// Suppliers are required for all purchases. currentBalance is what the store
// owes the supplier (a payable); kept in sync with supplier_transactions.
export const suppliersTable = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address"),
    taxNumber: text("tax_number"),
    // Positive balance = store owes the supplier.
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
    index("suppliers_store_name_idx").on(table.storeId, table.name),
    index("suppliers_store_phone_idx").on(table.storeId, table.phone),
  ],
);

export const supplierTxTypeEnum = [
  "PURCHASE",
  "PAYMENT",
  "RETURN",
  "OPENING_BALANCE",
  "ADJUSTMENT",
] as const;

// Immutable running-balance ledger for a supplier. credit increases what the
// store owes; debit (payment/return) decreases it. balanceAfter is the payable.
export const supplierTransactionsTable = sqliteTable(
  "supplier_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: supplierTxTypeEnum }).notNull(),
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
    index("supplier_tx_supplier_idx").on(table.supplierId, table.createdAt),
    index("supplier_tx_store_idx").on(table.storeId),
  ],
);

export type Supplier = typeof suppliersTable.$inferSelect;
export type InsertSupplier = typeof suppliersTable.$inferInsert;
export type SupplierTransaction = typeof supplierTransactionsTable.$inferSelect;
export type InsertSupplierTransaction = typeof supplierTransactionsTable.$inferInsert;
