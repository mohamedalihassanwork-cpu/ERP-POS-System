import { useState } from "react";
import {
  FileBarChart,
  ShoppingCart,
  ShoppingBag,
  Boxes,
  AlertTriangle,
  Scale,
  Wallet,
  TrendingDown,
  Trophy,
  BookOpen,
  Search,
  Users,
  Truck,
  CalendarDays,
  TrendingUp,
  Activity,
  Banknote,
  Clock,
  Printer,
  FileSpreadsheet,
  ArrowRightLeft,
} from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";
import {
  useGetSalesSummaryReport,
  getGetSalesSummaryReportQueryKey,
  useGetPurchasesSummaryReport,
  getGetPurchasesSummaryReportQueryKey,
  useGetInventoryStockReport,
  getGetInventoryStockReportQueryKey,
  useGetLowStockReport,
  getGetLowStockReportQueryKey,
  useGetProfitLossReport,
  getGetProfitLossReportQueryKey,
  useGetTreasuryReport,
  getGetTreasuryReportQueryKey,
  useGetExpenseReport,
  getGetExpenseReportQueryKey,
  useGetTopProductsReport,
  getGetTopProductsReportQueryKey,
  useListSuppliers,
  useListCustomers,
  useListEmployees,
  useSearchProducts,
  useGetProduct,
  useListUsers,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";

function money(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getShiftDate(d: Date): Date {
  const shiftD = new Date(d.getTime());
  shiftD.setHours(shiftD.getHours() - 11);
  return shiftD;
}

function formatDateToLocalStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayStr(): string {
  return formatDateToLocalStr(getShiftDate(new Date()));
}

function monthAgoStr(): string {
  const d = getShiftDate(new Date());
  d.setDate(d.getDate() - 30);
  return formatDateToLocalStr(d);
}

function yearStartStr(): string {
  const d = getShiftDate(new Date());
  return `${d.getFullYear()}-01-01`;
}

function handlePrint() {
  window.print();
}

type ReportTab =
  | "sales"
  | "purchases"
  | "inventory"
  | "low-stock"
  | "profit-loss"
  | "treasury"
  | "expenses"
  | "top-products"
  | "daily-transactions"
  | "account-statement"
  | "supplier-overview"
  | "product-inquiry"
  | "customer-statement"
  | "daily-sales"
  | "salary-summary"
  | "supplier-aging"
  | "customer-aging"
  | "treasury-transfers";

interface TabDef {
  key: ReportTab;
  label: string;
  icon: React.ReactNode;
  permission: string;
}

const TABS: TabDef[] = [
  { key: "sales", label: "ملخص المبيعات", icon: <ShoppingCart size={18} />, permission: "reports.sales" },
  { key: "top-products", label: "الأكثر مبيعاً", icon: <Trophy size={18} />, permission: "reports.sales" },
  { key: "daily-sales", label: "المبيعات اليومية", icon: <CalendarDays size={18} />, permission: "reports.sales" },
  { key: "purchases", label: "ملخص المشتريات", icon: <ShoppingBag size={18} />, permission: "reports.view" },
  { key: "inventory", label: "تقييم المخزون", icon: <Boxes size={18} />, permission: "reports.inventory" },
  { key: "low-stock", label: "نواقص المخزون", icon: <AlertTriangle size={18} />, permission: "reports.inventory" },
  { key: "profit-loss", label: "الأرباح والخسائر", icon: <Scale size={18} />, permission: "reports.view" },
  { key: "treasury", label: "حركة الخزينة", icon: <Wallet size={18} />, permission: "reports.view" },
  { key: "expenses", label: "المصروفات", icon: <TrendingDown size={18} />, permission: "reports.view" },
  // New tabs
  { key: "account-statement", label: "كشف حساب", icon: <BookOpen size={18} />, permission: "reports.view" },
  { key: "supplier-overview", label: "نظرة مورد", icon: <Truck size={18} />, permission: "reports.view" },
  { key: "product-inquiry", label: "استعلام منتج", icon: <Search size={18} />, permission: "reports.inventory" },
  { key: "customer-statement", label: "كشف عميل", icon: <Users size={18} />, permission: "reports.view" },
  { key: "salary-summary", label: "ملخص الرواتب", icon: <Banknote size={18} />, permission: "reports.view" },
  { key: "daily-transactions", label: "معاملات اليوم", icon: <Activity size={18} />, permission: "reports.view" },
  { key: "treasury-transfers", label: "تحويل بين الخزائن", icon: <ArrowRightLeft size={18} />, permission: "reports.view" },
  { key: "supplier-aging", label: "تقادم الموردين", icon: <Clock size={18} />, permission: "reports.view" },
  { key: "customer-aging", label: "تقادم العملاء", icon: <Users size={18} />, permission: "reports.view" },
];

export function ReportsPage() {
  const { hasPermission } = useAuth();
  const visibleTabs = TABS.filter((t) => hasPermission(t.permission));
  const [active, setActive] = useState<ReportTab>(
    visibleTabs[0]?.key ?? "sales",
  );

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 print:p-0">
      <div className="max-w-7xl mx-auto space-y-6 print:space-y-2">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3 print:hidden">
          <FileBarChart className="text-amber-500" size={28} />
          <div>
            <h2 className="text-2xl font-bold text-slate-800">التقارير</h2>
            <p className="text-slate-500 text-sm font-medium">
              تقارير تفصيلية عن المبيعات والمخزون والمالية
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 print:hidden">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              data-testid={`tab-${tab.key}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                active === tab.key
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 print:shadow-none print:border-0 print:p-0">
          {active === "sales" && <SalesReport />}
          {active === "top-products" && <TopProductsReport />}
          {active === "daily-sales" && <DailySalesReport />}
          {active === "purchases" && <PurchasesReport />}
          {active === "inventory" && <InventoryReport />}
          {active === "low-stock" && <LowStockReport />}
          {active === "profit-loss" && <ProfitLossReport />}
          {active === "treasury" && <TreasuryReport />}
          {active === "expenses" && <ExpensesReport />}
          {active === "account-statement" && <AccountStatementReport />}
          {active === "supplier-overview" && <SupplierOverviewReport />}
          {active === "product-inquiry" && <ProductInquiryReport />}
          {active === "customer-statement" && <CustomerStatementReport />}
          {active === "salary-summary" && <SalarySummaryReport />}
          {active === "supplier-aging" && <SupplierAgingReport />}
          {active === "customer-aging" && <CustomerAgingReport />}
          {active === "daily-transactions" && <DailyTransactionsReport />}
          {active === "treasury-transfers" && <TreasuryTransfersReport />}
        </div>
      </div>
    </div>
  );
}

// Helper Components
function ReturnStatusBadge({ status }: { status: string }) {
  if (status === "FULL") return <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full text-xs font-bold">مرتجع كلي</span>;
  if (status === "PARTIAL") return <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full text-xs font-bold">مرتجع جزئي</span>;
  return <span className="text-slate-400 text-xs font-bold">لا يوجد</span>;
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "PAID") return <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full text-xs font-bold">مدفوع</span>;
  if (status === "UNPAID") return <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full text-xs font-bold">غير مدفوع</span>;
  if (status === "PARTIAL") return <span className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full text-xs font-bold">جزئي</span>;
  return <span>{status}</span>;
}

function PrintButton() {
  return (
    <button
      onClick={handlePrint}
      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors print:hidden"
    >
      <Printer size={16} />
      طباعة
    </button>
  );
}

