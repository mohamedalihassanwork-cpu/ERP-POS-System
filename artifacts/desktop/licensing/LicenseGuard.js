"use strict";

/**
 * LicenseGuard.js — Top-Level Licensing Orchestrator
 *
 * This is the ONLY module that ApplicationManager.initialize() interacts with.
 * It coordinates all licensing sub-systems:
 *
 *   HddDetector       → verify external HDD dongle is connected
 *   HardwareReader    → read motherboard serial, CPU ID, HDD serial
 *   FingerprintEngine → SHA-256 device fingerprint
 *   LicenseStore      → read/write encrypted license.dat
 *   LicenseValidator  → verify ECDSA signature + all fields
 *   ActivationWindow  → UI when no valid license exists
 *
 * Execution flow on every app start:
 *
 *   1. Detect external HDD(s)           → HddNotFoundError → quit
 *   2. Read hardware identifiers        → HardwareReadError → quit
 *   3. Compute device fingerprint
 *   4. Try to read license.dat
 *      ├─ NOT FOUND → open ActivationWindow, wait for user
 *      └─ FOUND     → validate immediately
 *   5. Validate license payload
 *      ├─ VALID → return (ERP continues to start)
 *      └─ INVALID → show error dialog → quit
 *
 * IMPORTANT:
 *   - The ERP NEVER generates licenses. LicenseGuard only validates.
 *   - The private key is NEVER present in this project.
 *   - The app works completely offline after activation.
 */

const { dialog, app } = require("electron");
const path = require("path");

const { HddDetector }       = require("./hardware/HddDetector");

const { readAll }           = require("./hardware/HardwareReader");
const { FingerprintEngine } = require("./crypto/FingerprintEngine");
const { LicenseStore }      = require("./LicenseStore");
const { LicenseValidator }  = require("./validation/LicenseValidator");
const { ActivationWindow }  = require("./activation/ActivationWindow");

const {
  HddNotFoundError,
  HardwareReadError,
  LicenseNotFoundError,
  LicenseValidationError,
} = require("./errors");

class LicenseGuard {
  /**
   * @param {object}   opts
   * @param {string}   opts.appDataDir    Absolute path to the app's user-data dir
   * @param {string}   [opts.iconPath]    Absolute path to the app icon (for dialogs)
   * @param {Function} [opts.log]         log(level, message, meta?) function
   */
  constructor(opts) {
    this._appDataDir = opts.appDataDir;
    this._iconPath   = opts.iconPath || null;
    this._log        = opts.log || (() => {});

    this._hddDetector   = new HddDetector(this._log);
    this._store         = new LicenseStore(this._appDataDir, this._log);
    this._validator     = new LicenseValidator(this._log);
  }

  // =========================================================================
  // Public Entry Point
  // =========================================================================

