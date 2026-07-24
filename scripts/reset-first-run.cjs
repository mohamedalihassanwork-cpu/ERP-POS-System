/**
 * One-time utility: wipe all application data while preserving schema.
 * Does NOT drop tables, alter migrations, or change indexes/constraints.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { createClient } = require(path.join(ROOT, "lib/db/node_modules/@libsql/client"));
const TARGET_DBS = [
  path.join(ROOT, "artifacts/api-server/sqlite.db"),
  path.join(ROOT, "artifacts/desktop/assets/seed.db"),
];

if (process.env.APPDATA) {
  TARGET_DBS.push(path.join(process.env.APPDATA, "ShoeStorePOS", "store.db"));
}

async function getUserTables(client) {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((r) => r.name);
}

async function wipeDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log("SKIP (not found):", dbPath);
    return;
  }

  const client = createClient({ url: `file:${dbPath}` });
  const tables = await getUserTables(client);

  await client.execute("PRAGMA foreign_keys = OFF");
  for (const table of tables) {
    await client.execute(`DELETE FROM "${table}"`);
  }
  await client.execute("PRAGMA foreign_keys = ON");

  const stores = await client.execute(
    "SELECT COUNT(*) AS count FROM stores",
  );
  client.close();

  console.log("WIPED:", dbPath);
  console.log("  tables cleared:", tables.length);
  console.log("  stores remaining:", stores.rows[0].count);
}

async function main() {
  for (const dbPath of TARGET_DBS) {
    await wipeDatabase(dbPath);
  }

  const appData = path.join(
    process.env.APPDATA || "",
    "ShoeStorePOS",
  );
  const configFiles = ["printer-settings.json"];
  if (appData && fs.existsSync(appData)) {
    for (const file of configFiles) {
      const full = path.join(appData, file);
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        console.log("REMOVED:", full);
      }
    }
  } else {
    console.log("No AppData config dir:", appData);
  }

  console.log("\nDone. Restart the application to enter first-run Setup.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
