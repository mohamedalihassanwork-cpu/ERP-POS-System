# ERP System — Documentation Index

> **This documentation reflects the actual source code as of 2026-07-24. It is the authoritative reference for every AI agent or developer working on this project.**

---

## What Is This Project?

A full-featured Arabic-language Point-of-Sale and Enterprise Resource Planning system for retail businesses (originally shoe stores, but applicable to any retail operation). The system ships in two modes:

- **Web mode** — Express API server + React SPA deployed on a hosting platform
- **Desktop mode** — Same codebase packaged as an Electron application for offline-capable Windows deployment

---

## Documentation Files

| File | What It Covers |
|------|----------------|
| [Project-Overview.md](./Project-Overview.md) | High-level architecture, monorepo structure, how the pieces fit together |
| [Technology-Stack.md](./Technology-Stack.md) | Every dependency, library, toolchain, and why each was chosen |
| [Folder-Structure.md](./Folder-Structure.md) | Every directory and file, what it contains, why it exists |
| [Database.md](./Database.md) | Complete schema — every table, column, index, and relationship |
| [Authentication.md](./Authentication.md) | Auth flow, JWT strategy, session management, security hardening |
| [APIs.md](./APIs.md) | All API routes — endpoint, method, permission required, behavior |
| [Modules.md](./Modules.md) | Every business module — purpose, UI pages, API routes, business rules |
| [Business-Logic.md](./Business-Logic.md) | Core service logic — inventory postings, treasury transactions, double-entry accounting |
| [Desktop-Architecture.md](./Desktop-Architecture.md) | Electron main process, managers, IPC bridge, licensing system |
| [Code-Flow.md](./Code-Flow.md) | End-to-end walkthroughs — sale creation, purchase, session lifecycle |
| [Permissions.md](./Permissions.md) | Complete permission catalog, role definitions, enforcement |
| [Build-and-Deploy.md](./Build-and-Deploy.md) | How to build, package, and deploy both web and desktop |

---

## Quick Reference — Key Locations

| Concern | Location |
|---------|----------|
| API server entry | `artifacts/api-server/src/index.ts` |
| Express app setup | `artifacts/api-server/src/app.ts` |
| All route handlers | `artifacts/api-server/src/routes/` |
| Auth middleware | `artifacts/api-server/src/middleware/auth.ts` |
| Core services | `artifacts/api-server/src/lib/` |
| Database schema | `lib/db/src/auto-schema.ts` |
| Drizzle ORM tables | `lib/db/src/schema/` |
| POS React app | `artifacts/pos/src/` |
| POS pages | `artifacts/pos/src/pages/` |
| Auth context | `artifacts/pos/src/lib/auth.tsx` |
| Electron main | `artifacts/desktop/main.js` |
| Electron managers | `artifacts/desktop/managers/` |
| Licensing system | `artifacts/desktop/licensing/` |
| Shared permissions | `lib/shared/src/permissions.ts` |
| Default roles | `lib/shared/src/roles.ts` |
| OpenAPI spec | `lib/api-spec/openapi.yaml` |
| Generated API client | `lib/api-client-react/src/generated/` |
| Generated Zod schemas | `lib/api-zod/src/generated/` |
