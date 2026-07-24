# Project Overview

## What Is This System?

A full-featured, Arabic-first Point-of-Sale and Enterprise Resource Planning (ERP) system designed for retail businesses. The system manages every aspect of a retail operation: sales, purchases, inventory, suppliers, customers, employees, payroll, treasury/cash management, and double-entry accounting.

The UI and all error messages are in **Arabic**. The database stores Arabic text natively. Date/time handling accounts for an Egyptian retail shift that starts at 11:00 AM rather than midnight.

---

## Deployment Modes

The system is designed to run in two completely different environments using the **exact same codebase**:

### Web Mode (Replit / Cloud hosting)
- Express API server runs on the host.
- React POS SPA is served from Vite's dev server (port 5000) during development, or from a CDN / Replit proxy in production.
- The API is the source of truth; the frontend communicates over HTTP.
- The database is a single SQLite file on the server's filesystem.

### Desktop Mode (Electron / Windows)
- Electron shells around the same Express API server, spawning it as a child process using Electron's own bundled Node.js runtime.
- The React SPA is built by Vite and then **statically served by the same Express server** (`SERVE_STATIC=true`), so both the frontend and API share the same origin (`http://localhost:5001`). This eliminates cross-origin cookie problems for the HttpOnly refresh token.
- The SQLite database is stored in `%APPDATA%\ShoeStorePOS\store.db`.
- A machine-bound license system (ECDSA P-256 signatures) enforces activation before the app will start.

---

## Monorepo Structure

The project is a **pnpm workspace monorepo** with packages in two top-level directories:

```
ERP-final/
├── artifacts/          ← Deployable applications
│   ├── api-server/     ← Express REST API (Node.js / TypeScript)
│   ├── pos/            ← React SPA frontend (Vite / TypeScript)
│   ├── desktop/        ← Electron shell (JavaScript)
│   └── mockup-sandbox/ ← UI prototyping playground (not shipped)
│
├── lib/                ← Shared libraries (consumed by artifacts)
│   ├── db/             ← Drizzle ORM schema + libSQL client setup
│   ├── shared/         ← Permissions catalog, default roles
│   ├── api-spec/       ← OpenAPI YAML + Orval code-generation config
│   ├── api-client-react/ ← Generated React Query hooks (from OpenAPI)
│   └── api-zod/        ← Generated Zod validation schemas (from OpenAPI)
│
├── scripts/            ← Workspace-level utility scripts
├── documentation/      ← This documentation folder
├── license-generator/  ← Standalone tool for issuing license keys
├── pnpm-workspace.yaml ← Package workspace + shared catalog versions
├── tsconfig.base.json  ← Base TypeScript config inherited by all packages
└── package.json        ← Root workspace scripts
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────┐
│                React SPA (POS)                  │
│   artifacts/pos/src/                            │
│   • Wouter routing                              │
│   • TanStack Query for server state             │
│   • Generated API client (Orval hooks)          │
│   • Auth context (JWT + silent refresh)         │
└────────────────────┬────────────────────────────┘
                     │ HTTP/fetch  Bearer token
                     │ Refresh token via HttpOnly cookie
                     ▼
┌─────────────────────────────────────────────────┐
│            Express API Server                   │
│   artifacts/api-server/src/                     │
│   • Auth middleware (verifyAccessToken)         │
│   • Permission middleware (requirePermission)   │
│   • 23 route modules                            │
│   • Core services: inventory / treasury /       │
│     accounting / sequences                      │
└────────────────────┬────────────────────────────┘
                     │ Drizzle ORM
                     ▼
┌─────────────────────────────────────────────────┐
│            SQLite Database (libSQL)             │
│   lib/db/src/auto-schema.ts                     │
│   • 40+ tables, single file store.db           │
│   • Timestamps as Unix milliseconds (integer)   │
│   • All monetary amounts as TEXT strings        │
└─────────────────────────────────────────────────┘
```

In **Desktop mode**, a third tier wraps the entire stack:

```
┌─────────────────────────────────────────────────┐
│            Electron Shell                       │
│   artifacts/desktop/                            │
│   • ApplicationManager (orchestrator)           │
│   • WindowManager (multi-window)                │
│   • SessionManager (isolated sessions)          │
│   • LicenseGuard (hardware binding)             │
│   • IPC bridge (contextBridge)                  │
└────────────────────┬────────────────────────────┘
                     │ child_process.spawn (API server)
                     │ http://localhost:5001 (windows)
                     ▼
              [Same Express + SQLite stack above]
```

---

## Key Design Decisions

### Single SQLite File
The system uses a single SQLite file per installation rather than a networked database. This matches the "single store" deployment model — each installation belongs to exactly one store. The `storeId` column present on every table is the tenant identifier; in practice only one store record will ever exist per database file.

### All Money as TEXT
Monetary values (`price`, `amount`, `balance`, etc.) are stored as TEXT strings in SQLite, not as REAL or INTEGER. This avoids floating-point precision errors. The server-side `money()` and `cents()` helper functions in `lib/money.ts` handle all arithmetic using integer cent representations internally and format back to strings for storage.

### Timestamps as Integer (Unix ms)
All `created_at` / `updated_at` columns are `INTEGER` storing Unix epoch milliseconds. The SQLite default expression `cast((julianday('now') - 2440587.5)*86400000 as integer)` produces this value automatically. This is important for date-range queries used in reports.

### Shift Cutoff at 11:00 AM
The system treats 11:00 AM as the start/end of a business "shift day". A transaction made at 10:30 AM on March 15 is considered part of the March 14 shift. This is baked into:
- `AnalyticsService` date expressions: `datetime((created_at / 1000) - 39600, 'unixepoch')` (subtract 11 hours = 39600 seconds)
- `getShiftStart()` / `getShiftEnd()` functions in `reports.ts`
- `resolveBackdatedTreasuryAccount()` in `treasury.ts`

### Immutable Ledgers
Both the **inventory movement ledger** (`inventory_movements`) and the **treasury transaction ledger** (`treasury_transactions`) are append-only. Records are never updated or deleted; each row carries a `balance_after` snapshot. This provides a complete audit trail and allows ledger reconstruction at any point in time.

### Tenant Isolation via Access Token
Every API request that requires authentication runs through the auth middleware, which extracts `storeId` from the verified JWT access token — never from the request body or query params. This ensures that a user of store A can never accidentally (or maliciously) read or write data from store B.

### OpenAPI-First API Contract
The API is described in `lib/api-spec/openapi.yaml`. Orval generates:
1. **React Query hooks** → `lib/api-client-react/src/generated/`
2. **Zod validation schemas** → `lib/api-zod/src/generated/`

The generated Zod schemas are imported directly into the Express route handlers for request validation, ensuring the frontend and backend are always in sync on the exact same contract.

---

## Language and Locale

- Primary UI language: **Arabic (RTL)**
- Error messages from the API: Arabic
- Default currency: **EGP** (Egyptian Pound)
- Numeral format setting: `western` (0–9) or `eastern` (٠–٩) — configurable per store
- Size systems: EU is the default; others can be added via the master data page
