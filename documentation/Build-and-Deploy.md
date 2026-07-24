# Build and Deploy

---

## Development Mode

### Prerequisites
- Node.js ≥ 18
- pnpm ≥ 9 (`npm install -g pnpm`)

### Install Dependencies
```bash
pnpm install
```

### Run in Web Mode (API + POS SPA separately)

**Terminal 1 — API server:**
```bash
pnpm --filter @workspace/api-server run dev
```
Runs on `http://localhost:5001`. The dev script builds the server first then runs it.

Environment variables used by the dev script (set in the npm script itself):
```
NODE_ENV=development
SESSION_SECRET=local-development-secret-key-123
PORT=5001
DATABASE_URL=./sqlite.db  (relative to artifacts/api-server/)
```

**Terminal 2 — POS frontend (Vite dev server):**
```bash
pnpm --filter @workspace/pos run dev
```
Runs on `http://localhost:5000`. The Vite config proxies `/api/` requests to `localhost:5001`.

Open: `http://localhost:5000`

### Run in Desktop Dev Mode
```bash
pnpm desktop:dev
```
This runs `node build-all.mjs --dev` from the `artifacts/desktop` package, which:
1. Builds the API server bundle
2. Builds the POS frontend
3. Copies native modules and frontend into API dist
4. Launches Electron (which internally spawns the API server)

### Run All Packages in Parallel (pnpm workspaces)
```bash
pnpm dev
```
Runs every package's `dev` script in parallel. Note: the desktop package's dev script is independent; use `pnpm desktop:dev` instead.

---

## Code Generation (OpenAPI → Client Hooks + Zod Schemas)

When the OpenAPI spec (`lib/api-spec/openapi.yaml`) changes, regenerate the client libraries:

```bash
pnpm --filter @workspace/api-spec run generate
```

Or from the root:
```bash
cd lib/api-spec
pnpm orval
```

This regenerates:
- `lib/api-client-react/src/generated/` — React Query hooks
- `lib/api-zod/src/generated/` — Zod validation schemas

**Commit the generated files** — they are checked into the repository.

---

## Production Build — Web Mode

### Build API Server
```bash
pnpm --filter @workspace/api-server run build
```
Output: `artifacts/api-server/dist/index.mjs` — single ESM bundle

### Build POS Frontend
```bash
pnpm --filter @workspace/pos run build
```
Output: `artifacts/pos/dist/public/` — static HTML/CSS/JS

### Deploy
1. Upload `artifacts/api-server/dist/` to the server
2. Upload `artifacts/pos/dist/public/` to a CDN or static host, or configure Nginx/Express to serve it
3. Configure environment variables on the server:
   ```
   NODE_ENV=production
   SESSION_SECRET=<64-char random hex — generate with: openssl rand -hex 32>
   PORT=5001
   DATABASE_URL=/absolute/path/to/store.db
   SERVE_STATIC=false   (if POS frontend is served separately)
   SERVE_STATIC=true    (if you want Express to serve the POS frontend from dist/pos-dist/)
   PINO_LOG_FILE=/var/log/erp-api.log
   ```
4. Run: `node dist/index.mjs`

If `SERVE_STATIC=true`, copy the POS dist into `dist/pos-dist/` relative to the API bundle:
```bash
cp -r artifacts/pos/dist/public/ artifacts/api-server/dist/pos-dist/
```

### Replit / Platform Deployment
The project includes configuration for Replit-style platforms. The API server starts on the `PORT` environment variable. The POS dev server proxies to it. No special configuration is needed beyond setting `SESSION_SECRET`.

---

## Production Build — Desktop (Electron / Windows)

### Full Build Without Packaging

```bash
pnpm desktop:build
# Equivalent to:
cd artifacts/desktop
node build-all.mjs
```

Steps performed:
1. `pnpm --filter @workspace/api-server run build` → `artifacts/api-server/dist/index.mjs`
2. `pnpm --filter @workspace/pos run build` (with `DESKTOP_BUILD=true`) → `artifacts/pos/dist/public/`
3. Copy `@libsql` native modules: `node_modules/@libsql/` → `api-server/dist/node_modules/@libsql/`
4. Copy POS frontend: `pos/dist/public/` → `api-server/dist/pos-dist/`

### Package to Installer

```bash
pnpm desktop:dist
# Equivalent to:
cd artifacts/desktop
node build-all.mjs --package
```

