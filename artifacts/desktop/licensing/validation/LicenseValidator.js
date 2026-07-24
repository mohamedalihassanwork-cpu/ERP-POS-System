"use strict";

/**
 * validation/LicenseValidator.js — Full License Validation Chain
 *
 * Validates a decrypted license payload string through all required checks
 * in the following sequence:
 *
 *   Step 1 — Parse JSON
 *   Step 2 — Check required fields exist (MALFORMED)
 *   Step 3 — Verify ECDSA P-256 digital signature (SIGNATURE_INVALID)
 *   Step 4 — Compare device fingerprint (FINGERPRINT_MISMATCH)
 *   Step 5 — Verify edition is in the allowed list (INVALID_EDITION)
 *   Step 6 — Verify expiration date if present (EXPIRED)
 *
 * Any failed step throws a typed LicenseValidationError with a reason code.
 *
 * The validator NEVER generates licenses — it only verifies them.
 * The private key is NEVER present in this file or anywhere in the ERP.
 *
 * License Payload Schema (inside the AES envelope):
 * {
 *   "version":     1,
 *   "fingerprint": "<sha256-hex>",
 *   "edition":     "professional" | "enterprise",
 *   "issuedAt":    "<ISO-8601>",
 *   "expiresAt":   "<ISO-8601>" | null,
 *   "signature":   "<ecdsa-p256-der-hex>"
 * }
 */

const { CryptoService }          = require("../crypto/CryptoService");
const { FingerprintEngine }      = require("../crypto/FingerprintEngine");
const { LicenseValidationError } = require("../errors");
const { PUBLIC_KEY_PEM, LICENSE_EDITIONS, LICENSE_VERSION } = require("../constants");

class LicenseValidator {
  /**
   * @param {Function} [log]  Optional log(level, msg, meta?) function
   */
  constructor(log) {
    this._log = log || (() => {});
  }

  /**
   * Validate the full license payload JSON string.
   *
   * @param {string} plaintextJson   Decrypted license JSON (from LicenseStore)
   * @param {string} deviceFingerprint  Current device fingerprint (64-char hex)
   * @returns {object}               Parsed, validated license payload
   * @throws  {LicenseValidationError}
   */
  validate(plaintextJson, deviceFingerprint) {
    // ── Step 1: Parse JSON ──────────────────────────────────────────────────
    let payload;
    try {
      payload = JSON.parse(plaintextJson);
    } catch {
      throw new LicenseValidationError(
        "License payload is not valid JSON.",
        "MALFORMED"
      );
    }

    this._log("info", "[Licensing] Validating license payload...");

    // ── Step 2: Required fields ─────────────────────────────────────────────
    const requiredFields = ["version", "fingerprint", "edition", "issuedAt", "signature"];
    for (const field of requiredFields) {
      if (payload[field] === undefined || payload[field] === null) {
        throw new LicenseValidationError(
          `License payload is missing required field: "${field}".`,
          "MALFORMED"
        );
      }
    }

    // Version sanity check
    if (payload.version !== LICENSE_VERSION) {
      throw new LicenseValidationError(
        `Unsupported license version: ${payload.version}.`,
        "MALFORMED"
      );
    }

    // ── Step 3: Verify ECDSA signature ─────────────────────────────────────
    const canonical = CryptoService.canonicalPayload(payload);
    let signatureValid;
    try {
      signatureValid = CryptoService.verifySignature(
        PUBLIC_KEY_PEM,
        canonical,
        payload.signature
      );
    } catch (err) {
      // verifySignature may throw LicenseValidationError
      throw err;
    }

    if (!signatureValid) {
      throw new LicenseValidationError(
        "License signature is invalid. The license file may have been tampered with.",
        "SIGNATURE_INVALID"
      );
    }

    this._log("info", "[Licensing] Signature OK.");

    // ── Step 4: Fingerprint match ───────────────────────────────────────────
    if (!FingerprintEngine.isValidFormat(payload.fingerprint)) {
      throw new LicenseValidationError(
        "License fingerprint field has an invalid format.",
        "MALFORMED"
      );
    }

    if (payload.fingerprint !== deviceFingerprint) {
      throw new LicenseValidationError(
        "This license is not valid for this machine. " +
        "The hardware configuration does not match the license fingerprint.",
        "FINGERPRINT_MISMATCH"
      );
    }

    this._log("info", "[Licensing] Fingerprint match OK.");

    // ── Step 5: Edition ─────────────────────────────────────────────────────
    if (!LICENSE_EDITIONS.includes(payload.edition)) {
      throw new LicenseValidationError(
        `License edition "${payload.edition}" is not recognized. ` +
        `Accepted editions: ${LICENSE_EDITIONS.join(", ")}.`,
        "INVALID_EDITION"
      );
    }

    this._log("info", `[Licensing] Edition "${payload.edition}" OK.`);

    // ── Step 6: Expiration ──────────────────────────────────────────────────
    if (payload.expiresAt !== null && payload.expiresAt !== undefined) {
      const expiry = new Date(payload.expiresAt);
      if (isNaN(expiry.getTime())) {
        throw new LicenseValidationError(
          `License expiresAt field is not a valid date: "${payload.expiresAt}".`,
          "MALFORMED"
        );
      }
      if (Date.now() > expiry.getTime()) {
        throw new LicenseValidationError(
          `This license expired on ${expiry.toLocaleDateString()}. ` +
          "Please contact your vendor to renew.",
          "EXPIRED"
        );
      }
      this._log("info", `[Licensing] Expiry check OK (expires: ${expiry.toISOString()}).`);
    } else {
      this._log("info", "[Licensing] License has no expiration date.");
    }

    this._log("info", "[Licensing] License validation passed.");
    return payload;
  }
}

module.exports = { LicenseValidator };
