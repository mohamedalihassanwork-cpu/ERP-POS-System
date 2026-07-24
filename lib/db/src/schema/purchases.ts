import crypto from "crypto";
import { index, integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { paymentMethodEnum } from "./sales";
import { productVariantsTable } from "./products";
import { storesTable } from "./stores";
import { suppliersTable } from "./suppliers";
import { treasuryAccountsTable } from "./treasury";
import { usersTable } from "./users";
import { warehousesTable } from "./warehouses";

export const purchaseStatusEnum = ["DRAFT", "CONFIRMED", "PARTIAL", "PAID"] as const;
export const purchaseReturnStatusEnum = ["NONE", "PARTIAL", "FULL"] as const;

// Purchase invoice header. Receives stock into one warehouse. May be paid now
// (full/partial) or fully on credit (increases supplier balance).
export const purchaseInvoicesTable = sqliteTable(
  "purchase_invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull(),
    supplierInvoiceNumber: text("supplier_invoice_number"),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "restrict" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    invoiceDate: text("invoice_date"),
    dueDate: text("due_date"),
    subtotal: text("subtotal").notNull().default("0"),
    taxAmount: text("tax_amount").notNull().default("0"),
    totalAmount: text("total_amount").notNull().default("0"),
    amountPaid: text("amount_paid").notNull().default("0"),
    remainingBalance: text("remaining_balance").notNull().default("0"),
    status: text("status", { enum: purchaseStatusEnum }).notNull().default("CONFIRMED"),
    returnStatus: text("return_status", { enum: purchaseReturnStatusEnum }).notNull().default("NONE"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_invoices_store_number_unique").on(table.storeId, table.invoiceNumber),
    index("purchase_invoices_store_created_idx").on(table.storeId, table.createdAt),
    index("purchase_invoices_supplier_idx").on(table.supplierId),
  ],
);

export const purchaseInvoiceItemsTable = sqliteTable(
  "purchase_invoice_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchaseInvoicesTable.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    costPrice: text("cost_price").notNull(),
    lineTotal: text("line_total").notNull(),
    returnedQuantity: integer("returned_quantity").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("purchase_items_purchase_idx").on(table.purchaseId),
    index("purchase_items_variant_idx").on(table.variantId),
  ],
);

export const purchasePaymentsTable = sqliteTable(
  "purchase_payments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchaseInvoicesTable.id, { onDelete: "cascade" }),
    method: text("method", { enum: paymentMethodEnum }).notNull(),
    treasuryAccountId: text("treasury_account_id").references(() => treasuryAccountsTable.id, {
      onDelete: "restrict",
    }),
    amount: text("amount").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("purchase_payments_purchase_idx").on(table.purchaseId)],
);

export const purchaseReturnsTable = sqliteTable(
  "purchase_returns",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    returnNumber: text("return_number").notNull(),
    purchaseId: text("purchase_id")
      .notNull()
      .references(() => purchaseInvoicesTable.id, { onDelete: "restrict" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    totalAmount: text("total_amount").notNull().default("0"),
    reason: text("reason"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_returns_store_number_unique").on(table.storeId, table.returnNumber),
    index("purchase_returns_purchase_idx").on(table.purchaseId),
  ],
);

export const purchaseReturnItemsTable = sqliteTable(
  "purchase_return_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    returnId: text("return_id")
      .notNull()
      .references(() => purchaseReturnsTable.id, { onDelete: "cascade" }),
    purchaseItemId: text("purchase_item_id")
      .notNull()
      .references(() => purchaseInvoiceItemsTable.id, { onDelete: "restrict" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    costPrice: text("cost_price").notNull(),
    lineTotal: text("line_total").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("purchase_return_items_return_idx").on(table.returnId)],
);

export type PurchaseInvoice = typeof purchaseInvoicesTable.$inferSelect;
export type InsertPurchaseInvoice = typeof purchaseInvoicesTable.$inferInsert;
export type PurchaseInvoiceItem = typeof purchaseInvoiceItemsTable.$inferSelect;
export type InsertPurchaseInvoiceItem = typeof purchaseInvoiceItemsTable.$inferInsert;
export type PurchasePayment = typeof purchasePaymentsTable.$inferSelect;
export type InsertPurchasePayment = typeof purchasePaymentsTable.$inferInsert;
export type PurchaseReturn = typeof purchaseReturnsTable.$inferSelect;
export type InsertPurchaseReturn = typeof purchaseReturnsTable.$inferInsert;
export type PurchaseReturnItem = typeof purchaseReturnItemsTable.$inferSelect;
export type InsertPurchaseReturnItem = typeof purchaseReturnItemsTable.$inferInsert;
