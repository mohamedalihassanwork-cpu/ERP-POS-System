# Operational Day

> Introduced in v2 of the Treasury & Cashier Workflow redesign.  
> Source files: `artifacts/api-server/src/routes/operating-days.ts`, `lib/db/src/schema/operational-days.ts`

---

## What Is an Operational Day?

An **Operational Day** is the formal record of a cashier's working shift. It replaces the legacy `treasury_sessions` concept and generalises it to cover all four payment channels (CASH, CARD, INSTAPAY, WALLET) rather than only the CASH drawer.

Every cashier must **open** an Operational Day before processing sales (when `require_session_for_cash` is enabled) and must **close** it at the end of their shift. Closing the day:

1. Records the actual vs expected cash balance and any variance.
2. Transfers all balances to the **MAIN_SAFE** (optionally leaving a carry-over in the CASH drawer).
3. Resets all four cashier sub-treasury accounts to 0 (or carry-over for CASH).
4. Writes immutable balance snapshots for historical audit.

---

## Multi-Cashier Architecture

Each cashier user has their **own set of four treasury accounts**:

```
MAIN_SAFE (store-level, user_id = NULL)
  └── Receives all day-close transfers

Cashier A (user_id = A)
  ├── CASH_A
  ├── CARD_A
  ├── INSTAPAY_A
  └── WALLET_A

Cashier B (user_id = B)
  ├── CASH_B
  ├── CARD_B
  ├── INSTAPAY_B
  └── WALLET_B
```

Cashier A and Cashier B can operate **simultaneously** without any conflict. Their sales, expenses, and treasury transactions are routed to their own accounts automatically based on the logged-in user's ID.

---

## Operational Day Lifecycle

```
             [Cashier logs in]
                    │
                    ▼
         ┌──────────────────┐
         │   POST /operating-days    │  (treasury.session)
         │  Enter opening cash       │
         └──────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  status = OPEN   │
         │  Opening balance │
         │  snapshots taken │
         └──────────────────┘
                    │
         ┌──────────────────┐
         │  Normal Operations│
         │  Sales → CASH_X   │
         │  Returns ← CASH_X │
         │  Expenses ← CASH_X│
         └──────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────┐
         │  POST /operating-days/:id/close  │  (treasury.session)
         │  Enter actual cash count         │
         │  Enter carry-over amount         │
         └──────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────────────────┐
         │  1. Snapshot closing balances    │
         │  2. Transfer CARD/INSTAPAY/      │
         │     WALLET → MAIN_SAFE           │
         │  3. Transfer (cash - carry_over) │
         │     → MAIN_SAFE                  │
         │  4. Zero excess cash variance    │
         │  5. status = CLOSED              │
         └──────────────────────────────────┘
```

### Open Day Flow (Step-by-Step)

1. **Validation**: Reject if user already has an OPEN operational day.
2. **Validation**: Reject if user already had an operational day in the current shift window (one per shift).
3. **Account Provisioning**: `ensureCashierAccounts()` creates CASH/CARD/INSTAPAY/WALLET for this user if they don't exist yet.
4. **Record Creation**: Insert `operational_days` row with `status = OPEN`.
5. **Opening Transaction**: If `openingCashBalance > 0`, post a `DAY_OPEN_CARRY` IN transaction to the cashier's CASH account.
6. **Opening Snapshot**: Record current balances of all 4 cashier accounts in `cashier_balance_snapshots` with `snapshot_type = OPENING`.

### Close Day Flow (Step-by-Step)

