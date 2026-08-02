'use strict';

/**
 * repair-role-permissions.cjs
 *
 * Repairs system role permissions in an already-migrated database.
 * This is the fix for the "Open Operational Day" failure caused by
 * the Cashier role being stripped of treasury.session permission.
 *
 * Run: node repair-role-permissions.cjs <path-to-store.db>
 */

const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = process.argv[2];
if (!DB_PATH) {
  console.error('Usage: node repair-role-permissions.cjs <path-to-store.db>');
  process.exit(1);
}

const db = createClient({ url: 'file:' + DB_PATH.replace(/\\/g, '/') });

// Canonical system role permissions (from lib/shared/src/roles.ts)
const CANONICAL_PERMISSIONS = {
  'Admin': ['*'],
  'Manager': [
    'dashboard.view', 'dashboard.view_sales', 'dashboard.view_profits',
    'dashboard.view_treasury_total', 'dashboard.view_stock', 'dashboard.view_associations',
    'sales.create', 'sales.view', 'sales.return', 'sales.delete',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.return',
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'inventory.view', 'inventory.manage',
    'finance.view', 'finance.manage', 'finance.delete',
    'treasury.view', 'treasury.view_all', 'treasury.session', 'treasury.transfer',
    'treasury.adjustment', 'treasury.main_safe', 'treasury.close_others',
    'associations.view', 'associations.create', 'associations.edit',
    'associations.transactions', 'associations.report',
    'reports.view', 'reports.sales', 'reports.inventory',
    'users.view', 'roles.view', 'settings.view',
  ],
  'Cashier': [
    'dashboard.view', 'dashboard.view_sales',
    'sales.create', 'sales.view_own', 'sales.return',
    'customers.view', 'customers.create', 'customers.payment',
    'products.view', 'inventory.view',
    'treasury.view', 'treasury.session',
    'expenses.create', 'reports.sales',
  ],
  'Inventory Staff': [
    'dashboard.view', 'dashboard.view_stock',
    'suppliers.view',
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete', 'purchases.return',
    'products.view', 'products.create', 'products.edit', 'products.delete',
    'inventory.view', 'inventory.manage',
    'reports.inventory',
  ],
  'Accountant': [
    'dashboard.view', 'dashboard.view_sales', 'dashboard.view_profits',
    'dashboard.view_treasury_total', 'dashboard.view_stock',
    'sales.view',
    'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
    'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
    'purchases.view', 'products.view', 'inventory.view',
    'finance.view', 'finance.manage',
    'treasury.view', 'treasury.view_all', 'treasury.transfer',
    'treasury.adjustment', 'treasury.main_safe',
    'reports.view', 'reports.sales', 'reports.inventory',
  ],
};

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  System Role Permissions Repair');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log(`Database: ${DB_PATH}\n`);

  const rolesRes = await db.execute('SELECT id, name, permissions, is_system FROM roles ORDER BY name');
  const now = Date.now();

  let repaired = 0;
  let skipped  = 0;

  for (const row of rolesRes.rows) {
    const id      = row[0] ?? row.id;
    const name    = row[1] ?? row.name;
    const permsRaw = row[2] ?? row.permissions;
    const isSystem = Number(row[3] ?? row.is_system);

    const canonical = CANONICAL_PERMISSIONS[name];
    if (!canonical) {
      console.log(`ℹ️   "${name}" — not a system role or unknown, skipping`);
      skipped++;
      continue;
    }

    let currentPerms = [];
    try {
      currentPerms = typeof permsRaw === 'string' ? JSON.parse(permsRaw) : (permsRaw ?? []);
    } catch(e) {
      currentPerms = [];
    }

    const canonicalSorted  = [...canonical].sort().join(',');
    const currentSorted    = [...currentPerms].sort().join(',');
    const needsRepair      = canonicalSorted !== currentSorted;

    if (!needsRepair) {
      console.log(`✅  "${name}" — permissions are correct (${currentPerms.length} permissions)`);
      skipped++;
      continue;
    }

    // Show diff
    const missing = canonical.filter(p => !currentPerms.includes(p));
    const extra   = currentPerms.filter(p => !canonical.includes(p));

    console.log(`🔧  "${name}" — NEEDS REPAIR:`);
    if (missing.length > 0) console.log(`    Missing: ${missing.join(', ')}`);
    if (extra.length > 0)   console.log(`    Extra:   ${extra.join(', ')}`);
    console.log(`    Current count: ${currentPerms.length}, Canonical count: ${canonical.length}`);

    // Apply repair
    await db.execute({
      sql: `UPDATE roles SET permissions = ?, updated_at = ? WHERE id = ?`,
      args: [JSON.stringify(canonical), now, id],
    });

    // Verify
    const verifyRes = await db.execute({ sql: 'SELECT permissions FROM roles WHERE id = ?', args: [id] });
    const verifyPerms = verifyRes.rows[0] ? (verifyRes.rows[0][0] ?? verifyRes.rows[0].permissions) : null;
    let verifyArray = [];
    try { verifyArray = JSON.parse(verifyPerms); } catch(e) { verifyArray = []; }
    
    const hasSession = verifyArray.includes('treasury.session') || verifyArray.includes('*');
    const hasTrView  = verifyArray.includes('treasury.view')    || verifyArray.includes('*');
    
    console.log(`    ✅ Repaired: ${verifyArray.length} permissions`);
    console.log(`    treasury.session: ${hasSession ? '✅' : '❌ STILL MISSING'}`);
    console.log(`    treasury.view:    ${hasTrView  ? '✅' : '❌ STILL MISSING'}`);
    repaired++;
  }

  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`  Repaired: ${repaired} role(s)`);
  console.log(`  Skipped:  ${skipped} role(s)`);
  
  if (repaired > 0) {
    console.log('\n  ✅ Role permissions repaired. Users must log out and log back');
    console.log('     in for the new permissions to take effect (JWT is cached).\n');
  } else {
    console.log('\n  ✅ All roles already have correct permissions.\n');
  }

  db.close();
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
