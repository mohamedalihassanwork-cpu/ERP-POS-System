import crypto from "crypto";
import { sql } from "drizzle-orm";
import { integer, index, text, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";

export const notificationTypeEnum = [
  "LOW_STOCK",
  "NEGATIVE_TREASURY",
  "CUSTOMER_DEBT",
  "SUPPLIER_DEBT",
  "DAILY_SUMMARY",
  "SYSTEM",
] as const;

export const notificationSeverityEnum = [
  "INFO",
  "WARNING",
  "CRITICAL",
] as const;

// Per-user in-app notification. Real-time delivery is out of scope; the bell
// polls unread count. dedupeKey lets producers avoid spamming duplicates.
export const notificationsTable = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    type: text("type", { enum: notificationTypeEnum }).notNull(),
    severity: text("severity", { enum: notificationSeverityEnum }).notNull().default("INFO"),
    title: text("title").notNull(),
    body: text("body"),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    dedupeKey: text("dedupe_key"),
    isRead: integer("is_read", { mode: 'boolean' }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("notifications_user_read_idx").on(table.userId, table.isRead, table.createdAt),
    index("notifications_store_idx").on(table.storeId),
    // One active (unread) notification per dedupe key per user. Marking a
    // notification read frees the key so the alert can re-fire later. This also
    // makes concurrent refresh calls safe via onConflictDoNothing.
    uniqueIndex("notifications_active_dedupe_idx")
      .on(table.userId, table.dedupeKey)
      .where(sql`${table.isRead} = false AND ${table.dedupeKey} IS NOT NULL`),
  ],
);

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
