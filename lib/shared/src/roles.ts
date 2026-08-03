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
      // Dashboard — full access to every widget
      "dashboard.view",
      "dashboard.view_sales",
      "dashboard.view_profits",
      "dashboard.view_purchases",
      "dashboard.view_expenses",
      "dashboard.view_treasury",
      "dashboard.view_treasury_total",
      "dashboard.view_stock",
      "dashboard.view_customers",
      "dashboard.view_suppliers",
      "dashboard.view_associations",
      "dashboard.view_sales_charts",
      "dashboard.view_cashflow_chart",
      "dashboard.view_activity",
      // Sales
      "sales.create",
      "sales.view",
      "sales.return",
      "sales.delete",
      // Customers
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.delete",
      // Suppliers
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "suppliers.delete",
      // Purchases
      "purchases.view",
      "purchases.create",
      "purchases.edit",
      "purchases.delete",
      "purchases.return",
      // Products & inventory
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "inventory.view",
      "inventory.manage",
      // Finance
      "finance.view",
      "finance.manage",
      "finance.delete",
      "expenses.create",
      "salaries.create",
      "advances.create",
      "equity.create",
      // Treasury
      "treasury.view",
      "treasury.view_all",
      "treasury.session",
      "treasury.transfer",
      "treasury.adjustment",
      "treasury.main_safe",
      "treasury.close_others",
      // Associations
      "associations.view",
      "associations.create",
      "associations.edit",
      "associations.transactions",
      "associations.report",
      // Reports
      "reports.view",
      "reports.sales",
      "reports.purchases",
      "reports.inventory",
      "reports.finance",
      "reports.treasury",
      "reports.customers",
      "reports.suppliers",
      // Admin / system
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
    permissions: [
      // Dashboard — own sales + expenses + own treasury
      "dashboard.view",
      "dashboard.view_sales",
      "dashboard.view_expenses",
      "dashboard.view_treasury",
      "dashboard.view_sales_charts",
      // Sales (own only)
      "sales.create",
      "sales.view_own",
      "sales.return",
      // Customers
      "customers.view",
      "customers.create",
      "customers.payment",
      // Products & inventory
      "products.view",
      "inventory.view",
      // Treasury
      "treasury.view",
      "treasury.session",
      // Finance
      "expenses.create",
      // Reports
      "reports.sales",
    ],
  },
  {
    key: "inventory_staff",
    name: "Inventory Staff",
    nameAr: "موظف مخزون",
    isSystem: true,
    permissions: [
      // Dashboard — purchases + stock
      "dashboard.view",
      "dashboard.view_purchases",
      "dashboard.view_stock",
      // Suppliers
      "suppliers.view",
      // Purchases
      "purchases.view",
      "purchases.create",
      "purchases.edit",
      "purchases.delete",
      "purchases.return",
      // Products & inventory
      "products.view",
      "products.create",
      "products.edit",
      "products.delete",
      "inventory.view",
      "inventory.manage",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.count",
      // Reports
      "reports.view",
      "reports.inventory",
      "reports.purchases",
    ],
  },
  {
    key: "accountant",
    name: "Accountant",
    nameAr: "محاسب",
    isSystem: true,
    permissions: [
      // Dashboard — financial view (no own-only sales, full sales data)
      "dashboard.view",
      "dashboard.view_sales",
      "dashboard.view_profits",
      "dashboard.view_purchases",
      "dashboard.view_expenses",
      "dashboard.view_treasury",
      "dashboard.view_treasury_total",
      "dashboard.view_stock",
      "dashboard.view_customers",
      "dashboard.view_suppliers",
      "dashboard.view_sales_charts",
      "dashboard.view_cashflow_chart",
      // Sales
      "sales.view",
      // Customers
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.delete",
      "customers.payment",
      // Suppliers
      "suppliers.view",
      "suppliers.create",
      "suppliers.edit",
      "suppliers.delete",
      "suppliers.payment",
      // Purchases
      "purchases.view",
      // Products & inventory
      "products.view",
      "inventory.view",
      // Finance
      "finance.view",
      "finance.manage",
      "expenses.create",
      "salaries.create",
      "advances.create",
      "equity.create",
      // Treasury
      "treasury.view",
      "treasury.view_all",
      "treasury.transfer",
      "treasury.adjustment",
      "treasury.main_safe",
      // Reports
      "reports.view",
      "reports.sales",
      "reports.purchases",
      "reports.inventory",
      "reports.finance",
      "reports.treasury",
      "reports.customers",
      "reports.suppliers",
    ],
  },
];
