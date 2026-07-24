"use strict";

/**
 * errors.js — Typed Error Classes for the Licensing System
 *
 * All errors thrown by the licensing subsystem extend LicenseError,
 * allowing callers to distinguish licensing failures from other runtime errors.
 */

/**
 * Base class for all licensing errors.
 */
class LicenseError extends Error {
  /**
   * @param {string} message  Human-readable error message (English).
   * @param {string} [code]   Machine-readable error code.
   */
  constructor(message, code) {
    super(message);
    this.name = "LicenseError";
    this.code = code || "LICENSE_ERROR";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when no authorized external HDD is detected.
 */
class HddNotFoundError extends LicenseError {
  constructor(message) {
    super(message || "Authorized external HDD not found.", "HDD_NOT_FOUND");
    this.name = "HddNotFoundError";
  }
}

/**
 * Thrown when a required hardware identifier cannot be read.
 */
class HardwareReadError extends LicenseError {
  constructor(message, cause) {
    super(message || "Failed to read hardware identifier.", "HARDWARE_READ_ERROR");
    this.name = "HardwareReadError";
    this.cause = cause || null;
  }
}

/**
 * Thrown when license.dat does not exist in any known location.
 */
class LicenseNotFoundError extends LicenseError {
  constructor() {
    super("License file not found. Activation required.", "LICENSE_NOT_FOUND");
    this.name = "LicenseNotFoundError";
  }
}

/**
 * Thrown when the license file fails any validation step.
 *
 * Reason codes:
 *   SIGNATURE_INVALID     — ECDSA signature verification failed
 *   FINGERPRINT_MISMATCH  — License fingerprint does not match this hardware
 *   EXPIRED               — License expiration date has passed
 *   INVALID_EDITION       — Edition field contains an unrecognised value
 *   TAMPERED              — File structure is corrupt or AES tag mismatch
 *   MALFORMED             — JSON structure is invalid or missing required fields
 */
class LicenseValidationError extends LicenseError {
  /**
   * @param {string} message
   * @param {string} reasonCode  One of the codes listed above
   */
  constructor(message, reasonCode) {
    super(message, reasonCode);
    this.name = "LicenseValidationError";
  }
}

module.exports = {
  LicenseError,
  HddNotFoundError,
  HardwareReadError,
  LicenseNotFoundError,
  LicenseValidationError,
};
