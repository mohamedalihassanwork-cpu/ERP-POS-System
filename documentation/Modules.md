# Modules

> Each module corresponds to a UI page (or group of pages) in `artifacts/pos/src/pages/`, backed by API routes in `artifacts/api-server/src/routes/`, and database tables in `lib/db/src/schema/`.

---

## 1. Dashboard (`/dashboard`)

**UI page**: `pages/dashboard.tsx`  
**API route**: `routes/dashboard.ts`  
**Permission**: Any authenticated user

The Dashboard is the application's home screen. It provides a real-time business overview.

### Features
- **Date range filter** — defaults to current month; user can select any range
- **KPI cards** — revenue, cost of goods sold, gross profit, total expenses, net profit, treasury balance, customer debts, supplier debts, inventory valuation
- **Charts** (rendered with Recharts):
  - Daily net sales trend line
  - Monthly revenue bar chart
  - Cash flow (IN vs OUT per day)
  - Best-selling products (horizontal bar)
  - Sales by payment method (pie)
  - Sales by category (pie)

All data comes from a single `GET /api/dashboard` call that executes all `AnalyticsService` queries in parallel and returns the aggregated result. The 11:00 AM shift boundary is applied to all date-range queries.

---

## 2. POS Terminal (`/pos`)

**UI page**: `pages/pos.tsx`  
**API routes**: `routes/sales.ts`  
**Permission**: `sales.create`

The main cashier interface. Designed for fast transaction processing.

### Features

**Product Selection:**
- Real-time product search (by name, SKU, barcode)
- Barcode scanner support — `lib/barcode-input.ts` captures rapid keypresses from USB scanners, debouncing them into a single barcode string
- Quick product creation from POS screen (modal without leaving the screen)
- Product variant picker (color/size grid)

**Cart Management:**
- Add/remove/update quantities
- Per-item discount (amount or percentage)
- Cart-level discount
- Tax applied if configured in store settings
- Running subtotal, discount, tax, and total

**Customer Selection:**
- Search existing customers
- Create new customer inline
- Credit limit enforcement (warning if balance would exceed limit)

**Payment:**
- **Split payment**: multiple methods simultaneously (Cash + Card + etc.)
- Payment methods: Cash, Card, InstaPay, Wallet, Credit (deferred to customer ledger)
- Cash mode shows exact change calculation
- Treasury session validation: if `require_session_for_cash = true`, an open CASH session must exist

**Receipt:**
- Thermal receipt print (`components/thermal-receipt.tsx`) — 80mm format
- A4 invoice print (`components/a4-invoice.tsx`)
- Barcode printed on receipt (links back to invoice)
- Optional logo, footer, store address
- Numeral format applied (western or eastern Arabic)

**Suspended Orders (Parked Sales):**
- Save an in-progress cart as a "suspended order"
- Resume any parked sale (replaces current cart)
- Multiple parked orders can exist simultaneously

---

## 3. Sales History (`/sales`)

**UI page**: `pages/sales-history.tsx`  
**Permission**: `sales.view`

Browse and search all completed invoices.

### Features
- Paginated invoice list with filters: date range, customer, payment status, return status
- Invoice detail modal: full item list, payment breakdown, return history
- Print receipt or A4 invoice for any historical sale
- Return button (links to return workflow) if items are returnable

---

## 4. Sales Returns (`/sales-returns`)

**UI page**: `pages/sales-returns.tsx`  
**Permission**: `sales.return`

Manage product returns from customers.

### Features
- Select an invoice to return against
- Choose which items and quantities to return
- Select refund method (cash or credit back to customer account)
- System validates:
  - Returned quantity ≤ (original quantity − already returned quantity)
  - Refund amount matches items being returned
- Stock is restocked to the specified warehouse
- Customer balance adjusted if original sale was credit

---

## 5. Purchases (`/purchases`)

**UI page**: `pages/purchases.tsx`  
**Permission**: `purchases.view`

Manage supplier invoices and purchase history.

### Features
- **Create Purchase Invoice**:
  - Select supplier and destination warehouse
  - Add product variants with quantities and cost prices
  - Choose payment method: immediate (cash/card) or credit (deferred to supplier ledger)
  - Supplier invoice number field (for cross-reference)
  - Due date support
- Purchase list with filters: date range, supplier, payment status
- Invoice detail view
- **Partial payments**: record subsequent payments against outstanding purchase invoices
- COGS automatically updated in inventory (cost price per variant updated at purchase time if the purchase price differs)

