"use strict";

/**
 * crypto/FingerprintEngine.js — Device Fingerprint Generator
 *
 * Computes a stable, hardware-bound device fingerprint using:
 *
 *   SHA-256( moboSerial + "|" + cpuId + "|" + hddSerial )
 *
 * The fingerprint:
 *   ✓  Survives Windows reinstalls (derived from firmware identifiers)
 *   ✓  Survives USB port changes   (uses physical disk serial, not drive letter)
 *   ✗  Changes if motherboard is replaced
 *   ✗  Changes if CPU is replaced
 *   ✗  Changes if the authorized external HDD is replaced
 *
 * The concatenation separator "|" prevents trivial collisions between
 * short serial numbers that happen to concatenate identically.
 */

const crypto = require("crypto");

class FingerprintEngine {
  /**
   * Compute the device fingerprint.
   *
   * @param {string} motherboardSerial  Normalised motherboard serial number
   * @param {string} cpuId              Normalised CPU Processor ID
   * @param {string} hddSerial          Normalised external HDD physical disk serial
   * @returns {string}  64-character lowercase hex SHA-256 digest
   */
  static compute(motherboardSerial, cpuId, hddSerial) {
    if (!motherboardSerial || !cpuId || !hddSerial) {
      throw new Error(
        "FingerprintEngine.compute: all three hardware identifiers are required."
      );
    }

    const payload = [
      motherboardSerial.trim().toUpperCase(),
      cpuId.trim().toUpperCase(),
      hddSerial.trim().toUpperCase(),
    ].join("|");

    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  }

  /**
   * Verify that a fingerprint string looks like a valid SHA-256 hex digest.
   *
   * @param {string} fingerprint
   * @returns {boolean}
   */
  static isValidFormat(fingerprint) {
    return typeof fingerprint === "string" && /^[0-9a-f]{64}$/.test(fingerprint);
  }
}

module.exports = { FingerprintEngine };
