import { useState } from "react";
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
  return useQuery<{ operationalDay: OperationalDay | null }>({
    queryKey: [OP_DAYS_CURRENT_KEY],
    queryFn: () =>
      customFetch<{ operationalDay: OperationalDay | null }>(
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

const ACCOUNT_ICONS: Record<string, React.ReactNode> = {
  CASH: <Banknote size={22} />,
  CARD: <CreditCard size={22} />,
  INSTAPAY: <Smartphone size={22} />,
  WALLET: <Wallet size={22} />,
  MAIN_SAFE: <Wallet size={22} />,
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
  DAY_CLOSE_RESET: "إغلاق يوم تشغيلي",
  DAY_OPEN_CARRY: "ترحيل فتح اليوم",
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
  const { hasPermission } = useAuth();
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

  const accounts = accountsQuery.data ?? [];
  const transactions = txQuery.data?.items ?? [];
  const currentDay = currentDayQuery.data?.operationalDay ?? null;
  const days = daysQuery.data?.items ?? [];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <PageHeader
            title="الخزينة"
            subtitle="أرصدة الخزائن واليومي التشغيلي والحركات المالية"
            icon={<Wallet size={24} />}
          />
          <div className="flex gap-2 flex-wrap">
            {canTransfer && accounts.length > 1 && (
              <button
                onClick={() => setShowTransfer(true)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition flex items-center gap-2 text-sm"
              >
                <ArrowRightLeft size={16} />
                تحويل رصيد
              </button>
            )}
            {canSession && !currentDay && (
              <button
                onClick={() => setShowOpenDay(true)}
                className="px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition flex items-center gap-2"
                data-testid="button-open-day"
              >
                <PlayCircle size={18} />
                فتح يوم تشغيلي
              </button>
            )}
            {canSession && currentDay && (
              <button
                onClick={() => setShowCloseDay(true)}
                className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition flex items-center gap-2"
                data-testid="button-close-day"
              >
                <StopCircle size={18} />
                إغلاق اليوم التشغيلي
              </button>
            )}
          </div>
        </div>

        {/* Current operational day banner */}
        {canSession && (
          <CurrentDayBanner
            day={currentDay}
            isLoading={currentDayQuery.isLoading}
          />
        )}

        {/* Account cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {accountsQuery.isLoading ? (
            <p className="text-slate-400 col-span-full text-center py-10">
              جارٍ التحميل...
            </p>
          ) : accounts.length === 0 ? (
            <p className="text-slate-400 col-span-full text-center py-10">
              لا توجد حسابات خزينة. افتح يوماً تشغيلياً أولاً.
            </p>
          ) : (
            accounts.map((a) => (
              <div
                key={a.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
                data-testid={`card-treasury-${a.type}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    {ACCOUNT_ICONS[a.type] ?? <Wallet size={22} />}
                  </div>
                  {canSession && a.type !== "MAIN_SAFE" && (
                    <button
                      onClick={() => setAdjustmentAccount(a)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 transition bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                      title="تسوية الرصيد"
                    >
                      <Settings2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-slate-500 text-sm">{a.name}</p>
                {(a as any).userName && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(a as any).userName}
                  </p>
                )}
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {money(a.balance)}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Transactions + Operational Days history */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transactions */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h2 className="font-bold text-slate-800 px-6 py-4 border-b border-slate-100">
              آخر الحركات
            </h2>
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
                    {transactions.map((t) => (
                      <tr key={t.id} data-testid={`row-treasury-tx-${t.id}`}>
                        <td className="px-4 py-3 text-slate-600">
                          {t.accountName}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            {t.direction === "IN" ? (
                              <ArrowDownCircle
                                size={15}
                                className="text-green-600"
                              />
                            ) : (
                              <ArrowUpCircle
                                size={15}
                                className="text-red-600"
                              />
                            )}
                            {REF_TYPE_LABELS[t.referenceType] ??
                              t.referenceType}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${
                            t.direction === "IN"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {t.direction === "IN" ? "+" : "−"}
                          {money(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {money(t.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-400 text-center py-12">
                  لا توجد حركات.
                </p>
              )}
            </div>
          </div>

          {/* Operational days history */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h2 className="font-bold text-slate-800 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Calendar size={18} className="text-amber-500" />
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

      {/* Modals */}
      {showOpenDay && (
        <OpenDayModal onClose={() => setShowOpenDay(false)} />
      )}
      {showCloseDay && currentDay && (
        <CloseDayModal
          day={currentDay}
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

function OpenDayModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [openingBalance, setOpeningBalance] = useState("");
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
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/accounts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/transactions"],
      });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, "تعذّر فتح اليوم التشغيلي")),
  });

  return (
    <Modal open onClose={onClose} title="فتح يوم تشغيلي جديد">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-800">
          سيتم فتح يوم تشغيلي لك. إذا كان لديك رصيد نقدي من الوردية السابقة
          (ترحيل)، أدخله هنا.
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            رصيد الترحيل النقدي (اختياري)
          </label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className={inputClass}
            value={openingBalance}
            onChange={(e) => setOpeningBalance(toArabicNumerals(e.target.value))}
            placeholder="٠.٠٠"
            data-testid="input-opening-balance"
          />
          <p className="text-xs text-slate-400 mt-1">
            أدخل الرصيد النقدي المرحّل من اليوم السابق. اتركه صفراً إذا لم
            يكن هناك ترحيل.
          </p>
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
          data-testid="button-confirm-open-day"
        >
          {mut.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <PlayCircle size={18} />
          )}
          فتح اليوم التشغيلي
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Close Day Modal
// ---------------------------------------------------------------------------

function CloseDayModal({
  day,
  onClose,
}: {
  day: OperationalDay;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [actualCash, setActualCash] = useState("");
  const [carryOver, setCarryOver] = useState("٠");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const actual = parseArabicNumber(actualCash);
      if (Number.isNaN(actual) || actual < 0) {
        throw new Error("أدخل رصيداً فعلياً صحيحاً.");
      }
      const carry = parseArabicNumber(carryOver);
      if (Number.isNaN(carry) || carry < 0 || carry > actual) {
        throw new Error("مبلغ الترحيل يجب أن يكون بين صفر والرصيد الفعلي.");
      }
      await customFetch(`/api/operating-days/${day.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualClosingCashBalance: actual,
          carryOverCash: carry,
          notes: notes.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [OP_DAYS_CURRENT_KEY] });
      void queryClient.invalidateQueries({ queryKey: [OP_DAYS_KEY] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/accounts"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["/api/treasury/transactions"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["/api/dashboard/kpis"],
      });
      onClose();
    },
    onError: (err) => {
      const msg =
        err instanceof Error && !err.message.includes("fetch")
          ? err.message
          : apiErrorMessage(err, "تعذّر إغلاق اليوم التشغيلي");
      setError(msg);
    },
  });

  const actualNum = parseArabicNumber(actualCash);
  const carryNum = parseArabicNumber(carryOver);
  const toMainSafe =
    Number.isNaN(actualNum) || Number.isNaN(carryNum)
      ? 0
      : Math.max(0, actualNum - carryNum);

  return (
    <Modal open onClose={onClose} title="إغلاق اليوم التشغيلي">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">وردية مفتوحة منذ</span>
            <span className="font-bold text-slate-700">
              {formatDate(day.openedAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">رصيد افتتاحي نقدي</span>
            <span className="font-bold text-slate-700">
              {money(day.openingCashBalance)} ج.م
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الرصيد النقدي الفعلي عند الإغلاق{" "}
            <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className={inputClass}
            value={actualCash}
            onChange={(e) => {
              const v = toArabicNumerals(e.target.value);
              setActualCash(v);
              setCarryOver("٠");
            }}
            data-testid="input-actual-cash"
          />
        </div>

        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-3">
          <p className="text-sm font-bold text-amber-900">الرصيد النقدي للترحيل</p>
          <p className="text-xs text-amber-700">
            المبلغ الذي ستحتفظ به في الدرج للوردية القادمة. الباقي سيُحوّل
            تلقائياً للخزينة الرئيسية.
          </p>
          <input
            type="text"
            inputMode="decimal"
            dir="ltr"
            className="w-full px-3 py-2 rounded-lg border border-amber-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition"
            value={carryOver}
            onChange={(e) => setCarryOver(toArabicNumerals(e.target.value))}
            data-testid="input-carry-over"
          />
          {!Number.isNaN(toMainSafe) && (
            <div className="flex justify-between text-sm">
              <span className="text-amber-800">سيُحوّل للخزينة الرئيسية:</span>
              <span className="font-bold text-amber-900">
                {money(toMainSafe)} ج.م
              </span>
            </div>
          )}
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
            data-testid="input-close-notes"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || !actualCash}
          className="w-full py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
          data-testid="button-confirm-close-day"
        >
          {mut.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <StopCircle size={18} />
          )}
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
  accounts: TreasuryAccount[];
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
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — رصيد: {money(a.balance)}
              </option>
            ))}
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
            <option value="">-- اختر الخزينة الوجهة --</option>
            {accounts
              .filter((a) => a.id !== fromAccountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — رصيد: {money(a.balance)}
                </option>
              ))}
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
