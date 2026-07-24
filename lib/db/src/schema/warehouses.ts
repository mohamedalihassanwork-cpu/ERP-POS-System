import crypto from "crypto";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";

// Storage locations. Each store can have multiple warehouses; inventory is
// tracked per warehouse. Warehouses with stock cannot be deleted (RESTRICT via
// inventory_items FK) — they are soft-deleted via `isActive`.
export const warehousesTable = sqliteTable(
  "warehouses",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    code: text("code"),
    address: text("address"),
    isDefault: integer("is_default", { mode: 'boolean' }).notNull().default(false),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("warehouses_store_name_unique").on(table.storeId, table.name)],
);

export type Warehouse = typeof warehousesTable.$inferSelect;
export type InsertWarehouse = typeof warehousesTable.$inferInsert;
