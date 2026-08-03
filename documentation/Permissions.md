# Permissions

> Source files: `lib/shared/src/permissions.ts`, `lib/shared/src/roles.ts`

---

## Permission Model

Every user has a **role**, and every role has an array of **permission strings**. When the user logs in, the permission array is embedded in the JWT access token (`req.auth.permissions` on the server, `user.permissions` in the React context).

The wildcard permission `"*"` grants everything. A superuser (the system Admin role) carries only `"*"` in their permissions array.

### Enforcement Layers

| Layer | Where | How |
|-------|-------|-----|
| Server (authoritative) | `middleware/auth.ts` | `requirePermission()`, `requireAnyPermission()` middleware on every route handler |
| Client (UX only) | `App.tsx` `<PermissionGate>` | Redirects to `/dashboard` if the user navigates to a route they lack permission for |
| Client (nav) | `app-shell.tsx` | Hides nav items the user doesn't have permission for |

> **Client-side permission checks are for UX only. They cannot be trusted for security. The server always re-checks.**

### Helper Functions (from `lib/shared`)

```typescript
hasPermission(permissions: string[], required: string): boolean
// Returns true if:
//   • permissions includes "*"
//   • permissions includes required (exact match)
//   • permissions includes a wildcard prefix e.g. "sales.*" matches "sales.create"

hasAllPermissions(permissions: string[], required: string[]): boolean
// Returns true only if ALL required permissions pass hasPermission()

hasAnyPermission(permissions: string[], required: string[]): boolean
// Returns true if at least one required permission passes hasPermission()
```

---

## Complete Permission Catalog

Organized by `PERMISSION_GROUPS` (from `lib/shared/src/permissions.ts`):

### Dashboard (`لوحة التحكم`)

Dashboard permissions follow a **two-layer model**:

| Layer | Controls |
|-------|----------|
| `dashboard.view_X` | **Visibility** — whether the widget is rendered at all |
| Data permissions (e.g. `sales.view`, `treasury.view_all`) | **Scoping** — what data the backend returns |

Both layers must be satisfied for a widget to be meaningful. For example, a cashier with `dashboard.view_sales` + `sales.view_own` sees the Sales KPI with their own data; a manager with `dashboard.view_sales` + `sales.view` sees store-wide data.

#### Access
| Permission | Description |
|-----------|-------------|
| `dashboard.view` | Access the dashboard page (required for any dashboard content) |

#### KPI Cards
| Permission | Description | Related data permission |
|-----------|-------------|------------------------|
| `dashboard.view_sales` | Sales today KPI | `sales.view` / `sales.view_own` |
| `dashboard.view_profits` | Profit today KPI | `sales.view` / `sales.view_own` |
| `dashboard.view_purchases` | Purchases today KPI | `purchases.view` |
| `dashboard.view_expenses` | Expenses today KPI (incl. association breakdown) | `finance.view` / `expenses.create` |
| `dashboard.view_treasury` | Cashier's own sub-treasury balance | `treasury.view` / `treasury.session` |
| `dashboard.view_treasury_total` | Total treasury across all accounts | `treasury.view_all` |
| `dashboard.view_stock` | Low-stock product count | `inventory.view` |
| `dashboard.view_customers` | Total customer outstanding debts | `customers.view` |
| `dashboard.view_suppliers` | Total supplier outstanding debts | `suppliers.view` |
| `dashboard.view_associations` | Association stats (count, withdrawals, returns, balance) | `associations.view` / `associations.transactions` |

#### Charts
| Permission | Description | Related data permission |
|-----------|-------------|------------------------|
| `dashboard.view_sales_charts` | All sales charts (daily, monthly, best-sellers, payment method, categories) | `sales.view` / `sales.view_own` |
| `dashboard.view_cashflow_chart` | Cash flow chart (inflow vs outflow over 30 days) | `treasury.view` / `treasury.view_all` |

#### Activity
| Permission | Description |
|-----------|-------------|
| `dashboard.view_activity` | Recent activity log widget on the dashboard (also requires `audit.view`) |

---

### Sales (`المبيعات`)
| Permission | Description |
|-----------|-------------|
| `sales.create` | Create new sales invoices (POS access) |
| `sales.view` | View **all** sales history (store-wide) |
| `sales.view_own` | View **own** sales history only — backend scopes dashboard KPIs/charts to this cashier |
| `sales.return` | Process customer returns |
| `sales.delete` | Cancel/delete a sales invoice |
| `sales.custom_date` | Backdate a sales invoice to a custom date |

### Purchases (`المشتريات`)
| Permission | Description |
|-----------|-------------|
| `purchases.create` | Create purchase invoices |
| `purchases.view` | View purchase history |
| `purchases.edit` | Edit purchase invoices |
| `purchases.return` | Process purchase returns |
| `purchases.payment` | Record supplier payments |

