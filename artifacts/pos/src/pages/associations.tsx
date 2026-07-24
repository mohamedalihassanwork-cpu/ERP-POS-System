import { useState } from "react";
import {
  Users,
  Plus,
  Pencil,
  X,
  Printer,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  FileBarChart,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, ApiError } from "@workspace/api-client-react";
import { useListTreasuryAccounts } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Association {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  expectedReturnDate?: string | null;
  status: "ACTIVE" | "CLOSED";
  contributionFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM" | "NONE";
  contributionAmount?: string | null;
  notes?: string | null;
  totalWithdrawals: number;
  totalReturns: number;
  balance: number;
  createdAt: string;
}

interface AssocTx {
  id: string;
  type: "WITHDRAWAL" | "RETURN";
  amount: string;
  transactionDate: string;
  treasuryAccountId: string;
  treasuryAccountName?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  isReversed: boolean;
  reversalOfId?: string | null;
  runningBalance: number;
  createdAt: string;
}

interface TxList {
  rows: AssocTx[];
  count: number;
  totalWithdrawals: number;
  totalReturns: number;
  balance: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function apiErr(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const d = err.data as { error?: string; details?: string } | undefined;
    if (d?.details) return `${d.error}: ${d.details}`;
    return d?.error ?? fallback;
  }
  return fallback;
}

const FREQ_LABELS: Record<string, string> = {
  DAILY: "يومي",
  WEEKLY: "أسبوعي",
  MONTHLY: "شهري",
  CUSTOM: "مخصص",
  NONE: "غير محدد",
};

const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition text-sm";

// ── Tab keys ──────────────────────────────────────────────────────────────────

