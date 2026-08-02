'use strict';

/**
 * audit-permissions.cjs
 * Checks roles and permissions in the migrated database.
 */

const { createClient } = require('@libsql/client');

const DB_PATH = process.argv[2] ||
  'D:/ERP/ERP_V2/ERP POS System/Database v1/ShoeStorePOS_Backup_2026-07-28_17-15/store.db';

const db = createClient({ url: 'file:' + DB_PATH.replace(/\\/g, '/') });

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Permissions & Roles Audit');
  console.log('══════════════════════════════════════════════════════════\n');

  // 1. All roles with their permissions
  const rolesRes = await db.execute('SELECT id, name, key, permissions, is_system FROM roles ORDER BY name');
  
  console.log('[1] ROLES IN DATABASE:\n');
  for (const r of rolesRes.rows) {
    const id    = r[0] ?? r.id;
    const name  = r[1] ?? r.name;
    const key   = r[2] ?? r.key;
    const perms = r[3] ?? r.permissions;
    const sys   = r[4] ?? r.is_system;
    
    console.log(`  Role: "${name}" (key=${key}, isSystem=${sys})`);
    
    let permArray = [];
    try {
      permArray = typeof perms === 'string' ? JSON.parse(perms) : (perms ?? []);
    } catch(e) {
      console.log(`    ⚠️  permissions is not valid JSON: ${perms}`);
      permArray = [];
    }
    
    const hasTreasurySession = permArray.includes('treasury.session') || permArray.includes('*');
    const hasTreasuryView    = permArray.includes('treasury.view')    || permArray.includes('*');
    
    console.log(`    treasury.session: ${hasTreasurySession ? '✅ YES' : '❌ NO  ← Cannot open operational day!'}`);
    console.log(`    treasury.view:    ${hasTreasuryView    ? '✅ YES' : '❌ NO  ← Cannot view operational days!'}`);
    console.log(`    All permissions:  ${JSON.stringify(permArray).slice(0, 120)}...`);
    console.log('');
  }

  // 2. All users with their role permissions
  console.log('[2] USERS × PERMISSIONS:\n');
  const usersRes = await db.execute(`
    SELECT u.id, u.username, u.full_name, u.is_active, u.is_deleted,
           r.name as role_name, r.key as role_key, r.permissions
    FROM users u
    JOIN roles r ON u.role_id = r.id
    ORDER BY u.username
  `);

  for (const u of usersRes.rows) {
    const uname   = u[1] ?? u.username;
    const fname   = u[2] ?? u.full_name;
    const active  = u[3] ?? u.is_active;
    const deleted = u[4] ?? u.is_deleted;
    const roleName = u[5] ?? u.role_name;
    const permsRaw = u[7] ?? u.permissions;
    
    let permArray = [];
    try {
      permArray = typeof permsRaw === 'string' ? JSON.parse(permsRaw) : (permsRaw ?? []);
    } catch(e) {
      permArray = [];
    }
    
    const hasTreasurySession = permArray.includes('treasury.session') || permArray.includes('*');
    const status = (!active || deleted) ? '(INACTIVE)' : '';
    
    console.log(`  ${fname} (${uname}) — Role: ${roleName} ${status}`);
    console.log(`    treasury.session: ${hasTreasurySession ? '✅' : '❌ MISSING'}`);
  }

  // 3. Check the roles table schema — does it have the 'key' column?
  console.log('\n[3] ROLES TABLE SCHEMA:\n');
  const rolesColsRes = await db.execute("PRAGMA table_info('roles')");
  const roleCols = rolesColsRes.rows.map(r => r[1] ?? r.name);
  console.log(`  Columns: ${roleCols.join(', ')}`);
  
  const hasKey = roleCols.includes('key');
  console.log(`  Has 'key' column: ${hasKey ? '✅' : '❌ MISSING — new ERP expects roles.key'}`);
  
  const hasIsSystem = roleCols.includes('is_system');
  console.log(`  Has 'is_system' column: ${hasIsSystem ? '✅' : '❌ MISSING — new ERP expects roles.is_system'}`);

  // 4. Check store_settings.require_session_for_cash
  console.log('\n[4] store_settings.require_session_for_cash:\n');
  const ssColsRes = await db.execute("PRAGMA table_info('store_settings')");
  const ssCols = ssColsRes.rows.map(r => r[1] ?? r.name);
  const hasRequireSession = ssCols.includes('require_session_for_cash');
  console.log(`  Has require_session_for_cash: ${hasRequireSession ? '✅' : '❌ MISSING'}`);
  
  if (hasRequireSession) {
    const ssRes = await db.execute('SELECT require_session_for_cash FROM store_settings LIMIT 1');
    const val = ssRes.rows[0] ? (ssRes.rows[0][0] ?? ssRes.rows[0].require_session_for_cash) : null;
    console.log(`  require_session_for_cash = ${val}`);
  }

  // 5. Auth flow: does auth middleware find user correctly?
  console.log('\n[5] AUTH MIDDLEWARE QUERY SIMULATION:\n');
  console.log('  Query: SELECT u.id, u.store_id, u.role_id, u.username, u.full_name,');
  console.log('         u.is_active, u.is_deleted, r.permissions, s.name');
  console.log('  FROM users u');
  console.log('  JOIN roles r ON u.role_id = r.id');
  console.log('  JOIN stores s ON u.store_id = s.id\n');
  
  const authSimRes = await db.execute(`
    SELECT u.id, u.store_id, u.role_id, u.username, u.full_name,
           u.is_active, u.is_deleted, r.permissions, s.name as store_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    JOIN stores s ON u.store_id = s.id
    WHERE u.is_active = 1 AND u.is_deleted = 0
    ORDER BY u.username
  `);
  
  for (const u of authSimRes.rows) {
    const uid    = u[0] ?? u.id;
    const uname  = u[3] ?? u.username;
    const fname  = u[4] ?? u.full_name;
    const permsRaw = u[7] ?? u.permissions;
    
    let permArray = [];
    try {
      permArray = typeof permsRaw === 'string' ? JSON.parse(permsRaw) : (permsRaw ?? []);
    } catch(e) {
      console.log(`  ❌ ${fname}: permissions JSON parse FAILED: ${permsRaw}`);
      continue;
    }
    
    const hasTreasurySession = permArray.includes('treasury.session') || permArray.includes('*');
    console.log(`  ${fname} (${uname}): treasury.session = ${hasTreasurySession ? '✅' : '❌ BLOCKED at requirePermission()'}`);
    
    if (!hasTreasurySession) {
      console.log(`    Full permissions: ${JSON.stringify(permArray)}`);
    }
  }

  console.log('');
  db.close();
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
