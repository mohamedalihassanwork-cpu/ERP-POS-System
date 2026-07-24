import crypto from "crypto";
import { index, integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { productVariantsTable } from "./products";
import { storesTable } from "./stores";
import { usersTable } from "./users";
import { warehousesTable } from "./warehouses";

// All ways stock can move. IN types add quantity, OUT types subtract. Phase 2
// uses ADJUSTMENT_* (manual) and STOCK_COUNT_CORRECTION; SALE/PURCHASE/TRANSFER
// types are reserved for later phases.
export const movementTypeEnum = [
  "SALE",
  "SALE_RETURN",
  "PURCHASE",
  "PURCHASE_RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "STOCK_COUNT_CORRECTION",
] as const;

// Cached current stock per variant per warehouse. The authoritative history is
// inventory_movements; this row is kept in sync inside the same transaction as
// each movement so reads stay fast.
export const inventoryItemsTable = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("inventory_items_variant_warehouse_unique").on(table.variantId, table.warehouseId),
    index("inventory_items_store_idx").on(table.storeId),
  ],
);

// Immutable append-only ledger of every stock change. Never updated or deleted.
export const inventoryMovementsTable = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: movementTypeEnum }).notNull(),
    // Signed change: positive for IN, negative for OUT.
    quantityChange: integer("quantity_change").notNull(),
    // Resulting on-hand quantity after applying this movement.
    balanceAfter: integer("balance_after").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("movements_variant_warehouse_store_idx").on(table.variantId, table.warehouseId, table.storeId),
    index("movements_reference_idx").on(table.referenceId, table.referenceType),
    index("movements_store_created_idx").on(table.storeId, table.createdAt),
  ],
);

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InsertInventoryItem = typeof inventoryItemsTable.$inferInsert;
export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
export type InsertInventoryMovement = typeof inventoryMovementsTable.$inferInsert;
