import { WILDCARD_PERMISSION } from "./permissions";

// Default roles seeded for every new store during the Setup Wizard.
// `key` is a stable identifier, `name` is the English label, `nameAr` the
// Arabic label shown in the UI. System roles cannot be deleted; the Admin
// role additionally cannot have its permissions edited (it always has "*").

export interface DefaultRoleDef {
  key: string;
  name: string;
  nameAr: string;
  isSystem: boolean;
  permissions: string[];
}

export const ADMIN_ROLE_KEY = "admin";

export const DEFAULT_ROLES: DefaultRoleDef[] = [
  {
    key: ADMIN_ROLE_KEY,
    name: "Admin",
    nameAr: "مدير النظام",
    isSystem: true,
    permissions: [WILDCARD_PERMISSION],
  },
  {
    key: "manager",
    name: "Manager",
    nameAr: "مدير",
    isSystem: true,
    permissions: [
      "dashboard.view",
      "dashboard.view_sales",
      "dashboard.view_stock",
      "sales.create",
      "sales.view",
      "sales.return",
      "sales.delete",
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.delete",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "suppliers.delete",
      "purchases.view",
      "purchases.create",
      "purchases.edit",
      "purchases.delete",
      "purchases.return",
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "inventory.view",
      "inventory.manage",
      "finance.view",
      "finance.manage",
      "finance.delete",
      "treasury.view",
      "treasury.session",
      "treasury.manage",
      "reports.view",
      "reports.sales",
      "reports.inventory",
      "users.view",
      "roles.view",
      "settings.view",
    ],
  },
  {
    key: "cashier",
    name: "Cashier",
    nameAr: "كاشير",
    isSystem: true,
    permissions: ["expenses.create"],
  },
  {
    key: "inventory_staff",
    name: "Inventory Staff",
    nameAr: "موظف مخزون",
    isSystem: true,
    permissions: [
      "dashboard.view",
      "dashboard.view_stock",
      "suppliers.view",
      "purchases.view",
      "purchases.create",
      "purchases.edit",
      "purchases.delete",
      "purchases.return",
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "inventory.view",
      "inventory.manage",
      "reports.inventory",
    ],
  },
  {
    key: "accountant",
    name: "Accountant",
    nameAr: "محاسب",
    isSystem: true,
    permissions: [
      "dashboard.view",
      "dashboard.view_sales",
      "dashboard.view_stock",
      "sales.view",
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.delete",
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "suppliers.delete",
      "purchases.view",
      "products.view",
      "inventory.view",
      "finance.view",
      "finance.manage",
      "treasury.view",
      "treasury.session",
      "treasury.manage",
      "reports.view",
      "reports.sales",
      "reports.inventory",
    ],
  },
];
