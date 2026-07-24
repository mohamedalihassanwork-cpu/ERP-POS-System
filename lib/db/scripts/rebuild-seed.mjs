/**
 * rebuild-seed.mjs
 *
 * Deletes the existing seed.db and rebuilds it from the current Drizzle schema.
 * The result is a fresh SQLite database with all current tables and zero data rows.
 *
 * Usage: pnpm --filter @workspace/db run seed
 *        (or: node lib/db/scripts/rebuild-seed.mjs from repo root)
 *
 * When to run:
 *   - Every time the Drizzle schema changes (new table, column, or index)
 *   - Before every pnpm desktop:dist release build
 */

import { rmSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// lib/db/scripts/ → lib/db/ → lib/ → repo root → artifacts/desktop/assets/
const seedPath = path.resolve(__dirname, "..", "..", "..", "artifacts", "desktop", "assets", "seed.db");
const configPath = path.resolve(__dirname, "..", "drizzle.config.ts");

console.log("=== Rebuilding seed.db ===");
console.log("Target:", seedPath);

// Step 1: Delete existing seed.db
if (existsSync(seedPath)) {
  rmSync(seedPath, { force: true });
  console.log("✓ Deleted existing seed.db");
} else {
  console.log("  seed.db does not exist — creating fresh");
}

// Step 2: Push current schema to new empty seed.db
const env = { ...process.env, DATABASE_URL: seedPath };
try {
  execSync(`drizzle-kit push --config "${configPath}"`, {
    env,
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });
} catch (err) {
  console.error("✗ drizzle-kit push failed:", err.message);
  process.exit(1);
}

console.log("\n✅ seed.db rebuilt successfully with current schema (zero rows)");
console.log("   Commit seed.db to git — it is the desktop first-install template.");
