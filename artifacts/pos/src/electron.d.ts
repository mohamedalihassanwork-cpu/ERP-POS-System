/// <reference types="vite/client" />

/**
 * Type declarations for the Electron contextBridge API.
 *
 * These types are only available when the app runs inside Electron.
 * In a regular browser, `window.electronAPI` is undefined.
 *
 * Usage:
 *   if (window.electronAPI?.platform === 'electron') {
 *     // desktop-only code
 *   }
 */

interface ElectronPrinter {
  /** Printer device name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Printer status code (0 = idle) */
  status: number;
  /** Whether this is the system default printer */
  isDefault: boolean;
}

interface ElectronPrintOptions {
  /** Whether to skip the print dialog. Defaults to true. */
  silent?: boolean;
  /** Full HTML document to print (required in Electron). */
  html?: string;
  /** Printer device name. Omit to use the system default printer. */
  deviceName?: string;
  /**
   * Page size: named paper (e.g. "A4") or { width, height } in microns.
   * Omit for thermal roll printers — the driver default is used.
   */
  pageSize?: string | { width: number; height: number };
  /** Number of copies to print. Defaults to 1. */
  copies?: number;
}

interface ElectronPrintResult {
  success: boolean;
  error?: string;
}

interface ElectronAPI {
  /**
   * Identifies that the app is running inside Electron.
   * Always "electron" — use this to detect the desktop environment.
   */
  readonly platform: "electron";

  /**
   * Print an HTML document silently (no dialog) to the specified printer.
   * Loads the HTML in a hidden window and sends it to the printer.
   */
  print(options: ElectronPrintOptions): Promise<ElectronPrintResult>;

  /**
   * Get the list of installed printers from the OS.
   */
  getPrinters(): Promise<ElectronPrinter[]>;

  /**
   * Get the current app version string (e.g. "1.0.0").
   */
  getVersion(): Promise<string>;

  /**
   * Open the AppData folder (%APPDATA%/ShoeStorePOS) in Windows Explorer.
   * Useful for taking manual backups of the SQLite database.
   */
  openDataFolder(): Promise<void>;

  /**
   * Get configured printer settings.
   */
  getPrinterSettings: () => Promise<PrinterSettings>;
  savePrinterSettings: (
    settings: PrinterSettings,
  ) => Promise<{ success: boolean; error?: string }>;

  backupDataFolder: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
  restoreDataFolder: () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  getBackupSettings: () => Promise<{ autoBackupEnabled: boolean; autoBackupPath: string }>;
  saveBackupSettings: (settings: { autoBackupEnabled: boolean; autoBackupPath: string }) => Promise<{ success: boolean; error?: string }>;
  selectDirectory: () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
}

interface PrinterSettings {
  receiptPrinter?: string;
  barcodePrinter?: string;
  invoicePrinter?: string;
}

/** Info about a single open ERP window */
interface ErpWindowInfo {
  /** Unique window identifier */
  id: string;
  /** Window title */
  title: string;
  /** Electron session partition string e.g. "persist:erp-window-uuid" */
  partition: string;
  /** Whether this is the currently focused window */
  isActive: boolean;
}

/** Multi-window management API exposed via window.erp */
interface ErpAPI {
  /**
   * Open a new independent ERP window with its own isolated session.
   * Equivalent to Ctrl+Shift+N.
   */
  createWindow(): Promise<void>;

  /**
   * Close the current window.
   * Equivalent to Ctrl+W.
   */
  closeWindow(): Promise<void>;

  /**
   * List all currently open ERP windows.
   */
  listWindows(): Promise<ErpWindowInfo[]>;

  /**
   * Bring the specified window to the foreground.
   * @param windowId  The window's unique identifier
   */
  focusWindow(windowId: string): Promise<void>;

  /**
   * Get info about the current window (the one this code is running in).
   * Returns null if called outside Electron.
   */
  getCurrentWindow(): Promise<ErpWindowInfo | null>;

  /**
   * Notify the main process that the React Router route has changed.
   * Used to persist the last route so the window can be restored to the
   * correct page after a restart.
   * @param route  e.g. "/dashboard"
   */
  notifyRouteChanged(route: string): void;
}

interface Window {
  /**
   * Electron IPC bridge exposed via contextBridge in preload.js.
   * `undefined` when running in a regular browser.
   */
  electronAPI?: ElectronAPI;

  /**
   * Multi-window management API exposed via contextBridge in preload.js.
   * `undefined` when running in a regular browser.
   */
  erp?: ErpAPI;
}
