# Folder Structure

> Every directory and file in the project, what it contains, and why it exists.

---

## Root Level

```
ERP-final/
├── .agents/                    ← Agent customization rules (Antigravity IDE)
├── .git/                       ← Git repository
├── .gitignore                  ← Ignores node_modules, dist, .env files, *.db
├── .npmrc                      ← pnpm config (shamefully-hoist, etc.)
├── artifacts/                  ← Deployable application packages
├── backups/                    ← Manual database backups (gitignored)
├── documentation/              ← This documentation folder
├── lib/                        ← Shared libraries (internal workspace packages)
├── license-generator/          ← Standalone tool to produce signed license keys
├── node_modules/               ← Workspace-level node_modules (hoisted)
├── package.json                ← Root workspace scripts and devDependencies
├── pnpm-lock.yaml              ← Lockfile (297 KB — commit this)
├── pnpm-workspace.yaml         ← Workspace package globs + shared catalog
├── scripts/                    ← Workspace-level utility scripts
├── task.md                     ← Previous agent task checklist (not production code)
├── tsconfig.base.json          ← Base TypeScript config inherited by all packages
└── tsconfig.json               ← Root tsconfig (references all lib/* packages)
```

### Root `package.json` Scripts
| Script | What It Does |
|--------|-------------|
| `dev` | Runs `dev` script in every workspace package in parallel |
| `build` | Typechecks all libs, then builds every package |
| `typecheck:libs` | `tsc --build` using project references |
| `typecheck` | Typechecks libs + artifacts + scripts |
| `desktop:dev` | Runs the desktop development mode (build + Electron) |
| `desktop:build` | Builds the desktop application (no packaging) |
| `desktop:dist` | Builds and packages the desktop `.exe` installer |

---

## `artifacts/` — Deployable Applications

### `artifacts/api-server/` — Express REST API