---

## 6. Purchase Returns (`/purchase-returns`)

**UI page**: `pages/purchase-returns.tsx`  
**Permission**: `purchases.return`

Return goods to suppliers.

### Features
- Select purchase invoice to return against
- Choose items and quantities (must not exceed purchased − already returned)
- System posts: stock decrement, supplier balance credit, treasury receipt (if cash refund from supplier)

---

## 7. Products (`/products`)

**UI page**: `pages/products.tsx`  
**Permission**: `products.view` (edit requires `products.edit`, create requires `products.create`)

Full product catalog management.

### Features
- Product list with search, category filter, brand filter, active/inactive filter
- **Create product**: name, category, brand, base price, cost price, reorder point, barcode, description
- **Variants**: each product can have multiple color+size variants
  - Each variant has its own SKU and barcode
  - Selling price and cost price can be overridden per variant (falls back to product base price if not set)
- **Barcode label printing** (`components/barcode-label-print-modal.tsx`):
  - Select variants and quantity of labels per variant
  - Prints a sheet layout of barcode labels for shelf tagging
- Reorder point setting triggers `LOW_STOCK` notifications when breached

---

## 8. Master Data (`/master-data`)

**UI page**: `pages/master-data.tsx`  
**Permission**: `products.view`

Manage the lookup tables used across the system.

### Sub-sections
- **Brands** — retail brand names with optional English name
- **Categories** — product categories for grouping and reports
- **Colors** — color options with optional hex code
- **Sizes** — sizes with system designation (EU, US, UK) and sort order

All support create, edit, activate/deactivate, and delete (with soft protection against deletion if the item is in use).

---

## 9. Warehouses (`/warehouses`)

**UI page**: `pages/warehouses.tsx`  
**Permission**: `inventory.view`

Manage physical warehouse locations.

