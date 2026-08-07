import { useState, useRef, useEffect, useMemo } from "react";
import {
  Wallet,
  Loader2,
  PlayCircle,
  StopCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CreditCard,
  Smartphone,
  ArrowRightLeft,
  Settings2,
  Calendar,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  TrendingUp,
  Search,
  X,
  Filter,
} from "lucide-react";
import {
  useListTreasuryAccounts,
  useListTreasuryTransactions,
  ApiError,
  customFetch,
  type TreasuryAccount,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { type TreasuryAccountWithOwner } from "@/components/treasury-select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OperationalDay {
  id: string;
  userId: string;
  userName: string | null;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  openingCashBalance: string;
  carryOverCash: string;
  actualClosingCashBalance: string | null;
  expectedClosingCashBalance: string | null;
  cashVariance: string | null;
  totalTransferredToMainSafe: string;
  cashVarianceReason: string | null;
  cashVarianceNotes: string | null;
  notes: string | null;
}

interface OperationalDayListResponse {
  items: OperationalDay[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Custom hooks for /api/operating-days
// ---------------------------------------------------------------------------

const OP_DAYS_KEY = "/api/operating-days";
const OP_DAYS_CURRENT_KEY = "/api/operating-days/current";

function useCurrentOperationalDay() {
  return useQuery<{ operationalDay: OperationalDay | null; expectedCashBalance: string | null }>({
    queryKey: [OP_DAYS_CURRENT_KEY],
    queryFn: () =>
      customFetch<{ operationalDay: OperationalDay | null; expectedCashBalance: string | null }>(
        "/api/operating-days/current",
      ),
    refetchInterval: 60_000,
  });
}

function useListOperationalDays(page = 1, pageSize = 20) {
  return useQuery<OperationalDayListResponse>({
    queryKey: [OP_DAYS_KEY, { page, pageSize }],
    queryFn: () =>
      customFetch<OperationalDayListResponse>(
        `/api/operating-days?page=${page}&pageSize=${pageSize}`,
      ),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

function money(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return n.toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseArabicNumber(val: string | number): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const normalized = val
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[٫]/g, ".");
  return Number(normalized);
}

function toArabicNumerals(val: string): string {
  const arabicNumbers = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return val.replace(/[0-9]/g, (d) => arabicNumbers[Number(d)]);
}

/**
 * Build a rich, context-aware label for treasury accounts inside the
 * TransferModal selects. Mirrors the logic in the shared TreasurySelect.
 * Format: "اسم الحساب · اسم المالك · الرصيد"
 */
function transferOptionLabel(account: TreasuryAccountWithOwner): string {
  const parts: string[] = [account.name];
  if (account.userName) parts.push(account.userName);
  parts.push(`رصيد: ${money(account.balance)}`);
  return parts.join(" · ");
}

/** Group accounts by owner for <optgroup> rendering in TransferModal. */
function groupByOwner(
  accounts: TreasuryAccountWithOwner[],
): { mainSafe: TreasuryAccountWithOwner[]; ownerGroups: [string, TreasuryAccountWithOwner[]][] } {
  const TYPE_ORDER: Record<string, number> = {
    MAIN_SAFE: 0, CASH: 1, CARD: 2, INSTAPAY: 3, WALLET: 4,
  };
  const mainSafe = accounts
    .filter((a) => a.type === "MAIN_SAFE")
    .sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
  const drawers = accounts.filter((a) => a.type !== "MAIN_SAFE");
  const hasOwners = drawers.some((a) => Boolean(a.userName));
  if (!hasOwners) return { mainSafe, ownerGroups: [] };
  const map = new Map<string, TreasuryAccountWithOwner[]>();
  for (const a of drawers) {
    const key = a.userName ?? "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  for (const g of map.values()) {
    g.sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
  }
  const ownerGroups = [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "ar"));
  return { mainSafe, ownerGroups };
}

const ACCOUNT_ICONS: Record<string, React.ReactNode> = {
  CASH: <Banknote size={20} />,
  CARD: <CreditCard size={20} />,
  INSTAPAY: <Smartphone size={20} />,
  WALLET: <Wallet size={20} />,
  MAIN_SAFE: <ShieldCheck size={22} />,
};

// Color theme per account type for the card backgrounds and accents
const ACCOUNT_THEME: Record<
  string,
  { bg: string; iconBg: string; iconColor: string; badge: string; label: string }
> = {
  CASH: {
    bg: "bg-white",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
    label: "نقدي",
  },
  CARD: {
    bg: "bg-white",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    label: "بطاقة",
  },
  INSTAPAY: {
    bg: "bg-white",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    badge: "bg-violet-100 text-violet-700",
    label: "انستاباي",
  },
  WALLET: {
    bg: "bg-white",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
    label: "محفظة",
  },
  MAIN_SAFE: {
    bg: "bg-white",
    iconBg: "bg-slate-800",
    iconColor: "text-amber-400",
    badge: "bg-slate-100 text-slate-700",
    label: "خزينة رئيسية",
  },
};

const REF_TYPE_LABELS: Record<string, string> = {
  SALE: "بيع",
  SALES_RETURN: "مرتجع بيع",
  PURCHASE: "شراء",
  PURCHASE_RETURN: "مرتجع شراء",
  EXPENSE: "مصروف",
  SALARY: "راتب",
  WITHDRAWAL: "سحب",
  DEPOSIT: "إيداع",
  CUSTOMER_PAYMENT: "تحصيل عميل",
  SUPPLIER_PAYMENT: "سداد مورد",
  OPENING: "افتتاحي",
  TRANSFER: "تحويل رصيد",
  ADJUSTMENT: "تسوية حساب",
  DAY_CLOSE_RESET: "تحويل إغلاق يوم تشغيلي",
  DAY_CLOSE_VARIANCE: "⚠️ فارق إغلاق الوردية",
  DAY_OPEN_VARIANCE: "⚠️ فارق فتح الوردية",
  DAY_OPEN_CARRY: "ترحيل فتح اليوم",
};

const VARIANCE_REASON_LABELS: Record<string, string> = {
  CASH_SHORTAGE:         "عجز نقدي",
  CASH_OVERAGE:          "زيادة نقدية",
  COUNTING_ERROR:        "خطأ في العد",
  THEFT_OR_LOSS:         "سرقة أو ضياع",
  PENDING_INVESTIGATION: "قيد التحقيق",
  OTHER:                 "أخرى",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function TreasuryPage() {
  const { hasPermission, user } = useAuth();
  const canSession = hasPermission("treasury.session");
  const canViewAll = hasPermission("treasury.view_all");
  const canTransfer = hasPermission("treasury.transfer");

  const accountsQuery = useListTreasuryAccounts();
  const txQuery = useListTreasuryTransactions({ page: 1, pageSize: 50 });
  const currentDayQuery = useCurrentOperationalDay();
  const daysQuery = useListOperationalDays(1, 20);

  const [showOpenDay, setShowOpenDay] = useState(false);
  const [showCloseDay, setShowCloseDay] = useState(false);
  const [adjustmentAccount, setAdjustmentAccount] =
    useState<TreasuryAccount | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const accounts = (accountsQuery.data ?? []) as TreasuryAccountWithOwner[];
  const transactions = txQuery.data?.items ?? [];
  const currentDay = currentDayQuery.data?.operationalDay ?? null;
  const expectedCashBalance = currentDayQuery.data?.expectedCashBalance ?? null;
  const days = daysQuery.data?.items ?? [];

  // ── Filter state ──────────────────────────────────────────────────────────
  const [selectedOwnerName, setSelectedOwnerName] = useState<string | null>(
    null,
  );

  // Reset filter whenever accounts list changes (e.g. after open/close day)
  useEffect(() => {
    setSelectedOwnerName(null);
  }, [accounts.length]);

  const cashierCashAccount = accounts.find((a) => a.type === "CASH" && (a as any).userId === user?.id);
  const defaultOpeningBalance = cashierCashAccount ? String(cashierCashAccount.balance) : "0";

  // Split accounts: MAIN_SAFE goes first as the hero card
  const mainSafe = accounts.find((a) => a.type === "MAIN_SAFE") ?? null;
  const allDrawerAccounts = accounts.filter((a) => a.type !== "MAIN_SAFE");

  // Build sorted unique owner list from all accounts
  const uniqueOwners = useMemo(() => {
    const names = accounts
      .map((a) => a.userName)
      .filter((n): n is string => Boolean(n));
    return [...new Set(names)];
  }, [accounts]);

  // Apply owner filter across all accounts
  const ownerOf = (a: TreasuryAccountWithOwner) => a.userName;
  const showMainSafe =
    !selectedOwnerName ||
    ownerOf(mainSafe ?? ({} as TreasuryAccountWithOwner)) === selectedOwnerName;
  const drawerAccounts = selectedOwnerName
    ? allDrawerAccounts.filter((a) => ownerOf(a) === selectedOwnerName)
    : allDrawerAccounts;

  // Filter transactions to selected owner
  const filteredTransactions = useMemo(
    () =>
      selectedOwnerName
        ? transactions.filter((t) => t.userName === selectedOwnerName)
        : transactions,
    [transactions, selectedOwnerName],
  );

  // Total balance across all accounts (always from full list)
  const totalBalance = accounts.reduce(
    (sum, a) => sum + Number(a.balance ?? 0),
    0,
  );

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* ── Page header + action buttons ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <PageHeader
            title="الخزينة"
            subtitle="أرصدة الخزائن واليومي التشغيلي والحركات المالية"
            icon={<Wallet size={24} />}
          />
          <div className="flex gap-2 flex-wrap pt-1">
            {canTransfer && accounts.length > 1 && (
              <button
                onClick={() => setShowTransfer(true)}
                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 text-sm shadow-sm"
              >
                <ArrowRightLeft size={16} />
                تحويل رصيد
              </button>
            )}
            {canSession && !currentDay && (
              <button
                onClick={() => setShowOpenDay(true)}
                className="px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-all flex items-center gap-2 shadow-sm shadow-amber-200"
                data-testid="button-open-day"
              >
                <PlayCircle size={18} />
                فتح يوم تشغيلي
              </button>
            )}
            {canSession && currentDay && (
              <button
                onClick={() => setShowCloseDay(true)}
                className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all flex items-center gap-2 shadow-sm shadow-red-200"
                data-testid="button-close-day"
              >
                <StopCircle size={18} />
                إغلاق اليوم التشغيلي
              </button>
            )}
          </div>
        </div>

        {/* ── Operational day banner ── */}
        {canSession && (
          <CurrentDayBanner
            day={currentDay}
            isLoading={currentDayQuery.isLoading}
          />
        )}

        {/* ── Filter toolbar ── */}
        {!accountsQuery.isLoading && accounts.length > 0 && uniqueOwners.length > 0 && (
          <TreasuryFilterBar
            owners={uniqueOwners}
            selectedOwnerName={selectedOwnerName}
            onSelect={setSelectedOwnerName}
          />
        )}

        {/* ── Account cards ── */}
        {accountsQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">جارٍ تحميل الخزائن...</p>
            </div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <Wallet size={28} />
            </div>
            <p className="font-bold text-slate-700 mb-1">لا توجد خزائن</p>
            <p className="text-slate-400 text-sm">
              افتح يوماً تشغيلياً أولاً لتفعيل الخزائن.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Main Safe Hero Card ── */}
            {mainSafe && showMainSafe && (
              <MainSafeHeroCard
                account={mainSafe}
                totalBalance={totalBalance}
                drawerCount={allDrawerAccounts.length}
              />
            )}

            {/* ── Drawer Accounts Grid ── */}
            {drawerAccounts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                    حسابات الخزائن
                  </h3>
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400 font-medium">
                    {drawerAccounts.length} خزينة
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {drawerAccounts.map((a) => (
                    <TreasuryAccountCard
                      key={a.id}
                      account={a}
                      canAdjust={canSession}
                      onAdjust={() => setAdjustmentAccount(a)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── No results after filter ── */}
            {selectedOwnerName &&
              !showMainSafe &&
              drawerAccounts.length === 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Filter size={22} />
                  </div>
                  <p className="font-bold text-slate-600 mb-1">لا توجد نتائج</p>
                  <p className="text-slate-400 text-sm">لا توجد خزائن مسجلة لـ «{selectedOwnerName}».</p>
                </div>
              )}
          </div>
        )}

        {/* ── Transactions + Operational Days ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transactions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <TrendingUp size={16} className="text-amber-500" />
              <h2 className="font-bold text-slate-800">آخر الحركات</h2>
            </div>
            <div className="max-h-[28rem] overflow-auto">
              {txQuery.isLoading ? (
                <p className="text-slate-400 text-center py-12">
                  جارٍ التحميل...
                </p>
              ) : transactions.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-right font-bold px-4 py-3">الخزينة</th>
                      <th className="text-right font-bold px-4 py-3">النوع</th>
                      <th className="text-right font-bold px-4 py-3">المبلغ</th>
                      <th className="text-right font-bold px-4 py-3">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.map((t) => (
                      <tr
                        key={t.id}
                        className="hover:bg-slate-50 transition-colors"
                        data-testid={`row-treasury-tx-${t.id}`}
                      >
                        <td className="px-4 py-3 text-slate-600 font-medium">
                          {t.accountName}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-slate-600">
                            {t.direction === "IN" ? (
                              <ArrowDownCircle
                                size={15}
                                className="text-emerald-500"
                              />
                            ) : (
                              <ArrowUpCircle
                                size={15}
                                className="text-red-500"
                              />
                            )}
                            {REF_TYPE_LABELS[t.referenceType] ??
                              t.referenceType}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 font-bold tabular-nums ${
                            t.direction === "IN"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {t.direction === "IN" ? "+" : "−"}
                          {money(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums">
                          {money(t.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-400 text-center py-12">
                  {selectedOwnerName
                    ? `لا توجد حركات لـ «${selectedOwnerName}».`
                    : "لا توجد حركات."}
                </p>
              )}
            </div>
          </div>

          {/* Operational days history */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h2 className="font-bold text-slate-800 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Calendar size={16} className="text-amber-500" />
              {canViewAll ? "سجل الأيام التشغيلية" : "أيامي التشغيلية"}
            </h2>
            <div className="max-h-[28rem] overflow-auto">
              {daysQuery.isLoading ? (
                <p className="text-slate-400 text-center py-12">
                  جارٍ التحميل...
                </p>
              ) : days.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {days.map((d) => (
                    <OperationalDayRow
                      key={d.id}
                      day={d}
                      showUser={canViewAll}
                      expanded={expandedDayId === d.id}
                      onToggle={() =>
                        setExpandedDayId(
                          expandedDayId === d.id ? null : d.id,
                        )
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-12">
                  لا توجد أيام تشغيلية.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showOpenDay && (
        <OpenDayModal 
          defaultBalance={defaultOpeningBalance}
          onClose={() => setShowOpenDay(false)} 
        />
      )}
      {showCloseDay && currentDay && (
        <CloseDayModal
          day={currentDay}
          expectedCashBalance={expectedCashBalance}
          onClose={() => setShowCloseDay(false)}
        />
      )}
      {showTransfer && (
        <TransferModal
          accounts={accounts}
          onClose={() => setShowTransfer(false)}
        />
      )}
      {adjustmentAccount && (
        <AdjustmentModal
          account={adjustmentAccount}
          onClose={() => setAdjustmentAccount(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Treasury Filter Bar — filters by account owner (person)
// ---------------------------------------------------------------------------

interface TreasuryFilterBarProps {
  owners: string[];
  selectedOwnerName: string | null;
  onSelect: (ownerName: string | null) => void;
}

function TreasuryFilterBar({
  owners,
  selectedOwnerName,
  onSelect,
}: TreasuryFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Auto-focus search when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const filteredOwners = owners.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );

  function handleSelect(name: string | null) {
    onSelect(name);
    setOpen(false);
    setSearch("");
  }

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter label */}
        <div className="flex items-center gap-2 text-slate-500 shrink-0">
          <Filter size={15} />
          <span className="text-sm font-bold">تصفية بالمالك</span>
        </div>

        {/* Dropdown trigger + panel wrapper */}
        <div className="flex-1 min-w-52 relative">
          {/* Trigger button */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              selectedOwnerName
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
            }`}
            data-testid="treasury-filter-trigger"
          >
            <span className="flex items-center gap-2 min-w-0">
              {/* Person avatar bubble */}
              {selectedOwnerName ? (
                <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center text-xs font-black shrink-0 select-none">
                  {selectedOwnerName.charAt(0)}
                </span>
              ) : (
                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                  <Search size={12} />
                </span>
              )}
              <span className="truncate">
                {selectedOwnerName ?? "جميع الأشخاص"}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {selectedOwnerName && (
                <span
                  role="button"
                  className="w-5 h-5 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center hover:bg-amber-300 transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(null);
                  }}
                  title="مسح التصفية"
                >
                  <X size={11} />
                </span>
              )}
              <ChevronDown
                size={15}
                className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              />
            </span>
          </button>

          {/* Dropdown panel */}
          {open && (
            <div className="absolute top-full mt-2 w-full min-w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
              {/* Search input */}
              <div className="px-3 pt-3 pb-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث عن شخص..."
                    className="w-full pr-9 pl-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition"
                    data-testid="treasury-filter-search"
                  />
                </div>
              </div>

              {/* Options list */}
              <div className="max-h-64 overflow-y-auto pb-2">
                {/* "All" option */}
                <button
                  type="button"
                  onClick={() => handleSelect(null)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-right ${
                    !selectedOwnerName
                      ? "bg-amber-50 text-amber-800 font-bold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                  data-testid="treasury-filter-option-all"
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      !selectedOwnerName
                        ? "bg-amber-400 text-slate-900"
                        : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    ✦
                  </span>
                  <span className="flex-1">جميع الأشخاص</span>
                  <span className="text-xs text-slate-400 tabular-nums bg-slate-100 px-2 py-0.5 rounded-full">
                    {owners.length}
                  </span>
                </button>

                {/* Divider */}
                {filteredOwners.length > 0 && (
                  <div className="mx-3 my-1 h-px bg-slate-100" />
                )}

                {/* Owner options */}
                {filteredOwners.length > 0 ? (
                  filteredOwners.map((name) => {
                    const isSelected = selectedOwnerName === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleSelect(name)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-right ${
                          isSelected
                            ? "bg-amber-50 text-amber-800 font-bold"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                        data-testid={`treasury-filter-option-${name}`}
                      >
                        {/* Avatar with first letter */}
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 select-none ${
                            isSelected
                              ? "bg-amber-400 text-slate-900"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {name.charAt(0)}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{name}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-slate-400 text-sm text-center py-6">
                    لا توجد نتائج
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Active filter chip */}
        {selectedOwnerName && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-slate-400">تصفية نشطة:</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
              <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center text-[10px] font-black">
                {selectedOwnerName.charAt(0)}
              </span>
              {selectedOwnerName}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="opacity-60 hover:opacity-100 transition-opacity"
                title="مسح التصفية"
              >
                <X size={11} />
              </button>
            </span>
          </div>
        )}

        {/* Result count hint */}
        {selectedOwnerName && (
          <span className="text-xs text-slate-400 mr-auto">
            عرض خزائن «{selectedOwnerName}»
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Safe Hero Card
// ---------------------------------------------------------------------------

function MainSafeHeroCard({
  account,
  totalBalance,
  drawerCount,
}: {
  account: TreasuryAccount;
  totalBalance: number;
  drawerCount: number;
}) {
  const bal = Number(account.balance ?? 0);
  const isPositive = bal >= 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-slate-900 text-white p-6 shadow-lg"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a5f 100%)",
      }}
      data-testid={`card-treasury-${account.type}`}
    >
      {/* Decorative orb */}
      <div
        className="absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)",
        }}
      />

      <div className="relative flex items-start justify-between gap-4">
        {/* Left: icon + labels */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500 bg-opacity-20 border border-amber-400 border-opacity-30 flex items-center justify-center shrink-0">
            <ShieldCheck size={26} className="text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold bg-amber-500 bg-opacity-20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-400 border-opacity-20">
                خزينة رئيسية
              </span>
            </div>
            <h3 className="text-lg font-bold text-white leading-tight">
              {account.name}
            </h3>
            {(account as any).userName && (
              <p className="text-slate-400 text-xs mt-0.5">
                {(account as any).userName}
              </p>
            )}
          </div>
        </div>

        {/* Right: balance */}
        <div className="text-left shrink-0">
          <p className="text-slate-400 text-xs mb-1">الرصيد الحالي</p>
          <p
            className={`text-3xl font-black tabular-nums tracking-tight ${
              isPositive ? "text-white" : "text-red-400"
            }`}
          >
            {money(account.balance)}
          </p>
          <p className="text-slate-400 text-xs mt-1 text-left">ج.م</p>
        </div>
      </div>

      {/* Bottom stats row */}
      {drawerCount > 0 && (
        <div className="relative mt-5 pt-4 border-t border-white border-opacity-10 flex items-center gap-6 text-sm">
          <div>
            <p className="text-slate-400 text-xs">إجمالي كل الخزائن</p>
            <p className="font-bold text-amber-300 tabular-nums">
              {money(totalBalance)} ج.م
            </p>
          </div>
          <div className="w-px h-8 bg-white bg-opacity-10" />
          <div>
            <p className="text-slate-400 text-xs">عدد الخزائن المرتبطة</p>
            <p className="font-bold text-white">{drawerCount} خزينة</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drawer Account Card
// ---------------------------------------------------------------------------

function TreasuryAccountCard({
  account,
  canAdjust,
  onAdjust,
}: {
  account: TreasuryAccount;
  canAdjust: boolean;
  onAdjust: () => void;
}) {
  const theme =
    ACCOUNT_THEME[account.type] ?? ACCOUNT_THEME["WALLET"];
  const bal = Number(account.balance ?? 0);
  const isNegative = bal < 0;

  return (
    <div
      className={`group relative ${theme.bg} rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200`}
      data-testid={`card-treasury-${account.type}`}
    >
      {/* Top row: icon + type badge + adjust btn */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl ${theme.iconBg} ${theme.iconColor} flex items-center justify-center shrink-0`}
          >
            {ACCOUNT_ICONS[account.type] ?? <Wallet size={20} />}
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-md ${theme.badge}`}
          >
            {theme.label}
          </span>
        </div>
        {canAdjust && (
          <button
            onClick={onAdjust}
            className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all"
            title="تسوية الرصيد"
          >
            <Settings2 size={14} />
          </button>
        )}
      </div>

      {/* Account name + user */}
      <div className="mb-3">
        <p className="font-bold text-slate-800 text-sm leading-snug">
          {account.name}
        </p>
        {(account as any).userName && (
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
            {(account as any).userName}
          </p>
        )}
      </div>

      {/* Balance — the hero number */}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-400 mb-0.5">الرصيد</p>
        <p
          className={`text-2xl font-black tabular-nums tracking-tight ${
            isNegative ? "text-red-600" : "text-slate-800"
          }`}
        >
          {money(account.balance)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">ج.م</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Current day banner
// ---------------------------------------------------------------------------

function CurrentDayBanner({
  day,
  isLoading,
}: {
  day: OperationalDay | null;
  isLoading: boolean;
}) {
  if (isLoading) return null;

  if (!day) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3 text-sm">
        <XCircle size={20} className="text-amber-500 shrink-0" />
        <div>
          <p className="font-bold text-amber-800">لا يوجد يوم تشغيلي مفتوح</p>
          <p className="text-amber-600 text-xs mt-0.5">
            افتح يوماً تشغيلياً لتفعيل الخزينة وتسجيل الحركات النقدية.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3 text-sm">
      <CheckCircle2 size={20} className="text-green-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-green-800">يوم تشغيلي مفتوح</p>
        <p className="text-green-600 text-xs mt-0.5">
          مفتوح منذ: {formatDate(day.openedAt)} — رصيد افتتاحي:{" "}
          {money(day.openingCashBalance)} ج.م
        </p>
      </div>
      <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full shrink-0">
        مفتوح
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operational day row (collapsible)
// ---------------------------------------------------------------------------

function OperationalDayRow({
  day,
  showUser,
  expanded,
  onToggle,
}: {
  day: OperationalDay;
  showUser: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isOpen = day.status === "OPEN";
  return (
    <div>
      <button
        className="w-full text-right px-4 py-3 hover:bg-slate-50 transition flex items-center gap-3"
        onClick={onToggle}
        data-testid={`row-opday-${day.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                isOpen
                  ? "text-green-700 bg-green-100"
                  : "text-slate-500 bg-slate-100"
              }`}
            >
              {isOpen ? "مفتوح" : "مغلق"}
            </span>
            {showUser && day.userName && (
              <span className="text-xs text-slate-500">{day.userName}</span>
            )}
            <span className="text-xs text-slate-400">
              {formatDate(day.openedAt)}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm">
            <span className="text-slate-600">
              ترحيل: {money(day.totalTransferredToMainSafe)} ج.م
            </span>
            {day.cashVariance != null && (
              <span
                className={
                  Number(day.cashVariance) === 0
                    ? "text-slate-500"
                    : Number(day.cashVariance) > 0
                      ? "text-green-600 font-bold"
                      : "text-red-600 font-bold"
                }
              >
                فارق: {money(day.cashVariance)} ج.م
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400 shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 bg-slate-50 text-sm space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-2">
            <span className="text-slate-500">رصيد افتتاحي نقدي</span>
            <span className="text-slate-700 font-bold text-left">
              {money(day.openingCashBalance)} ج.م
            </span>
            <span className="text-slate-500">ترحيل نقدي</span>
            <span className="text-slate-700 font-bold text-left">
              {money(day.carryOverCash)} ج.م
            </span>
            {day.actualClosingCashBalance != null && (
              <>
                <span className="text-slate-500">رصيد فعلي عند الإغلاق</span>
                <span className="text-slate-700 font-bold text-left">
                  {money(day.actualClosingCashBalance)} ج.م
                </span>
              </>
            )}
            {day.expectedClosingCashBalance != null && (
              <>
                <span className="text-slate-500">رصيد متوقع عند الإغلاق</span>
                <span className="text-slate-700 font-bold text-left">
                  {money(day.expectedClosingCashBalance)} ج.م
                </span>
              </>
            )}
            {day.cashVariance != null && (
              <>
                <span className="text-slate-500">الفارق</span>
                <span
                  className={`font-bold text-left ${
                    Number(day.cashVariance) === 0
                      ? "text-slate-500"
                      : Number(day.cashVariance) > 0
                        ? "text-green-600"
                        : "text-red-600"
                  }`}
                >
                  {money(day.cashVariance)} ج.م
                </span>
              </>
            )}
            {/* Variance reason + notes — shown only when variance != 0 and recorded */}
            {day.cashVariance != null &&
              Number(day.cashVariance) !== 0 &&
              day.cashVarianceReason && (
                <>
                  <span className="text-slate-500">سبب الفارق</span>
                  <span className="text-slate-700 font-bold text-left text-xs">
                    {VARIANCE_REASON_LABELS[day.cashVarianceReason] ?? day.cashVarianceReason}
                  </span>
                </>
              )}
            {day.cashVarianceNotes && (
              <>
                <span className="text-slate-500">ملاحظات الفارق</span>
                <span className="text-slate-500 italic text-left text-xs">
                  {day.cashVarianceNotes}
                </span>
              </>
            )}
            <span className="text-slate-500">إجمالي محوّل للخزينة الرئيسية</span>
            <span className="text-slate-700 font-bold text-left">
              {money(day.totalTransferredToMainSafe)} ج.م
            </span>
            {day.closedAt && (
              <>
                <span className="text-slate-500">وقت الإغلاق</span>
                <span className="text-slate-700 text-left">
                  {formatDate(day.closedAt)}
                </span>
              </>
            )}
          </div>
          {day.notes && (
            <p className="text-slate-500 italic text-xs border-t border-slate-200 pt-2">
              {day.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open Day Modal
// ---------------------------------------------------------------------------

function OpenDayModal({ 
  defaultBalance,
  onClose 
}: { 
  defaultBalance: string;
  onClose: () => void; 
}) {
  const queryClient = useQueryClient();
  const [openingBalance, setOpeningBalance] = useState(defaultBalance === "0" ? "" : toArabicNumerals(defaultBalance));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      await customFetch("/api/operating-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openingCashBalance: parseArabicNumber(openingBalance),
          notes: notes.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OP_DAYS_CURRENT_KEY] });
      void queryClient.invalidateQueries({ queryKey: [OP_DAYS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/transactions"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, "تعذّر فتح يوم تشغيلي")),
  });

  return (
    <Modal open onClose={onClose} title="فتح يوم تشغيلي">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
          فتح يوم تشغيلي جديد. أدخل رصيد البداية النقدي (المرحّل من اليوم السابق إن وجد)، ثم اضغط فتح.
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            رصيد الافتتاح النقدي (اختياري)
          </label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className={inputClass}
            value={openingBalance}
            onChange={(e) => setOpeningBalance(toArabicNumerals(e.target.value))}
            data-testid="input-opening-balance"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
          <input
            type="text"
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-open-notes"
          />
        </div>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="w-full py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
          data-testid="button-open-day-confirm"
        >
          {mut.isPending ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
          فتح اليوم التشغيلي
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Close Day Modal — 4-step enterprise closing workflow
// ---------------------------------------------------------------------------

const VARIANCE_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "CASH_SHORTAGE",         label: "عجز نقدي" },
  { value: "CASH_OVERAGE",          label: "زيادة نقدية" },
  { value: "COUNTING_ERROR",        label: "خطأ في العد" },
  { value: "THEFT_OR_LOSS",         label: "سرقة أو ضياع" },
  { value: "PENDING_INVESTIGATION", label: "قيد التحقيق" },
  { value: "OTHER",                 label: "أخرى" },
];

function CloseDayModal({
  day,
  expectedCashBalance,
  onClose,
}: {
  day: OperationalDay;
  expectedCashBalance: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [actualCash, setActualCash] = useState("");
  const [carryOver, setCarryOver] = useState("٠");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showVarianceConfirm, setShowVarianceConfirm] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [varianceReason, setVarianceReason] = useState("");
  const [varianceNotes, setVarianceNotes] = useState("");

  const actualNum   = parseArabicNumber(actualCash);
  const carryNum    = parseArabicNumber(carryOver);
  const expectedNum = expectedCashBalance ? Number(expectedCashBalance.replace(/,/g, "")) : null;
  const variance    = expectedNum !== null && !Number.isNaN(actualNum) ? actualNum - expectedNum : null;
  const hasVariance = variance !== null && Math.abs(variance) > 0.001;
  const toMainSafe  = !Number.isNaN(actualNum) && !Number.isNaN(carryNum) ? Math.max(0, actualNum - carryNum) : 0;

  const mut = useMutation({
    mutationFn: async (params: { reason?: string; rNotes?: string }) => {
      await customFetch(`/api/operating-days/${day.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualClosingCashBalance: actualNum,
          carryOverCash: carryNum,
          notes: notes.trim() || null,
          ...(params.reason ? { varianceReason: params.reason } : {}),
          ...(params.rNotes?.trim() ? { varianceNotes: params.rNotes.trim() } : {}),
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OP_DAYS_CURRENT_KEY] });
      void queryClient.invalidateQueries({ queryKey: [OP_DAYS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/dashboard/kpis"] });
      onClose();
    },
    onError: (err) => {
      const msg = err instanceof Error && !err.message.includes("fetch") ? err.message : apiErrorMessage(err, "تعذّر إغلاق اليوم التشغيلي");
      setError(msg);
      setShowVarianceConfirm(false);
      setShowReasonDialog(false);
    },
  });

  function validate(): boolean {
    if (Number.isNaN(actualNum) || actualNum < 0) { setError("أدخل رصيداً فعلياً صحيحاً."); return false; }
    if (Number.isNaN(carryNum) || carryNum < 0 || carryNum > actualNum) { setError("مبلغ الترحيل يجب أن يكون بين صفر والرصيد الفعلي."); return false; }
    setError(null); return true;
  }

  function handleClosePress() {
    if (!validate()) return;
    if (hasVariance) { setShowVarianceConfirm(true); } else { mut.mutate({}); }
  }

  if (showReasonDialog) {
    return (
      <Modal open onClose={onClose} title="تسجيل سبب الفارق النقدي">
        <div className="space-y-4">
          <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-3 ${(variance ?? 0) < 0 ? "bg-red-50 border border-red-100 text-red-800" : "bg-green-50 border border-green-100 text-green-800"}`}>
            <div>
              <p className="font-bold">الفارق: {money(variance)} ج.م</p>
              <p className="text-xs opacity-80">{(variance ?? 0) < 0 ? "عجز نقدي" : "زيادة نقدية"}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">سبب الفارق <span className="text-red-500">*</span></p>
            <div className="space-y-2">
              {VARIANCE_REASON_OPTIONS.map((opt) => (
                <label key={opt.value} className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${varianceReason === opt.value ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}>
                  <input type="radio" name="variance-reason" value={opt.value} checked={varianceReason === opt.value} onChange={() => setVarianceReason(opt.value)} className="accent-amber-500 w-4 h-4 shrink-0" data-testid={`radio-reason-${opt.value}`} />
                  <span className="font-medium text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات إضافية (اختياري)</label>
            <textarea rows={3} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition resize-none text-sm" value={varianceNotes} onChange={(e) => setVarianceNotes(e.target.value)} placeholder="أدخل تفاصيل إضافية..." data-testid="textarea-variance-notes" />
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">{error}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setShowReasonDialog(false); setShowVarianceConfirm(true); }} className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition" data-testid="button-reason-back">رجوع</button>
            <button onClick={() => mut.mutate({ reason: varianceReason, rNotes: varianceNotes })} disabled={!varianceReason || mut.isPending} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2" data-testid="button-save-close-day">
              {mut.isPending ? <Loader2 size={18} className="animate-spin" /> : <StopCircle size={18} />}
              حفظ وإغلاق اليوم
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  if (showVarianceConfirm) {
    const isShortage = (variance ?? 0) < 0;
    const absVariance = Math.abs(variance ?? 0);
    return (
      <Modal open onClose={onClose} title="تنبيه: فارق نقدي">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">يوجد فارق بين الرصيد المتوقع والرصيد الفعلي. يُرجى المراجعة قبل المتابعة.</p>
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">الرصيد المتوقع</span>
              <span className="font-bold text-slate-700">{money(expectedNum)} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">الرصيد الفعلي</span>
              <span className="font-bold text-slate-700">{money(actualNum)} ج.م</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between">
              <span className="font-bold text-slate-700">الفارق</span>
              <span className={`font-black tabular-nums ${isShortage ? "text-red-600" : "text-green-600"}`}>{isShortage ? "-" : "+"}{money(absVariance)} ج.م</span>
            </div>
          </div>
          <div className={`rounded-xl px-4 py-3 text-sm space-y-1.5 ${isShortage ? "bg-red-50 border border-red-100" : "bg-green-50 border border-green-100"}`}>
            <p className={`font-bold text-xs uppercase mb-2 ${isShortage ? "text-red-700" : "text-green-700"}`}>سيتم تنفيذ الإجراءات التالية</p>
            {toMainSafe > 0 && <p className="text-slate-700">تحويل {money(toMainSafe)} ج.م للخزينة الرئيسية</p>}
            <p className="text-slate-700">تسجيل فارق {money(absVariance)} ج.م كـ {isShortage ? "عجز نقدي" : "زيادة نقدية"}</p>
            <p className="text-slate-700">قيد محاسبي مزدوج: {isShortage ? "مدين فروق خزينة (6000)" : "مدين نقدية (1000)"}</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowVarianceConfirm(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition" data-testid="button-variance-cancel">إلغاء</button>
            <button type="button" onClick={() => { setShowVarianceConfirm(false); setShowReasonDialog(true); }} className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition" data-testid="button-variance-continue">متابعة الإغلاق</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="إغلاق اليوم التشغيلي">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">وردية مفتوحة منذ</span>
            <span className="font-bold text-slate-700">{formatDate(day.openedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">رصيد افتتاحي نقدي</span>
            <span className="font-bold text-slate-700">{money(day.openingCashBalance)} ج.م</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">الرصيد النقدي الفعلي عند الإغلاق <span className="text-red-500">*</span></label>
          <input type="text" inputMode="decimal" dir="ltr" className={inputClass} value={actualCash} onChange={(e) => { const v = toArabicNumerals(e.target.value); setActualCash(v); setCarryOver("٠"); setError(null); }} data-testid="input-actual-cash" />
        </div>
        {actualCash && !Number.isNaN(actualNum) && (
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-3">
            <p className="text-sm font-bold text-amber-900">الرصيد النقدي للترحيل</p>
            <p className="text-xs text-amber-700">المبلغ الذي ستحتفظ به في الدرج. الباقي يُحوَّل للخزينة الرئيسية.</p>
            <input type="text" inputMode="decimal" dir="ltr" className="w-full px-3 py-2 rounded-lg border border-amber-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition" value={carryOver} onChange={(e) => setCarryOver(toArabicNumerals(e.target.value))} data-testid="input-carry-over" />
            {!Number.isNaN(toMainSafe) && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-800">سيُحوَّل للخزينة:</span>
                <span className="font-bold text-amber-900">{money(toMainSafe)} ج.م</span>
              </div>
            )}
          </div>
        )}
        {actualCash && !Number.isNaN(actualNum) && expectedNum !== null && (
          <div className={`rounded-xl px-4 py-3 text-sm space-y-2 border ${hasVariance ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}>
            <p className={`text-xs font-bold uppercase tracking-wide ${hasVariance ? "text-amber-700" : "text-slate-500"}`}>ملخص الوردية</p>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد المتوقع</span>
                <span className="font-bold text-slate-700 tabular-nums">{money(expectedNum)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الفعلي</span>
                <span className="font-bold text-slate-700 tabular-nums">{money(actualNum)} ج.م</span>
              </div>
              <div className={`flex justify-between border-t pt-1.5 ${hasVariance ? "border-amber-200" : "border-slate-200"}`}>
                <span className={`font-bold ${!hasVariance ? "text-slate-500" : (variance ?? 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                  {hasVariance ? "⚠️ " : ""}فارق الوردية
                </span>
                <span className={`font-black tabular-nums ${!hasVariance ? "text-slate-500" : (variance ?? 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                  {hasVariance && ((variance ?? 0) < 0 ? "-" : "+")}{money(Math.abs(variance ?? 0))} ج.م
                </span>
              </div>
              {hasVariance && (
                <p className={`text-xs ${(variance ?? 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                  سيُسجَّل كـ {(variance ?? 0) < 0 ? "عجز نقدي" : "زيادة نقدية"} في الحسابات
                </p>
              )}
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
          <input type="text" className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-close-notes" />
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">{error}</div>}
        <button onClick={handleClosePress} disabled={mut.isPending || !actualCash} className="w-full py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2" data-testid="button-confirm-close-day">
          {mut.isPending ? <Loader2 size={18} className="animate-spin" /> : <StopCircle size={18} />}
          تأكيد الإغلاق
        </button>
      </div>
    </Modal>
  );
}
// ---------------------------------------------------------------------------
// Transfer Modal
// ---------------------------------------------------------------------------

function TransferModal({
  accounts,
  onClose,
}: {
  accounts: TreasuryAccountWithOwner[];
  onClose: () => void;
}) {
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      await customFetch("/api/treasury/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccountId,
          toAccountId,
          amount: parseArabicNumber(amount),
          description: notes,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/accounts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/transactions"],
      });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, "فشل تحويل الرصيد")),
  });

  return (
    <Modal open onClose={onClose} title="تحويل رصيد بين الخزائن">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            من الخزينة
          </label>
          <select
            className={inputClass}
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
          >
            {(() => {
              const { mainSafe, ownerGroups } = groupByOwner(accounts);
              return ownerGroups.length > 0 ? (
                <>
                  {mainSafe.length > 0 && (
                    <optgroup label="الخزينة الرئيسية">
                      {mainSafe.map((a) => (
                        <option key={a.id} value={a.id}>{transferOptionLabel(a)}</option>
                      ))}
                    </optgroup>
                  )}
                  {ownerGroups.map(([owner, group]) => (
                    <optgroup key={owner || "__unnamed__"} label={owner || "بدون مستخدم"}>
                      {group.map((a) => (
                        <option key={a.id} value={a.id}>{transferOptionLabel(a)}</option>
                      ))}
                    </optgroup>
                  ))}
                </>
              ) : (
                accounts.map((a) => (
                  <option key={a.id} value={a.id}>{transferOptionLabel(a)}</option>
                ))
              );
            })()}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            إلى الخزينة
          </label>
          <select
            className={inputClass}
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            <option value="">— اختر الخزينة الوجهة —</option>
            {(() => {
              const filtered = accounts.filter((a) => a.id !== fromAccountId);
              const { mainSafe, ownerGroups } = groupByOwner(filtered);
              return ownerGroups.length > 0 ? (
                <>
                  {mainSafe.length > 0 && (
                    <optgroup label="الخزينة الرئيسية">
                      {mainSafe.map((a) => (
                        <option key={a.id} value={a.id}>{transferOptionLabel(a)}</option>
                      ))}
                    </optgroup>
                  )}
                  {ownerGroups.map(([owner, group]) => (
                    <optgroup key={owner || "__unnamed__"} label={owner || "بدون مستخدم"}>
                      {group.map((a) => (
                        <option key={a.id} value={a.id}>{transferOptionLabel(a)}</option>
                      ))}
                    </optgroup>
                  ))}
                </>
              ) : (
                filtered.map((a) => (
                  <option key={a.id} value={a.id}>{transferOptionLabel(a)}</option>
                ))
              );
            })()}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            المبلغ
          </label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(toArabicNumerals(e.target.value))}
            placeholder="٠.٠٠"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            ملاحظات
          </label>
          <input
            type="text"
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !toAccountId || !amount}
          className="w-full py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {mut.isPending && <Loader2 size={18} className="animate-spin" />}
          تأكيد التحويل
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Adjustment Modal
// ---------------------------------------------------------------------------

function AdjustmentModal({
  account,
  onClose,
}: {
  account: TreasuryAccount;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      await customFetch("/api/treasury/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryAccountId: account.id,
          direction,
          amount: parseArabicNumber(amount),
          reason,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/accounts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/transactions"],
      });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, "فشلت عملية التسوية")),
  });

  return (
    <Modal open onClose={onClose} title={`تسوية رصيد الخزينة — ${account.name}`}>
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm flex justify-between">
          <span className="text-slate-500">الرصيد الحالي بالنظام</span>
          <span className="font-bold text-slate-800">{money(account.balance)}</span>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            نوع التسوية
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={direction === "OUT"}
                onChange={() => setDirection("OUT")}
                className="w-4 h-4 text-amber-500"
              />
              <span className="text-sm font-medium text-slate-700">
                نقصان (عجز / سحب غير مسجل)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={direction === "IN"}
                onChange={() => setDirection("IN")}
                className="w-4 h-4 text-amber-500"
              />
              <span className="text-sm font-medium text-slate-700">
                زيادة (فائض غير مسجل)
              </span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            مبلغ التسوية
          </label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(toArabicNumerals(e.target.value))}
            placeholder="٠.٠٠"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            سبب التسوية <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="أدخل سبب التسوية للمراجعة المستنداتية"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !amount || !reason}
          className="w-full py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {mut.isPending && <Loader2 size={18} className="animate-spin" />}
          حفظ التسوية
        </button>
      </div>
    </Modal>
  );
}
