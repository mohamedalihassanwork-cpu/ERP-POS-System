"use strict";

/**
 * Electron Main Process — ERP Desktop Application
 *
 * Entry point. Responsibilities are now delegated to manager classes:
 *
 *   ApplicationManager  — initialization, lifecycle, IPC, API server
 *   WindowManager       — multi-window lifecycle, state persistence
 *   SessionManager      — per-window isolated session partitions
 *   MenuManager         — application menu
 *   ShortcutManager     — global keyboard shortcuts
 *
 * This file is intentionally lean: set paths, configure logging, acquire the
 * single-instance lock, then hand off to ApplicationManager.
 */

const { app, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { ApplicationManager } = require("./managers/application-manager");

// ---------------------------------------------------------------------------
// Override userData path early — before any lock requests — to avoid Windows
// path issues caused by the pnpm workspace package name containing a slash
// (@workspace/desktop).
// ---------------------------------------------------------------------------
app.setPath("userData", path.join(app.getPath("appData"), "ShoeStorePOS"));

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const APP_DATA_DIR = app.getPath("userData");
const DB_PATH = path.join(APP_DATA_DIR, "store.db");
const SECRET_PATH = path.join(APP_DATA_DIR, "secret.key");
const LOG_PATH = path.join(APP_DATA_DIR, "app.log");
const PRINTER_SETTINGS_PATH = path.join(APP_DATA_DIR, "printer-settings.json");

// ---------------------------------------------------------------------------
// Simple file logger (before pino is available)
// ---------------------------------------------------------------------------
function ensureAppDataDir() {
  if (!fs.existsSync(APP_DATA_DIR)) {
    fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  }
}

function log(level, message, meta) {
  const entry = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${
    meta ? " " + JSON.stringify(meta) : ""
  }\n`;
  process.stdout.write(entry);
  try {
    fs.appendFileSync(LOG_PATH, entry);
  } catch {
    // Ignore log write errors
  }
}

// ---------------------------------------------------------------------------
// Single-instance lock
//
// If the executable is launched again, DO NOT create another Electron process.
// Instead, send a signal to the running instance which opens a new ERP window.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Another instance is already running — quit this one immediately.
  log("warn", "Another instance is already running — quitting");
  app.quit();
} else {
  // We are the primary instance.
  // Ensure the AppData directory exists before anything else.
  ensureAppDataDir();

  // Create the ApplicationManager
  const appManager = new ApplicationManager({
    appDataDir: APP_DATA_DIR,
    dbPath: DB_PATH,
    secretPath: SECRET_PATH,
    logPath: LOG_PATH,
    printerSettingsPath: PRINTER_SETTINGS_PATH,
    iconPath: path.join(__dirname, "assets", "icon.png"),
    preloadPath: path.join(__dirname, "preload.js"),
    assetsDir: path.join(__dirname, "assets"),
    log,
  });

  // Handle second-instance: open a new ERP window in the current process
  app.on("second-instance", () => {
    appManager.handleSecondInstance();
  });

  // Boot the application
  app.whenReady().then(async () => {
    try {
      log("info", "Electron app ready", { version: app.getVersion() });
      await appManager.initialize();
    } catch (err) {
      log("error", "Fatal startup error", {
        message: err.message,
        stack: err.stack,
      });
      dialog.showErrorBox(
        "خطأ في بدء التشغيل",
        `فشل تشغيل التطبيق:\n${err.message}\n\nتحقق من ملف السجل:\n${LOG_PATH}`
      );
      app.quit();
    }
  });
}
