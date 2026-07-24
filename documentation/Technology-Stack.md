# Technology Stack

## Runtime & Language

| Technology | Version | Role |
|-----------|---------|------|
| Node.js | Electron-bundled (~v22) | API server runtime (desktop); system Node for web |
| TypeScript | ~5.9.3 | All source code (API, frontend, libs) |
| JavaScript (CommonJS) | — | Electron main process files (`main.js`, `managers/*.js`, `preload.js`) |

---

## Package Management

| Tool | Configuration |
|------|--------------|
| **pnpm** | Workspace manager; `pnpm-workspace.yaml` defines packages |
| **pnpm catalog** | Shared version pinning for React, Vite, Drizzle, Zod, etc. across all packages |
| **minimumReleaseAge: 1440** | Supply-chain protection: any package must be at least 1 day old before installation |

---

## Backend — API Server (`artifacts/api-server`)

| Package | Version | Purpose |
|---------|---------|---------|
| **express** | ^5.2.1 | HTTP framework |
| **cors** | ^2.8.6 | CORS headers |
| **cookie-parser** | ^1.4.7 | Parse `pos_refresh` HttpOnly cookie |
| **pino** + **pino-http** | ^9 / ^10 | Structured JSON logging |
| **jsonwebtoken** | ^9.0.3 | JWT signing and verification (access + refresh tokens) |
| **bcryptjs** | ^3.0.3 | Password hashing (12 rounds) |
| **drizzle-orm** | ^0.45.2 | Type-safe ORM queries |
| **@libsql/client** | ^0.5.29 | libSQL (SQLite-compatible) database driver |
| **zod** | ^3.25.76 | Request body validation (generated schemas from Orval) |
| **esbuild** | 0.27.3 | Bundle API server into single `dist/index.mjs` for production/desktop |

### Build Configuration (`build.mjs`)
The API server is bundled with esbuild into a single ESM file (`dist/index.mjs`). The build:
- Targets `node22`
- Inlines all dependencies except `@libsql` native modules (which must remain as separate files)
- Uses `esbuild-plugin-pino` to handle pino's dynamic worker thread loading
- Injects `globalThis.__dirname` for ESM compatibility (Express static file serving needs `__dirname`)

---

## Frontend — POS React App (`artifacts/pos`)

| Package | Version | Purpose |
|---------|---------|---------|
| **React** | 19.1.0 | UI framework (exact version — required by Expo compatibility constraint in workspace) |
| **Vite** | ^7.3.2 | Dev server and build tool |
| **@vitejs/plugin-react** | ^5.0.4 | React Fast Refresh + JSX transform |
| **TailwindCSS** | ^4.1.14 | Utility-first CSS (v4) |
| **@tailwindcss/vite** | ^4.1.14 | Vite integration for Tailwind v4 |
| **Wouter** | ^3.3.5 | Lightweight client-side router (alternative to React Router) |
| **@tanstack/react-query** | ^5.90.21 | Server state management; all API calls go through generated hooks |
| **framer-motion** | ^12.23.24 | UI animations |
| **Radix UI** | various | Headless UI primitives (Dialog, Select, Tabs, Tooltip, etc.) |
| **lucide-react** | ^0.545.0 | Icon library |
| **react-hook-form** | ^7.55.0 | Form state management |
| **recharts** | ^2.15.2 | Charts on Dashboard and Reports pages |
| **sonner** | ^2.0.7 | Toast notifications |
| **date-fns** | ^3.6.0 | Date formatting and manipulation |
| **jsbarcode** | ^3.12.3 | Barcode generation (invoice barcodes, product labels) |
| **qrcode** | ^1.5.4 | QR code generation |
| **xlsx** | ^0.18.5 | Excel export for reports |
| **@workspace/api-client-react** | workspace | Generated React Query hooks from OpenAPI spec |
| **@workspace/shared** | workspace | Permission helpers and constants |
| **class-variance-authority** | ^0.7.1 | Variant-based component styling |
| **clsx** + **tailwind-merge** | — | Conditional class merging |

### Vite Configuration
- Dev server: port 5000
- Build output: `dist/public/` (intentionally `public` subdirectory for Express static serving)
- In desktop builds (`DESKTOP_BUILD=true`), the base URL is `/` and API calls proxy to `localhost:5001`