1. **Validation**: Day must exist, belong to the store, and be `OPEN`.
2. **Ownership check**: Only the cashier themselves (or a user with `treasury.close_others`) can close the day.
3. **Expected Cash Calculation**: `expected_cash = opening_cash_balance + sum(net CASH transactions since day opened)`
4. **Variance**: `cash_variance = actual_closing_cash_balance - expected_cash_balance`
5. **Carry-over**: `carry_over = min(carryOverCash input, actualCash)` — stays in drawer for next day.
6. **Closing Snapshot**: Record current balances + inflow/outflow totals in `cashier_balance_snapshots` with `snapshot_type = CLOSING`.
7. **Transfer CARD/INSTAPAY/WALLET → MAIN_SAFE**: Each non-CASH account's full balance is transferred to MAIN_SAFE (if > 0). A `treasury_transfers` record and two `treasury_transactions` (OUT from cashier account, IN to MAIN_SAFE) are created.
8. **Transfer CASH → MAIN_SAFE**: `(actual_cash - carry_over)` is transferred to MAIN_SAFE.
9. **Cash Variance Reconciliation**: If `|cash_variance| > 0.001`, a `DAY_CLOSE_VARIANCE` treasury transaction is posted (OUT for shortage, IN for overage) along with a balanced GL double-entry journal: shortage -> DR Treasury Variance (6000) / CR Cash (1000); overage -> DR Cash (1000) / CR Treasury Variance (6000). The variance reason and notes (if provided) are stored in `cash_variance_reason` and `cash_variance_notes` on the `operational_days` row.
10. **Day Closure**: Update `operational_days` row: `status = CLOSED`, `closed_at`, `closed_by`, all computed fields.
11. **Audit Log**: Write `treasury.operational_day_closed` audit entry.

---

## Data Model

### `operational_days`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `store_id` | TEXT | FK → stores |
| `user_id` | TEXT NOT NULL | FK → users (the cashier who owns this day) |
| `status` | TEXT DEFAULT 'OPEN' | `OPEN` or `CLOSED` |
| `opened_at` | INTEGER | Unix ms when the day was opened |
| `closed_at` | INTEGER | Unix ms when the day was closed (null if OPEN) |
| `opening_cash_balance` | TEXT DEFAULT '0' | CASH balance at day open (carry-over from previous day) |
| `carry_over_cash` | TEXT DEFAULT '0' | Cash left in drawer after close (for next day) |
| `actual_closing_cash_balance` | TEXT | Cash physically counted at close |
| `expected_closing_cash_balance` | TEXT | System-computed expected CASH |
| `cash_variance` | TEXT | `actual - expected` |
| `total_transferred_to_main_safe` | TEXT DEFAULT '0' | Total moved to MAIN_SAFE at close |
| `notes` | TEXT | Optional cashier notes |
| `cash_variance_reason` | TEXT | Nullable. Reason code for variance: `CASH_SHORTAGE`, `CASH_OVERAGE`, `COUNTING_ERROR`, `THEFT_OR_LOSS`, `PENDING_INVESTIGATION`, `OTHER` |
| `cash_variance_notes` | TEXT | Nullable. Free-text notes from cashier explaining the variance |
| `opened_by` | TEXT NOT NULL | FK → users |
| `closed_by` | TEXT | FK → users (null if OPEN) |
| `created_at` | INTEGER | Unix ms |

**Indexes**: `(store_id, user_id)`, `(store_id, status)`, `(store_id, created_at)`

### `cashier_balance_snapshots`

Immutable balance records taken at day open and day close.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `store_id` | TEXT | FK → stores |
| `operational_day_id` | TEXT NOT NULL | FK → operational_days |
| `treasury_account_id` | TEXT NOT NULL | FK → treasury_accounts |
| `snapshot_type` | TEXT NOT NULL | `OPENING` or `CLOSING` |
| `balance` | TEXT DEFAULT '0' | Account balance at snapshot time |
| `total_in` | TEXT DEFAULT '0' | Total IN transactions since day open (CLOSING only) |
| `total_out` | TEXT DEFAULT '0' | Total OUT transactions since day open (CLOSING only) |
| `created_at` | INTEGER | Unix ms |

**Indexes**: `(operational_day_id)`, `(treasury_account_id)`

---

## API Endpoints

