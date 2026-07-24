import { useState } from "react";
import {
  ArrowLeftRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import {
  useListTransfers,
  useGetTransfer,
  useCreateTransfer,
  useCompleteTransfer,
  useCancelTransfer,
  useListWarehouses,
  useSearchProducts,
  useGetProduct,
  getListTransfersQueryKey,
  getSearchProductsQueryKey,
  ApiError,
  type Product,
  type ProductVariant,
  type TransferSummary,
} from "@workspace/api-client-react";
import { normalizeBarcodeInput } from "@/lib/barcode-input";
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
  PENDING: { label: "قيد الانتظار", cls: "bg-amber-100 text-amber-700" },
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

type DraftItem = {
  variantId: string;
  label: string;
  sku: string;
  quantity: number;
};

export function TransfersPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("inventory.manage");
  const queryClient = useQueryClient();

  const listQuery = useListTransfers({ page: 1, pageSize: 100 });
  const transfers = listQuery.data?.items ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["/api/inventory/transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="التحويلات المخزنية"
          subtitle="تحويل المنتجات بين المخازن"
          icon={<ArrowLeftRight size={24} />}
          action={
            canManage ? (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-5 py-2.5 rounded-xl hover:bg-amber-400 transition"
                data-testid="button-new-transfer"
              >
                <Plus size={18} />
                تحويل جديد
              </button>
            ) : undefined
          }
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {listQuery.isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="animate-spin inline" size={24} />
            </div>
          ) : transfers.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              لا توجد تحويلات بعد
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right p-4 font-bold">رقم التحويل</th>
                  <th className="text-right p-4 font-bold">من</th>
                  <th className="text-right p-4 font-bold">إلى</th>
                  <th className="text-center p-4 font-bold">الأصناف</th>
                  <th className="text-center p-4 font-bold">الحالة</th>
                  <th className="text-right p-4 font-bold">التاريخ</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t: TransferSummary) => (
                  <tr key={t.id} data-testid={`row-transfer-${t.id}`}>
                    <td className="p-4 font-mono font-bold text-slate-700">
                      {t.transferNumber}
                    </td>
                    <td className="p-4 text-slate-600">{t.fromWarehouseName ?? "—"}</td>
                    <td className="p-4 text-slate-600">{t.toWarehouseName ?? "—"}</td>
                    <td className="p-4 text-center text-slate-500">{t.itemCount}</td>
                    <td className="p-4 text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="p-4 text-slate-500 text-xs">{fmtDate(t.createdAt)}</td>
                    <td className="p-4 text-left">
                      <button
                        onClick={() => setDetailId(t.id)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                        data-testid={`button-view-transfer-${t.id}`}
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
        <CreateTransferModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {detailId && (
        <TransferDetailModal
          id={detailId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

function CreateTransferModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const createMutation = useCreateTransfer();
  const warehousesQuery = useListWarehouses();
  const warehouses = warehousesQuery.data ?? [];

  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState("");
  const [pickProduct, setPickProduct] = useState<Product | null>(null);

  const [search, setSearch] = useState("");
  const searchQuery = useSearchProducts(
    { q: search, limit: 12 },
    {
      query: {
        enabled: search.trim().length > 0,
        queryKey: getSearchProductsQueryKey({ q: search, limit: 12 }),
      },
    },
  );
  const results = searchQuery.data ?? [];

  function addVariant(product: Product, variant: ProductVariant) {
    const label =
      [variant.sizeName && `مقاس ${variant.sizeName}`, variant.colorName]
        .filter(Boolean)
        .join(" • ") || product.name;
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === variant.id);
      if (existing) {
        return prev.map((i) =>
          i.variantId === variant.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          label: `${product.name} — ${label}`,
          sku: variant.sku,
          quantity: 1,
        },
      ];
    });
    setPickProduct(null);
    setSearch("");
  }

  function setQty(variantId: string, qty: number) {
    setItems((prev) =>
      prev.map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i)),
    );
  }

  function removeItem(variantId: string) {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }

  async function handleSubmit() {
    setError("");
    if (!fromWarehouseId || !toWarehouseId) {
      setError("اختر المخزن المصدر والمخزن الوجهة");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setError("لا يمكن التحويل لنفس المخزن");
      return;
    }
    if (items.length === 0) {
      setError("أضف صنفاً واحداً على الأقل");
      return;
    }
    if (items.some((i) => i.quantity < 1)) {
      setError("الكميات يجب أن تكون أكبر من صفر");
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          fromWarehouseId,
          toWarehouseId,
          notes: notes.trim() || null,
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        },
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إنشاء التحويل"));
    }
  }

  return (
    <Modal open onClose={onClose} title="تحويل مخزني جديد" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              من مخزن
            </label>
            <select
              className={inputClass}
              value={fromWarehouseId}
              onChange={(e) => setFromWarehouseId(e.target.value)}
              data-testid="select-from-warehouse"
            >
              <option value="">اختر المخزن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              إلى مخزن
            </label>
            <select
              className={inputClass}
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
              data-testid="select-to-warehouse"
            >
              <option value="">اختر المخزن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-600 mb-1.5">
            بحث عن منتج لإضافته
          </label>
          <div className="relative">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className={`${inputClass} pr-10`}
              value={search}
              onChange={(e) => setSearch(normalizeBarcodeInput(e.target.value))}
              placeholder="اسم المنتج أو الباركود"
              data-testid="input-transfer-search"
            />
          </div>
          {search.trim() && (
            <div className="mt-2 border border-slate-100 rounded-xl max-h-48 overflow-y-auto bg-slate-50">
              {searchQuery.isLoading ? (
                <div className="p-4 text-center text-slate-400">
                  <Loader2 className="animate-spin inline" size={18} />
                </div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  لا توجد نتائج
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPickProduct(p)}
                      className="w-full text-right p-3 hover:bg-white transition text-sm"
                      data-testid={`transfer-result-${p.id}`}
                    >
                      <span className="font-bold text-slate-700">{p.name}</span>
                      <span className="text-slate-400 mr-2">
                        ({p.variantCount ?? 0} صنف)
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right p-3 font-bold">الصنف</th>
                  <th className="text-center p-3 font-bold w-28">الكمية</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((i) => (
                  <tr key={i.variantId}>
                    <td className="p-3">
                      <div className="font-bold text-slate-700">{i.label}</div>
                      <div className="text-xs text-slate-400 font-mono">{i.sku}</div>
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        min={1}
                        value={i.quantity}
                        onChange={(e) =>
                          setQty(i.variantId, Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-center outline-none focus:border-amber-500"
                        data-testid={`input-qty-${i.variantId}`}
                      />
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => removeItem(i.variantId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
                        data-testid={`button-remove-${i.variantId}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-slate-600 mb-1.5">
            ملاحظات
          </label>
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="input-transfer-notes"
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
            data-testid="button-cancel-transfer"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-amber-400 transition disabled:opacity-60"
            data-testid="button-submit-transfer"
          >
            {createMutation.isPending && <Loader2 className="animate-spin" size={18} />}
            إنشاء التحويل
          </button>
        </div>
      </div>

      {pickProduct && (
        <VariantPicker
          product={pickProduct}
          onClose={() => setPickProduct(null)}
          onPick={(v) => addVariant(pickProduct, v)}
        />
      )}
    </Modal>
  );
}

function VariantPicker({
  product,
  onClose,
  onPick,
}: {
  product: Product;
  onClose: () => void;
  onPick: (variant: ProductVariant) => void;
}) {
  const detailQuery = useGetProduct(product.id);
  const variants = detailQuery.data?.variants ?? [];

  return (
    <Modal open onClose={onClose} title={product.name} maxWidth="max-w-xl">
      {detailQuery.isLoading ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : variants.length === 0 ? (
        <p className="text-center text-slate-400 py-6">لا توجد أصناف</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onPick(v)}
              className="p-3 rounded-xl border border-slate-200 text-right hover:border-amber-400 hover:shadow-sm transition"
              data-testid={`transfer-variant-${v.id}`}
            >
              <div className="font-bold text-slate-800 text-sm">
                {[v.sizeName && `مقاس ${v.sizeName}`, v.colorName]
                  .filter(Boolean)
                  .join(" • ") || v.sku}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                متوفر: {v.totalStock ?? 0}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function TransferDetailModal({
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
  const detailQuery = useGetTransfer(id);
  const completeMutation = useCompleteTransfer();
  const cancelMutation = useCancelTransfer();
  const [error, setError] = useState("");
  const t = detailQuery.data;

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

  return (
    <Modal
      open
      onClose={onClose}
      title={t ? `تحويل ${t.transferNumber}` : "تفاصيل التحويل"}
      maxWidth="max-w-2xl"
    >
      {detailQuery.isLoading || !t ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={t.status} />
            <span className="text-slate-500">
              {t.fromWarehouseName} ← {t.toWarehouseName}
            </span>
          </div>
          {t.notes && <p className="text-sm text-slate-500">{t.notes}</p>}

          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-right p-3 font-bold">الصنف</th>
                  <th className="text-center p-3 font-bold">الكمية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3">
                      <div className="font-bold text-slate-700">
                        {it.productName ?? "—"}
                        {it.variantLabel ? ` — ${it.variantLabel}` : ""}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">{it.sku}</div>
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700">
                      {it.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">
              {error}
            </div>
          )}

          {canManage && t.status === "PENDING" && (
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => void act("cancel")}
                disabled={cancelMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-red-600 font-bold hover:bg-red-50 transition disabled:opacity-60"
                data-testid="button-cancel-transfer-action"
              >
                <XCircle size={18} />
                إلغاء التحويل
              </button>
              <button
                onClick={() => void act("complete")}
                disabled={completeMutation.isPending}
                className="flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-emerald-400 transition disabled:opacity-60"
                data-testid="button-complete-transfer-action"
              >
                {completeMutation.isPending ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                تأكيد الاستلام
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
