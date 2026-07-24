# Performance Review

> Analysis of performance, database queries, architecture bottlenecks, and recommendations.
> Last verified against source code: 2026-07-24. This analysis reflects the actual implementation.

---

## Database Query Analysis

### ✅ Good: Composite Indexes on All Hot Paths

The schema has well-designed composite indexes covering the most common query patterns:

| Index | Query Pattern |
|---|---|
| `invoices_store_created_idx` | `WHERE store_id=X ORDER BY created_at DESC` — invoice list |
| `inventory_items_variant_warehouse_unique` | `WHERE variant_id=X AND warehouse_id=Y` — stock lookup |
| `movements_variant_warehouse_store_idx` | Movement log queries |
| `treasury_tx_store_created_idx` | Treasury statement queries |
| `notifications_user_read_idx` | Unread notification count |

### ✅ Good: Cached Inventory Balance

`inventory_items.quantity` is a cached balance maintained atomically with each movement. This avoids the costly pattern of summing `SUM(quantity_change)` from `inventory_movements` on every stock display. Single-row read per variant per warehouse.

### ⚠️ N+1 Query Risk: Inventory Stock Report

**Location:** `routes/reports.ts` — `GET /reports/inventory-stock`

**Issue:** The report joins `inventory_items → product_variants → products → warehouses → categories → brands → colors → sizes` in a single large JOIN. For a store with many SKUs across multiple warehouses, this could return thousands of rows in a single query.

**Recommendation:** Add pagination to the stock report, or implement cursor-based pagination for large catalogs.

---

### ⚠️ N+1 Query Risk: Sale Creation Item Loop

**Location:** `routes/sales.ts L420-442`

```typescript
for (const c of computed) {
  await tx.insert(invoiceItemsTable).values(...)
  await postInventoryMovement(tx, ...)  // ← 2 queries per item
}
```

Each item in the cart triggers 2 DB writes (invoice_item INSERT + inventory_items UPDATE + inventory_movements INSERT = actually 3). For a cart with 20 items, that's 60 writes inside one transaction.

**Impact:** SQLite handles this fine due to WAL mode, but for large carts it adds latency.

**Recommendation:** 
1. Batch the `invoice_items` INSERT using `.values([...allItems])` 
2. Batch `inventory_items` UPDATEs with a `CASE WHEN` expression
3. Batch `inventory_movements` INSERTs

This would reduce cart checkout from O(n) queries to O(1) regardless of cart size.

---

### ⚠️ Authentication Middleware DB Hit on Every Request

**Location:** `middleware/auth.ts L38-73`

```typescript
// Every protected request loads user + role + store
const [row] = await db
  .select(...)
  .from(usersTable)
  .innerJoin(rolesTable, ...)
  .innerJoin(storesTable, ...)
  .where(eq(usersTable.id, userId))
  .limit(1);
```

**Issue:** Every single API request (except health/auth) performs a 3-table JOIN to validate the user's current state (active, not deleted, correct store).

**Impact:** Minor for SQLite single-store (milliseconds), but adds up under load.

**Recommendation:** Cache auth context per access token using an in-memory LRU cache (keyed by token hash). Access tokens are 15 minutes → stale at worst 15 minutes. This eliminates the most frequent DB read in the entire system.

```typescript
// Example: use lru-cache
const authCache = new LRUCache<string, AuthContext>({ max: 500, ttl: 14 * 60 * 1000 });
```

---

### ✅ Good: Profit & Loss Uses Aggregation Service

**Location:** `routes/reports.ts L235-258` → `lib/analytics-service.ts`

The P&L report uses `AnalyticsService` which pre-computes KPIs with aggregate SQL queries rather than loading all invoices into memory. This scales well.

---

## Memory Usage

### ⚠️ Large POS Page Bundle

**File:** `artifacts/pos/src/pages/pos.tsx` — **40 KB** TypeScript source  
**File:** `artifacts/pos/src/pages/products.tsx` — **54 KB** TypeScript source  
**File:** `artifacts/pos/src/pages/finance.tsx` — **47 KB** TypeScript source

**Issue:** These are very large React page components. When Vite bundles them, they produce large JavaScript chunks. Users loading the page for the first time will download all of this at once.

**Recommendation:** Implement React lazy loading with code splitting:
```typescript
const ProductsPage = React.lazy(() => import("@/pages/products"));
const FinancePage = React.lazy(() => import("@/pages/finance"));
```
Wrap with `<Suspense>` in the router. Each page becomes a separate chunk loaded only when navigated to.

---

## Architecture Observations

### ✅ Excellent: Transaction Discipline

Every multi-step financial operation uses `db.transaction()`. This is the most important architectural decision for data integrity. No partial commits possible.

### ✅ Good: Immutable Ledgers

`inventory_movements`, `treasury_transactions`, `customer_transactions`, `supplier_transactions`, and `audit_logs` are append-only. This enables point-in-time reconstruction and audit trails.

### ⚠️ Concern: SQLite Concurrency

**Issue:** SQLite with WAL mode handles concurrent reads well, but writes are serialized. If the system grows to multiple simultaneous cashiers (e.g., 5 POS terminals), write contention during checkout could become a bottleneck.

**Threshold:** SQLite handles ~1000 writes/second on modern hardware. For a single-store shoe shop with a few cashiers, this is never a practical issue.

**If scaling is needed:** Migrate to PostgreSQL + libpg (Drizzle supports this with minimal code changes — only the connection string and platform-specific driver change).

### ⚠️ Concern: No Background Job Queue

**Issue:** Operations like notification generation (`POST /notifications/refresh`) run synchronously in the request-response cycle. If the notification check involves many queries, it adds latency to the bell-ring endpoint.

**Recommendation:** If notification generation becomes expensive, move it to a background worker (e.g., a setTimeout loop or a lightweight queue like `bull`/`bullmq`).

### ✅ Good: Separation of Financial Helpers

`lib/treasury.ts`, `lib/accounting.ts`, `lib/inventory.ts`, and `lib/sequences.ts` are separate helper modules. Each route file imports what it needs. This makes the financial logic testable and reusable.

---

## Security Review

| Risk | Status | Notes |
|---|---|---|
| SQL Injection | ✅ Not possible | Drizzle ORM uses parameterized queries |
| XSS | ✅ Mitigated | React escapes output; access token not in DOM |
| CSRF | ✅ Mitigated | `SameSite: strict` on refresh cookie |
| Brute force | ✅ Protected | 5-attempt lockout for 15 min |
| Tenant bleed | ✅ Protected | storeId from JWT, never client input |
| Privilege escalation | ✅ Protected | requirePermission() on every route |
| Insecure direct object reference | ⚠️ Partial | Most routes filter by storeId; verify all update/delete routes also validate ownership |
| Password strength | ⚠️ Not enforced | No minimum password length/complexity rules at API level |
| Rate limiting | ⚠️ Missing | No general rate limiting on public endpoints |
| HTTPS | ⚠️ Config-dependent | `config.cookies.secure` should be `true` in production |
| Dependency vulnerabilities | ⚠️ Not audited | Run `pnpm audit` before production deployment |

---

## Scalability Recommendations

| Priority | Action |
|---|---|
| High | Add React.lazy() code splitting for large pages |
| High | Add rate limiting (express-rate-limit) on auth endpoints |
| Medium | Cache auth context per access token in memory |
| Medium | Batch inventory writes in sale/purchase creation |
| Medium | Add `pnpm audit` to CI pipeline |
| Low | Add pagination to inventory-stock report |
| Low | Centralize `clientIp()` helper |
| Future | If multi-cashier load becomes issue: PostgreSQL migration |
