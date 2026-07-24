import crypto from "crypto";
import { integer, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { brandsTable, categoriesTable, colorsTable, sizesTable } from "./catalog";
import { storesTable } from "./stores";

// Base product definition. A product groups one or more variants (size+color
// combinations). Quantities live on inventory_items, never here. Soft-deleted
// via `isActive`; cannot be hard-deleted once it has variants with history.
export const productsTable = sqliteTable(
  "products",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    nameEn: text("name_en"),
    categoryId: text("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict" }),
    brandId: text("brand_id").references(() => brandsTable.id, { onDelete: "restrict" }),
    description: text("description"),
    basePrice: text("base_price").notNull().default("0"),
    baseCostPrice: text("base_cost_price").notNull().default("0"),
    reorderPoint: integer("reorder_point").notNull().default(0),
    barcode: text("barcode"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("products_store_name_idx").on(table.storeId, table.name),
    index("products_store_category_idx").on(table.storeId, table.categoryId),
  ],
);

// A specific size+color combination of a product, with its own SKU/barcode and
// optional price overrides (null = inherit the product base price/cost).
export const productVariantsTable = sqliteTable(
  "product_variants",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    colorId: text("color_id")
      .notNull()
      .references(() => colorsTable.id, { onDelete: "restrict" }),
    sizeId: text("size_id")
      .notNull()
      .references(() => sizesTable.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    barcode: text("barcode").notNull(),
    sellingPrice: text("selling_price"),
    costPrice: text("cost_price"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("variants_store_sku_unique").on(table.storeId, table.sku),
    uniqueIndex("variants_store_barcode_unique").on(table.storeId, table.barcode),
    uniqueIndex("variants_product_color_size_unique").on(table.productId, table.colorId, table.sizeId),
    index("variants_product_idx").on(table.productId),
  ],
);

export type Product = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
export type InsertProductVariant = typeof productVariantsTable.$inferInsert;
