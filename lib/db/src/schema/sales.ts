import crypto from "crypto";
import { index, integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { customersTable } from "./customers";
import { productVariantsTable } from "./products";
import { storesTable } from "./stores";
import { treasuryAccountsTable } from "./treasury";
import { usersTable } from "./users";
import { warehousesTable } from "./warehouses";

// CASH = fully paid at sale; CREDIT = (partly) on the customer's account.
export const saleTypeEnum = ["CASH", "CREDIT"] as const;
export const salePaymentStatusEnum = ["PAID", "PARTIAL", "UNPAID"] as const;
export const saleReturnStatusEnum = [
  "NONE",
  "PARTIAL",
  "FULL",
] as const;
// How each payment line was tendered. CREDIT means added to customer balance.
export const paymentMethodEnum = [
  "CASH",
  "CARD",
  "INSTAPAY",
  "WALLET",
  "CREDIT",
] as const;

// Sales invoice header. invoiceNumber is a per-store sequence; invoiceBarcode is
// printed on the receipt so returns can be located by scanning.
export const invoicesTable = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceBarcode: text("invoice_barcode").notNull(),
    customerId: text("customer_id").references(() => customersTable.id, { onDelete: "restrict" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    saleType: text("sale_type", { enum: saleTypeEnum }).notNull().default("CASH"),
    subtotal: text("subtotal").notNull().default("0"),
    discountAmount: text("discount_amount").notNull().default("0"),
    taxAmount: text("tax_amount").notNull().default("0"),
    totalAmount: text("total_amount").notNull().default("0"),
    // Total cost of goods sold for this invoice (sum of line costs), for profit.
    totalCost: text("total_cost").notNull().default("0"),
    amountPaid: text("amount_paid").notNull().default("0"),
    changeDue: text("change_due").notNull().default("0"),
    paymentStatus: text("payment_status", { enum: salePaymentStatusEnum }).notNull().default("PAID"),
    returnStatus: text("return_status", { enum: saleReturnStatusEnum }).notNull().default("NONE"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_store_number_unique").on(table.storeId, table.invoiceNumber),
    uniqueIndex("invoices_store_barcode_unique").on(table.storeId, table.invoiceBarcode),
    index("invoices_store_created_idx").on(table.storeId, table.createdAt),
    index("invoices_store_customer_idx").on(table.storeId, table.customerId),
    index("invoices_created_by_idx").on(table.createdBy),
  ],
);

// One cart line. unitPrice/unitCost captured at sale time (history snapshot).
export const invoiceItemsTable = sqliteTable(
  "invoice_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPrice: text("unit_price").notNull(),
    unitCost: text("unit_cost").notNull().default("0"),
    discountAmount: text("discount_amount").notNull().default("0"),
    lineTotal: text("line_total").notNull(),
    returnedQuantity: integer("returned_quantity").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("invoice_items_invoice_idx").on(table.invoiceId),
    index("invoice_items_variant_idx").on(table.variantId),
  ],
);

// A single payment tender against an invoice. Multiple per invoice allowed.
export const invoicePaymentsTable = sqliteTable(
  "invoice_payments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    method: text("method", { enum: paymentMethodEnum }).notNull(),
    treasuryAccountId: text("treasury_account_id").references(() => treasuryAccountsTable.id, {
      onDelete: "restrict",
    }),
    amount: text("amount").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("invoice_payments_invoice_idx").on(table.invoiceId)],
);

// Sales return header, linked to the original invoice.
export const salesReturnsTable = sqliteTable(
  "sales_returns",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    returnNumber: text("return_number").notNull(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "restrict" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    totalAmount: text("total_amount").notNull().default("0"),
    totalCost: text("total_cost").notNull().default("0"),
    refundMethod: text("refund_method", { enum: paymentMethodEnum }).notNull().default("CASH"),
    treasuryAccountId: text("treasury_account_id").references(() => treasuryAccountsTable.id, {
      onDelete: "restrict",
    }),
    reason: text("reason"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sales_returns_store_number_unique").on(table.storeId, table.returnNumber),
    index("sales_returns_invoice_idx").on(table.invoiceId),
    index("sales_returns_store_created_idx").on(table.storeId, table.createdAt),
  ],
);

export const salesReturnItemsTable = sqliteTable(
  "sales_return_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    returnId: text("return_id")
      .notNull()
      .references(() => salesReturnsTable.id, { onDelete: "cascade" }),
    invoiceItemId: text("invoice_item_id")
      .notNull()
      .references(() => invoiceItemsTable.id, { onDelete: "restrict" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPrice: text("unit_price").notNull(),
    unitCost: text("unit_cost").notNull().default("0"),
    lineTotal: text("line_total").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("sales_return_items_return_idx").on(table.returnId)],
);

// A parked cart saved as JSON. Store-scoped (any cashier can resume). Does not
// touch inventory or finances until completed into a real invoice.
export const suspendedOrdersTable = sqliteTable(
  "suspended_orders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    label: text("label"),
    customerId: text("customer_id").references(() => customersTable.id, { onDelete: "restrict" }),
    cart: text("cart", { mode: 'json' }).notNull(),
    itemCount: integer("item_count").notNull().default(0),
    totalAmount: text("total_amount").notNull().default("0"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("suspended_orders_store_idx").on(table.storeId, table.createdAt)],
);

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = typeof invoicesTable.$inferInsert;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItemsTable.$inferInsert;
export type InvoicePayment = typeof invoicePaymentsTable.$inferSelect;
export type InsertInvoicePayment = typeof invoicePaymentsTable.$inferInsert;
export type SalesReturn = typeof salesReturnsTable.$inferSelect;
export type InsertSalesReturn = typeof salesReturnsTable.$inferInsert;
export type SalesReturnItem = typeof salesReturnItemsTable.$inferSelect;
export type InsertSalesReturnItem = typeof salesReturnItemsTable.$inferInsert;
export type SuspendedOrder = typeof suspendedOrdersTable.$inferSelect;
export type InsertSuspendedOrder = typeof suspendedOrdersTable.$inferInsert;