  /**
   * Run the full license check.
   *
   * Call this as the FIRST statement inside ApplicationManager.initialize().
   * If the method returns without throwing, the license is valid and the ERP
   * may proceed. If anything fails, this method shows an error dialog and
   * calls app.quit() — the ERP never starts.
   *
   * @returns {Promise<void>}
   */
  async check() {
    this._log("info", "[Licensing] Starting license check...");

    try {
      // ── [ACT-08] HDD detection started ─────────────────────────────────
      this._log("info", "Reading HDD");
      this._log("info", "[ACT-08] HDD detection started.");
      let connectedHddSerials;
      try {
        connectedHddSerials = this._hddDetector.requireAtLeastOne();
      } catch (err) {
        if (err instanceof HddNotFoundError) {
          this._log("warn", "[ACT-08] HDD detection failed: no external HDD found.");
          await this._fatalDialog(
            "قرص صلب خارجي مطلوب",
            "لم يتم العثور على القرص الصلب الخارجي المعتمد.\n\n" +
            "Authorized external HDD not found.\n\n" +
            "الرجاء توصيل القرص الصلب الخارجي المعتمد وإعادة تشغيل البرنامج.\n" +
            "Please connect the authorized external HDD and restart the application."
          );
          return; // fatalDialog calls app.quit()
        }
        throw err;
      }
      // ── [ACT-09] HDD detection completed ───────────────────────────────
      this._log("info", `[ACT-09] HDD detection completed. Found ${connectedHddSerials.length} HDD(s): [${connectedHddSerials.join(", ")}]`);

      // ── [ACT-06] Fingerprint generation started ─────────────────────────
      this._log("info", "Generating fingerprint");
      this._log("info", "[ACT-06] Fingerprint generation started.");
      let hw;
      try {
        hw = readAll();
      } catch (err) {
        if (err instanceof HardwareReadError) {
          this._log("error", `[ACT-ERR] Hardware read failed: ${err.message}`);
          await this._fatalDialog(
            "خطأ في قراءة معرّفات الأجهزة",
            `تعذّر قراءة معرّفات الأجهزة المطلوبة.\n\n` +
            `Failed to read hardware identifiers.\n\n${err.message}`
          );
          return;
        }
        throw err;
      }

      this._log("info", "[Licensing] Hardware identifiers read successfully.", {
        motherboardSerial: hw.motherboardSerial ? `${hw.motherboardSerial.substring(0, 4)}...` : "(empty)",
        cpuId:             hw.cpuId             ? `${hw.cpuId.substring(0, 4)}...`             : "(empty)",
      });

      // ── [ACT-07] Fingerprint generation completed ───────────────────────
      const hddSerial = connectedHddSerials[0];
      const fingerprint = FingerprintEngine.compute(
        hw.motherboardSerial,
        hw.cpuId,
        hddSerial
      );
      this._log("info", `[ACT-07] Fingerprint generation completed: ${fingerprint.substring(0, 12)}...`);

      // ── Step 4 & 5: Validate or activate ───────────────────────────────
      await this._validateOrActivate(fingerprint, connectedHddSerials);

      // ── [ACT-14] Launch ERP ─────────────────────────────────────────────
      this._log("info", "Launching ERP");
      this._log("info", "[ACT-14] License check passed. Launching ERP.");

    } catch (err) {
      // Unexpected error not already handled above
      this._log("error", "[Licensing] Unexpected error during license check", {
        error: err.message,
        stack: err.stack,
      });
      await this._fatalDialog(
        "خطأ في التحقق من الترخيص",
        `حدث خطأ غير متوقع أثناء التحقق من الترخيص.\n\n` +
        `An unexpected error occurred during license validation.\n\n${err.message}`
      );
    }
  }

  // =========================================================================
  // Private — Validate existing license or open activation window
  // =========================================================================

  /**
   * @param {string}   fingerprint           Current device fingerprint
   * @param {string[]} connectedHddSerials    All connected external HDD serials
   */
  async _validateOrActivate(fingerprint, connectedHddSerials) {
    let licensePayload;

    // Try to read and validate an existing license.dat
    const existingFile = this._store.findExistingLicenseFile();

    if (existingFile) {
      // ── Existing license found — validate it ─────────────────────────
      try {
        const plaintext = this._store.readAndDecrypt(fingerprint);
        licensePayload  = this._validator.validate(plaintext, fingerprint);

        // Extra check: verify the HDD serial embedded in the fingerprint
        // matches one of the currently connected HDDs.
        // (The fingerprint already encodes the HDD, so a match = HDD is correct)
        this._log("info", "[Licensing] Existing license validated successfully.");
        return licensePayload;

      } catch (err) {
        if (err instanceof LicenseValidationError) {
          if (err.code === "FINGERPRINT_MISMATCH") {
            this._log("warn", "[Licensing] FINGERPRINT_MISMATCH detected. Showing Reactivation window.");
            const { ReactivationWindow } = require("./activation/ReactivationWindow");
            const reactWin = new ReactivationWindow({
              fingerprint,
              iconPath: this._iconPath,
              log: this._log
            });
            await reactWin.show();
            // The reactivation window does not reactivate on the fly, it just shows the ID and closes.
            // After it is closed, we must quit the app.
            const { app } = require("electron");
            app.quit();
            return;
          }

          await this._fatalDialog(
            "ترخيص غير صالح",
            this._formatValidationError(err)
          );
          return;
        }
        // LicenseNotFoundError shouldn't happen here since we found the file
        throw err;
      }

    } else {
      // ── No license found — open activation window ─────────────────────
      this._log("info", "[Licensing] No license file found. Opening activation window...");

      await this._runActivationWindow(fingerprint);
      // If we reach here, activation succeeded
    }
  }

  // =========================================================================
  // Private — Activation Window
  // =========================================================================

