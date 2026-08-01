import { Link } from "wouter";
import {
  Users,
  ScrollText,
  ArrowLeft,
  Activity,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  HandCoins,
  CreditCard,
  UserCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  useListAuditLogs,
  getListAuditLogsQueryKey,
  useGetDashboardKpis,
  getGetDashboardKpisQueryKey,
  useGetDashboardCharts,
  getGetDashboardChartsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

const AUDIT_PARAMS = { page: 1, pageSize: 6 } as const;

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  INSTAPAY: "إنستا باي",
  WALLET: "محفظة",
  CREDIT: "آجل",
};

function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    CREATE_SALE: "إنشاء فاتورة بيع",
    RETURN_SALE: "مرتجع بيع",
    CREATE_PURCHASE: "إنشاء فاتورة شراء",
    RETURN_PURCHASE: "مرتجع شراء",
    CREATE_EXPENSE: "إنشاء مصروف",
    DELETE_EXPENSE: "حذف مصروف",
    CREATE_CUSTOMER: "إنشاء عميل",
    UPDATE_CUSTOMER: "تعديل عميل",
    DELETE_CUSTOMER: "حذف عميل",
    CREATE_SUPPLIER: "إنشاء مورد",
    UPDATE_SUPPLIER: "تعديل مورد",
    DELETE_SUPPLIER: "حذف مورد",
    CREATE_PRODUCT: "إنشاء منتج",
    UPDATE_PRODUCT: "تعديل منتج",
    DELETE_PRODUCT: "حذف منتج",
    CREATE_EMPLOYEE: "إنشاء موظف",
    UPDATE_EMPLOYEE: "تعديل موظف",
    PAY_SALARY: "صرف راتب",
    CREATE_SALARY: "إنشاء استحقاق راتب",
    CREATE_ADVANCE: "صرف سلفة",
    OPEN_DAY: "فتح يوم تشغيلي",
    CLOSE_DAY: "إغلاق يوم تشغيلي",
    TREASURY_TRANSFER: "تحويل خزينة",
    TREASURY_ADJUSTMENT: "تسوية خزينة",
    CUSTOMER_PAYMENT: "تحصيل من عميل",
    SUPPLIER_PAYMENT: "سداد لمورد",
    CREATE_TRANSFER: "إنشاء تحويل مخزني",
    COMPLETE_TRANSFER: "استكمال تحويل مخزني",
    CANCEL_TRANSFER: "إلغاء تحويل مخزني",
    STOCK_ADJUSTMENT: "تسوية مخزن",
    LOGIN: "تسجيل دخول",
    LOGOUT: "تسجيل خروج",
    CREATE_USER: "إنشاء مستخدم",
    UPDATE_USER: "تعديل مستخدم",
    UPDATE_SETTINGS: "تعديل الإعدادات",
    EQUITY_WITHDRAWAL: "سحب مالك",
    EQUITY_DEPOSIT: "إيداع مالك",
    CREATE_ASSOCIATION: "إنشاء جمعية",
    ASSOCIATION_WITHDRAWAL: "سحب جمعية",
    ASSOCIATION_RETURN: "قبض جمعية",
  };
  return map[action] ?? action;
}

const PIE_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6"];

