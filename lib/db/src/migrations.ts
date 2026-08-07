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
  {
    version: 2,
    name: "store_settings_shift_start_hour",
    up: async (client) => {
      // Add configurable operational day start hour to store_settings
      const cols = await client.execute(`PRAGMA table_info(store_settings);`);
      const hasCol = cols.rows.some((r: any) => r.name === "shift_start_hour");
      if (!hasCol) {
        await client.execute(
          `ALTER TABLE store_settings ADD COLUMN shift_start_hour INTEGER NOT NULL DEFAULT 11;`,
        );
      }
    },
  },
  {
    version: 3,
    name: "treasury_accounts_per_cashier",
    up: async (client) => {
      // 1. Add user_id column to treasury_accounts (nullable for MAIN_SAFE)
      const cols = await client.execute(`PRAGMA table_info(treasury_accounts);`);
      const hasUserId = cols.rows.some((r: any) => r.name === "user_id");
      if (!hasUserId) {
        await client.execute(
          `ALTER TABLE treasury_accounts ADD COLUMN user_id TEXT REFERENCES users(id);`,
        );
      }

      // 2. Drop the old unique index that prevented multiple accounts of same type
      try {
        await client.execute(
          `DROP INDEX IF EXISTS treasury_accounts_store_type_unique;`,
        );
      } catch (_err) { /* ignore */ }

      // 3. Create new composite indexes (user_id is nullable — handled at app layer)
      await client.execute(
        `CREATE INDEX IF NOT EXISTS treasury_accounts_store_type_user_idx ON treasury_accounts (store_id, type, user_id);`,
      );
      await client.execute(
        `CREATE INDEX IF NOT EXISTS treasury_accounts_store_user_idx ON treasury_accounts (store_id, user_id);`,
      );

      // 4. Remove session_id from treasury_transactions (can't DROP COLUMN in old SQLite)
      // Add operational_day_id instead
      const txCols = await client.execute(`PRAGMA table_info(treasury_transactions);`);
      const hasOpDayId = txCols.rows.some((r: any) => r.name === "operational_day_id");
      if (!hasOpDayId) {
        await client.execute(
          `ALTER TABLE treasury_transactions ADD COLUMN operational_day_id TEXT;`,
        );
        await client.execute(
          `CREATE INDEX IF NOT EXISTS treasury_tx_opday_idx ON treasury_transactions (operational_day_id);`,
        );
      }
    },
  },
  {
    version: 4,
    name: "operational_days_table",
    up: async (client) => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS operational_days (
          id TEXT PRIMARY KEY NOT NULL,
          store_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'OPEN',
          opened_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
          closed_at INTEGER,
          opening_cash_balance TEXT NOT NULL DEFAULT '0',
          carry_over_cash TEXT NOT NULL DEFAULT '0',
          actual_closing_cash_balance TEXT,
          expected_closing_cash_balance TEXT,
          cash_variance TEXT,
          total_transferred_to_main_safe TEXT NOT NULL DEFAULT '0',
          notes TEXT,
          opened_by TEXT NOT NULL,
          closed_by TEXT,
          created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
        );
      `);
      await client.execute(
        `CREATE INDEX IF NOT EXISTS op_days_store_user_idx ON operational_days (store_id, user_id);`,
      );
      await client.execute(
        `CREATE INDEX IF NOT EXISTS op_days_store_status_idx ON operational_days (store_id, status);`,
      );
      await client.execute(
        `CREATE INDEX IF NOT EXISTS op_days_store_created_idx ON operational_days (store_id, created_at);`,
      );
    },
  },
  {
    version: 5,
    name: "cashier_balance_snapshots_table",
    up: async (client) => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS cashier_balance_snapshots (
          id TEXT PRIMARY KEY NOT NULL,
          store_id TEXT NOT NULL,
          operational_day_id TEXT NOT NULL,
          treasury_account_id TEXT NOT NULL,
          snapshot_type TEXT NOT NULL,
          balance TEXT NOT NULL DEFAULT '0',
          total_in TEXT NOT NULL DEFAULT '0',
          total_out TEXT NOT NULL DEFAULT '0',
          created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
        );
      `);
      await client.execute(
        `CREATE INDEX IF NOT EXISTS balance_snapshots_opday_idx ON cashier_balance_snapshots (operational_day_id);`,
      );
      await client.execute(
        `CREATE INDEX IF NOT EXISTS balance_snapshots_account_idx ON cashier_balance_snapshots (treasury_account_id);`,
      );
    },
  },
  {
    version: 6,
    name: "treasury_accounts_unique_index_fix",
    up: async (client) => {
      // ROOT-CAUSE FIX: the treasury_accounts_store_type_user_idx was created as
      // a plain (non-unique) index in migration v3.  SQLite's INSERT OR IGNORE /
      // onConflictDoNothing only suppresses conflicts on PRIMARY KEY and UNIQUE
      // constraints, so ensureCashierAccounts silently inserted duplicate rows on
      // every call instead of being idempotent.  This migration:
      //   1. Deduplicates existing rows (keep the one with the lowest rowid).
      //   2. Drops the old non-unique index.
      //   3. Creates a UNIQUE INDEX so INSERT OR IGNORE works correctly.

      // Step 1 — remove duplicates, keep the earliest-created row per (store, type, user)
      await client.execute(`
        DELETE FROM treasury_accounts
        WHERE rowid NOT IN (
          SELECT MIN(rowid)
          FROM treasury_accounts
          GROUP BY store_id, type, COALESCE(user_id, '')
        );
      `);

      // Step 2 — drop the old non-unique index
      await client.execute(
        `DROP INDEX IF EXISTS treasury_accounts_store_type_user_idx;`,
      );

      // Step 3 — recreate as UNIQUE so onConflictDoNothing works
      await client.execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS treasury_accounts_store_type_user_idx
         ON treasury_accounts (store_id, type, user_id);`,
      );
    },
  },
  {
    version: 7,
    name: "operational_days_variance_reason",
    up: async (client) => {
      // Add cash variance audit columns to operational_days.
      // These columns record the reason and free-text notes for any cash
      // shortage or overage detected at day close, enabling audit trails.
      const cols = await client.execute(`PRAGMA table_info(operational_days);`);
      const colNames: string[] = cols.rows.map((r: any) => r.name);

      if (!colNames.includes("cash_variance_reason")) {
        await client.execute(
          `ALTER TABLE operational_days ADD COLUMN cash_variance_reason TEXT;`,
        );
      }
      if (!colNames.includes("cash_variance_notes")) {
        await client.execute(
          `ALTER TABLE operational_days ADD COLUMN cash_variance_notes TEXT;`,
        );
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