### Inventory (`المخزون`)
| Permission | Description |
|-----------|-------------|
| `inventory.view` | View stock levels and movements |
| `inventory.manage` | Create/edit warehouses |
| `inventory.adjust` | Post manual stock adjustments |
| `inventory.transfer` | Create warehouse-to-warehouse transfers |
| `inventory.count` | Create and manage stock count sessions |

### Products (`المنتجات`)
| Permission | Description |
|-----------|-------------|
| `products.view` | View products, variants, master data |
| `products.create` | Create products and variants |
| `products.edit` | Edit products and variants |
| `products.delete` | Delete products |

### Customers (`العملاء`)
| Permission | Description |
|-----------|-------------|
| `customers.view` | View customers and their ledger |
| `customers.create` | Create new customers |
| `customers.edit` | Edit customer profiles |
| `customers.delete` | Delete customers (only if no balance) |
| `customers.payment` | Record customer payments |

### Suppliers (`الموردون`)
| Permission | Description |
|-----------|-------------|
| `suppliers.view` | View suppliers and their ledger |
| `suppliers.create` | Create new suppliers |
| `suppliers.edit` | Edit supplier profiles |
| `suppliers.delete` | Delete suppliers |
| `suppliers.payment` | Record supplier payments |

### Treasury (`الخزينة`)
| Permission | Description |
|-----------|-------------|
| `treasury.view` | View own treasury accounts and transactions |
| `treasury.view_all` | View treasury accounts and operational days for **all** cashiers |
| `treasury.session` | Open and close **your own** operational day |
| `treasury.transfer` | Transfer money between treasury accounts |
| `treasury.adjustment` | Post manual treasury balance adjustments |
| `treasury.main_safe` | View and access the MAIN_SAFE account |
| `treasury.close_others` | Close another cashier's operational day |

### Finance (`المالية`)
| Permission | Description |
|-----------|-------------|
| `finance.view` | View all financial data |
| `finance.manage` | Manage expense categories, delete records |
| `expenses.create` | Create expense records |
| `salaries.create` | Create salary records and mark as paid |
| `advances.create` | Record employee advances |
| `equity.create` | Record owner equity movements |

### Associations (`الجمعيات`)
| Permission | Description |
|-----------|-------------|
| `associations.view` | View associations and their summaries |
| `associations.create` | Create new associations |
| `associations.edit` | Edit association details and status |
| `associations.transactions` | Record withdrawals and returns |
| `associations.report` | View association reports |

### Reports (`التقارير`)
| Permission | Description |
|-----------|-------------|
| `reports.view` | Access the reports page |
| `reports.sales` | Sales summary report |
| `reports.purchases` | Purchases summary report |
| `reports.inventory` | Inventory and stock reports |
| `reports.finance` | P&L, expense, salary, journal reports |
| `reports.treasury` | Treasury transaction report |
| `reports.customers` | Customer statement report |
| `reports.suppliers` | Supplier statement report |

### Users (`المستخدمون`)
| Permission | Description |
|-----------|-------------|
| `users.view` | View user accounts |
| `users.create` | Create new users |
| `users.edit` | Edit user details and roles |
| `users.delete` | Delete (soft-delete) users |

### Roles (`الأدوار`)
| Permission | Description |
|-----------|-------------|
| `roles.view` | View roles and their permissions |
| `roles.manage` | Create, edit, and delete non-system roles |

### Audit (`سجل التدقيق`)
| Permission | Description |
|-----------|-------------|
| `audit.view` | View the audit log |

### Settings (`الإعدادات`)
| Permission | Description |
|-----------|-------------|
| `settings.view` | View store settings |
| `settings.manage` | Edit store settings and configuration |

---

> **Dashboard Two-Layer Model**: Dashboard widgets are gated by `dashboard.view_X` (visibility). Backend data scoping is controlled separately by the underlying data permissions (`sales.view`, `sales.view_own`, `treasury.view_all`, etc.). This lets admins configure exactly what each role sees on the dashboard without coupling it to the data access model.

> **Expense KPI Breakdown**: The "مصروفات اليوم" card shows sub-breakdown rows only when the user has both `dashboard.view_expenses` AND `dashboard.view_associations`. Without associations permission, only operational expenses are shown.


## Default Roles

Seeded during the setup wizard. Defined in `lib/shared/src/roles.ts`.

### Admin (`مدير النظام`)
- Key: `ADMIN_ROLE_KEY`
- Permissions: `["*"]`
- `is_system: true`
- Full access to everything, including features not yet listed in the catalog

---

