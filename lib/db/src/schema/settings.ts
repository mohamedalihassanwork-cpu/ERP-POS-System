import crypto from "crypto";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";

// One settings row per store. Controls tax, receipt format, and the business
// rule toggles the SRS marks "configurable" (negative stock, below-cost discounts).
export const storeSettingsTable = sqliteTable(
  "store_settings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    currency: text("currency").notNull().default("EGP"),
    taxEnabled: integer("tax_enabled", { mode: 'boolean' }).notNull().default(false),
    taxRate: text("tax_rate").notNull().default("0"),
    taxInclusive: integer("tax_inclusive", { mode: 'boolean' }).notNull().default(false),
    receiptSize: text("receipt_size").notNull().default("80mm"),
    receiptFooter: text("receipt_footer"),
    numeralFormat: text("numeral_format").notNull().default("western"),
    allowNegativeStock: integer("allow_negative_stock", { mode: 'boolean' }).notNull().default(false),
    allowBelowCostDiscount: integer("allow_below_cost_discount", { mode: 'boolean' }).notNull().default(false),
    allowNegativeTreasury: integer("allow_negative_treasury", { mode: 'boolean' }).notNull().default(false),
    requireSessionForCash: integer("require_session_for_cash", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("store_settings_store_unique").on(table.storeId)],
);

// Per-store, per-document-kind monotonic counters used to generate human-friendly
// document numbers (invoices, returns, purchases, transfers, stock counts).
// Incremented with SELECT ... FOR UPDATE inside the document's transaction.
export const numberSequencesTable = sqliteTable(
  "number_sequences",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    prefix: text("prefix").notNull().default(""),
    padding: integer("padding").notNull().default(5),
    nextValue: integer("next_value").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("number_sequences_store_kind_unique").on(table.storeId, table.kind)],
);

export type StoreSettings = typeof storeSettingsTable.$inferSelect;
export type InsertStoreSettings = typeof storeSettingsTable.$inferInsert;
export type NumberSequence = typeof numberSequencesTable.$inferSelect;
export type InsertNumberSequence = typeof numberSequencesTable.$inferInsert;
