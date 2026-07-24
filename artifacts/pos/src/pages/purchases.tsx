import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ShoppingBag,
  Search,
  Loader2,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  PackagePlus,
  List,
  UserPlus,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { openCashDrawer } from "@/lib/printer-settings";
import {
  useListPurchases,
  useGetPurchase,
  useCreatePurchase,
  useCreateSupplier,
  useListSuppliers,
  useListWarehouses,
  useSearchProducts,
  getSearchProductsQueryKey,
  useGetProduct,
  useUpdatePurchase,
  useListTreasuryAccounts,
  ApiError,
  type Product,
  type ProductVariant,
} from "@workspace/api-client-react";
import { normalizeBarcodeInput } from "@/lib/barcode-input";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { QuickProductModal } from "@/components/quick-product-modal";
import { useAuth } from "@/lib/auth";

const CUR = "ج.م";

function money(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    PAID: ["مدفوعة", "bg-green-50 text-green-700"],
    PARTIAL: ["جزئية", "bg-amber-50 text-amber-700"],
    CONFIRMED: ["آجلة", "bg-red-50 text-red-700"],
    DRAFT: ["مسودة", "bg-slate-100 text-slate-600"],
  };
  const [label, cls] = map[status] ?? [status, "bg-slate-100 text-slate-600"];
  return <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${cls}`}>{label}</span>;
}

function returnBadge(status: string) {
  if (status === "NONE") return null;
  const map: Record<string, [string, string]> = {
    PARTIAL: ["مرتجع جزئي", "bg-orange-50 text-orange-700"],
    FULL: ["مرتجع كامل", "bg-red-50 text-red-700"],
  };
  const [label, cls] = map[status] ?? [status, "bg-slate-100 text-slate-600"];
  return <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${cls}`}>{label}</span>;
}

type Tab = "new" | "history";
type PayMethod = "CASH" | "CARD" | "INSTAPAY" | "WALLET" | "CREDIT";

interface PurchaseLine {
  variantId: string;
  productName: string;
  colorName: string | null;
  sizeName: string | null;
  sku: string;
  costPrice: number;
  quantity: number;
}

export function TreasurySelect({
  value,
  onChange,
  hideBalance,
}: {
  value: string;
  onChange: (v: string) => void;
  hideBalance?: boolean;
}) {
  const accountsQuery = useListTreasuryAccounts();
  const accounts = (accountsQuery.data ?? []).filter((a) => a.isActive);

  useEffect(() => {
    if (!value && accounts.length > 0) {
      const mainSafe = accounts.find((a) => a.type === "MAIN_SAFE") || accounts[0];
      if (mainSafe) onChange(mainSafe.id);
    }
  }, [accounts, value, onChange]);

  return (
    <div className="mt-2">
      <label className="block text-xs font-bold text-slate-700 mb-1.5">
        الخزينة
      </label>
      <select
        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="select-treasury"
      >
        <option value="">— اختر الخزينة —</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} {hideBalance ? "" : `(${money(a.balance)})`}
          </option>
        ))}
      </select>
    </div>
  );
}

const PAY_METHODS: { value: Exclude<PayMethod, "CREDIT">; label: string }[] = [
  { value: "CASH", label: "نقدي" },
  { value: "CARD", label: "فيزا / كارد" },
  { value: "INSTAPAY", label: "إنستاباي" },
  { value: "WALLET", label: "محفظة" },
];