All endpoints are under `/api/operating-days`.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/operating-days` | `treasury.view` | List operational days. Cashiers see own only; managers see all. |
| `GET` | `/operating-days/current` | `treasury.view` | Current open day for the authenticated user. |
| `GET` | `/operating-days/:id` | `treasury.view` | Specific day details + balance snapshots. |
| `POST` | `/operating-days` | `treasury.session` | Open a new operational day. |
| `POST` | `/operating-days/:id/close` | `treasury.session` | Close an operational day. |

### `POST /operating-days` — Open Day

**Body:**
```json
{
  "openingCashBalance": 500,
  "notes": "Optional notes"
}
```

**Response** `201`: The created operational day row.

**Errors:**
- `409`: User already has an OPEN day.
- `409`: User already had a day in this shift period.

### `POST /operating-days/:id/close` — Close Day

**Body:**
```json
{
  "actualClosingCashBalance": 1200,
  "carryOverCash": 200,
  "notes": "Optional"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `actualClosingCashBalance` | Yes | Amount of cash physically counted in the drawer |
| `carryOverCash` | No | Amount to keep in drawer for next day's opening (default: 0) |
| `notes` | No | Optional closing notes |

**Response** `200`: The closed operational day row.

**Errors:**
- `400`: Missing `actualClosingCashBalance`.
- `400`: Day is already closed.
- `403`: Trying to close another user's day without `treasury.close_others`.
- `404`: Day not found.
- `500`: MAIN_SAFE account missing.

---

## Permissions

| Permission | Effect |
|-----------|--------|
| `treasury.session` | Open and close **your own** operational day |
| `treasury.close_others` | Close another cashier's operational day |
| `treasury.view` | View your own operational days |
| `treasury.view_all` | View all cashiers' operational days |

---

## Configurable Shift Hour

The operational day boundary is defined by `store_settings.shift_start_hour` (default: 11 AM). This is used to:

1. **Determine the start of "today"** for KPI queries.
2. **Enforce the one-day-per-shift rule** when opening a new operational day.
3. **Route backdated cash transactions** to MAIN_SAFE if they fall outside the current shift.

The shift service (`lib/shift.ts`) provides:

```typescript
getShiftStartHour(storeId: string): Promise<number>
computeShiftStart(shiftStartHour: number, now?: Date): Date
computeShiftEnd(shiftStartHour: number, now?: Date): Date
buildShiftDayRanges(shiftStartHour: number, fromDate: Date, toDate?: Date): Array<{ label: string; start: Date; end: Date }>
```

Example with `shift_start_hour = 11`:
- Operational day starts at **11:00:00** on the calendar date.
- Operational day ends at **10:59:59.999** the next calendar date.
- A transaction posted at **10:30 AM** belongs to the **previous** operational day.

---

## KPI Integration

The Dashboard KPIs are shift-aware:

| KPI | Cashier | Manager |
|-----|---------|---------|
| Sub-Treasury (`الخزنة الفرعية`) | Sum of own CASH+CARD+INSTAPAY+WALLET balances | Total of all treasury accounts |
| Today's Sales | Invoices created since `computeShiftStart(shiftHour)` | Same |
| MAIN_SAFE balance | Hidden (requires `treasury.main_safe`) | Shown |

---

## Reference Types for Treasury Transactions

New `reference_type` values introduced for operational day workflow:

| Value | Description |
|-------|-------------|
| `DAY_OPEN_CARRY` | Opening carry-over cash credited to CASH drawer at day open |
| `DAY_CLOSE_RESET` | Debit/credit used to zero the CASH drawer at day close |
| `DAY_CLOSE_VARIANCE` | Cash variance adjustment at day close. Always paired with a double-entry GL journal to Treasury Variance (6000). Uses `description` field to store reason + notes. |

---

## Manager Visibility

Managers with `treasury.view_all` can:
- View all cashiers' operational days (current and historical) via `GET /operating-days`
- View per-cashier account balances via `GET /treasury/accounts`
- Close another cashier's day via `POST /operating-days/:id/close` (requires `treasury.close_others`)
- Review balance snapshots for any historical day via `GET /operating-days/:id`
