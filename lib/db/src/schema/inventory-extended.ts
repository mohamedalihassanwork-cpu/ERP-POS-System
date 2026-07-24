import crypto from "crypto";
import { index, integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { productVariantsTable } from "./products";
import { storesTable } from "./stores";
import { usersTable } from "./users";
import { warehousesTable } from "./warehouses";

// Transfers move stock between two warehouses. Per SRS §19 rule 53, the
// destination must confirm receipt before its inventory increases, so a transfer
// has a PENDING (sent, TRANSFER_OUT booked) then COMPLETED (received, TRANSFER_IN
// booked) lifecycle.
export const transferStatusEnum = ["PENDING", "COMPLETED", "CANCELLED"] as const;

export const warehouseTransfersTable = sqliteTable(
  "warehouse_transfers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    transferNumber: text("transfer_number").notNull(),
    fromWarehouseId: text("from_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    toWarehouseId: text("to_warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    status: text("status", { enum: transferStatusEnum }).notNull().default("PENDING"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    confirmedBy: text("confirmed_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("warehouse_transfers_store_number_unique").on(table.storeId, table.transferNumber),
    index("warehouse_transfers_store_idx").on(table.storeId, table.createdAt),
  ],
);

export const warehouseTransferItemsTable = sqliteTable(
  "warehouse_transfer_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    transferId: text("transfer_id")
      .notNull()
      .references(() => warehouseTransfersTable.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("warehouse_transfer_items_transfer_idx").on(table.transferId)],
);

// Physical stock-count session. Per SRS §19 rule 54 corrections need manager
// approval; applying the count books STOCK_COUNT_CORRECTION movements.
export const stockCountStatusEnum = [
  "OPEN",
  "COMPLETED",
  "CANCELLED",
] as const;

export const stockCountsTable = sqliteTable(
  "stock_counts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    countNumber: text("count_number").notNull(),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehousesTable.id, { onDelete: "restrict" }),
    status: text("status", { enum: stockCountStatusEnum }).notNull().default("OPEN"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    approvedBy: text("approved_by").references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("stock_counts_store_number_unique").on(table.storeId, table.countNumber),
    index("stock_counts_store_idx").on(table.storeId, table.createdAt),
  ],
);

export const stockCountItemsTable = sqliteTable(
  "stock_count_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    countId: text("count_id")
      .notNull()
      .references(() => stockCountsTable.id, { onDelete: "cascade" }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "restrict" }),
    expectedQuantity: integer("expected_quantity").notNull(),
    countedQuantity: integer("counted_quantity"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [index("stock_count_items_count_idx").on(table.countId)],
);

export type WarehouseTransfer = typeof warehouseTransfersTable.$inferSelect;
export type InsertWarehouseTransfer = typeof warehouseTransfersTable.$inferInsert;
export type WarehouseTransferItem = typeof warehouseTransferItemsTable.$inferSelect;
export type InsertWarehouseTransferItem = typeof warehouseTransferItemsTable.$inferInsert;
export type StockCount = typeof stockCountsTable.$inferSelect;
export type InsertStockCount = typeof stockCountsTable.$inferInsert;
export type StockCountItem = typeof stockCountItemsTable.$inferSelect;
export type InsertStockCountItem = typeof stockCountItemsTable.$inferInsert;
