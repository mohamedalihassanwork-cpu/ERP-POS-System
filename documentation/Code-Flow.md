# Code Flow Walkthroughs

> End-to-end traces of the most important business operations in the system.

---

## 1. Complete Sale Transaction

**Scenario**: A cashier scans 2 items, selects a customer, pays with cash.

### Frontend Flow (`pages/pos.tsx`)

1. Cashier scans barcode → `barcode-input.ts` captures the keypress sequence, fires a product lookup
2. `GET /api/products/search-by-barcode?barcode=XXX` returns variant details
3. Item added to the React cart state (quantity, unit price, discount)
4. Cashier searches for customer → `GET /api/customers?search=...`
5. Cashier selects payment method: Cash, enters amount
6. Cashier clicks "Complete Sale" → calls `useCreateInvoice()` mutation (generated hook)

### API Flow (`routes/sales.ts` → `POST /api/invoices`)

**Auth middleware** (`requireAuth`):
- Verifies Bearer token
- Loads `req.auth` with storeId, userId, permissions

**Permission middleware** (`requirePermission("sales.create")`):
- Checks permissions array

**Request validation**:
```typescript
const parsed = CreateSaleBody.safeParse(req.body);
```
Validates items, payments, warehouse, totals using the Orval-generated Zod schema.

**Inside `db.transaction()` — all or nothing**:

1. **Stock validation** (if `allow_negative_stock = false`):
   ```sql
   SELECT quantity FROM inventory_items
   WHERE variant_id = ? AND warehouse_id = ?
   ```
   For each item: `currentQty >= requestedQty` — throws 400 if insufficient

2. **Treasury session validation** (if `require_session_for_cash = true` and payment method includes CASH):
   ```sql
   SELECT id FROM treasury_sessions
   WHERE treasury_account_id = ? AND status = 'OPEN'
   ```
   Throws 400 if no open session

3. **Document numbers**:
   ```typescript
   const invoiceNumber = await nextDocumentNumber("SALE", storeId, "INV-", 5);
   const invoiceBarcode = await nextDocumentNumber("INVOICE_BARCODE", storeId, "", 8);
   ```
   Atomic `UPDATE ... RETURNING` prevents duplicate numbers

4. **Insert invoice**:
   ```sql
   INSERT INTO invoices (invoice_number, invoice_barcode, customer_id, warehouse_id,
     subtotal, discount_amount, tax_amount, total_amount, total_cost, amount_paid,
     change_due, payment_status, sale_type, ...)
   VALUES (...)
   ```

5. **Insert invoice items**:
   ```sql
   INSERT INTO invoice_items (invoice_id, variant_id, quantity, unit_price, unit_cost, discount_amount, line_total)
   VALUES ...
   ```

6. **Insert invoice payments**:
   ```sql
   INSERT INTO invoice_payments (invoice_id, method, treasury_account_id, amount)
   VALUES ...
   ```

7. **Post inventory movements** (for each item):
   ```typescript
   await postInventoryMovement({
     variantId, warehouseId,
     type: "SALE",
     quantityChange: -quantity,  // negative = out
     referenceType: "invoice", referenceId: invoice.id
   });
   ```
   Each call: atomic upsert on `inventory_items`, inserts `inventory_movements` row

8. **Post treasury transactions** (for each payment):
   ```typescript
   await postTreasuryTransaction({
     treasuryAccountId, direction: "IN",
     amount: paymentAmountInCents,
     referenceType: "SALE", referenceId: invoice.id
   });
   ```
   Each call: locks account row, updates `balance`, inserts `treasury_transactions` row

9. **Post journal entry**:
   ```typescript
   await postJournalEntry({
     description: `بيع فاتورة ${invoiceNumber}`,
     referenceType: "invoice", referenceId: invoice.id,
     lines: [
       { accountCode: "1000", debit: totalAmount, credit: 0 },  // Cash DR
       { accountCode: "4000", debit: 0, credit: totalAmount },  // Revenue CR
       { accountCode: "5000", debit: totalCost, credit: 0 },    // COGS DR
       { accountCode: "1200", debit: 0, credit: totalCost },    // Inventory CR
     ]
   });
   ```

10. **Update customer balance** (if credit payment):
    ```sql
    UPDATE customers SET current_balance = current_balance + creditAmount WHERE id = ?
    INSERT INTO customer_transactions (customer_id, type, debit, credit, balance_after, ...)
    ```

11. **Audit log**:
    ```typescript
    await writeAuditLog({ action: "sale.create", entityType: "invoice", entityId: invoice.id, ... });
    ```

**Response**: Full invoice object (id, invoiceNumber, items, payments, totals)

### Frontend Post-Sale

