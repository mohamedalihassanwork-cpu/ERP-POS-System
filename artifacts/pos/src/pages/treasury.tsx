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
} from "lucide-react";
import {
  useListTreasuryAccounts,
  useListTreasuryTransactions,
  useListTreasurySessions,
  useGetCurrentTreasurySession,
  useOpenTreasurySession,
  useCloseTreasurySession,
  ApiError,
  customFetch,
  type TreasuryAccount,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";

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
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseArabicNumber(val: string | number): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const normalized = val
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[٫]/g, '.');
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
};

export function TreasuryPage() {
  const { hasPermission } = useAuth();
  const canSession = hasPermission("treasury.session");

  const accountsQuery = useListTreasuryAccounts();
  const txQuery = useListTreasuryTransactions({ page: 1, pageSize: 50 });
  const sessionsQuery = useListTreasurySessions({ page: 1, pageSize: 20 });

  const [sessionAccount, setSessionAccount] = useState<TreasuryAccount | null>(null);
  const [adjustmentAccount, setAdjustmentAccount] = useState<TreasuryAccount | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);

  const accounts = accountsQuery.data ?? [];
  const transactions = txQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader
            title="الخزينة"
            subtitle="أرصدة الخزائن والورديات والحركات المالية"
            icon={<Wallet size={24} />}
          />
          {canSession && accounts.length > 1 && (
            <button
              onClick={() => setShowTransfer(true)}
              className="px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition flex items-center gap-2"
            >
              <ArrowRightLeft size={18} />
              تحويل رصيد
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {accountsQuery.isLoading ? (
            <p className="text-slate-400 col-span-full text-center py-10">جارٍ التحميل...</p>
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
                  {canSession && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAdjustmentAccount(a)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 transition bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                        title="تسوية الرصيد"
                      >
                        تسوية
                      </button>
                      <button
                        onClick={() => setSessionAccount(a)}
                        className="text-xs font-bold text-amber-700 hover:text-amber-800 transition"
                        data-testid={`button-session-${a.type}`}
                      >
                        الوردية
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-slate-500 text-sm">{a.name}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{money(a.balance)}</p>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h2 className="font-bold text-slate-800 px-6 py-4 border-b border-slate-100">
              آخر الحركات
            </h2>
            <div className="max-h-[28rem] overflow-auto">
              {txQuery.isLoading ? (
                <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
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
                        <td className="px-4 py-3 text-slate-600">{t.accountName}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-slate-600">
                            {t.direction === "IN" ? (
                              <ArrowDownCircle size={15} className="text-green-600" />
                            ) : (
                              <ArrowUpCircle size={15} className="text-red-600" />
                            )}
                            {REF_TYPE_LABELS[t.referenceType] ?? t.referenceType}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-3 font-bold ${
                            t.direction === "IN" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {t.direction === "IN" ? "+" : "−"}
                          {money(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{money(t.balanceAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-400 text-center py-12">لا توجد حركات.</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h2 className="font-bold text-slate-800 px-6 py-4 border-b border-slate-100">
              الورديات
            </h2>
            <div className="max-h-[28rem] overflow-auto">
              {sessionsQuery.isLoading ? (
                <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
              ) : sessions.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-right font-bold px-4 py-3">الخزينة</th>
                      <th className="text-right font-bold px-4 py-3">الحالة</th>
                      <th className="text-right font-bold px-4 py-3">افتتاحي</th>
                      <th className="text-right font-bold px-4 py-3">الفرق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((s) => (
                      <tr key={s.id} data-testid={`row-session-${s.id}`}>
                        <td className="px-4 py-3 text-slate-600">{s.accountName}</td>
                        <td className="px-4 py-3">
                          {s.status === "OPEN" ? (
                            <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-bold">
                              مفتوحة
                            </span>
                          ) : (
                            <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">
                              مغلقة
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{money(s.openingBalance)}</td>
                        <td className="px-4 py-3">
                          {s.variance == null ? (
                            "—"
                          ) : (
                            <span
                              className={
                                Number(s.variance) === 0
                                  ? "text-slate-500"
                                  : Number(s.variance) > 0
                                    ? "text-green-600 font-bold"
                                    : "text-red-600 font-bold"
                              }
                            >
                              {money(s.variance)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-400 text-center py-12">لا توجد ورديات.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {sessionAccount && (
        <SessionModal account={sessionAccount} onClose={() => setSessionAccount(null)} />
      )}
      {showTransfer && (
        <TransferModal accounts={accounts} onClose={() => setShowTransfer(false)} />
      )}
      {adjustmentAccount && (
        <AdjustmentModal account={adjustmentAccount} onClose={() => setAdjustmentAccount(null)} />
      )}
    </div>
  );
}

function SessionModal({
  account,
  onClose,
}: {
  account: TreasuryAccount;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const currentQuery = useGetCurrentTreasurySession({ treasuryAccountId: account.id });
  const openMutation = useOpenTreasurySession();
  const closeMutation = useCloseTreasurySession();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [transferToMainSafe, setTransferToMainSafe] = useState(true);
  const [transferAmount, setTransferAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const current = currentQuery.data?.session ?? null;

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["/api/treasury/sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
  }

  async function handleOpen() {
    setError(null);
    const amt = parseArabicNumber(amount);
    if (amt < 0 || Number.isNaN(amt)) return setError("أدخل رصيداً افتتاحياً صحيحاً.");
    try {
      await openMutation.mutateAsync({
        data: { treasuryAccountId: account.id, openingBalance: amt, notes: notes.trim() || null },
      });
      invalidateAll();
      await currentQuery.refetch();
      setAmount("");
      setNotes("");
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر فتح الوردية."));
    }
  }

  async function handleClose() {
    if (!current) return;
    setError(null);
    const amt = parseArabicNumber(amount);
    if (amt < 0 || Number.isNaN(amt)) return setError("أدخل الرصيد الفعلي عند الإغلاق.");
    const tAmt = transferToMainSafe ? parseArabicNumber(transferAmount) : undefined;
    if (transferToMainSafe && (tAmt == null || tAmt < 0 || Number.isNaN(tAmt))) {
      return setError("أدخل مبلغ الترحيل بشكل صحيح.");
    }
    try {
      await closeMutation.mutateAsync({
        id: current.id,
        data: {
          actualClosingBalance: amt,
          notes: notes.trim() || null,
          transferToMainSafe,
          transferAmount: tAmt,
        },
      });
      invalidateAll();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إغلاق الوردية."));
    }
  }

  const busy = openMutation.isPending || closeMutation.isPending;

  return (
    <Modal open onClose={onClose} title={`وردية — ${account.name}`}>
      <div className="space-y-4">
        {currentQuery.isLoading ? (
          <p className="text-slate-400 text-center py-8">جارٍ التحميل...</p>
        ) : current ? (
          <>
            <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">وردية مفتوحة</span>
                <span className="font-bold text-green-700">
                  {new Date(current.openedAt).toLocaleString("ar-EG")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الرصيد الافتتاحي</span>
                <span className="font-bold text-slate-800">{money(current.openingBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">رصيد الخزينة الحالي</span>
                <span className="font-bold text-slate-800">{money(account.balance)}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                الرصيد الفعلي عند الإغلاق <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                className={inputClass}
                value={amount}
                onChange={(e) => {
                  const val = toArabicNumerals(e.target.value);
                  setAmount(val);
                  setTransferAmount(val); // Default transfer amount to actual closing balance
                }}
                data-testid="input-closing-balance"
              />
            </div>
            
            {account.type === "CASH" && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={transferToMainSafe}
                    onChange={(e) => setTransferToMainSafe(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                  />
                  <span className="text-sm font-bold text-amber-900">
                    ترحيل الرصيد إلى الخزينة الرئيسية (تصفير الدرج)
                  </span>
                </label>
                
                {transferToMainSafe && (
                  <div>
                    <label className="block text-sm text-amber-800 mb-1">مبلغ الترحيل</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      className="w-full px-3 py-2 rounded-lg border border-amber-200 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(toArabicNumerals(e.target.value))}
                    />
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
              <input
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-session-notes"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
                {error}
              </div>
            )}
            <button
              onClick={() => void handleClose()}
              disabled={busy}
              className="w-full py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="button-close-session"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <StopCircle size={18} />}
              إغلاق الوردية
            </button>
          </>
        ) : (
          <>
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm flex justify-between">
              <span className="text-slate-500">رصيد الخزينة الحالي</span>
              <span className="font-bold text-slate-800">{money(account.balance)}</span>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                الرصيد الافتتاحي <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(toArabicNumerals(e.target.value))}
                data-testid="input-opening-balance"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
              <input
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-session-notes"
              />
            </div>
            {error && (
              <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
                {error}
              </div>
            )}
            <button
              onClick={() => void handleOpen()}
              disabled={busy}
              className="w-full py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="button-open-session"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
              فتح الوردية
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

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
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/transactions"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, "فشل تحويل الرصيد")),
  });

  return (
    <Modal open onClose={onClose} title="تحويل رصيد بين الخزائن">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">من الخزينة</label>
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
          <label className="block text-sm font-bold text-slate-700 mb-2">إلى الخزينة</label>
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
          <label className="block text-sm font-bold text-slate-700 mb-2">المبلغ</label>
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
          <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
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
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/transactions"] });
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
          <label className="block text-sm font-bold text-slate-700 mb-2">نوع التسوية</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={direction === "OUT"}
                onChange={() => setDirection("OUT")}
                className="w-4 h-4 text-amber-500"
              />
              <span className="text-sm font-medium text-slate-700">نقصان (عجز / سحب غير مسجل)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={direction === "IN"}
                onChange={() => setDirection("IN")}
                className="w-4 h-4 text-amber-500"
              />
              <span className="text-sm font-medium text-slate-700">زيادة (فائض غير مسجل)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">مبلغ التسوية</label>
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
          <label className="block text-sm font-bold text-slate-700 mb-2">سبب التسوية <span className="text-red-500">*</span></label>
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