Runs `electron-builder --config electron-builder.yml --win` which produces:
- `artifacts/desktop/dist/desktop/<appName>-<version>-Setup.exe` — NSIS installer
- `artifacts/desktop/dist/desktop/<appName>-<version>-Portable.exe` — portable executable

Both target **Windows x64**.

### Build Requirements for Packaging
- Windows machine (or Wine on Linux for cross-compile)
- `electron-builder` handles downloading Electron binaries for the target platform

### Installer Configuration (`electron-builder.yml`)
Key settings:
```yaml
appId: com.shoestorepos.app
productName: "نظام نقاط البيع"
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  language: "3073"   # Arabic (Egypt)
  runAfterFinish: true
publish:
  provider: generic
  url: "https://updates.yourdomain.com/shoestore-pos/"
  channel: "latest"
```

---

## Environment Variables Reference

### API Server

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | **Yes** | Minimum 32 chars. Used to derive JWT signing keys. **Must be kept secret and stable** — changing it invalidates all sessions. |
| `PORT` | No (default 5001) | HTTP listen port |
| `DATABASE_URL` | No (default `./sqlite.db`) | Absolute or relative path to the SQLite database file |
| `NODE_ENV` | No | `development` or `production` — affects logging verbosity |
| `SERVE_STATIC` | No | If `"true"`, Express serves the POS frontend from `dist/pos-dist/` relative to the bundle |
| `PINO_LOG_FILE` | No | If set, pino writes structured JSON logs to this file in addition to stdout |

### Desktop (set by Electron, not user-configured)

The `ApplicationManager` always sets these when spawning the API child process:
```
ELECTRON_RUN_AS_NODE=1
NODE_ENV=production
PORT=5001
DATABASE_URL=%APPDATA%\ShoeStorePOS\store.db
SESSION_SECRET=<read from secret.key>
SERVE_STATIC=true
PINO_LOG_FILE=%APPDATA%\ShoeStorePOS\app.log
```

---

## First Run (Fresh Installation)

### Web Mode
1. Start the API server
2. Open the POS frontend
3. `GET /api/auth/setup-status` returns `{ isSetupComplete: false }`
4. The React app redirects to the Setup Wizard page
5. Complete the wizard → `POST /api/auth/setup`
6. On success: store record created, default roles seeded, admin user created, chart of accounts seeded, treasury drawers seeded
7. Auto-logged in as admin → Dashboard

### Desktop Mode
1. On first launch, `_initDatabase()` detects `store.db` is missing → copies `assets/seed.db`
2. `_runMigrations()` applies all schema migrations to `seed.db`
3. API server starts; the React app detects unfinished setup
4. Setup wizard runs in the BrowserWindow
5. Same flow as web mode above

---

## Upgrading an Existing Installation

### Desktop Auto-Update
On packaged builds, the auto-updater checks `https://updates.yourdomain.com/shoestore-pos/latest.yml` at startup. If a new version is available, it downloads in the background and prompts to install.

The update replaces the application code; `store.db` and `secret.key` in `%APPDATA%\ShoeStorePOS\` are never touched by the installer.

### Schema Migrations on Update
When the app relaunches after an update, `_runMigrations()` runs before the API server starts. Any new tables or columns added in the new version are provisioned automatically.

### Manual Update (Web Mode)
1. Build new bundles
2. Stop the running process
3. Replace `dist/` directory
4. Restart
5. If schema changes are needed: run `pnpm --filter @workspace/db run migrate` or execute migration SQL manually

---

## TypeScript Checks

Run typechecking across the entire monorepo:

```bash
pnpm typecheck
```

This checks:
1. All `lib/*` packages (using project references)
2. `artifacts/api-server`
3. `artifacts/pos`
4. `scripts/`

Individual package check:
```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/pos run typecheck
```

---

## Database Management (Development)

### Reset Database
```bash
# Delete and recreate from schema
rm artifacts/api-server/sqlite.db
# Start the API server — it will create a fresh DB from auto-schema.ts
```

### View Database Contents
Use any SQLite client (DB Browser for SQLite, TablePlus, etc.) and open:
```
artifacts/api-server/sqlite.db
```

### Run Drizzle Migrations (if using drizzle-kit)
```bash
pnpm --filter @workspace/db run migrate
```

### Admin Password Reset (Emergency)
If locked out:
```bash
cd artifacts/api-server
node reset-password.mjs --username admin --password newpassword
```

Or use:
```bash
node unlock-admin.cjs
```
