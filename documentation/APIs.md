# API Reference

> All routes are mounted under `/api/`. Authentication and permission requirements are listed for each endpoint.
>
> **Auth header**: `Authorization: Bearer <accessToken>`
>
> Validation errors return `400 { "error": "Arabic message" }`. Permission errors return `403`. Not-found returns `404`. Server errors return `500`.

---

## Health

### `GET /api/healthz`
- **Auth**: None
- **Returns**: `200 OK` — used by Electron's `_waitForApi()` health check loop

---

## Auth

### `GET /api/auth/setup-status`
- **Auth**: None
- **Returns**: `{ storeExists, isSetupComplete }`

### `POST /api/auth/setup`
- **Auth**: None (one-time only; returns 409 if already set up)
- **Body**: `CompleteSetupBody` — store details + admin account credentials
- **Action**: Creates store, default roles (Admin/Manager/Cashier/Inventory/Accountant), admin user, and all financial seed data (chart of accounts + treasury drawers)

### `POST /api/auth/login`
- **Auth**: None
- **Body**: `LoginBody { username, password }`
- **Returns**: `{ accessToken, user }` + sets `pos_refresh` HttpOnly cookie
- **Security**: 5-attempt lockout; timing-safe username enumeration protection

### `POST /api/auth/refresh`
- **Auth**: `pos_refresh` cookie
- **Action**: Rotates refresh token (revokes old session, creates new)
- **Returns**: `{ accessToken, user }`

### `POST /api/auth/logout`
- **Auth**: `pos_refresh` cookie (graceful if invalid)
- **Action**: Revokes the session, clears cookie

### `GET /api/auth/me`
- **Auth**: `requireAuth`
- **Returns**: Full current-user profile

### `POST /api/auth/change-password`
- **Auth**: `requireAuth`
- **Body**: `{ currentPassword, newPassword }`

### `POST /api/auth/reset-password` (admin action)
- **Auth**: `requireAuth` + `users.edit` permission
- **Body**: `{ userId, newPassword }`
- **Action**: Resets another user's password (admin/manager only)

---

## Users

### `GET /api/users`
- **Auth**: `users.view`
- **Query**: `page`, `pageSize`, `search`, `roleId`, `isActive`, `includeDeleted`
- **Returns**: Paginated list of users with role info

### `POST /api/users`
- **Auth**: `users.create`
- **Body**: `CreateUserBody { username, password, fullName, roleId, phone?, email? }`
- **Action**: Creates user, writes audit log

### `GET /api/users/:id`
- **Auth**: `users.view`

### `PATCH /api/users/:id`
- **Auth**: `users.edit`
- **Body**: `UpdateUserBody` — partial user fields

### `DELETE /api/users/:id` (soft delete)
- **Auth**: `users.delete`
- **Action**: Sets `is_deleted = true`, `deleted_at = now`; revokes all sessions

### `PATCH /api/users/:id/toggle-status`
- **Auth**: `users.edit`
- **Action**: Toggles `is_active`; revokes sessions if deactivating

---

## Roles

### `GET /api/roles`
- **Auth**: `requireAuth` (all authenticated users see roles for dropdown)
- **Returns**: All roles with permission arrays

### `POST /api/roles`
- **Auth**: `roles.create`
- **Body**: `CreateRoleBody { name, nameAr, permissions: string[] }`

### `PATCH /api/roles/:id`
- **Auth**: `roles.edit`
- **Body**: `UpdateRoleBody` — name, nameAr, permissions

### `DELETE /api/roles/:id`
- **Auth**: `roles.delete`
- **Validation**: Cannot delete system roles (`is_system = true`) or roles that have users assigned

---

## Permissions

### `GET /api/permissions`
- **Auth**: `requireAuth`
- **Returns**: Full `PERMISSION_GROUPS` catalog from `lib/shared` — used to populate the role editor UI

---

## Audit Logs