type Tab = "associations" | "transactions" | "report" | "statement";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "associations", label: "الجمعيات", icon: <Users size={16} /> },
  { key: "transactions", label: "المعاملات", icon: <ArrowDownCircle size={16} /> },
  { key: "report", label: "التقرير", icon: <FileBarChart size={16} /> },
  { key: "statement", label: "كشف الحساب", icon: <BookOpen size={16} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function AssociationsPage() {
  const { hasPermission } = useAuth();

  const canViewBase = hasPermission("associations.view");
  const canCreate = hasPermission("associations.create");
  const canEdit = hasPermission("associations.edit");
  const canTransact = hasPermission("associations.transactions");
  const canReport = hasPermission("associations.report");

  const availableTabs = TABS.filter((t) => {
    if (t.key === "associations") return canViewBase || canCreate || canEdit;
    if (t.key === "transactions") return canTransact;
    if (t.key === "report") return canReport;
    if (t.key === "statement") return canViewBase || canTransact;
    return false;
  });

  const [tab, setTab] = useState<Tab>(availableTabs.length > 0 ? availableTabs[0].key : "associations");

  const canView = availableTabs.length > 0;

  if (!canView) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
        ليس لديك صلاحية الوصول إلى هذه الصفحة.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="حسابات الجمعيات"
          subtitle="إدارة جمعيات الادخار والمدفوعات الدورية"
          icon={<Users size={24} />}
        />

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
          {availableTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                tab === t.key
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          {tab === "associations" && <AssociationsTab canCreate={canCreate} canEdit={canEdit} />}
          {tab === "transactions" && <TransactionsTab canTransact={canTransact} />}
          {tab === "report" && <ReportTab canReport={canReport} />}
          {tab === "statement" && <StatementTab />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Associations management
// ─────────────────────────────────────────────────────────────────────────────

function AssociationsTab({ canCreate, canEdit }: { canCreate: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "CLOSED">("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Association | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Association | null>(null);
  const [error, setError] = useState("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (search) params.set("search", search);

  const q = useQuery<Association[]>({
    queryKey: ["/api/associations", statusFilter, search],
    queryFn: () => customFetch<Association[]>(`/api/associations?${params}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch<Association>("/api/associations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/associations"] }); setShowCreate(false); setError(""); },
    onError: (e) => setError(apiErr(e, "حدث خطأ أثناء الإنشاء")),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      customFetch<Association>(`/api/associations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/associations"] }); setEditTarget(null); setError(""); },
    onError: (e) => setError(apiErr(e, "حدث خطأ أثناء التعديل")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customFetch(`/api/associations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/associations"] }); setDeleteTarget(null); setError(""); },
    onError: (e) => setError(apiErr(e, "حدث خطأ أثناء الحذف")),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="بحث بالاسم..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-48"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | "ACTIVE" | "CLOSED")}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm"
          >
            <option value="">كل الحالات</option>
            <option value="ACTIVE">نشطة</option>
            <option value="CLOSED">مغلقة</option>
          </select>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
          >
            <Plus size={16} /> جمعية جديدة
          </button>
        )}
      </div>

      {q.isLoading && <p className="text-slate-400 text-sm py-8 text-center">جارٍ التحميل...</p>}
      {!q.isLoading && (!q.data || q.data.length === 0) && (
        <p className="text-slate-400 text-sm py-8 text-center">لا توجد جمعيات بعد.</p>
      )}

      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                {["الاسم", "الحالة", "تكرار المساهمة", "إجمالي السحب", "إجمالي العودة", "الرصيد", "الإجراء"].map((h) => (
                  <th key={h} className="text-right font-bold py-2 px-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.map((a) => (
                <tr key={a.id} className="text-slate-700 hover:bg-slate-50 transition-colors">
                  <td className="py-2 px-3 font-bold">{a.name}</td>
                  <td className="py-2 px-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="py-2 px-3">{FREQ_LABELS[a.contributionFrequency] ?? "—"}</td>
                  <td className="py-2 px-3 font-bold text-rose-600">{money(a.totalWithdrawals)}</td>
                  <td className="py-2 px-3 font-bold text-emerald-700">{money(a.totalReturns)}</td>
                  <td className="py-2 px-3">
                    <BalanceBadge balance={a.balance} />
                  </td>
                  <td className="py-2 px-3 flex gap-1">
                    {canEdit && (
                      <button
                        onClick={() => { setEditTarget(a); setError(""); }}
                        className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
                        title="تعديل"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => { setDeleteTarget(a); setError(""); }}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors"
                        title="حذف"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <AssociationFormModal
          title="إنشاء جمعية جديدة"
          error={error}
          loading={createMutation.isPending}
          onClose={() => { setShowCreate(false); setError(""); }}
          onSubmit={(body) => createMutation.mutate(body)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <AssociationFormModal
          title="تعديل الجمعية"
          initial={editTarget}
          error={error}
          loading={editMutation.isPending}
          onClose={() => { setEditTarget(null); setError(""); }}
          onSubmit={(body) => editMutation.mutate({ id: editTarget.id, body })}
        />
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <Modal title="حذف الجمعية" open={true} onClose={() => { setDeleteTarget(null); setError(""); }}>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-600">
              هل أنت متأكد أنك تريد حذف الجمعية <strong>{deleteTarget.name}</strong>؟<br/>
              لا يمكن التراجع عن هذا الإجراء، ولن يتم الحذف إذا كانت هناك معاملات مالية مرتبطة بها.
            </p>
            {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
              >
                {deleteMutation.isPending ? "جارٍ الحذف..." : "تأكيد الحذف"}
              </button>
              <button type="button" onClick={() => { setDeleteTarget(null); setError(""); }} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Association form modal (shared for create + edit)
// ─────────────────────────────────────────────────────────────────────────────

function AssociationFormModal({
  title,
  initial,
  error,
  loading,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Association | null;
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayStr());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [expectedReturnDate, setExpectedReturnDate] = useState(initial?.expectedReturnDate ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "CLOSED">(initial?.status ?? "ACTIVE");
  const [freq, setFreq] = useState(initial?.contributionFrequency ?? "NONE");
  const [contribAmount, setContribAmount] = useState(initial?.contributionAmount ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      startDate,
      endDate: endDate || undefined,
      expectedReturnDate: expectedReturnDate || undefined,
      status,
      contributionFrequency: freq,
      contributionAmount: contribAmount || undefined,
      notes: notes || undefined,
    });
  }

  return (
    <Modal title={title} open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">اسم الجمعية *</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">الوصف</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ البداية *</label>
            <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ النهاية</label>
            <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">تاريخ العودة المتوقع</label>
          <input type="date" className={inputCls} value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">تكرار المساهمة</label>
            <select className={inputCls} value={freq} onChange={(e) => setFreq(e.target.value as "DAILY" | "WEEKLY" | "MONTHLY" | "NONE" | "CUSTOM")}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">مبلغ المساهمة</label>
            <input type="number" min="0" step="0.01" className={inputCls} value={contribAmount} onChange={(e) => setContribAmount(e.target.value)} />
          </div>
        </div>
        {initial && (
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">الحالة</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "CLOSED")}>
              <option value="ACTIVE">نشطة</option>
              <option value="CLOSED">مغلقة</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
          >
            {loading ? "جارٍ الحفظ..." : "حفظ"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Transactions
// ─────────────────────────────────────────────────────────────────────────────

function TransactionsTab({ canTransact }: { canTransact: boolean }) {
  const qc = useQueryClient();
  const [assocId, setAssocId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<AssocTx | null>(null);
  const [error, setError] = useState("");

  const assocQ = useQuery<Association[]>({
    queryKey: ["/api/associations"],
    queryFn: () => customFetch<Association[]>("/api/associations"),
  });

  const txQ = useQuery<TxList>({
    queryKey: ["/api/associations", assocId, "transactions"],
    queryFn: () => customFetch<TxList>(`/api/associations/${assocId}/transactions`),
    enabled: !!assocId,
  });

  const createTxMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      customFetch(`/api/associations/${assocId}/transactions`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/associations", assocId, "transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/associations"] });
      setShowNew(false);
      setError("");
    },
    onError: (e) => setError(apiErr(e, "حدث خطأ أثناء التسجيل")),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ txId, notes }: { txId: string; notes: string }) =>
      customFetch(`/api/associations/${assocId}/transactions/${txId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ notes }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/associations", assocId, "transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/associations"] });
      setReverseTarget(null);
      setError("");
    },
    onError: (e) => setError(apiErr(e, "حدث خطأ أثناء العكس")),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <select
          value={assocId}
          onChange={(e) => setAssocId(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[220px]"
        >
          <option value="">اختر جمعية...</option>
          {assocQ.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {canTransact && assocId && (
          <button
            onClick={() => { setShowNew(true); setError(""); }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors"
          >
            <Plus size={16} /> معاملة جديدة
          </button>
        )}
      </div>

      {!assocId && <p className="text-slate-400 text-sm py-8 text-center">يرجى اختيار جمعية.</p>}

      {assocId && txQ.data && (
        <>
          {/* Summary cards */}
          <div className="flex flex-wrap gap-3 mb-5">
            <SumCard label="إجمالي السحب" value={money(txQ.data.totalWithdrawals)} color="text-rose-600" />
            <SumCard label="إجمالي العودة" value={money(txQ.data.totalReturns)} color="text-emerald-700" />
            <SumCard label="الرصيد الحالي" value={money(txQ.data.balance)} color={txQ.data.balance > 0 ? "text-amber-600" : txQ.data.balance < 0 ? "text-blue-600" : "text-slate-700"} />
          </div>

          {txQ.data.rows.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">لا توجد معاملات.</p>}

          {txQ.data.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    {["التاريخ", "النوع", "المبلغ", "الخزينة", "الرصيد المتراكم", "مرجع", "ملاحظات", "الحالة", "عكس"].map((h) => (
                      <th key={h} className="text-right font-bold py-2 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txQ.data.rows.map((r) => (
                    <tr key={r.id} className={`text-slate-700 ${r.isReversed ? "opacity-50 line-through" : ""}`}>
                      <td className="py-2 px-3 whitespace-nowrap">{r.transactionDate}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${r.type === "WITHDRAWAL" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {r.type === "WITHDRAWAL" ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                          {r.type === "WITHDRAWAL" ? "سحب" : "عودة"}
                        </span>
                      </td>
                      <td className={`py-2 px-3 font-bold ${r.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-700"}`}>{money(r.amount)}</td>
                      <td className="py-2 px-3 text-xs">{r.treasuryAccountName ?? "—"}</td>
                      <td className="py-2 px-3 font-bold text-amber-700">{money(r.runningBalance)}</td>
                      <td className="py-2 px-3 text-xs font-mono">{r.referenceNumber ?? "—"}</td>
                      <td className="py-2 px-3 text-xs text-slate-500">{r.notes ?? "—"}</td>
                      <td className="py-2 px-3">
                        {r.isReversed
                          ? <span className="text-xs text-slate-400 font-bold">محوّل</span>
                          : r.reversalOfId
                          ? <span className="text-xs text-blue-500 font-bold">قيد عكسي</span>
                          : null}
                      </td>
                      <td className="py-2 px-3">
                        {canTransact && !r.isReversed && !r.reversalOfId && (
                          <button
                            onClick={() => { setReverseTarget(r); setError(""); }}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors"
                            title="عكس المعاملة"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* New transaction modal */}
      {showNew && (
        <TransactionFormModal
          error={error}
          loading={createTxMutation.isPending}
          onClose={() => { setShowNew(false); setError(""); }}
          onSubmit={(body) => createTxMutation.mutate(body)}
        />
      )}

      {/* Reverse confirm modal */}
      {reverseTarget && (
        <ReverseModal
          tx={reverseTarget}
          error={error}
          loading={reverseMutation.isPending}
          onClose={() => { setReverseTarget(null); setError(""); }}
          onConfirm={(notes) => reverseMutation.mutate({ txId: reverseTarget.id, notes })}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New transaction form modal
// ─────────────────────────────────────────────────────────────────────────────

function TransactionFormModal({
  error,
  loading,
  onClose,
  onSubmit,
}: {
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [type, setType] = useState<"WITHDRAWAL" | "RETURN">("WITHDRAWAL");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const accountsQ = useListTreasuryAccounts();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ type, amount, transactionDate: date, treasuryAccountId, referenceNumber: referenceNumber || undefined, notes: notes || undefined });
  }

  return (
    <Modal title="تسجيل معاملة" open={true} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">نوع المعاملة *</label>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as "WITHDRAWAL" | "RETURN")}>
            <option value="WITHDRAWAL">سحب (من الخزينة للجمعية)</option>
            <option value="RETURN">عودة (من الجمعية للخزينة)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">المبلغ *</label>
            <input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">التاريخ *</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">حساب الخزينة *</label>
          <select className={inputCls} value={treasuryAccountId} onChange={(e) => setTreasuryAccountId(e.target.value)} required>
            <option value="">اختر حساباً...</option>
            {accountsQ.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">رقم المرجع</label>
          <input className={inputCls} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors disabled:opacity-60">
            {loading ? "جارٍ التسجيل..." : "تسجيل"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reverse transaction confirm modal
// ─────────────────────────────────────────────────────────────────────────────

function ReverseModal({
  tx,
  error,
  loading,
  onClose,
  onConfirm,
}: {
  tx: AssocTx;
  error: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <Modal title="تأكيد عكس المعاملة" open={true} onClose={onClose}>
      <div className="space-y-4 mt-2">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-bold mb-1">تحذير</p>
          <p>سيتم إنشاء قيد عكسي لإلغاء أثر هذه المعاملة. لن يتم حذف أي سجل مالي.</p>
          <p className="mt-2">المبلغ: <strong>{money(tx.amount)}</strong> — النوع: <strong>{tx.type === "WITHDRAWAL" ? "سحب" : "عودة"}</strong></p>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">سبب العكس</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري..." />
        </div>
        {error && <p className="text-rose-600 text-xs font-semibold">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => onConfirm(notes)}
            disabled={loading}
            className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
          >
            {loading ? "جارٍ العكس..." : "تأكيد العكس"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Report
// ─────────────────────────────────────────────────────────────────────────────

function ReportTab({ canReport }: { canReport: boolean }) {
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "CLOSED">("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (search) params.set("search", search);

  const q = useQuery<Association[]>({
    queryKey: ["/api/associations/report", statusFilter, search],
    queryFn: () => customFetch<Association[]>(`/api/associations?${params}`),
    enabled: canReport,
  });

  const totalWithdrawals = q.data?.reduce((s, a) => s + a.totalWithdrawals, 0) ?? 0;
  const totalReturns = q.data?.reduce((s, a) => s + a.totalReturns, 0) ?? 0;
  const totalBalance = totalWithdrawals - totalReturns;

  if (!canReport) {
    return <p className="text-slate-400 text-sm py-8 text-center">ليس لديك صلاحية عرض التقارير.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-40"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "ACTIVE" | "CLOSED")}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">كل الحالات</option>
            <option value="ACTIVE">نشطة</option>
            <option value="CLOSED">مغلقة</option>
          </select>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors print:hidden"
        >
          <Printer size={16} /> طباعة
        </button>
      </div>

      {/* Summary row */}
      <div className="flex flex-wrap gap-3 mb-5">
        <SumCard label="إجمالي السحوبات" value={money(totalWithdrawals)} color="text-rose-600" />
        <SumCard label="إجمالي العودات" value={money(totalReturns)} color="text-emerald-700" />
        <SumCard label="صافي الرصيد" value={money(totalBalance)} color={totalBalance > 0 ? "text-amber-600" : totalBalance < 0 ? "text-blue-600" : "text-slate-700"} />
      </div>

      {q.isLoading && <p className="text-slate-400 text-sm py-8 text-center">جارٍ التحميل...</p>}
      {!q.isLoading && (!q.data || q.data.length === 0) && (
        <p className="text-slate-400 text-sm py-8 text-center">لا توجد بيانات.</p>
      )}
      {q.data && q.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                {["اسم الجمعية", "الحالة", "إجمالي السحب", "إجمالي العودة", "الرصيد", "حالة الحساب"].map((h) => (
                  <th key={h} className="text-right font-bold py-2 px-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.map((a) => (
                <tr key={a.id} className="text-slate-700">
                  <td className="py-2 px-3 font-bold">{a.name}</td>
                  <td className="py-2 px-3"><StatusBadge status={a.status} /></td>
                  <td className="py-2 px-3 font-bold text-rose-600">{money(a.totalWithdrawals)}</td>
                  <td className="py-2 px-3 font-bold text-emerald-700">{money(a.totalReturns)}</td>
                  <td className="py-2 px-3"><BalanceBadge balance={a.balance} /></td>
                  <td className="py-2 px-3"><AccountStatusBadge balance={a.balance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4: Statement
// ─────────────────────────────────────────────────────────────────────────────

function StatementTab() {
  const [assocId, setAssocId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayStr());

  const assocQ = useQuery<Association[]>({
    queryKey: ["/api/associations"],
    queryFn: () => customFetch<Association[]>("/api/associations"),
  });

  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);

  const txQ = useQuery<TxList>({
    queryKey: ["/api/associations", assocId, "statement", fromDate, toDate],
    queryFn: () => customFetch<TxList>(`/api/associations/${assocId}/transactions?${params}`),
    enabled: !!assocId,
  });

  const selectedAssoc = assocQ.data?.find((a) => a.id === assocId);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">الجمعية</label>
            <select value={assocId} onChange={(e) => setAssocId(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[220px]">
              <option value="">اختر جمعية...</option>
              {assocQ.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">من تاريخ</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">إلى تاريخ</label>
            <input type="date" className="border border-slate-200 rounded-xl px-3 py-2 text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors print:hidden"
        >
          <Printer size={16} /> طباعة
        </button>
      </div>

      {!assocId && <p className="text-slate-400 text-sm py-8 text-center">يرجى اختيار جمعية لعرض كشف الحساب.</p>}

      {assocId && selectedAssoc && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex flex-wrap gap-6">
          <div>
            <p className="text-xs font-bold text-amber-600">الجمعية</p>
            <p className="font-black text-slate-800">{selectedAssoc.name}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-amber-600">الحالة</p>
            <StatusBadge status={selectedAssoc.status} />
          </div>
          {selectedAssoc.expectedReturnDate && (
            <div>
              <p className="text-xs font-bold text-amber-600">تاريخ العودة المتوقع</p>
              <p className="font-bold text-slate-700">{selectedAssoc.expectedReturnDate}</p>
            </div>
          )}
        </div>
      )}

      {assocId && txQ.data && (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            <SumCard label="إجمالي السحب" value={money(txQ.data.totalWithdrawals)} color="text-rose-600" />
            <SumCard label="إجمالي العودة" value={money(txQ.data.totalReturns)} color="text-emerald-700" />
            <SumCard label="الرصيد" value={money(txQ.data.balance)} color={txQ.data.balance > 0 ? "text-amber-600" : txQ.data.balance < 0 ? "text-blue-600" : "text-slate-700"} />
          </div>

          {txQ.data.rows.length === 0 && <p className="text-slate-400 text-sm py-8 text-center">لا توجد معاملات في هذه الفترة.</p>}
          {txQ.data.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200">
                    {["التاريخ", "النوع", "المبلغ", "الرصيد المتراكم", "ملاحظات"].map((h) => (
                      <th key={h} className="text-right font-bold py-2 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txQ.data.rows.map((r) => (
                    <tr key={r.id} className={`text-slate-700 ${r.isReversed ? "opacity-40 line-through" : ""}`}>
                      <td className="py-2 px-3 whitespace-nowrap">{r.transactionDate}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${r.type === "WITHDRAWAL" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {r.type === "WITHDRAWAL" ? "سحب" : "عودة"}
                          {r.reversalOfId && " (عكسي)"}
                          {r.isReversed && " (محوّل)"}
                        </span>
                      </td>
                      <td className={`py-2 px-3 font-bold ${r.type === "WITHDRAWAL" ? "text-rose-600" : "text-emerald-700"}`}>{money(r.amount)}</td>
                      <td className="py-2 px-3 font-black text-amber-700">{money(r.runningBalance)}</td>
                      <td className="py-2 px-3 text-xs text-slate-500">{r.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {assocId && txQ.isLoading && <p className="text-slate-400 text-sm py-8 text-center">جارٍ التحميل...</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function SumCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-5 py-3 border border-slate-100">
      <p className="text-xs text-slate-500 font-semibold">{label}</p>
      <p className={`text-lg font-black ${color ?? "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "ACTIVE" | "CLOSED" }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
      status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
    }`}>
      {status === "ACTIVE" ? <CheckCircle2 size={11} /> : <X size={11} />}
      {status === "ACTIVE" ? "نشطة" : "مغلقة"}
    </span>
  );
}

function BalanceBadge({ balance }: { balance: number }) {
  const color = balance > 0 ? "text-amber-700 font-bold" : balance < 0 ? "text-blue-600 font-bold" : "text-slate-500";
  return <span className={color}>{money(balance)}</span>;
}

function AccountStatusBadge({ balance }: { balance: number }) {
  if (balance > 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
      <AlertCircle size={11} /> رصيد مستحق
    </span>
  );
  if (balance < 0) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
      <MinusCircle size={11} /> رصيد دائن
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
      <CheckCircle2 size={11} /> مصفّى
    </span>
  );
}
