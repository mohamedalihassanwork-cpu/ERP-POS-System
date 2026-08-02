'use strict';

const { randomUUID } = require('crypto');

async function convertSessions(db, choices, logger) {
  if (!choices.convertSessions) {
    logger.info('[Step 2] Session conversion skipped by user choice');
    return { converted: 0 };
  }

  logger.step('Converting treasury_sessions → operational_days...');

  const tblRes = await db.execute(
    "SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='treasury_sessions'"
  );
  if (Number(tblRes.rows[0][0] ?? tblRes.rows[0].n ?? 0) === 0) {
    logger.info('[Step 2] treasury_sessions table not found — nothing to convert');
    return { converted: 0 };
  }

  const sr = await db.execute(
    `SELECT ts.*, ta.type as account_type
     FROM treasury_sessions ts
     JOIN treasury_accounts ta ON ts.treasury_account_id = ta.id`
  );
  const sessions = sr.rows;

  if (sessions.length === 0) {
    logger.info('[Step 2] No treasury_sessions records — nothing to convert');
    return { converted: 0 };
  }

  logger.info(`[Step 2] Found ${sessions.length} session(s) to convert`);

  // Helper: read column by name OR positional index from a row
  const col = (row, ...names) => {
    for (const n of names) {
      if (row[n] !== undefined) return row[n];
    }
    return undefined;
  };

  let converted = 0;

  for (const s of sessions) {
    const sessionId    = col(s, 'id',          0);
    const storeId      = col(s, 'store_id',     1);
    const openedBy     = col(s, 'opened_by',    9);
    const closedBy     = col(s, 'closed_by',   10);
    const status       = col(s, 'status',       3);
    const openedAt     = col(s, 'opened_at',   11);
    const closedAt     = col(s, 'closed_at',   12);
    const openBalance  = col(s, 'opening_balance', 5);
    const actualClose  = col(s, 'actual_closing_balance', 7);
    const expectedClose = col(s, 'expected_closing_balance', 6);
    const variance     = col(s, 'variance',     8);
    const notes        = col(s, 'notes',        4);

    const userId = openedBy || choices.primaryCashierId;
    if (!userId) {
      logger.warn(`[Step 2] Session ${sessionId} has no opened_by — skipping`);
      continue;
    }

    // Verify user exists
    const ur = await db.execute({ sql: 'SELECT COUNT(*) as n FROM users WHERE id = ?', args: [userId] });
    if (Number(ur.rows[0][0] ?? ur.rows[0].n ?? 0) === 0) {
      logger.warn(`[Step 2] User ${userId} not found — skipping session ${sessionId}`);
      continue;
    }

    // Insert OR IGNORE (idempotent)
    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO operational_days
        (id, store_id, user_id, status, opened_at, closed_at,
         opening_cash_balance, carry_over_cash,
         actual_closing_cash_balance, expected_closing_cash_balance,
         cash_variance, total_transferred_to_main_safe,
         notes, opened_by, closed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, '0', ?, ?, ?, '0', ?, ?, ?, ?)`,
      args: [
        sessionId, storeId, userId, status,
        openedAt, closedAt ?? null,
        openBalance ?? '0',
        actualClose ?? null, expectedClose ?? null,
        variance ?? null, notes ?? null,
        openedBy ?? null, closedBy ?? null,
        openedAt,
      ],
    });

    if (result.rowsAffected > 0) {
      converted++;
      logger.info(`[Step 2] ✓ Converted session ${sessionId} (${col(s, 'account_type')} / ${status})`);

      // Backfill treasury_transactions.operational_day_id for any session-linked txs
      const txUpdate = await db.execute({
        sql: `UPDATE treasury_transactions SET operational_day_id = ? WHERE session_id = ?`,
        args: [sessionId, sessionId],
      });
      if (txUpdate.rowsAffected > 0) {
        logger.info(`[Step 2]   Backfilled ${txUpdate.rowsAffected} transaction(s) with operational_day_id`);
      }
    } else {
      logger.info(`[Step 2] ○ Session ${sessionId} already in operational_days — skipped`);
    }
  }

  logger.info(`[Step 2] ✅ Converted ${converted} / ${sessions.length} sessions`);
  return { converted };
}

module.exports = { convertSessions };