### `GET /api/audit-logs`
- **Auth**: `audit.view`
- **Query**: `page`, `pageSize`, `userId`, `entityType`, `action`, `dateFrom`, `dateTo`
- **Returns**: Paginated audit log entries with user info

---

## Catalog (Master Data)

### Brands
- `GET /api/brands` — Auth: `products.view`; query: `includeInactive`
- `POST /api/brands` — Auth: `products.create`; body: `{ name, nameEn? }`
- `PATCH /api/brands/:id` — Auth: `products.edit`
- `DELETE /api/brands/:id` — Auth: `products.delete`

### Categories
- `GET /api/categories` — Auth: `products.view`
- `POST /api/categories` — Auth: `products.create`
- `PATCH /api/categories/:id` — Auth: `products.edit`
- `DELETE /api/categories/:id` — Auth: `products.delete`

### Colors
- `GET /api/colors` — Auth: `products.view`; query: `includeInactive`
- `POST /api/colors` — body: `{ name, nameEn?, hex? }`
- `PATCH /api/colors/:id`
- `DELETE /api/colors/:id`

### Sizes
- `GET /api/sizes` — Auth: `products.view`; query: `includeInactive`, `system`
- `POST /api/sizes` — body: `{ name, system?, sortOrder? }`
- `PATCH /api/sizes/:id`
- `DELETE /api/sizes/:id`

---

## Warehouses

### `GET /api/warehouses`
- **Auth**: `inventory.view`
- **Query**: `includeInactive`

### `POST /api/warehouses`
- **Auth**: `inventory.manage`
- **Body**: `{ name, code, address? }`

### `PATCH /api/warehouses/:id`
- **Auth**: `inventory.manage`

### `PATCH /api/warehouses/:id/set-default`
- **Auth**: `inventory.manage`
- **Action**: Sets this warehouse as the default; unsets others

---

## Products

### `GET /api/products`
- **Auth**: `products.view`
- **Query**: `page`, `pageSize`, `search`, `categoryId`, `brandId`, `isActive`
- **Returns**: Paginated products with variants, inventory totals per variant

### `POST /api/products`
- **Auth**: `products.create`
- **Body**: `CreateProductBody { name, nameEn?, categoryId, brandId?, description?, basePrice, baseCostPrice?, reorderPoint?, barcode?, isActive?, variants: Array<{colorId, sizeId, sku, barcode, sellingPrice?, costPrice?}> }`
- **Action**: Creates product and all variants in a single transaction

### `GET /api/products/:id`
- **Auth**: `products.view`
- **Returns**: Full product with all variants + inventory counts

### `PATCH /api/products/:id`
- **Auth**: `products.edit`
- **Body**: `UpdateProductBody` — partial product fields

### `DELETE /api/products/:id`
- **Auth**: `products.delete`
- **Validation**: Cannot delete if product has any inventory movements

### `POST /api/products/:id/variants`
- **Auth**: `products.edit`
- **Body**: `{ colorId, sizeId, sku, barcode, sellingPrice?, costPrice? }`
- **Action**: Adds a new variant to an existing product

### `PATCH /api/products/:id/variants/:variantId`
- **Auth**: `products.edit`

### `GET /api/products/search-by-barcode`
- **Auth**: `requireAuth` (accessible to cashiers for POS)
- **Query**: `barcode` — exact match on `product_variants.barcode`
- **Returns**: Product + variant info for POS scanning

---

## Inventory

### `GET /api/inventory/stock`
- **Auth**: `inventory.view`
- **Query**: `warehouseId`, `search`, `categoryId`, `brandId`, `lowStockOnly`, `page`, `pageSize`
- **Returns**: Inventory items with product/variant details

### `GET /api/inventory/movements`
- **Auth**: `inventory.view`
- **Query**: `variantId`, `warehouseId`, `type`, `dateFrom`, `dateTo`, `page`, `pageSize`
- **Returns**: Paginated inventory movement log

---

## Inventory Operations

