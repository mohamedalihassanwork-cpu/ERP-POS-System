# Changelog

> This file documents significant additions and changes to the ERP system.
> Source of truth is always the source code. See [Project-Overview.md](./Project-Overview.md) for the current architecture.

---

## Current State (as of 2026-07-24)

The ERP system is **fully implemented and operational** in both web and desktop modes. The following is a summary of major features that were implemented in significant milestones:

### Core Platform
- Express REST API (23 route modules) with JWT authentication and role-based access control
- React SPA (POS frontend) with 23 pages, Wouter routing, TanStack Query
- SQLite database via libSQL/Drizzle ORM (40+ tables)
- Electron desktop shell with multi-window support and session isolation

### Financial System
- Double-entry bookkeeping with chart of accounts (18 default accounts)
- Treasury management: 5 drawer types (CASH, CARD, INSTAPAY, WALLET, MAIN_SAFE)
- Treasury sessions (shift open/close with variance tracking)
- Treasury transfers and manual adjustments

### Business Modules Added Over Time
- **Inventory Operations**: manual adjustments, warehouse-to-warehouse transfers, physical stock counts
- **Finance Module**: expenses, employees, salary advances, monthly payroll, owner equity
- **Treasury Transfers**: inter-account money movement with journal entries
- **Treasury Adjustments**: manual balance corrections
- **Salary Enhancements**: full/half/custom pay periods, advance deductions, other deductions
- **Associations Module** (جمعيات): rotating savings group management with WITHDRAWAL/RETURN tracking and transaction reversal
- **Notifications System**: alert-based notifications for low stock, negative treasury, customer over credit limit, supplier debts
- **Licensing System**: machine-bound ECDSA P-256 signed licenses with AES-256-GCM encrypted storage
- **Multi-Window Desktop**: VS Code-style independent windows with isolated session partitions
- **Backup & Restore**: manual and automatic backup with GUI in settings
- **Auto-Updater**: electron-updater integration for OTA updates
- **Schema Migration System**: idempotent DDL migrations run at every desktop startup

### API Code Generation
- OpenAPI spec → Orval → React Query hooks (`lib/api-client-react`) + Zod schemas (`lib/api-zod`)
- This keeps frontend and backend validation in sync automatically

---

## Desktop Migration

The desktop application was **fully implemented** using Electron. The original planning document (`Desktop-Migration-Plan.md`) is now obsolete — Electron was chosen and the implementation is complete. See [Desktop-Architecture.md](./Desktop-Architecture.md) for the current implementation details.
