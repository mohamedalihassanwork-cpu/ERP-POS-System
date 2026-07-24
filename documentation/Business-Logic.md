# Business Logic Services

> Source files: `artifacts/api-server/src/lib/`

---

## Overview

The business logic layer sits between Express route handlers and the Drizzle ORM. Rather than performing complex operations directly in route callbacks, the API delegates to service functions in `src/lib/`. This keeps route files focused on HTTP concerns (validation, serialization, error handling) while services handle atomicity, consistency, and domain rules.

The core services are:
- **`accounting.ts`** — double-entry journal entry posting
- **`treasury.ts`** — treasury account balance tracking
- **`inventory.ts`** — inventory stock movement tracking
- **`sequences.ts`** — atomic document number generation
- **`seed.ts`** — chart of accounts and treasury account initialization
- **`money.ts`** — safe monetary arithmetic
- **`audit.ts`** — audit log writing

---

## Accounting Service (`lib/accounting.ts`)

### `postJournalEntry(params)`

Posts a balanced double-entry journal entry. Every financial transaction in the system ultimately calls this function.

```typescript
interface JournalEntryParams {
  storeId: string;
  description: string;
  referenceType: string;
  referenceId: string;
  lines: Array<{
    accountCode: string;  // e.g. "4000" for Sales Revenue
    debit: number;        // integer cents
    credit: number;       // integer cents
  }>;
  createdBy?: string;
}
```

**Behavior:**
1. Resolves each `accountCode` to its `accounting_accounts` row (throws if not found)
2. **Validates the entry balances**: `sum(debits) === sum(credits)` — throws if not balanced
3. Creates an `accounting_transactions` header row
4. Creates one `accounting_transaction_lines` row per line
5. All within a `db.transaction()` to ensure atomicity

**Example — Sale for 500 EGP with 300 EGP cost:**
```
DR  Cash (1000)            500
    CR  Sales Revenue (4000)        500

DR  COGS (5000)            300
    CR  Inventory (1200)           300
```

**Common journal patterns used by the system:**

| Transaction | Debit Accounts | Credit Accounts |
|-------------|---------------|----------------|
| Cash sale | Cash Drawer (1000) | Sales Revenue (4000) |
| Cash sale COGS | COGS (5000) | Inventory (1200) |
| Credit sale | Accounts Receivable (1100) | Sales Revenue (4000) |
| Customer payment | Cash/Card/etc. | Accounts Receivable (1100) |
| Purchase (cash) | Inventory (1200) | Cash Drawer (1000) |
| Purchase (credit) | Inventory (1200) | Accounts Payable (2000) |
| Supplier payment | Accounts Payable (2000) | Cash Drawer (1000) |
| Expense | Operating Expenses (5100) | Cash Drawer (1000) |
| Salary | Salary Expense (5200) | Cash Drawer (1000) |
| Advance to employee | Employee Advances (1300) | Cash Drawer (1000) |
| Owner deposit | Cash Drawer (1000) | Owner Equity (3000) |
| Owner withdrawal | Owner Drawings (3100) | Cash Drawer (1000) |
| Stock adjustment IN | Inventory (1200) | Treasury Variance (6000) |
| Stock adjustment OUT | Treasury Variance (6000) | Inventory (1200) |

The account code used for a treasury account's ledger side is looked up via `TREASURY_TYPE_TO_ACCOUNT_CODE` from `seed.ts`:

```typescript
{
  CASH:      "1000",
  MAIN_SAFE: "1001",
  CARD:      "1010",
  INSTAPAY:  "1020",
  WALLET:    "1030",
}
```

---

## Treasury Service (`lib/treasury.ts`)

### `postTreasuryTransaction(params, db?)`

The atomic function for updating a treasury account balance and creating the immutable transaction record.

```typescript
interface TreasuryTransactionParams {
  storeId: string;
  treasuryAccountId: string;
  sessionId?: string;
  direction: "IN" | "OUT";
  amount: number;              // integer cents
  referenceType: string;
  referenceId: string;
  description?: string;
  createdBy?: string;
}
```

**Behavior:**
1. Locks the treasury account row using `FOR UPDATE` semantic via `db.transaction()` to prevent race conditions
2. Reads the current `balance`
3. Computes `newBalance = currentBalance ± amount` (based on direction)
4. Updates the account's `balance` in place
5. Creates an immutable `treasury_transactions` row with `balance_after = newBalance`

The function accepts an optional `db` parameter for nested transactions — callers can pass a transaction-scoped `db` instance so the treasury update is included in the parent transaction.

### `resolveBackdatedTreasuryAccount(storeId, accountId, db)`

Handles the case where a treasury transaction references an account that was linked to a closed session. If the specified account has an open session, returns it unchanged. If the session is closed or there is no session, returns the `MAIN_SAFE` account ID instead. This ensures backdated or after-hours transactions go to the main safe rather than the daily cash drawer.

---

## Inventory Service (`lib/inventory.ts`)

