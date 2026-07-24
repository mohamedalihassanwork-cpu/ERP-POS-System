"use strict";

/**
 * ShortcutManager — Global Keyboard Shortcuts
 *
 * Registers app-wide accelerators that work even when the window is not focused.
 *
 * Shortcuts:
 *   Ctrl+Shift+N   New ERP Window
 *   Ctrl+Shift+T   Restore Closed Window
 *   Ctrl+W         Close Active Window
 *   Ctrl+Shift+W   Close All Windows
 *   Ctrl+Tab       Switch to Next Window
 */

const { globalShortcut } = require("electron");

class ShortcutManager {
  /**
   * @param {object} opts
   * @param {Function} opts.onNewWindow           () => void
   * @param {Function} opts.onReopenClosedWindow  () => void
   * @param {Function} opts.onCloseWindow         () => void
   * @param {Function} opts.onCloseAllWindows     () => void
   * @param {Function} opts.onSwitchWindow        () => void
   */
  constructor(opts) {
    this._opts = opts;
    this._registered = false;
  }

  /**
   * Register all global shortcuts. Call after app.whenReady().
   */
  register() {
    if (this._registered) return;

    const shortcuts = [
      {
        accelerator: "CmdOrCtrl+Shift+N",
        handler: () => this._opts.onNewWindow(),
        label: "New Window",
      },
      {
        accelerator: "CmdOrCtrl+Shift+T",
        handler: () => this._opts.onReopenClosedWindow(),
        label: "Reopen Closed Window",
      },
      {
        accelerator: "CmdOrCtrl+W",
        handler: () => this._opts.onCloseWindow(),
        label: "Close Window",
      },
      {
        accelerator: "CmdOrCtrl+Shift+W",
        handler: () => this._opts.onCloseAllWindows(),
        label: "Close All Windows",
      },
      {
        accelerator: "CmdOrCtrl+Tab",
        handler: () => this._opts.onSwitchWindow(),
        label: "Switch Window",
      },
    ];

    for (const { accelerator, handler, label } of shortcuts) {
      const ok = globalShortcut.register(accelerator, handler);
      if (!ok) {
        console.warn(`[ShortcutManager] Failed to register shortcut: ${accelerator} (${label})`);
      }
    }

    this._registered = true;
    console.log("[ShortcutManager] Global shortcuts registered");
  }

  /**
   * Unregister all shortcuts. Call on app quit.
   */
  unregister() {
    globalShortcut.unregisterAll();
    this._registered = false;
  }
}

module.exports = { ShortcutManager };
