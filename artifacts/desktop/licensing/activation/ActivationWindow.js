"use strict";

/**
 * activation/ActivationWindow.js — Software Activation Window
 *
 * Displays a modal BrowserWindow prompting the user to enter their license key.
 * The window cannot be closed without either a successful activation or
 * terminating the application.
 *
 * Communication flow:
 *
 *   main process                    activation window (renderer)
 *       │                                   │
 *       │  window.show()                    │
 *       │ ─────────────────────────────────►│
 *       │                                   │  user pastes license, clicks Activate
 *       │  ipcMain 'license:submit'         │
 *       │◄──────────────────────────────────│
 *       │  validate(licenseText)            │
 *       │  ───────────────┐                 │
 *       │                 │                 │
 *       │  ◄──────────────┘                 │
 *       │  webContents.send 'license:result'│
 *       │ ─────────────────────────────────►│
 *       │                                   │
 *       │  [success] resolve() → win.close()│
 *       │  [failure] stay open, show error  │
 *
 * The window is created WITHOUT using the app preload.js — it uses its own
 * minimal IPC bridge injected via executeJavaScript to avoid any coupling
 * with the existing window infrastructure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEBUG LOGGING
 * Every step of the activation flow is logged to the main-process console.
 * Steps:
 *   [ACT-01] Activation button clicked (renderer)
 *   [ACT-02] IPC message received by main process
 *   [ACT-03] JSON parse attempt
 *   [ACT-04] Signature verification started
 *   [ACT-05] Signature verification completed
 *   [ACT-06] Fingerprint comparison
 *   [ACT-07] License save started
 *   [ACT-08] License saved
 *   [ACT-09] Activation completed — launching ERP
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { BrowserWindow, ipcMain, app } = require("electron");
const path = require("path");
const fs   = require("fs");
const os   = require("os");

const { buildActivationPageHtml } = require("./ActivationPage");

/**
 * IPC channels used exclusively by the activation window.
 * Using unique channel names prevents collision with ERP IPC channels.
 */
const CH_SUBMIT = "licensing:activate:submit";
const CH_RESULT = "licensing:activate:result";

class ActivationWindow {
  /**
   * @param {object}   opts
   * @param {string}   opts.fingerprint       Device fingerprint hex string
   * @param {string}   opts.iconPath          Absolute path to the app icon
   * @param {Function} opts.onActivate        async (licenseText: string) => void
   *                                          Should throw on invalid license.
   * @param {Function} [opts.log]             Optional log function
   */
  constructor(opts) {
    this._fingerprint = opts.fingerprint;
    this._iconPath    = opts.iconPath;
    this._onActivate  = opts.onActivate;
    this._log         = opts.log || (() => {});

    this._win          = null;
    this._tempHtmlPath = null;
    this._ipcHandler   = null;
    this._resolved     = false;
  }

  /**
   * Open the activation window and wait until the user successfully activates,
   * or until the window is closed (in which case the app quits).
   *
   * @returns {Promise<void>}  Resolves when activation succeeds.
   */
  show() {
    return new Promise((resolve, reject) => {
      this._createWindow(resolve, reject);
    });
  }

  // -------------------------------------------------------------------------
  // Private — window creation
  // -------------------------------------------------------------------------

  _createWindow(resolve, reject) {
    this._log("info", "[Licensing] Opening activation window...");

    // ── Safety: remove any stale IPC handler from a previous instance ──────
    // ipcMain.handle() throws if the channel is already registered.
    // This guard ensures we never register twice.
    try {
      ipcMain.removeHandler(CH_SUBMIT);
    } catch (_) {
      // Channel was not registered — ignore
    }

    // Write the activation page HTML to a temp file
    const html = buildActivationPageHtml(this._fingerprint);
    this._tempHtmlPath = path.join(
      os.tmpdir(),
      `erp-activation-${Date.now()}.html`
    );
    try {
      fs.writeFileSync(this._tempHtmlPath, html, "utf8");
    } catch (err) {
      reject(new Error(`Cannot write activation page: ${err.message}`));
      return;
    }

    // Create the BrowserWindow
    this._win = new BrowserWindow({
      width:  900,
      height: 850,
      minWidth:  800,
      minHeight: 700,
      resizable: true,
      maximizable: true,
      minimizable: true,
      title: "تفعيل البرنامج — Software Activation",
      icon:  this._iconPath,
      modal: false,
      center: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
      },
      backgroundColor: "#080c14",
      // Hide the default menu bar
      autoHideMenuBar: true,
    });

