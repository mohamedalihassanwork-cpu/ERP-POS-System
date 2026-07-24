#!/usr/bin/env node
"use strict";

/**
 * ============================================================
 * ERP License Generator — Standalone Node.js CLI Tool
 * ============================================================
 *
 * Generates signed, AES-256-GCM encrypted license.dat files
 * for the Shoe Store ERP application.
 *
 * This tool uses:
 *   - ECDSA P-256 (SHA-256) for digital signing
 *   - AES-256-GCM for encryption
 *   - Node.js built-in 'crypto' only (zero dependencies)
 *
 * ============================================================
 *  SECURITY CHECKLIST
 * ============================================================
 *  ✓  Keep private.pem in a secure, access-controlled location
 *  ✓  Back up private.pem securely (loss = cannot issue new licenses)
 *  ✓  Never share private.pem with the customer
 *  ✓  Never include private.pem in the ERP project
 *  ✓  This tool should run on the VENDOR's machine only
 *  ✓  Generated license.dat is safe to send to the customer
 * ============================================================
 *
 * Usage:
 *   node src/generate-license.js [options]
 *
 * Options:
 *   --fingerprint  <hex>    64-char device fingerprint from ERP activation window
 *   --edition      <str>    professional | enterprise
 *   --private-key  <file>   Path to private.pem (default: ../private.pem)
 *   --expires      <date>   Expiry date YYYY-MM-DD (omit for perpetual license)
 *   --output       <file>   Output path (default: ./license.dat)
 *   --help                  Show this help
 *
 * Examples:
 *
 *   Perpetual professional license:
 *   node src/generate-license.js \
 *     --fingerprint a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 \
 *     --edition professional
 *
 *   Enterprise license expiring 2027-12-31:
 *   node src/generate-license.js \
 *     --fingerprint a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 \
 *     --edition enterprise \
 *     --expires 2027-12-31 \
 *     --output ./output/license.dat
 * ============================================================
 */

const crypto = require("crypto");
const fs     = require("fs");
const path   = require("path");

// ── Constants — must match ERP's constants.js exactly ───────────────────────
const APP_SALT         = "ShoeStorePOS-ERP-LicSalt-v1-2026";
const LICENSE_VERSION  = 1;
const LICENSE_EDITIONS = ["professional", "enterprise"];
const LICENSE_FILENAME = "license.dat";

// ── Argument parsing ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val =
        argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
┌─────────────────────────────────────────────────────┐
│         ERP License Generator — Help                │
└─────────────────────────────────────────────────────┘

  node src/generate-license.js [options]

  --fingerprint  <hex>    64-char hex device fingerprint  (required)
  --edition      <str>    professional | enterprise        (required)
  --private-key  <file>   Path to private.pem              (default: ../private.pem)
  --expires      <date>   YYYY-MM-DD expiry date           (optional, omit = perpetual)
  --output       <file>   Output file path                 (default: ./license.dat)
  --help                  Show this message

Examples:

  # Perpetual license:
  node src/generate-license.js \\
    --fingerprint a1b2...64chars \\
    --edition professional

  # Expiring license:
  node src/generate-license.js \\
    --fingerprint a1b2...64chars \\
    --edition enterprise \\
    --expires 2027-12-31 \\
    --output ./client-licenses/license.dat
