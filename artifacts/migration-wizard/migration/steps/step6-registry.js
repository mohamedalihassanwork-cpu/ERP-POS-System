'use strict';

async function updateMigrationRegistry(db, logger) {
  logger.step('Updating migration version registry...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS __schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const migrations = [
    { version: 2, name: 'store_settings_shift_start_hour' },
    { version: 3, name: 'treasury_accounts_per_cashier' },
    { version: 4, name: 'operational_days_table' },
    { version: 5, name: 'cashier_balance_snapshots_table' },
    { version: 6, name: 'treasury_accounts_unique_index_fix' },
  ];

  const now = Date.now();
  let inserted = 0;

  for (const m of migrations) {
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO __schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
      args: [m.version, m.name, now],
    });
    if (result.rowsAffected > 0) {
      inserted++;
      logger.info(`[Step 6] ✓ Recorded migration v${m.version}: ${m.name}`);
    } else {
      logger.info(`[Step 6] ○ Migration v${m.version} already recorded — skipped`);
    }
  }

  logger.info(`[Step 6] ✅ Registry updated (${inserted} new entries)`);
  return { inserted };
}

module.exports = { updateMigrationRegistry };
