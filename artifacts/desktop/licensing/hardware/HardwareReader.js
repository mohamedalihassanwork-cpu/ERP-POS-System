"use strict";

/**
 * hardware/HardwareReader.js — Hardware Identifier Reader
 *
 * Reads the three stable hardware identifiers required for device fingerprinting:
 *
 *   1. Motherboard (baseboard) serial number
 *   2. CPU processor ID
 *   3. External HDD physical disk serial number
 *
 * Primary method  : PowerShell via Get-CimInstance (modern, works on Windows 8+)
 * Fallback method : WMIC (deprecated but still present on older systems)
 *
 * All values are trimmed and upper-cased for consistent hashing.
 * Null bytes, spaces, and common "not-available" sentinel strings
 * ("To Be Filled By O.E.M.", "Default string", etc.) are normalised away.
 *
 * IMPORTANT: This module runs in the Electron main process only.
 *            Never require() it from the renderer.
 */

const { execSync } = require("child_process");
const { HardwareReadError } = require("../errors");
const { HARDWARE_READ_TIMEOUT_MS } = require("../constants");

// ---------------------------------------------------------------------------
// Sentinel values that OEMs put in serial-number fields when they don't
// populate them properly. We treat these as "empty".
// ---------------------------------------------------------------------------
const SENTINEL_VALUES = new Set([
  "TO BE FILLED BY O.E.M.",
  "TO BE FILLED BY O.E.M",
  "DEFAULT STRING",
  "DEFAULT",
  "N/A",
  "NA",
  "NONE",
  "0",
  "00000000",
  "FFFFFFFF",
  "NOT APPLICABLE",
  "NOT SPECIFIED",
  "SYSTEM SERIAL NUMBER",
  "CHASSIS SERIAL NUMBER",
  "BASE BOARD SERIAL NUMBER",
]);

/**
 * Normalise a raw string value read from a hardware registry/WMI field.
 *
 * @param {string|null|undefined} raw
 * @returns {string}  Normalised, upper-cased value or empty string ""
 */
function normalise(raw) {
  if (!raw || typeof raw !== "string") return "";
  // Strip null bytes and control characters
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
  const upper = cleaned.toUpperCase();
  if (SENTINEL_VALUES.has(upper)) return "";
  return upper;
}

/**
 * Execute a PowerShell command synchronously and return stdout as a string.
 *
 * @param {string} psScript  PowerShell inline script
 * @returns {string}
 * @throws {Error}  If the process exits with a non-zero code
 */
function runPowerShell(psScript) {
  try {
    const result = execSync(
      `powershell.exe -NoProfile -NonInteractive -Command "${psScript}"`,
      {
        timeout: HARDWARE_READ_TIMEOUT_MS,
        encoding: "utf8",
        windowsHide: true,
      }
    );
    return result || "";
  } catch (err) {
    throw new Error(`PowerShell execution failed: ${err.message}`);
  }
}

/**
 * Execute a WMIC command synchronously and return stdout as a string.
 * Used as a legacy fallback only.
 *
 * @param {string} wmicArgs
 * @returns {string}
 */
function runWmic(wmicArgs) {
  try {
    const result = execSync(`wmic ${wmicArgs}`, {
      timeout: HARDWARE_READ_TIMEOUT_MS,
      encoding: "utf8",
      windowsHide: true,
    });
    return result || "";
  } catch (err) {
    throw new Error(`WMIC execution failed: ${err.message}`);
  }
}

/**
 * Parse a single-value PowerShell CimInstance output.
 * Get-CimInstance | Select-Object -ExpandProperty <Prop> emits just the value.
 *
 * @param {string} output  Raw stdout from PowerShell
 * @returns {string}       Normalised value
 */
function parseSingleValue(output) {
  return normalise(output.split("\n").map((l) => l.trim()).find((l) => l.length > 0) || "");
}

// ---------------------------------------------------------------------------
// Public read functions
// ---------------------------------------------------------------------------

/**
 * Read the motherboard (baseboard) serial number.
 *
 * Primary  : Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber
 * Fallback : wmic baseboard get SerialNumber
 *
 * @returns {string}  Upper-cased serial number
 * @throws  {HardwareReadError}
 */
function readMotherboardSerial() {
  // — Primary: CIM —
  try {
    const output = runPowerShell(
      "(Get-CimInstance -ClassName Win32_BaseBoard).SerialNumber"
    );
    const value = parseSingleValue(output);
    if (value) return value;
  } catch (_) {
    // fall through to WMIC
  }

  // — Fallback: WMIC —
  try {
    const output = runWmic("baseboard get SerialNumber /value");
    const match = output.match(/SerialNumber=(.+)/i);
    if (match) {
      const value = normalise(match[1]);
      if (value) return value;
    }
  } catch (_) {
    // fall through to error
  }

  throw new HardwareReadError(
    "Could not read motherboard serial number via CIM or WMIC."
  );
}

/**
 * Read the CPU Processor ID.
 *
 * Primary  : Get-CimInstance Win32_Processor | Select-Object -ExpandProperty ProcessorId
 * Fallback : wmic cpu get ProcessorId
 *
 * @returns {string}  Upper-cased Processor ID
 * @throws  {HardwareReadError}
 */
