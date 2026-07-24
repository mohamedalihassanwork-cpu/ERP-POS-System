# Desktop Architecture

> Source files: `artifacts/desktop/`

---

## Overview

The desktop application is an **Electron** shell that wraps the exact same Express API server and React SPA used in web mode. Electron provides:
- A native Windows application frame and system integration (taskbar, icon, system printers)
- A bundled Node.js runtime (no Node.js installation required on the end-user machine)
- Multi-window support with isolated sessions
- A machine-bound licensing system
- Automatic updates
- Native printing without browser print dialog

---

## Process Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Electron Process                       │
│  (Electron Main Process — main.js)                       │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │            ApplicationManager                    │  │
│  │  • Owns API server child process                 │  │
│  │  • Owns all manager instances                    │  │
│  │  • Registers all IPC handlers                    │  │
│  └──────────┬───────────────────────────────────────┘  │
│             │                                            │
│   ┌─────────┼──────────────────────────────────┐        │
│   │         │                                  │        │
│   ▼         ▼                ▼                 ▼        │
│ Window   Session           Menu           Shortcut      │
│ Manager  Manager           Manager        Manager       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         BrowserWindow 1    BrowserWindow 2 …    │   │
│  │  partition: persist:w1     partition: persist:w2 │   │
│  │  (isolated session)        (isolated session)    │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────────────┬─────────────────────────┘
                                 │ child_process.spawn
                                 │ ELECTRON_RUN_AS_NODE=1
                                 ▼
