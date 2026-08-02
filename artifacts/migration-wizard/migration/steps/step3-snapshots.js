'use strict';

const { randomUUID } = require('crypto');

async function createSnapshots(db, choices, logger) {
  logger.step('Creating cashier_balance_snapshots...');

  const opRes = await db.execute('SELECT * FROM operational_days ORDER BY opened_at');
  const opDays = opRes.rows;

  if (opDays.length === 0) {
    logger.info('[Step 3] No operational_days — nothing to snapshot');
    return { created: 0 };
  }

  logger.info(`[Step 3] Processing ${opDays.length} operational day(s)...`);

  const g = (row, name, idx) => row[name] !== undefined ? row[name] : row[idx];

  let created = 0;

  for (const day of opDays) {
    const dayId    = g(day, 'id', 0);
    const storeId  = g(day, 'store_id', 1);
    const userId   = g(day, 'user_id', 2);
    const status   = g(day, 'status', 3);
    const openedAt = g(day, 'opened_at', 4);
    const closedAt = g(day, 'closed_at', 5);
    const openBalance = g(day, 'opening_cash_balance', 6);
    const actualClose = g(day, 'actual_closing_cash_balance', 8);
    const expectedClose = g(day, 'expected_closing_cash_balance', 9);

    // Find CASH account for this user
    const caRes = await db.execute({
      sql: `SELECT id FROM treasury_accounts
            WHERE type = 'CASH' AND (user_id = ? OR user_id IS NULL)
            ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
            LIMIT 1`,
      args: [userId, userId],
    });

    if (!caRes.rows.length) {
      logger.warn(`[Step 3] No CASH account for user ${userId} — skipping day ${dayId}`);
      continue;
    }

    const accountId = caRes.rows[0][0] ?? caRes.rows[0].id;

    // ── OPENING snapshot ────────────────────────────────────────────────────
    const openRes = await db.execute({
      sql: `INSERT OR IGNORE INTO cashier_balance_snapshots
            (id, store_id, operational_day_id, treasury_account_id, snapshot_type,
             balance, total_in, total_out, created_at)
            VALUES (?, ?, ?, ?, 'OPENING', ?, '0', '0', ?)`,
      args: [randomUUID(), storeId, dayId, accountId, openBalance ?? '0', openedAt],
    });
    if (openRes.rowsAffected > 0) {
      created++;
      logger.info(`[Step 3] ✓ OPENING snapshot for day ${dayId}`);
    }

    // ── CLOSING snapshot (CLOSED days only) ────────────────────────────────
    if (status === 'CLOSED' && closedAt) {
      const closingBalance = actualClose ?? expectedClose ?? '0';

      // Compute in/out from tx time window
      let totalIn = '0', totalOut = '0';
      try {
        const inRes = await db.execute({
          sql: `SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) as total
                FROM treasury_transactions
                WHERE treasury_account_id = ? AND direction = 'IN'
                  AND created_at >= ? AND created_at <= ?`,
          args: [accountId, openedAt, closedAt],
        });
        const outRes = await db.execute({
          sql: `SELECT COALESCE(SUM(CAST(amount AS REAL)), 0) as total
                FROM treasury_transactions
                WHERE treasury_account_id = ? AND direction = 'OUT'
                  AND created_at >= ? AND created_at <= ?`,
          args: [accountId, openedAt, closedAt],
        });
        totalIn  = parseFloat((inRes.rows[0][0]  ?? inRes.rows[0].total  ?? 0) || 0).toFixed(2);
        totalOut = parseFloat((outRes.rows[0][0] ?? outRes.rows[0].total ?? 0) || 0).toFixed(2);
      } catch (_) { /* use defaults */ }

      const closeRes = await db.execute({
        sql: `INSERT OR IGNORE INTO cashier_balance_snapshots
              (id, store_id, operational_day_id, treasury_account_id, snapshot_type,
               balance, total_in, total_out, created_at)
              VALUES (?, ?, ?, ?, 'CLOSING', ?, ?, ?, ?)`,
        args: [randomUUID(), storeId, dayId, accountId, closingBalance, totalIn, totalOut, closedAt],
      });
      if (closeRes.rowsAffected > 0) {
        created++;
        logger.info(`[Step 3] ✓ CLOSING snapshot for day ${dayId} (in: ${totalIn}, out: ${totalOut})`);
      }
    }
  }

  logger.info(`[Step 3] ✅ Created ${created} snapshot(s)`);
  return { created };
}

module.exports = { createSnapshots };