  /**
   * Open the activation window and wait for the user to provide a valid license.
   * The window is given an onActivate callback that:
   *   1. Parses the raw license text (expected to be the plaintext JSON)
   *   2. Validates it
   *   3. Writes license.dat on success
   *
   * @param {string} fingerprint
   */
  async _runActivationWindow(fingerprint) {
    const self = this;

    const activationWindow = new ActivationWindow({
      fingerprint,
      iconPath: this._iconPath,
      log:      this._log,

      /**
       * Called by ActivationWindow when the user submits a license.
       * Must throw on invalid license; resolves on success.
       *
       * Every step is logged with a numbered prefix [ACT-NN] so that
       * if execution stops, the last log entry identifies the exact step.
       *
       * @param {string} licenseText  Raw license text from the user
       * @throws {LicenseValidationError}  On any validation failure
       */
      onActivate: async (licenseText) => {
        // ── [ACT-04] Signature verification started ────────────────────────
        self._log("info", "Signature verification");
        self._log("info", "[ACT-04] Signature verification started.");

        // validate() is synchronous; it throws LicenseValidationError on
        // any failure. The ActivationWindow._handleSubmit catches all throws.
        let payload;
        try {
          payload = self._validator.validate(licenseText, fingerprint);
        } catch (validationErr) {
          // Re-log here at the Guard level for traceability, then re-throw
          // so ActivationWindow._handleSubmit can map it to a friendly message.
          self._log("warn", `[ACT-ERR] Validation threw: [${validationErr.code}] ${validationErr.message}`);
          throw validationErr;
        }

        // ── [ACT-05] Signature verification completed ──────────────────────
        self._log("info", "[ACT-05] Signature verification completed.");

        // ── [ACT-06] Fingerprint comparison (already done inside validator) ─
        self._log("info", "Fingerprint comparison");
        self._log("info", `[ACT-06] Fingerprint comparison OK. Edition: ${payload.edition}`);

        // ── [ACT-07] License save started ─────────────────────────────────
        self._log("info", "Saving license");
        self._log("info", "[ACT-07] License save started.");

        let savedPath;
        try {
          savedPath = self._store.encryptAndWrite(licenseText, fingerprint);
        } catch (writeErr) {
          self._log("error", `[ACT-ERR] encryptAndWrite threw: ${writeErr.message}`);
          throw writeErr;
        }

        // ── [ACT-08] License saved ─────────────────────────────────────────
        self._log("info", `[ACT-08] License saved to: ${savedPath}`);

        // [ACT-09] and [ACT-14] are logged from ActivationWindow._handleSubmit
        // and its setTimeout callback respectively.
      },
    });

    await activationWindow.show();
  }

  // =========================================================================
  // Private — Fatal Dialog
  // =========================================================================

  /**
   * Show a modal error dialog and terminate the application.
   *
   * @param {string} title
   * @param {string} content
   */
  async _fatalDialog(title, content) {
    this._log("error", `[Licensing] Fatal: ${title}`, { content });
    try {
      await dialog.showMessageBox({
        type:    "error",
        title,
        message: title,
        detail:  content,
        buttons: ["إغلاق — Close"],
        defaultId: 0,
      });
    } catch {
      // Electron may not have a window ready; fall back to showErrorBox
      dialog.showErrorBox(title, content);
    }
    app.quit();
  }

  // =========================================================================
  // Private — Error formatting
  // =========================================================================

  /**
   * Build a bilingual, user-friendly error message from a LicenseValidationError.
   *
   * @param {LicenseValidationError} err
   * @returns {string}
   */
  _formatValidationError(err) {
    const messages = {
      SIGNATURE_INVALID:
        "التوقيع الرقمي للترخيص غير صالح.\n" +
        "The license digital signature is invalid.\n\n" +
        "قد يكون الملف تالفاً أو تم التلاعب به.\n" +
        "The file may be corrupt or tampered with.",

      FINGERPRINT_MISMATCH:
        "هذا الترخيص مخصص لجهاز مختلف.\n" +
        "This license was issued for a different machine.\n\n" +
        "تواصل مع المورد للحصول على ترخيص جديد.\n" +
        "Contact your vendor to obtain a new license.",

      EXPIRED:
        "انتهت صلاحية الترخيص.\n" +
        "Your license has expired.\n\n" +
        "تواصل مع المورد لتجديد الترخيص.\n" +
        "Please contact your vendor to renew your license.",

      INVALID_EDITION:
        "إصدار الترخيص غير مدعوم في هذا البرنامج.\n" +
        "The license edition is not supported by this application.",

      TAMPERED:
        "ملف الترخيص تالف أو تم تعديله.\n" +
        "The license file is corrupt or has been modified.",

      MALFORMED:
        "بنية ملف الترخيص غير صحيحة.\n" +
        "The license file structure is invalid.",
    };

    const base = messages[err.code] || `${err.message}`;
    return base;
  }
}

module.exports = { LicenseGuard };