```
artifacts/api-server/
├── src/
│   ├── index.ts            ← Entry point: reads PORT env var, calls app.listen()
│   ├── app.ts              ← Express app: middleware stack, router mount, static serving, error handler
│   ├── middleware/
│   │   └── auth.ts         ← requireAuth, requirePermission, requireAnyPermission middlewares
│   ├── middlewares/        ← (legacy directory, effectively merged into middleware/)
│   ├── routes/
│   │   ├── index.ts        ← Registers all 23 route modules on the Express router
│   │   ├── health.ts       ← GET /healthz — returns 200 OK (used by Electron health check)
│   │   ├── auth.ts         ← Login, logout, refresh, setup wizard, /me
│   │   ├── users.ts        ← CRUD for user accounts
│   │   ├── roles.ts        ← CRUD for roles
│   │   ├── permissions.ts  ← GET /permissions — returns full permission catalog
│   │   ├── audit.ts        ← GET /audit-logs — paginated audit trail
│   │   ├── catalog.ts      ← CRUD for brands, categories, colors, sizes
│   │   ├── warehouses.ts   ← CRUD for warehouses
│   │   ├── products.ts     ← CRUD for products and variants; barcode label printing
│   │   ├── inventory.ts    ← Stock queries; inventory items per warehouse
│   │   ├── inventory-ops.ts← Manual adjustments, warehouse transfers, stock counts
│   │   ├── customers.ts    ← CRUD + transaction ledger for customers
│   │   ├── suppliers.ts    ← CRUD + transaction ledger for suppliers
│   │   ├── sales.ts        ← Create/read invoices; sale returns; suspended orders
│   │   ├── purchases.ts    ← Create/read purchase invoices; purchase returns; payments
│   │   ├── finance.ts      ← Expenses, employees, advances, salaries, equity movements
│   │   ├── treasury.ts     ← Treasury accounts, sessions, transactions, transfers, adjustments
│   │   ├── dashboard.ts    ← Dashboard KPIs (delegates to AnalyticsService)
│   │   ├── reports.ts      ← Report endpoints (sales summary, P&L, inventory, etc.)
│   │   ├── settings.ts     ← Store settings (tax, receipt, numerals, etc.)
│   │   ├── notifications.ts← Alert notifications (low stock, overdue, treasury negatives)
│   │   └── associations.ts ← Rotating savings groups (جمعيات) module
│   └── lib/
│       ├── accounting.ts   ← postJournalEntry() — double-entry accounting service
│       ├── analytics-service.ts ← AnalyticsService class — shared KPI/chart queries
│       ├── audit.ts        ← writeAuditLog() helper
│       ├── codes.ts        ← barcode/invoice code generation helpers
│       ├── config.ts       ← JWT config derived from SESSION_SECRET; bcrypt rounds
│       ├── inventory.ts    ← postInventoryMovement() — inventory ledger service
│       ├── jwt.ts          ← signAccessToken/signRefreshToken/verify functions
│       ├── logger.ts       ← Pino logger instance
│       ├── money.ts        ← money(), cents(), toNum() — monetary arithmetic helpers
│       ├── password.ts     ← hashPassword(), verifyPassword() using bcryptjs
│       ├── seed.ts         ← Chart of accounts + treasury drawers seeding; ensureStoreFinancials()
│       ├── sequences.ts    ← nextDocumentNumber() — atomic document number generation
│       ├── tokens.ts       ← hashToken() for refresh token storage
│       └── treasury.ts     ← postTreasuryTransaction(), resolveBackdatedTreasuryAccount()
├── dist/                   ← Build output (esbuild bundle)
│   ├── index.mjs           ← Single-file API server bundle
│   └── pos-dist/           ← POS frontend static files (copied here by build-all.mjs)
├── build.mjs               ← esbuild configuration script
├── package.json            ← Package config; dev script runs build then start
├── tsconfig.json           ← TypeScript config (node22 target)
├── sqlite.db               ← Development database file
│
│   ─── Development / debug scripts (not shipped) ───
├── audit-timestamps.cjs    ← One-off script to check audit log timestamps
├── debug-checkout.cjs      ← One-off checkout debugging
├── patch-all.cjs           ← Data migration patch scripts
├── reset-password.mjs      ← CLI tool: reset a user's password
├── test-*.{cjs,mjs}        ← Manual integration test scripts
└── unlock-admin.cjs        ← CLI: unlock a locked admin account
```

### `artifacts/pos/` — React POS Frontend

