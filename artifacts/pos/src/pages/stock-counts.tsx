import { useEffect, useState } from "react";
import {
  ClipboardList,
  Loader2,
  Plus,
  CheckCircle2,
  XCircle,
  Eye,
  Save,
} from "lucide-react";
import {
  useListStockCounts,
  useGetStockCount,
  useCreateStockCount,
  useUpdateStockCountItems,
  useCompleteStockCount,
  useCancelStockCount,
  useListWarehouses,
  ApiError,
  type StockCountSummary,
  type StockCountItem,
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

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "مفتوح", cls: "bg-amber-100 text-amber-700" },
  COMPLETED: { label: "مكتمل", cls: "bg-emerald-100 text-emerald-700" },
  CANCELLED: { label: "ملغي", cls: "bg-slate-100 text-slate-500" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${m.cls}`}>
      {m.label}
    </span>
  );
}

export function StockCountsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("inventory.manage");
  const queryClient = useQueryClient();

  const listQuery = useListStockCounts({ page: 1, pageSize: 100 });
  const counts = listQuery.data?.items ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="الجرد المخزني"
          subtitle="جلسات جرد المخزون وتسوية الفروقات"
          icon={<ClipboardList size={24} />}
          action={
            canManage ? (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-5 py-2.5 rounded-xl hover:bg-amber-400 transition"
                data-testid="button-new-count"
              >
                <Plus size={18} />
                جرد جديد
              </button>
            ) : undefined
          }
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {listQuery.isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="animate-spin inline" size={24} />
            </div>
          ) : counts.length === 0 ? (
            <div className="p-12 text-center text-slate-400">لا توجد جلسات جرد بعد</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right p-4 font-bold">رقم الجرد</th>
                  <th className="text-right p-4 font-bold">المخزن</th>
                  <th className="text-center p-4 font-bold">الأصناف</th>
                  <th className="text-center p-4 font-bold">الحالة</th>
                  <th className="text-right p-4 font-bold">التاريخ</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {counts.map((c: StockCountSummary) => (
                  <tr key={c.id} data-testid={`row-count-${c.id}`}>
                    <td className="p-4 font-mono font-bold text-slate-700">
                      {c.countNumber}
                    </td>
                    <td className="p-4 text-slate-600">{c.warehouseName ?? "—"}</td>
                    <td className="p-4 text-center text-slate-500">{c.itemCount}</td>
                    <td className="p-4 text-center">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="p-4 text-slate-500 text-xs">{fmtDate(c.createdAt)}</td>
                    <td className="p-4 text-left">
                      <button
                        onClick={() => setDetailId(c.id)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                        data-testid={`button-view-count-${c.id}`}
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateCountModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            invalidate();
            setDetailId(id);
          }}
        />
      )}

      {detailId && (
        <CountDetailModal
          id={detailId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

function CreateCountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createMutation = useCreateStockCount();
  const warehousesQuery = useListWarehouses();
  const warehouses = warehousesQuery.data ?? [];

  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    if (!warehouseId) {
      setError("اختر المخزن");
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        data: { warehouseId, notes: notes.trim() || null },
      });
      onCreated(created.id);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر بدء الجرد"));
    }
  }

  return (
    <Modal open onClose={onClose} title="جرد مخزني جديد">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-1.5">المخزن</label>
          <select
            className={inputClass}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            data-testid="select-count-warehouse"
          >
            <option value="">اختر المخزن</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-1.5">
            سيتم تجميد الكميات المتوقعة للأصناف الحالية في هذا المخزن.
          </p>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-1.5">ملاحظات</label>
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-count-notes"
          />
        </div>
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
            data-testid="button-cancel-count"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-amber-400 transition disabled:opacity-60"
            data-testid="button-submit-count"
          >
            {createMutation.isPending && <Loader2 className="animate-spin" size={18} />}
            بدء الجرد
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CountDetailModal({
  id,
  canManage,
  onClose,
  onChanged,
}: {
  id: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const detailQuery = useGetStockCount(id);
  const saveMutation = useUpdateStockCountItems();
  const completeMutation = useCompleteStockCount();
  const cancelMutation = useCancelStockCount();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const c = detailQuery.data;
  const isOpen = c?.status === "OPEN";

  useEffect(() => {
    if (c) {
      const init: Record<string, string> = {};
      for (const it of c.items) {
        init[it.id] =
          it.countedQuantity != null ? String(it.countedQuantity) : "";
      }
      setCounted(init);
    }
  }, [c]);

  function invalidateDetail() {
    void queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock-counts"] });
  }

  async function handleSave() {
    if (!c) return;
    setError("");
    const items = c.items
      .filter((it) => counted[it.id] !== "" && counted[it.id] != null)
      .map((it) => ({
        itemId: it.id,
        countedQuantity: Math.max(0, Number(counted[it.id]) || 0),
      }));
    if (items.length === 0) {
      setError("أدخل كمية واحدة على الأقل");
      return;
    }
    try {
      await saveMutation.mutateAsync({ id, data: { items } });
      invalidateDetail();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ الجرد"));
    }
  }

  async function act(kind: "complete" | "cancel") {
    setError("");
    try {
      if (kind === "complete") await completeMutation.mutateAsync({ id });
      else await cancelMutation.mutateAsync({ id });
      onChanged();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تنفيذ العملية"));
    }
  }

  function diff(it: StockCountItem): number | null {
    const v = counted[it.id];
    if (v === "" || v == null) return null;
    return (Number(v) || 0) - it.expectedQuantity;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={c ? `جرد ${c.countNumber}` : "تفاصيل الجرد"}
      maxWidth="max-w-3xl"
    >
      {detailQuery.isLoading || !c ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={c.status} />
            <span className="text-slate-500">{c.warehouseName}</span>
          </div>
          {c.notes && <p className="text-sm text-slate-500">{c.notes}</p>}

          <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-right p-3 font-bold">الصنف</th>
                  <th className="text-center p-3 font-bold">المتوقع</th>
                  <th className="text-center p-3 font-bold">الفعلي</th>
                  <th className="text-center p-3 font-bold">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.items.map((it) => {
                  const d = diff(it);
                  return (
                    <tr key={it.id}>
                      <td className="p-3">
                        <div className="font-bold text-slate-700">
                          {it.productName ?? "—"}
                          {it.variantLabel ? ` — ${it.variantLabel}` : ""}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">{it.sku}</div>
                      </td>
                      <td className="p-3 text-center text-slate-500">
                        {it.expectedQuantity}
                      </td>
                      <td className="p-3 text-center">
                        {isOpen && canManage ? (
                          <input
                            type="number"
                            min={0}
                            value={counted[it.id] ?? ""}
                            onChange={(e) =>
                              setCounted((prev) => ({
                                ...prev,
                                [it.id]: e.target.value,
                              }))
                            }
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-center outline-none focus:border-amber-500"
                            data-testid={`input-counted-${it.id}`}
                          />
                        ) : (
                          <span className="font-bold text-slate-700">
                            {it.countedQuantity ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center font-bold">
                        {d == null ? (
                          <span className="text-slate-300">—</span>
                        ) : d === 0 ? (
                          <span className="text-slate-400">0</span>
                        ) : d > 0 ? (
                          <span className="text-emerald-600">+{d}</span>
                        ) : (
                          <span className="text-red-500">{d}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">
              {error}
            </div>
          )}

          {canManage && isOpen && (
            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => void act("cancel")}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-red-600 font-bold hover:bg-red-50 transition disabled:opacity-60"
                data-testid="button-cancel-count-action"
              >
                <XCircle size={18} />
                إلغاء الجرد
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-slate-700 font-bold border border-slate-200 hover:bg-slate-50 transition disabled:opacity-60"
                data-testid="button-save-count"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Save size={18} />
                )}
                حفظ الكميات
              </button>
              <button
                onClick={() => void act("complete")}
                disabled={completeMutation.isPending}
                className="flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-emerald-400 transition disabled:opacity-60"
                data-testid="button-complete-count-action"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                اعتماد وتسوية
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
