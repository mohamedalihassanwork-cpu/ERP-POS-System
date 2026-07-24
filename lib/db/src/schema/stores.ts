import crypto from "crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Tenant root. One row per store/tenant. `isSetupComplete` gates the Setup
// Wizard — it runs only while no completed store exists.
export const storesTable = sqliteTable("stores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  currency: text("currency").notNull().default("EGP"),
  taxRate: text("tax_rate").notNull().default("0"),
  logoUrl: text("logo_url"),
  receiptPrinterWidth: text("receipt_printer_width").notNull().default("80mm"),
  receiptPaperType: text("receipt_paper_type"),
  isSetupComplete: integer("is_setup_complete", { mode: 'boolean' }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Store = typeof storesTable.$inferSelect;
export type InsertStore = typeof storesTable.$inferInsert;