export function PurchasesPage() {
  const [tab, setTab] = useState<Tab>("new");

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader title="المشتريات" subtitle="فواتير الشراء من الموردين" icon={<ShoppingBag size={24} />} />

        <div className="flex gap-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-2 w-fit">
          <button
            onClick={() => setTab("new")}
            className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition ${
              tab === "new" ? "bg-amber-500 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
            data-testid="tab-new-purchase"
          >
            <PackagePlus size={18} /> فاتورة جديدة
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition ${
              tab === "history" ? "bg-amber-500 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
            data-testid="tab-purchase-history"
          >
            <List size={18} /> سجل المشتريات
          </button>
        </div>

        {tab === "new" ? <NewPurchase onDone={() => setTab("history")} /> : <PurchaseHistory />}
      </div>
    </div>
  );
}

// ===========================================================================
// NEW PURCHASE FORM
// ===========================================================================

function NewPurchase({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const suppliersQuery = useListSuppliers({ page: 1, pageSize: 100 });
  const suppliers = suppliersQuery.data?.items ?? [];
  const warehousesQuery = useListWarehouses({});
  const warehouses = warehousesQuery.data ?? [];

  const [supplierId, setSupplierId] = useState("");
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [showQuickProduct, setShowQuickProduct] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const activeWarehouseId = warehouseId || warehouses[0]?.id || "";
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");

  const [search, setSearch] = useState("");
  const searchQuery = useSearchProducts(
    { q: search, limit: 12 },
    { query: { enabled: search.trim().length > 0, queryKey: getSearchProductsQueryKey({ q: search, limit: 12 }) } },
  );
  const results = searchQuery.data ?? [];
  const [pickProduct, setPickProduct] = useState<Product | null>(null);

  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const [payMethod, setPayMethod] = useState<Exclude<PayMethod, "CREDIT">>("CASH");
  const [paidInput, setPaidInput] = useState("");
  const [onCredit, setOnCredit] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [treasuryAccountId, setTreasuryAccountId] = useState("");

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.costPrice * l.quantity, 0), [lines]);
  const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const taxAmount = Math.max(Number(tax) || 0, 0);
  const total = subtotal - discountAmount + taxAmount;
  const upfront = onCredit ? Number(paidInput) || 0 : total;
  const creditPortion = Math.max(total - upfront, 0);

  function addVariant(product: Product, variant: ProductVariant) {
    const cost = Number(variant.costPrice ?? product.baseCostPrice ?? 0);
    setLines((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) {
        return prev.map((l) => (l.variantId === variant.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productName: product.name,
          colorName: variant.colorName ?? null,
          sizeName: variant.sizeName ?? null,
          sku: variant.sku,
          costPrice: cost,
          quantity: 1,
        },
      ];
    });
  }

  function updateQty(variantId: string, delta: number) {
    setLines((prev) =>
      prev.map((l) => (l.variantId === variantId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0),
    );
  }

  function updateCost(variantId: string, value: string) {
    setLines((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, costPrice: Number(value) || 0 } : l)));
  }

  function removeLine(variantId: string) {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function reset() {
    setLines([]);
    setDiscount("");
    setTax("");
    setPaidInput("");
    setOnCredit(false);
    setPayMethod("CASH");
    setNotes("");
    setSupplierInvoiceNumber("");
    setInvoiceDate("");
    setError(null);
  }

  const createPurchase = useCreatePurchase();

  async function submit() {
    setError(null);
    if (!supplierId) {
      setError("اختر المورد");
      return;
    }
    if (!activeWarehouseId) {
      setError("اختر المخزن");
      return;
    }
    if (lines.length === 0) {
      setError("أضف منتجات للفاتورة");
      return;
    }

    const payments: { method: PayMethod; amount: number; treasuryAccountId?: string }[] = [];
    if (onCredit) {
      if (upfront > 0) payments.push({ method: payMethod, amount: upfront, treasuryAccountId: treasuryAccountId || undefined });
      if (creditPortion > 0) payments.push({ method: "CREDIT", amount: creditPortion });
    } else {
      payments.push({ method: payMethod, amount: total, treasuryAccountId: treasuryAccountId || undefined });
    }

    try {
      const result = await createPurchase.mutateAsync({
        data: {
          supplierId,
          warehouseId: activeWarehouseId,
          supplierInvoiceNumber: supplierInvoiceNumber || null,
          invoiceDate: invoiceDate || null,
          discountAmount,
          taxAmount,
          notes: notes || null,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, costPrice: l.costPrice })),
          payments,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/purchases/invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury"] });
      
      // Real-time Reports Sync
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/inventory-stock"] });
      reset();
      
      void result;
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ فاتورة الشراء"));
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: items */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">المورد</label>
            <div className="flex gap-2">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                data-testid="select-supplier"
              >
                <option value="">— اختر المورد —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowCreateSupplier(true)}
                title="إضافة مورد جديد"
                className="shrink-0 flex items-center justify-center w-10 h-10 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-xl transition"
                data-testid="button-add-supplier-inline"
              >
                <UserPlus size={18} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">المخزن المستلِم</label>
            <select
              value={activeWarehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="select-warehouse"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم فاتورة المورد</label>
            <input
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              placeholder="اختياري"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="input-supplier-invoice"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ الفاتورة</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="input-invoice-date"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(normalizeBarcodeInput(e.target.value))}
                placeholder="بحث عن منتج لإضافته..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                data-testid="input-purchase-search"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowQuickProduct(true)}
              className="px-4 py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl font-bold text-sm transition flex items-center gap-2 border border-amber-200 shrink-0"
              title="إضافة منتج سريع"
            >
              <PackagePlus size={18} />
              صنف جديد
            </button>
          </div>
          {search.trim() && (
            <div className="mt-3 max-h-56 overflow-y-auto">
              {searchQuery.isLoading ? (
                <div className="p-6 text-center text-slate-400">
                  <Loader2 className="animate-spin inline" size={20} />
                </div>
              ) : results.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">لا توجد نتائج</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPickProduct(p)}
                      className="text-right bg-slate-50 border border-slate-200 rounded-xl p-3 hover:border-amber-400 transition"
                      data-testid={`result-product-${p.id}`}
                    >
                      <div className="font-bold text-slate-800 text-sm line-clamp-1">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-1">متوفر: {p.totalStock}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
            <div className="col-span-5">المنتج</div>
            <div className="col-span-3 text-center">سعر التكلفة</div>
            <div className="col-span-2 text-center">الكمية</div>
            <div className="col-span-2 text-left">الإجمالي</div>
          </div>
          {lines.length === 0 ? (
            <div className="p-10 text-center text-slate-300 text-sm">لم تتم إضافة أصناف بعد</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lines.map((l) => (
                <div key={l.variantId} className="grid grid-cols-12 gap-2 items-center p-3" data-testid={`line-${l.variantId}`}>
                  <div className="col-span-5 flex items-center gap-2">
                    <button
                      onClick={() => removeLine(l.variantId)}
                      className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50"
                      data-testid={`button-remove-${l.variantId}`}
                    >
                      <Trash2 size={16} />
                    </button>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{l.productName}</h4>
                      <p className="text-xs text-slate-500">
                        {[l.sizeName && `مقاس ${l.sizeName}`, l.colorName].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <input
                      value={l.costPrice}
                      onChange={(e) => updateCost(l.variantId, e.target.value)}
                      inputMode="decimal"
                      dir="ltr"
                      className="w-24 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      data-testid={`input-cost-${l.variantId}`}
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-center">
                    <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                      <button onClick={() => updateQty(l.variantId, 1)} className="p-1.5 text-slate-600 hover:bg-slate-200" data-testid={`button-inc-${l.variantId}`}>
                        <Plus size={14} />
                      </button>
                      <div className="w-8 text-center font-bold text-slate-800 text-sm">{l.quantity}</div>
                      <button onClick={() => updateQty(l.variantId, -1)} className="p-1.5 text-slate-600 hover:bg-slate-200" data-testid={`button-dec-${l.variantId}`}>
                        <Minus size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 text-left font-black text-slate-800 text-sm">{money(l.costPrice * l.quantity)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: totals + payment */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">الدفع</h3>
          <div className="grid grid-cols-2 gap-2">
            {PAY_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPayMethod(m.value)}
                className={`p-2.5 rounded-xl border-2 text-xs font-bold transition ${
                  payMethod === m.value ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-100 text-slate-500 hover:border-slate-200"
                }`}
                data-testid={`button-method-${m.value}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <TreasurySelect value={treasuryAccountId} onChange={setTreasuryAccountId} />

          <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
            <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} className="w-4 h-4 accent-amber-500" data-testid="checkbox-on-credit" />
            <span className="text-sm font-bold text-slate-700">شراء آجل (على حساب المورد)</span>
          </label>

          {onCredit && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">المبلغ المدفوع مقدماً</label>
              <input
                value={paidInput}
                onChange={(e) => setPaidInput(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                placeholder="0.00"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 px-3 font-black text-lg focus:outline-none focus:border-amber-500"
                data-testid="input-paid"
              />
              {creditPortion > 0 && (
                <p className="mt-1.5 text-sm font-bold text-red-600" data-testid="text-credit">
                  يُضاف للحساب: {money(creditPortion)} {CUR}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">خصم</label>
              <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0.00" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500" data-testid="input-discount" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">ضريبة</label>
              <input value={tax} onChange={(e) => setTax(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0.00" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500" data-testid="input-tax" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" data-testid="input-notes" />
          </div>
        </div>

        <div className="bg-slate-800 text-white p-5 rounded-2xl">
          <div className="space-y-2 mb-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>المجموع الفرعي:</span>
              <span className="font-bold">{money(subtotal)} {CUR}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-300">
                <span>الخصم:</span>
                <span className="font-bold">- {money(discountAmount)} {CUR}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate-300">
                <span>الضريبة:</span>
                <span className="font-bold">{money(taxAmount)} {CUR}</span>
              </div>
            )}
            <div className="h-px bg-slate-700 my-1" />
            <div className="flex justify-between items-end">
              <span className="font-bold">الإجمالي:</span>
              <span className="font-black text-3xl text-amber-400" data-testid="text-total">
                {money(total)}
                <span className="text-base text-amber-200 mr-1">{CUR}</span>
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-3 bg-red-500/20 text-red-200 text-sm font-bold rounded-xl p-3" data-testid="text-error">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={createPurchase.isPending || lines.length === 0}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-slate-900 rounded-xl py-3.5 font-black flex items-center justify-center gap-2 transition active:scale-95"
            data-testid="button-save-purchase"
          >
            {createPurchase.isPending ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
            حفظ فاتورة الشراء
          </button>
        </div>
      </div>

      {showCreateSupplier && (
        <CreateSupplierModal
          onClose={() => setShowCreateSupplier(false)}
          onCreated={(id) => {
            setSupplierId(id);
            setShowCreateSupplier(false);
          }}
        />
      )}

      {showQuickProduct && (
        <QuickProductModal
          onClose={() => setShowQuickProduct(false)}
          onCreated={(product, variant) => {
            addVariant(product, variant);
            setShowQuickProduct(false);
          }}
        />
      )}

      {pickProduct && (
        <VariantPicker
          product={pickProduct}
          onClose={() => setPickProduct(null)}
          onPick={(variant) => {
            addVariant(pickProduct, variant);
            setPickProduct(null);
          }}
        />
      )}
    </div>
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
  const query = useGetProduct(product.id);
  const variants = query.data?.variants ?? [];

  return (
    <Modal open onClose={onClose} title={product.name} maxWidth="max-w-lg">
      {query.isLoading ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : variants.length === 0 ? (
        <div className="py-8 text-center text-slate-400">لا توجد متغيرات لهذا المنتج</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => onPick(v)}
              className="text-right bg-slate-50 border border-slate-200 rounded-xl p-3 hover:border-amber-400 transition"
              data-testid={`variant-${v.id}`}
            >
              <div className="font-bold text-slate-800 text-sm">
                {[v.sizeName && `مقاس ${v.sizeName}`, v.colorName].filter(Boolean).join(" • ") || v.sku}
              </div>
              <div className="text-xs text-slate-400 mt-1">تكلفة: {money(v.costPrice ?? product.baseCostPrice ?? 0)} {CUR}</div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ===========================================================================
// PURCHASE HISTORY
// ===========================================================================

function PurchaseHistory() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const query = useListPurchases({ page, pageSize, search: search || undefined });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("purchases.edit");
  const [, navigate] = useLocation();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="بحث برقم الفاتورة أو فاتورة المورد..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            data-testid="input-search-purchases"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {query.isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="animate-spin inline" size={28} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">لا توجد فواتير شراء</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold">
              <tr>
                <th className="text-right p-4">رقم الفاتورة</th>
                <th className="text-right p-4">المورد</th>
                <th className="text-right p-4">التاريخ</th>
                <th className="text-left p-4">الإجمالي</th>
                <th className="text-left p-4">المتبقي</th>
                <th className="text-center p-4">الحالة</th>
                <th className="text-center p-4">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((pur) => (
                <tr key={pur.id} className="hover:bg-slate-50" data-testid={`purchase-row-${pur.id}`}>
                  <td className="p-4 font-bold text-slate-800">
                    <div className="flex items-center gap-2">
                      {pur.invoiceNumber}
                      {returnBadge(pur.returnStatus)}
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">{pur.supplierName ?? "-"}</td>
                  <td className="p-4 text-slate-500 text-xs">{dateTime(pur.createdAt)}</td>
                  <td className="p-4 text-left font-bold text-slate-800">{money(pur.totalAmount)} {CUR}</td>
                  <td className="p-4 text-left font-bold text-red-600">{Number(pur.remainingBalance) > 0 ? `${money(pur.remainingBalance)} ${CUR}` : "—"}</td>
                  <td className="p-4 text-center">{statusBadge(pur.status)}</td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setViewId(pur.id)}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        title="عرض التفاصيل"
                        data-testid={`button-view-${pur.id}`}
                      >
                        <Eye size={18} />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => setEditId(pur.id)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="تعديل بيانات الفاتورة"
                            data-testid={`button-edit-${pur.id}`}
                          >
                            <Pencil size={16} />
                          </button>
                          {pur.returnStatus !== "FULL" && (
                            <button
                              onClick={() => navigate(`/purchase-returns?voidId=${pur.id}`)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="إلغاء فاتورة الشراء — إنشاء مرتجع كامل"
                              data-testid={`button-void-${pur.id}`}
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100">
            <span className="text-sm text-slate-500">
              صفحة {page} من {totalPages} — {total} فاتورة
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50" data-testid="button-prev-page">
                <ChevronRight size={18} />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50" data-testid="button-next-page">
                <ChevronLeft size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {viewId && <PurchaseDetailModal id={viewId} onClose={() => setViewId(null)} />}
      {editId && <EditPurchaseModal id={editId} onClose={() => setEditId(null)} />}
    </div>
  );
}

// ── Edit Purchase Metadata Modal ──────────────────────────────────────────────

function EditPurchaseModal({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useGetPurchase(id);
  const pur = query.data;
  const mutation = useUpdatePurchase();
  const [notes, setNotes] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pur && !initialized) {
    setNotes(pur.notes ?? "");
    setSupplierInvoiceNumber(pur.supplierInvoiceNumber ?? "");
    setInitialized(true);
  }

  async function handleSave() {
    setError(null);
    try {
      await mutation.mutateAsync({
        id,
        data: {
          notes: notes || null,
          supplierInvoiceNumber: supplierInvoiceNumber || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/purchases/invoices"] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string } | undefined;
        setError(data?.error ?? "حدث خطأ أثناء الحفظ");
      } else {
        setError("حدث خطأ أثناء الحفظ");
      }
    }
  }

  return (
    <Modal open onClose={onClose} title={pur ? `تعديل فاتورة شراء ${pur.invoiceNumber}` : "تعديل الفاتورة"} maxWidth="max-w-md">
      {query.isLoading || !pur ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">رقم فاتورة المورد</label>
            <input
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              placeholder="رقم فاتورة المورد (اختياري)"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition text-sm"
              data-testid="input-supplier-invoice-number"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">الملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="ملاحظات على فاتورة الشراء..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition text-sm resize-none"
              data-testid="input-purchase-notes"
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            يمكن تعديل البيانات الوصفية فقط. لإلغاء الفاتورة، استخدم زر الإلغاء لإنشاء مرتجع كامل.
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-slate-900 font-bold rounded-xl hover:bg-amber-400 transition disabled:opacity-50"
              data-testid="button-save-purchase-edit"
            >
              {mutation.isPending ? <Loader2 className="animate-spin" size={16} /> : null}
              حفظ
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PurchaseDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useGetPurchase(id);
  const pur = query.data;

  return (
    <Modal open onClose={onClose} title={pur ? `فاتورة شراء ${pur.invoiceNumber}` : "تفاصيل الفاتورة"} maxWidth="max-w-2xl">
      {query.isLoading || !pur ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">المورد</p>
              <p className="font-bold text-slate-800">{pur.supplierName ?? "-"}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">المخزن</p>
              <p className="font-bold text-slate-800">{pur.warehouseName ?? "-"}</p>
            </div>
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold">
                <tr>
                  <th className="text-right p-3">المنتج</th>
                  <th className="text-center p-3">الكمية</th>
                  <th className="text-center p-3">التكلفة</th>
                  <th className="text-left p-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pur.items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3">
                      <div className="font-bold text-slate-800">{it.productName}</div>
                      <div className="text-xs text-slate-500">
                        {[it.sizeName && `مقاس ${it.sizeName}`, it.colorName].filter(Boolean).join(" • ")}
                        {(it.returnedQuantity ?? 0) > 0 && <span className="text-red-500 mr-2">(مرتجع {it.returnedQuantity})</span>}
                      </div>
                    </td>
                    <td className="p-3 text-center font-bold">{it.quantity}</td>
                    <td className="p-3 text-center">{money(it.costPrice)}</td>
                    <td className="p-3 text-left font-bold">{money(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">المجموع الفرعي</span>
              <span className="font-bold">{money(pur.subtotal)} {CUR}</span>
            </div>
            {Number(pur.taxAmount) > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">الضريبة</span>
                <span className="font-bold">{money(pur.taxAmount)} {CUR}</span>
              </div>
            )}
            <div className="flex justify-between text-base border-t border-slate-200 pt-2">
              <span className="font-bold text-slate-700">الإجمالي</span>
              <span className="font-black text-amber-600">{money(pur.totalAmount)} {CUR}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">المدفوع</span>
              <span className="font-bold">{money(pur.amountPaid)} {CUR}</span>
            </div>
            {Number(pur.remainingBalance) > 0 && (
              <div className="flex justify-between text-red-600">
                <span>المتبقي على الحساب</span>
                <span className="font-bold">{money(pur.remainingBalance)} {CUR}</span>
              </div>
            )}
          </div>

          {pur.payments.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">طرق الدفع</p>
              <div className="flex flex-wrap gap-2">
                {pur.payments.map((p) => (
                  <span key={p.id} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                    {p.method}: {money(p.amount)} {CUR}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function CreateSupplierModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createMutation = useCreateSupplier();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("اسم المورد مطلوب.");
    if (!phone.trim()) return setError("رقم الهاتف مطلوب.");

    try {
      const res = await createMutation.mutateAsync({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          address: null,
          taxNumber: null,
          notes: null,
        },
      });
      // Global MutationCache handles lookup cache invalidation
      onCreated(res.id);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إضافة المورد."));
    }
  }

  return (
    <Modal open onClose={onClose} title="مورد جديد">
      <form onSubmit={handle} className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">الاسم</label>
          <input
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">رقم الهاتف</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition text-left"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {createMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : "إضافة"}
        </button>
      </form>
    </Modal>
  );
}
