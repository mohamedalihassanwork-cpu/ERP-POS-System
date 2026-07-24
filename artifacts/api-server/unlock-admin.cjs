const bsql3Path = require.resolve('better-sqlite3', {paths:['../../node_modules/.pnpm/better-sqlite3@11.10.0/node_modules']});
const Database = require(bsql3Path);
const db = new Database('./sqlite.db');
const bcryptPath = require.resolve('bcrypt', {paths:['../../node_modules/.pnpm/bcrypt@6.0.0/node_modules']});
const bcrypt = require(bcryptPath);

// Reset failed attempts and unlock the account
db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE username = 'admin'").run();
console.log('Account unlocked.');

// Hash a known password
const hash = bcrypt.hashSync('admin123', 12);
db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(hash);
console.log('Password reset to: admin123');
console.log('New hash:', hash);