┌──────────────────────────────────────────────────────────┐
│           API Server Child Process                       │
│  (Node.js — Electron's bundled runtime)                  │
│  dist/index.mjs  PORT=5001  SERVE_STATIC=true            │
│  DATABASE_URL=%APPDATA%\ShoeStorePOS\store.db            │
└──────────────────────────────────────────────────────────┘
```

---

## Entry Point — `main.js`

The Electron entry file:
1. Forces a **single instance lock** (`app.requestSingleInstanceLock()`). If a second instance is launched, it focuses the existing window and the second instance quits.
2. Resolves paths: `appDataDir`, `dbPath`, `secretPath`, `logPath`, `printerSettingsPath`, `iconPath`, `preloadPath`, `assetsDir`
3. On `app.whenReady()`: creates an `ApplicationManager` instance and calls `await manager.initialize()`
4. Configures a structured JSON logger that writes to `%APPDATA%\ShoeStorePOS\app.log`

---

## `ApplicationManager` — `managers/application-manager.js`

The central orchestrator. `initialize()` runs the following steps in order:

### Step 1: License Check
```javascript
const licenseGuard = new LicenseGuard({ appDataDir, iconPath, log });
await licenseGuard.check();
```
If the license is invalid, `LicenseGuard` shows an error dialog and calls `app.quit()`. Control never returns to `ApplicationManager`. If it returns, the license is valid.

### Step 2: Secret Management
```javascript
const sessionSecret = this._getOrCreateSecret();
```
Reads or generates a 64-char hex random secret. Stored at `%APPDATA%\ShoeStorePOS\secret.key` with `mode: 0o600`. This is passed to the API server as the `SESSION_SECRET` environment variable, so JWTs remain valid across restarts.

### Step 3: Database Initialization
```javascript
this._initDatabase();
```
If `store.db` does not exist, copies the bundled `assets/seed.db` to the app data directory. The seed database is a pre-initialized SQLite file with the complete schema applied but no data.

### Step 4: Schema Migrations
```javascript
await this._runMigrations();
```
Runs all 7 idempotent schema migrations using `@libsql/client` directly (bypassing the API server since it hasn't started yet). Each migration uses `CREATE TABLE IF NOT EXISTS` or `PRAGMA table_info` column existence checks.

### Step 5–7: Manager Initialization
Creates `SessionManager`, `WindowManager`, `MenuManager`, and `ShortcutManager` instances with appropriate configuration.

### Step 8: IPC Registration
```javascript
this._registerIpc();
```
Registers all IPC handlers (see IPC Bridge section below).

### Step 9: API Server Start
```javascript
await this._startApiServer(sessionSecret);
```
Spawns the API server as a child process using `process.execPath` (Electron's own bundled Node.js):
```javascript
spawn(process.execPath, ["--enable-source-maps", entryPoint], {
  env: {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: "5001",
    DATABASE_URL: dbPath,
    SESSION_SECRET: sessionSecret,
    SERVE_STATIC: "true",   // tells Express to serve POS frontend statically
    PINO_LOG_FILE: logPath,
  }
})
```

### Step 10: API Health Check
Polls `GET http://localhost:5001/api/healthz` every 500ms with a 45-second timeout. Only proceeds when the API returns `200 OK`.

### Step 11: Window Restoration
Calls `WindowManager.restorePersistedWindows()`. If no persisted windows exist (first launch), creates one new window.

### Step 12: Auto-Updater
On packaged builds only, calls `autoUpdater.checkForUpdatesAndNotify()`. Shows update-available and update-ready dialogs. On install confirmation, calls `autoUpdater.quitAndInstall()`.

### Step 13: Lifecycle Events
- `window-all-closed` → `app.quit()` (Windows behavior)
- `before-quit` → gracefully stops API server (SIGTERM, 5-second timeout before SIGKILL), then re-calls `app.quit()`

### Step 14: Auto-Backup
Reads backup settings from `backup-settings.json`. If `autoBackupEnabled: true`, schedules a daily backup at next startup.

---

## `WindowManager` — `managers/window-manager.js`

Manages all `BrowserWindow` instances with VS Code-like multi-window behavior.

### Key Behaviors

**Window Creation** (`createWindow()`):
- Generates a unique `windowId` (8 random bytes hex)
- Creates a unique `persist:<uuid>` session partition via `SessionManager` — each window has completely isolated cookies/storage
- Sets minimum dimensions: 1400×900 (min 1024×700)
- Background color: `#0f172a` (dark slate — prevents white flash during load)
- Loads `http://localhost:5001` (the API server with embedded frontend)
- Restores last visited route via `erp:navigate` IPC send
- Persists resize/move/maximize/fullscreen events to `windows.json`

**Closed-Window Stack** (Ctrl+Shift+T restore):
- On `window.close` event, pushes the window's state (partition, bounds, last route) to a stack
- `restoreClosedWindow()` pops from the stack and recreates the window with the same partition
- Stack capped at 20 entries

**State Persistence** (`windows.json`):
Written to `%APPDATA%\ShoeStorePOS\windows.json`. Format:
```json
{
  "version": 1,
  "windows": [
    { "id": "...", "partition": "persist:...", "bounds": {...}, "isMaximized": true, "lastRoute": "/pos" }
  ],
  "closedWindows": [...]
}
```
Debounced 500ms to avoid excessive disk writes on continuous resize.

**Session Isolation**: Each window has its own `partition: "persist:<uuid>"` in its `webPreferences`. This means:
- Multiple cashiers can be logged in simultaneously, each in their own window, with different users and different sessions
- Cookie state is not shared between windows
- localStorage and IndexedDB are isolated per window

---

## `SessionManager` — `managers/session-manager.js`

Manages the mapping between window IDs and their Electron session partitions.

Keeps an in-memory `Map<windowId, partition>` and exposes:
- `createPartition()` — generates `persist:erp-<uuid>`
- `registerPartition(windowId, partition)`
- `unregisterPartition(windowId)` — called when a window is destroyed
- `getPartition(windowId)`

---

## `MenuManager` — `managers/menu-manager.js`

Builds the application's native menu bar. Rebuilt whenever windows are opened or closed.

Menu items include:
- **File**: New Window, Close Window, Reopen Closed Window
- **Windows**: list of all open windows (click to focus)
- **View**: DevTools toggle (dev mode only)

Receives callbacks from `ApplicationManager` and calls `Menu.setApplicationMenu()`.

---

## `ShortcutManager` — `managers/shortcut-manager.js`

Registers global keyboard shortcuts (work even when the app window doesn't have focus):

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New window |
| `Ctrl+Shift+T` | Reopen last closed window |
| `Ctrl+W` | Close active window |
| `Ctrl+Shift+W` | Close all windows |
| `Ctrl+Tab` | Switch to next window |

Shortcuts are registered with `globalShortcut.register()` on app ready and unregistered on before-quit.

---

## IPC Bridge — `preload.js` and `ApplicationManager._registerIpc()`

The preload script (`preload.js`) uses Electron's `contextBridge` to expose a controlled API surface to the React renderer. `contextIsolation: true` ensures the renderer cannot access Node.js APIs directly.

### `window.electronAPI` — Desktop Capabilities

| Method | IPC Channel | Description |
|--------|------------|-------------|
| `platform` | — | Static `"electron"` — used to detect desktop mode |
| `print(options)` | `print` | Silent printing via hidden BrowserWindow |
| `getPrinters()` | `get-printers` | Returns installed printer list |
| `getVersion()` | `get-version` | Returns `app.getVersion()` |
| `openDataFolder()` | `open-data-folder` | Opens `%APPDATA%\ShoeStorePOS` in Explorer |
| `getPrinterSettings()` | `get-printer-settings` | Reads `printer-settings.json` |
| `savePrinterSettings(s)` | `save-printer-settings` | Writes `printer-settings.json` |
| `backupDataFolder()` | `backup-data-folder` | Shows folder picker → copies app data to backup |
| `restoreDataFolder()` | `restore-data-folder` | Shows folder picker → stops API → restores → relaunches |
| `getBackupSettings()` | `get-backup-settings` | Reads `backup-settings.json` |
| `saveBackupSettings(s)` | `save-backup-settings` | Writes `backup-settings.json` → applies auto-backup |
| `selectDirectory()` | `select-directory` | Opens native folder picker dialog |

### `window.erp` — Multi-Window Management

| Method | IPC Channel | Description |
|--------|------------|-------------|
| `createWindow()` | `erp:create-window` | Opens a new independent ERP window |
| `closeWindow()` | `erp:close-window` | Closes the current window |
| `listWindows()` | `erp:list-windows` | Returns `[{id, title, partition, isActive}]` |
| `focusWindow(id)` | `erp:focus-window` | Brings specified window to foreground |
| `getCurrentWindow()` | `erp:get-current-window` | Returns current window info |
| `notifyRouteChanged(route)` | `erp:route-changed` (send, not invoke) | Notifies main process of route change for persistence |

The React app's `RouteTracker` component (in `App.tsx`) calls `window.erp?.notifyRouteChanged(location)` on every route change so the window's `lastRoute` is always current.

The `?.` optional chaining ensures the calls are no-ops in browser mode (where `window.erp` is undefined).

---

## Printing (`ApplicationManager._printHtml()`)

Electron's native print API is used instead of `window.print()` for several reasons:
- Silent printing (no system print dialog)
- Printer selection by device name
- Custom page size
- Multiple copies

**Flow:**
1. React generates HTML (thermal or A4 template)
2. Calls `window.electronAPI.print({ html, silent, deviceName, pageSize, copies })`
3. Main process writes HTML to a temp file
4. Creates a hidden `BrowserWindow` and loads the temp file
5. Waits for all fonts and images to load (using `document.fonts.ready` + image event listeners)
6. Calls `webContents.print(options, callback)`
7. Closes the hidden window and deletes the temp file

---

## Licensing System — `licensing/`

A machine-bound software licensing system that prevents the application from running without a valid license.

### Components

**`LicenseGuard.js`** — Entry point called at app startup. Orchestrates the full check:
1. Reads the license file from disk (`LicenseStore`)
2. Collects the hardware fingerprint (`hardware/`)
3. Decrypts the license payload using the hardware-derived AES key (`crypto/`)
4. Verifies the ECDSA P-256 signature (`crypto/`)
5. Validates the payload (edition, expiry, hardware match) (`validation/`)
6. If any step fails, shows an error dialog and calls `app.quit()`

**`LicenseStore.js`** — Manages the encrypted license file (`license.dat`):
- Primary location: `C:\ProgramData\ShoeStorePOS\license.dat` (survives Windows reinstalls)
- Fallback: `%APPDATA%\ShoeStorePOS\license.dat`
- Encryption: AES-256-GCM with a key derived from the hardware fingerprint

**`constants.js`** — Contains:
- The ECDSA P-256 **public key** (PEM format) — safe to distribute
- `APP_SALT` — static salt for AES key derivation
- `LICENSE_EDITIONS` — recognized editions: `professional`, `enterprise`
- `LICENSE_FILENAME` — `license.dat`

**`hardware/`** — Collects hardware identifiers via PowerShell commands:
- CPU ID
- Motherboard serial number
- System UUID
- Combined into a deterministic fingerprint string
- Timeout: 15 seconds per command

**`crypto/`** — ECDSA signature verification + AES-256-GCM encryption/decryption:
- AES key is derived from `HMAC-SHA256(hardwareFingerprint, APP_SALT)` (first 32 bytes)
- ECDSA verification uses Node.js `crypto.verify()` with the embedded public key

**`validation/`** — Validates the decrypted license payload:
- Edition must be in `LICENSE_EDITIONS`
- Not expired (`expiresAt > now`, or null = perpetual)
- Hardware fingerprint must match (prevents license file copying to another machine)

**`errors.js`** — Custom error classes: `LicenseNotFoundError`, `LicenseDecryptionError`, `LicenseValidationError`, `HardwareReadError`

**`activation/`** — UI shown when a license is missing or invalid: a BrowserWindow dialog with instructions on how to activate.

### License File Format (Encrypted Payload)
```json
{
  "version": 1,
  "edition": "professional",
  "hardwareId": "<fingerprint>",
  "issuedAt": "2026-01-01T00:00:00Z",
  "expiresAt": null,
  "signature": "<base64 ECDSA P-256 signature>"
}
```
This payload is encrypted with AES-256-GCM using the machine's hardware-derived key before being written to `license.dat`.

---

## Auto-Updater

Uses `electron-updater` (part of electron-builder). Configuration in `electron-builder.yml`:
```yaml
publish:
  provider: generic
  url: "https://updates.yourdomain.com/shoestore-pos/"
  channel: "latest"
```

**Behavior:**
- On packaged build startup, calls `autoUpdater.checkForUpdatesAndNotify()`
- `update-available` event: shows info dialog, downloads in background
- `update-downloaded` event: shows dialog asking to install now or later
- "Install Now" calls `autoUpdater.quitAndInstall()` which replaces the app and relaunches

---

## Build Pipeline — `build-all.mjs`

The desktop build is orchestrated by `artifacts/desktop/build-all.mjs`:

```
node build-all.mjs              # Steps 1-3 (no packaging)
node build-all.mjs --package    # Steps 1-4 (produces .exe)
node build-all.mjs --dev        # Dev mode (builds + launches Electron)
```

**Steps:**
1. **Build API server** — `pnpm --filter @workspace/api-server run build` → `artifacts/api-server/dist/index.mjs`
2. **Build POS frontend** — `pnpm --filter @workspace/pos run build` (with `DESKTOP_BUILD=true`) → `artifacts/pos/dist/public/`
3. **Copy native modules** — copies `@libsql` from root `node_modules` to `api-server/dist/node_modules/@libsql` (native `.node` bindings must be filesystem paths)
4. **Copy frontend into API dist** — copies `pos/dist/public/` → `api-server/dist/pos-dist/` (Express serves this statically when `SERVE_STATIC=true`)
5. **[--package only] electron-builder** — packages everything into NSIS + portable executables

**Packaging spec** (`electron-builder.yml`):
- `asar: true` — code is packed into an ASAR archive
- `extraResources` — `api-server/dist/` is placed outside the ASAR so Node.js can `require()` it and the native `@libsql` modules work correctly
- Output: `artifacts/desktop/dist/desktop/`