### Manager (`مدير`)
- `is_system: true`
- Permissions:
  - **Dashboard (all widgets):** `dashboard.view`, `dashboard.view_sales`, `dashboard.view_profits`, `dashboard.view_purchases`, `dashboard.view_expenses`, `dashboard.view_treasury`, `dashboard.view_treasury_total`, `dashboard.view_stock`, `dashboard.view_customers`, `dashboard.view_suppliers`, `dashboard.view_associations`, `dashboard.view_sales_charts`, `dashboard.view_cashflow_chart`, `dashboard.view_activity`
  - `sales.*` (create, view, return, delete)
  - `customers.*` (view, create, edit, delete)
  - `suppliers.*` (view, create, edit, delete)
  - `purchases.*` (create, view, edit, delete, return)
  - `products.*` (view, create, edit, delete)
  - `inventory.view`, `inventory.manage`
  - `finance.*` (view, manage, delete), `expenses.create`, `salaries.create`, `advances.create`, `equity.create`
  - `treasury.view`, `treasury.view_all`, `treasury.session`, `treasury.transfer`, `treasury.adjustment`, `treasury.main_safe`, `treasury.close_others`
  - `associations.*`
  - `reports.*` (view, sales, purchases, inventory, finance, treasury, customers, suppliers)
  - `users.view`, `roles.view`, `settings.view`

---

### Cashier (`كاشير`)
- `is_system: true`
- Permissions:
  - **Dashboard (own sales + expenses + treasury):** `dashboard.view`, `dashboard.view_sales`, `dashboard.view_expenses`, `dashboard.view_treasury`, `dashboard.view_sales_charts`
  - `sales.create`, `sales.view_own`, `sales.return`
  - `customers.view`, `customers.create`, `customers.payment`
  - `products.view`
  - `inventory.view`
  - `treasury.view`, `treasury.session`
  - `expenses.create`
  - `reports.sales`

> **Cashier Sales Charts**: A cashier's sales charts (`dashboard.view_sales_charts`) show only their own data because the backend uses `sales.view_own` to scope all chart queries.

> **No treasury transfer/adjustment/main_safe**: Cashiers can only open/close their own operational day.

---

### Inventory Staff (`موظف المخزون`)
- `is_system: true`
- Permissions:
  - **Dashboard (purchases + stock):** `dashboard.view`, `dashboard.view_purchases`, `dashboard.view_stock`
  - `suppliers.view`
  - `purchases.view`, `purchases.create`, `purchases.edit`, `purchases.delete`, `purchases.return`
  - `products.view`, `products.create`, `products.edit`, `products.delete`
  - `inventory.view`, `inventory.manage`, `inventory.adjust`, `inventory.transfer`, `inventory.count`
  - `reports.view`, `reports.inventory`, `reports.purchases`

---

### Accountant (`محاسب`)
- `is_system: true`
- Permissions:
  - **Dashboard (all financial widgets except associations):** `dashboard.view`, `dashboard.view_sales`, `dashboard.view_profits`, `dashboard.view_purchases`, `dashboard.view_expenses`, `dashboard.view_treasury`, `dashboard.view_treasury_total`, `dashboard.view_stock`, `dashboard.view_customers`, `dashboard.view_suppliers`, `dashboard.view_sales_charts`, `dashboard.view_cashflow_chart`
  - `sales.view`
  - `purchases.view`
  - `products.view`, `inventory.view`
  - `customers.*` (view, create, edit, delete, payment)
  - `suppliers.*` (view, create, edit, delete, payment)
  - `finance.view`, `finance.manage`, `expenses.create`, `salaries.create`, `advances.create`, `equity.create`
  - `treasury.view`, `treasury.view_all`, `treasury.transfer`, `treasury.adjustment`, `treasury.main_safe`
  - `reports.*` (view, sales, purchases, inventory, finance, treasury, customers, suppliers)

---

## Creating Custom Roles

Custom roles can be created from the `/roles` page. A role is just:
- A `name` (English)
- A `nameAr` (Arabic)
- A `permissions: string[]` array

Any combination from the permission catalog is valid. The roles UI presents all permissions grouped by category with checkboxes.

Custom roles are not `is_system` and can be deleted as long as no users are assigned to them.

---

## Permission Gateway in React

`App.tsx` defines a `PermissionGate` component:

```tsx
function PermissionGate({ permission, anyOf, children }) {
  const { hasPermission } = useAuth();
  let ok = false;
  if (permission && hasPermission(permission)) ok = true;
  if (anyOf && anyOf.some(p => hasPermission(p))) ok = true;
  if (!ok) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}
```

Every protected route in the router is wrapped:
```tsx
<Route path="/pos">
  <PermissionGate permission="sales.create">
    <POSPage />
  </PermissionGate>
</Route>
```

Navigation items in `app-shell.tsx` are filtered to only show links the current user has access to:
```tsx
const visibleItems = items.filter(item => {
  if (item.permission) return hasPermission(item.permission);
  if (item.anyOf) return item.anyOf.some(p => hasPermission(p));
  return true;
});
```