    // Remove the menu
    this._win.setMenu(null);

    // ── Register IPC handler for license submission ─────────────────────────
    // The handler MUST always return a value (never leave the Promise hanging).
    this._ipcHandler = async (_event, licenseText) => {
      this._log("info", "Reading license text");
      this._log("info", "[ACT-02] IPC message received by main process.");
      try {
        const result = await this._handleSubmit(licenseText, resolve, reject);
        // _handleSubmit always returns { success, message } — never undefined
        return result;
      } catch (unexpectedErr) {
        // Defensive catch: _handleSubmit has its own try/catch, but if
        // something truly unexpected happens, we must still return a value.
        this._log("error", "[ACT-ERR] Unexpected error in IPC handler", {
          error: unexpectedErr.message,
          stack: unexpectedErr.stack,
        });
        return {
          success: false,
          message: `خطأ غير متوقع: ${unexpectedErr.message}\nUnexpected error: ${unexpectedErr.message}\n\nStack:\n${unexpectedErr.stack}`,
        };
      }
    };
    ipcMain.handle(CH_SUBMIT, this._ipcHandler);

    // If the user closes the window, quit the app
    this._win.on("close", (event) => {
      if (!this._resolved) {
        this._log(
          "warn",
          "[Licensing] Activation window closed without activation. Quitting."
        );
        this._cleanup();
        app.quit();
      }
    });

