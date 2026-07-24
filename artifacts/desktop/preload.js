"use strict";

/**
 * Electron Preload Script — contextBridge IPC exposure
 *
 * This script runs in an isolated context with access to Node.js APIs,
 * and safely exposes a limited set of capabilities to the renderer process
 * (the React SPA) via two namespaces:
 *
 *   window.electronAPI   — existing desktop API (printing, version, etc.)
 *   window.erp           — multi-window management API (new)
 *
 * Security:
 * - contextIsolation: true  →  renderer JS cannot access Node.js or Electron APIs
 * - nodeIntegration: false  →  renderer cannot use require()
 * - contextBridge          →  only explicitly exposed APIs are accessible
 */

const { contextBridge, ipcRenderer } = require("electron");

// ---------------------------------------------------------------------------
// window.electronAPI — existing desktop capabilities (unchanged)
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * Identifies that the app is running inside Electron (not a browser).
   * The React SPA checks this to conditionally show desktop-only features.
   */
  platform: "electron",

  /**
   * Silent printing via a dedicated hidden window.
   *
   * @param {Object} options
   * @param {string}  options.html               - Full HTML document to print
   * @param {boolean} [options.silent=true]      - Skip print dialog
   * @param {string}  [options.deviceName]       - Printer device name (omit = default)
   * @param {string|Object} [options.pageSize]   - "A4" or { width, height } in microns
   * @param {number}  [options.copies=1]         - Number of copies
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  print: (options) => ipcRenderer.invoke("print", options),

  /**
   * Get list of installed printers.
   * @returns {Promise<Array<{name: string, description: string, status: number, isDefault: boolean}>>}
   */
  getPrinters: () => ipcRenderer.invoke("get-printers"),

  /**
   * Get the current application version (from package.json).
   * @returns {Promise<string>}  e.g. "1.0.0"
   */
  getVersion: () => ipcRenderer.invoke("get-version"),

  /**
   * Open the application data folder in Windows Explorer.
   * Useful for IT support / backups.
   */
  openDataFolder: () => ipcRenderer.invoke("open-data-folder"),

  /**
   * Get configured printer settings.
   */
  getPrinterSettings: () => ipcRenderer.invoke("get-printer-settings"),

  /**
   * Save configured printer settings.
   */
  savePrinterSettings: (settings) =>
    ipcRenderer.invoke("save-printer-settings", settings),

  // Backup & Restore
  backupDataFolder: () => ipcRenderer.invoke("backup-data-folder"),
  restoreDataFolder: () => ipcRenderer.invoke("restore-data-folder"),
  getBackupSettings: () => ipcRenderer.invoke("get-backup-settings"),
  saveBackupSettings: (settings) => ipcRenderer.invoke("save-backup-settings", settings),
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
});

// ---------------------------------------------------------------------------
// window.erp — multi-window management (new)
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld("erp", {
  /**
   * Open a new independent ERP window with its own isolated session.
   * @returns {Promise<void>}
   */
  createWindow: () => ipcRenderer.invoke("erp:create-window"),

  /**
   * Close the current window.
   * @returns {Promise<void>}
   */
  closeWindow: () => ipcRenderer.invoke("erp:close-window"),

  /**
   * List all open windows.
   * @returns {Promise<Array<{id: string, title: string, partition: string, isActive: boolean}>>}
   */
  listWindows: () => ipcRenderer.invoke("erp:list-windows"),

  /**
   * Bring the specified window to the foreground.
   * @param {string} windowId
   * @returns {Promise<void>}
   */
  focusWindow: (windowId) => ipcRenderer.invoke("erp:focus-window", windowId),

  /**
   * Get info about the current window.
   * @returns {Promise<{id: string, partition: string, isActive: boolean} | null>}
   */
  getCurrentWindow: () => ipcRenderer.invoke("erp:get-current-window"),

  /**
   * Notify the main process that the route has changed.
   * This is used to persist the last route so windows can be restored to the
   * correct page.
   * @param {string} route  e.g. "/dashboard"
   */
  notifyRouteChanged: (route) =>
    ipcRenderer.send("erp:route-changed", route),
});
