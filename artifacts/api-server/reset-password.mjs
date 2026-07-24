import path from 'path';
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

const dbPath = path.join(process.env.APPDATA, 'ShoeStorePOS', 'store.db');
const db = createClient({ url: `file:${dbPath}` });

async function run() {
  const hash = await bcrypt.hash("password", 10);
  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE username = 'admin'",
    args: [hash]
  });
  console.log("Password reset to 'password'");
}
run();
