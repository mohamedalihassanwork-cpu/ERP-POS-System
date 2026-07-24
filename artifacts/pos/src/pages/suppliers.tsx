import { useState } from "react";
import {
  Truck,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Wallet,
  FileText,
  CheckCircle2,
  XCircle,
  Settings2,
  AlertCircle,
} from "lucide-react";
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useGetSupplierStatement,
  useCreateSupplierPayment,
  useListTreasuryAccounts,
  useAdjustSupplierBalance,
  ApiError,
  type Supplier,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

function money(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function balanceBadge(balance: string) {
  const n = Number(balance);
  if (n > 0)
    return (
      <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-lg text-xs font-bold">
        مستحق له {money(balance)}
      </span>
    );
  if (n < 0)
    return (
      <span className="text-green-700 bg-green-50 px-2.5 py-1 rounded-lg text-xs font-bold">
        مدفوع مقدماً {money(Math.abs(n))}
      </span>
    );
  return <span className="text-slate-500 text-xs font-bold">0.00</span>;
}

export function SuppliersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("suppliers.create");
  const canEdit = hasPermission("suppliers.edit");
  const canDelete = hasPermission("suppliers.delete");

  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const query = useListSuppliers({ search: search || undefined, includeInactive, page: 1, pageSize: 100 });

  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [adjusting, setAdjusting] = useState<Supplier | null>(null);
  const [statementFor, setStatementFor] = useState<Supplier | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });

  const items = query.data?.items ?? [];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="الموردون"
          subtitle="إدارة الموردين وحساباتهم"
          icon={<Truck size={24} />}
          action={
            canCreate ? (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 shrink-0"
                data-testid="button-add-supplier"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">مورد جديد</span>
              </button>
            ) : undefined
          }
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className={`${inputClass} pr-10`}
              placeholder="بحث بالاسم أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-supplier"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-include-inactive-suppliers"
            />
            إظهار المعطّلين
          </label>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {query.isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : query.isError ? (
            <p className="text-red-500 text-center py-16">تعذّر تحميل الموردين.</p>
          ) : items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-right font-bold px-6 py-4">الاسم</th>
                  <th className="text-right font-bold px-6 py-4">الهاتف</th>
                  <th className="text-right font-bold px-6 py-4">الرقم الضريبي</th>
                  <th className="text-right font-bold px-6 py-4">الرصيد</th>
                  <th className="text-right font-bold px-6 py-4">الحالة</th>
                  <th className="text-left font-bold px-6 py-4">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50"
                    data-testid={`row-supplier-${s.id}`}
                  >
                    <td className="px-6 py-4 font-bold text-slate-800">{s.name}</td>
                    <td className="px-6 py-4 text-slate-500 font-mono">{s.phone}</td>
                    <td className="px-6 py-4 text-slate-500">{s.taxNumber || "—"}</td>
                    <td className="px-6 py-4">{balanceBadge(s.currentBalance)}</td>
                    <td className="px-6 py-4">
                      {s.isActive ? (
                        <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <CheckCircle2 size={14} /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <XCircle size={14} /> معطّل
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setStatementFor(s)}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="كشف حساب"
                          data-testid={`button-statement-supplier-${s.id}`}
                        >
                          <FileText size={16} />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => setPaying(s)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-green-50 hover:text-green-600 transition"
                            title="سداد دفعة"
                            data-testid={`button-pay-supplier-${s.id}`}
                          >
                            <Wallet size={16} />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => setEditing(s)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
                            title="تعديل"
                            data-testid={`button-edit-supplier-${s.id}`}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => setAdjusting(s)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition"
                            title="تسوية رصيد"
                            data-testid={`button-adjust-supplier-${s.id}`}
                          >
                            <Settings2 size={16} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleting(s)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                            title="حذف"
                            data-testid={`button-delete-supplier-${s.id}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 text-center py-16">لا يوجد موردون.</p>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <SupplierModal
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteSupplierModal
          supplier={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            invalidate();
            setDeleting(null);
          }}
        />
      )}

      {paying && (
        <SupplierPaymentModal
          supplier={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            invalidate();
            setPaying(null);
          }}
        />
      )}

      {adjusting && (
        <AdjustSupplierModal
          supplier={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            invalidate();
            setAdjusting(null);
          }}
        />
      )}

      {statementFor && (
        <SupplierStatementModal
          supplier={statementFor}
          onClose={() => setStatementFor(null)}
        />
      )}
    </div>
  );
}

function SupplierModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [taxNumber, setTaxNumber] = useState(initial?.taxNumber ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handle() {
    setError(null);
    if (!name.trim()) return setError("اسم المورد مطلوب.");
    if (!phone.trim()) return setError("رقم الهاتف مطلوب.");
    try {
      const data = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim() || null,
        taxNumber: taxNumber.trim() || null,
        notes: notes.trim() || null,
      };
      if (isEdit && initial) {
        await updateMutation.mutateAsync({ id: initial.id, data });
      } else {
        await createMutation.mutateAsync({ data });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ المورد."));
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "تعديل المورد" : "مورد جديد"}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الاسم <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-supplier-name"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الهاتف <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="input-supplier-phone"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">العنوان</label>
          <input
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            data-testid="input-supplier-address"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">الرقم الضريبي</label>
          <input
            className={inputClass}
            value={taxNumber}
            onChange={(e) => setTaxNumber(e.target.value)}
            data-testid="input-supplier-tax"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-supplier-notes"
          />
        </div>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handle()}
            disabled={submitting}
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-supplier"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteSupplierModal({
  supplier,
  onClose,
  onDeleted,
}: {
  supplier: Supplier;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteSupplier();
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: supplier.id });
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حذف المورد."));
    }
  }

  return (
    <Modal open onClose={onClose} title="تأكيد الحذف">
      <div className="space-y-4">
        <p className="text-slate-600">
          هل تريد حذف المورد{" "}
          <span className="font-bold text-slate-800">{supplier.name}</span>؟ سيتم تعطيله.
        </p>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handle()}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-confirm-delete-supplier"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            حذف
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SupplierPaymentModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mutation = useCreateSupplierPayment();
  const treasury = useListTreasuryAccounts();
  const [amount, setAmount] = useState("");
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accounts = treasury.data ?? [];

  async function handle() {
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError("أدخل مبلغاً صحيحاً.");
    if (!treasuryAccountId) return setError("اختر حساب الخزينة.");
    try {
      await mutation.mutateAsync({
        id: supplier.id,
        data: { amount: amt, treasuryAccountId, notes: notes.trim() || null },
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تسجيل الدفعة."));
    }
  }

  return (
    <Modal open onClose={onClose} title={`سداد دفعة — ${supplier.name}`}>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm">
          <span className="text-slate-500">الرصيد الحالي: </span>
          <span className="font-bold text-slate-800">{money(supplier.currentBalance)}</span>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            المبلغ <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="input-payment-amount"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            حساب الخزينة <span className="text-red-500">*</span>
          </label>
          <select
            className={inputClass}
            value={treasuryAccountId}
            onChange={(e) => setTreasuryAccountId(e.target.value)}
            data-testid="select-payment-treasury"
          >
            <option value="">اختر...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
          <input
            className={inputClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-payment-notes"
          />
        </div>
        {error && (
          <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
            {error}
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handle()}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-payment"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            سداد
          </button>
        </div>
      </div>
    </Modal>
  );
}

const TX_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "فاتورة شراء",
  PAYMENT: "دفعة",
  PURCHASE_RETURN: "مرتجع شراء",
  OPENING: "رصيد افتتاحي",
  ADJUSTMENT: "تسوية",
};

function SupplierStatementModal({
  supplier,
  onClose,
}: {
  supplier: Supplier;
  onClose: () => void;
}) {
  const query = useGetSupplierStatement(supplier.id);
  const items = query.data?.items ?? [];

  return (
    <Modal open onClose={onClose} title={`كشف حساب — ${supplier.name}`}>
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm flex justify-between">
          <span className="text-slate-500">الرصيد الحالي</span>
          <span className="font-bold text-slate-800">{money(supplier.currentBalance)}</span>
        </div>
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-100">
          {query.isLoading ? (
            <p className="text-slate-400 text-center py-10">جارٍ التحميل...</p>
          ) : items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-right font-bold px-4 py-3">التاريخ</th>
                  <th className="text-right font-bold px-4 py-3">النوع</th>
                  <th className="text-right font-bold px-4 py-3">الفاتورة</th>
                  <th className="text-right font-bold px-4 py-3">مدين</th>
                  <th className="text-right font-bold px-4 py-3">دائن</th>
                  <th className="text-right font-bold px-4 py-3">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((t) => (
                  <tr key={t.id} data-testid={`row-statement-${t.id}`}>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {TX_TYPE_LABELS[t.type] ?? t.type}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {t.invoiceNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-red-600">
                      {Number(t.debit) ? money(t.debit) : "—"}
                    </td>
                    <td className="px-4 py-3 text-green-600">
                      {Number(t.credit) ? money(t.credit) : "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {money(t.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 text-center py-10">لا توجد حركات.</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
        >
          إغلاق
        </button>
      </div>
    </Modal>
  );
}

function AdjustSupplierModal({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [newBalance, setNewBalance] = useState((Number(supplier.currentBalance)).toString());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjustApi = useAdjustSupplierBalance();

  const handle = async () => {
    setError(null);
    const balanceNum = parseFloat(newBalance);
    if (isNaN(balanceNum)) {
      setError("الرصيد الجديد غير صحيح");
      return;
    }

    setSubmitting(true);
    try {
      await adjustApi.mutateAsync({
        id: supplier.id,
        data: {
          newBalance: balanceNum,
          notes: notes || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "حدث خطأ أثناء تعديل الرصيد."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="تسوية رصيد مورد">
      <div className="space-y-4 pt-2">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        <div className="bg-slate-50 p-4 rounded-xl mb-4 border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">المورد</p>
          <p className="font-bold text-slate-900 text-lg">{supplier.name}</p>
          <p className="text-sm text-slate-500 mt-2">الرصيد الحالي</p>
          <p className="font-bold text-amber-600 text-lg">{money(supplier.currentBalance)}</p>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">الرصيد الجديد</label>
          <input
            type="number"
            autoFocus
            step="0.01"
            value={newBalance}
            onChange={(e) => setNewBalance(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="input-adjust-balance"
          />
          <p className="text-xs text-slate-500 mt-1">أدخل الرصيد النهائي المطلوب (بالموجب إذا كان لنا عنده، وبالسالب إذا كان له عندنا، أو صفر إذا تمت تصفيته)</p>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">سبب التعديل (ملاحظات)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
            rows={2}
            data-testid="input-adjust-notes"
            placeholder="مثال: تصحيح خطأ في مرتجع"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handle()}
            disabled={submitting}
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-adjust"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            حفظ التعديل
          </button>
        </div>
      </div>
    </Modal>
  );
}
