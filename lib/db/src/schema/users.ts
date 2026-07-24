import crypto from "crypto";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { rolesTable } from "./roles";
import { storesTable } from "./stores";

// Application users. Username is unique per store. Passwords are stored as
// bcrypt hashes only. Account lockout fields support the 5-failures/15-minutes
// rule. Users are soft-deleted to preserve historical references.
export const usersTable = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    roleId: text("role_id")
      .notNull()
      .references(() => rolesTable.id, { onDelete: "restrict" }),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    email: text("email"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    isDeleted: integer("is_deleted", { mode: 'boolean' }).notNull().default(false),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("users_store_username_unique").on(table.storeId, table.username)],
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