### Features
- Create warehouses (name, code, address)
- Set a default warehouse (used when POS doesn't specify one)
- Activate/deactivate warehouses
- Stock levels cannot be managed here; see **Stock** module

---

## 10. Stock (`/stock`)

**UI page**: `pages/stock.tsx`  
**Permission**: `inventory.view`

View current stock levels per warehouse.

### Features
- Filter by warehouse, category, brand, or search by name/SKU
- Low-stock filter (shows only items at or below reorder point)
- Per-variant breakdown: current quantity, reorder point, valuation

---

## 11. Inventory Movements (`/movements`)

**UI page**: `pages/movements.tsx`  
**Permission**: `inventory.view`

Immutable log of every stock change event.

### Features
- Filter by variant, warehouse, movement type, date range
- Shows: type, quantity change, balance after, source document reference
- Read-only — movements cannot be edited (append-only ledger)

---

## 12. Transfers (`/transfers`)

**UI page**: `pages/transfers.tsx`  
**Permission**: `inventory.view` (create requires `inventory.transfer`)

Move stock between warehouses.

### Features
- Create transfer: select source and destination warehouse, add variants with quantities
- Transfer goes through `PENDING` → `CONFIRMED` status
- In PENDING: inventory is deducted from source (TRANSFER_OUT movement posted)
- On confirmation: inventory is added to destination (TRANSFER_IN movement posted)
- Each transfer gets a sequential `TRF-XXXXX` number

---

## 13. Stock Counts (`/stock-counts`)

**UI page**: `pages/stock-counts.tsx`  
**Permission**: `inventory.view` (create requires `inventory.count`)

Physical inventory reconciliation.

### Features
- Create a count session for a specific warehouse
- Optionally pre-select specific variants; otherwise all variants in the warehouse are included
- Each item shows expected quantity (from the system) and a field to enter the physically counted quantity
- Items can be updated progressively (don't need to count everything at once)
- **Close count**: system computes variance per item, posts `STOCK_COUNT_CORRECTION` movements, creates journal entry for the net inventory value change
- Closed counts are immutable

---

## 14. Customers (`/customers`)

**UI page**: `pages/customers.tsx`  
**Permission**: `customers.view`

Customer relationship management and receivables tracking.

### Features
- Customer list with search and debt filter
- Customer profile: contact info, credit limit, current balance
- **Ledger view** — full transaction history (sale credits, payments, return adjustments)
- **Record payment** — post a customer payment directly to their account
- Credit limit enforcement visible in POS and here
- Balance coloring: green (no balance), amber (balance), red (over credit limit)

---

## 15. Suppliers (`/suppliers`)

**UI page**: `pages/suppliers.tsx`  
**Permission**: `suppliers.view`

Supplier management and payables tracking.

### Features
- Supplier list with search
- Supplier profile: contact info, current balance owed
- Ledger view — purchase debits, payments, return credits
- Record supplier payment

---

## 16. Treasury (`/treasury`)

**UI page**: `pages/treasury.tsx`  
**Permission**: `treasury.view`, `treasury.session`

Cash and payment channel management. The treasury page adapts its view based on the user's role.

### Cashier View
- Shows the cashier's own 4 sub-treasury accounts (CASH, CARD, INSTAPAY, WALLET) with current balances
- Displays current operational day status (OPEN / CLOSED)
- **Open Day** button — opens modal to enter opening cash carry-over amount and notes
- **Close Day** button — opens modal to enter:
  - Actual cash count
  - Carry-over amount (how much cash to keep in drawer)
  - Notes
- Shows today's transactions summary per account

### Manager View (requires `treasury.view_all`)
- Shows all cashiers' sub-treasury accounts grouped by cashier
- Each cashier's operational day status (OPEN / CLOSED) is visible
- **MAIN_SAFE** balance shown prominently (requires `treasury.main_safe`)
- Manager can close another cashier's operational day (requires `treasury.close_others`)
- Historical operational days list with variance tracking

**Transactions tab:**
- Full transaction ledger across all accounts
- Filter by account, direction (IN/OUT), reference type, date range

**Transfers tab (requires `treasury.transfer`):**
- Move money between accounts (e.g., Cash → Main Safe)
- Creates a TRANSFER_OUT on the source and TRANSFER_IN on the destination

**Adjustments tab (requires `treasury.adjustment`):**
- Manual correction of a treasury account balance
- Posts both a treasury transaction and a journal entry to Treasury Variance (6000)

---

## 17. Finance & Expenses (`/finance`)

**UI page**: `pages/finance.tsx`  
**Permission**: Any of `finance.view`, `expenses.create`, `salaries.create`, `advances.create`, `equity.create`

Multi-section financial management page.

### Expense Categories
- CRUD for expense category names (e.g., Rent, Electricity, Marketing)

### Expenses
- Log an operational expense: category, amount, date, description, source treasury account
- Creates: expense row, treasury OUT transaction, journal entry (Expense DR, Cash CR)
- List with category and date filters

### Employees
- Manage employee records: name, phone, job title, monthly salary
- Link employee to a user account (optional)
- Track accumulated advance balance

### Salary Advances
- Record a cash advance to an employee
- Increases `employee.advance_balance`
- Creates: advance row, treasury OUT, journal entry (Employee Advances DR, Cash CR)

### Payroll (Salaries)
- Create a salary record for a month (PENDING status)
- When paying: specify deductions (advance deduction auto-populated from advance balance), bonuses, treasury account
- Pay types: `FULL` (100%), `HALF` (50%), `CUSTOM` (user-specified)
- Paying: marks as PAID, deducts advance balance from employee, treasury OUT, journal entry
- One record per employee per month (enforced by unique index)

### Owner Equity
- Record capital injections from owner (DEPOSIT): cash IN → equity credit
- Record owner withdrawals (WITHDRAWAL): cash OUT → drawings debit
- Provides an audit trail for owner's capital movements

---

## 18. Associations (`/associations`)

**UI page**: `pages/associations.tsx`  
**Permission**: `associations.view`, `associations.create`, `associations.edit`, `associations.transactions`

Rotating savings group management (جمعية — a traditional Egyptian financial arrangement).

### What is an Association?
A rotating savings group where multiple participants contribute periodically, and one member receives the pooled funds each cycle. The ERP tracks money going out (WITHDRAWAL — when the business contributes its turn's payment) and coming back (RETURN — when the business receives its payout).

### Features
- Create an association with start/end dates, contribution frequency, expected return date
- Record transactions:
  - **WITHDRAWAL** — business pays into the pool (treasury OUT)
  - **RETURN** — business receives payout (treasury IN)
- Computed summary: total withdrawn, total returned, current net balance
- Status: ACTIVE or CLOSED
- Transaction reversal (marks transaction as reversed, posts counter-transaction)
- View transaction history per association

---

## 19. Reports (`/reports`)

**UI page**: `pages/reports.tsx`  
**Permission**: `reports.view` (sub-permissions per report type)

Comprehensive reporting with export capabilities.

### Available Reports

| Report | Permission | Content |
|--------|-----------|---------|
| Sales Summary | `reports.sales` | Invoices with totals, returns, payment methods |
| Purchase Summary | `reports.purchases` | Purchase invoices with supplier and status |
| Profit & Loss | `reports.finance` | Revenue, COGS, gross profit, expenses, net profit |
| Inventory Stock | `reports.inventory` | Per-variant stock levels across warehouses |
| Low Stock | `reports.inventory` | Variants at or below reorder point |
| Top Products | `reports.inventory` | Best sellers by quantity or revenue |
| Treasury Report | `reports.treasury` | Treasury transactions with running balance |
| Expense Report | `reports.finance` | Expenses by category and date |
| Customer Statement | `reports.customers` | Customer ledger for a specific customer |
| Supplier Statement | `reports.suppliers` | Supplier ledger for a specific supplier |
| Journal Ledger | `reports.finance` | Double-entry journal entries |
| Movement Report | `reports.inventory` | Inventory movement log |

All reports support:
- Date range filtering
- Excel export (via `lib/excel-export.ts` using the XLSX library)
- Print-friendly view

---

## 20. Users (`/users`)

**UI page**: `pages/users.tsx`  
**Permission**: `users.view`

User account management for the store.

### Features
- List all users with role, status, last login
- Create user: username, password, full name, role, phone, email
- Edit user details or role assignment
- Activate/deactivate user accounts (deactivating revokes all sessions)
- Password reset by admin
- Soft delete (retains history; user cannot log in)

---

## 21. Roles (`/roles`)

**UI page**: `pages/roles.tsx`  
**Permission**: `roles.view`

Role and permission management.

### Features
- List all roles with permission counts
- Create custom roles with any combination of permissions
- Edit role name and permissions
- The permission editor is a grouped checklist built from the `PERMISSION_GROUPS` catalog (fetched from `GET /api/permissions`)
- System roles (Admin, Manager, etc.) cannot be deleted
- Role deletion blocked if any user is assigned to it

---

## 22. Audit Log (`/audit`)

**UI page**: `pages/audit.tsx`  
**Permission**: `audit.view`

Complete audit trail of all user actions.

### Features
- Paginated log with filters: user, entity type, action, date range
- Shows: timestamp, action name, user, entity type/ID, IP address
- Expandable rows to view `old_value` → `new_value` JSON diff

---

## 23. Settings (`/settings`)

**UI page**: `pages/settings.tsx`  
**Permission**: `settings.view`

Store configuration.

### Sections

**Store Information** (requires `settings.manage`):
- Store name, phone, address, city, currency
- Logo upload

**Tax Settings** (requires `settings.manage`):
- Enable/disable tax, set tax rate, toggle inclusive pricing

**Receipt Settings** (requires `settings.manage`):
- Receipt width (80mm, 58mm, A4)
- Custom receipt footer text
- Numeral format (western: 0-9 or eastern: ٠-٩)

**Behavior Settings** (requires `settings.manage`):
- Allow negative stock
- Allow selling below cost price
- Allow negative treasury balance
- Require open operational day for cash sales

**Operational Day Settings** (requires `settings.manage`):
- **Shift Start Hour** — hour (0–23) at which the operational day starts (default: 11 AM)
- Changing this hour immediately affects all KPI "today" windows and day-boundary validation

**Printer Settings** (Desktop only):
- Select default printer and paper size
- Stored via `window.electronAPI.savePrinterSettings` (persisted in `%APPDATA%\ShoeStorePOS\printer-settings.json`)

**Backup & Restore** (Desktop only):
- Manual backup: copies `%APPDATA%\ShoeStorePOS\` to a user-selected folder with a timestamped name
- Manual restore: selects a backup folder, stops API server, copies files back, relaunches app
- Auto-backup: configure a path and enable automatic scheduled backups (runs daily at startup if enabled)

---

## Setup Wizard (First-Run Only)

**UI page**: `pages/setup.tsx`  
**Auth**: None

The Gateway component (`App.tsx`) redirects here if `isSetupComplete = false`. Multi-step wizard:

1. Store name and currency
2. Admin account credentials (username + password)
3. Contact information (phone, address, city)
4. Tax configuration
5. Receipt printer settings
6. Review and submit

Submits to `POST /api/auth/setup`. On success, auto-logs in and redirects to the Dashboard.
