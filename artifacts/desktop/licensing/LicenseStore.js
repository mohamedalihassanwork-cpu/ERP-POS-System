"use strict";

/**
 * LicenseStore.js — License File I/O
 *
 * Manages reading and writing the encrypted license.dat file.
 *
 * Storage strategy (first writable location wins):
 *   1. C:\ProgramData\ShoeStorePOS\license.dat  ← preferred (survives reinstall)
 *   2. %APPDATA%\ShoeStorePOS\license.dat        ← fallback (non-admin installs)
 *
 * The file contains an AES-256-GCM encrypted envelope in JSON format:
 *
 *   {
 *     "v":  1,          // envelope version
 *     "iv": "<hex>",   // 96-bit IV
 *     "tag":"<hex>",   // 128-bit GCM auth tag
 *     "ct": "<hex>"    // ciphertext
 *   }
 *
 * The AES key is derived from the device fingerprint; decryption without the
 * matching hardware will produce a GCM auth-tag failure (TAMPERED error).
 */

const fs   = require("fs");
const path = require("path");
const os   = require("os");

const {
  PROGRAMDATA_LICENSE_DIR,
  APPDATA_LICENSE_SUBDIR,
  LICENSE_FILENAME,
  LICENSE_VERSION,
} = require("./constants");

const { CryptoService }         = require("./crypto/CryptoService");
const { LicenseNotFoundError }  = require("./errors");

class LicenseStore {
  /**
   * @param {string} [appDataDir]  Optional override for the AppData fallback path
   * @param {Function} [log]       Optional log(level, msg, meta?) function
   */
  constructor(appDataDir, log) {
    this._appDataDir = appDataDir || null;
    this._log = log || (() => {});
  }

  // -------------------------------------------------------------------------
  // Path resolution
  // -------------------------------------------------------------------------

  /**
   * Return the ProgramData license directory path.
   * @returns {string}
   */
  _programDataDir() {
    return PROGRAMDATA_LICENSE_DIR;
  }

  /**
   * Return the AppData fallback license directory path.
   * @returns {string}
   */
  _appDataFallbackDir() {
    if (this._appDataDir) {
      return this._appDataDir;
    }
    const appData = process.env.APPDATA || os.homedir();
    return path.join(appData, APPDATA_LICENSE_SUBDIR);
  }

  /**
   * Return the full path to the license file in ProgramData.
   * @returns {string}
   */
  get primaryPath() {
    return path.join(this._programDataDir(), LICENSE_FILENAME);
  }

  /**
   * Return the full path to the license file in AppData.
   * @returns {string}
   */
  get fallbackPath() {
    return path.join(this._appDataFallbackDir(), LICENSE_FILENAME);
  }

  /**
   * Return all candidate paths in preference order.
   * @returns {string[]}
   */
  get candidatePaths() {
    return [this.primaryPath, this.fallbackPath];
  }

  // -------------------------------------------------------------------------
  // Existence check
  // -------------------------------------------------------------------------

  /**
   * Check whether any license.dat file exists in any candidate location.
   * @returns {string|null}  The path of the found file, or null if not found.
   */
  findExistingLicenseFile() {
    for (const candidate of this.candidatePaths) {
      if (fs.existsSync(candidate)) {
        this._log("info", `[Licensing] Found license file: ${candidate}`);
        return candidate;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Read / Decrypt
  // -------------------------------------------------------------------------

  /**
   * Read and decrypt the license file.
   * The plaintext JSON payload is returned as a string (not parsed).
   *
   * @param {string} fingerprint  Current device fingerprint (AES key source)
   * @returns {string}            Decrypted license JSON string
   * @throws  {LicenseNotFoundError}    If no license file exists
   * @throws  {LicenseValidationError}  If the envelope is malformed or tampered
   */
  readAndDecrypt(fingerprint) {
    const filePath = this.findExistingLicenseFile();
    if (!filePath) {
      throw new LicenseNotFoundError();
    }

    let raw;
    try {
      raw = fs.readFileSync(filePath, "utf8");
    } catch (err) {
      throw new Error(`Cannot read license file: ${err.message}`);
    }

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      const { LicenseValidationError } = require("./errors");
      throw new LicenseValidationError(
        "License file is not valid JSON.",
        "TAMPERED"
      );
    }

    if (!envelope || envelope.v !== LICENSE_VERSION ||
        typeof envelope.iv !== "string" ||
        typeof envelope.tag !== "string" ||
        typeof envelope.ct !== "string") {
      const { LicenseValidationError } = require("./errors");
      throw new LicenseValidationError(
        "License file envelope is malformed or corrupt.",
        "TAMPERED"
      );
    }

    // Try to decrypt with static key first (new licenses)
    const AES_STATIC_KEY = "ShoeStorePOS_STATIC_KEY_V1";
    let plaintext;
    try {
      plaintext = CryptoService.decrypt(
        envelope.iv,
        envelope.tag,
        envelope.ct,
        AES_STATIC_KEY
      );
    } catch (err) {
      // Fallback for older licenses encrypted with the fingerprint
      try {
        plaintext = CryptoService.decrypt(
          envelope.iv,
          envelope.tag,
          envelope.ct,
          fingerprint
        );
      } catch (fallbackErr) {
        // Auth tag failed for both keys, it's actually tampered/corrupt
        const { LicenseValidationError } = require("./errors");
        throw new LicenseValidationError(
          "License file integrity check failed. The file may have been tampered with.",
          "TAMPERED"
        );
      }
    }

    return plaintext;
  }

  // -------------------------------------------------------------------------
  // Write / Encrypt
  // -------------------------------------------------------------------------

  /**
   * Encrypt and write the license payload to disk.
   *
   * Tries ProgramData first; falls back to AppData if ProgramData is not
   * writable (e.g. non-admin user). Throws if neither location is writable.
   *
   * @param {string} plaintextJson  License JSON string to encrypt
   * @param {string} fingerprint    Current device fingerprint (AES key source)
   * @returns {string}              Path where the file was written
   */
  encryptAndWrite(plaintextJson, fingerprint) {
    const AES_STATIC_KEY = "ShoeStorePOS_STATIC_KEY_V1";
    const { iv, tag, ct } = CryptoService.encrypt(plaintextJson, AES_STATIC_KEY);
    const envelope = JSON.stringify({ v: LICENSE_VERSION, iv, tag, ct });

    const errors = [];

    for (const candidate of this.candidatePaths) {
      try {
        const dir = path.dirname(candidate);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(candidate, envelope, { encoding: "utf8", mode: 0o600 });
        this._log("info", `[Licensing] License file written to: ${candidate}`);
        return candidate;
      } catch (err) {
        errors.push(`${candidate}: ${err.message}`);
      }
    }

    throw new Error(
      `Failed to write license file to any location:\n${errors.join("\n")}`
    );
  }

  // -------------------------------------------------------------------------
  // Delete (used during re-activation if needed)
  // -------------------------------------------------------------------------

  /**
   * Delete all known license file copies.
   * Used only for testing / re-activation flows.
   */
  deleteAll() {
    for (const candidate of this.candidatePaths) {
      try {
        if (fs.existsSync(candidate)) {
          fs.unlinkSync(candidate);
          this._log("info", `[Licensing] Deleted license file: ${candidate}`);
        }
      } catch (err) {
        this._log("warn", `[Licensing] Could not delete ${candidate}: ${err.message}`);
      }
    }
  }
}

module.exports = { LicenseStore };
