---
name: POS Phase 1 decisions
description: Architecture decisions for the multi-tenant shoe-retail POS (Phase 1)
---

# Multi-Tenant SaaS POS (shoe retail) — Phase 1

Arabic-first RTL app. SRS at `attached_assets/SRS_POS_ShoesStore_*.md`.

## Auth
- **Custom JWT auth, NOT Clerk.** Access token (15m) held in memory (module var via
  `setAuthTokenGetter`); refresh token (7d) in an HttpOnly cookie, rotated on refresh.
  JWT signing keys derived from `SESSION_SECRET` (no separate secret).
- Login lockout: 5 failed attempts → 15m lock.

## Multi-tenancy / login
- Schema is multi-tenant (`storeId` on tenant tables; composite unique
  `(storeId, username)`), but **setup is run-once and creates exactly one store**.
  So Phase 1 is effectively single-store; login-by-username is unambiguous.
- **Why login queries by username only:** with one store, usernames are effectively
  global. Adding a store-code field to login was rejected — not in approved mockups/scope.
  **If Phase 2 ever allows multiple stores, login must bind to storeId (e.g. store code).**

## RBAC
- Permission catalog keys: `users.view/create/edit/delete`, `roles.view/manage`,
  `audit.view`. There is **no `users.manage`** — gate UI per-action to match the
  server's `requirePermission(...)` keys. Wildcard `*` (admin) grants everything.
- Reset-password is gated by `users.edit` (server and UI).
- Self-protection: a user cannot delete/deactivate their own account.
- System roles cannot be edited/deleted.

## Frontend
- react-vite artifact at `/` (slug `pos`), wouter SPA, Cairo font, slate/amber palette.
- Same-origin relative URLs (no setBaseUrl); refresh cookie auto-sent.
- Built from approved canvas mockups at
  `artifacts/mockup-sandbox/src/components/mockups/pos-system/`.

## Scope discipline
- Phase 1 only: DB foundation, setup wizard, auth, RTL shell, users/roles RBAC,
  audit logs. Do NOT start Phase 2 (inventory, sales, etc.) without approval.
