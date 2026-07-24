/**
 * build-all.mjs — Desktop Build Orchestration Script
 *
 * This script coordinates the full desktop build pipeline:
 *
 *   1. Build the Express API server   (artifacts/api-server → dist/index.mjs)
 *   2. Build the Vite POS frontend    (artifacts/pos        → dist/public/)
 *   3. Copy POS frontend into API     (so Express can serve it statically)
 *   4. [--package] Run electron-builder to produce the .exe installer
 *
 * Usage:
 *   node build-all.mjs             # Steps 1-3 only (prepare for Electron dev)
 *   node build-all.mjs --package   # Steps 1-4 (full packaged installer)
 *   node build-all.mjs --dev       # Start development mode (API + Electron)
 */

import { execSync, spawn as nodeSpawn } from "child_process";
import { cpSync, mkdirSync, existsSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

// ─── Helpers ────────────────────────────────────────────────────────────────

function run(command, options = {}) {
  console.log(`\n▶ ${command}`);
  execSync(command, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
}

function step(label) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

// ─── Build Steps ────────────────────────────────────────────────────────────

async function buildApiServer() {
  step("Step 1: Building Express API Server");
  run("pnpm --filter @workspace/api-server run build");
  console.log("✅ API server built → artifacts/api-server/dist/index.mjs");
}

async function buildPosFrontend() {
  step("Step 2: Building POS Frontend (Vite)");
  run(
    "pnpm --filter @workspace/pos run build",
    {
      env: {
        ...process.env,
        PORT: "5001",
        BASE_PATH: "/",
        // Signal to vite.config.ts that this is a desktop build
        DESKTOP_BUILD: "true",
      },
    }
  );
  console.log("✅ POS frontend built → artifacts/pos/dist/public/");
}

async function copyNativeModules() {
  step("Step 2.5: Copying Native Modules (@libsql)");

  const srcDir = path.join(ROOT, "node_modules", "@libsql");
  const destDir = path.join(ROOT, "artifacts", "api-server", "dist", "node_modules", "@libsql");

  if (!existsSync(srcDir)) {
    throw new Error(
      `@libsql not found in root node_modules:\n  ${srcDir}\nPlease run pnpm install.`
    );
  }

  // Remove old copy
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }

  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });

  console.log(`✅ Native modules copied → ${destDir}`);
}

async function copyFrontendToApiServer() {
  step("Step 3: Copying POS Frontend into API Server dist");

  const srcDir = path.join(ROOT, "artifacts", "pos", "dist", "public");
  const destDir = path.join(ROOT, "artifacts", "api-server", "dist", "pos-dist");

  if (!existsSync(srcDir)) {
    throw new Error(
      `POS frontend build output not found at:\n  ${srcDir}\nRun Step 2 first.`
    );
  }

  // Remove old copy
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }

  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });

  console.log(`✅ Frontend copied → ${destDir}`);
}

async function packageWithElectronBuilder() {
  step("Step 4: Packaging with electron-builder");

  const desktopDir = path.join(ROOT, "artifacts", "desktop");
  run(
    `pnpm exec electron-builder --config electron-builder.yml --win`,
    { cwd: desktopDir }
  );

  console.log("\n✅ Installer built → artifacts/desktop/dist/desktop/");
}

// ─── Dev Mode ───────────────────────────────────────────────────────────────

async function startDevMode() {
  step("Development Mode");
  console.log("Starting: API server → wait → Electron window");

  const apiServerDir = path.join(ROOT, "artifacts", "api-server");

  // Build the API server first (needed even in dev mode since we spawn dist/)
  await buildApiServer();

  // Also build the frontend for desktop mode
  await buildPosFrontend();
  await copyNativeModules();
  await copyFrontendToApiServer();

  // Launch Electron (it will spawn the API server internally via main.js)
  const desktopDir = path.join(ROOT, "artifacts", "desktop");
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

  console.log("\n▶ Starting Electron...");
  const electronProc = nodeSpawn(npxBin, ["electron", "."], {
    cwd: desktopDir,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  electronProc.on("close", (code) => {
    console.log(`\nElectron exited with code ${code}`);
    process.exit(code || 0);
  });
}

// ─── Entry Point ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

async function main() {
  const startTime = Date.now();

  console.log("═".repeat(60));
  console.log("  Shoe Store POS — Desktop Build Pipeline");
  console.log("═".repeat(60));

  try {
    if (args.includes("--dev")) {
      await startDevMode();
      // startDevMode() keeps the process alive — don't fall through
      return;
    }

    await buildApiServer();
    await buildPosFrontend();
    await copyNativeModules();
    await copyFrontendToApiServer();

    if (args.includes("--package")) {
      await packageWithElectronBuilder();
    } else {
      console.log("\n✅ Build complete (use --package to create installer)");
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Build finished in ${elapsed}s`);
    console.log("═".repeat(60));
  } catch (err) {
    console.error("\n❌ Build failed:", err.message);
    process.exit(1);
  }
}

main();
