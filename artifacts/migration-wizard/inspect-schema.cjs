'use strict';
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:D:/ERP/ERP_V2/ERP POS System/Database v1/ShoeStorePOS_Backup_2026-07-28_17-15/store.db' });

async function main() {
  // Roles schema
  const cols = await db.execute("PRAGMA table_info('roles')");
  console.log('ROLES COLUMNS:', cols.rows.map(r => r[1] ?? r.name).join(', '));

  // All roles — raw dump
  const roles = await db.execute('SELECT * FROM roles');
  const colNames = cols.rows.map(r => r[1] ?? r.name);
  roles.rows.forEach(r => {
    const obj = {};
    colNames.forEach((c, i) => { obj[c] = r[i]; });
    // Truncate permissions for readability
    if (obj.permissions && typeof obj.permissions === 'string' && obj.permissions.length > 200) {
      obj.permissions = obj.permissions.slice(0, 200) + '...';
    }
    console.log('ROLE:', JSON.stringify(obj));
  });

  // Store settings columns
  const ssCols = await db.execute("PRAGMA table_info('store_settings')");
  console.log('\nSTORE_SETTINGS COLUMNS:', ssCols.rows.map(r => r[1] ?? r.name).join(', '));

  // Users schema
  const uCols = await db.execute("PRAGMA table_info('users')");
  console.log('USERS COLUMNS:', uCols.rows.map(r => r[1] ?? r.name).join(', '));

  // All users
  const users = await db.execute('SELECT id, username, full_name, is_active, is_deleted, role_id FROM users');
  users.rows.forEach(r => {
    console.log('USER:', JSON.stringify({
      id: String(r[0] ?? r.id).slice(0, 8),
      username: r[1] ?? r.username,
      full_name: r[2] ?? r.full_name,
      is_active: r[3] ?? r.is_active,
      is_deleted: r[4] ?? r.is_deleted,
      role_id: String(r[5] ?? r.role_id).slice(0, 8),
    }));
  });

  db.close();
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