1. TanStack Query mutation success triggers `MutationCache.onSuccess`
2. Global lookup invalidation runs (clears cached inventory/customer/treasury queries)
3. Receipt modal opens automatically
4. Cashier prints thermal receipt via `window.electronAPI.print({ html: receipt.outerHTML })`
5. Cart is cleared; POS is ready for next sale

---

## 2. Purchase Invoice Creation

**Scenario**: Store manager records receipt of goods from a supplier, paying partially in cash.

### API Flow (`POST /api/purchases`)

Inside `db.transaction()`:

1. Generate `PUR-XXXXX` document number
2. Insert `purchase_invoices` row (status: `CONFIRMED`, payment_status computed)
3. Insert `purchase_invoice_items` rows
4. If payment method ≠ CREDIT:
   - Insert `purchase_payments` row
   - `postTreasuryTransaction({ direction: "OUT", ... })` — money leaves the drawer
5. For each item:
   - `postInventoryMovement({ type: "PURCHASE", quantityChange: +quantity })`
6. Journal entry:
   ```
   DR  Inventory (1200)          totalAmount
       CR  Cash (1000)                       amountPaid
       CR  Accounts Payable (2000)           remainingBalance
   ```
7. Update supplier balance:
   ```
   UPDATE suppliers SET current_balance = current_balance + remainingBalance
   INSERT INTO supplier_transactions (debit = totalAmount, credit = amountPaid, ...)
   ```
8. Audit log

---

## 3. Treasury Session Lifecycle

**Scenario**: Cashier opens session at start of shift, makes sales, closes at end.

### Open Session (`POST /api/treasury/sessions/open`)

1. Validates no existing OPEN session for the account
2. Inserts `treasury_sessions` row with `status = 'OPEN'`, `opening_balance = params.openingBalance`
3. Posts a treasury transaction:
   ```typescript
   postTreasuryTransaction({ direction: "IN", amount: openingBalance, referenceType: "OPENING" })
   ```
   This creates the initial balance snapshot in the immutable ledger

### During Session

All cash sales that go through POS automatically post treasury transactions with the `session_id` of the current open session, linking each transaction to the session.

### Close Session (`POST /api/treasury/sessions/:id/close`)

1. Fetches the session row (must be OPEN)
2. Sums all treasury transactions for this session to compute `expected_closing_balance`
3. Receives `actual_closing_balance` from request
4. Computes `variance = actual - expected`
5. If `variance ≠ 0`: posts a `ADJUSTMENT` treasury transaction to account for the discrepancy, and a journal entry to Treasury Variance (6000)
6. Updates session: `status = 'CLOSED'`, `closed_at`, `actual_closing_balance`, `variance`
7. Audit log

---

## 4. Refresh Token Rotation

**Scenario**: User's access token expires; the app silently refreshes.

### Frontend (`lib/auth.tsx`)

The `scheduleRefresh()` function decodes the JWT `exp` claim and sets a `setTimeout` for 60 seconds before expiry:
```javascript
const delay = Math.max(expiry - Date.now() - 60_000, 5_000);
refreshTimer.current = setTimeout(() => runRefresh(), delay);
```

`runRefresh()` calls `POST /api/auth/refresh`. The HttpOnly `pos_refresh` cookie is sent automatically by the browser.

### API Flow (`POST /api/auth/refresh`)

1. Reads cookie: `req.cookies.pos_refresh`
2. Verifies JWT signature and expiry (`verifyRefreshToken`)
3. Loads session by ID (`sid` claim):
   ```sql
   SELECT * FROM sessions WHERE id = ?
   ```
4. Validates:
   - `revoked_at IS NULL` — session not revoked
   - `expires_at > now` — session not expired
   - `SHA-256(cookie_token) === refresh_token_hash` — hash match (prevents replay)
5. **Revokes the used session**:
   ```sql
   UPDATE sessions SET revoked_at = now() WHERE id = ?
   ```
6. Issues new access + refresh tokens
7. **Creates new session**:
   ```sql
   INSERT INTO sessions (user_id, store_id, refresh_token_hash = SHA256(newToken), expires_at)
   ```
8. Sets new refresh token cookie; returns new access token + user profile

---

## 5. Stock Count Reconciliation

**Scenario**: Manager does a physical count and reconciles discrepancies.

### Create Count (`POST /api/inventory/stock-counts`)

1. Generates `SC-XXXXX` number
2. Inserts `stock_counts` row (status: OPEN)
3. Snapshots current inventory for selected variants:
   ```sql
   INSERT INTO stock_count_items (count_id, variant_id, expected_quantity)
   SELECT id, variant_id, quantity FROM inventory_items WHERE warehouse_id = ?
   ```

