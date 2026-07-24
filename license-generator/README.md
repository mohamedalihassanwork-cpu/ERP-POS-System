# ERP License Generator

Standalone tool to generate signed, encrypted license files for the Shoe Store ERP system.

## Prerequisites

- Node.js 18+
- The `private.pem` ECDSA P-256 private key (stored in `../private.pem` relative to this directory)

## Security Rules

| Rule | Description |
|------|-------------|
| ✅ Keep | `private.pem` in a secure, access-controlled location |
| ✅ Back up | `private.pem` securely — loss means you cannot issue new licenses |
| ❌ Never share | `private.pem` with the customer |
| ❌ Never include | `private.pem` in the ERP project repository |
| ✅ Safe to send | The generated `license.dat` to the customer |

## Usage

```bash
# Show help
node src/generate-license.js --help

# Perpetual professional license
node src/generate-license.js \
  --fingerprint <64-char-hex-from-erp-activation-window> \
  --edition professional

# Enterprise license expiring 2027-12-31
node src/generate-license.js \
  --fingerprint <64-char-hex> \
  --edition enterprise \
  --expires 2027-12-31 \
  --output ./client-licenses/acme-corp/license.dat
```

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--fingerprint` | ✅ | 64-char hex device fingerprint from the ERP activation window |
| `--edition` | ✅ | `professional` or `enterprise` |
| `--private-key` | ❌ | Path to `private.pem` (default: `../private.pem`) |
| `--expires` | ❌ | Expiry date `YYYY-MM-DD`. Omit for perpetual license |
| `--output` | ❌ | Output file path (default: `./license.dat`) |

## Workflow

```
Customer                        Vendor (you)
─────────                       ────────────────────────────────────
1. Install ERP
2. Start ERP → Activation Window shown
3. Copy Device Fingerprint (64-char hex)
4. Send fingerprint to vendor  ──────────────────────────────────►
                                5. Run this license generator with fingerprint
                                6. Generate license.dat
                                7. Send license.dat to customer  ◄──────────
8. Open Activation Window
9. Paste license.dat contents
10. Click Activate
11. ERP starts normally ✅
```

## What is the Device Fingerprint?

The device fingerprint is computed inside the ERP as:

```
SHA-256( MotherboardSerial | CpuId | ExternalHddSerial )
```

It is stable across:
- ✅ Windows reinstalls
- ✅ USB port changes (same drive, different port)
- ✅ Drive letter changes

It changes when:
- ❌ Motherboard is replaced
- ❌ CPU is replaced
- ❌ External HDD dongle is replaced

## License File Format

The `license.dat` file is an AES-256-GCM encrypted envelope:

```json
{
  "v": 1,
  "iv": "<96-bit IV in hex>",
  "tag": "<128-bit GCM auth tag in hex>",
  "ct": "<ciphertext in hex>"
}
```

Inside the envelope is the plaintext license payload:

```json
{
  "version": 1,
  "fingerprint": "<sha256-hex>",
  "edition": "professional",
  "issuedAt": "2026-07-15T20:00:00.000Z",
  "expiresAt": null,
  "signature": "<ecdsa-p256-signature-hex>"
}
```

The ECDSA signature covers the canonical JSON of the payload (all fields except `signature`, keys sorted alphabetically).
