import { FULL_SCHEMA_SQL } from "./auto-schema";

export interface Migration {
  version: number;
  name: string;
  up: (client: any) => Promise<void> | void;
}

// ── Versioned Migration Register ──────────────────────────────────────────────
// Future schema updates (v2, v3...) will be appended here.
// Each migration is guaranteed to execute atomically inside a SQLite transaction.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema_v1",
    up: async (client) => {
      const statements = FULL_SCHEMA_SQL.split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        try {
          await client.execute(stmt);
        } catch (_err) {
          // Ignore if statement already exists
        }
      }
    },
  },
];

// ── Atomic Migration Runner ───────────────────────────────────────────────────
export async function runMigrations(client: any): Promise<void> {
  try {
    // 1. Ensure migrations tracking table exists
    await client.execute(`
      CREATE TABLE IF NOT EXISTS __schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    // 2. Fetch highest applied version
    const res = await client.execute(`SELECT MAX(version) as last_version FROM __schema_migrations;`);
    const lastVersion = Number(res?.rows?.[0]?.last_version ?? 0);

    // 3. Filter pending migrations
    const pending = MIGRATIONS.filter((m) => m.version > lastVersion).sort((a, b) => a.version - b.version);

    if (pending.length === 0) {
      return;
    }

    // 4. Execute each pending migration inside an atomic SQLite Transaction block
    for (const m of pending) {
      try {
        await client.execute("BEGIN TRANSACTION;");
        await m.up(client);
        await client.execute({
          sql: `INSERT INTO __schema_migrations (version, name, applied_at) VALUES (?, ?, ?);`,
          args: [m.version, m.name, Date.now()],
        });
        await client.execute("COMMIT;");
        console.log(`[DB Migrations] Migration v${m.version} (${m.name}) applied successfully.`);
      } catch (err) {
        try {
          await client.execute("ROLLBACK;");
        } catch (_rollbackErr) {
          // Ignore if transaction was not active
        }
        console.error(`[DB Migrations] Migration v${m.version} (${m.name}) failed and was rolled back:`, err);
        throw err; // Stop executing subsequent migrations on failure
      }
    }
  } catch (err) {
    console.error("[DB Migrations] Migration runner error:", err);
  }
}
