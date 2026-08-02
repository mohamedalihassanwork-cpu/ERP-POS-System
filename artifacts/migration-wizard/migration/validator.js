'use strict';

const { createClient } = require('@libsql/client');

// ── Helper: open a local SQLite client ────────────────────────────────────────
function openDb(dbPath) {
  // @libsql/client expects file: URL — convert Windows backslashes
  const url = 'file:' + dbPath.replace(/\\/g, '/');
  return createClient({ url });
}

// ── Helper: check column existence ───────────────────────────────────────────
async function columnExists(db, table, column) {
  const res = await db.execute(`PRAGMA table_info("${table}")`);
  return res.rows.some(r => r[1] === column);
}

// ── Helper: check table existence ────────────────────────────────────────────
async function tableExists(db, table) {
  const res = await db.execute(
    `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='${table}'`
  );
  return Number(res.rows[0][0]) > 0;
}

// ── Pre-migration validation ───────────────────────────────────────────────────
async function validateDatabase(dbPath) {
  const fs = require('fs');
  if (!fs.existsSync(dbPath)) {
    return { valid: false, error: 'File not found.' };
  }

  const stats = fs.statSync(dbPath);
  if (stats.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  const db = openDb(dbPath);
  try {
    // Integrity check
    const intRes = await db.execute('PRAGMA integrity_check');
    const intVal = intRes.rows[0] && (intRes.rows[0][0] || intRes.rows[0].integrity_check);
    if (intVal !== 'ok') {
      return { valid: false, error: `Integrity check failed: ${intVal}` };
    }

    // Collect all tables
    const tablesRes = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const tables = tablesRes.rows.map(r => r[0] || r.name);

    // Required base tables
    const required = ['stores', 'users', 'roles', 'products', 'invoices', 'treasury_accounts', 'treasury_transactions'];
    const missing = required.filter(t => !tables.includes(t));
    if (missing.length > 0) {
      return { valid: false, error: `Missing required tables: ${missing.join(', ')}` };
    }

    // Migration version
    let appliedVersion = 0;
    let appliedMigrations = [];
    if (tables.includes('__schema_migrations')) {
      const mvRes = await db.execute('SELECT version, name FROM __schema_migrations ORDER BY version');
      appliedMigrations = mvRes.rows.map(r => ({ version: Number(r[0] ?? r.version), name: r[1] ?? r.name }));
      appliedVersion = appliedMigrations.length > 0
        ? Math.max(...appliedMigrations.map(m => m.version))
        : 0;
    }

    // Record counts
    const counts = {};
    const countTables = [
      'stores', 'users', 'roles', 'products', 'product_variants',
      'customers', 'invoices', 'invoice_items', 'treasury_accounts',
      'treasury_transactions', 'purchase_invoices', 'employees',
      'salary_records', 'inventory_items', 'inventory_movements',
      'treasury_sessions', 'expenses', 'expense_categories', 'suppliers',
      'brands', 'categories', 'warehouse_transfers', 'stock_counts',
    ];
    for (const t of countTables) {
      if (tables.includes(t)) {
        const r = await db.execute(`SELECT COUNT(*) as n FROM "${t}"`);
        counts[t] = Number(r.rows[0][0] ?? r.rows[0].n ?? 0);
      } else {
        counts[t] = 0;
      }
    }

    // Treasury sessions detail
    let sessions = [];
    if (tables.includes('treasury_sessions')) {
      const sr = await db.execute(
        `SELECT ts.id, ts.status, ta.type as account_type, ts.opened_by,
                ts.opened_at, ts.closed_at, ts.opening_balance
         FROM treasury_sessions ts
         JOIN treasury_accounts ta ON ts.treasury_account_id = ta.id`
      );
      sessions = sr.rows.map(r => ({
        id: r[0] ?? r.id,
        status: r[1] ?? r.status,
        account_type: r[2] ?? r.account_type,
        opened_by: r[3] ?? r.opened_by,
        opened_at: r[4] ?? r.opened_at,
        closed_at: r[5] ?? r.closed_at,
        opening_balance: r[6] ?? r.opening_balance,
      }));
    }

    // Users
    const ur = await db.execute(
      `SELECT u.id, u.username, u.full_name, r.name as role
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.is_deleted = 0 AND u.is_active = 1`
    );
    const users = ur.rows.map(r => ({
      id: r[0] ?? r.id,
      username: r[1] ?? r.username,
      full_name: r[2] ?? r.full_name,
      role: r[3] ?? r.role,
    }));

    // Treasury accounts
    const tar = await db.execute('SELECT id, type, name, balance FROM treasury_accounts ORDER BY type');
    const treasuryAccounts = tar.rows.map(r => ({
      id: r[0] ?? r.id, type: r[1] ?? r.type,
      name: r[2] ?? r.name, balance: r[3] ?? r.balance,
    }));

    // Column state
    const hasShiftHour = await columnExists(db, 'store_settings', 'shift_start_hour');
    const hasTaUserId  = await columnExists(db, 'treasury_accounts', 'user_id');
    const hasTxOpDayId = await columnExists(db, 'treasury_transactions', 'operational_day_id');

    // Store name
    const sr2 = await db.execute('SELECT name FROM stores LIMIT 1');
    const storeName = sr2.rows[0] ? (sr2.rows[0][0] ?? sr2.rows[0].name) : 'Unknown';

    return {
      valid: true,
      dbPath,
      fileSizeBytes: stats.size,
      storeName,
      appliedVersion,
      appliedMigrations,
      pendingVersions: [2, 3, 4, 5, 6].filter(v => v > appliedVersion),
      tables,
      counts,
      sessions,
      users,
      treasuryAccounts,
      columnState: { hasShiftHour, hasTaUserId, hasTxOpDayId },
      needsMigration: appliedVersion < 6 || !hasShiftHour || !hasTaUserId || !hasTxOpDayId,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  } finally {
    db.close();
  }
}

// ── Pre-migration snapshot ─────────────────────────────────────────────────────
async function takeSnapshot(dbPath) {
  const db = openDb(dbPath);
  try {
    const snap = { timestamp: Date.now(), counts: {}, balances: {} };

    const tablesRes = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = tablesRes.rows.map(r => r[0] ?? r.name);

    const countable = [
      'stores', 'users', 'roles', 'products', 'product_variants',
      'customers', 'invoices', 'invoice_items', 'treasury_accounts',
      'treasury_transactions', 'purchase_invoices', 'employees',
      'salary_records', 'inventory_items', 'inventory_movements',
      'treasury_sessions', 'expenses', 'expense_categories', 'suppliers',
    ];
    for (const t of countable) {
      if (tables.includes(t)) {
        const r = await db.execute(`SELECT COUNT(*) as n FROM "${t}"`);
        snap.counts[t] = Number(r.rows[0][0] ?? r.rows[0].n ?? 0);
      }
    }

    if (tables.includes('treasury_accounts')) {
      const ar = await db.execute('SELECT id, type, name, balance FROM treasury_accounts');
      let total = 0;
      for (const row of ar.rows) {
        const id = row[0] ?? row.id;
        const type = row[1] ?? row.type;
        const name = row[2] ?? row.name;
        const balance = row[3] ?? row.balance;
        snap.balances[`treasury_${id}`] = { type, name, balance };
        total += parseFloat(balance || '0');
      }
      snap.balances.totalTreasury = total.toFixed(2);
    }

    return snap;
  } finally {
    db.close();
  }
}

// ── Post-migration validation ──────────────────────────────────────────────────
async function runPostValidation(dbPath, preSnapshot) {
  const db = openDb(dbPath);
  const checks = [];
  let allPassed = true;

  const check = (name, passed, detail = '') => {
    checks.push({ name, passed, detail });
    if (!passed) allPassed = false;
  };

  try {
    const tablesRes = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = tablesRes.rows.map(r => r[0] ?? r.name);

    // ── New tables ──
    for (const t of ['operational_days', 'cashier_balance_snapshots']) {
      check(`Table exists: ${t}`, tables.includes(t));
    }

    // ── New columns ──
    check('store_settings has shift_start_hour', await columnExists(db, 'store_settings', 'shift_start_hour'));
    check('treasury_accounts has user_id',        await columnExists(db, 'treasury_accounts', 'user_id'));
    check('treasury_transactions has operational_day_id', await columnExists(db, 'treasury_transactions', 'operational_day_id'));

    // ── Migration registry ──
    if (tables.includes('__schema_migrations')) {
      const mr = await db.execute('SELECT version FROM __schema_migrations ORDER BY version');
      const versions = mr.rows.map(r => Number(r[0] ?? r.version));
      for (const v of [2, 3, 4, 5, 6]) {
        check(`Migration v${v} recorded`, versions.includes(v));
      }
    }

    // ── Salary index ──
    const idxRes = await db.execute(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='salary_records_employee_period_unique'"
    );
    const idxSql = idxRes.rows[0] ? (idxRes.rows[0][0] ?? idxRes.rows[0].sql ?? '') : '';
    check('salary_records index is 2-column (no pay_period_type)', !!idxSql && !idxSql.includes('pay_period_type'), idxSql);

    // ── Record count preservation ──
    if (preSnapshot && preSnapshot.counts) {
      const criticalTables = [
        'stores', 'users', 'products', 'customers', 'invoices', 'invoice_items',
        'treasury_accounts', 'treasury_transactions', 'purchase_invoices',
        'employees', 'salary_records', 'inventory_items', 'inventory_movements', 'suppliers',
      ];
      for (const t of criticalTables) {
        if (!tables.includes(t)) continue;
        const before = preSnapshot.counts[t] || 0;
        const r = await db.execute(`SELECT COUNT(*) as n FROM "${t}"`);
        const after = Number(r.rows[0][0] ?? r.rows[0].n ?? 0);
        check(`${t} count preserved (${before}→${after})`, after >= before,
          after < before ? `Lost ${before - after} records` : '');
      }
    }

    // ── Balance preservation ──
    if (preSnapshot?.balances?.totalTreasury) {
      const ar = await db.execute('SELECT balance FROM treasury_accounts');
      const totalAfter = ar.rows.reduce((s, r) => s + parseFloat((r[0] ?? r.balance) || '0'), 0).toFixed(2);
      const diff = Math.abs(parseFloat(totalAfter) - parseFloat(preSnapshot.balances.totalTreasury));
      check(`Treasury balance preserved (${preSnapshot.balances.totalTreasury} EGP)`, diff < 0.01,
        diff >= 0.01 ? `Before: ${preSnapshot.balances.totalTreasury}, After: ${totalAfter}` : '');
    }

    // ── FK integrity ──
    const fkRes = await db.execute('PRAGMA foreign_key_check');
    check('Foreign key integrity (0 violations)', fkRes.rows.length === 0,
      fkRes.rows.length > 0 ? `${fkRes.rows.length} violations` : '');

    // ── Operational days integrity ──
    if (tables.includes('operational_days')) {
      const inv = await db.execute("SELECT COUNT(*) as n FROM operational_days WHERE user_id IS NULL");
      const n = Number(inv.rows[0][0] ?? inv.rows[0].n ?? 0);
      check('All operational_days have user_id', n === 0, n > 0 ? `${n} rows missing user_id` : '');
    }

    // ── Salary conflicts ──
    const sc = await db.execute(
      `SELECT COUNT(*) as n FROM (SELECT employee_id, period_month, COUNT(*) as cnt
       FROM salary_records GROUP BY employee_id, period_month HAVING cnt > 1)`
    );
    check('No duplicate salary records', Number(sc.rows[0][0] ?? sc.rows[0].n ?? 0) === 0);

    return { passed: allPassed, checks };
  } catch (err) {
    return { passed: false, checks, error: err.message };
  } finally {
    db.close();
  }
}

module.exports = { validateDatabase, takeSnapshot, runPostValidation, openDb };
