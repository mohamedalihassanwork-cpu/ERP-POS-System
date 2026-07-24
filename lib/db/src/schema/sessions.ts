import crypto from "crypto";
import { index, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { storesTable } from "./stores";
import { usersTable } from "./users";

// Refresh-token sessions. Only a hash of the refresh token is stored. Tokens
// are rotated on each use (old session revoked, new one created).
export const sessionsTable = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text("store_id")
      .notNull()
      .references(() => storesTable.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_token_hash_idx").on(table.refreshTokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