```
artifacts/pos/
├── src/
│   ├── main.tsx            ← React entry point (mounts <App /> into #root)
│   ├── App.tsx             ← Root component: routing, auth gateway, setup redirect
│   ├── index.css           ← Global CSS (Tailwind directives + custom design tokens)
│   ├── electron.d.ts       ← TypeScript declarations for window.electronAPI and window.erp
│   ├── pages/
│   │   ├── login.tsx       ← Login form page
│   │   ├── setup.tsx       ← First-run setup wizard (store + admin account creation)
│   │   ├── dashboard.tsx   ← KPI cards + charts (sales, profit, treasury, stock)
│   │   ├── pos.tsx         ← POS terminal (product search, cart, payment, receipt print)
│   │   ├── sales-history.tsx ← Invoice list with filters and detail modal
│   │   ├── sales-returns.tsx ← Return-against-invoice workflow
│   │   ├── purchases.tsx   ← Purchase invoice creation and list
│   │   ├── purchase-returns.tsx ← Purchase return workflow
│   │   ├── products.tsx    ← Product + variant management with barcode labels
│   │   ├── master-data.tsx ← Brands, categories, colors, sizes management
│   │   ├── warehouses.tsx  ← Warehouse CRUD
│   │   ├── stock.tsx       ← Per-warehouse stock levels
│   │   ├── movements.tsx   ← Inventory movement log
│   │   ├── transfers.tsx   ← Warehouse-to-warehouse transfers
│   │   ├── stock-counts.tsx← Physical stock count / reconciliation
│   │   ├── customers.tsx   ← Customer CRM + ledger / debt tracking
│   │   ├── suppliers.tsx   ← Supplier management + payables
│   │   ├── treasury.tsx    ← Cash drawer sessions, transactions, transfers
│   │   ├── finance.tsx     ← Expenses, employees, salaries, advances, equity
│   │   ├── associations.tsx← Rotating savings group (جمعية) management
│   │   ├── reports.tsx     ← All report views (sales, P&L, inventory, treasury, etc.)
│   │   ├── users.tsx       ← User account management
│   │   ├── roles.tsx       ← Role and permission management
│   │   ├── audit.tsx       ← Audit log viewer
│   │   ├── settings.tsx    ← Store settings + printer settings + backup/restore
│   │   └── not-found.tsx   ← 404 page
│   ├── components/
│   │   ├── app-shell.tsx   ← Main navigation layout (sidebar + top bar)
│   │   ├── modal.tsx       ← Generic modal wrapper
│   │   ├── page-header.tsx ← Reusable page title + breadcrumb component
│   │   ├── notification-bell.tsx ← Bell icon with unread count + dropdown
│   │   ├── print-portal.tsx← React portal for print-destination rendering
│   │   ├── thermal-receipt.tsx ← 80mm thermal receipt HTML template
│   │   ├── a4-invoice.tsx  ← A4 invoice print template
│   │   ├── barcode-label-print-modal.tsx ← Barcode label sheet printing
│   │   ├── quick-product-modal.tsx ← Inline product creation from POS screen
│   │   └── ui/             ← shadcn/ui Radix-based component library
│   ├── hooks/
│   │   ├── use-toast.ts    ← Sonner-compatible toast hook
│   │   └── use-mobile.tsx  ← Breakpoint detection hook
│   └── lib/
│       ├── auth.tsx        ← AuthProvider + useAuth hook (access token, refresh timer)
│       ├── query-client.ts ← TanStack QueryClient + global mutation → lookup invalidation
│       ├── barcode-input.ts← Hardware barcode scanner event capture utility
│       ├── excel-export.ts ← XLSX export helper for reports
│       ├── format.ts       ← Number/currency formatting helpers
│       ├── print-document-styles.ts ← Shared CSS for printed documents
│       ├── printer-settings.ts ← Printer config read/write (Electron IPC + localStorage)
│       └── utils.ts        ← cn() utility (clsx + tailwind-merge)
├── public/                 ← Static assets (favicon, etc.)
├── dist/public/            ← Vite build output (served by Express in desktop mode)
├── index.html              ← HTML entry point (Vite template)
├── vite.config.ts          ← Vite config (API proxy, build output directory)
├── components.json         ← shadcn/ui component registry config
├── tsconfig.json           ← TS config (path alias @/ → src/)
└── package.json            ← Dependencies
```

### `artifacts/desktop/` — Electron Application

```
artifacts/desktop/
├── main.js                 ← Electron entry: path setup, single-instance lock, ApplicationManager
├── preload.js              ← contextBridge: exposes window.electronAPI and window.erp
├── managers/
│   ├── application-manager.js ← Top-level orchestrator: API server, IPC, updater, backup
│   ├── window-manager.js      ← Multi-window lifecycle + state persistence
│   ├── session-manager.js     ← Per-window isolated session partitions
│   ├── menu-manager.js        ← Application menu builder
│   └── shortcut-manager.js    ← Global keyboard shortcuts (Ctrl+N, Ctrl+Shift+T, etc.)
├── licensing/
│   ├── LicenseGuard.js        ← Main guard: reads license, calls hardware ID, verifies
│   ├── LicenseStore.js        ← Encrypted license file read/write (AES-256-GCM)
│   ├── constants.js           ← ECDSA public key, salt, editions, file paths
│   ├── errors.js              ← License-specific error classes
│   ├── hardware/              ← Hardware fingerprint collection (CPU, MB, UUID via PowerShell)
│   ├── crypto/                ← ECDSA signature verification; AES key derivation
│   ├── validation/            ← License payload schema validation; expiry check
│   └── activation/            ← License activation dialog (Electron BrowserWindow)
├── assets/
│   ├── icon.png               ← Application icon
│   └── seed.db                ← Pre-initialized empty SQLite database for first install
├── dist/desktop/              ← electron-builder output (.exe installer + portable)
├── build-all.mjs              ← Build orchestration: API → POS → copy → package
├── electron-builder.yml       ← electron-builder packaging configuration
├── package.json               ← Electron dependencies
└── tsconfig.json              ← TS config (for any TS files in this package)
```

