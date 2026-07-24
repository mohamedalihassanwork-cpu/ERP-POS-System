# Code Audit Notes

> This document records known code quality observations based on source inspection as of 2026-07-24.

---

## Debug / One-Off Scripts (Not Shipped)

The following files exist in `artifacts/api-server/` and are **not part of the production build** (esbuild only bundles `src/`). They are developer utilities left from debugging sessions:

| File | Purpose |
|------|---------|
| `audit-timestamps.cjs` | One-off: checks audit log timestamp formatting |
| `debug-checkout.cjs` | One-off: checkout debugging script |
| `patch-all.cjs` | Data migration patches |
| `reset-password.mjs` | Emergency CLI: reset a user password |
| `unlock-admin.cjs` | Emergency CLI: unlock locked admin account |
| `test-*.{cjs,mjs}` | Manual integration test scripts |

These are safe to leave in place — they are never executed in production (the esbuild bundle is `dist/index.mjs` only). They can be deleted at any time with no functional impact.

---

## Duplicate Directory

`artifacts/api-server/src/middlewares/` (with an 's') exists alongside `artifacts/api-server/src/middleware/`. The `middlewares/` directory appears to be empty or a legacy artifact. All active middleware lives in `middleware/auth.ts`.

---

## `artifacts/mockup-sandbox/`

A UI prototyping sandbox used during development for experimenting with components. It is **not included** in any build or deployment. It can be ignored.

---

## Production Code Quality

The core production code (routes, services, managers) is clean with:
- No dead code found in active modules
- Consistent error handling patterns (Zod validation → 400, permission check → 403, not found → 404)
- All financial operations properly wrapped in `db.transaction()`
- Proper audit log coverage on all write operations
- No console.log statements in production code (pino logger used throughout)

---

## Known Design Notes

- `artifacts/api-server/src/middlewares/` — empty legacy directory, can be deleted
- `artifacts/desktop/preload.js` has `sandbox: false` in `webPreferences` — required because the preload script uses `require()`. This is a known trade-off; the security model is maintained by `contextIsolation: true`.
- The `allow_negative_stock` setting can be used to override stock validation in edge cases (e.g. back-office reconciliation). When enabled, the system will create negative inventory balances.