### Manual Adjustments
- `GET /api/inventory/adjustments` — Auth: `inventory.adjust`; list past adjustments
- `POST /api/inventory/adjustments` — Auth: `inventory.adjust`
  - Body: `{ warehouseId, items: [{ variantId, newQuantity, reason }] }`
  - Action: Posts `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movements + journal entry

### Warehouse Transfers
- `GET /api/inventory/transfers` — Auth: `inventory.view`
- `POST /api/inventory/transfers` — Auth: `inventory.transfer`
  - Body: `{ fromWarehouseId, toWarehouseId, items: [{ variantId, quantity }], notes? }`
  - Action: Creates transfer in PENDING status, posts TRANSFER_OUT/TRANSFER_IN movements
- `GET /api/inventory/transfers/:id`
- `POST /api/inventory/transfers/:id/confirm` — Auth: `inventory.transfer`

### Stock Counts
- `GET /api/inventory/stock-counts` — Auth: `inventory.count`
- `POST /api/inventory/stock-counts` — Auth: `inventory.count`
  - Body: `{ warehouseId, variantIds?, notes? }`
  - Action: Creates count session; populates count items with expected quantities from current stock
- `GET /api/inventory/stock-counts/:id`
- `PATCH /api/inventory/stock-counts/:id/items/:itemId` — update counted quantity
- `POST /api/inventory/stock-counts/:id/close` — Auth: `inventory.count`
  - Action: Posts `STOCK_COUNT_CORRECTION` movements for all variances, creates journal entry

---

## Treasury

### `GET /api/treasury/accounts`
- **Auth**: `requireAuth`
- **Permission filter**:
  - Cashiers (no `treasury.view_all`): returns only their own accounts (CASH/CARD/INSTAPAY/WALLET where `user_id = userId`) — MAIN_SAFE excluded
  - Managers/Accountants (`treasury.view_all`): returns all accounts for all cashiers + MAIN_SAFE (if `treasury.main_safe` permission)
- **Response includes**: `userName` for each account (joined from users table)

### `GET /api/treasury/transactions`
- **Auth**: `treasury.view`
- **Query**: `treasuryAccountId`, `direction`, `referenceType`, `dateFrom`, `dateTo`, `page`, `pageSize`

### `POST /api/treasury/transfers`
- **Auth**: `treasury.transfer`
- **Body**: `{ fromAccountId, toAccountId, amount, description? }`
- **Action**: Posts OUT on source account and IN on destination account (two `treasury_transactions` rows + one `treasury_transfers` row)

### `POST /api/treasury/adjustments`
- **Auth**: `treasury.adjustment`
- **Body**: `{ treasuryAccountId, direction, amount, description }`
- **Action**: Posts a treasury transaction + journal entry

---

## Operating Days (الأيام التشغيلية)

Manages the operational day lifecycle for cashiers. See [OperationalDay.md](OperationalDay.md) for full lifecycle documentation.

### `GET /api/operating-days`
- **Auth**: `treasury.view`
- **Query**: `page`, `pageSize`, `status` (`OPEN`|`CLOSED`)
- **Behaviour**: Cashiers see only their own days; managers with `treasury.view_all` see all cashiers' days
- **Returns**: Paginated list of operational days with `userName`

### `GET /api/operating-days/current`
- **Auth**: `treasury.view`
- **Returns**: `{ operationalDay: OperationalDay | null }` — the currently open day for the authenticated user

### `GET /api/operating-days/:id`
- **Auth**: `treasury.view`
- **Returns**: `{ operationalDay, snapshots[] }` — day details + all balance snapshots (OPENING + CLOSING)
- **Permission**: Cashiers can only view their own days; managers can view any

### `POST /api/operating-days` — Open Day
- **Auth**: `treasury.session`
- **Body**:
  ```json
  { "openingCashBalance": 500, "notes": "Optional" }
  ```
- **Validations**:
  - Rejects if user already has an OPEN day
  - Rejects if user already had a day in the current shift window (one per shift, per Q5)
- **Action**:
  1. `ensureStoreFinancials` + `ensureCashierAccounts`
  2. Creates `operational_days` row (status = OPEN)
  3. If `openingCashBalance > 0`: posts `DAY_OPEN_CARRY` IN transaction to cashier's CASH account
  4. Creates OPENING balance snapshots for all 4 cashier accounts
- **Returns** `201`: Created operational day

### `POST /api/operating-days/:id/close` — Close Day
- **Auth**: `treasury.session`
- **Body**:
  ```json
  { "actualClosingCashBalance": 1200, "carryOverCash": 200, "notes": "Optional" }
  ```
- **Permission**: Owner of the day, or user with `treasury.close_others`
- **Action**:
  1. Computes expected CASH balance from opening + net transactions
  2. Records variance
  3. Creates CLOSING snapshots for all 4 accounts (includes total_in / total_out during day)
  4. Transfers all CARD/INSTAPAY/WALLET balances → MAIN_SAFE
  5. Transfers `(actualCash - carryOverCash)` → MAIN_SAFE
  6. Zeroes any remaining CASH variance via `DAY_CLOSE_RESET` transaction
  7. Updates operational day: `status = CLOSED`, `closed_at`, `closed_by`, `cash_variance`, etc.
- **Returns** `200`: Updated operational day



## Customers

### `GET /api/customers`
- **Auth**: `customers.view`
- **Query**: `page`, `pageSize`, `search`, `hasDebt`

### `POST /api/customers`
- **Auth**: `customers.create`
- **Body**: `{ name, phone, address?, creditLimit?, notes? }`

### `GET /api/customers/:id`
- **Auth**: `customers.view`

### `PATCH /api/customers/:id`
- **Auth**: `customers.edit`

### `DELETE /api/customers/:id`
- **Auth**: `customers.delete`
- **Validation**: Cannot delete if outstanding balance > 0

### `GET /api/customers/:id/transactions`
- **Auth**: `customers.view`
- **Returns**: Paginated customer ledger (all debit/credit entries)

### `POST /api/customers/:id/payment`
- **Auth**: `customers.payment`
- **Body**: `{ amount, treasuryAccountId, notes? }`
- **Action**: Posts customer payment (credit to customer ledger, IN to treasury, journal entry)

---

## Suppliers

### `GET /api/suppliers`
- **Auth**: `suppliers.view`

### `POST /api/suppliers`, `PATCH /api/suppliers/:id`, `DELETE /api/suppliers/:id`
- Same pattern as customers

### `GET /api/suppliers/:id/transactions`
- **Auth**: `suppliers.view`

### `POST /api/suppliers/:id/payment`
- **Auth**: `suppliers.payment`
- **Body**: `{ amount, treasuryAccountId, notes? }`

---

## Sales

### `GET /api/invoices`
- **Auth**: `sales.view`
- **Query**: `page`, `pageSize`, `search`, `dateFrom`, `dateTo`, `customerId`, `paymentStatus`, `returnStatus`

### `POST /api/invoices` — Create Sale
- **Auth**: `sales.create`
- **Body**: `CreateSaleBody`
  ```json
  {
    "customerId": "...",
    "warehouseId": "...",
    "items": [{ "variantId": "...", "quantity": 5, "unitPrice": "120.00", "discountAmount": "0" }],
    "payments": [{ "method": "CASH", "treasuryAccountId": "...", "amount": "600.00" }],
    "discountAmount": "0",
    "saleType": "CASH",
    "notes": "..."
  }
  ```
- **Action** (all within a DB transaction):
  1. Validates stock availability (unless `allow_negative_stock` is enabled)
  2. Validates open treasury session for cash payments (unless `require_session_for_cash = false`)
  3. Generates `invoice_number` and `invoice_barcode` via `nextDocumentNumber()`
  4. Inserts `invoices`, `invoice_items`, `invoice_payments` rows
  5. Posts inventory movements (`SALE` — decrements stock)
  6. Posts treasury transactions (one per payment method)
  7. Posts journal entry (Sales Revenue, COGS, Accounts Receivable, Cash/Card)
  8. Updates customer balance if credit sale
  9. Writes audit log

### `GET /api/invoices/:id`
- **Auth**: `sales.view`
- **Returns**: Full invoice with items, payments, and return history

### `POST /api/invoices/return` — Sales Return
- **Auth**: `sales.return`
- **Body**: `{ invoiceId, warehouseId, items: [{ invoiceItemId, quantity }], refundMethod, treasuryAccountId?, reason }`
- **Action**:
  1. Validates that returned quantities don't exceed original quantities minus already-returned
  2. Creates `sales_returns` + `sales_return_items`
  3. Increments `returned_quantity` on the original `invoice_items` rows
  4. Updates `invoice.return_status` to PARTIAL or FULL
  5. Posts `SALE_RETURN` inventory movements (restores stock)
  6. Posts treasury refund transaction (OUT) if cash refund
  7. Posts journal entry (reversal of original sale)
  8. Updates customer balance if credit sale

### `GET /api/invoices/sales-returns`
- **Auth**: `sales.return`
- Returns paginated list of all sales returns

### `GET /api/invoices/:id/returns`
- Returns returns for a specific invoice

### Suspended Orders (Parked Sales)
- `GET /api/invoices/suspended` — list saved carts
- `POST /api/invoices/suspended` — save current cart
- `GET /api/invoices/suspended/:id` — load a saved cart
- `DELETE /api/invoices/suspended/:id` — discard saved cart

---

## Purchases

### `GET /api/purchases`
- **Auth**: `purchases.view`
- **Query**: `page`, `pageSize`, `search`, `supplierId`, `status`, `dateFrom`, `dateTo`

### `POST /api/purchases` — Create Purchase
- **Auth**: `purchases.create`
- **Body**: `CreatePurchaseBody`
- **Action** (within DB transaction):
  1. Generates `invoice_number`
  2. Inserts `purchase_invoices`, `purchase_invoice_items`
  3. Records initial payment if `paymentMethod != CREDIT`
  4. Posts inventory movements (`PURCHASE` — increments stock)
  5. Posts treasury transaction if non-credit payment
  6. Posts journal entry (Inventory DR, Accounts Payable CR, Cash CR)
  7. Updates supplier balance

### `GET /api/purchases/:id`
- **Auth**: `purchases.view`

### `PATCH /api/purchases/:id`
- **Auth**: `purchases.edit`

### `POST /api/purchases/:id/payment` — Record partial payment
- **Auth**: `purchases.payment`
- **Body**: `{ amount, treasuryAccountId, paymentMethod }`

### `POST /api/purchases/return` — Purchase Return
- **Auth**: `purchases.return`
- **Action**: Decrements stock, credits supplier ledger, posts treasury transaction, journal entry reversal

### `GET /api/purchases/returns`
- **Auth**: `purchases.return`

---

## Finance

### Expense Categories
- `GET /api/finance/expense-categories` — Auth: `finance.view` or `expenses.create`
- `POST /api/finance/expense-categories` — Auth: `finance.manage`
- `PATCH /api/finance/expense-categories/:id` — Auth: `finance.manage`

### Expenses
- `GET /api/finance/expenses` — Auth: `finance.view` or `expenses.create`
- `POST /api/finance/expenses` — Auth: `expenses.create`
  - Body: `{ categoryId, amount, expenseDate, description?, treasuryAccountId }`
  - Action: Creates expense row, posts treasury OUT transaction, posts journal entry (Operating Expense DR, Cash CR)
- `GET /api/finance/expenses/:id`
- `DELETE /api/finance/expenses/:id` — Auth: `finance.manage`

### Employees
- `GET /api/finance/employees` — Auth: `finance.view` or `salaries.create`
- `POST /api/finance/employees` — Auth: `finance.manage`
- `GET /api/finance/employees/:id`
- `PATCH /api/finance/employees/:id` — Auth: `finance.manage`
- `DELETE /api/finance/employees/:id` — Auth: `finance.manage`

### Advances
- `GET /api/finance/advances` — Auth: `finance.view` or `advances.create`; query: `employeeId`
- `POST /api/finance/advances` — Auth: `advances.create`
  - Body: `{ employeeId, amount, advanceDate, notes?, treasuryAccountId }`
  - Action: Creates advance record, increments `employee.advance_balance`, posts treasury OUT, journal entry (Employee Advances DR, Cash CR)
- `DELETE /api/finance/advances/:id` — Auth: `finance.manage` (reversal)

### Salaries
- `GET /api/finance/salaries` — Auth: `finance.view` or `salaries.create`; query: `employeeId`, `month`, `status`
- `POST /api/finance/salaries` — Auth: `salaries.create` — create pending salary record
- `GET /api/finance/salaries/:id`
- `POST /api/finance/salaries/:id/pay` — Auth: `salaries.create`
  - Body: `{ treasuryAccountId, advanceDeduction?, otherDeductions?, bonuses? }`
  - Action: Marks salary as PAID, decrements advance_balance on employee, posts treasury OUT, journal entry
- `DELETE /api/finance/salaries/:id` — Auth: `finance.manage`

### Equity
- `GET /api/finance/equity` — Auth: `finance.view` or `equity.create`
- `POST /api/finance/equity` — Auth: `equity.create`
  - Body: `{ type: 'DEPOSIT'|'WITHDRAWAL', amount, movementDate, description?, treasuryAccountId }`
  - Action: Posts treasury IN/OUT transaction, journal entry (Cash DR/CR, Owner Equity CR/DR or Drawings DR)
- `DELETE /api/finance/equity/:id` — Auth: `finance.manage`

---

## Dashboard

### `GET /api/dashboard`
- **Auth**: `requireAuth` (no specific permission)
- **Query**: `fromDate?`, `toDate?`
- **Returns**: Comprehensive dashboard data via `AnalyticsService`:
  - `salesKPIs` — total revenue and cost for period
  - `purchasesKPIs` — total purchase spend
  - `salesReturnsKPIs` — total returns
  - `purchaseReturnsKPIs`
  - `expensesKPIs`
  - `salariesKPIs`
  - `treasuryBalance` — total across all drawers
  - `cashDrawerBalance` — cash drawer only
  - `customerDebts` — total receivables
  - `supplierDebts` — total payables
  - `inventoryValuation` — current stock × cost price
  - `dailySales` — chart data: net sales per day (returns subtracted)
  - `monthlyRevenue` — chart data: net revenue per month
  - `cashFlow` — chart data: daily IN/OUT from treasury
  - `bestSellingProducts` — top 5 by quantity
  - `salesByPaymentMethod` — breakdown by payment type
  - `salesByCategory` — breakdown by product category

---

## Reports

All report endpoints require `requireAuth` + specific `reports.*` permission.

### `GET /api/reports/sales-summary`
- **Auth**: `reports.sales`
- **Query**: `fromDate`, `toDate`, `customerId`, `paymentMethod`
- **Returns**: List of invoices with totals, returned amounts, payment methods

### `GET /api/reports/purchases-summary`
- **Auth**: `reports.purchases`
- **Query**: `fromDate`, `toDate`, `supplierId`

### `GET /api/reports/inventory-stock`
- **Auth**: `reports.inventory`
- **Query**: `warehouseId`, `categoryId`, `brandId`, `lowStockOnly`
- **Returns**: Per-variant stock levels across warehouses

### `GET /api/reports/low-stock`
- **Auth**: `reports.inventory`
- **Returns**: Variants at or below their `reorder_point`

### `GET /api/reports/profit-loss`
- **Auth**: `reports.finance`
- **Query**: `fromDate`, `toDate`
- **Returns**: Revenue, COGS, gross profit, expenses breakdown, net profit

### `GET /api/reports/treasury`
- **Auth**: `reports.treasury`
- **Query**: `fromDate`, `toDate`, `treasuryAccountId`
- **Returns**: Treasury transactions with running balance

### `GET /api/reports/expense-report`
- **Auth**: `reports.finance`
- **Query**: `fromDate`, `toDate`, `categoryId`

### `GET /api/reports/top-products`
- **Auth**: `reports.inventory`
- **Query**: `fromDate`, `toDate`, `limit`

### `GET /api/reports/customer-statement`
- **Auth**: `reports.customers`
- **Query**: `customerId` (required), `fromDate`, `toDate`

### `GET /api/reports/supplier-statement`
- **Auth**: `reports.suppliers`
- **Query**: `supplierId` (required), `fromDate`, `toDate`

### `GET /api/reports/journal-ledger`
- **Auth**: `reports.finance`
- **Query**: `accountId?`, `fromDate`, `toDate`
- **Returns**: Accounting transactions with double-entry lines

### `GET /api/reports/movement-report`
- **Auth**: `reports.inventory`
- **Query**: `variantId?`, `warehouseId?`, `type?`, `fromDate`, `toDate`

---

## Settings

### `GET /api/settings`
- **Auth**: `settings.view`
- **Returns**: Store settings (from `store_settings` table merged with `stores` data)

### `PATCH /api/settings`
- **Auth**: `settings.manage`
- **Body**: Partial `store_settings` fields including:
  - Tax: `taxEnabled`, `taxRate`, `taxInclusive`
  - Receipts: `receiptSize`, `receiptFooter`, `numeralFormat`
  - Stock: `allowNegativeStock`, `allowBelowCostDiscount`
  - Treasury: `allowNegativeTreasury`, `requireSessionForCash`
  - **Shift**: `shiftStartHour` (0–23, integer) — configures the operational day start hour
- **Side effect**: Invalidates `shift_hour_cache` for the store when `shiftStartHour` changes

### `GET /api/settings/store`
- **Auth**: `settings.view`
- **Returns**: Basic store info (name, phone, address, city, currency, logo)

### `PATCH /api/settings/store`
- **Auth**: `settings.manage`

---

## Notifications

### `POST /api/notifications/refresh`
- **Auth**: `requireAuth`
- **Action**: Recomputes alert conditions (low stock, negative treasury, customer over credit limit, supplier debts); inserts new notification rows for conditions not already flagged; skips duplicates via `dedupe_key`
- **Returns**: `{ unread: number }`

### `GET /api/notifications`
- **Auth**: `requireAuth`
- **Query**: `unreadOnly?`, `page`, `pageSize`

### `GET /api/notifications/unread-count`
- **Auth**: `requireAuth`
- **Returns**: `{ unread: number }`

### `POST /api/notifications/read-all`
- **Auth**: `requireAuth`
- **Action**: Marks all user notifications as read

### `POST /api/notifications/:id/read`
- **Auth**: `requireAuth`
- **Action**: Marks single notification as read

---

## Associations (جمعيات)

### `GET /api/associations`
- **Auth**: `associations.view` or `associations.create` or `associations.edit` or `associations.transactions` or `associations.report`
- **Returns**: All associations with computed summary (total withdrawn, total returned, current balance = withdrawn - returned)

### `POST /api/associations`
- **Auth**: `associations.create`
- **Body**: `{ name, description?, startDate, endDate?, expectedReturnDate?, contributionFrequency, contributionAmount?, notes? }`

### `GET /api/associations/:id`
- **Auth**: same anyOf as GET list

### `PATCH /api/associations/:id`
- **Auth**: `associations.edit`

### `POST /api/associations/:id/transactions`
- **Auth**: `associations.transactions`
- **Body**: `{ type: 'WITHDRAWAL'|'RETURN', amount, transactionDate, treasuryAccountId, referenceNumber?, notes? }`
- **Action**: Posts treasury OUT (WITHDRAWAL) or IN (RETURN) transaction; records in `association_transactions`

### `GET /api/associations/:id/transactions`
- **Auth**: same anyOf as GET list

### `POST /api/associations/transactions/:txId/reverse`
- **Auth**: `associations.transactions`
- **Action**: Marks transaction as `is_reversed = true`; posts a reversing treasury transaction
