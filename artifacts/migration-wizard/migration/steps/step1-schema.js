'use strict';

/**
 * Step 1 — Schema DDL Migrations (v2 through v6)
 * All operations are async using @libsql/client.
 */
async function applySchemaChanges(db, choices, logger) {
  logger.step('Applying schema migrations v2–v6...');

  // ── v2: store_settings.shift_start_hour ───────────────────────────────────
  logger.info('[v2] Checking store_settings.shift_start_hour...');
  const shiftColRes = await db.execute("PRAGMA table_info('store_settings')");
  const hasShiftHour = shiftColRes.rows.some(r => (r[1] ?? r.name) === 'shift_start_hour');

  if (!hasShiftHour) {
    await db.execute(`ALTER TABLE store_settings ADD COLUMN shift_start_hour INTEGER NOT NULL DEFAULT 11`);
    logger.info('[v2] ✓ Added shift_start_hour column');
  } else {
    logger.info('[v2] ✓ shift_start_hour already exists — skipped');
  }

  const shiftHour = Number(choices.shiftStartHour ?? 11);
  await db.execute({ sql: `UPDATE store_settings SET shift_start_hour = ?`, args: [shiftHour] });
  logger.info(`[v2] ✓ shift_start_hour set to ${shiftHour}`);

  // ── v3a: treasury_accounts.user_id ────────────────────────────────────────
  logger.info('[v3] Checking treasury_accounts.user_id...');
  const taColRes = await db.execute("PRAGMA table_info('treasury_accounts')");
  const hasTaUserId = taColRes.rows.some(r => (r[1] ?? r.name) === 'user_id');

  if (!hasTaUserId) {
    await db.execute(`ALTER TABLE treasury_accounts ADD COLUMN user_id TEXT REFERENCES users(id)`);
    logger.info('[v3] ✓ Added user_id to treasury_accounts');
  } else {
    logger.info('[v3] ✓ user_id already exists — skipped');
  }

  // ── v3b: treasury_accounts indexes ────────────────────────────────────────
  try { await db.execute(`DROP INDEX IF EXISTS treasury_accounts_store_type_unique`); } catch (_) {}
  await db.execute(`CREATE INDEX IF NOT EXISTS treasury_accounts_store_type_user_idx ON treasury_accounts (store_id, type, user_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS treasury_accounts_store_user_idx ON treasury_accounts (store_id, user_id)`);
  logger.info('[v3] ✓ treasury_accounts indexes created');

  // ── v3c: treasury_transactions.operational_day_id ─────────────────────────
  logger.info('[v3] Checking treasury_transactions.operational_day_id...');
  const txColRes = await db.execute("PRAGMA table_info('treasury_transactions')");
  const hasTxOpDayId = txColRes.rows.some(r => (r[1] ?? r.name) === 'operational_day_id');

  if (!hasTxOpDayId) {
    await db.execute(`ALTER TABLE treasury_transactions ADD COLUMN operational_day_id TEXT`);
    await db.execute(`CREATE INDEX IF NOT EXISTS treasury_tx_opday_idx ON treasury_transactions (operational_day_id)`);
    logger.info('[v3] ✓ Added operational_day_id + index to treasury_transactions');
  } else {
    logger.info('[v3] ✓ operational_day_id already exists — skipped');
  }

  // ── v4: operational_days table ─────────────────────────────────────────────
  logger.info('[v4] Creating operational_days table...');
  await db.execute(`
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
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS op_days_store_user_idx    ON operational_days (store_id, user_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS op_days_store_status_idx  ON operational_days (store_id, status)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS op_days_store_created_idx ON operational_days (store_id, created_at)`);
  logger.info('[v4] ✓ operational_days table created');

  // ── v5: cashier_balance_snapshots table ───────────────────────────────────
  logger.info('[v5] Creating cashier_balance_snapshots table...');
  await db.execute(`
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
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS balance_snapshots_opday_idx   ON cashier_balance_snapshots (operational_day_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS balance_snapshots_account_idx ON cashier_balance_snapshots (treasury_account_id)`);
  logger.info('[v5] ✓ cashier_balance_snapshots table created');

  // ── v6: treasury_accounts unique index fix ─────────────────────────────────
  logger.info('[v6] Applying treasury_accounts unique index fix...');
  await db.execute(`
    DELETE FROM treasury_accounts
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM treasury_accounts
      GROUP BY store_id, type, COALESCE(user_id, '')
    )
  `);
  await db.execute(`DROP INDEX IF EXISTS treasury_accounts_store_type_user_idx`);
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS treasury_accounts_store_type_user_idx
    ON treasury_accounts (store_id, type, user_id)
  `);
  logger.info('[v6] ✓ treasury_accounts unique index (re)created');
  logger.info('✅ All schema migrations applied successfully');
}

module.exports = { applySchemaChanges };
