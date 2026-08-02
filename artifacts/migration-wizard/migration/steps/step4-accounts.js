'use strict';

const { randomUUID } = require('crypto');

async function assignCashierAccounts(db, choices, logger) {
  logger.step('Assigning treasury accounts to cashier users...');

  const { primaryCashierId, createAccountsForOthers } = choices;

  // ── 1. Ensure MAIN_SAFE has user_id = NULL ─────────────────────────────────
  const msRes = await db.execute(`UPDATE treasury_accounts SET user_id = NULL WHERE type = 'MAIN_SAFE'`);
  logger.info(`[Step 4] ✓ MAIN_SAFE user_id = NULL (${msRes.rowsAffected} row(s))`);

  // ── 2. Assign CASH/CARD/INSTAPAY/WALLET to primary cashier ─────────────────
  if (primaryCashierId) {
    const ur = await db.execute({ sql: 'SELECT username, full_name FROM users WHERE id = ?', args: [primaryCashierId] });
    if (!ur.rows.length) {
      logger.warn(`[Step 4] Primary cashier ${primaryCashierId} not found — skipping`);
    } else {
      const uname = ur.rows[0][0] ?? ur.rows[0].username;
      const fname = ur.rows[0][1] ?? ur.rows[0].full_name;
      logger.info(`[Step 4] Assigning accounts to: ${fname} (${uname})`);

      for (const type of ['CASH', 'CARD', 'INSTAPAY', 'WALLET']) {
        const acRes = await db.execute({
          sql: `SELECT id, name, balance FROM treasury_accounts WHERE type = ? AND (user_id IS NULL OR user_id = '')`,
          args: [type],
        });
        if (acRes.rows.length > 0) {
          const acId = acRes.rows[0][0] ?? acRes.rows[0].id;
          const acName = acRes.rows[0][1] ?? acRes.rows[0].name;
          const acBal  = acRes.rows[0][2] ?? acRes.rows[0].balance;
          await db.execute({ sql: `UPDATE treasury_accounts SET user_id = ? WHERE id = ?`, args: [primaryCashierId, acId] });
          logger.info(`[Step 4] ✓ ${type} "${acName}" (${acBal} EGP) → ${uname}`);
        }
      }
    }
  } else {
    logger.info('[Step 4] No primary cashier selected — accounts remain store-level');
  }

  // ── 3. Create empty accounts for other users ───────────────────────────────
  if (createAccountsForOthers) {
    logger.info('[Step 4] Creating accounts for other cashier users...');

    const usersRes = await db.execute(`SELECT id, username, full_name FROM users WHERE is_active = 1 AND is_deleted = 0`);
    const storeRes = await db.execute(`SELECT store_id FROM treasury_accounts LIMIT 1`);

    if (!storeRes.rows.length) {
      logger.warn('[Step 4] Cannot determine store_id — skipping other users');
    } else {
      const storeId = storeRes.rows[0][0] ?? storeRes.rows[0].store_id;
      const typeNames = {
        CASH: 'درج الكاشير', CARD: 'البطاقات', INSTAPAY: 'إنستا باي', WALLET: 'المحفظة',
      };
      const now = Date.now();

      for (const row of usersRes.rows) {
        const uid   = row[0] ?? row.id;
        const uname = row[1] ?? row.username;
        const fname = row[2] ?? row.full_name;

        if (uid === primaryCashierId) continue; // already has accounts

        let accountsCreated = 0;
        for (const [type, name] of Object.entries(typeNames)) {
          const existsRes = await db.execute({
            sql: `SELECT COUNT(*) as n FROM treasury_accounts WHERE store_id = ? AND type = ? AND user_id = ?`,
            args: [storeId, type, uid],
          });
          if (Number(existsRes.rows[0][0] ?? existsRes.rows[0].n ?? 0) === 0) {
            await db.execute({
              sql: `INSERT OR IGNORE INTO treasury_accounts
                    (id, store_id, user_id, type, name, balance, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, '0', 1, ?, ?)`,
              args: [randomUUID(), storeId, uid, type, name, now, now],
            });
            accountsCreated++;
          }
        }

        if (accountsCreated > 0) {
          logger.info(`[Step 4] ✓ Created ${accountsCreated} account(s) for ${fname} (${uname})`);
        } else {
          logger.info(`[Step 4] ○ ${fname} already has all accounts — skipped`);
        }
      }
    }
  }

  logger.info('[Step 4] ✅ Treasury account assignment complete');
}

module.exports = { assignCashierAccounts };