### `postInventoryMovement(params, db?)`

Updates the cached stock level and records an immutable movement log entry.

```typescript
interface InventoryMovementParams {
  storeId: string;
  variantId: string;
  warehouseId: string;
  type: MovementType;       // e.g. "SALE", "PURCHASE", "ADJUSTMENT_IN"
  quantityChange: number;   // signed integer (negative for OUT movements)
  referenceType: string;
  referenceId: string;
  notes?: string;
  createdBy?: string;
}
```

**Behavior:**
1. Performs an atomic upsert on `inventory_items`:
   ```sql
   INSERT INTO inventory_items (variant_id, warehouse_id, quantity, ...)
   VALUES (...)
   ON CONFLICT (variant_id, warehouse_id) DO UPDATE
   SET quantity = quantity + excluded.quantity
   RETURNING quantity
   ```
   This is safe under concurrent requests — SQLite's serialized write model ensures atomicity.
2. Reads the resulting `quantity` as `balance_after`
3. Creates an `inventory_movements` row with the snapshot

The function accepts an optional `db` parameter for nested transactions.

---

## Document Sequences (`lib/sequences.ts`)

### `nextDocumentNumber(kind, storeId, prefix?, padding?)`

Generates a monotonically increasing, gapless, human-readable document number.

```typescript
// Returns e.g. "INV-00001", "PUR-00003", "SRET-00001"
const number = await nextDocumentNumber("SALE", storeId, "INV-", 5);
```

**Behavior:**
1. Uses `UPDATE number_sequences SET next_value = next_value + 1 WHERE kind = ? AND store_id = ? RETURNING next_value` — this is a single atomic statement that increments and returns the new value
2. Formats as `prefix + value.toString().padStart(padding, '0')`
3. **On first use**, if no sequence row exists, inserts the default with `next_value = 1` (the row is seeded by `ensureStoreFinancials()`)

Sequence kinds and their document number formats:

| Kind | Prefix | Example |
|------|--------|---------|
| `SALE` | `INV-` | `INV-00001` |
| `PURCHASE` | `PUR-` | `PUR-00001` |
| `SALES_RETURN` | `SRET-` | `SRET-00001` |
| `PURCHASE_RETURN` | `PRET-` | `PRET-00001` |
| `TRANSFER` | `TRF-` | `TRF-00001` |
| `STOCK_COUNT` | `SC-` | `SC-00001` |

Invoice barcodes are a separate number sequence using `INVOICE_BARCODE` kind with no prefix.

---

## Store Financials Seeding (`lib/seed.ts`)

### `ensureStoreFinancials(db, storeId)`

Idempotent initialization of all required financial infrastructure. Called:
- At setup wizard completion
- At the start of every `GET /api/treasury/accounts` request (lazy init)

**What it seeds (all using `INSERT ... ON CONFLICT DO NOTHING`):**

1. **Chart of accounts** — all 18 default accounts (see Database.md)
2. **Treasury drawers** — 5 drawers: CASH, MAIN_SAFE, CARD, INSTAPAY, WALLET
3. **Number sequences** — one row per document kind

This makes the system resilient: if a new document kind is added in the future, the first request to use it automatically provisions its sequence row.

### `TREASURY_TYPE_TO_ACCOUNT_CODE`

A constant map used by route handlers and accounting service to look up the GL account for a treasury payment method:
```typescript
{
  CASH:      "1000",
  MAIN_SAFE: "1001",
  CARD:      "1010",
  INSTAPAY:  "1020",
  WALLET:    "1030",
}
```

---

## Money Utilities (`lib/money.ts`)

All monetary math in route handlers goes through these helpers to avoid floating-point errors.

### `cents(value: string | number): number`
Converts a monetary string or number to integer cents (multiplies by 100, rounds). This is the "entry" function — always call this when reading a monetary value for arithmetic.

### `money(cents: number): string`
Converts integer cents back to a decimal string with 2 places. This is the "exit" function — always call this when writing a monetary value back to the database or response.

```typescript
const price = cents("120.50");  // → 12050
const stored = money(price * 2); // → "241.00"
```

### `toNum(value: string): number`
Parses a database monetary string to a JavaScript floating-point number. Used for SQL aggregations where raw `parseFloat` is acceptable (read-only analytics, not write paths).

---

## Audit Logging (`lib/audit.ts`)

### `writeAuditLog(params)`

Inserts a row into `audit_logs`. Called at the end of every significant write operation (create, update, delete, login, etc.).

```typescript
interface AuditLogParams {
  storeId: string;
  userId?: string;
  action: string;           // e.g. "sale.create", "user.delete"
  entityType: string;       // e.g. "invoice", "user"
  entityId: string;
  oldValue?: object;        // JSON of record before change
  newValue?: object;        // JSON of record after change
  ipAddress?: string | null;
}
```

