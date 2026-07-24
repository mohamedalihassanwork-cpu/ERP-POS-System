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

### Sales (`المبيعات`)
| Permission | Description |
|-----------|-------------|
| `sales.create` | Create new sales invoices (POS access) |
| `sales.view` | View sales history |
| `sales.return` | Process customer returns |

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
| `treasury.view` | View treasury transactions and sessions |
| `treasury.session` | Open and close treasury sessions |
| `treasury.manage` | Full treasury access: transfers, adjustments, MAIN_SAFE visibility |

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
| `roles.create` | Create new roles |
| `roles.edit` | Edit role names and permissions |
| `roles.delete` | Delete non-system roles |

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
  - `sales.*` (create, view, return)
  - `purchases.*` (create, view, edit, return, payment)
  - `inventory.*` (view, manage, adjust, transfer, count)
  - `products.*` (view, create, edit, delete)
  - `customers.*` (view, create, edit, delete, payment)
  - `suppliers.*` (view, create, edit, delete, payment)
  - `treasury.*` (view, session, manage)
  - `finance.*` + all sub-permissions
  - `associations.*`
  - `reports.*` (all sub-permissions)
  - `users.view`
  - `roles.view`
  - `audit.view`
  - `settings.view`

---

### Cashier (`كاشير`)
- `is_system: true`
- Permissions:
  - `sales.create`, `sales.view`, `sales.return`
  - `customers.view`, `customers.create`, `customers.payment`
  - `products.view`
  - `inventory.view`
  - `treasury.view`, `treasury.session`
  - `reports.view`, `reports.sales`

---

### Inventory Staff (`موظف المخزون`)
- `is_system: true`
- Permissions:
  - `inventory.view`, `inventory.manage`, `inventory.adjust`, `inventory.transfer`, `inventory.count`
  - `products.view`, `products.create`, `products.edit`
  - `purchases.view`, `purchases.create`
  - `suppliers.view`
  - `reports.view`, `reports.inventory`, `reports.purchases`

---

### Accountant (`محاسب`)
- `is_system: true`
- Permissions:
  - `sales.view`
  - `purchases.view`
  - `treasury.view`, `treasury.manage`
  - `finance.*`
  - `expenses.create`, `salaries.create`, `advances.create`, `equity.create`
  - `reports.view`, `reports.sales`, `reports.purchases`, `reports.inventory`, `reports.finance`, `reports.treasury`, `reports.customers`, `reports.suppliers`
  - `customers.view`
  - `suppliers.view`
  - `audit.view`
  - `settings.view`

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
