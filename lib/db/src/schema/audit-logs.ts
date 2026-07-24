import crypto from "crypto";
import { index, text, sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";

// Immutable audit trail. The application never issues UPDATE or DELETE on this
// table. `userId` may be null for events with no authenticated actor (e.g. a
// failed login for an unknown username).
export const auditLogsTable = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    oldValue: text("old_value", { mode: 'json' }),
    newValue: text("new_value", { mode: 'json' }),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_store_entity_idx").on(
      table.storeId,
      table.entityType,
      table.entityId,
    ),
    index("audit_logs_store_created_idx").on(table.storeId, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
