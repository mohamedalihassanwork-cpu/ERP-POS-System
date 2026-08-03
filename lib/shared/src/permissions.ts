// Central permission catalog shared between the API server and web client.
// Permission keys follow the `module.action` convention. The wildcard "*"
// grants everything; a module wildcard like "users.*" grants every action
// within that module. Future modules MUST extend this catalog rather than
// inventing ad-hoc permission strings elsewhere.

export const WILDCARD_PERMISSION = "*";

export interface PermissionDef {
  key: string;
  labelAr: string;
}

export interface PermissionGroup {
  module: string;
  labelAr: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: "dashboard",
    labelAr: "لوحة التحكم",
    permissions: [
      // ── Access ──────────────────────────────────────────────────────────
      { key: "dashboard.view",                 labelAr: "عرض لوحة التحكم (الوصول الأساسي)" },
      // ── KPI Cards ────────────────────────────────────────────────────────
      { key: "dashboard.view_sales",           labelAr: "عرض مبيعات اليوم" },
      { key: "dashboard.view_profits",         labelAr: "عرض أرباح اليوم" },
      { key: "dashboard.view_purchases",       labelAr: "عرض مشتريات اليوم" },
      { key: "dashboard.view_expenses",        labelAr: "عرض مصروفات اليوم" },
      { key: "dashboard.view_treasury",        labelAr: "عرض رصيد الخزنة الفرعية (الشخصية)" },
      { key: "dashboard.view_treasury_total",  labelAr: "عرض إجمالي الخزينة (كل الحسابات)" },
      { key: "dashboard.view_stock",           labelAr: "عرض المنتجات تحت حد الطلب" },
      { key: "dashboard.view_customers",       labelAr: "عرض ديون العملاء" },
      { key: "dashboard.view_suppliers",       labelAr: "عرض ديون الموردين" },
      { key: "dashboard.view_associations",    labelAr: "عرض إحصائيات الجمعيات" },
      // ── Charts ───────────────────────────────────────────────────────────
      { key: "dashboard.view_sales_charts",    labelAr: "عرض رسوم المبيعات (يومي / شهري / أكثر مبيعاً / طرق الدفع / الفئات)" },
      { key: "dashboard.view_cashflow_chart",  labelAr: "عرض رسم التدفق النقدي" },
      // ── Activity ─────────────────────────────────────────────────────────
      { key: "dashboard.view_activity",        labelAr: "عرض آخر النشاطات على لوحة التحكم" },
    ],
  },
  {
    module: "associations",
    labelAr: "الجمعيات",
    permissions: [
      { key: "associations.view", labelAr: "عرض الجمعيات" },
      { key: "associations.create", labelAr: "إضافة جمعية" },
      { key: "associations.edit", labelAr: "تعديل الجمعيات" },
      { key: "associations.transactions", labelAr: "دفع وسحب الجمعيات" },
      { key: "associations.report", labelAr: "تقارير الجمعيات" },
    ],
  },
  {
    module: "sales",
    labelAr: "المبيعات",
    permissions: [
      { key: "sales.create", labelAr: "إنشاء فاتورة بيع" },
      { key: "sales.view", labelAr: "عرض جميع المبيعات" },
      { key: "sales.view_own", labelAr: "عرض المبيعات الخاصة فقط" },
      { key: "sales.return", labelAr: "مرتجعات المبيعات" },
      { key: "sales.delete", labelAr: "حذف/إلغاء فاتورة مبيعات" },
      { key: "sales.custom_date", labelAr: "تعديل تاريخ البيع" },
    ],
  },
  {
    module: "customers",
    labelAr: "العملاء",
    permissions: [
      { key: "customers.view", labelAr: "عرض العملاء" },
      { key: "customers.create", labelAr: "إضافة عميل" },
      { key: "customers.edit", labelAr: "تعديل عميل" },
      { key: "customers.delete", labelAr: "حذف عميل" },
      { key: "customers.payment", labelAr: "تسديد دفعات العملاء" },
    ],
  },
  {
    module: "suppliers",
    labelAr: "الموردون",
    permissions: [
      { key: "suppliers.view", labelAr: "عرض الموردين" },
      { key: "suppliers.create", labelAr: "إضافة مورد" },
      { key: "suppliers.edit", labelAr: "تعديل مورد" },
      { key: "suppliers.delete", labelAr: "حذف مورد" },
      { key: "suppliers.payment", labelAr: "تسديد دفعات الموردين" },
    ],
  },
  {
    module: "purchases",
    labelAr: "المشتريات",
    permissions: [
      { key: "purchases.view", labelAr: "عرض المشتريات" },
      { key: "purchases.create", labelAr: "إنشاء فاتورة شراء" },
      { key: "purchases.edit", labelAr: "تعديل المشتريات" },
      { key: "purchases.delete", labelAr: "حذف المشتريات" },
      { key: "purchases.return", labelAr: "مرتجعات المشتريات" },
      { key: "purchases.payment", labelAr: "تسجيل دفعات للموردين" },
    ],
  },
  {
    module: "products",
    labelAr: "المنتجات",
    permissions: [
      { key: "products.view", labelAr: "عرض المنتجات" },
      { key: "products.create", labelAr: "إضافة منتج" },
      { key: "products.edit", labelAr: "تعديل منتج" },
      { key: "products.delete", labelAr: "حذف منتج" },
    ],
  },
  {
    module: "inventory",
    labelAr: "المخزون",
    permissions: [
      { key: "inventory.view", labelAr: "عرض المخزون" },
      { key: "inventory.manage", labelAr: "إدارة المخازن والحركات" },
      { key: "inventory.adjust", labelAr: "جرد وتسوية المخزون يدوياً" },
      { key: "inventory.transfer", labelAr: "تحويل بضاعة بين المخازن" },
      { key: "inventory.count", labelAr: "إنشاء وإدارة جلسات الجرد" },
    ],
  },
  {
    module: "finance",
    labelAr: "المالية",
    permissions: [
      { key: "finance.view", labelAr: "عرض المالية" },
      { key: "finance.manage", labelAr: "إدارة المصروفات والرواتب" },
      { key: "finance.delete", labelAr: "حذف سجلات المالية" },
      { key: "expenses.create", labelAr: "إنشاء مصروف تشغيلي" },
      { key: "salaries.create", labelAr: "إنشاء وصرف رواتب" },
      { key: "advances.create", labelAr: "صرف سلف للموظفين" },
      { key: "equity.create", labelAr: "تسجيل حركات رأس المال" },
    ],
  },
  {
    module: "treasury",
    labelAr: "الخزينة",
    permissions: [
      { key: "treasury.view", labelAr: "عرض خزينتي الخاصة" },
      { key: "treasury.view_all", labelAr: "عرض خزائن جميع الكاشيرية" },
      { key: "treasury.session", labelAr: "فتح/إغلاق يومي التشغيلي الخاص" },
      { key: "treasury.transfer", labelAr: "تحويل رصيد بين الخزائن" },
      { key: "treasury.adjustment", labelAr: "تسوية يدوية للخزينة" },
      { key: "treasury.main_safe", labelAr: "عرض والوصول إلى الخزينة الرئيسية" },
      { key: "treasury.close_others", labelAr: "إغلاق يوم تشغيلي لكاشير آخر" },
    ],
  },
  {
    module: "reports",
    labelAr: "التقارير",
    permissions: [
      { key: "reports.view", labelAr: "الوصول إلى صفحة التقارير" },
      { key: "reports.sales", labelAr: "تقرير ملخص المبيعات" },
      { key: "reports.purchases", labelAr: "تقرير ملخص المشتريات" },
      { key: "reports.inventory", labelAr: "تقارير المخزون والمنتجات" },
      { key: "reports.finance", labelAr: "تقارير الأرباح والمصروفات والرواتب" },
      { key: "reports.treasury", labelAr: "تقرير معاملات الخزينة" },
      { key: "reports.customers", labelAr: "كشف حساب العملاء" },
      { key: "reports.suppliers", labelAr: "كشف حساب الموردين" },
    ],
  },
  {
    module: "users",
    labelAr: "المستخدمون",
    permissions: [
      { key: "users.view", labelAr: "عرض المستخدمين" },
      { key: "users.create", labelAr: "إضافة مستخدم" },
      { key: "users.edit", labelAr: "تعديل مستخدم" },
      { key: "users.delete", labelAr: "حذف مستخدم" },
    ],
  },
  {
    module: "roles",
    labelAr: "الأدوار والصلاحيات",
    permissions: [
      { key: "roles.view", labelAr: "عرض الأدوار" },
      { key: "roles.manage", labelAr: "إنشاء وتعديل وحذف الأدوار" },
    ],
  },
  {
    module: "audit",
    labelAr: "سجل التدقيق",
    permissions: [{ key: "audit.view", labelAr: "عرض سجل التدقيق" }],
  },
  {
    module: "settings",
    labelAr: "الإعدادات",
    permissions: [
      { key: "settings.view", labelAr: "عرض الإعدادات" },
      { key: "settings.manage", labelAr: "إدارة الإعدادات" },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const ALL_PERMISSIONS_SET = new Set(ALL_PERMISSIONS);

/** Returns true when `key` is a known permission in the catalog. */
export function isKnownPermission(key: string): boolean {
  return ALL_PERMISSIONS_SET.has(key);
}

/**
 * Checks whether a set of granted permissions satisfies a required permission.
 * Supports the global wildcard ("*") and per-module wildcards ("users.*").
 */
export function hasPermission(
  granted: readonly string[] | null | undefined,
  required: string,
): boolean {
  if (!granted || granted.length === 0) return false;
  if (granted.includes(WILDCARD_PERMISSION)) return true;
  if (granted.includes(required)) return true;
  const moduleKey = required.split(".")[0];
  return granted.includes(`${moduleKey}.*`);
}

/** Checks whether the granted set satisfies ALL required permissions. */
export function hasAllPermissions(
  granted: readonly string[] | null | undefined,
  required: readonly string[],
): boolean {
  return required.every((r) => hasPermission(granted, r));
}

/** Checks whether the granted set satisfies ANY of the required permissions. */
export function hasAnyPermission(
  granted: readonly string[] | null | undefined,
  required: readonly string[],
): boolean {
  return required.some((r) => hasPermission(granted, r));
}