    // Load the page
    this._win.loadFile(this._tempHtmlPath).then(() => {
      this._log("info", "[Licensing] Activation page loaded successfully.");
    }).catch((err) => {
      this._cleanup();
      reject(new Error(`Cannot load activation page: ${err.message}`));
    });
  }

  // -------------------------------------------------------------------------
  // Private — submission handler
  // -------------------------------------------------------------------------

  /**
   * Handle a license submission from the activation window renderer.
   *
   * Every code path MUST return { success, message } — never throw out of
   * this function. Throwing would leave the renderer's ipcRenderer.invoke()
   * Promise permanently unresolved (stuck on "Validating...").
   *
   * @param {string}   licenseText  Raw license text pasted by the user
   * @param {Function} resolve      Promise resolver (activation success)
   * @param {Function} reject       Promise rejector (fatal error)
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async _handleSubmit(licenseText, resolve, reject) {
    this._log("info", "[Licensing] License submitted for validation...");

    let cleanText;
    try {
      cleanText = licenseText.trim();
    } catch (err) {
      this._log("error", "[ACT-ERR] licenseText.trim() threw", { error: err.message });
      return { success: false, message: `خطأ: نص الترخيص غير صالح\nError: License text is invalid.` };
    }

    // ── Step [ACT-03]: JSON parse check ─────────────────────────────────────
    this._log("info", "Parsing JSON");
    this._log("info", "[ACT-03] Attempting to parse license JSON...");
    let parsedJson;
    try {
      parsedJson = JSON.parse(cleanText);
      this._log("info", "[ACT-03] JSON parsed successfully.", {
        fields: Object.keys(parsedJson || {}),
        edition: parsedJson && parsedJson.edition,
        hasSignature: !!(parsedJson && parsedJson.signature),
        hasFingerprint: !!(parsedJson && parsedJson.fingerprint),
      });
    } catch (parseErr) {
      this._log("warn", "[ACT-03] JSON parse failed — not valid JSON.", { error: parseErr.message });
      return {
        success: false,
        message: "تنسيق مفتاح الترخيص غير صحيح (ليس JSON صالحاً).\nLicense format is invalid (not valid JSON).",
      };
    }

    // ── Steps [ACT-04] through [ACT-09]: delegate to onActivate ─────────────
    try {
      this._log("info", "[ACT-04] Calling onActivate callback (signature verification, fingerprint, save)...");
      await this._onActivate(cleanText);

      // ── Step [ACT-09]: Success ───────────────────────────────────────────
      this._log("info", "Activation completed");
      this._log("info", "[ACT-09] Activation completed successfully.");
      this._resolved = true;

      const successMessage =
        "✓ تم التحقق من الترخيص بنجاح.\n" +
        "✓ تم تفعيل البرنامج بنجاح.\n" +
        "✓ جاري تشغيل النظام...\n\n" +
        "✓ License verified successfully.\n" +
        "✓ Activation completed successfully.\n" +
        "✓ Launching ERP...";

      // Brief delay so the user can see the success state, then resolve
      setTimeout(() => {
        this._log("info", "[ACT-09] Launching ERP after activation delay...");
        this._cleanup();
        resolve();
      }, 1000);

      return { success: true, message: successMessage };

    } catch (err) {
      this._log("warn", "[Licensing] Activation failed", {
        error: err.message,
        code: err.code,
        stack: err.stack,
      });

      // Map error codes to user-friendly Arabic/English messages
      let friendlyMessage = this._mapErrorMessage(err);
      if (!err.code) {
        friendlyMessage += `\n\n${err.stack}`;
      }
      return { success: false, message: friendlyMessage };
    }
  }

  // -------------------------------------------------------------------------
  // Private — error message mapping
  // -------------------------------------------------------------------------

  /**
   * Translate a LicenseError into a bilingual, user-friendly string.
   *
   * @param {Error} err
   * @returns {string}
   */
  _mapErrorMessage(err) {
    const code = err.code || "";

    const messages = {
      SIGNATURE_INVALID:
        "✗ توقيع رقمي غير صالح.\n" +
        "✗ Invalid digital signature.",

      FINGERPRINT_MISMATCH:
        "✗ بصمة الجهاز غير متطابقة.\n" +
        "✗ Hardware fingerprint does not match.",

      EXPIRED:
        "✗ انتهت صلاحية الترخيص.\n" +
        "✗ License has expired.",

      INVALID_EDITION:
        "✗ الترخيص غير متوافق مع هذا الجهاز.\n" +
        "✗ License is not compatible with this device.",

      TAMPERED:
        "✗ ملف الترخيص تالف.\n" +
        "✗ License file is corrupted.",

      MALFORMED:
        "✗ تنسيق الترخيص غير صحيح.\n" +
        "✗ License format is incorrect.",

      HDD_NOT_FOUND:
        "✗ لم يتم العثور على القرص الصلب.\n" +
        "✗ Authorized external HDD not found.",
    };

    return (
      messages[code] ||
      `فشل التحقق من الترخيص: ${err.message}\nActivation failed: ${err.message}`
    );
  }

  // -------------------------------------------------------------------------
  // Private — cleanup
  // -------------------------------------------------------------------------

  _cleanup() {
    // Unregister IPC handler
    if (this._ipcHandler) {
      try {
        ipcMain.removeHandler(CH_SUBMIT);
      } catch (_) {
        // Already removed — ignore
      }
      this._ipcHandler = null;
    }

    // Close window
    if (this._win && !this._win.isDestroyed()) {
      this._win.destroy();
      this._win = null;
    }

    // Delete temp HTML
    if (this._tempHtmlPath) {
      try { fs.unlinkSync(this._tempHtmlPath); } catch { /* ignore */ }
      this._tempHtmlPath = null;
    }
  }
}

module.exports = { ActivationWindow };
