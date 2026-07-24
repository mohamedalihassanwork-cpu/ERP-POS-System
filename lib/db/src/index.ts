import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { runMigrations } from "./migrations";
import path from "path";

// Initialize SQLite database
const sqlitePath = process.env.DATABASE_URL || path.join(process.cwd(), "sqlite.db");
const sqlite = createClient({ url: `file:${sqlitePath}` });

// Run versioned migrations on boot for smooth & safe future updates
try {
  runMigrations(sqlite);
} catch (err) {
  console.error("[DB Init] Versioned migration error:", err);
}

export const db = drizzle(sqlite, { schema });

export * from "./schema";
export * from "./auto-schema";
export * from "./migrations";
