"use strict";

/**
 * MenuManager — Application Menu Builder
 *
 * Builds and updates the application menu whenever the window list changes.
 * Menu structure:
 *
 *   File
 *   ├── New Window             (Ctrl+Shift+N)
 *   ├── Close Window           (Ctrl+W)
 *   ├── Reopen Closed Window   (Ctrl+Shift+T)
 *   ├── ─────────────────────
 *   ├── [Window 1 title]
 *   ├── [Window 2 title]
 *   ├── ...
 *   ├── ─────────────────────
 *   ├── Close All Windows      (Ctrl+Shift+W)
 *   └── Exit
 */

const { Menu, app } = require("electron");

class MenuManager {
  /**
   * @param {object} opts
   * @param {Function} opts.onNewWindow           callback: () => void
   * @param {Function} opts.onCloseWindow         callback: () => void
   * @param {Function} opts.onReopenClosedWindow  callback: () => void
   * @param {Function} opts.onFocusWindow         callback: (windowId: string) => void
   * @param {Function} opts.onCloseAllWindows     callback: () => void
   * @param {Function} opts.getWindowList         callback: () => Array<{id, title, isActive}>
   */
  constructor(opts) {
    this._onNewWindow = opts.onNewWindow;
    this._onCloseWindow = opts.onCloseWindow;
    this._onReopenClosedWindow = opts.onReopenClosedWindow;
    this._onFocusWindow = opts.onFocusWindow;
    this._onCloseAllWindows = opts.onCloseAllWindows;
    this._getWindowList = opts.getWindowList;
  }

  /**
   * Build and apply the application menu.
   * Call this whenever the window list changes.
   */
  rebuild() {
    const windows = this._getWindowList();

    // Window submenu items
    const windowItems = windows.map((w) => ({
      label: `${w.isActive ? "✓ " : "   "}${w.title || "ERP"}`,
      click: () => this._onFocusWindow(w.id),
    }));

    const template = [
      {
        label: "File",
        submenu: [
          {
            label: "New Window",
            accelerator: "CmdOrCtrl+Shift+N",
            click: () => this._onNewWindow(),
          },
          {
            label: "Close Window",
            accelerator: "CmdOrCtrl+W",
            click: () => this._onCloseWindow(),
          },
          {
            label: "Reopen Closed Window",
            accelerator: "CmdOrCtrl+Shift+T",
            click: () => this._onReopenClosedWindow(),
          },
          { type: "separator" },
          ...(windowItems.length > 0
            ? [
                {
                  label: "Windows",
                  submenu: windowItems,
                },
                { type: "separator" },
              ]
            : []),
          {
            label: "Close All Windows",
            accelerator: "CmdOrCtrl+Shift+W",
            click: () => this._onCloseAllWindows(),
          },
          { type: "separator" },
          {
            label: "Exit",
            accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
            click: () => app.quit(),
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /**
   * Remove the application menu entirely (used before first window loads).
   */
  clear() {
    Menu.setApplicationMenu(null);
  }
}

module.exports = { MenuManager };
