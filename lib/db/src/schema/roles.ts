import crypto from "crypto";
import { integer, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";

// Per-store roles. `permissions` is a JSONB array of permission keys from the
// shared catalog (@workspace/shared). System roles are seeded on setup and
// cannot be deleted.
export const rolesTable = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    permissions: text("permissions", { mode: 'json' }).$type<string[]>().notNull().default([]),
    isSystem: integer("is_system", { mode: 'boolean' }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("roles_store_name_unique").on(table.storeId, table.name)],
);

export type Role = typeof rolesTable.$inferSelect;
export type InsertRole = typeof rolesTable.$inferInsert;
