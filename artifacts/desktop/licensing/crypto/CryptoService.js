"use strict";

/**
 * crypto/CryptoService.js — Cryptographic Primitives for the Licensing System
 *
 * Provides:
 *   - ECDSA P-256 signature verification
 *   - AES-256-GCM symmetric encryption / decryption
 *   - AES key derivation from the device fingerprint + salt
 *
 * Uses ONLY Node.js built-in `crypto`. Zero external dependencies.
 *
 * AES Key Derivation:
 *   key = SHA-256( fingerprint + ":" + APP_SALT )
 *
 * The AES layer protects against casual inspection of license.dat.
 * The real security guarantee comes from the ECDSA digital signature,
 * which cannot be forged without the private key.
 *
 * NEVER store or log the AES key or the private key.
 */

const crypto = require("crypto");
const { APP_SALT } = require("../constants");
const { LicenseValidationError } = require("../errors");

class CryptoService {
  // -------------------------------------------------------------------------
  // ECDSA Verification
  // -------------------------------------------------------------------------

  /**
   * Verify an ECDSA P-256 signature.
   *
   * The signature covers the canonical JSON of the license payload
   * (the object with the "signature" field removed, keys sorted).
   *
   * @param {string} publicKeyPem   PEM SPKI public key
   * @param {string} dataString     The exact string that was signed
   * @param {string} signatureHex   Hex-encoded DER signature
   * @returns {boolean}             true = signature valid
   */
  static verifySignature(publicKeyPem, dataString, signatureHex) {
    try {
      const verify = crypto.createVerify("SHA256");
      verify.update(dataString, "utf8");
      verify.end();
      const signatureBuffer = Buffer.from(signatureHex, "hex");
      return verify.verify(
        { key: publicKeyPem, format: "pem" },
        signatureBuffer
      );
    } catch (err) {
      // Invalid key format, truncated signature, etc.
      throw new LicenseValidationError(
        `Signature verification error: ${err.message}`,
        "SIGNATURE_INVALID"
      );
    }
  }

  // -------------------------------------------------------------------------
  // AES-256-GCM Encryption / Decryption
  // -------------------------------------------------------------------------

  /**
   * Derive a 32-byte AES key from the device fingerprint and the APP_SALT.
   *
   * @param {string} fingerprint  64-char hex device fingerprint
   * @returns {Buffer}            32-byte key buffer
   */
  static deriveAesKey(fingerprint) {
    const material = fingerprint + ":" + APP_SALT;
    return crypto.createHash("sha256").update(material, "utf8").digest();
  }

  /**
   * Encrypt a plaintext string with AES-256-GCM.
   *
   * @param {string} plaintext    UTF-8 string to encrypt
   * @param {string} fingerprint  Device fingerprint (used for key derivation)
   * @returns {{ iv: string, tag: string, ct: string }}
   *          All values are lowercase hex strings.
   */
  static encrypt(plaintext, fingerprint) {
    const key = CryptoService.deriveAesKey(fingerprint);
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      ct: encrypted.toString("hex"),
    };
  }

  /**
   * Decrypt an AES-256-GCM ciphertext.
   *
   * @param {string} ivHex          Hex-encoded 12-byte IV
   * @param {string} tagHex         Hex-encoded 16-byte GCM auth tag
   * @param {string} ctHex          Hex-encoded ciphertext
   * @param {string} fingerprint    Device fingerprint (used for key derivation)
   * @returns {string}              Decrypted UTF-8 plaintext
   * @throws  {LicenseValidationError}  If auth tag fails (tamper detected)
   */
  static decrypt(ivHex, tagHex, ctHex, fingerprint) {
    try {
      const key = CryptoService.deriveAesKey(fingerprint);
      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const ct = Buffer.from(ctHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([
        decipher.update(ct),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (err) {
      throw new LicenseValidationError(
        "License file integrity check failed. The file may have been tampered with.",
        "TAMPERED"
      );
    }
  }

  // -------------------------------------------------------------------------
  // Canonical JSON for Signing
  // -------------------------------------------------------------------------

  /**
   * Produce the canonical JSON string of the license payload that is used
   * as the signing input. The "signature" field is excluded, and keys are
   * sorted alphabetically for determinism.
   *
   * @param {object} payload  License payload object (with or without "signature")
   * @returns {string}        Canonical JSON string
   */
  static canonicalPayload(payload) {
    const { signature: _sig, ...rest } = payload;  // eslint-disable-line no-unused-vars
    const sorted = Object.keys(rest)
      .sort()
      .reduce((acc, k) => {
        acc[k] = rest[k];
        return acc;
      }, {});
    return JSON.stringify(sorted);
  }
}

module.exports = { CryptoService };