function ReportHeader({
  title,
  children,
  onExportExcel,
}: {
  title: string;
  children?: React.ReactNode;
  onExportExcel?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h3 className="text-lg font-black text-slate-800">{title}</h3>
      <div className="flex items-center gap-2 print:hidden">
        {children}
        {onExportExcel && (
          <button
            onClick={onExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold transition-colors print:hidden"
          >
            <FileSpreadsheet size={16} />
            تصدير إكسيل
          </button>
        )}
        <PrintButton />
      </div>
    </div>
  );
}

function movementTypeLabel(type: string): string {
  const map: Record<string, string> = {
    SALE: "مبيعة",
    SALE_RETURN: "مرتجع مبيعة",
    PURCHASE: "شراء",
    PURCHASE_RETURN: "مرتجع شراء",
    ADJUSTMENT_IN: "تسوية إضافة",
    ADJUSTMENT_OUT: "تسوية خصم",
    TRANSFER_IN: "تحويل وارد",
    TRANSFER_OUT: "تحويل صادر",
    STOCK_COUNT_CORRECTION: "تصحيح جرد",
  };
  return map[type] ?? type;
}

function translatePaymentMethod(method: string | null | undefined): string {
  if (!method) return "—";
  const map: Record<string, string> = {
    CASH: "نقدي",
    CARD: "بطاقة",
    WALLET: "محفظة إلكترونية",
    INSTAPAY: "إنستا باي",
    CREDIT: "آجل",
    MIXED: "متعدد",
    SPLIT: "متعدد",
  };
  // Handle comma-separated methods like "CASH,CREDIT" or "CARD,INSTAPAY"
  return String(method)
    .split(",")
    .map((m) => map[m.trim().toUpperCase()] ?? m.trim())
    .join(" + ");
}

function translatePaymentStatus(status: string | null | undefined): string {
  if (!status) return "—";
  const s = String(status).toUpperCase();
  const map: Record<string, string> = {
    PAID: "مدفوع",
    UNPAID: "غير مدفوع",
    PARTIAL: "مدفوع جزئياً",
  };
  return map[s] ?? status;
}

function translateReturnStatus(status: string | null | undefined): string {
  if (!status || status === "NONE") return "لا يوجد";
  const s = String(status).toUpperCase();
  const map: Record<string, string> = {
    FULL: "مرتجع كلي",
    PARTIAL: "مرتجع جزئي",
  };
  return map[s] ?? status;
}

function translatePurchaseStatus(status: string | null | undefined): string {
  if (!status) return "—";
  const s = String(status).toUpperCase();
  const map: Record<string, string> = {
    COMPLETED: "مكتمل",
    RECEIVED: "مكتمل",
    DRAFT: "مسودة",
    CANCELLED: "ملغى",
    PENDING: "معلق",
  };
  return map[s] ?? status;
}

function txTypeLabel(type: string): string {
  const map: Record<string, string> = {
    INVOICE: "فاتورة",
    PAYMENT: "دفعة",
    RETURN: "مرتجع",
    OPENING_BALANCE: "رصيد افتتاحي",
    ADJUSTMENT: "تسوية",
    PURCHASE: "مشترى",
  };
  return map[type] ?? type;
}

function accountTypeLabel(type: string): string {
  const map: Record<string, string> = {
    ASSET: "أصول",
    LIABILITY: "التزامات",
    EQUITY: "حقوق الملكية",
    REVENUE: "إيرادات",
    EXPENSE: "مصروفات",
    INCOME: "دخل",
  };
  return map[String(type).toUpperCase()] ?? type;
}

function DateRange({
  from,
  to,
  setFrom,
  setTo,
}: {  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-5">
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          data-testid="input-from-date"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          data-testid="input-to-date"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-5 py-3 border border-slate-100">
      <p className="text-xs text-slate-500 font-semibold">{label}</p>
      <p className={`text-lg font-black ${color ?? "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function Table({
  headers,
  children,
  empty,
  loading,
}: {
  headers: string[];
  children: React.ReactNode;
  empty: boolean;
  loading: boolean;
}) {
  if (loading)
    return <p className="text-slate-400 text-sm py-8 text-center">جارٍ التحميل...</p>;
  if (empty)
    return (
      <p className="text-slate-400 text-sm py-8 text-center">
        لا توجد بيانات للفترة المحددة.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            {headers.map((h) => (
              <th key={h} className="text-right font-bold py-2 px-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function SalesReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const params = { fromDate: from, toDate: to };
  const q = useGetSalesSummaryReport(params, {
    query: { queryKey: getGetSalesSummaryReportQueryKey(params) },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `ملخص_المبيعات_${from}_إلى_${to}`, "المبيعات", [
      { header: "رقم الفاتورة", key: "invoiceNumber" },
      { header: "التاريخ", key: "date", formatter: (v) => formatDateTime(v) },
      { header: "العميل", key: "customerName", formatter: (v) => v || "—" },
      { header: "طريقة الدفع", key: "paymentMethod", formatter: (v) => translatePaymentMethod(v) },
      { header: "حالة الدفع", key: "paymentStatus", formatter: (v) => translatePaymentStatus(v) },
      { header: "حالة الإرجاع", key: "returnStatus", formatter: (v) => translateReturnStatus(v) },
      { header: "الإجمالي", key: "total" },
      { header: "المدفوع", key: "paidAmount" },
      { header: "الأجل", key: "unpaidAmount" },
      { header: "المرتجع", key: "returnedAmount" },
      { header: "الصافي", key: "paidAmount", formatter: (v, r) => Number(v || 0) - Number(r.returnedAmount || 0) },
    ]);
  };

  return (
    <div>
      <ReportHeader title="ملخص المبيعات" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="عدد الفواتير" value={String(d?.count ?? 0)} />
        <SummaryStat label="إجمالي المبيعات" value={money(d?.total)} />
        <SummaryStat label="المدفوع" value={money((d as any)?.totalPaid)} color="text-emerald-600" />
        <SummaryStat label="الأجل" value={money((d as any)?.totalUnpaid)} color="text-amber-600" />
        <SummaryStat label="إجمالي المرتجعات" value={money((d as any)?.totalReturned)} color="text-rose-600" />
        <SummaryStat label="الصافي (نقداً)" value={money((d as any)?.netTotal)} color="text-emerald-700" />
      </div>
      <Table
        headers={["رقم الفاتورة", "التاريخ", "العميل", "الدفع", "حالة الدفع", "الإجمالي", "المدفوع", "الأجل", "المرتجع", "الصافي"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r: any) => (
          <tr key={r.id} className="text-slate-700">
            <td className="py-2 px-3 font-bold">{r.invoiceNumber}</td>
            <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.date)}</td>
            <td className="py-2 px-3">{r.customerName ?? "—"}</td>
            <td className="py-2 px-3 text-xs">{translatePaymentMethod(r.paymentMethod)}</td>
            <td className="py-2 px-3"><PaymentStatusBadge status={r.paymentStatus} /></td>
            <td className="py-2 px-3 font-bold">{money(r.total)}</td>
            <td className="py-2 px-3 text-emerald-600 font-bold">{Number(r.paidAmount) > 0 ? money(r.paidAmount) : "—"}</td>
            <td className="py-2 px-3 text-amber-600 font-bold">{Number(r.unpaidAmount) > 0 ? money(r.unpaidAmount) : "—"}</td>
            <td className="py-2 px-3 text-rose-600 font-bold">{Number(r.returnedAmount) > 0 ? money(r.returnedAmount) : "—"}</td>
            <td className="py-2 px-3 font-bold text-emerald-700">{money(Number(r.paidAmount) - Number(r.returnedAmount))}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function TopProductsReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const params = { fromDate: from, toDate: to };
  const q = useGetTopProductsReport(params, {
    query: { queryKey: getGetTopProductsReportQueryKey(params) },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `الأكثر_مبيعاً_${from}_إلى_${to}`, "الأكثر مبيعاً", [
      { header: "المنتج", key: "productName" },
      { header: "رمز الصنف", key: "sku", formatter: (v) => v || "—" },
      { header: "الكمية المباعة", key: "quantitySold" },
      { header: "الإيراد", key: "revenue" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="الأكثر مبيعاً" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <Table
        headers={["#", "المنتج", "رمز الصنف", "الكمية المباعة", "الإيراد"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r, i) => (
          <tr key={r.variantId} className="text-slate-700">
            <td className="py-2 px-3 text-slate-400">{i + 1}</td>
            <td className="py-2 px-3 font-bold">{r.productName}</td>
            <td className="py-2 px-3 font-mono text-xs">{r.sku ?? "—"}</td>
            <td className="py-2 px-3">{r.quantitySold}</td>
            <td className="py-2 px-3 font-bold">{money(r.revenue)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function PurchasesReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const params = { fromDate: from, toDate: to };
  const q = useGetPurchasesSummaryReport(params, {
    query: { queryKey: getGetPurchasesSummaryReportQueryKey(params) },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(
      (d.rows as any[]).filter((r) => !r.isReturn),
      `ملخص_المشتريات_${from}_إلى_${to}`,
      "المشتريات",
      [
        { header: "رقم الفاتورة", key: "invoiceNumber" },
        { header: "التاريخ", key: "date", formatter: (v) => formatDate(v) },
        { header: "المورد", key: "supplierName", formatter: (v) => v || "—" },
        { header: "الحالة", key: "status", formatter: (v) => translatePurchaseStatus(v) },
        { header: "طريقة الدفع", key: "paymentMethod", formatter: (v) => translatePaymentMethod(v) },
        { header: "الإجمالي", key: "total" },
        { header: "المدفوع", key: "amountPaid" },
        { header: "المتبقي (آجل)", key: "remainingBalance" },
      ],
    );
  };

  return (
    <div>
      <ReportHeader title="ملخص المشتريات" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="عدد الفواتير" value={String((d as any)?.count ?? 0)} />
        <SummaryStat label="إجمالي المشتريات" value={money((d as any)?.total)} />
        <SummaryStat label="المدفوع" value={money((d as any)?.totalPaid)} color="text-emerald-600" />
        <SummaryStat label="الآجل (المتبقي)" value={money((d as any)?.totalUnpaid)} color="text-amber-600" />
        <SummaryStat label="إجمالي المرتجعات" value={money((d as any)?.totalReturned)} color="text-rose-600" />
      </div>
      <Table
        headers={["رقم الفاتورة", "التاريخ", "المورد", "الحالة", "الدفع", "الإجمالي", "المدفوع", "المتبقي"]}
        loading={q.isLoading}
        empty={!d || (d.rows as any[]).length === 0}
      >
        {(d?.rows as any[])?.map((r) => (
          <tr key={r.id} className={`text-slate-700 ${r.isReturn ? "bg-rose-50" : ""}`}>
            <td className="py-2 px-3 font-bold">{r.invoiceNumber}</td>
            <td className="py-2 px-3">{formatDate(r.date)}</td>
            <td className="py-2 px-3">{r.supplierName ?? "—"}</td>
            <td className="py-2 px-3">
              {r.isReturn ? (
                <span className="text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full text-xs font-bold">مرتجع</span>
              ) : (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    r.status === "PAID"
                      ? "bg-emerald-100 text-emerald-700"
                      : r.status === "PARTIAL"
                        ? "bg-amber-100 text-amber-700"
                        : r.status === "CONFIRMED"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {translatePurchaseStatus(r.status)}
                </span>
              )}
            </td>
            <td className="py-2 px-3 text-xs">
              {r.paymentMethod ? translatePaymentMethod(r.paymentMethod) : "—"}
            </td>
            <td className="py-2 px-3 font-bold">{money(r.total)}</td>
            <td className="py-2 px-3 text-emerald-600 font-bold">
              {!r.isReturn && Number(r.amountPaid) > 0 ? money(r.amountPaid) : "—"}
            </td>
            <td className="py-2 px-3 text-amber-600 font-bold">
              {!r.isReturn && Number(r.remainingBalance) > 0 ? money(r.remainingBalance) : "—"}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function InventoryReport() {
  const q = useGetInventoryStockReport(undefined, {
    query: { queryKey: getGetInventoryStockReportQueryKey() },
  });
  const d = q.data;
  
  const totalProfit = Number(d?.totalSalesValue ?? 0) - Number(d?.totalPurchaseCost ?? 0);

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, "تقييم_المخزون", "المخزون", [
      { header: "المنتج", key: "productName" },
      { header: "النوع", key: "variantLabel", formatter: (v) => v || "—" },
      { header: "رمز الصنف", key: "sku", formatter: (v) => v || "—" },
      { header: "المخزن", key: "warehouseName", formatter: (v) => v || "—" },
      { header: "الفئة", key: "categoryName", formatter: (v) => v || "—" },
      { header: "الكمية", key: "quantity" },
      { header: "سعر التكلفة", key: "effectiveCost" },
      { header: "سعر البيع", key: "sellingPrice" },
      { header: "إجمالي تكلفة الشراء", key: "totalPurchaseCost" },
      { header: "إجمالي قيمة البيع", key: "totalSalesValue" },
      { header: "الربح", key: "totalSalesValue", formatter: (v, r) => Number(r.totalSalesValue || 0) - Number(r.totalPurchaseCost || 0) },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تقييم المخزون" onExportExcel={handleExport} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="إجمالي الكمية" value={String(d?.totalQuantity ?? 0)} />
        <SummaryStat label="إجمالي تكلفة الشراء" value={money(d?.totalPurchaseCost)} color="text-rose-600" />
        <SummaryStat label="إجمالي قيمة البيع" value={money(d?.totalSalesValue)} color="text-emerald-700" />
        <SummaryStat label="إجمالي الربح" value={money(totalProfit)} color="text-amber-600" />
      </div>
      <Table
        headers={["المنتج", "النوع", "رمز الصنف", "المخزن", "الفئة", "الكمية", "سعر التكلفة", "سعر البيع", "إجمالي تكلفة الشراء", "إجمالي قيمة البيع", "الربح"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => {
          const rowProfit = Number(r.totalSalesValue ?? 0) - Number(r.totalPurchaseCost ?? 0);
          return (
          <tr key={`${r.variantId}-${r.warehouseName}`} className="text-slate-700">
            <td className="py-2 px-3 font-bold">{r.productName}</td>
            <td className="py-2 px-3">{r.variantLabel ?? "—"}</td>
            <td className="py-2 px-3 font-mono text-xs">{r.sku ?? "—"}</td>
            <td className="py-2 px-3">{r.warehouseName ?? "—"}</td>
            <td className="py-2 px-3">{r.categoryName ?? "—"}</td>
            <td className="py-2 px-3">{r.quantity}</td>
            <td className="py-2 px-3 text-slate-600">{money(r.effectiveCost)}</td>
            <td className="py-2 px-3 text-slate-600">{money(r.sellingPrice)}</td>
            <td className="py-2 px-3 font-bold text-rose-600">{money(r.totalPurchaseCost)}</td>
            <td className="py-2 px-3 font-bold text-emerald-700">{money(r.totalSalesValue)}</td>
            <td className="py-2 px-3 font-bold text-amber-600">{money(rowProfit)}</td>
          </tr>
          );
        })}
      </Table>
    </div>
  );
}

function LowStockReport() {
  const q = useGetLowStockReport(undefined, {
    query: { queryKey: getGetLowStockReportQueryKey() },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, "نواقص_المخزون", "النواقص", [
      { header: "المنتج", key: "productName" },
      { header: "النوع", key: "variantLabel", formatter: (v) => v || "—" },
      { header: "رمز الصنف", key: "sku", formatter: (v) => v || "—" },
      { header: "المخزن", key: "warehouseName", formatter: (v) => v || "—" },
      { header: "الكمية الحالية", key: "quantity" },
      { header: "حد الطلب", key: "reorderPoint" },
      { header: "النقص", key: "shortage" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="نواقص المخزون" onExportExcel={handleExport} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="عدد النواقص" value={String(d?.count ?? 0)} />
      </div>
      <Table
        headers={["المنتج", "النوع", "رمز الصنف", "المخزن", "الكمية", "حد الطلب", "النقص"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={`${r.variantId}-${r.warehouseName}`} className="text-slate-700">
            <td className="py-2 px-3 font-bold">{r.productName}</td>
            <td className="py-2 px-3">{r.variantLabel ?? "—"}</td>
            <td className="py-2 px-3 font-mono text-xs">{r.sku ?? "—"}</td>
            <td className="py-2 px-3">{r.warehouseName ?? "—"}</td>
            <td className="py-2 px-3">{r.quantity}</td>
            <td className="py-2 px-3">{r.reorderPoint}</td>
            <td className="py-2 px-3 font-bold text-rose-600">{r.shortage}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function ProfitLossReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const params = { fromDate: from, toDate: to };
  const q = useGetProfitLossReport(params, {
    query: { queryKey: getGetProfitLossReportQueryKey(params) },
  });
  const d = q.data;
  const rows: { label: string; value: number | undefined; strong?: boolean; neg?: boolean }[] = [
    { label: "الإيرادات", value: d?.revenue },
    { label: "مرتجعات المبيعات", value: d?.salesReturns, neg: true },
    { label: "صافي الإيرادات", value: d?.netRevenue, strong: true },
    { label: "تكلفة البضاعة المباعة", value: d?.cogs, neg: true },
    { label: "إجمالي الربح", value: d?.grossProfit, strong: true },
    { label: "المصروفات", value: d?.expenses, neg: true },
    { label: "الرواتب", value: d?.salaries, neg: true },
    { label: "صافي الربح", value: d?.netProfit, strong: true },
  ];

  const handleExport = () => {
    exportToExcel(rows, `الأرباح_والخسائر_${from}_إلى_${to}`, "الأرباح والخسائر", [
      { header: "البند", key: "label" },
      { header: "القيمة (ج.م)", key: "value", formatter: (v, r) => `${r.neg ? "-" : ""}${v ?? 0}` },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تقرير الأرباح والخسائر" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {q.isLoading ? (
        <p className="text-slate-400 text-sm py-8 text-center">جارٍ التحميل...</p>
      ) : (
        <div className="max-w-lg space-y-1">
          {rows.map((r) => (
            <div
              key={r.label}
              className={`flex items-center justify-between px-4 py-3 rounded-lg ${
                r.strong ? "bg-slate-100 font-black" : ""
              }`}
            >
              <span className={r.strong ? "text-slate-800" : "text-slate-600"}>
                {r.label}
              </span>
              <span
                className={
                  r.neg
                    ? "text-rose-600 font-bold"
                    : r.strong
                      ? "text-emerald-700"
                      : "text-slate-800 font-bold"
                }
              >
                {r.neg ? "−" : ""}
                {money(r.value)}
              </span>
            </div>
            ))}
          </div>
        )}
      </div>
    );
  }

const translateRef = (ref: string) => {
  const map: Record<string, string> = {
    SALE: "مبيعات",
    SALES_RETURN: "مرتجع مبيعات",
    SALE_RETURN: "مرتجع مبيعات",
    PURCHASE: "مشتريات",
    PURCHASE_RETURN: "مرتجع مشتريات",
    EXPENSE: "مصروفات",
    EXPENSE_REVERSAL: "إلغاء مصروف",
    CUSTOMER_PAYMENT: "تحصيل من عميل",
    SUPPLIER_PAYMENT: "سداد لمورد",
    SALARY: "رواتب موظفين",
    SALARY_REVERSAL: "إلغاء راتب",
    WITHDRAWAL: "سحب",
    WITHDRAWAL_REVERSAL: "إلغاء سحب",
    DEPOSIT: "إيداع",
    DEPOSIT_REVERSAL: "إلغاء إيداع",
    OPENING: "رصيد افتتاحي",
    ADJUSTMENT: "تسوية يدوية",
    MANUAL: "تسوية يدوية",
    TRANSFER: "تحويل رصيد",
    TRANSFER_IN: "تحويل وارد",
    TRANSFER_OUT: "تحويل صادر",
    DAY_CLOSE_RESET: "إغلاق يوم تشغيلي",
    DAY_CLOSE_VARIANCE: "فارق إغلاق الوردية",
    DAY_OPEN_CARRY: "ترحيل فتح اليوم",
    ADVANCE: "سلفة",
    ADVANCE_REVERSAL: "إلغاء سلفة",
    ASSOCIATION_WITHDRAWAL: "سداد جمعية",
    ASSOCIATION_RETURN: "قبض جمعية",
  };
  return map[ref] || ref;
};

function DailyTransactionsReport() {
  const [date, setDate] = useState(todayStr());
  const [userId, setUserId] = useState<string>("");
  
  const params = { fromDate: date, toDate: date, excludeTransfers: true, ...(userId ? { userId } : {}) };
  const q = useGetTreasuryReport(params, {
    query: { queryKey: getGetTreasuryReportQueryKey(params) },
  });
  const d = q.data;

  const usersQ = useListUsers({ page: 1, pageSize: 100 });

  // Group by Reference Type
  const inGroups: Record<string, number> = {};
  const outGroups: Record<string, number> = {};

  d?.rows.forEach((r) => {
    const amount = Number(r.amount);
    const cat = r.referenceType;
    if (r.direction === "IN") {
      inGroups[cat] = (inGroups[cat] || 0) + amount;
    } else {
      outGroups[cat] = (outGroups[cat] || 0) + amount;
    }
  });

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `معاملات_اليوم_${date}`, "معاملات اليوم", [
      { header: "الوقت", key: "date", formatter: (v) => new Date(v).toLocaleTimeString("ar-EG") },
      { header: "الخزينة", key: "accountName" },
      { header: "الاتجاه", key: "direction", formatter: (v) => (v === "IN" ? "وارد" : "منصرف") },
      { header: "القيمة", key: "amount" },
      { header: "نوع الحركة", key: "referenceType", formatter: (v) => translateRef(v) },
      { header: "ملاحظات", key: "description", formatter: (v: any) => v || "—" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="معاملات اليوم" onExportExcel={handleExport} />
      <div className="mb-6 flex items-end gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التقرير</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-slate-50"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">الموظف (الكاشير)</label>
          <div className="relative min-w-[220px]">
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </span>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full appearance-none border border-slate-200 rounded-xl pr-9 pl-8 py-2.5 text-sm font-medium text-slate-700 bg-white shadow-sm hover:border-amber-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all cursor-pointer"
            >
              <option value="">— الكل —</option>
              {usersQ.data?.items?.map(u => (
                <option key={u.id} value={u.id}>{u.fullName || u.username}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-800 mb-4">
            <TrendingUp size={20} className="text-emerald-600" />
            <h3 className="text-lg font-bold">إجمالي المحصل (الداخل)</h3>
          </div>
          <p className="text-3xl font-bold text-emerald-700 mb-6">{money(d?.totalIn)}</p>
          <div className="space-y-3">
            {Object.entries(inGroups).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center bg-white/60 p-3 rounded-xl">
                <span className="font-bold text-slate-700">{translateRef(k)}</span>
                <span className="font-bold text-emerald-700">{money(v)}</span>
              </div>
            ))}
            {Object.keys(inGroups).length === 0 && <p className="text-sm text-emerald-600/70">لا يوجد حركات محصلة</p>}
          </div>
        </div>

        <div className="bg-rose-50 rounded-2xl p-6 border border-rose-100">
          <div className="flex items-center gap-2 text-rose-800 mb-4">
            <TrendingDown size={20} className="text-rose-600" />
            <h3 className="text-lg font-bold">إجمالي المنصرف (الخارج)</h3>
          </div>
          <p className="text-3xl font-bold text-rose-700 mb-6">{money(d?.totalOut)}</p>
          <div className="space-y-3">
            {Object.entries(outGroups).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center bg-white/60 p-3 rounded-xl">
                <span className="font-bold text-slate-700">{translateRef(k)}</span>
                <span className="font-bold text-rose-700">{money(v)}</span>
              </div>
            ))}
            {Object.keys(outGroups).length === 0 && <p className="text-sm text-rose-600/70">لا يوجد حركات منصرفة</p>}
          </div>
        </div>

        <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 flex flex-col">
          <div className="flex items-center gap-2 text-indigo-800 mb-4">
            <Scale size={20} className="text-indigo-600" />
            <h3 className="text-lg font-bold">الصافي (الداخل - الخارج)</h3>
          </div>
          <p className={`text-3xl font-bold mb-6 ${(d?.totalIn ?? 0) - (d?.totalOut ?? 0) >= 0 ? "text-indigo-700" : "text-rose-700"}`}>
            {money((d?.totalIn ?? 0) - (d?.totalOut ?? 0))}
          </p>
          <div className="mt-auto pt-4 border-t border-indigo-200/50">
            <p className="text-sm text-indigo-600/80">
              يمثل هذا الرقم الفارق بين إجمالي الإيرادات المحصلة وإجمالي المصروفات
            </p>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-800 mb-4">سجل تفاصيل الحركات</h3>
      <Table
        headers={["الوقت", "الخزينة", "الاتجاه", "القيمة", "نوع الحركة", "ملاحظات"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.id} className="text-slate-700">
            <td className="py-2 px-3">{new Date(r.date).toLocaleTimeString("ar-EG")}</td>
            <td className="py-2 px-3 font-bold">{r.accountName}</td>
            <td className="py-2 px-3">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  r.direction === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                {r.direction === "IN" ? "وارد" : "منصرف"}
              </span>
            </td>
            <td className="py-2 px-3 font-bold">{money(r.amount)}</td>
            <td className="py-2 px-3 font-medium">{translateRef(r.referenceType)}</td>
            <td className="py-2 px-3 text-sm text-slate-500 max-w-[200px] truncate" title={(r as any).description || ""}>
              {(r as any).description || "-"}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function TreasuryReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const params = { fromDate: from, toDate: to };
  const q = useGetTreasuryReport(params, {
    query: { queryKey: getGetTreasuryReportQueryKey(params) },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `حركة_الخزينة_${from}_إلى_${to}`, "حركة الخزينة", [
      { header: "التاريخ", key: "date", formatter: (v) => formatDateTime(v) },
      { header: "الحساب", key: "accountName" },
      { header: "الاتجاه", key: "direction", formatter: (v) => (v === "IN" ? "وارد" : "منصرف") },
      { header: "المبلغ", key: "amount" },
      { header: "الرصيد بعد", key: "balanceAfter" },
      { header: "المرجع", key: "referenceType", formatter: (v) => translateRef(v) },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تقرير حركة الخزينة" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="إجمالي الوارد" value={money(d?.totalIn)} />
        <SummaryStat label="إجمالي المنصرف" value={money(d?.totalOut)} />
      </div>
      <Table
        headers={["التاريخ", "الحساب", "الاتجاه", "المبلغ", "الرصيد بعد", "المرجع"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.id} className="text-slate-700">
            <td className="py-2 px-3">{formatDateTime(r.date)}</td>
            <td className="py-2 px-3">{r.accountName}</td>
            <td className="py-2 px-3">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  r.direction === "IN"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {r.direction === "IN" ? "وارد" : "منصرف"}
              </span>
            </td>
            <td className="py-2 px-3 font-bold">{money(r.amount)}</td>
            <td className="py-2 px-3">{money(r.balanceAfter)}</td>
            <td className="py-2 px-3 font-medium text-xs">{translateRef(r.referenceType)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function ExpensesReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());
  const params = { fromDate: from, toDate: to };
  const q = useGetExpenseReport(params, {
    query: { queryKey: getGetExpenseReportQueryKey(params) },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `تقرير_المصروفات_${from}_إلى_${to}`, "المصروفات", [
      { header: "التاريخ", key: "date", formatter: (v) => formatDate(v) },
      { header: "الفئة", key: "categoryName", formatter: (v) => v || "—" },
      { header: "الوصف", key: "description", formatter: (v) => v || "—" },
      { header: "المبلغ", key: "amount" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تقرير المصروفات" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="إجمالي المصروفات" value={money(d?.total)} />
      </div>
      <Table
        headers={["التاريخ", "الفئة", "الوصف", "المبلغ"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.id} className="text-slate-700">
            <td className="py-2 px-3">{formatDate(r.date)}</td>
            <td className="py-2 px-3">{r.categoryName ?? "—"}</td>
            <td className="py-2 px-3">{r.description ?? "—"}</td>
            <td className="py-2 px-3 font-bold">{money(r.amount)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ── New Report: Daily Sales ───────────────────────────────────────────────────

function DailySalesReport() {
  const [from, setFrom] = useState(monthAgoStr());
  const [to, setTo] = useState(todayStr());

  const q = useQuery({
    queryKey: ["/api/reports/daily-sales", from, to],
    queryFn: () =>
      customFetch<{
        rows: { day: string; invoiceCount: number; totalRevenue: number; totalCost: number; totalReturned: number; returnedCost: number; netRevenue: number; netCost: number; avgSale: number }[];
        grandTotal: number;
        grandReturned: number;
        grandNetTotal: number;
        grandCost: number;
        grandProfit: number;
        dayCount: number;
      }>(`/api/reports/daily-sales?fromDate=${from}&toDate=${to}`),
  });

  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `المبيعات_اليومية_${from}_إلى_${to}`, "المبيعات اليومية", [
      { header: "اليوم", key: "day" },
      { header: "عدد الفواتير", key: "invoiceCount" },
      { header: "الإيراد", key: "totalRevenue" },
      { header: "المرتجع", key: "totalReturned" },
      { header: "الصافي", key: "netRevenue" },
      { header: "متوسط الفاتورة", key: "avgSale" },
      { header: "التكلفة", key: "netCost" },
      { header: "الربح", key: "netRevenue", formatter: (v, r) => Number(r.netRevenue) - Number(r.netCost) },
    ]);
  };

  return (
    <div>
      <ReportHeader title="المبيعات اليومية" onExportExcel={handleExport} />
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="عدد الأيام" value={String(d?.dayCount ?? 0)} />
        <SummaryStat label="إجمالي الإيرادات" value={money(d?.grandTotal)} />
        <SummaryStat label="إجمالي المرتجعات" value={money(d?.grandReturned)} color="text-rose-600" />
        <SummaryStat label="صافي المبيعات" value={money(d?.grandNetTotal)} color="text-emerald-700" />
        <SummaryStat label="إجمالي التكلفة" value={money(d?.grandCost)} color="text-slate-600" />
        <SummaryStat label="إجمالي الربح" value={money(d?.grandProfit)} color="text-amber-600" />
      </div>
      <Table
        headers={["اليوم", "عدد الفواتير", "الإيراد", "المرتجع", "الصافي", "متوسط الفاتورة", "التكلفة", "الربح"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => {
          const profit = Number(r.netRevenue) - Number(r.netCost);
          return (
            <tr key={r.day} className="text-slate-700">
              <td className="py-2 px-3 font-bold">{r.day}</td>
              <td className="py-2 px-3">{r.invoiceCount}</td>
              <td className="py-2 px-3 font-bold">{money(r.totalRevenue)}</td>
              <td className="py-2 px-3 text-rose-600 font-bold">{Number(r.totalReturned) > 0 ? money(r.totalReturned) : "—"}</td>
              <td className="py-2 px-3 text-emerald-700 font-bold">{money(r.netRevenue)}</td>
              <td className="py-2 px-3">{money(r.avgSale)}</td>
              <td className="py-2 px-3 text-slate-600">{money(r.netCost)}</td>
              <td className={`py-2 px-3 font-bold ${profit >= 0 ? "text-amber-600" : "text-rose-600"}`}>
                {money(profit)}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

function TreasuryTransfersReport() {
  const [date, setDate] = useState(todayStr());
  
  const params = { fromDate: date, toDate: date, onlyTransfers: true };
  const q = useGetTreasuryReport(params, {
    query: { queryKey: getGetTreasuryReportQueryKey(params) },
  });
  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `تحويل_بين_الخزائن_${date}`, "تحويل بين الخزائن", [
      { header: "الوقت", key: "date", formatter: (v) => new Date(v).toLocaleTimeString("ar-EG") },
      { header: "الخزينة", key: "accountName" },
      { header: "الاتجاه", key: "direction", formatter: (v) => (v === "IN" ? "وارد" : "منصرف") },
      { header: "القيمة", key: "amount" },
      { header: "نوع الحركة", key: "referenceType", formatter: (v) => translateRef(v) },
      { header: "ملاحظات", key: "description", formatter: (v: any) => v || "—" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تحويل بين الخزائن" onExportExcel={handleExport} />
      <div className="mb-6 flex items-end gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">تاريخ التقرير</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-slate-50"
          />
        </div>
      </div>

      <h3 className="text-lg font-bold text-slate-800 mb-4">سجل تفاصيل التحويلات</h3>
      <Table
        headers={["الوقت", "الخزينة", "الاتجاه", "القيمة", "نوع الحركة", "ملاحظات"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.id} className="text-slate-700">
            <td className="p-4">{new Date(r.date).toLocaleTimeString("ar-EG")}</td>
            <td className="p-4">{r.accountName}</td>
            <td className="p-4">
              <span className={`px-2 py-1 rounded-md text-xs font-bold ${r.direction === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {r.direction === "IN" ? "وارد" : "منصرف"}
              </span>
            </td>
            <td className="p-4 font-bold">{money(r.amount)}</td>
            <td className="p-4">{translateRef(r.referenceType)}</td>
            <td className="p-4 text-slate-500 text-sm max-w-[200px] truncate" title={(r as any).description || ""}>
              {(r as any).description || "—"}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ── New Report: Account Statement ─────────────────────────────────────────────

function AccountStatementReport() {
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(yearStartStr());
  const [to, setTo] = useState(todayStr());
  const [expenseCategoryId, setExpenseCategoryId] = useState("");

  const accountsQ = useQuery({
    queryKey: ["/api/reports/accounting-accounts"],
    queryFn: () =>
      customFetch<{
        rows: { id: string; code: string; name: string; type: string; normalBalance: string }[];
      }>("/api/reports/accounting-accounts"),
  });

  const expenseCategoriesQ = useQuery({
    queryKey: ["/api/finance/expense-categories"],
    queryFn: () => customFetch<{ id: string; name: string }[]>("/api/finance/expense-categories"),
  });

  const statementQ = useQuery({
    queryKey: ["/api/reports/account-statement", accountId, from, to, expenseCategoryId],
    queryFn: () =>
      customFetch<{
        account: { id: string; code: string; name: string; type: string; normalBalance: string };
        rows: {
          id: string; entryDate: string; referenceType: string | null;
          referenceId: string | null; description: string | null;
          debit: string; credit: string; runningBalance: number;
          expenseCategoryName: string | null;
        }[];
        totalDebit: number; totalCredit: number; currentBalance: number; count: number;
      }>(`/api/reports/account-statement?accountId=${accountId}&fromDate=${from}&toDate=${to}&expenseCategoryId=${expenseCategoryId}`),
    enabled: !!accountId,
  });

  const d = statementQ.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `كشف_حساب_${d.account.name}`, "كشف حساب", [
      { header: "التاريخ", key: "entryDate", formatter: (v) => formatDateTime(v) },
      { header: "المرجع", key: "referenceType", formatter: (v) => v ? translateRef(v) : "—" },
      { header: "الفئة", key: "expenseCategoryName", formatter: (v) => v || "—" },
      { header: "الوصف", key: "description", formatter: (v) => v || "—" },
      { header: "مدين", key: "debit" },
      { header: "دائن", key: "credit" },
      { header: "الرصيد", key: "runningBalance" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="كشف حساب محاسبي" onExportExcel={d ? handleExport : undefined} />
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">الحساب</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-w-[220px]"
          >
            <option value="">اختر حساباً...</option>
            {accountsQ.data?.rows.map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">فئة المصروف (اختياري)</label>
          <select
            value={expenseCategoryId}
            onChange={(e) => setExpenseCategoryId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-w-[220px]"
          >
            <option value="">كل الفئات</option>
            {expenseCategoriesQ.data?.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      {!accountId && <p className="text-slate-400 text-sm py-8 text-center">يرجى اختيار حساب لعرض الكشف.</p>}
      {accountId && d && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex flex-wrap gap-6">
            <div>
              <p className="text-xs font-bold text-amber-600">الحساب</p>
              <p className="font-black text-slate-800">{d.account.code} — {d.account.name}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-amber-600">نوع الحساب</p>
              <p className="font-bold text-slate-700">{accountTypeLabel(d.account.type)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-5">
            <SummaryStat label="إجمالي المدين" value={money(d.totalDebit)} color="text-rose-600" />
            <SummaryStat label="إجمالي الدائن" value={money(d.totalCredit)} color="text-emerald-700" />
            <SummaryStat label="الرصيد الحالي" value={money(d.currentBalance)} color="text-amber-600" />
            <SummaryStat label="عدد القيود" value={String(d.count)} />
          </div>
          <Table
            headers={["التاريخ", "المرجع", "الفئة", "الوصف", "مدين", "دائن", "الرصيد"]}
            loading={statementQ.isLoading}
            empty={d.rows.length === 0}
          >
            {d.rows.map((r) => (
              <tr key={r.id} className="text-slate-700">
                <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.entryDate)}</td>
                <td className="py-2 px-3 text-xs">{r.referenceType ? translateRef(r.referenceType) : "—"}</td>
                <td className="py-2 px-3 font-bold text-slate-600">{r.expenseCategoryName ?? "—"}</td>
                <td className="py-2 px-3">{r.description ?? "—"}</td>
                <td className="py-2 px-3 text-rose-600 font-bold">{Number(r.debit) > 0 ? money(r.debit) : "—"}</td>
                <td className="py-2 px-3 text-emerald-700 font-bold">{Number(r.credit) > 0 ? money(r.credit) : "—"}</td>
                <td className="py-2 px-3 font-black text-amber-700">{money(r.runningBalance)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
      {accountId && statementQ.isLoading && <p className="text-slate-400 text-sm py-8 text-center">جارٍ التحميل...</p>}
    </div>
  );
}

// ── New Report: Supplier Overview ─────────────────────────────────────────────

function SupplierOverviewReport() {
  const [supplierId, setSupplierId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayStr());

  const suppliersQ = useListSuppliers({ page: 1, pageSize: 100, includeInactive: true });

  const statementQ = useQuery({
    queryKey: ["/api/suppliers", supplierId, "statement"],
    queryFn: () =>
      customFetch<{
        supplier: { id: string; name: string; phone: string; address: string | null; taxNumber: string | null; currentBalance: string };
        items: { id: string; type: string; debit: string; credit: string; balanceAfter: string; referenceType: string | null; referenceId: string | null; description: string | null; createdAt: string; invoiceNumber: string | null }[];
        total: number;
      }>(`/api/suppliers/${supplierId}/statement`),
    enabled: !!supplierId,
  });

  const d = statementQ.data;

  const filteredItems = d?.items.filter((item) => {
    if (from && item.createdAt < from) return false;
    if (to && item.createdAt > to + "T23:59:59") return false;
    return true;
  }) ?? [];

  let totalDebit = 0, totalCredit = 0;
  for (const r of filteredItems) { totalDebit += Number(r.debit ?? 0); totalCredit += Number(r.credit ?? 0); }

  const handleExport = () => {
    if (!d?.supplier) return;
    exportToExcel(filteredItems, `كشف_مورد_${d.supplier.name}`, "كشف مورد", [
      { header: "التاريخ", key: "createdAt", formatter: (v) => formatDateTime(v) },
      { header: "النوع", key: "type", formatter: (v) => txTypeLabel(v) },
      { header: "رقم الفاتورة", key: "invoiceNumber", formatter: (v) => v || "—" },
      { header: "الوصف", key: "description", formatter: (v) => v || "—" },
      { header: "مدين", key: "debit" },
      { header: "دائن", key: "credit" },
      { header: "الرصيد بعد", key: "balanceAfter" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="نظرة عامة على مورد" onExportExcel={d ? handleExport : undefined} />
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">المورد</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
            <option value="">اختر مورداً...</option>
            {suppliersQ.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      {!supplierId && <p className="text-slate-400 text-sm py-8 text-center">يرجى اختيار مورد لعرض البيانات.</p>}
      {supplierId && d && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs font-bold text-amber-600">المورد</p><p className="font-black text-slate-800">{d.supplier.name}</p></div>
            <div><p className="text-xs font-bold text-amber-600">الهاتف</p><p className="font-bold text-slate-700">{d.supplier.phone || "—"}</p></div>
            <div>
              <p className="text-xs font-bold text-amber-600">الرصيد الحالي</p>
              <p className={`font-black text-lg ${Number(d.supplier.currentBalance) > 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(d.supplier.currentBalance)}</p>
            </div>
            <div><p className="text-xs font-bold text-amber-600">العنوان</p><p className="font-bold text-slate-700">{d.supplier.address || "—"}</p></div>
          </div>
          <div className="flex flex-wrap gap-3 mb-5">
            <SummaryStat label="إجمالي المشتريات" value={money(totalDebit)} color="text-rose-600" />
            <SummaryStat label="إجمالي المدفوعات" value={money(totalCredit)} color="text-emerald-700" />
            <SummaryStat label="عدد المعاملات" value={String(filteredItems.length)} />
          </div>
          <Table
            headers={["التاريخ", "النوع", "رقم الفاتورة", "الوصف", "مدين", "دائن", "الرصيد بعد"]}
            loading={statementQ.isLoading}
            empty={filteredItems.length === 0}
          >
            {filteredItems.map((r) => (
              <tr key={r.id} className="text-slate-700">
                <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.type === "PURCHASE" ? "bg-rose-100 text-rose-700" : r.type === "PAYMENT" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {txTypeLabel(r.type)}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-xs">{r.invoiceNumber ?? "—"}</td>
                <td className="py-2 px-3">{r.description ?? "—"}</td>
                <td className="py-2 px-3 text-rose-600 font-bold">{Number(r.debit) > 0 ? money(r.debit) : "—"}</td>
                <td className="py-2 px-3 text-emerald-700 font-bold">{Number(r.credit) > 0 ? money(r.credit) : "—"}</td>
                <td className="py-2 px-3 font-black text-amber-700">{money(r.balanceAfter)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}

// ── New Report: Product Inquiry ───────────────────────────────────────────────

function ProductInquiryReport() {
  const [variantId, setVariantId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayStr());

  // Search products — the API returns a plain array (not {items:[]})
  const productsQ = useSearchProducts(
    { q: search, limit: 30 },
    {
      query: {
        enabled: search.trim().length > 1,
        queryKey: ["/api/products/search", search],
      },
    },
  );

  // Once a product is selected, load its variants
  const productDetailQ = useGetProduct(
    selectedProductId,
    {
      query: {
        enabled: !!selectedProductId,
        queryKey: ["/api/products", selectedProductId, "detail"],
      },
    },
  );

  const inquiryQ = useQuery({
    queryKey: ["/api/reports/product-inquiry", variantId, from, to],
    queryFn: () =>
      customFetch<{
        variant: {
          variantId: string; sku: string; barcode: string; productName: string;
          categoryName: string | null; brandName: string | null; colorName: string | null; sizeName: string | null;
          effectiveSellingPrice: string | null; effectiveCostPrice: string | null; reorderPoint: number | null;
        };
        stockByWarehouse: { warehouseName: string | null; quantity: number }[];
        totalStock: number;
        movements: { id: string; type: string; quantityChange: number; balanceAfter: number; referenceType: string | null; notes: string | null; warehouseName: string | null; createdAt: string }[];
        movementCount: number;
      }>(`/api/reports/product-inquiry?variantId=${variantId}&fromDate=${from}&toDate=${to}`),
    enabled: !!variantId,
  });

  const d = inquiryQ.data;
  const searchResults = productsQ.data ?? [];
  const variants = productDetailQ.data?.variants ?? [];

  function handleProductSelect(productId: string) {
    setSelectedProductId(productId);
    setVariantId(""); // reset variant when product changes
  }

  const handleExport = () => {
    if (!d?.variant || !d.movements) return;
    exportToExcel(d.movements, `حركات_منتج_${d.variant.productName}`, "حركات منتج", [
      { header: "التاريخ", key: "createdAt", formatter: (v) => formatDateTime(v) },
      { header: "نوع الحركة", key: "type", formatter: (v) => movementTypeLabel(v) },
      { header: "المخزن", key: "warehouseName", formatter: (v) => v || "—" },
      { header: "التغيير", key: "quantityChange" },
      { header: "الرصيد بعد", key: "balanceAfter" },
      { header: "ملاحظات", key: "notes", formatter: (v) => v || "—" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="استعلام منتج" onExportExcel={d ? handleExport : undefined} />
      <div className="flex flex-wrap items-end gap-3 mb-5">
        {/* Step 1: Search for a product */}
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-bold text-slate-500 mb-1">بحث عن منتج (الاسم / رمز الصنف / باركود)</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedProductId(""); setVariantId(""); }}
            placeholder="ابحث بالاسم أو الباركود أو رمز الصنف..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {/* Autocomplete dropdown — products matching search */}
        {search.trim().length > 1 && searchResults.length > 0 && !selectedProductId && (
          <div className="w-full">
            <label className="block text-xs font-bold text-slate-500 mb-1">اختر منتجاً</label>
            <div className="border border-slate-200 rounded-lg bg-white shadow-md max-h-52 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { handleProductSelect(p.id); setSearch(p.name); }}
                  className="w-full text-right px-4 py-2 text-sm hover:bg-amber-50 border-b border-slate-100 last:border-0 flex items-center justify-between gap-2"
                >
                  <span className="font-bold text-slate-800">{p.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{p.barcode ?? ""}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {search.trim().length > 1 && productsQ.isLoading && (
          <p className="text-xs text-slate-400">جاري البحث...</p>
        )}
        {/* Step 2: Pick a variant once product is selected */}
        {selectedProductId && variants.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">اختر المتغير (مقاس / لون)</label>
            <select
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-w-[220px]"
            >
              <option value="">اختر...</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.colorName ?? ""}{v.sizeName ? ` / ${v.sizeName}` : ""} — {v.sku}
                </option>
              ))}
            </select>
          </div>
        )}
        {selectedProductId && productDetailQ.isLoading && (
          <p className="text-xs text-slate-400">جاري تحميل المتغيرات...</p>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      {!variantId && <p className="text-slate-400 text-sm py-8 text-center">ابحث عن منتج واختر متغيراً لعرض تفاصيله.</p>}
      {variantId && d && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs font-bold text-amber-600">المنتج</p>
              <p className="font-black text-slate-800">{d.variant.productName}</p>
              {(d.variant.colorName || d.variant.sizeName) && (
                <p className="text-sm text-slate-600">{d.variant.colorName} / {d.variant.sizeName}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-amber-600">رمز الصنف / باركود</p>
              <p className="font-mono text-sm text-slate-700">{d.variant.sku}</p>
              <p className="font-mono text-xs text-slate-500">{d.variant.barcode}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-amber-600">سعر البيع</p>
              <p className="font-black text-emerald-700">{money(d.variant.effectiveSellingPrice)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-amber-600">سعر التكلفة</p>
              <p className="font-black text-slate-700">{money(d.variant.effectiveCostPrice)}</p>
            </div>
          </div>
          <div className="mb-5">
            <h4 className="font-bold text-slate-700 mb-2 text-sm">المخزون الحالي</h4>
            <div className="flex flex-wrap gap-3">
              <SummaryStat label="إجمالي المخزون" value={String(d.totalStock)} />
              {d.stockByWarehouse.map((s, i) => (
                <SummaryStat key={i} label={s.warehouseName ?? "مخزن"} value={String(s.quantity)} />
              ))}
            </div>
          </div>
          <h4 className="font-bold text-slate-700 mb-2 text-sm">تاريخ الحركات ({d.movementCount})</h4>
          <Table
            headers={["التاريخ", "نوع الحركة", "المخزن", "التغيير", "الرصيد بعد", "ملاحظات"]}
            loading={inquiryQ.isLoading}
            empty={d.movements.length === 0}
          >
            {d.movements.map((m) => (
              <tr key={m.id} className="text-slate-700">
                <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.quantityChange > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {movementTypeLabel(m.type)}
                  </span>
                </td>
                <td className="py-2 px-3">{m.warehouseName ?? "—"}</td>
                <td className={`py-2 px-3 font-bold ${m.quantityChange > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  {m.quantityChange > 0 ? "+" : ""}{m.quantityChange}
                </td>
                <td className="py-2 px-3 font-bold">{m.balanceAfter}</td>
                <td className="py-2 px-3 text-xs">{m.notes ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}

// ── New Report: Customer Statement ────────────────────────────────────────────

function CustomerStatementReport() {
  const [customerId, setCustomerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayStr());

  const customersQ = useListCustomers({ page: 1, pageSize: 100, includeInactive: true });

  const statementQ = useQuery({
    queryKey: ["/api/reports/customer-statement", customerId, from, to],
    queryFn: () =>
      customFetch<{
        customer: { id: string; name: string; phone: string; address: string | null; creditLimit: string; currentBalance: string };
        rows: { id: string; type: string; debit: string; credit: string; balanceAfter: string; referenceType: string | null; description: string | null; createdAt: string; invoiceNumber: string | null }[];
        totalDebit: number; totalCredit: number; count: number;
      }>(`/api/reports/customer-statement?customerId=${customerId}&fromDate=${from}&toDate=${to}`),
    enabled: !!customerId,
  });

  const d = statementQ.data;

  const handleExport = () => {
    if (!d?.customer || !d.rows) return;
    exportToExcel(d.rows, `كشف_عميل_${d.customer.name}`, "كشف عميل", [
      { header: "التاريخ", key: "createdAt", formatter: (v) => formatDateTime(v) },
      { header: "النوع", key: "type", formatter: (v) => txTypeLabel(v) },
      { header: "رقم الفاتورة", key: "invoiceNumber", formatter: (v) => v || "—" },
      { header: "الوصف", key: "description", formatter: (v) => v || "—" },
      { header: "مدين", key: "debit" },
      { header: "دائن", key: "credit" },
      { header: "الرصيد بعد", key: "balanceAfter" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="كشف حساب عميل" onExportExcel={d ? handleExport : undefined} />
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">العميل</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
            <option value="">اختر عميلاً...</option>
            {customersQ.data?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      {!customerId && <p className="text-slate-400 text-sm py-8 text-center">يرجى اختيار عميل لعرض الكشف.</p>}
      {customerId && d && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs font-bold text-amber-600">العميل</p><p className="font-black text-slate-800">{d.customer.name}</p></div>
            <div><p className="text-xs font-bold text-amber-600">الهاتف</p><p className="font-bold text-slate-700">{d.customer.phone || "—"}</p></div>
            <div>
              <p className="text-xs font-bold text-amber-600">الرصيد الحالي</p>
              <p className={`font-black text-lg ${Number(d.customer.currentBalance) > 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(d.customer.currentBalance)}</p>
            </div>
            <div><p className="text-xs font-bold text-amber-600">حد الائتمان</p><p className="font-bold text-slate-700">{money(d.customer.creditLimit)}</p></div>
          </div>
          <div className="flex flex-wrap gap-3 mb-5">
            <SummaryStat label="إجمالي الفواتير (مدين)" value={money(d.totalDebit)} color="text-rose-600" />
            <SummaryStat label="إجمالي المدفوعات (دائن)" value={money(d.totalCredit)} color="text-emerald-700" />
            <SummaryStat label="عدد المعاملات" value={String(d.count)} />
          </div>
          <Table
            headers={["التاريخ", "النوع", "رقم الفاتورة", "الوصف", "مدين", "دائن", "الرصيد بعد"]}
            loading={statementQ.isLoading}
            empty={d.rows.length === 0}
          >
            {d.rows.map((r) => (
              <tr key={r.id} className="text-slate-700">
                <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.type === "INVOICE" ? "bg-rose-100 text-rose-700" : r.type === "PAYMENT" ? "bg-emerald-100 text-emerald-700" : r.type === "RETURN" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                    {txTypeLabel(r.type)}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-xs">{r.invoiceNumber ?? "—"}</td>
                <td className="py-2 px-3">{r.description ?? "—"}</td>
                <td className="py-2 px-3 text-rose-600 font-bold">{Number(r.debit) > 0 ? money(r.debit) : "—"}</td>
                <td className="py-2 px-3 text-emerald-700 font-bold">{Number(r.credit) > 0 ? money(r.credit) : "—"}</td>
                <td className="py-2 px-3 font-black text-amber-700">{money(r.balanceAfter)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}

// ── New Report: Salary Summary ────────────────────────────────────────────────

function SalarySummaryReport() {
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState(yearStartStr());
  const [to, setTo] = useState(todayStr());

  const employeesQ = useListEmployees();

  const q = useQuery({
    queryKey: ["/api/reports/salary-summary", employeeId, from, to],
    queryFn: () =>
      customFetch<{
        rows: {
          id: string; employeeName: string; jobTitle: string | null; periodMonth: string;
          payPeriodType: string; baseSalary: string; bonuses: string; advanceDeduction: string;
          otherDeductions: string; netAmount: string; status: string; paidAt: string | null; treasuryName: string | null;
        }[];
        totalNet: number; totalBase: number; totalBonuses: number; totalDeductions: number;
        paidCount: number; pendingCount: number; count: number;
      }>(`/api/reports/salary-summary?employeeId=${employeeId}&fromDate=${from}&toDate=${to}`),
  });

  const d = q.data;
  const periodLabel: Record<string, string> = { MONTHLY: "شهري", WEEKLY: "أسبوعي", DAILY: "يومي" };
  const statusLabel: Record<string, string> = { PAID: "مدفوع", PENDING: "معلق" };

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, `ملخص_الرواتب_${from}_إلى_${to}`, "الرواتب", [
      { header: "الموظف", key: "employeeName" },
      { header: "الوظيفة", key: "jobTitle", formatter: (v) => v || "—" },
      { header: "الفترة", key: "periodMonth" },
      { header: "النوع", key: "payPeriodType", formatter: (v) => periodLabel[v] ?? v },
      { header: "الأساسي", key: "baseSalary" },
      { header: "مكافآت", key: "bonuses" },
      { header: "الخصومات", key: "otherDeductions", formatter: (v, r) => Number(r.advanceDeduction || 0) + Number(v || 0) },
      { header: "الصافي", key: "netAmount" },
      { header: "الحالة", key: "status", formatter: (v) => statusLabel[v] ?? v },
      { header: "تاريخ الدفع", key: "paidAt", formatter: (v) => (v ? formatDate(v) : "—") },
    ]);
  };

  return (
    <div>
      <ReportHeader title="ملخص الرواتب" onExportExcel={handleExport} />
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">الموظف (اختياري)</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm min-w-[220px]">
            <option value="">جميع الموظفين</option>
            {(employeesQ.data ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="إجمالي الصافي" value={money(d?.totalNet)} color="text-amber-600" />
        <SummaryStat label="إجمالي الأساسي" value={money(d?.totalBase)} />
        <SummaryStat label="إجمالي المكافآت" value={money(d?.totalBonuses)} color="text-emerald-700" />
        <SummaryStat label="إجمالي الخصومات" value={money(d?.totalDeductions)} color="text-rose-600" />
        <SummaryStat label="مدفوع" value={String(d?.paidCount ?? 0)} color="text-emerald-700" />
        <SummaryStat label="معلق" value={String(d?.pendingCount ?? 0)} color="text-amber-600" />
      </div>
      <Table
        headers={["الموظف", "الوظيفة", "الفترة", "النوع", "الأساسي", "مكافآت", "خصومات", "الصافي", "الحالة", "تاريخ الدفع"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.id} className="text-slate-700">
            <td className="py-2 px-3 font-bold">{r.employeeName}</td>
            <td className="py-2 px-3 text-xs">{r.jobTitle ?? "—"}</td>
            <td className="py-2 px-3">{r.periodMonth}</td>
            <td className="py-2 px-3 text-xs">{periodLabel[r.payPeriodType] ?? r.payPeriodType}</td>
            <td className="py-2 px-3">{money(r.baseSalary)}</td>
            <td className="py-2 px-3 text-emerald-700">{money(r.bonuses)}</td>
            <td className="py-2 px-3 text-rose-600">{money(Number(r.advanceDeduction) + Number(r.otherDeductions))}</td>
            <td className="py-2 px-3 font-black text-amber-700">{money(r.netAmount)}</td>
            <td className="py-2 px-3">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status === "PAID" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {statusLabel[r.status] ?? r.status}
              </span>
            </td>
            <td className="py-2 px-3 text-xs">{r.paidAt ? formatDate(r.paidAt) : "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// ── New Report: Supplier Aging ────────────────────────────────────────────────

function SupplierAgingReport() {
  const q = useQuery({
    queryKey: ["/api/reports/supplier-aging"],
    queryFn: () =>
      customFetch<{
        rows: { supplierId: string; supplierName: string; phone: string; totalBalance: number; current: number; days30: number; days60: number; days90: number; invoiceCount: number }[];
        totals: { total: number; current: number; days30: number; days60: number; days90: number };
        generatedAt: string;
      }>("/api/reports/supplier-aging"),
  });

  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, "تقادم_مستحقات_الموردين", "تقادم الموردين", [
      { header: "المورد", key: "supplierName" },
      { header: "الهاتف", key: "phone", formatter: (v) => v || "—" },
      { header: "الفواتير", key: "invoiceCount" },
      { header: "الإجمالي", key: "totalBalance" },
      { header: "0-30 يوم", key: "current" },
      { header: "30-60 يوم", key: "days30" },
      { header: "60-90 يوم", key: "days60" },
      { header: "+90 يوم", key: "days90" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تقادم مستحقات الموردين" onExportExcel={handleExport} />
      {d?.generatedAt && <p className="text-xs text-slate-400 mb-4">تاريخ التقرير: {formatDateTime(d.generatedAt)}</p>}
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="إجمالي المستحقات" value={money(d?.totals.total)} color="text-rose-600" />
        <SummaryStat label="حالي (0-30 يوم)" value={money(d?.totals.current)} color="text-emerald-700" />
        <SummaryStat label="30-60 يوم" value={money(d?.totals.days30)} color="text-amber-600" />
        <SummaryStat label="60-90 يوم" value={money(d?.totals.days60)} color="text-orange-600" />
        <SummaryStat label="+90 يوم" value={money(d?.totals.days90)} color="text-rose-600" />
      </div>
      <Table
        headers={["المورد", "الهاتف", "الفواتير", "الإجمالي", "0-30 يوم", "30-60 يوم", "60-90 يوم", "+90 يوم"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.supplierId} className="text-slate-700">
            <td className="py-2 px-3 font-bold">{r.supplierName}</td>
            <td className="py-2 px-3 text-xs">{r.phone}</td>
            <td className="py-2 px-3">{r.invoiceCount}</td>
            <td className="py-2 px-3 font-black text-rose-600">{money(r.totalBalance)}</td>
            <td className="py-2 px-3 text-emerald-700">{money(r.current)}</td>
            <td className="py-2 px-3 text-amber-600">{money(r.days30)}</td>
            <td className="py-2 px-3 text-orange-600">{money(r.days60)}</td>
            <td className="py-2 px-3 text-rose-600 font-bold">{money(r.days90)}</td>
          </tr>
        ))}
        {d && d.rows.length > 0 && (
          <tr className="bg-slate-100 font-black text-slate-800 border-t-2 border-slate-300">
            <td className="py-2 px-3" colSpan={3}>الإجمالي</td>
            <td className="py-2 px-3 text-rose-700">{money(d.totals.total)}</td>
            <td className="py-2 px-3 text-emerald-700">{money(d.totals.current)}</td>
            <td className="py-2 px-3 text-amber-600">{money(d.totals.days30)}</td>
            <td className="py-2 px-3 text-orange-600">{money(d.totals.days60)}</td>
            <td className="py-2 px-3 text-rose-600">{money(d.totals.days90)}</td>
          </tr>
        )}
      </Table>
    </div>
  );
}

// ── New Report: Customer Aging ─────────────────────────────────────────────────

function CustomerAgingReport() {
  const q = useQuery({
    queryKey: ["/api/reports/customer-aging"],
    queryFn: () =>
      customFetch<{
        rows: {
          customerId: string;
          customerName: string;
          phone: string;
          creditLimit: number;
          totalBalance: number;
          current: number;
          days30: number;
          days60: number;
          days90: number;
          invoiceCount: number;
        }[];
        totals: { total: number; current: number; days30: number; days60: number; days90: number };
        generatedAt: string;
      }>("/api/reports/customer-aging"),
  });

  const d = q.data;

  const handleExport = () => {
    if (!d?.rows) return;
    exportToExcel(d.rows, "تقادم_مستحقات_العملاء", "تقادم العملاء", [
      { header: "العميل", key: "customerName" },
      { header: "الهاتف", key: "phone", formatter: (v) => v || "—" },
      { header: "الفواتير", key: "invoiceCount" },
      { header: "الإجمالي", key: "totalBalance" },
      { header: "0-30 يوم", key: "current" },
      { header: "30-60 يوم", key: "days30" },
      { header: "60-90 يوم", key: "days60" },
      { header: "+90 يوم", key: "days90" },
    ]);
  };

  return (
    <div>
      <ReportHeader title="تقادم مستحقات العملاء" onExportExcel={handleExport} />
      <p className="text-xs text-slate-500 mb-4">
        يعرض هذا التقرير جميع العملاء الذين لديهم أرصدة مستحقة (آجل)، مقسّمة حسب عمر الدين.
        {d?.generatedAt && ` • تاريخ التقرير: ${formatDateTime(d.generatedAt)}`}
      </p>
      <div className="flex flex-wrap gap-3 mb-5">
        <SummaryStat label="إجمالي مستحقات العملاء" value={money(d?.totals.total)} color="text-rose-600" />
        <SummaryStat label="حالي (0-30 يوم)" value={money(d?.totals.current)} color="text-emerald-700" />
        <SummaryStat label="30-60 يوم" value={money(d?.totals.days30)} color="text-amber-600" />
        <SummaryStat label="60-90 يوم" value={money(d?.totals.days60)} color="text-orange-600" />
        <SummaryStat label="+90 يوم" value={money(d?.totals.days90)} color="text-rose-600" />
      </div>
      <Table
        headers={["العميل", "الهاتف", "الفواتير", "الإجمالي", "0-30 يوم", "30-60 يوم", "60-90 يوم", "+90 يوم"]}
        loading={q.isLoading}
        empty={!d || d.rows.length === 0}
      >
        {d?.rows.map((r) => (
          <tr key={r.customerId} className="text-slate-700">
            <td className="py-2 px-3 font-bold">{r.customerName}</td>
            <td className="py-2 px-3 text-xs">{r.phone || "—"}</td>
            <td className="py-2 px-3">{r.invoiceCount}</td>
            <td className="py-2 px-3 font-black text-rose-600">{money(r.totalBalance)}</td>
            <td className="py-2 px-3 text-emerald-700">{r.current > 0 ? money(r.current) : "—"}</td>
            <td className="py-2 px-3 text-amber-600">{r.days30 > 0 ? money(r.days30) : "—"}</td>
            <td className="py-2 px-3 text-orange-600">{r.days60 > 0 ? money(r.days60) : "—"}</td>
            <td className="py-2 px-3 text-rose-600 font-bold">{r.days90 > 0 ? money(r.days90) : "—"}</td>
          </tr>
        ))}
        {d && d.rows.length > 0 && (
          <tr className="bg-slate-100 font-black text-slate-800 border-t-2 border-slate-300">
            <td className="py-2 px-3" colSpan={3}>الإجمالي</td>
            <td className="py-2 px-3 text-rose-700">{money(d.totals.total)}</td>
            <td className="py-2 px-3 text-emerald-700">{money(d.totals.current)}</td>
            <td className="py-2 px-3 text-amber-600">{money(d.totals.days30)}</td>
            <td className="py-2 px-3 text-orange-600">{money(d.totals.days60)}</td>
            <td className="py-2 px-3 text-rose-600">{money(d.totals.days90)}</td>
          </tr>
        )}
      </Table>
      {d && d.rows.length === 0 && !q.isLoading && (
        <div className="text-center py-10">
          <p className="text-slate-400 text-sm">لا يوجد عملاء بأرصدة مستحقة حالياً.</p>
          <p className="text-slate-300 text-xs mt-1">جميع الفواتير مسددة بالكامل ✓</p>
        </div>
      )}
    </div>
  );
}
