/**
 * migrate-store-db.cjs
 *
 * Applies the missing schema migrations directly to the production store.db.
 * Run with: node migrate-store-db.cjs
 *
 * What this script does:
 *  1. Creates treasury_transfers table (if not exists)
 *  2. Creates treasury_adjustments table (if not exists)
 *  3. Adds pay_period_type column to salary_records (if not exists)
 *  4. Adds advance_deduction column to salary_records (if not exists)
 *  5. Adds other_deductions column to salary_records (if not exists)
 *  6. Creates associations table (if not exists)
 *  7. Creates association_transactions table (if not exists)
 */

const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'ShoeStorePOS', 'store.db');
console.log('Target database:', dbPath);

const db = createClient({ url: `file:${dbPath}` });

async function columnExists(table, column) {
  const info = await db.execute(`PRAGMA table_info("${table}")`);
  return info.rows.some(r => r[1] === column);
}

async function tableExists(table) {
  const res = await db.execute(
    `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${table}'`
  );
  return res.rows[0][0] > 0;
}

async function main() {
  console.log('\n========================================');
  console.log('  Running database migrations');
  console.log('========================================');

  // ── Migration 1: treasury_transfers ──────────────────────────────────────
  console.log('\n[1/5] Creating treasury_transfers table...');
  if (await tableExists('treasury_transfers')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      CREATE TABLE treasury_transfers (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
        from_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
        to_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
        amount TEXT NOT NULL,
        description TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
      )
    `);
    await db.execute(`
      CREATE INDEX treasury_transfers_store_idx ON treasury_transfers(store_id, created_at)
    `);
    console.log('      ✓ Created treasury_transfers');
  }

  // ── Migration 2: treasury_adjustments ────────────────────────────────────
  console.log('\n[2/5] Creating treasury_adjustments table...');
  if (await tableExists('treasury_adjustments')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      CREATE TABLE treasury_adjustments (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
        treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
        direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
        amount TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
      )
    `);
    await db.execute(`
      CREATE INDEX treasury_adjustments_store_idx ON treasury_adjustments(store_id, created_at)
    `);
    console.log('      ✓ Created treasury_adjustments');
  }

  // ── Migration 3: salary_records.pay_period_type ───────────────────────────
  console.log('\n[3/5] Adding pay_period_type to salary_records...');
  if (await columnExists('salary_records', 'pay_period_type')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      ALTER TABLE salary_records ADD COLUMN pay_period_type TEXT NOT NULL DEFAULT 'MONTHLY'
    `);
    console.log('      ✓ Added pay_period_type column');
  }

  // ── Migration 4: salary_records.advance_deduction ─────────────────────────
  console.log('\n[4/5] Adding advance_deduction to salary_records...');
  if (await columnExists('salary_records', 'advance_deduction')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      ALTER TABLE salary_records ADD COLUMN advance_deduction TEXT NOT NULL DEFAULT '0'
    `);
    console.log('      ✓ Added advance_deduction column');
  }

  // ── Migration 5: salary_records.other_deductions ──────────────────────────
  console.log('\n[5/7] Adding other_deductions to salary_records...');
  if (await columnExists('salary_records', 'other_deductions')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      ALTER TABLE salary_records ADD COLUMN other_deductions TEXT NOT NULL DEFAULT '0'
    `);
    console.log('      ✓ Added other_deductions column');
  }

  // ── Migration 6: associations ─────────────────────────────────────────────
  console.log('\n[6/7] Creating associations table...');
  if (await tableExists('associations')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      CREATE TABLE associations (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        expected_return_date TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        contribution_frequency TEXT NOT NULL DEFAULT 'NONE',
        contribution_amount TEXT,
        notes TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
        updated_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
      )
    `);
    await db.execute(`
      CREATE INDEX associations_store_idx ON associations(store_id, status)
    `);
    await db.execute(`
      CREATE UNIQUE INDEX associations_store_name_unique ON associations(store_id, name)
    `);
    console.log('      ✓ Created associations table');
  }

  // ── Migration 7: association_transactions ─────────────────────────────────
  console.log('\n[7/7] Creating association_transactions table...');
  if (await tableExists('association_transactions')) {
    console.log('      ✓ Already exists, skipping');
  } else {
    await db.execute(`
      CREATE TABLE association_transactions (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
        association_id TEXT NOT NULL REFERENCES associations(id) ON DELETE RESTRICT,
        type TEXT NOT NULL,
        amount TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
        reference_number TEXT,
        notes TEXT,
        is_reversed INTEGER NOT NULL DEFAULT 0,
        reversal_of_id TEXT,
        created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
      )
    `);
    await db.execute(`
      CREATE INDEX assoc_tx_association_idx ON association_transactions(association_id, transaction_date)
    `);
    await db.execute(`
      CREATE INDEX assoc_tx_store_idx ON association_transactions(store_id, created_at)
    `);
    await db.execute(`
      CREATE INDEX assoc_tx_treasury_idx ON association_transactions(treasury_account_id)
    `);
    console.log('      ✓ Created association_transactions table');
  }

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  Post-migration verification');
  console.log('========================================');

  const tables = ['treasury_transfers', 'treasury_adjustments', 'associations', 'association_transactions'];
  for (const t of tables) {
    const exists = await tableExists(t);
    console.log(` ${t}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
  }

  const columns = ['pay_period_type', 'advance_deduction', 'other_deductions'];
  for (const c of columns) {
    const exists = await columnExists('salary_records', c);
    console.log(` salary_records.${c}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
  }

  await db.close();
  console.log('\n✅ Migration complete!\n');
}

main().catch(err => {
  console.error('\n❌ Migration FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
