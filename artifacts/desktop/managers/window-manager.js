"use strict";

/**
 * WindowManager — Enterprise Multi-Window Lifecycle
 *
 * Manages all BrowserWindow instances for the ERP application.
 * Behaves like VS Code / Google Chrome: one Electron process,
 * unlimited independent ERP windows, each with its own isolated session.
 *
 * Responsibilities:
 *   - Create windows (each with a unique `persist:` session partition)
 *   - Close windows (save state → push to closed stack)
 *   - Restore closed windows (pop from stack, recreate with same partition)
 *   - Persist/restore window bounds, position, maximized, fullscreen, lastRoute
 *   - Focus / track active window
 *   - Broadcast IPC to all windows
 *   - Clean up — no memory leaks
 */

const { BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const WINDOW_STATE_VERSION = 1;

class WindowManager {
  /**
   * @param {object} opts
   * @param {string}  opts.apiBase            e.g. "http://localhost:5001"
   * @param {string}  opts.preloadPath        absolute path to preload.js
   * @param {string}  opts.iconPath           absolute path to icon.png
   * @param {string}  opts.stateFilePath      absolute path to windows.json
   * @param {string}  opts.appTitle           window title
   * @param {object}  opts.sessionManager     SessionManager instance
   * @param {Function} opts.log               log(level, msg, meta?)
   * @param {boolean} opts.isDev              whether running in dev mode
   */
  constructor(opts) {
    this._apiBase = opts.apiBase;
    this._preloadPath = opts.preloadPath;
    this._iconPath = opts.iconPath;
    this._stateFilePath = opts.stateFilePath;
    this._appTitle = opts.appTitle || "ERP";
    this._sessionManager = opts.sessionManager;
    this._log = opts.log || (() => {});
    this._isDev = opts.isDev || false;

    /** @type {Map<string, BrowserWindow>}  windowId → BrowserWindow */
    this._windows = new Map();

    /** @type {string|null}  id of the currently focused window */
    this._activeWindowId = null;

    /**
     * Closed-window stack — most-recently-closed first (for Ctrl+Shift+T).
     * Each entry: { id, partition, bounds, isMaximized, isFullScreen, lastRoute }
     * @type {Array<object>}
     */
    this._closedStack = [];

    // Load persisted state (restores bounds for windows opened at startup)
    this._persistedState = this._loadState();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create and show a new ERP window.
   *
   * @param {object} [opts]
   * @param {string} [opts.partition]     Use an existing partition (for restore)
   * @param {string} [opts.windowId]      Use a specific ID (for restore)
   * @param {object} [opts.bounds]        { x, y, width, height }
   * @param {boolean} [opts.isMaximized]
   * @param {boolean} [opts.isFullScreen]
   * @param {string}  [opts.lastRoute]    Route to navigate to after load
   * @returns {BrowserWindow}
   */
  createWindow(opts = {}) {
    const windowId = opts.windowId || crypto.randomBytes(8).toString("hex");
    const partition =
      opts.partition || this._sessionManager.createPartition();

    // Register the partition mapping
    this._sessionManager.registerPartition(windowId, partition);

    // Restore persisted bounds or use defaults
    const savedBounds = opts.bounds || this._getSavedBounds(windowId);
    const bounds = {
      width: savedBounds?.width || 1400,
      height: savedBounds?.height || 900,
      ...(savedBounds?.x != null ? { x: savedBounds.x } : {}),
      ...(savedBounds?.y != null ? { y: savedBounds.y } : {}),
    };

    const win = new BrowserWindow({
      ...bounds,
      minWidth: 1024,
      minHeight: 700,
      title: this._appTitle,
      icon: this._iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // required for preload with require()
        preload: this._preloadPath,
        webSecurity: true,
        partition,
      },
      backgroundColor: "#0f172a",
      show: false,
    });

    // Restore maximized / fullscreen state
    if (opts.isMaximized || this._getSavedMaximized(windowId)) {
      win.maximize();
    }
    if (opts.isFullScreen || this._getSavedFullScreen(windowId)) {
      win.setFullScreen(true);
    }

    // Attach the windowId as a custom property for IPC lookups
    win._erpWindowId = windowId;

    this._windows.set(windowId, win);

    // ----- Load the URL -----
    const url = this._apiBase;
    win.loadURL(url).catch((err) => {
      this._log("error", "Failed to load URL in window", {
        windowId,
        url,
        error: err.message,
      });
    });

    // ----- Event wiring -----
    win.once("ready-to-show", () => {
      win.show();
      this._log("info", "Window ready", { windowId, partition });

      // Navigate to the last route if provided
      const route = opts.lastRoute || this._getSavedRoute(windowId);
      if (route && route !== "/" && route !== "") {
        // Send the route to the renderer so the SPA can navigate there
        win.webContents.send("erp:navigate", route);
      }
    });

    win.on("focus", () => {
      this._activeWindowId = windowId;
    });

    // Periodically save bounds while the window is live
    const saveStateBound = () => this._saveWindowState(windowId, win);
    win.on("resize", saveStateBound);
    win.on("move", saveStateBound);
    win.on("maximize", saveStateBound);
    win.on("unmaximize", saveStateBound);
    win.on("enter-full-screen", saveStateBound);
    win.on("leave-full-screen", saveStateBound);

    win.on("close", () => {
      // Save final state before closing
      this._saveWindowState(windowId, win);

      // Push to closed stack for Ctrl+Shift+T restore
      this._closedStack.unshift({
        id: windowId,
        partition,
        bounds: win.isMaximized()
          ? { width: 1400, height: 900 }
          : win.getBounds(),
        isMaximized: win.isMaximized(),
        isFullScreen: win.isFullScreen(),
        lastRoute: this._getLastRoute(windowId),
      });

      // Keep the stack bounded
      if (this._closedStack.length > 20) {
        this._closedStack.pop();
      }
    });

    win.on("closed", () => {
      // Unregister from manager
      this._windows.delete(windowId);
      this._sessionManager.unregisterPartition(windowId);

      if (this._activeWindowId === windowId) {
        // Focus the most recent remaining window
        const last = [...this._windows.values()].pop();
        if (last && !last.isDestroyed()) {
          last.focus();
          this._activeWindowId = last._erpWindowId;
        } else {
          this._activeWindowId = null;
        }
      }

      // Persist updated state
      this._persistState();
    });

    // Open external links in the system browser
    win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
      shell.openExternal(targetUrl);
      return { action: "deny" };
    });

    // Dev tools in development
    if (this._isDev) {
      win.webContents.openDevTools({ mode: "detach" });
    }

    this._activeWindowId = windowId;
    this._persistState();

    this._log("info", "Window created", { windowId, partition });
    return win;
  }

  /**
   * Close the window with the given ID (or the active window).
   * @param {string} [windowId]
   */
  closeWindow(windowId) {
    const id = windowId || this._activeWindowId;
    if (!id) return;
    const win = this._windows.get(id);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }

  /**
   * Restore the most-recently-closed window (Ctrl+Shift+T).
   * @returns {BrowserWindow|null}
   */
  restoreClosedWindow() {
    const entry = this._closedStack.shift();
    if (!entry) {
      this._log("info", "No closed windows to restore");
      return null;
    }
    this._log("info", "Restoring closed window", { id: entry.id });
    return this.createWindow({
      partition: entry.partition,
      windowId: entry.id,
      bounds: entry.bounds,
      isMaximized: entry.isMaximized,
      isFullScreen: entry.isFullScreen,
      lastRoute: entry.lastRoute,
    });
  }

  /**
   * Bring a window to the foreground.
   * @param {string} windowId
   */
  focusWindow(windowId) {
    const win = this._windows.get(windowId);
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  }

  /**
   * Switch focus to the next window in the list (Ctrl+Tab).
   */
  focusNextWindow() {
    const ids = [...this._windows.keys()];
    if (ids.length <= 1) return;
    const currentIndex = ids.indexOf(this._activeWindowId);
    const nextIndex = (currentIndex + 1) % ids.length;
    this.focusWindow(ids[nextIndex]);
  }

  /**
   * Return the number of open windows.
   * @returns {number}
   */
  getWindowCount() {
    return this._windows.size;
  }

  /**
   * Return the ID of the currently focused window.
   * @returns {string|null}
   */
  getActiveWindowId() {
    return this._activeWindowId;
  }

  /**
   * Return summary info for all open windows.
   * @returns {Array<{id: string, title: string, partition: string}>}
   */
  listWindows() {
    const result = [];
    for (const [id, win] of this._windows) {
      if (!win.isDestroyed()) {
        result.push({
          id,
          title: win.getTitle(),
          partition: win.webPreferences?.partition || "",
          isActive: id === this._activeWindowId,
        });
      }
    }
    return result;
  }

  /**
   * Return info about the window that sent an IPC event.
   * @param {Electron.WebContents} webContents
   * @returns {{id: string, partition: string}|null}
   */
  getWindowInfoByContents(webContents) {
    for (const [id, win] of this._windows) {
      if (!win.isDestroyed() && win.webContents.id === webContents.id) {
        return {
          id,
          partition: win.webPreferences?.partition || "",
          isActive: id === this._activeWindowId,
        };
      }
    }
    return null;
  }

  /**
   * Send an IPC message to all open windows.
   * @param {string} channel
   * @param {...any} args
   */
  broadcastToAll(channel, ...args) {
    for (const win of this._windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    }
  }

  /**
   * Close all open windows.
   */
  closeAllWindows() {
    for (const win of this._windows.values()) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
  }

  /**
   * Store the current route for a window (sent via IPC from the renderer).
   * @param {string} windowId
   * @param {string} route
   */
  setLastRoute(windowId, route) {
    this._lastRoutes = this._lastRoutes || new Map();
    this._lastRoutes.set(windowId, route);
  }

  /**
   * Restore all windows from persisted state (called at app startup).
   * @returns {boolean}  true if any windows were restored
   */
  restorePersistedWindows() {
    const state = this._persistedState;
    if (!state || !Array.isArray(state.windows) || state.windows.length === 0) {
      return false;
    }
    let restored = 0;
    for (const w of state.windows) {
      if (w.partition) {
        this.createWindow({
          windowId: w.id,
          partition: w.partition,
          bounds: w.bounds,
          isMaximized: w.isMaximized,
          isFullScreen: w.isFullScreen,
          lastRoute: w.lastRoute,
        });
        restored++;
      }
    }
    // Restore the closed-window stack too
    if (Array.isArray(state.closedWindows)) {
      this._closedStack = state.closedWindows.slice(0, 20);
    }
    return restored > 0;
  }

  // -------------------------------------------------------------------------
  // Private — state persistence
  // -------------------------------------------------------------------------

  _getLastRoute(windowId) {
    return (this._lastRoutes && this._lastRoutes.get(windowId)) || "/dashboard";
  }

  _saveWindowState(windowId, win) {
    if (win.isDestroyed()) return;
    const bounds = win.isMaximized() ? undefined : win.getBounds();
    const state = this._persistedState || { version: WINDOW_STATE_VERSION, windows: [], closedWindows: [] };
    const existing = state.windows.find((w) => w.id === windowId);
    const entry = {
      id: windowId,
      partition: win.webPreferences?.partition || "",
      bounds: bounds || (existing && existing.bounds) || { width: 1400, height: 900 },
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
      lastRoute: this._getLastRoute(windowId),
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      state.windows.push(entry);
    }
    this._persistedState = state;
    // Debounce disk write
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persistState(), 500);
  }

  _persistState() {
    const state = {
      version: WINDOW_STATE_VERSION,
      windows: [],
      closedWindows: this._closedStack.slice(0, 20),
    };

    for (const [id, win] of this._windows) {
      if (!win.isDestroyed()) {
        const partition = win.webPreferences?.partition || "";
        const bounds = win.isMaximized() ? undefined : win.getBounds();
        const prev = this._persistedState?.windows?.find((w) => w.id === id);
        state.windows.push({
          id,
          partition,
          bounds: bounds || (prev && prev.bounds) || { width: 1400, height: 900 },
          isMaximized: win.isMaximized(),
          isFullScreen: win.isFullScreen(),
          lastRoute: this._getLastRoute(id),
        });
      }
    }

    this._persistedState = state;
    try {
      fs.writeFileSync(this._stateFilePath, JSON.stringify(state, null, 2), "utf8");
    } catch (err) {
      this._log("warn", "Failed to persist window state", { error: err.message });
    }
  }

  _loadState() {
    try {
      if (fs.existsSync(this._stateFilePath)) {
        const raw = fs.readFileSync(this._stateFilePath, "utf8");
        return JSON.parse(raw);
      }
    } catch {
      // Corrupted state — start fresh
    }
    return null;
  }

  _getSavedBounds(windowId) {
    const w = this._persistedState?.windows?.find((e) => e.id === windowId);
    return w?.bounds || null;
  }

  _getSavedMaximized(windowId) {
    const w = this._persistedState?.windows?.find((e) => e.id === windowId);
    return w?.isMaximized || false;
  }

  _getSavedFullScreen(windowId) {
    const w = this._persistedState?.windows?.find((e) => e.id === windowId);
    return w?.isFullScreen || false;
  }

  _getSavedRoute(windowId) {
    const w = this._persistedState?.windows?.find((e) => e.id === windowId);
    return w?.lastRoute || null;
  }
}

module.exports = { WindowManager };