function money(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const canViewDashboard = hasPermission("dashboard.view");
  const canViewAudit = hasPermission("audit.view");

  const kpisQuery = useGetDashboardKpis({
    query: {
      enabled: canViewDashboard,
      queryKey: getGetDashboardKpisQueryKey(),
    },
  });
  const chartsQuery = useGetDashboardCharts({
    query: {
      enabled: canViewDashboard,
      queryKey: getGetDashboardChartsQueryKey(),
    },
  });
  const auditQuery = useListAuditLogs(AUDIT_PARAMS, {
    query: {
      enabled: canViewAudit,
      queryKey: getListAuditLogsQueryKey(AUDIT_PARAMS),
    },
  });

  const k = kpisQuery.data;
  const charts = chartsQuery.data;

  const kpiCards = [
    {
      label: "مبيعات اليوم",
      value: money(k?.todaySales),
      icon: <ShoppingCart size={22} className="text-emerald-600" />,
      bg: "bg-emerald-100 border-emerald-200",
    },
    {
      label: "ربح اليوم",
      value: money(k?.todayProfit),
      icon: <TrendingUp size={22} className="text-green-600" />,
      bg: "bg-green-100 border-green-200",
      requiresPermission: "dashboard.view_profits",
    },
    {
      label: "مشتريات اليوم",
      value: money(k?.todayPurchases),
      icon: <ShoppingBag size={22} className="text-blue-600" />,
      bg: "bg-blue-100 border-blue-200",
    },
    {
      label: "مصروفات اليوم",
      value: money(k?.todayExpenses),
      icon: <TrendingDown size={22} className="text-rose-600" />,
      bg: "bg-rose-100 border-rose-200",
    },
    {
      label: "الخزنة الفرعية",
      value: money(k?.cashDrawerBalance),
      icon: <Wallet size={22} className="text-emerald-600" />,
      bg: "bg-emerald-100 border-emerald-200",
    },
    {
      label: "إجمالي الخزينة",
      value: money(k?.treasuryBalance),
      icon: <Wallet size={22} className="text-amber-600" />,
      bg: "bg-amber-100 border-amber-200",
      requiresPermission: "dashboard.view_treasury_total",
    },
    {
      label: "منتجات تحت الحد",
      value: String(k?.lowStockCount ?? 0),
      icon: <AlertTriangle size={22} className="text-orange-600" />,
      bg: "bg-orange-100 border-orange-200",
    },
    {
      label: "ديون العملاء",
      value: money(k?.customerDebts),
      icon: <HandCoins size={22} className="text-purple-600" />,
      bg: "bg-purple-100 border-purple-200",
    },
    {
      label: "ديون الموردين",
      value: money(k?.supplierDebts),
      icon: <CreditCard size={22} className="text-slate-600" />,
      bg: "bg-slate-100 border-slate-200",
    },
    {
      label: "إجمالي الجمعيات",
      value: String(k?.activeAssociationsCount ?? 0),
      icon: <UserCheck size={22} className="text-teal-600" />,
      bg: "bg-teal-100 border-teal-200",
      requiresPermission: "dashboard.view_associations",
    },
    {
      label: "إجمالي سحوبات الجمعيات",
      value: money(k?.totalAssociationsWithdrawn),
      icon: <HandCoins size={22} className="text-rose-500" />,
      bg: "bg-rose-50 border-rose-200",
      requiresPermission: "dashboard.view_associations",
    },
    {
      label: "إجمالي دفعات الجمعيات",
      value: money(k?.totalAssociationsReturned),
      icon: <HandCoins size={22} className="text-emerald-500" />,
      bg: "bg-emerald-50 border-emerald-200",
      requiresPermission: "dashboard.view_associations",
    },
    {
      label: "صافي مديونية الجمعيات",
      value: money(k?.totalAssociationsBalance),
      icon: <Users size={22} className="text-amber-600" />,
      bg: "bg-amber-50 border-amber-200",
      requiresPermission: "dashboard.view_associations",
    },
  ].filter((c) => !c.requiresPermission || hasPermission(c.requiresPermission));

  const paymentData =
    charts?.salesByPaymentMethod.map((d) => ({
      name: PAYMENT_LABELS[d.label] ?? d.label,
      value: d.value,
    })) ?? [];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800">
            مرحباً بك، {user?.fullName} 👋
          </h2>
          <p className="text-slate-500 mt-1 font-medium">
            هذه نظرة عامة على أداء {user?.storeName}.
          </p>
        </div>

        {canViewDashboard && (
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
            data-testid="dashboard-kpis"
          >
            {kpiCards.map((card) => (
              <div
                key={card.label}
                className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"
                data-testid={`kpi-${card.label}`}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${card.bg}`}
                >
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 font-semibold mb-1 truncate">
                    {card.label}
                  </p>
                  <p className="text-xl font-black text-slate-800 truncate">
                    {kpisQuery.isLoading ? "…" : card.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {canViewDashboard && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="مبيعات آخر 30 يوم">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts?.dailySales ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} reversed />
                  <YAxis tick={{ fontSize: 10 }} orientation="right" width={50} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="الإيرادات الشهرية (12 شهر)">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={charts?.monthlyRevenue ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} reversed />
                  <YAxis tick={{ fontSize: 10 }} orientation="right" width={50} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="التدفق النقدي (آخر 30 يوم)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts?.cashFlow ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} reversed />
                  <YAxis tick={{ fontSize: 10 }} orientation="right" width={50} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend />
                  <Bar dataKey="inflow" name="داخل" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" name="خارج" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="الأكثر مبيعاً (آخر 30 يوم)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={charts?.bestSellingProducts ?? []}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10 }} orientation="top" />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    width={90}
                    orientation="right"
                  />
                  <Tooltip />
                  <Bar dataKey="value" name="الكمية" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="المبيعات حسب طريقة الدفع (هذا الشهر)">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={paymentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {paymentData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="أداء الفئات (هذا الشهر)">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={charts?.categoryPerformance ?? []}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    label
                  >
                    {(charts?.categoryPerformance ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}

        {canViewAudit && (
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Activity size={20} className="text-amber-500" />
                أحدث النشاطات
              </h3>
              <Link
                href="/audit"
                className="text-sm text-amber-600 font-bold hover:text-amber-700 flex items-center gap-1"
              >
                عرض الكل
                <ArrowLeft size={14} />
              </Link>
            </div>
            {auditQuery.isLoading ? (
              <p className="text-slate-400 text-sm py-6 text-center">
                جارٍ التحميل...
              </p>
            ) : auditQuery.data && auditQuery.data.items.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {auditQuery.data.items.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                        <ScrollText size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {auditActionLabel(log.action)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {log.userName ?? "النظام"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-sm py-6 text-center">
                لا توجد نشاطات بعد.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <h3 className="text-base font-bold text-slate-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}