`);
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

function canonicalPayload(payload) {
  const { signature: _sig, ...rest } = payload;
  const sorted = Object.keys(rest)
    .sort()
    .reduce((acc, k) => {
      acc[k] = rest[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

function signPayload(privateKeyPem, dataString) {
  const sign = crypto.createSign("SHA256");
  sign.update(dataString, "utf8");
  sign.end();
  const sigBuffer = sign.sign({ key: privateKeyPem, format: "pem" });
  return sigBuffer.toString("hex");
}

function deriveAesKey(fingerprint) {
  const material = fingerprint + ":" + APP_SALT;
  return crypto.createHash("sha256").update(material, "utf8").digest();
}

function encryptAES256GCM(plaintext, fingerprint) {
  const key     = deriveAesKey(fingerprint);
  const iv      = crypto.randomBytes(12);
  const cipher  = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct      = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag     = cipher.getAuthTag();
  return {
    iv:  iv.toString("hex"),
    tag: tag.toString("hex"),
    ct:  ct.toString("hex"),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }

  // ── Validate required arguments ──────────────────────────────────────────
  const errors = [];

  if (!args.fingerprint) {
    errors.push("--fingerprint is required");
  } else if (!/^[0-9a-fA-F]{64}$/.test(args.fingerprint)) {
    errors.push("--fingerprint must be exactly 64 hexadecimal characters");
  }

  if (!args.edition) {
    errors.push("--edition is required");
  } else if (!LICENSE_EDITIONS.includes(args.edition)) {
    errors.push(`--edition must be one of: ${LICENSE_EDITIONS.join(", ")}`);
  }

  // Default private key location
  const privateKeyPath = args["private-key"]
    ? path.resolve(args["private-key"])
    : path.resolve(__dirname, "..", "private.pem");

  if (!fs.existsSync(privateKeyPath)) {
    errors.push(
      `Private key not found at: ${privateKeyPath}\n` +
      `  Use --private-key <path> to specify the location.`
    );
  }

  let expiresAt = null;
  if (args.expires) {
    const d = new Date(args.expires);
    if (isNaN(d.getTime())) {
      errors.push(`--expires is not a valid date: "${args.expires}"`);
    } else {
      // Set to end of the specified day (23:59:59 UTC)
      d.setUTCHours(23, 59, 59, 999);
      expiresAt = d.toISOString();
    }
  }

  if (errors.length > 0) {
    console.error("\n❌  Error(s):\n");
    errors.forEach((e) => console.error(`   • ${e}`));
    console.error("\n   Run --help for usage.\n");
    process.exit(1);
  }

  // ── Load and validate private key ────────────────────────────────────────
  let privateKeyPem;
  try {
    privateKeyPem = fs.readFileSync(privateKeyPath, "utf8");
  } catch (err) {
    console.error(`\n❌  Cannot read private key file: ${err.message}\n`);
    process.exit(1);
  }

  try {
    // Quick smoke test: try to sign something
    const testSign = crypto.createSign("SHA256");
    testSign.update("smoke-test", "utf8");
    testSign.sign(privateKeyPem);
  } catch (err) {
    console.error(`\n❌  The private key file appears to be invalid:\n   ${err.message}\n`);
    process.exit(1);
  }

  const fingerprint = args.fingerprint.toLowerCase();

  // ── Build license payload ─────────────────────────────────────────────────
  const payloadBase = {
    version:     LICENSE_VERSION,
    fingerprint,
    edition:     args.edition,
    issuedAt:    new Date().toISOString(),
    expiresAt,
  };

  // Sign the canonical form (no "signature" field, keys sorted)
  const canonical  = canonicalPayload(payloadBase);
  const signature  = signPayload(privateKeyPem, canonical);

  const fullPayload   = { ...payloadBase, signature };
  const plaintextJson = JSON.stringify(fullPayload, null, 2);

  // ── Encrypt ───────────────────────────────────────────────────────────────
  const AES_STATIC_KEY = "ShoeStorePOS_STATIC_KEY_V1";
  const { iv, tag, ct } = encryptAES256GCM(plaintextJson, AES_STATIC_KEY);
  const envelopeJson    = JSON.stringify({ v: LICENSE_VERSION, iv, tag, ct });

  // ── Write output ──────────────────────────────────────────────────────────
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(process.cwd(), LICENSE_FILENAME);

  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, envelopeJson, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.error(`\n❌  Cannot write license file: ${err.message}\n`);
    process.exit(1);
  }

  // ── Print summary ─────────────────────────────────────────────────────────
  const separator = "─".repeat(60);

  console.log(`\n${separator}`);
  console.log("✅  License generated successfully!");
  console.log(separator);
  console.log(`   Output       : ${outputPath}`);
  console.log(`   Edition      : ${args.edition}`);
  console.log(`   Fingerprint  : ${fingerprint.substring(0, 20)}...`);
  console.log(`   Issued at    : ${payloadBase.issuedAt}`);
  console.log(`   Expires at   : ${expiresAt || "Never (perpetual license)"}`);
  console.log(`   Private key  : ${privateKeyPath}`);
  console.log(separator);
  console.log("\n📋  Plaintext Payload (for your records):\n");
  console.log(plaintextJson);
  console.log(`\n${separator}\n`);
  console.log("📦  Deliver to customer:  " + path.basename(outputPath));
  console.log("    Customer copies license.dat to:");
  console.log("      C:\\ProgramData\\ShoeStorePOS\\license.dat");
  console.log("    — OR —");
  console.log("      Place it via the ERP activation window.\n");
}

main();
