'use strict';

/**
 * audit-operational-day.cjs
 *
 * Comprehensive diagnostic script that:
 *  1. Simulates every step the ERP executes for POST /operating-days
 *  2. Checks every pre-condition the code validates
 *  3. Reports exactly what is missing / wrong
 */

const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = process.argv[2] ||
  'D:/ERP/ERP_V2/ERP POS System/Database v1/ShoeStorePOS_Backup_2026-07-28_17-15/store.db';

const db = createClient({ url: 'file:' + DB_PATH.replace(/\\/g, '/') });

const PASS  = '✅ PASS';
const FAIL  = '❌ FAIL';
const WARN  = '⚠️  WARN';
const INFO  = '   INFO';

async function check(label, passFn) {
  try {
    const result = await passFn();
    if (result === true)  console.log(`${PASS}  ${label}`);
    else if (result === false) console.log(`${FAIL}  ${label}`);
    else console.log(`${INFO}  ${label}: ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`${FAIL}  ${label} — ERROR: ${e.message}`);
  }
}

async function row(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0] ?? null;
}

async function rows(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}

async function scalar(sql, args = []) {
  const r = await db.execute({ sql, args });
  const row = r.rows[0];
  if (!row) return null;
  return row[0] ?? Object.values(row)[0];
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ERP Operational Day — Post-Migration Diagnostic Audit');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log(`Database: ${DB_PATH}\n`);

  // ── 1. Schema checks ────────────────────────────────────────────────────────
  console.log('──────────────────────────────────────────────────────────');
  console.log(' [1] REQUIRED TABLES');
  console.log('──────────────────────────────────────────────────────────');

  const requiredTables = [
    'operational_days', 'cashier_balance_snapshots', 'treasury_accounts',
    'treasury_transactions', 'treasury_transfers', 'treasury_adjustments',
    'store_settings', 'stores', 'users', 'accounting_accounts',
    '__schema_migrations',
  ];
  for (const t of requiredTables) {
    const n = await scalar(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, [t]);
    console.log(`${Number(n) > 0 ? PASS : FAIL}  Table exists: ${t}`);
  }

  // ── 2. Required columns ─────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [2] REQUIRED COLUMNS');
  console.log('──────────────────────────────────────────────────────────');

  const colChecks = [
    ['store_settings', 'shift_start_hour'],
    ['treasury_accounts', 'user_id'],
    ['treasury_accounts', 'is_active'],
    ['treasury_transactions', 'operational_day_id'],
    ['treasury_transactions', 'balance_after'],  // CRITICAL — code reads balanceAfter
    ['treasury_transactions', 'reference_type'],
    ['treasury_transactions', 'created_by'],
    ['operational_days', 'opened_by'],
    ['operational_days', 'carry_over_cash'],
    ['operational_days', 'total_transferred_to_main_safe'],
    ['cashier_balance_snapshots', 'total_in'],
    ['cashier_balance_snapshots', 'total_out'],
  ];

  for (const [table, col] of colChecks) {
    const info = await rows(`PRAGMA table_info("${table}")`);
    const exists = info.some(r => (r[1] ?? r.name) === col);
    console.log(`${exists ? PASS : FAIL}  ${table}.${col}`);
  }

  // ── 3. Indexes ──────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [3] CRITICAL INDEXES');
  console.log('──────────────────────────────────────────────────────────');

  const criticalIndexes = [
    'treasury_accounts_store_type_user_idx',  // must be UNIQUE
    'salary_records_employee_period_unique',
  ];
  for (const idx of criticalIndexes) {
    const r = await row(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`, [idx]);
    if (!r) {
      console.log(`${FAIL}  Index not found: ${idx}`);
    } else {
      const sql = r[0] ?? r.sql ?? '';
      const isUnique = sql.toUpperCase().includes('UNIQUE');
      console.log(`${isUnique ? PASS : FAIL}  Index ${idx} is ${isUnique ? 'UNIQUE ✓' : 'NOT UNIQUE ← PROBLEM'}`);
      console.log(`${INFO}    SQL: ${sql}`);
    }
  }

  // ── 4. Migration registry ───────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [4] MIGRATION REGISTRY');
  console.log('──────────────────────────────────────────────────────────');

  const migrations = await rows('SELECT version, name FROM __schema_migrations ORDER BY version');
  if (migrations.length === 0) {
    console.log(`${FAIL}  __schema_migrations is EMPTY`);
  } else {
    migrations.forEach(r => {
      const v = r[0] ?? r.version;
      const n = r[1] ?? r.name;
      console.log(`${PASS}  v${v}: ${n}`);
    });
  }
  for (const v of [2, 3, 4, 5, 6]) {
    const exists = migrations.some(r => Number(r[0] ?? r.version) === v);
    if (!exists) console.log(`${FAIL}  Migration v${v} NOT recorded`);
  }

  // ── 5. Store + settings ─────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [5] STORE & SETTINGS');
  console.log('──────────────────────────────────────────────────────────');

  const storeRows = await rows('SELECT id, name FROM stores');
  console.log(`${INFO}  Stores: ${storeRows.length}`);
  storeRows.forEach(r => {
    const id = r[0] ?? r.id;
    const name = r[1] ?? r.name;
    console.log(`${INFO}    → id=${id}, name=${name}`);
  });

  for (const storeRow of storeRows) {
    const storeId = storeRow[0] ?? storeRow.id;
    const settingsRow = await row(
      'SELECT id, shift_start_hour FROM store_settings WHERE store_id=?', [storeId]
    );
    if (!settingsRow) {
      console.log(`${FAIL}  store_settings MISSING for store_id=${storeId} — ensureStoreFinancials would create it, BUT...`);
    } else {
      const ssId = settingsRow[0] ?? settingsRow.id;
      const hour = settingsRow[1] ?? settingsRow.shift_start_hour;
      console.log(`${PASS}  store_settings exists for ${storeId}`);
      console.log(`${INFO}    shift_start_hour = ${hour}`);
    }
  }

  // ── 6. Accounting accounts ──────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [6] CHART OF ACCOUNTS (accounting_accounts)');
  console.log('──────────────────────────────────────────────────────────');

  const accTableExists = await scalar(
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='accounting_accounts'"
  );
  if (!Number(accTableExists)) {
    console.log(`${FAIL}  accounting_accounts table MISSING`);
    console.log(`${INFO}    ensureStoreFinancials() will try to create chart-of-accounts rows`);
    console.log(`${INFO}    but will FAIL because the table doesn't exist`);
  } else {
    const accCount = await scalar('SELECT COUNT(*) FROM accounting_accounts');
    console.log(`${Number(accCount) > 0 ? PASS : WARN}  accounting_accounts: ${accCount} rows`);
    if (Number(accCount) === 0) {
      console.log(`${WARN}    Table exists but is empty — ensureStoreFinancials will INSERT all 18 accounts on first call`);
    }
  }

  // ── 7. Treasury accounts — per cashier ──────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [7] TREASURY ACCOUNTS');
  console.log('──────────────────────────────────────────────────────────');

  const treasuryInfo = await rows(`
    SELECT ta.id, ta.type, ta.name, ta.balance, ta.user_id, ta.is_active,
           u.username, u.full_name
    FROM treasury_accounts ta
    LEFT JOIN users u ON ta.user_id = u.id
    ORDER BY ta.type, u.username
  `);

  console.log(`${INFO}  Total treasury accounts: ${treasuryInfo.length}`);
  const typesWithUserId = { CASH: [], CARD: [], INSTAPAY: [], WALLET: [], MAIN_SAFE: [] };
  
  for (const r of treasuryInfo) {
    const id      = r[0] ?? r.id;
    const type    = r[1] ?? r.type;
    const name    = r[2] ?? r.name;
    const balance = r[3] ?? r.balance;
    const userId  = r[4] ?? r.user_id;
    const active  = r[5] ?? r.is_active;
    const uname   = r[6] ?? r.username;
    const fname   = r[7] ?? r.full_name;
    
    const label = userId ? `user=${uname}(${userId.slice(0,8)}...)` : 'user=NULL (store-level)';
    console.log(`${INFO}    [${type}] "${name}" balance=${balance} ${label} active=${active}`);
    
    if (typesWithUserId[type]) typesWithUserId[type].push({ id, userId, balance, active });
  }

  // Critical: for each active user, verify they have all 4 cashier account types
  console.log('\n  ── Cashier account completeness check:');
  const activeUsers = await rows(
    `SELECT u.id, u.username, u.full_name, r.name as role
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.is_active = 1 AND u.is_deleted = 0`
  );

  for (const u of activeUsers) {
    const uid   = u[0] ?? u.id;
    const uname = u[1] ?? u.username;
    const fname = u[2] ?? u.full_name;
    const role  = u[3] ?? u.role;

    const userAccounts = await rows(
      `SELECT type, balance, is_active FROM treasury_accounts
       WHERE store_id = (SELECT id FROM stores LIMIT 1) AND user_id = ?`,
      [uid]
    );
    const hasTypes = new Set(userAccounts.map(r => r[0] ?? r.type));
    const needed = ['CASH', 'CARD', 'INSTAPAY', 'WALLET'];
    const missing = needed.filter(t => !hasTypes.has(t));

    if (missing.length === 0) {
      console.log(`${PASS}  ${fname} (${uname}, ${role}) — all 4 accounts present`);
    } else {
      console.log(`${FAIL}  ${fname} (${uname}, ${role}) — MISSING: ${missing.join(', ')}`);
    }

    // Check user_id column specifically
    const nullUserId = await scalar(
      `SELECT COUNT(*) FROM treasury_accounts WHERE user_id IS NULL AND type != 'MAIN_SAFE'`
    );
    if (Number(nullUserId) > 0) {
      console.log(`${FAIL}  ${Number(nullUserId)} non-MAIN_SAFE account(s) have user_id=NULL ← snapshotCashierAccounts won't find them!`);
    }
  }

  // MAIN_SAFE check
  const mainSafe = await row(
    `SELECT id, balance, user_id FROM treasury_accounts WHERE type='MAIN_SAFE' AND user_id IS NULL LIMIT 1`
  );
  console.log(`\n  ── MAIN_SAFE check:`);
  if (!mainSafe) {
    console.log(`${FAIL}  MAIN_SAFE with user_id=NULL not found — ensureStoreFinancials will create it`);
    const anyMainSafe = await rows(`SELECT id, user_id FROM treasury_accounts WHERE type='MAIN_SAFE'`);
    if (anyMainSafe.length > 0) {
      console.log(`${WARN}  Found MAIN_SAFE but user_id is NOT NULL: ${JSON.stringify(anyMainSafe[0])}`);
    }
  } else {
    console.log(`${PASS}  MAIN_SAFE exists with user_id=NULL, balance=${mainSafe[1] ?? mainSafe.balance}`);
  }

  // ── 8. UNIQUE INDEX conflict on treasury_accounts ───────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [8] UNIQUE INDEX CONFLICT CHECK');
  console.log('──────────────────────────────────────────────────────────');

  // The UNIQUE index is: (store_id, type, user_id)
  // SQLite treats NULL as DISTINCT in unique indexes — 
  // so (storeId, 'CASH', NULL) and (storeId, 'CASH', userId) are different rows — GOOD
  // But TWO rows with (storeId, 'CASH', NULL) would conflict — check for duplicates
  
  const dupeCheck = await rows(`
    SELECT store_id, type, COALESCE(user_id,'__NULL__') as uid_key, COUNT(*) as cnt
    FROM treasury_accounts
    GROUP BY store_id, type, COALESCE(user_id,'__NULL__')
    HAVING cnt > 1
  `);
  if (dupeCheck.length === 0) {
    console.log(`${PASS}  No duplicate (store_id, type, user_id) combinations`);
  } else {
    console.log(`${FAIL}  ${dupeCheck.length} duplicate treasury account combination(s):`);
    dupeCheck.forEach(r => console.log(`${INFO}    store=${r[0]??r.store_id} type=${r[1]??r.type} user=${r[2]??r.uid_key} count=${r[3]??r.cnt}`));
  }

  // ── 9. balance_after column check ───────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [9] treasury_transactions.balance_after COLUMN');
  console.log('──────────────────────────────────────────────────────────');

  const txCols = await rows("PRAGMA table_info('treasury_transactions')");
  const hasBalanceAfter = txCols.some(r => (r[1] ?? r.name) === 'balance_after');
  console.log(`${hasBalanceAfter ? PASS : FAIL}  balance_after column exists`);

  if (!hasBalanceAfter) {
    console.log(`${INFO}    This column is REQUIRED by postTreasuryTransaction()`);
    console.log(`${INFO}    Without it, every financial operation will crash`);
  }

  // ── 10. reference_type enum check ───────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [10] treasury_transactions.reference_type ENUM VALUES');
  console.log('──────────────────────────────────────────────────────────');

  const txRefTypes = await rows(`
    SELECT DISTINCT reference_type FROM treasury_transactions ORDER BY reference_type
  `);
  const newEnumValues = [
    'SALE','SALES_RETURN','PURCHASE','PURCHASE_RETURN','EXPENSE','EXPENSE_REVERSAL',
    'SALARY','SALARY_REVERSAL','WITHDRAWAL','WITHDRAWAL_REVERSAL','DEPOSIT','DEPOSIT_REVERSAL',
    'CUSTOMER_PAYMENT','SUPPLIER_PAYMENT','OPENING','TRANSFER','ADJUSTMENT',
    'DAY_CLOSE_RESET','DAY_OPEN_CARRY'
  ];
  console.log(`${INFO}  Existing reference_type values in DB:`);
  const existingTypes = txRefTypes.map(r => r[0] ?? r.reference_type);
  existingTypes.forEach(t => {
    const valid = newEnumValues.includes(t);
    console.log(`  ${valid ? '✓' : '⚠ UNKNOWN'} ${t}`);
  });

  // ── 11. operational_days integrity ──────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [11] operational_days INTEGRITY');
  console.log('──────────────────────────────────────────────────────────');

  const opDayCount = await scalar('SELECT COUNT(*) FROM operational_days');
  const openDays   = await scalar("SELECT COUNT(*) FROM operational_days WHERE status='OPEN'");
  console.log(`${INFO}  Total operational_days: ${opDayCount}`);
  console.log(`${INFO}  OPEN days: ${openDays}`);

  if (Number(openDays) > 0) {
    const openDayDetails = await rows(`
      SELECT od.id, od.user_id, od.opened_at, u.username
      FROM operational_days od
      LEFT JOIN users u ON od.user_id = u.id
      WHERE od.status = 'OPEN'
    `);
    console.log(`${WARN}  There are OPEN operational_days from migration!`);
    console.log(`${INFO}  This means the cashier ALREADY has an open day from migration.`);
    console.log(`${INFO}  The server will return 409 "لديك يوم تشغيلي مفتوح بالفعل"`);
    openDayDetails.forEach(r => {
      console.log(`${FAIL}  Open day: id=${(r[0]??r.id)?.slice(0,16)}... user=${r[3]??r.username}`);
    });
  }

  // Check opened_by null
  const nullOpenedBy = await scalar(
    `SELECT COUNT(*) FROM operational_days WHERE opened_by IS NULL`
  );
  if (Number(nullOpenedBy) > 0) {
    console.log(`${FAIL}  ${nullOpenedBy} operational_days have opened_by=NULL`);
    console.log(`${INFO}    Schema requires opened_by NOT NULL — FK to users.id`);
    console.log(`${INFO}    This will cause FK constraint violations`);
  } else {
    console.log(`${PASS}  All operational_days have opened_by set`);
  }

  // ── 12. FK violations ───────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [12] FOREIGN KEY VIOLATIONS');
  console.log('──────────────────────────────────────────────────────────');

  try {
    await db.execute('PRAGMA foreign_keys = ON');
    const fkViolations = await rows('PRAGMA foreign_key_check');
    if (fkViolations.length === 0) {
      console.log(`${PASS}  No FK violations`);
    } else {
      console.log(`${FAIL}  ${fkViolations.length} FK violation(s):`);
      fkViolations.slice(0, 20).forEach(r => {
        const table  = r[0] ?? r.table;
        const rowid  = r[1] ?? r.rowid;
        const parent = r[2] ?? r.parent;
        const fkid   = r[3] ?? r.fkid;
        console.log(`  → ${table} rowid=${rowid} references ${parent} (fk#${fkid})`);
      });
    }
  } catch (e) {
    console.log(`${WARN}  FK check failed: ${e.message}`);
  }

  // ── 13. Simulate POST /operating-days step by step ──────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(' [13] SIMULATE: POST /operating-days (open operational day)');
  console.log('══════════════════════════════════════════════════════════\n');

  const storeId = String((await scalar('SELECT id FROM stores LIMIT 1')) ?? '');
  const cashierUser = await row(
    `SELECT u.id, u.username, u.full_name, r.name as role
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.is_active=1 AND u.is_deleted=0
     ORDER BY u.created_at LIMIT 1`
  );

  if (!cashierUser) {
    console.log(`${FAIL}  No active user found — cannot simulate`);
  } else {
    const userId = cashierUser[0] ?? cashierUser.id;
    const uname  = cashierUser[1] ?? cashierUser.username;
    console.log(`${INFO}  Simulating for: ${cashierUser[2] ?? cashierUser.full_name} (${uname})`);
    console.log(`${INFO}  Store: ${storeId}\n`);

    // Step A: Check for existing OPEN day (→ 409 if exists)
    const existingOpen = await row(`
      SELECT id FROM operational_days
      WHERE store_id=? AND user_id=? AND status='OPEN'
      LIMIT 1`, [storeId, userId]);
    
    if (existingOpen) {
      console.log(`${FAIL}  STEP A — BLOCKS HERE: User already has an OPEN operational_day!`);
      console.log(`${INFO}    Day ID: ${existingOpen[0] ?? existingOpen.id}`);
      console.log(`${INFO}    → Server returns HTTP 409: "لديك يوم تشغيلي مفتوح بالفعل. يجب إغلاقه أولاً."`);
      console.log(`${INFO}    Root Cause: Migration converted a treasury_session that was OPEN → operational_day with status='OPEN'`);
    } else {
      console.log(`${PASS}  STEP A — No existing open day for this user`);
    }

    // Step B: getShiftStartHour
    const settingsRow2 = await row(
      'SELECT shift_start_hour FROM store_settings WHERE store_id=?', [storeId]
    );
    if (settingsRow2) {
      const h = settingsRow2[0] ?? settingsRow2.shift_start_hour;
      console.log(`${PASS}  STEP B — shift_start_hour = ${h}`);
    } else {
      console.log(`${WARN}  STEP B — store_settings not found; ensureStoreFinancials will create it (defaults to 11)`);
    }

    // Step C: ensureStoreFinancials (accounting_accounts)
    const accExists = await scalar(
      "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='accounting_accounts'"
    );
    if (!Number(accExists)) {
      console.log(`${FAIL}  STEP C — accounting_accounts table MISSING — ensureStoreFinancials will CRASH`);
    } else {
      console.log(`${PASS}  STEP C — accounting_accounts table exists`);
    }

    // Step D: ensureCashierAccounts
    const cashierAccounts = await rows(`
      SELECT type FROM treasury_accounts WHERE store_id=? AND user_id=?`, [storeId, userId]);
    const cashierTypes = new Set(cashierAccounts.map(r => r[0] ?? r.type));
    const missingCashierTypes = ['CASH','CARD','INSTAPAY','WALLET'].filter(t => !cashierTypes.has(t));
    
    if (missingCashierTypes.length === 0) {
      console.log(`${PASS}  STEP D — All 4 cashier accounts exist for ${uname}`);
    } else {
      console.log(`${WARN}  STEP D — Missing: ${missingCashierTypes.join(', ')} — ensureCashierAccounts will create them`);
      // Check if INSERT would hit unique index conflict
      for (const t of missingCashierTypes) {
        const conflict = await row(
          `SELECT id FROM treasury_accounts WHERE store_id=? AND type=? AND user_id IS NULL`, [storeId, t]
        );
        if (conflict) {
          console.log(`${WARN}         Note: A NULL-user ${t} account exists → unique index allows new user-specific one`);
        }
      }
    }

    // Step E: INSERT operational_days — check all NOT NULL constraints
    console.log(`\n  ── INSERT operational_days constraints:`);
    console.log(`${INFO}  store_id: "${storeId}" ${storeId ? '✓' : '✗ EMPTY'}`);
    console.log(`${INFO}  user_id: "${userId}" ${userId ? '✓' : '✗ EMPTY'}`);
    console.log(`${INFO}  status: 'OPEN' ✓`);
    console.log(`${INFO}  opened_by: "${userId}" ✓`);
    console.log(`${INFO}  opening_cash_balance: '0.00' ✓`);

    // Step F: snapshotCashierAccounts — needs 4 accounts with user_id = userId
    console.log(`\n  ── STEP F — snapshotCashierAccounts query:`);
    console.log(`${INFO}  Query: SELECT id, type, balance FROM treasury_accounts`);
    console.log(`${INFO}         WHERE store_id='${storeId}' AND user_id='${userId}'`);
    
    const snapshotAccounts = await rows(`
      SELECT id, type, balance FROM treasury_accounts
      WHERE store_id=? AND user_id=?`, [storeId, userId]);
    
    if (snapshotAccounts.length === 0) {
      console.log(`${FAIL}  STEP F — 0 accounts found with user_id=${userId}`);
      console.log(`${INFO}    snapshotCashierAccounts would create 0 snapshots`);
      console.log(`${INFO}    This means no snapshot is recorded — operational day opens but has no opening balance recorded`);
    } else {
      console.log(`${PASS}  STEP F — Found ${snapshotAccounts.length} accounts to snapshot:`);
      snapshotAccounts.forEach(r => {
        console.log(`${INFO}    [${r[1]??r.type}] balance=${r[2]??r.balance}`);
      });
    }
  }

  // ── 14. Deep: treasury_transactions.balance_after ────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────');
  console.log(' [14] treasury.ts — postTreasuryTransaction REQUIREMENTS');
  console.log('──────────────────────────────────────────────────────────');

  // Read treasury.ts to understand what it writes
  console.log(`${INFO}  Checking postTreasuryTransaction prerequisites:`);
  
  const txTableCols = await rows("PRAGMA table_info('treasury_transactions')");
  const txColNames = txTableCols.map(r => r[1] ?? r.name);
  
  const requiredTxCols = [
    'id', 'store_id', 'treasury_account_id', 'operational_day_id',
    'direction', 'amount', 'balance_after', 'reference_type',
    'reference_id', 'description', 'created_by', 'created_at',
  ];

  for (const col of requiredTxCols) {
    const exists = txColNames.includes(col);
    console.log(`  ${exists ? '✓' : `${FAIL} MISSING`}  treasury_transactions.${col}`);
  }

  // ── 15. Summary ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(' SUMMARY OF ISSUES FOUND');
  console.log('══════════════════════════════════════════════════════════\n');
  
  // Re-check all critical items and summarize
  const issues = [];

  const hasBalAfter = txColNames.includes('balance_after');
  if (!hasBalAfter) issues.push('CRITICAL: treasury_transactions is missing balance_after column');
  
  const hasCreatedBy = txColNames.includes('created_by');
  if (!hasCreatedBy) issues.push('CRITICAL: treasury_transactions is missing created_by column');

  const hasRefType = txColNames.includes('reference_type');
  if (!hasRefType) issues.push('CRITICAL: treasury_transactions is missing reference_type column');

  const openDaysCount = await scalar("SELECT COUNT(*) FROM operational_days WHERE status='OPEN'");
  if (Number(openDaysCount) > 0) {
    issues.push(`HIGH: ${openDaysCount} OPEN operational_day(s) left over from migration — blocks new open with HTTP 409`);
  }

  const nullOpenedBy2 = await scalar("SELECT COUNT(*) FROM operational_days WHERE opened_by IS NULL");
  if (Number(nullOpenedBy2) > 0) {
    issues.push(`HIGH: ${nullOpenedBy2} operational_days have opened_by=NULL — FK violation`);
  }

  const accTableExists2 = await scalar(
    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='accounting_accounts'"
  );
  if (!Number(accTableExists2)) {
    issues.push('HIGH: accounting_accounts table missing — ensureStoreFinancials will crash');
  }

  const nonMainSafeNullUser = await scalar(
    "SELECT COUNT(*) FROM treasury_accounts WHERE user_id IS NULL AND type != 'MAIN_SAFE'"
  );
  if (Number(nonMainSafeNullUser) > 0) {
    issues.push(`MEDIUM: ${nonMainSafeNullUser} CASH/CARD/INSTAPAY/WALLET account(s) still have user_id=NULL — won't be found by snapshotCashierAccounts`);
  }

  if (issues.length === 0) {
    console.log('  ✅ No critical issues found in this audit pass.');
    console.log('  Check the server logs for the exact error message from the live request.\n');
  } else {
    issues.forEach((issue, i) => {
      console.log(`  ${i+1}. ${issue}`);
    });
  }

  console.log('');
  db.close();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