---

## Database (`lib/db`)

| Package | Purpose |
|---------|---------|
| **@libsql/client** | SQLite driver with libSQL protocol support; used both on-server and in Electron |
| **drizzle-orm** | ORM for schema definition and query building |
| **drizzle-kit** | Schema migration tooling (used during development) |

### Database File
- **Web/Replit**: `artifacts/api-server/sqlite.db` (path configured via `DATABASE_URL` env var)
- **Desktop**: `%APPDATA%\ShoeStorePOS\store.db`

### Schema Strategy
The schema is defined two ways:
1. **`lib/db/src/auto-schema.ts`** — A raw SQL string (`FULL_SCHEMA_SQL`) with every `CREATE TABLE IF NOT EXISTS` statement. Used by the `ensureDbSchema()` function to provision a fresh database.
2. **`lib/db/src/schema/`** — Drizzle ORM table definitions used at runtime for type-safe queries.

---

## Shared Libraries

### `lib/shared`
Pure TypeScript with no framework dependencies. Exports:
- `PERMISSION_GROUPS`, `ALL_PERMISSIONS`, `hasPermission()`, `hasAllPermissions()`, `hasAnyPermission()` — the entire permission catalog
- `DEFAULT_ROLES`, `ADMIN_ROLE_KEY` — system role definitions
- `WILDCARD_PERMISSION` (`"*"`) — the superuser permission

### `lib/api-spec`
- `openapi.yaml` — the OpenAPI 3.x specification (146 KB; ~1000+ lines)
- `orval.config.ts` — Orval code-generation configuration

### `lib/api-client-react`
Generated by Orval from the OpenAPI spec. Provides:
- Custom fetch wrapper with automatic `Authorization: Bearer` header injection
- React Query hooks for every endpoint (e.g., `useGetProducts`, `useCreateSale`)
- TypeScript types for all request/response shapes

### `lib/api-zod`
Generated by Orval from the OpenAPI spec. Provides:
- Zod schemas for every request body, query parameter object, and response shape
- Used directly in Express route handlers for runtime validation

---

## Desktop — Electron App (`artifacts/desktop`)

| Package | Version | Purpose |
|---------|---------|---------|
| **electron** | latest (excluded from minimumReleaseAge) | Desktop shell |
| **electron-builder** | latest | Packaging to `.exe` installer |
| **electron-updater** | latest | Auto-update mechanism |
| **@libsql/client** | ^0.5.29 | Used in `_runMigrations()` for direct DB schema upgrades at startup |
| **concurrently** | — | Used in dev mode scripts |
| **wait-on** | — | Used in dev mode to wait for API server health |

### Packaging Outputs
- **NSIS installer** (`.exe`) — full installer with Arabic (Egypt) language (locale 3073)
- **Portable** (`.exe`) — no-install portable executable
- Both target Windows x64

---

## Code Generation Pipeline

```
lib/api-spec/openapi.yaml
         │
         ├── orval (react-query mode)
         │         ↓
         │   lib/api-client-react/src/generated/
         │   (React Query hooks + TypeScript types)
         │
         └── orval (zod mode)
                   ↓
             lib/api-zod/src/generated/
             (Zod schemas for validation)
```

When the OpenAPI spec changes, run Orval regeneration to keep the frontend and backend validators in sync. The generated files are committed to the repository.

---

## Security Libraries

| Library | Use |
|---------|-----|
| **bcryptjs** | Passwords hashed at 12 rounds |
| **jsonwebtoken** | HMAC-SHA256 JWT (keys derived from SESSION_SECRET via HKDF-like HMAC) |
| Node.js `crypto` | Key derivation, random token generation, ECDSA verification (licensing) |
| **AES-256-GCM** | License file encryption (device-bound key) |
| **ECDSA P-256** | License signature verification |

---

## TypeScript Configuration

```
tsconfig.base.json          ← Root: strict mode, ES2022, bundler resolution
├── artifacts/api-server/tsconfig.json  ← extends base; node22 target
├── artifacts/pos/tsconfig.json         ← extends base; DOM lib; path aliases (@/)
└── lib/*/tsconfig.json                 ← extends base; composite: true (project references)
```

Path alias `@/` in the POS app maps to `artifacts/pos/src/`.
