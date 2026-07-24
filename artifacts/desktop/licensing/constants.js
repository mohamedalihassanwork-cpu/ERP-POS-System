"use strict";

/**
 * constants.js — Licensing System Constants
 *
 * Contains the embedded ECDSA P-256 public key, salt for AES key derivation,
 * known license editions, and storage paths.
 *
 * SECURITY NOTES:
 *   - The PRIVATE KEY is NOT present here and must never appear in this project.
 *   - The APP_SALT is not a secret; AES security derives from the device
 *     fingerprint. The salt prevents trivial key reuse across applications.
 *   - The PUBLIC_KEY_PEM is safe to distribute; it can only verify, not sign.
 */

/**
 * ECDSA P-256 public key (PEM SPKI format).
 * Generated fresh for this project. The matching private key is stored
 * separately in the standalone License Generator application.
 *
 * Algorithm : EC / prime256v1 (P-256)
 * Use       : Signature verification in LicenseValidator
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJM5BSLmZTXMpdYkHQQWIBStSyorx
vOCsj4fBnzJPf1PN8zAoWQaj0J6KjfQ+jHiSIYvdYmJs8Qbf4rWj5ObSDg==
-----END PUBLIC KEY-----`;

/**
 * Static salt mixed into the AES-256-GCM key derivation.
 * Ensures the encryption key is application-specific even when two
 * machines share the same fingerprint (e.g. identical hardware).
 * Not a secret — security comes from the ECDSA signature.
 */
const APP_SALT = "ShoeStorePOS-ERP-LicSalt-v1-2026";

/**
 * Recognised license editions.
 * A license with an edition NOT in this list is rejected.
 */
const LICENSE_EDITIONS = Object.freeze(["professional", "enterprise"]);

/**
 * Current license file format version.
 * Increment when the encrypted payload schema changes.
 */
const LICENSE_VERSION = 1;

/**
 * License file name (stored encrypted).
 */
const LICENSE_FILENAME = "license.dat";

/**
 * Primary license storage directory: C:\ProgramData\ShoeStorePOS
 * Survives Windows reinstall (ProgramData is on the system drive).
 */
const PROGRAMDATA_LICENSE_DIR = "C:\\ProgramData\\ShoeStorePOS";

/**
 * Fallback license storage directory: %APPDATA%\ShoeStorePOS
 * Used when ProgramData is not writable (non-admin install).
 */
const APPDATA_LICENSE_SUBDIR = "ShoeStorePOS";

/**
 * How long (ms) a PowerShell command is allowed to run before
 * we consider it a timeout and throw HardwareReadError.
 */
const HARDWARE_READ_TIMEOUT_MS = 15000;

module.exports = {
  PUBLIC_KEY_PEM,
  APP_SALT,
  LICENSE_EDITIONS,
  LICENSE_VERSION,
  LICENSE_FILENAME,
  PROGRAMDATA_LICENSE_DIR,
  APPDATA_LICENSE_SUBDIR,
  HARDWARE_READ_TIMEOUT_MS,
};