---

## `lib/` — Shared Libraries

### `lib/db/`

```
lib/db/
├── src/
│   ├── auto-schema.ts      ← FULL_SCHEMA_SQL (all CREATE TABLE statements) + ensureDbSchema()
│   ├── index.ts            ← Creates libSQL client, Drizzle instance, re-exports all tables
│   ├── migrations.ts       ← Drizzle migration runner (used during development)
│   └── schema/             ← Drizzle ORM table definitions (one file per domain)
├── drizzle/                ← Drizzle migration files
├── drizzle.config.ts       ← Drizzle Kit configuration
├── migrate-store-db.cjs    ← Manual migration script
├── package.json            ← Package config (no external deps other than drizzle + libsql)
└── tsconfig.json
```

### `lib/shared/`

```
lib/shared/
├── src/
│   ├── index.ts            ← Re-exports permissions.ts and roles.ts
│   ├── permissions.ts      ← PERMISSION_GROUPS, ALL_PERMISSIONS, hasPermission(), etc.
│   └── roles.ts            ← DEFAULT_ROLES array, ADMIN_ROLE_KEY constant
├── package.json
└── tsconfig.json
```

### `lib/api-spec/`

```
lib/api-spec/
├── openapi.yaml            ← OpenAPI 3.x specification (source of truth for API contract)
├── orval.config.ts         ← Code generation config (react-query + zod outputs)
└── package.json
```

### `lib/api-client-react/`

```
lib/api-client-react/
├── src/
│   ├── generated/          ← Auto-generated React Query hooks (DO NOT EDIT manually)
│   │   ├── api.ts          ← All hooks: useGetProducts, useCreateSale, etc.
│   │   └── ...             ← Split by module
│   ├── custom-fetch.ts     ← Fetch wrapper: injects Bearer token, handles 401
│   └── index.ts            ← Public API re-exports
└── package.json
```

### `lib/api-zod/`

```
lib/api-zod/
├── src/
│   └── generated/          ← Auto-generated Zod schemas
│       ├── api.ts          ← Request body schemas (CreateSaleBody, LoginBody, etc.)
│       └── ...
└── package.json
```

---

## `license-generator/`

A standalone Node.js application (not part of the workspace) used to:
1. Generate ECDSA P-256 key pairs (private key stays offline)
2. Issue signed license files (`license.dat`) for customer machines
3. The private key used for signing is **never present in this repository**

---

## `scripts/`

Workspace-level utility scripts (typecheck helpers, etc.). Not shipped in any build.

---

## Key Files Reference

| File | Importance |
|------|-----------|
| `pnpm-workspace.yaml` | Defines all packages and shared dependency versions |
| `lib/db/src/auto-schema.ts` | The canonical database schema |
| `lib/shared/src/permissions.ts` | Every permission key in the system |
| `artifacts/api-server/src/lib/seed.ts` | Chart of accounts + treasury drawer definitions |
| `artifacts/api-server/src/lib/config.ts` | JWT secrets derived from SESSION_SECRET |
| `artifacts/desktop/licensing/constants.js` | ECDSA public key + license constants |
| `artifacts/desktop/managers/application-manager.js` | All IPC handlers + API server lifecycle |