### Update Items
Cashier counts items physically, updates each item's `counted_quantity`:
```
PATCH /api/inventory/stock-counts/:id/items/:itemId
{ "countedQuantity": 47 }
```

### Close Count (`POST /api/inventory/stock-counts/:id/close`)

For each item where `counted_quantity != expected_quantity`:
```typescript
const delta = countedQty - expectedQty;
const type = delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
await postInventoryMovement({ type, quantityChange: delta, ... });
```

Aggregate all deltas for the journal entry:
```typescript
const totalValueChange = sum(delta * variant.costPrice);
// DR Inventory / CR Treasury Variance (if positive)
// DR Treasury Variance / CR Inventory (if negative)
await postJournalEntry({ lines: [...] });
```

Updates count status to CLOSED.

---

## 6. Desktop Application Startup

**Sequence** (from `main.js` to first rendered window):

```
1. Electron app.whenReady()
2. ApplicationManager.initialize()
3.   └─ LicenseGuard.check()
          └─ Read license.dat (decrypt with hardware-derived AES key)
          └─ Verify ECDSA signature
          └─ Validate payload (edition, expiry, hardware match)
          [Passes → continue]
4.   └─ _getOrCreateSecret()  ← reads/generates SESSION_SECRET
5.   └─ _initDatabase()       ← copies seed.db if store.db missing
6.   └─ _runMigrations()      ← applies 7 idempotent DDL migrations
7.   └─ Create managers (Window, Session, Menu, Shortcut)
8.   └─ _registerIpc()        ← registers all ipcMain.handle() handlers
9.   └─ _startApiServer()     ← spawn(process.execPath, [entryPoint], { env: {...} })
10.  └─ _waitForApi(45000)    ← polls GET /healthz every 500ms
11.  └─ ShortcutManager.register()
12.  └─ WindowManager.restorePersistedWindows()  ← or createWindow() if none
13.  └─ MenuManager.rebuild()
14.  └─ _setupAutoUpdater()   ← autoUpdater.checkForUpdatesAndNotify()
15.  └─ _setupLifecycleEvents()
16.  └─ _setupAutoBackup()
17. [Window loads http://localhost:5001]
18. React app boots:
    ├─ Gateway checks GET /api/auth/setup-status
    ├─ If not set up → Setup wizard
    └─ If set up → POST /api/auth/refresh (silent login)
        ├─ Token valid → render AuthenticatedApp
        └─ Token invalid → LoginPage
```

---

## 7. Notification Refresh Cycle

**Scenario**: User opens the notifications bell → app refreshes alerts.

### Frontend (`components/notification-bell.tsx`)

On click (or on a timer), calls `POST /api/notifications/refresh` via the generated mutation hook.

### API Flow (`POST /api/notifications/refresh`)

1. `buildAlerts(storeId)` — runs 4 parallel DB queries:
   - Low stock: join `inventory_items` + `products` where `qty <= reorder_point`
   - Negative treasury: `balance < 0` in `treasury_accounts`
   - Customer over limit: `current_balance > credit_limit`
   - Supplier debts: `current_balance > 0`

2. Loads existing unread notification dedupe keys:
   ```sql
   SELECT dedupe_key FROM notifications
   WHERE store_id = ? AND user_id = ? AND is_read = false AND dedupe_key IS NOT NULL
   ```

3. Filters out alerts already covered by an unread notification

4. Bulk inserts new notifications:
   ```sql
   INSERT INTO notifications (type, severity, title, body, dedupe_key, ...)
   VALUES (...)
   ON CONFLICT DO NOTHING  -- partial unique index handles concurrent refreshes
   ```

5. Returns `{ unread: count }`

### Frontend post-refresh
Bell icon shows updated unread count badge. User sees new alerts in dropdown.

---

## 8. Multi-Window Session Independence

**Scenario**: Manager opens a second Electron window to check reports while cashier is processing a sale.

1. Manager presses `Ctrl+N` → `ShortcutManager` fires `ApplicationManager._createNewWindow()`
2. `WindowManager.createWindow()` runs:
   - `sessionId = UUID` (new window ID)
   - `partition = "persist:erp-<new-uuid>"` (new unique partition)
   - New `BrowserWindow` created with this partition
3. The new window loads `http://localhost:5001`
4. The React app in the new window runs its own `POST /api/auth/refresh`:
   - The new window has **no** `pos_refresh` cookie (isolated partition)
   - Refresh fails → LoginPage is shown
5. Manager logs in in the new window
6. Now: Window 1 (cashier session) and Window 2 (manager session) are completely independent
   - Different users, different permissions
   - Different cookie jars
   - Both talking to the same API server on port 5001
   - Both reading from the same SQLite database
