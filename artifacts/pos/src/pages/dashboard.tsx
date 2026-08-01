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
  BarChart2,
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

const AUDIT_PARAMS = { page: 1, pageSize: 8 } as const;

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

const CHART_COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#ec4899",
];

function money(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "م";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + "ك";
  return String(Math.round(v));
}

function truncateLabel(str: string, max = 10): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; fill?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-right"
      dir="rtl"
    >
      {label && (
        <p className="text-xs font-bold text-slate-500 mb-2">{label}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: p.color || p.fill }}
          />
          <span className="text-slate-600 font-medium">{p.name}:</span>
          <span className="font-black text-slate-900">{money(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Custom Pie Label (renders % inside slice) ───────────────────────────────

function renderPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  isLoading?: boolean;
}

function KpiCard({ label, value, icon, iconBg, isLoading }: KpiCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md hover:border-slate-200 transition-all duration-200">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-500 mb-0.5 truncate leading-snug">{label}</p>
        {isLoading ? (
          <div className="h-5 w-20 bg-slate-100 rounded-lg animate-pulse" />
        ) : (
          <p className="text-base font-black text-slate-800 truncate leading-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Chart Card ──────────────────────────────────────────────────────────────

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 size={15} className="text-amber-500 shrink-0" />
        <h3 className="text-sm font-bold text-slate-700 truncate">{title}</h3>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ─── Empty Chart State ───────────────────────────────────────────────────────

function EmptyChartState() {
  return (
    <div className="flex flex-col items-center justify-center h-[200px] text-slate-300 gap-2">
      <BarChart2 size={32} className="opacity-40" />
      <p className="text-xs font-medium text-slate-400">لا توجد بيانات لعرضها</p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

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
      icon: <ShoppingCart size={19} className="text-emerald-600" />,
      iconBg: "bg-emerald-50 border border-emerald-200",
    },
    {
      label: "ربح اليوم",
      value: money(k?.todayProfit),
      icon: <TrendingUp size={19} className="text-green-600" />,
      iconBg: "bg-green-50 border border-green-200",
      requiresPermission: "dashboard.view_profits",
    },
    {
      label: "مشتريات اليوم",
      value: money(k?.todayPurchases),
      icon: <ShoppingBag size={19} className="text-blue-600" />,
      iconBg: "bg-blue-50 border border-blue-200",
    },
    {
      label: "مصروفات اليوم",
      value: money(k?.todayExpenses),
      icon: <TrendingDown size={19} className="text-rose-600" />,
      iconBg: "bg-rose-50 border border-rose-200",
    },
    {
      label: "الخزنة الفرعية",
      value: money(k?.cashDrawerBalance),
      icon: <Wallet size={19} className="text-emerald-600" />,
      iconBg: "bg-emerald-50 border border-emerald-200",
    },
    {
      label: "إجمالي الخزينة",
      value: money(k?.treasuryBalance),
      icon: <Wallet size={19} className="text-amber-600" />,
      iconBg: "bg-amber-50 border border-amber-200",
      requiresPermission: "dashboard.view_treasury_total",
    },
    {
      label: "منتجات تحت الحد",
      value: String(k?.lowStockCount ?? 0),
      icon: <AlertTriangle size={19} className="text-orange-600" />,
      iconBg: "bg-orange-50 border border-orange-200",
    },
    {
      label: "ديون العملاء",
      value: money(k?.customerDebts),
      icon: <HandCoins size={19} className="text-purple-600" />,
      iconBg: "bg-purple-50 border border-purple-200",
    },
    {
      label: "ديون الموردين",
      value: money(k?.supplierDebts),
      icon: <CreditCard size={19} className="text-slate-600" />,
      iconBg: "bg-slate-100 border border-slate-200",
    },
    {
      label: "إجمالي الجمعيات",
      value: String(k?.activeAssociationsCount ?? 0),
      icon: <UserCheck size={19} className="text-teal-600" />,
      iconBg: "bg-teal-50 border border-teal-200",
      requiresPermission: "dashboard.view_associations",
    },
    {
      label: "سحوبات الجمعيات",
      value: money(k?.totalAssociationsWithdrawn),
      icon: <HandCoins size={19} className="text-rose-500" />,
      iconBg: "bg-rose-50 border border-rose-200",
      requiresPermission: "dashboard.view_associations",
    },
    {
      label: "دفعات الجمعيات",
      value: money(k?.totalAssociationsReturned),
      icon: <HandCoins size={19} className="text-emerald-500" />,
      iconBg: "bg-emerald-50 border border-emerald-200",
      requiresPermission: "dashboard.view_associations",
    },
    {
      label: "صافي مديونية الجمعيات",
      value: money(k?.totalAssociationsBalance),
      icon: <Users size={19} className="text-amber-600" />,
      iconBg: "bg-amber-50 border border-amber-200",
      requiresPermission: "dashboard.view_associations",
    },
  ].filter((c) => !c.requiresPermission || hasPermission(c.requiresPermission));

  const paymentData =
    charts?.salesByPaymentMethod.map((d) => ({
      name: PAYMENT_LABELS[d.label] ?? d.label,
      value: d.value,
    })) ?? [];

  const categoryData = charts?.categoryPerformance ?? [];

  const bestSellingData = (charts?.bestSellingProducts ?? []).map((d) => ({
    ...d,
    shortLabel: truncateLabel(d.label, 12),
  }));

  const bsLabelMaxLen = Math.max(
    ...bestSellingData.map((d) => d.shortLabel.length),
    4,
  );
  const bsYAxisWidth = Math.min(Math.max(bsLabelMaxLen * 7, 70), 130);

  return (
    <div className="flex-1 overflow-auto" dir="rtl">
      <div className="max-w-screen-xl mx-auto p-5 lg:p-7 space-y-6">

        {/* Welcome Banner */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              مرحباً بك، {user?.fullName} 👋
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 font-medium">
              هذه نظرة عامة على أداء {user?.storeName}.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 shrink-0">
            <Activity size={14} className="text-amber-500" />
            لوحة التحكم الرئيسية
          </div>
        </div>

        {/* KPI Cards */}
        {canViewDashboard && (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
            data-testid="dashboard-kpis"
          >
            {kpiCards.map((card) => (
              <KpiCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
                iconBg={card.iconBg}
                isLoading={kpisQuery.isLoading}
              />
            ))}
          </div>
        )}

        {/* Charts */}
        {canViewDashboard && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Daily Sales – Bar */}
            <ChartCard title="مبيعات آخر 30 يوم">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={charts?.dailySales ?? []}
                  margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                  barCategoryGap="35%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    reversed
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    orientation="left"
                    width={48}
                    tickFormatter={shortNumber}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="value" name="المبيعات" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Monthly Revenue – Line */}
            <ChartCard title="الإيرادات الشهرية (12 شهر)">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={charts?.monthlyRevenue ?? []}
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    reversed
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    orientation="left"
                    width={52}
                    tickFormatter={shortNumber}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="الإيرادات"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#3b82f6" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Cash Flow – Grouped Bar */}
            <ChartCard title="التدفق النقدي (آخر 30 يوم)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={charts?.cashFlow ?? []}
                  margin={{ top: 4, right: 4, left: 4, bottom: 24 }}
                  barCategoryGap="30%"
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    reversed
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    orientation="left"
                    width={48}
                    tickFormatter={shortNumber}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px", direction: "rtl" }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar dataKey="inflow" name="داخل" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outflow" name="خارج" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Best Selling – Horizontal Bar */}
            <ChartCard title="الأكثر مبيعاً (آخر 30 يوم)">
              {bestSellingData.length === 0 ? (
                <EmptyChartState />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={bestSellingData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                    barCategoryGap="25%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={shortNumber}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortLabel"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                      width={bsYAxisWidth}
                      orientation="right"
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="value" name="الكمية" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Sales by Payment Method – Pie */}
            <ChartCard title="المبيعات حسب طريقة الدفع (هذا الشهر)">
              {paymentData.length === 0 ? (
                <EmptyChartState />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie
                      data={paymentData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      outerRadius={82}
                      labelLine={false}
                      label={renderPieLabel}
                    >
                      {paymentData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "6px", direction: "rtl" }}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Category Performance – Donut */}
            <ChartCard title="أداء الفئات (هذا الشهر)">
              {categoryData.length === 0 ? (
                <EmptyChartState />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="46%"
                      innerRadius={50}
                      outerRadius={82}
                      labelLine={false}
                      label={renderPieLabel}
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "6px", direction: "rtl" }}
                      formatter={(value: string) => truncateLabel(value, 14)}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

          </div>
        )}

        {/* Recent Activity */}
        {canViewAudit && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Activity size={15} className="text-amber-500" />
                أحدث النشاطات
              </h3>
              <Link
                href="/audit"
                className="text-xs text-amber-600 font-bold hover:text-amber-700 flex items-center gap-1 transition-colors"
              >
                عرض الكل
                <ArrowLeft size={13} />
              </Link>
            </div>

            {auditQuery.isLoading ? (
              <div className="divide-y divide-slate-50">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg animate-pulse shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-slate-100 rounded animate-pulse w-40" />
                      <div className="h-2.5 bg-slate-50 rounded animate-pulse w-24" />
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded animate-pulse w-20" />
                  </div>
                ))}
              </div>
            ) : auditQuery.data && auditQuery.data.items.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {auditQuery.data.items.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                        <ScrollText size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {auditActionLabel(log.action)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {log.userName ?? "النظام"}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-medium shrink-0 mr-4">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300 gap-2">
                <Activity size={28} className="opacity-40" />
                <p className="text-sm font-medium text-slate-400">لا توجد نشاطات بعد</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
