"use strict";

/**
 * ApplicationManager — Top-Level Orchestrator
 *
 * Coordinates all managers: WindowManager, SessionManager, MenuManager,
 * ShortcutManager. Owns the app lifecycle, IPC registration, and
 * API server management.
 *
 * This is the single entry point called from main.js.
 */

const { app, ipcMain, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

const { WindowManager } = require("./window-manager");
const { SessionManager } = require("./session-manager");
const { MenuManager } = require("./menu-manager");
const { ShortcutManager } = require("./shortcut-manager");

// [LICENSING] ── License guard (must be required after Electron is ready)
const { LicenseGuard } = require("../licensing/LicenseGuard");

const API_PORT = 5001;
const API_BASE = `http://localhost:${API_PORT}`;
const HEALTH_URL = `${API_BASE}/api/healthz`;

class ApplicationManager {
  /**
   * @param {object} opts
   * @param {string} opts.appDataDir      e.g. %APPDATA%/ShoeStorePOS
   * @param {string} opts.dbPath
   * @param {string} opts.secretPath
   * @param {string} opts.logPath
   * @param {string} opts.printerSettingsPath
   * @param {string} opts.iconPath
   * @param {string} opts.preloadPath
   * @param {string} opts.assetsDir
   * @param {Function} opts.log           log(level, msg, meta?)
   */
  constructor(opts) {
    this._appDataDir = opts.appDataDir;
    this._dbPath = opts.dbPath;
    this._secretPath = opts.secretPath;
    this._logPath = opts.logPath;
    this._printerSettingsPath = opts.printerSettingsPath;
    this._iconPath = opts.iconPath;
    this._preloadPath = opts.preloadPath;
    this._assetsDir = opts.assetsDir;
    this._log = opts.log;

    this._backupSettingsPath = path.join(this._appDataDir, "backup-settings.json");
    this._autoBackupInterval = null;

    this._apiProcess = null;
    this._apiReady = false;
    this._apiFailed = false;
    this._apiFailedError = null;
    this._isQuitting = false;

    this._sessionManager = null;
    this._windowManager = null;
    this._menuManager = null;
    this._shortcutManager = null;
  }

  // =========================================================================
  // Public entry point
  // =========================================================================

  /**
   * Initialize the entire application.
   * Called from main.js inside app.whenReady().
   */
  async initialize() {
    this._log("info", "ApplicationManager initializing...");

    // [LICENSING] ── Run hardware & license check before anything else.
    // If this call returns, the license is valid and the ERP may proceed.
    // On any failure it shows an error dialog and calls app.quit() internally.
    const licenseGuard = new LicenseGuard({
      appDataDir: this._appDataDir,
      iconPath:   this._iconPath,
      log:        this._log,
    });
    await licenseGuard.check();
    // [/LICENSING]

    // 1. Get or generate session secret
    const sessionSecret = this._getOrCreateSecret();

    // 2. Bootstrap database
    this._initDatabase();

    // 2.5 Apply pending schema migrations to existing store.db
    //     This upgrades any v1 store.db (e.g. from an older install) to the
    //     current schema. All operations use IF NOT EXISTS / column-existence
    //     guards, making this fully idempotent and safe to run on every launch.
    await this._runMigrations();

    // 3. Create managers
    this._sessionManager = new SessionManager();

    const windowStateFile = path.join(this._appDataDir, "windows.json");

    this._windowManager = new WindowManager({
      apiBase: API_BASE,
      preloadPath: this._preloadPath,
      iconPath: this._iconPath,
      stateFilePath: windowStateFile,
      appTitle: "نظام نقاط البيع — ERP",
      sessionManager: this._sessionManager,
      log: this._log,
      isDev: !app.isPackaged,
    });

    this._menuManager = new MenuManager({
      onNewWindow: () => this._createNewWindow(),
      onCloseWindow: () => this._windowManager.closeWindow(),
      onReopenClosedWindow: () => this._reopenClosedWindow(),
      onFocusWindow: (id) => this._windowManager.focusWindow(id),
      onCloseAllWindows: () => this._windowManager.closeAllWindows(),
      getWindowList: () => this._windowManager.listWindows(),
    });

    this._shortcutManager = new ShortcutManager({
      onNewWindow: () => this._createNewWindow(),
      onReopenClosedWindow: () => this._reopenClosedWindow(),
      onCloseWindow: () => this._windowManager.closeWindow(),
      onCloseAllWindows: () => this._windowManager.closeAllWindows(),
      onSwitchWindow: () => this._windowManager.focusNextWindow(),
    });

    // 4. Register IPC handlers
    this._registerIpc();

    // 5. Start API server
    await this._startApiServer(sessionSecret);

    // 6. Wait for API to be healthy
    this._log("info", "Waiting for API server...");
    await this._waitForApi(45000);
    this._log("info", "API server is ready");

    // 7. Register shortcuts
    this._shortcutManager.register();

    // 8. Restore windows (or create first window)
    const restored = this._windowManager.restorePersistedWindows();
    if (!restored) {
      this._createNewWindow();
    }

    // Rebuild menu after windows are open
    this._rebuildMenu();

    // 9. Auto-updater
    this._setupAutoUpdater();

    // 10. Lifecycle events
    this._setupLifecycleEvents();

    // 11. Setup auto backup
    this._setupAutoBackup();

    this._log("info", "ApplicationManager ready");
  }

  // =========================================================================
  // Window management helpers
  // =========================================================================

  _createNewWindow() {
    const win = this._windowManager.createWindow();
    this._rebuildMenu();
    return win;
  }

  _reopenClosedWindow() {
    const win = this._windowManager.restoreClosedWindow();
    if (win) this._rebuildMenu();
    return win;
  }

  _rebuildMenu() {
    this._menuManager.rebuild();
  }

  // =========================================================================
  // API Server management
  // =========================================================================

  _getApiEntryPoint() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "api-server", "dist", "index.mjs");
    }
    return path.resolve(this._preloadPath, "..", "..", "api-server", "dist", "index.mjs");
  }

  async _startApiServer(sessionSecret) {
    const entryPoint = this._getApiEntryPoint();

    if (!fs.existsSync(entryPoint)) {
      throw new Error(
        `API server bundle not found: ${entryPoint}\nRun "pnpm build" first.`
      );
    }

    this._log("info", "Starting API server", { entryPoint });

    return new Promise((resolve, reject) => {
      // Use Electron's bundled Node.js runtime instead of a system-installed Node.js executable.
      // This ensures the application is completely self-contained and works on machines without Node.
      this._apiProcess = spawn(process.execPath, ["--enable-source-maps", entryPoint], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NODE_ENV: "production",
          PORT: String(API_PORT),
          DATABASE_URL: this._dbPath,
          SESSION_SECRET: sessionSecret,
          SERVE_STATIC: "true",
          PINO_LOG_FILE: this._logPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      this._apiProcess.stdout.on("data", (data) => {
        const text = data.toString().trim();
        if (text) this._log("api", text);
        if (text.includes('"Server listening"') || text.includes("Server listening")) {
          this._apiReady = true;
        }
      });

      this._apiProcess.stderr.on("data", (data) => {
        const text = data.toString().trim();
        if (text) this._log("api:err", text);
      });

      this._apiProcess.on("error", (err) => {
        this._log("error", "API server process error", { message: err.message });
        reject(err);
      });

      this._apiProcess.on("exit", (code, signal) => {
        this._log("warn", "API server exited", { code, signal });
        this._apiReady = false;
        this._apiFailed = true;
        this._apiFailedError = new Error(
          `توقف خادم API بشكل غير متوقع (رمز الخروج: ${code})`
        );
        this._apiProcess = null;

        if (this._windowManager && !this._isQuitting) {
          const wins = this._windowManager.listWindows();
          if (wins.length > 0) {
            dialog.showErrorBox(
              "خطأ في الخادم",
              `توقف خادم API بشكل غير متوقع (رمز الخروج: ${code}).\nأعد تشغيل التطبيق.`
            );
          }
        }
      });

      resolve(this._apiProcess);
    });
  }

  async _stopApiServer() {
    return new Promise((resolve) => {
      if (!this._apiProcess) {
        resolve();
        return;
      }
      this._log("info", "Stopping API server...");
      const p = this._apiProcess;
      this._apiProcess = null;

      const timeout = setTimeout(() => {
        this._log("warn", "API server did not exit gracefully, killing");
        p.kill("SIGKILL");
        resolve();
      }, 5000);

      p.on("exit", () => {
        clearTimeout(timeout);
        this._log("info", "API server stopped");
        resolve();
      });

      p.kill("SIGTERM");
    });
  }

  _waitForApi(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let attempts = 0;

      const check = () => {
        if (this._apiFailed) {
          reject(this._apiFailedError || new Error("API server process exited prematurely"));
          return;
        }
        attempts++;
        const req = http.get(HEALTH_URL, (res) => {
          if (res.statusCode === 200) {
            this._log("info", `API ready after ${attempts} attempt(s)`);
            resolve();
          } else {
            scheduleRetry();
          }
          res.resume();
        });
        req.on("error", scheduleRetry);
        req.setTimeout(1000, () => {
          req.destroy();
          scheduleRetry();
        });
      };

      const scheduleRetry = () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`API server did not become ready within ${timeoutMs}ms`));
          return;
        }
        setTimeout(check, 500);
      };

      check();
    });
  }

  // =========================================================================
  // Printing helpers (preserved from original)
  // =========================================================================

  async _printHtml(html, options = {}) {
    if (!html || !String(html).trim()) {
      return { success: false, error: "No print content" };
    }

    const { BrowserWindow: BW } = require("electron");
    const tempPath = path.join(
      app.getPath("temp"),
      `erp-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
    );

    let printWindow = null;

    try {
      fs.writeFileSync(tempPath, html, "utf8");

      printWindow = new BW({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      await printWindow.loadFile(tempPath);

      await printWindow.webContents.executeJavaScript(`
        new Promise((resolve) => {
          const done = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
          const waitImages = () => {
            const images = Array.from(document.images);
            if (images.length === 0) return Promise.resolve();
            return Promise.all(
              images.map(
                (img) =>
                  new Promise((res) => {
                    if (img.complete) { res(undefined); return; }
                    img.addEventListener("load", () => res(undefined), { once: true });
                    img.addEventListener("error", () => res(undefined), { once: true });
                  }),
              ),
            );
          };
          const fontsReady =
            document.fonts && document.fonts.ready
              ? document.fonts.ready.catch(() => undefined)
              : Promise.resolve();
          Promise.all([fontsReady, waitImages()]).then(done).catch(done);
        })
      `);

      const printOptions = {
        silent: options.silent !== false,
        printBackground: true,
        copies: options.copies || 1,
      };

      const deviceName = options.deviceName && String(options.deviceName).trim();
      if (deviceName) printOptions.deviceName = deviceName;

      if (options.pageSize) {
        const ps = options.pageSize;
        if (typeof ps === "object" && ps.width && ps.height) {
          printOptions.pageSize = ps;
        } else if (typeof ps === "string") {
          printOptions.pageSize = ps;
        } else {
          printOptions.usePrinterDefaultPageSize = true;
        }
      } else {
        printOptions.usePrinterDefaultPageSize = true;
      }

      return await new Promise((resolve) => {
        printWindow.webContents.print(printOptions, (success, failureReason) => {
          if (success) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: failureReason || "Print failed" });
          }
        });
      });
    } finally {
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.close();
      }
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // temp file may already be gone
      }
    }
  }

  // =========================================================================
  // IPC handlers
  // =========================================================================

  _registerIpc() {
    // ── Existing IPC (preserved) ──────────────────────────────────────────

    ipcMain.handle("print", async (_event, options) => {
      try {
        return await this._printHtml(options?.html, options);
      } catch (error) {
        this._log("error", "Print handler failed", { error: error.message });
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("get-printers", async (event) => {
      const win = this._windowManager?.getWindowInfoByContents(event.sender);
      const { BrowserWindow: BW } = require("electron");
      const bw = win
        ? BW.fromWebContents(event.sender)
        : BW.getAllWindows()[0];
      if (!bw) return [];
      try {
        return await bw.webContents.getPrintersAsync();
      } catch {
        return [];
      }
    });

    ipcMain.handle("get-version", () => app.getVersion());

    ipcMain.handle("open-data-folder", () => {
      shell.openPath(this._appDataDir);
    });

    ipcMain.handle("get-printer-settings", () => {
      try {
        if (fs.existsSync(this._printerSettingsPath)) {
          return JSON.parse(fs.readFileSync(this._printerSettingsPath, "utf8"));
        }
      } catch (e) {
        this._log("error", "Failed to read printer settings", { error: e.message });
      }
      return {};
    });

    ipcMain.handle("save-printer-settings", (_event, settings) => {
      try {
        fs.writeFileSync(this._printerSettingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
      } catch (e) {
        this._log("error", "Failed to save printer settings", { error: e.message });
        return { success: false, error: e.message };
      }
    });

    // ── Multi-window IPC (new) ────────────────────────────────────────────

    ipcMain.handle("erp:create-window", () => {
      this._createNewWindow();
    });

    ipcMain.handle("erp:close-window", (event) => {
      const info = this._windowManager.getWindowInfoByContents(event.sender);
      if (info) this._windowManager.closeWindow(info.id);
    });

    ipcMain.handle("erp:list-windows", () => {
      return this._windowManager.listWindows();
    });

    ipcMain.handle("erp:focus-window", (_event, windowId) => {
      this._windowManager.focusWindow(windowId);
    });

    ipcMain.handle("erp:get-current-window", (event) => {
      return this._windowManager.getWindowInfoByContents(event.sender) || null;
    });

    // ── Backup & Restore IPC (new) ────────────────────────────────────────

    ipcMain.handle("backup-data-folder", async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "اختر مجلد لحفظ النسخة الاحتياطية",
          properties: ["openDirectory"],
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
        
        const destBase = result.filePaths[0];
        const dateStr = new Date().toISOString().replace(/T/, "_").replace(/:/g, "-").slice(0, 16);
        const destFolder = path.join(destBase, `ShoeStorePOS_Backup_${dateStr}`);
        
        await this._copyDataFolderSafe(this._appDataDir, destFolder);
        return { success: true, path: destFolder };
      } catch (e) {
        this._log("error", "Backup manual failed", { error: e.message });
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle("restore-data-folder", async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "اختر مجلد النسخة الاحتياطية لاسترجاعها",
          properties: ["openDirectory"],
        });
        if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };

        const srcFolder = result.filePaths[0];
        // Basic validation: ensure store.db or sqlite.db exists in the selected folder
        if (!fs.existsSync(path.join(srcFolder, "store.db")) && !fs.existsSync(path.join(srcFolder, "sqlite.db"))) {
          return { success: false, error: "المجلد المحدد لا يحتوي على قاعدة البيانات" };
        }

        // We must stop the API server before overwriting the database
        await this._stopApiServer();

        // Copy files back
        await this._copyDataFolderSafe(srcFolder, this._appDataDir);

        // Restart app to load new database
        app.relaunch();
        app.quit();
        return { success: true };
      } catch (e) {
        this._log("error", "Restore manual failed", { error: e.message });
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle("get-backup-settings", () => {
      try {
        if (fs.existsSync(this._backupSettingsPath)) {
          return JSON.parse(fs.readFileSync(this._backupSettingsPath, "utf8"));
        }
      } catch (e) {
        this._log("error", "Failed to read backup settings", { error: e.message });
      }
      return { autoBackupEnabled: false, autoBackupPath: "" };
    });

    ipcMain.handle("save-backup-settings", (_event, settings) => {
      try {
        fs.writeFileSync(this._backupSettingsPath, JSON.stringify(settings, null, 2));
        this._setupAutoBackup(); // Apply immediately
        return { success: true };
      } catch (e) {
        this._log("error", "Failed to save backup settings", { error: e.message });
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle("select-directory", async () => {
      try {
        const result = await dialog.showOpenDialog({
          title: "اختر مجلداً",
          properties: ["openDirectory"],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          return { success: true, path: result.filePaths[0] };
        }
        return { success: false, canceled: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    // Renderer tells us when the route changes so we can persist it
    ipcMain.on("erp:route-changed", (event, route) => {
      const info = this._windowManager.getWindowInfoByContents(event.sender);
      if (info) {
        this._windowManager.setLastRoute(info.id, route);
      }
    });
  }

  // =========================================================================
  // Auto-updater
  // =========================================================================

  _setupAutoUpdater() {
    if (!app.isPackaged) return;

    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on("update-available", (info) => {
      this._log("info", "Update available", { version: info.version });
      const wins = this._windowManager.listWindows();
      if (wins.length > 0) {
        const { BrowserWindow: BW } = require("electron");
        const bw = BW.getAllWindows()[0];
        dialog.showMessageBox(bw, {
          type: "info",
          title: "تحديث متاح",
          message: `إصدار جديد (${info.version}) متاح. سيتم تنزيله في الخلفية.`,
          buttons: ["حسناً"],
        });
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      this._log("info", "Update downloaded", { version: info.version });
      const { BrowserWindow: BW } = require("electron");
      const bw = BW.getAllWindows()[0];
      dialog
        .showMessageBox(bw, {
          type: "info",
          title: "تحديث جاهز للتثبيت",
          message: `تم تنزيل الإصدار ${info.version}. سيتم التثبيت عند إغلاق التطبيق.`,
          buttons: ["تثبيت الآن", "لاحقاً"],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            this._isQuitting = true;
            autoUpdater.quitAndInstall();
          }
        });
    });

    autoUpdater.on("error", (err) => {
      this._log("error", "Auto-updater error", { message: err.message });
    });
  }

  // =========================================================================
  // App lifecycle
  // =========================================================================

  _setupLifecycleEvents() {
    // macOS: re-create a window when dock icon is clicked
    app.on("activate", () => {
      if (this._windowManager.getWindowCount() === 0) {
        this._createNewWindow();
      }
    });

    // Windows / Linux: quit when all windows are closed
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("before-quit", async (event) => {
      if (this._apiProcess && !this._isQuitting) {
        event.preventDefault();
        this._isQuitting = true;
        this._shortcutManager.unregister();
        this._log("info", "App quitting — stopping API server...");
        await this._stopApiServer();
        app.quit();
      }
    });
  }

  // =========================================================================
  // Secret & DB helpers (preserved from original main.js)
  // =========================================================================

  _getOrCreateSecret() {
    if (fs.existsSync(this._secretPath)) {
      const secret = fs.readFileSync(this._secretPath, "utf8").trim();
      if (secret.length >= 32) {
        this._log("info", "Loaded existing SESSION_SECRET");
        return secret;
      }
    }
    const secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(this._secretPath, secret, { mode: 0o600 });
    this._log("info", "Generated new SESSION_SECRET");
    return secret;
  }

  _initDatabase() {
    const exists = fs.existsSync(this._dbPath);
    if (!exists) {
      this._log("info", "Database not found, copying seed database...");
      const seedPath = path.join(this._assetsDir, "seed.db");
      if (fs.existsSync(seedPath)) {
        fs.copyFileSync(seedPath, this._dbPath);
        this._log("info", "Seed database copied successfully");
      } else {
        this._log("error", "Seed database not found at " + seedPath);
      }
    } else {
      this._log("info", `Database path: ${this._dbPath}`, { exists });
    }
  }

  /**
   * _runMigrations()
   *
   * Applies any missing schema changes to the active store.db.
   * Safe to run on every startup — all DDL uses IF NOT EXISTS guards.
   *
   * Migrations covered:
   *   1. treasury_transfers table
   *   2. treasury_adjustments table
   *   3. salary_records.pay_period_type column
   *   4. salary_records.advance_deduction column
   *   5. salary_records.other_deductions column
   *   6. associations table
   *   7. association_transactions table
   */
  async _runMigrations() {
    this._log("info", "Running schema migrations...", { db: this._dbPath });

    // Use @libsql/client for direct SQLite access (same driver as the API server)
    let client;
    try {
      const { createClient } = require("@libsql/client");
      client = createClient({ url: `file:${this._dbPath}` });
    } catch (err) {
      this._log("warn", "Could not load @libsql/client for migrations — skipping", { message: err.message });
      return;
    }

    const tableExists = async (name) => {
      const res = await client.execute(
        `SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='${name}'`
      );
      return Number(res.rows[0][0] ?? res.rows[0].cnt ?? 0) > 0;
    };

    const columnExists = async (table, column) => {
      const info = await client.execute(`PRAGMA table_info("${table}")`);
      return info.rows.some((r) => r[1] === column || r.name === column);
    };

    try {
      // ── Migration 1: treasury_transfers ──────────────────────────────────
      if (!(await tableExists("treasury_transfers"))) {
        await client.execute(`
          CREATE TABLE IF NOT EXISTS treasury_transfers (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
            from_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
            to_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
            amount TEXT NOT NULL,
            description TEXT,
            created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
            created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
          )
        `);
        await client.execute(
          `CREATE INDEX IF NOT EXISTS treasury_transfers_store_idx ON treasury_transfers(store_id, created_at)`
        );
        this._log("info", "Migration: created treasury_transfers");
      }

      // ── Migration 2: treasury_adjustments ────────────────────────────────
      if (!(await tableExists("treasury_adjustments"))) {
        await client.execute(`
          CREATE TABLE IF NOT EXISTS treasury_adjustments (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
            treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
            direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
            amount TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
            created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
          )
        `);
        await client.execute(
          `CREATE INDEX IF NOT EXISTS treasury_adjustments_store_idx ON treasury_adjustments(store_id, created_at)`
        );
        this._log("info", "Migration: created treasury_adjustments");
      }

      // ── Migration 3: salary_records.pay_period_type ───────────────────────
      if (!(await columnExists("salary_records", "pay_period_type"))) {
        await client.execute(
          `ALTER TABLE salary_records ADD COLUMN pay_period_type TEXT NOT NULL DEFAULT 'MONTHLY'`
        );
        this._log("info", "Migration: added salary_records.pay_period_type");
      }

      // ── Migration 4: salary_records.advance_deduction ─────────────────────
      if (!(await columnExists("salary_records", "advance_deduction"))) {
        await client.execute(
          `ALTER TABLE salary_records ADD COLUMN advance_deduction TEXT NOT NULL DEFAULT '0'`
        );
        this._log("info", "Migration: added salary_records.advance_deduction");
      }

      // ── Migration 5: salary_records.other_deductions ──────────────────────
      if (!(await columnExists("salary_records", "other_deductions"))) {
        await client.execute(
          `ALTER TABLE salary_records ADD COLUMN other_deductions TEXT NOT NULL DEFAULT '0'`
        );
        this._log("info", "Migration: added salary_records.other_deductions");
      }

      // ── Migration 6: associations ─────────────────────────────────────────
      if (!(await tableExists("associations"))) {
        await client.execute(`
          CREATE TABLE IF NOT EXISTS associations (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
            name TEXT NOT NULL,
            description TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT,
            expected_return_date TEXT,
            status TEXT NOT NULL DEFAULT 'ACTIVE',
            contribution_frequency TEXT NOT NULL DEFAULT 'NONE',
            contribution_amount TEXT,
            notes TEXT,
            created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
            created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)),
            updated_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
          )
        `);
        await client.execute(
          `CREATE INDEX IF NOT EXISTS associations_store_idx ON associations(store_id, status)`
        );
        await client.execute(
          `CREATE UNIQUE INDEX IF NOT EXISTS associations_store_name_unique ON associations(store_id, name)`
        );
        this._log("info", "Migration: created associations");
      }

      // ── Migration 7: association_transactions ─────────────────────────────
      if (!(await tableExists("association_transactions"))) {
        await client.execute(`
          CREATE TABLE IF NOT EXISTS association_transactions (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
            association_id TEXT NOT NULL REFERENCES associations(id) ON DELETE RESTRICT,
            type TEXT NOT NULL,
            amount TEXT NOT NULL,
            transaction_date TEXT NOT NULL,
            treasury_account_id TEXT NOT NULL REFERENCES treasury_accounts(id) ON DELETE RESTRICT,
            reference_number TEXT,
            notes TEXT,
            is_reversed INTEGER NOT NULL DEFAULT 0,
            reversal_of_id TEXT,
            created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
            created_at INTEGER NOT NULL DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))
          )
        `);
        await client.execute(
          `CREATE INDEX IF NOT EXISTS assoc_tx_association_idx ON association_transactions(association_id, transaction_date)`
        );
        await client.execute(
          `CREATE INDEX IF NOT EXISTS assoc_tx_store_idx ON association_transactions(store_id, created_at)`
        );
        await client.execute(
          `CREATE INDEX IF NOT EXISTS assoc_tx_treasury_idx ON association_transactions(treasury_account_id)`
        );
        this._log("info", "Migration: created association_transactions");
      }

      this._log("info", "Schema migrations complete");
    } catch (err) {
      this._log("error", "Schema migration failed", { message: err.message, stack: err.stack });
      // Do not throw — log the error and let the API server start anyway.
      // A hard crash here would prevent existing users from launching the app at all.
    } finally {
      try { client.close(); } catch (_) {}
    }
  }

  /**
   * Handle a second-instance launch event.
   * Instead of focusing the existing window (old behavior),
   * we open a NEW window in the existing process.
   */
  handleSecondInstance() {
    this._log("info", "Second instance detected — opening new window");
    this._createNewWindow();
  }

  // =========================================================================
  // Backup Helpers
  // =========================================================================

  _setupAutoBackup() {
    if (this._autoBackupInterval) {
      clearInterval(this._autoBackupInterval);
      this._autoBackupInterval = null;
    }

    try {
      if (!fs.existsSync(this._backupSettingsPath)) return;
      const settings = JSON.parse(fs.readFileSync(this._backupSettingsPath, "utf8"));
      
      if (settings.autoBackupEnabled && settings.autoBackupPath) {
        this._log("info", "Auto-backup enabled", { path: settings.autoBackupPath });
        
        // Every 5 hours: 5 * 60 * 60 * 1000 = 18000000
        this._autoBackupInterval = setInterval(() => {
          this._performAutoBackup(settings.autoBackupPath);
        }, 18000000);
      }
    } catch (e) {
      this._log("error", "Failed to setup auto backup", { error: e.message });
    }
  }

  async _performAutoBackup(destBase) {
    try {
      if (!fs.existsSync(destBase)) {
        this._log("warn", "Auto-backup destination does not exist", { path: destBase });
        return;
      }
      
      const destFolder = path.join(destBase, "ShoeStorePOS_AutoBackup");
      
      // Delete old backup if it exists
      if (fs.existsSync(destFolder)) {
        fs.rmSync(destFolder, { recursive: true, force: true });
      }
      
      await this._copyDataFolderSafe(this._appDataDir, destFolder);
      this._log("info", "Auto-backup completed successfully", { destFolder });
    } catch (e) {
      this._log("error", "Auto-backup failed", { error: e.message });
    }
  }

  async _copyDataFolderSafe(src, dest) {
    const { promises: fsPromises } = require("fs");
    if (!fs.existsSync(dest)) {
      await fsPromises.mkdir(dest, { recursive: true });
    }
    
    // We only backup the essential database and config files to avoid locking issues,
    // save space, and prevent infinite recursion or UI blocking.
    const filesToBackup = [
      "store.db",
      "store.db-wal",
      "store.db-shm",
      "sqlite.db",
      "sqlite.db-wal",
      "sqlite.db-shm",
      "license.dat",
      "backup-settings.json",
      "printer-settings.json",
      "windows.json",
      "secret.key"
    ];

    for (const fileName of filesToBackup) {
      const srcPath = path.join(src, fileName);
      const destPath = path.join(dest, fileName);
      
      if (fs.existsSync(srcPath)) {
        try {
          await fsPromises.copyFile(srcPath, destPath);
        } catch (e) {
          this._log("warn", `Could not copy ${srcPath} during backup: ${e.message}`);
        }
      }
    }
  }
}

module.exports = { ApplicationManager };
