"use strict";

/**
 * hardware/HddDetector.js — Authorized External HDD Detector
 *
 * Determines whether the authorized external HDD dongle is connected.
 *
 * The "dongle" is identified by its Physical Disk Serial Number — the serial
 * number burned into the drive's firmware. This is stable across:
 *
 *   ✓  USB port changes
 *   ✓  Windows reinstalls
 *   ✓  Drive letter changes
 *   ✓  Partition format / filesystem changes
 *
 * At first activation, the LicenseGuard records the selected HDD serial
 * inside the license itself (as the fingerprint component). On all subsequent
 * starts the detected HDD serials are cross-checked against the license.
 *
 * IMPORTANT: This module runs in the Electron main process only.
 */

const { HddNotFoundError } = require("../errors");
const { readExternalHddSerials } = require("./HardwareReader");

class HddDetector {
  /**
   * @param {Function} [log]  Optional log(level, msg, meta?) function
   */
  constructor(log) {
    this._log = log || (() => {});
  }

  /**
   * Detect all connected external hard disk drives and return their
   * physical serial numbers.
   *
   * @returns {string[]}  Array of upper-cased physical disk serial numbers.
   *                      May be empty if no external HDD is present.
   */
  detectAll() {
    this._log("info", "[Licensing] Scanning for external HDDs...");
    const serials = readExternalHddSerials();
    this._log("info", `[Licensing] Detected ${serials.length} external HDD(s).`);
    return serials;
  }

  /**
   * Ensure at least one external HDD is connected.
   * Throws HddNotFoundError if none is found.
   *
   * @returns {string[]}  Serial numbers of all detected external HDDs.
   * @throws  {HddNotFoundError}
   */
  requireAtLeastOne() {
    const serials = this.detectAll();
    if (serials.length === 0) {
      throw new HddNotFoundError(
        "No authorized external HDD detected. " +
        "Please connect the hardware security dongle and restart the application."
      );
    }
    return serials;
  }

  /**
   * Verify that a specific serial number (recorded in the license) matches
   * one of the currently connected external HDDs.
   *
   * @param {string}   requiredSerial  Serial from the license fingerprint
   * @param {string[]} connectedSerials  Result of detectAll()
   * @returns {boolean}
   */
  isAuthorizedHddConnected(requiredSerial, connectedSerials) {
    if (!requiredSerial) return false;
    return connectedSerials.includes(requiredSerial.toUpperCase().trim());
  }
}

module.exports = { HddDetector };
