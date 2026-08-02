'use strict';

// Canonical system role permissions — must match lib/shared/src/roles.ts DEFAULT_ROLES
const CANONICAL_PERMISSIONS = {
  'Admin':           ['*'],
  'Manager': [
    'dashboard.view','dashboard.view_sales','dashboard.view_profits',
    'dashboard.view_treasury_total','dashboard.view_stock','dashboard.view_associations',
    'sales.create','sales.view','sales.return','sales.delete',
    'customers.view','customers.create','customers.edit','customers.delete',
    'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete',
    'purchases.view','purchases.create','purchases.edit','purchases.delete','purchases.return',
    'products.view','products.create','products.edit','products.delete',
    'inventory.view','inventory.manage',
    'finance.view','finance.manage','finance.delete',
    'treasury.view','treasury.view_all','treasury.session','treasury.transfer',
    'treasury.adjustment','treasury.main_safe','treasury.close_others',
    'associations.view','associations.create','associations.edit',
    'associations.transactions','associations.report',
    'reports.view','reports.sales','reports.inventory',
    'users.view','roles.view','settings.view',
  ],
  'Cashier': [
    'dashboard.view','dashboard.view_sales',
    'sales.create','sales.view_own','sales.return',
    'customers.view','customers.create','customers.payment',
    'products.view','inventory.view',
    'treasury.view','treasury.session',
    'expenses.create','reports.sales',
  ],
  'Inventory Staff': [
    'dashboard.view','dashboard.view_stock',
    'suppliers.view',
    'purchases.view','purchases.create','purchases.edit','purchases.delete','purchases.return',
    'products.view','products.create','products.edit','products.delete',
    'inventory.view','inventory.manage',
    'reports.inventory',
  ],
  'Accountant': [
    'dashboard.view','dashboard.view_sales','dashboard.view_profits',
    'dashboard.view_treasury_total','dashboard.view_stock',
    'sales.view',
    'customers.view','customers.create','customers.edit','customers.delete',
    'suppliers.view','suppliers.create','suppliers.edit','suppliers.delete',
    'purchases.view','products.view','inventory.view',
    'finance.view','finance.manage',
    'treasury.view','treasury.view_all','treasury.transfer',
    'treasury.adjustment','treasury.main_safe',
    'reports.view','reports.sales','reports.inventory',
  ],
};

/**
 * Step 7 — Repair system role permissions.
 *
 * Compares each system role (is_system=1) against the canonical permission list
 * and resets any that are missing required permissions.
 * Preserves the Admin role's ["*"] wildcard.
 */
async function repairRolePermissions(db, choices, logger) {
  logger.step('Repairing system role permissions...');

  const rolesRes = await db.execute('SELECT id, name, permissions, is_system FROM roles ORDER BY name');
  let repaired = 0;
  let skipped  = 0;
  const now = Date.now();

  for (const row of rolesRes.rows) {
    const id       = row[0] ?? row.id;
    const name     = row[1] ?? row.name;
    const permsRaw = row[2] ?? row.permissions;
    const isSystem = Number(row[3] ?? row.is_system);

    const canonical = CANONICAL_PERMISSIONS[name];
    if (!canonical) {
      logger.info(`[Step 7] ○ "${name}" — custom role, not in canonical list, skipping`);
      skipped++;
      continue;
    }

    let currentPerms = [];
    try {
      currentPerms = typeof permsRaw === 'string' ? JSON.parse(permsRaw) : (permsRaw ?? []);
    } catch (e) {
      currentPerms = [];
    }

    const missing = canonical.filter(p => !currentPerms.includes(p));
    const extra   = currentPerms.filter(p => !canonical.includes(p));

    if (missing.length === 0 && extra.length === 0) {
      logger.info(`[Step 7] ✓ "${name}" — permissions are correct (${currentPerms.length} perms)`);
      skipped++;
      continue;
    }

    logger.warn(`[Step 7] "${name}" — repairing:`);
    if (missing.length > 0) logger.warn(`  Missing: ${missing.join(', ')}`);
    if (extra.length > 0)   logger.info(`  Extra (will be removed): ${extra.join(', ')}`);

    await db.execute({
      sql: `UPDATE roles SET permissions = ?, updated_at = ? WHERE id = ?`,
      args: [JSON.stringify(canonical), now, id],
    });

    logger.info(`[Step 7] ✓ "${name}" — repaired (${canonical.length} canonical permissions)`);
    repaired++;
  }

  logger.info(`[Step 7] ✅ Role permissions repair complete (${repaired} repaired, ${skipped} unchanged)`);
  return { repaired, skipped };
}

module.exports = { repairRolePermissions, CANONICAL_PERMISSIONS };