function readCpuId() {
  // — Primary: CIM —
  try {
    const output = runPowerShell(
      "(Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1).ProcessorId"
    );
    const value = parseSingleValue(output);
    if (value) return value;
  } catch (_) {
    // fall through
  }

  // — Fallback: WMIC —
  try {
    const output = runWmic("cpu get ProcessorId /value");
    const match = output.match(/ProcessorId=(.+)/i);
    if (match) {
      const value = normalise(match[1]);
      if (value) return value;
    }
  } catch (_) {
    // fall through
  }

  throw new HardwareReadError(
    "Could not read CPU Processor ID via CIM or WMIC."
  );
}

/**
 * Read the physical serial number of the external HDD identified by
 * the given physical disk index or by scanning all removable/external drives.
 *
 * Returns the serial number of the FIRST detected external hard disk.
 *
 * Physical disk serial numbers are stable across:
 *   - USB port changes (same drive, different port → same serial)
 *   - Windows reinstalls
 *   - Drive letter changes
 *   - Partition reformatting
 *
 * Primary  : Get-CimInstance Win32_DiskDrive where MediaType = 'External hard disk media'
 * Fallback : wmic diskdrive where "MediaType='External hard disk media'" get SerialNumber
 *
 * @returns {string[]}  Array of normalised serial numbers of detected external HDDs
 *                      (may be empty if no external HDD is found)
 * @throws  {HardwareReadError}  Only if the CIM/WMIC call itself fails
 */
function readExternalHddSerials() {
  const serials = [];

  // — Primary: CIM —
  try {
    const psScript = "Get-CimInstance -ClassName Win32_DiskDrive | Select-Object Model, DeviceID, PNPDeviceID, SerialNumber, InterfaceType, MediaType | ConvertTo-Json -Compress";

    const output = runPowerShell(psScript);
    if (output) {
      let disks = JSON.parse(output);
      if (!Array.isArray(disks)) disks = [disks];

      console.log("\\n=========================================================");
      console.log("DEBUG MODE: EXTERNAL HDD DETECTION");
      console.log("=========================================================");

      for (const d of disks) {
        let rawSerial = d.SerialNumber;
        
        // If SerialNumber is null/empty, extract from PNPDeviceID
        if (!rawSerial && d.PNPDeviceID) {
          const parts = d.PNPDeviceID.split("\\\\");
          rawSerial = parts[parts.length - 1];
        }

        const interfaceType = (d.InterfaceType || "").toUpperCase();
        const mediaType = (d.MediaType || "").toUpperCase();
        const pnpId = (d.PNPDeviceID || "").toUpperCase();
        const model = (d.Model || "").toUpperCase();

        // Detect external storage including USB, SCSI bridged enclosures, etc.
        const isExternal = 
          interfaceType === "USB" ||
          mediaType.includes("EXTERNAL") ||
          pnpId.includes("USBSTOR") ||
          pnpId.includes("UASP") ||
          model.includes("JMICRON") ||
          model.includes("ASMEDIA") ||
          model.includes("REALTEK");

        const normSerial = normalise(rawSerial);
        const selected = isExternal && !!normSerial;

        console.log(`Model         : ${d.Model || "N/A"}`);
        console.log(`DeviceID      : ${d.DeviceID || "N/A"}`);
        console.log(`InterfaceType : ${d.InterfaceType || "N/A"}`);
        console.log(`MediaType     : ${d.MediaType || "N/A"}`);
        console.log(`PNPDeviceID   : ${d.PNPDeviceID || "N/A"}`);
        console.log(`SerialNumber  : ${rawSerial || "N/A"} (Normalised: ${normSerial || "N/A"})`);
        console.log(`Bus Type      : ${d.InterfaceType || "N/A"}`);
        console.log(`Reason        : ${selected ? "Accepted (External HDD with valid serial)" : (isExternal ? "Rejected (No valid serial)" : "Rejected (Not recognized as external)")}`);
        console.log("---------------------------------------------------------");

        if (selected) {
          serials.push(normSerial);
        }
      }

      console.log(`Final HDD Serials Selected: [${serials.join(", ")}]`);
      console.log("=========================================================\\n");

      if (serials.length > 0) return serials;
    }
  } catch (err) {
    console.error("CIM detection failed:", err.message);
  }

  // — Fallback: WMIC —
  try {
    const output = runWmic(
      "diskdrive where \"InterfaceType='USB' OR MediaType='External hard disk media'\" get SerialNumber /value"
    );
    const matches = [...output.matchAll(/SerialNumber=(.+)/gi)];
    for (const m of matches) {
      const v = normalise(m[1]);
      if (v) serials.push(v);
    }
    if (serials.length > 0) return serials;
  } catch (_) {
    // fall through
  }

  return [];
}

/**
 * Read all three hardware identifiers in one call.
 *
 * @returns {{ motherboardSerial: string, cpuId: string, externalHddSerials: string[] }}
 * @throws  {HardwareReadError}  If mobo or CPU cannot be read
 */
function readAll() {
  const motherboardSerial = readMotherboardSerial();
  const cpuId = readCpuId();
  const externalHddSerials = readExternalHddSerials();
  return { motherboardSerial, cpuId, externalHddSerials };
}

module.exports = {
  readMotherboardSerial,
  readCpuId,
  readExternalHddSerials,
  readAll,
  // Exported for testing
  normalise,
};
