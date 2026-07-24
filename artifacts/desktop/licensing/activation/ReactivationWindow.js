"use strict";

const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs   = require("fs");
const os   = require("os");

const { buildReactivationPageHtml } = require("./ReactivationPage");

class ReactivationWindow {
  constructor(opts) {
    this._fingerprint = opts.fingerprint;
    this._iconPath    = opts.iconPath;
    this._log         = opts.log || (() => {});

    this._win          = null;
    this._tempHtmlPath = null;
  }

  show() {
    return new Promise((resolve, reject) => {
      this._createWindow(resolve, reject);
    });
  }

  _createWindow(resolve, reject) {
    this._log("info", "[Licensing] Opening Reactivation window...");

    const html = buildReactivationPageHtml(this._fingerprint);
    this._tempHtmlPath = path.join(
      os.tmpdir(),
      "erp-reactivation-" + Date.now() + ".html"
    );
    try {
      fs.writeFileSync(this._tempHtmlPath, html, "utf8");
    } catch (err) {
      reject(new Error("Cannot write reactivation page: " + err.message));
      return;
    }

    this._win = new BrowserWindow({
      width:  900,
      height: 850,
      minWidth:  800,
      minHeight: 700,
      resizable: true,
      maximizable: true,
      minimizable: true,
      title: "إعادة تفعيل البرنامج — Software Reactivation",
      icon:  this._iconPath,
      modal: false,
      center: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
      backgroundColor: "#080c14",
      autoHideMenuBar: true,
    });

    this._win.setMenu(null);

    this._win.on("close", (event) => {
      this._log("info", "[Licensing] Reactivation window closed.");
      this._cleanup();
      resolve();
    });

    this._win.loadFile(this._tempHtmlPath).catch((err) => {
      this._cleanup();
      reject(new Error("Cannot load reactivation page: " + err.message));
    });
  }

  _cleanup() {
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy();
      this._win = null;
    }
    if (this._tempHtmlPath) {
      try { fs.unlinkSync(this._tempHtmlPath); } catch { }
      this._tempHtmlPath = null;
    }
  }
}

module.exports = { ReactivationWindow };
