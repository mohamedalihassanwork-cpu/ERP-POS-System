import { useState } from "react";
import {
  Boxes,
  Search,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import {
  useListStock,
  useListWarehouses,
  useSearchProducts,
  getSearchProductsQueryKey,
  useGetProduct,
  getGetProductQueryKey,
  useCreateAdjustment,
  ApiError,
  type StockItem,
  type Product,
  type ProductVariant,
  type AdjustmentLineType,
} from "@workspace/api-client-react";
import { normalizeBarcodeInput } from "@/lib/barcode-input";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";

const PAGE_SIZE = 15;
const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

export function StockPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("inventory.manage");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const warehousesQuery = useListWarehouses({ includeInactive: false });
  const query = useListStock({
    page,
    pageSize: PAGE_SIZE,
    search: appliedSearch || undefined,
    warehouseId: warehouseId || undefined,
    lowStockOnly: lowStockOnly || undefined,
  });

  const totalPages = query.data
    ? Math.max(Math.ceil(query.data.total / PAGE_SIZE), 1)
    : 1;

  function applySearch() {
    setPage(1);
    setAppliedSearch(search.trim());
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="المخزون"
          subtitle="أرصدة الكميات لكل صنف في كل مخزن"
          icon={<Boxes size={24} />}
          action={
            canManage ? (
              <button
                onClick={() => setAdjusting(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 shrink-0"
                data-testid="button-new-adjustment"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">تسوية مخزون</span>
              </button>
            ) : undefined
          }
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(normalizeBarcodeInput(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="بحث بالاسم أو رمز الصنف أو الباركود..."
              className={inputClass}
              style={{ paddingRight: "2.5rem" }}
              data-testid="input-stock-search"
            />
          </div>
          <select
            value={warehouseId}
            onChange={(e) => {
              setPage(1);
              setWarehouseId(e.target.value);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-medium text-slate-700"
            data-testid="select-stock-warehouse"
          >
            <option value="">كل المخازن</option>
            {(warehousesQuery.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 px-2 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(e) => {
                setPage(1);
                setLowStockOnly(e.target.checked);
              }}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-low-stock"
            />
            المنخفض فقط
          </label>
          <button
            onClick={applySearch}
            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition"
            data-testid="button-stock-search"
          >
            بحث
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {query.isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : query.isError ? (
            <p className="text-red-500 text-center py-16">تعذّر تحميل المخزون.</p>
          ) : query.data && query.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-bold px-6 py-4">المنتج</th>
                    <th className="text-right font-bold px-6 py-4">رمز الصنف</th>
                    <th className="text-right font-bold px-6 py-4">اللون / المقاس</th>
                    <th className="text-right font-bold px-6 py-4">المخزن</th>
                    <th className="text-center font-bold px-6 py-4">الكمية</th>
                    <th className="text-center font-bold px-6 py-4">حد الطلب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data.items.map((s: StockItem) => {
                    const low = s.quantity <= s.reorderPoint;
                    return (
                      <tr
                        key={`${s.variantId}-${s.warehouseId}`}
                        className="hover:bg-slate-50"
                        data-testid={`row-stock-${s.variantId}-${s.warehouseId}`}
                      >
                        <td className="px-6 py-4 font-bold text-slate-800">
                          {s.productName}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                          {s.sku}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {[s.colorName, s.sizeName].filter(Boolean).join(" / ") ||
                            "—"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {s.warehouseName}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`font-black text-lg ${
                              s.quantity === 0
                                ? "text-red-600"
                                : low
                                  ? "text-orange-600"
                                  : "text-slate-800"
                            }`}
                          >
                            {s.quantity}
                          </span>
                          {low && (
                            <div className="text-[10px] text-orange-500 font-bold mt-1 flex items-center justify-center gap-1">
                              <AlertTriangle size={11} /> منخفض
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center text-slate-500">
                          {s.reorderPoint}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-16">
              لا توجد أرصدة مخزون.
            </p>
          )}

          {query.data && query.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                صفحة {page} من {totalPages} — {query.data.total} صنف
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-stock-prev"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-stock-next"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {adjusting && (
        <AdjustmentModal
          warehouses={warehousesQuery.data ?? []}
          onClose={() => setAdjusting(false)}
          onSaved={() => setAdjusting(false)}
        />
      )}
    </div>
  );
}

interface AdjustLine {
  variantId: string;
  label: string;
  type: AdjustmentLineType;
  quantity: string;
}

function AdjustmentModal({
  warehouses,
  onClose,
  onSaved,
}: {
  warehouses: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useCreateAdjustment();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<AdjustLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addLine(variantId: string, label: string) {
    if (lines.some((l) => l.variantId === variantId)) return;
    setLines((prev) => [
      ...prev,
      { variantId, label, type: "ADJUSTMENT_IN", quantity: "1" },
    ]);
  }

  function updateLine(variantId: string, patch: Partial<AdjustLine>) {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  async function handle() {
    setError(null);
    if (!warehouseId) return setError("يجب اختيار مخزن.");
    if (lines.length === 0) return setError("أضف صنفاً واحداً على الأقل.");
    for (const l of lines) {
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1)
        return setError("الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر.");
    }
    try {
      await mutation.mutateAsync({
        data: {
          warehouseId,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({
            variantId: l.variantId,
            type: l.type,
            quantity: Number(l.quantity),
          })),
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/inventory/movements"],
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تنفيذ التسوية."));
    }
  }

  return (
    <Modal open onClose={onClose} title="تسوية مخزون" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              المخزن <span className="text-red-500">*</span>
            </label>
            <select
              className={inputClass}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              data-testid="select-adjustment-warehouse"
            >
              <option value="" disabled>
                اختر مخزناً
              </option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              ملاحظات
            </label>
            <input
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="سبب التسوية..."
              data-testid="input-adjustment-notes"
            />
          </div>
        </div>

        <VariantPicker onPick={addLine} existing={lines.map((l) => l.variantId)} />

        {lines.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-right font-bold px-4 py-2">الصنف</th>
                  <th className="text-right font-bold px-4 py-2">النوع</th>
                  <th className="text-right font-bold px-4 py-2 w-28">الكمية</th>
                  <th className="px-4 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.variantId} data-testid={`adjust-line-${l.variantId}`}>
                    <td className="px-4 py-2 text-slate-700">{l.label}</td>
                    <td className="px-4 py-2">
                      <select
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-500"
                        value={l.type}
                        onChange={(e) =>
                          updateLine(l.variantId, {
                            type: e.target.value as AdjustmentLineType,
                          })
                        }
                        data-testid={`select-line-type-${l.variantId}`}
                      >
                        <option value="ADJUSTMENT_IN">إضافة</option>
                        <option value="ADJUSTMENT_OUT">خصم</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-amber-500"
                        value={l.quantity}
                        onChange={(e) =>
                          updateLine(l.variantId, { quantity: e.target.value })
                        }
                        data-testid={`input-line-qty-${l.variantId}`}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => removeLine(l.variantId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                        data-testid={`button-remove-line-${l.variantId}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <div
            className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
            data-testid="text-adjustment-error"
          >
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
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-adjustment"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            تنفيذ التسوية
          </button>
        </div>
      </div>
    </Modal>
  );
}

function VariantPicker({
  onPick,
  existing,
}: {
  onPick: (variantId: string, label: string) => void;
  existing: string[];
}) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const searchParams = { q: applied, limit: 10 };
  const searchQuery = useSearchProducts(searchParams, {
    query: {
      enabled: applied.length > 0,
      queryKey: getSearchProductsQueryKey(searchParams),
    },
  });
  const productId = selectedProduct?.id ?? "";
  const detailQuery = useGetProduct(productId, {
    query: {
      enabled: Boolean(selectedProduct),
      queryKey: getGetProductQueryKey(productId),
    },
  });

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
      <label className="block text-sm font-bold text-slate-700">
        إضافة صنف للتسوية
      </label>
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setApplied(search.trim())}
          placeholder="ابحث عن منتج بالاسم أو الرمز..."
          className={inputClass}
          data-testid="input-variant-search"
        />
        <button
          onClick={() => setApplied(search.trim())}
          className="px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition shrink-0"
          data-testid="button-variant-search"
        >
          بحث
        </button>
      </div>

      {!selectedProduct && applied.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {searchQuery.isLoading ? (
            <p className="text-slate-400 text-sm py-2">جارٍ البحث...</p>
          ) : (searchQuery.data ?? []).length > 0 ? (
            (searchQuery.data ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className="w-full text-right px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition text-sm font-medium text-slate-700"
                data-testid={`product-result-${p.id}`}
              >
                {p.name}
              </button>
            ))
          ) : (
            <p className="text-slate-400 text-sm py-2">لا توجد نتائج.</p>
          )}
        </div>
      )}

      {selectedProduct && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">
              {selectedProduct.name}
            </span>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-xs text-amber-600 font-bold hover:underline"
              data-testid="button-clear-product"
            >
              تغيير المنتج
            </button>
          </div>
          {detailQuery.isLoading ? (
            <p className="text-slate-400 text-sm py-2">جارٍ تحميل التنويعات...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(detailQuery.data?.variants ?? []).map((v: ProductVariant) => {
                const added = existing.includes(v.id);
                const label = `${selectedProduct.name} (${[v.colorName, v.sizeName].filter(Boolean).join(" / ")})`;
                return (
                  <button
                    key={v.id}
                    disabled={added}
                    onClick={() => onPick(v.id, label)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:border-amber-500 hover:text-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    data-testid={`variant-pick-${v.id}`}
                  >
                    {[v.colorName, v.sizeName].filter(Boolean).join(" / ") || v.sku}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