The `action` namespace convention is `entity.verb`, e.g.:
- `auth.login`, `auth.logout`, `auth.setup`
- `sale.create`, `sale.return`
- `purchase.create`, `purchase.return`, `purchase.payment`
- `user.create`, `user.update`, `user.delete`
- `role.create`, `role.update`, `role.delete`
- `expense.create`, `expense.delete`
- `salary.create`, `salary.pay`
- `advance.create`
- `equity.create`
- `inventory.adjustment`, `inventory.transfer`, `inventory.stock_count`
- `treasury.session.open`, `treasury.session.close`, `treasury.transfer`, `treasury.adjustment`
- `customer.create`, `customer.update`, `customer.payment`
- `supplier.payment`
- `product.create`, `product.update`
- `setting.update`
- `expense_category.create`, `expense_category.update`

---

## Analytics Service (`lib/analytics-service.ts`)

### `AnalyticsService` (static class)

Centralizes all dashboard KPI and chart queries to ensure consistency between the Dashboard page and the Reports page. Both routes call the same methods with the same SQL.

Key methods:

| Method | What It Computes |
|--------|----------------|
| `getSalesKPIs(storeId, from, to)` | Total revenue and cost for period |
| `getPurchasesKPIs(storeId, from, to)` | Total purchase spend |
| `getSalesReturnsKPIs(storeId, from, to)` | Total returns value |
| `getPurchaseReturnsKPIs(storeId, from, to)` | Total purchase returns |
| `getExpensesKPIs(storeId, from, to)` | Total operational expenses |
| `getSalariesKPIs(storeId, from, to)` | Total net salary payments |
| `getTreasuryBalance(storeId)` | Sum of all drawer balances |
| `getCashDrawerBalance(storeId, from?)` | CASH drawer balance or period net |
| `getCustomerDebts(storeId)` | Sum of positive customer balances |
| `getSupplierDebts(storeId)` | Sum of positive supplier balances |
| `getInventoryValuation(storeId)` | Inventory × cost price |
| `getDailySales(storeId, from)` | Net sales per day (returns subtracted) |
| `getMonthlyRevenue(storeId, from)` | Net revenue per month |
| `getCashFlow(storeId, from)` | Daily treasury IN/OUT |
| `getBestSellingProducts(storeId)` | Top 5 products by quantity |
| `getSalesByPaymentMethod(storeId)` | Revenue breakdown by payment type |
| `getSalesByCategory(storeId)` | Revenue breakdown by category |

**Shift-adjusted date expressions**: All date-grouped queries in this service use:
```sql
strftime('%Y-%m-%d', datetime((created_at / 1000) - 39600, 'unixepoch'))
```
The `-39600` seconds (-11 hours) aligns with the 11:00 AM shift boundary.

---

## Notification System (`routes/notifications.ts`)

The notification system is **poll-based**, not push-based. The React frontend periodically calls `POST /api/notifications/refresh` to trigger a server-side alert scan. No WebSockets or Server-Sent Events are used.

**Alert types computed on each refresh:**

| Type | Condition | Severity |
|------|-----------|---------|
| `LOW_STOCK` | `inventory_items.quantity <= products.reorder_point` AND `reorder_point > 0` | WARNING (CRITICAL if qty ≤ 0) |
| `NEGATIVE_TREASURY` | Any `treasury_accounts.balance < 0` | CRITICAL |
| `CUSTOMER_DEBT` | Customer balance > credit limit (and credit limit > 0) | WARNING |
| `SUPPLIER_DEBT` | Any `suppliers.current_balance > 0` | INFO |

**Deduplication**: Each alert has a stable `dedupe_key` (e.g. `LOW_STOCK:<variantId>:<warehouseId>`). Before inserting, the service checks for existing unread notifications with that key. If one already exists, the alert is skipped. This prevents notification spam on repeated refreshes.

The `notifications` table has a partial unique index on `(user_id, dedupe_key) WHERE is_read = false` — concurrent refresh calls from the same user are handled safely by `ON CONFLICT DO NOTHING`.

---

## JWT Utilities (`lib/jwt.ts`)

```typescript
signAccessToken(payload: AccessPayload): string
signRefreshToken(payload: RefreshPayload): string
verifyAccessToken(token: string): AccessPayload
verifyRefreshToken(token: string): RefreshPayload
```

All use HMAC-SHA256 algorithm. Keys are derived at server startup from `SESSION_SECRET` using the key derivation described in Authentication.md.

## Password Utilities (`lib/password.ts`)

```typescript
hashPassword(plain: string): Promise<string>    // bcrypt, 12 rounds
verifyPassword(plain: string, hash: string): Promise<boolean>
```

## Token Hashing (`lib/tokens.ts`)

```typescript
hashToken(token: string): string   // SHA-256 hex — used for refresh token DB storage
```

The refresh token itself is a JWT; what's stored in the `sessions.refresh_token_hash` is `SHA-256(refreshToken)`. This means even if the `sessions` table is breached, the raw refresh tokens are not exposed.
