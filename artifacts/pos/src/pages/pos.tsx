import { useMemo, useRef, useState, useEffect } from "react";
import {
  Search,
  Trash2,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
  Landmark,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Loader2,
  UserPlus,
  X,
  ShoppingCart,
  Printer,
} from "lucide-react";
import {
  useSearchProducts,
  getSearchProductsQueryKey,
  useGetProduct,
  useListWarehouses,
  useListCustomers,
  useCreateSale,
  useCreateCustomer,
  useListSuspendedOrders,
  useCreateSuspendedOrder,
  useDeleteSuspendedOrder,
  useGetStoreSettings,
  ApiError,
  type Product,
  type ProductVariant,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useBarcodeInput } from "@/lib/barcode-input";
import { Modal } from "@/components/modal";
import { ThermalReceipt, type ReceiptData } from "@/components/thermal-receipt";
import { PrintPortal } from "@/components/print-portal";
import { printReceipt, openCashDrawer } from "@/lib/printer-settings";

const CUR = "ج.م";

function money(v: string | number): string {
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

type PayMethod = "CASH" | "CARD" | "INSTAPAY" | "WALLET" | "CREDIT";

interface CartLine {
  variantId: string;
  productName: string;
  colorName: string | null;
  sizeName: string | null;
  sku: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

const PAY_METHODS: { value: Exclude<PayMethod, "CREDIT">; label: string; icon: typeof Banknote }[] = [
  { value: "CASH", label: "نقدي", icon: Banknote },
  { value: "CARD", label: "فيزا / كارد", icon: CreditCard },
  { value: "INSTAPAY", label: "إنستاباي", icon: Smartphone },
  { value: "WALLET", label: "محفظة", icon: Wallet },
];

export function POSPage() {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const canReturn = hasPermission("sales.return");
  const canCustomDate = hasPermission("sales.custom_date");

  const warehousesQuery = useListWarehouses({ includeInactive: false });
  const warehouses = warehousesQuery.data ?? [];
  const [warehouseId, setWarehouseId] = useState<string>("");
  const activeWarehouseId = warehouseId || warehouses[0]?.id || "";

  // ---- search -------------------------------------------------------------
  // useBarcodeInput tracks inter-key timing to discriminate between:
  //   - Barcode scanner: rapid burst (< 60ms between keys) → normalizes Arabic
  //     keyboard-layout characters to English barcode content automatically.
  //   - Human typing: slow keystrokes (> 100ms) → Arabic passes through as-is.
  const {
    value: search,
    onChange: handleSearchChange,
    onKeyDown: handleScannerKeyDown,
    reset: resetSearch,
  } = useBarcodeInput();

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(timer);
  }, [search]);

  const searchQuery = useSearchProducts(
    { q: debouncedSearch, limit: 12 },
    {
      query: {
        enabled: debouncedSearch.trim().length > 0,
        queryKey: getSearchProductsQueryKey({ q: debouncedSearch, limit: 12 }),
      },
    },
  );
  const results = searchQuery.data ?? [];

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Let the barcode hook process Enter first (scanner flow)
    handleScannerKeyDown(e);
    if (e.key === "Enter" && !e.defaultPrevented) {
      e.preventDefault();
      if (results.length === 1 && results[0].variantCount === 1) {
        handlePickProduct(results[0]);
        resetSearch();
      }
    }
  }

  // ---- settings & keyboard shortcuts --------------------------------------
  const settingsQuery = useGetStoreSettings();
  const settings = settingsQuery.data;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        document.getElementById("btn-complete-sale")?.click();
      } else if (e.key === "F8") {
        e.preventDefault();
        document.getElementById("btn-reset-sale")?.click();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // ---- variant picker -----------------------------------------------------
  const [pickProduct, setPickProduct] = useState<Product | null>(null);

  // ---- cart ---------------------------------------------------------------
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  type PaymentLine = { method: Exclude<PayMethod, "CREDIT">; amount: string };
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: "CASH", amount: "" }]);
  const [onCredit, setOnCredit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const customersQuery = useListCustomers({ page: 1, pageSize: 100 });
  const customers = customersQuery.data?.items ?? [];
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = subtotal - discountAmount;

  function addVariant(product: Product, variant: ProductVariant) {
    const price = Number(variant.sellingPrice ?? product.basePrice);
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === variant.id);
      if (existing) {
        return prev.map((l) =>
          l.variantId === variant.id
            ? { ...l, quantity: Math.min(l.quantity + 1, Math.max(l.stock, l.quantity + 1)) }
            : l,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productName: product.name,
          colorName: variant.colorName ?? null,
          sizeName: variant.sizeName ?? null,
          sku: variant.sku,
          unitPrice: price,
          quantity: 1,
          stock: variant.totalStock ?? 0,
        },
      ];
    });
  }

  function handlePickProduct(p: Product) {
    if (p.variantCount === 1) {
      // single variant — fetch detail then add directly
      setPickProduct(p);
    } else {
      setPickProduct(p);
    }
  }

  function updateQty(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.variantId === variantId ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  function resetCart() {
    setCart([]);
    setDiscount("");
    setCustomerId("");
    setOnCredit(false);
    setPaymentLines([{ method: "CASH", amount: "" }]);
    setError(null);
  }

  // ---- complete sale ------------------------------------------------------
  const createSale = useCreateSale();
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [customDate, setCustomDate] = useState<string>("");

  // ---- Auto-print after sale --------------------------------------------------
  // When receiptData is set, printReceipt waits for PrintPortal to render, then
  // prints the portal content (silent in Electron, dialog in the browser).
  // The 'afterprint' event fires when the browser print dialog closes — we use
  // it to auto-close the receipt modal and reset the POS for the next sale.
  useEffect(() => {
    if (!receiptData) return;

    let printed = false;

    function handleAfterPrint() {
      printed = true;
      setReceiptData(null);
      setTimeout(() => searchRef.current?.focus(), 100);
    }

    window.addEventListener("afterprint", handleAfterPrint);

    void printReceipt().then(() => {
      if (window.electronAPI) {
        handleAfterPrint();
      }
    });

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      void printed; // suppress lint unused warning
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptData]);
  // ---------------------------------------------------------------------------

  const sumPaidInput = paymentLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const isImplicitTotal = !onCredit && paymentLines.length === 1 && paymentLines[0].amount === "";
  const paidNum = onCredit ? 0 : (isImplicitTotal ? total : sumPaidInput);
  
  const hasCash = paymentLines.some(l => l.method === "CASH");
  const changeDue = hasCash && !onCredit ? Math.max(paidNum - total, 0) : 0;
  const creditPortion = onCredit ? Math.max(total - sumPaidInput, 0) : 0;

  async function completeSale() {
    setError(null);
    if (cart.length === 0) {
      setError("السلة فارغة");
      return;
    }
    if (!activeWarehouseId) {
      setError("اختر المخزن");
      return;
    }
    if (onCredit && !customerId) {
      setError("البيع الآجل يتطلب اختيار عميل");
      return;
    }

    const payments: { method: PayMethod; amount: number }[] = [];
    if (onCredit) {
      paymentLines.forEach(line => {
        const amt = Number(line.amount) || 0;
        if (amt > 0) payments.push({ method: line.method, amount: amt });
      });
      payments.push({ method: "CREDIT", amount: Math.max(total - sumPaidInput, 0) });
    } else {
      if (isImplicitTotal) {
        payments.push({ method: paymentLines[0].method, amount: total });
      } else {
        paymentLines.forEach(line => {
          const amt = Number(line.amount) || 0;
          if (amt > 0) payments.push({ method: line.method, amount: amt });
        });
        
        if (sumPaidInput < total) {
          setError(`المبلغ المدفوع (${money(sumPaidInput)}) أقل من الإجمالي (${money(total)})`);
          return;
        }
      }
    }

    try {
      const result = await createSale.mutateAsync({
        data: {
          warehouseId: activeWarehouseId,
          customerId: customerId || null,
          discountAmount,
          ...(customDate ? { createdAt: new Date(customDate).toISOString() } : {}),
          items: cart.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          payments,
        },
      });
      setReceiptData({
        storeName: settings?.storeName,
        storePhone: settings?.storePhone,
        storeAddress: settings?.storeAddress,
        logoUrl: settings?.logoUrl,
        receiptFooter: settings?.receiptFooter,
        receiptSize: settings?.receiptSize,
        currency: CUR,
        taxEnabled: settings?.taxEnabled,
        taxRate: settings?.taxRate,
        invoiceNumber: result.invoiceNumber,
        customerName: customers.find((c) => c.id === customerId)?.name,
        cashierName: user?.fullName,
        createdAt: customDate ? new Date(customDate).toISOString() : new Date().toISOString(),
        items: cart.map((l) => ({
          productName: l.productName,
          colorName: l.colorName,
          sizeName: l.sizeName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.unitPrice * l.quantity,
        })),
        subtotal,
        discountAmount,
        totalAmount: result.totalAmount,
        payments: result.payments.map(p => ({ method: p.method, amount: p.amount })),
        amountPaid: result.amountPaid,
        changeDue: result.changeDue ?? "0",
      });
      resetCart();
      void queryClient.invalidateQueries({ queryKey: ["/api/sales/invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      
      // Real-time Reports Sync
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/sales-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/inventory-stock"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/top-products"] });
      
      searchRef.current?.focus();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إتمام البيع"));
    }
  }

  // ---- suspend / resume ---------------------------------------------------
  const suspendedQuery = useListSuspendedOrders();
  const suspended = suspendedQuery.data ?? [];
  const createSuspended = useCreateSuspendedOrder();
  const deleteSuspended = useDeleteSuspendedOrder();
  const [showSuspended, setShowSuspended] = useState(false);

  async function suspendOrder() {
    if (cart.length === 0) return;
    try {
      await createSuspended.mutateAsync({
        data: {
          customerId: customerId || null,
          cart: cart as unknown as Record<string, unknown>,
          itemCount: cart.reduce((s, l) => s + l.quantity, 0),
          totalAmount: total,
        },
      });
      resetCart();
      void queryClient.invalidateQueries({ queryKey: ["/api/suspended-orders"] });
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تعليق الطلب"));
    }
  }

  function resumeOrder(cartData: unknown, custId: string | null | undefined) {
    const lines = cartData as CartLine[];
    if (Array.isArray(lines)) {
      setCart(lines);
      setCustomerId(custId ?? "");
    }
    setShowSuspended(false);
  }

  async function removeSuspended(id: string) {
    try {
      await deleteSuspended.mutateAsync({ id });
      void queryClient.invalidateQueries({ queryKey: ["/api/suspended-orders"] });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-100" dir="rtl">
      {/* Left: search + cart */}
      <div className="w-[58%] flex flex-col h-full border-l border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={20}
            />
            <input
              ref={searchRef}
              value={search}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              type="text"
              placeholder="بحث عن منتج بالاسم أو الكود أو الباركود... [F2]"
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl py-3 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              data-testid="input-pos-search"
            />
          </div>
          <select
            value={activeWarehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="select-pos-warehouse"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {/* search results */}
        {search.trim() && (
          <div className="border-b border-slate-100 max-h-64 overflow-y-auto bg-slate-50">
            {searchQuery.isLoading ? (
              <div className="p-6 text-center text-slate-400">
                <Loader2 className="animate-spin inline" size={20} />
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">لا توجد نتائج</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-3">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handlePickProduct(p)}
                    className="text-right bg-white border border-slate-200 rounded-xl p-3 hover:border-amber-400 hover:shadow-sm transition"
                    data-testid={`result-product-${p.id}`}
                  >
                    <div className="font-bold text-slate-800 text-sm line-clamp-1">{p.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-amber-600 font-bold text-sm">
                        {money(p.basePrice)} {CUR}
                      </span>
                      <span className="text-xs text-slate-400">متوفر: {p.totalStock}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* cart table */}
        <div className="grid grid-cols-12 gap-2 p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600">
          <div className="col-span-5">المنتج</div>
          <div className="col-span-2 text-center">السعر</div>
          <div className="col-span-3 text-center">الكمية</div>
          <div className="col-span-2 text-left">الإجمالي</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
              <ShoppingCart size={48} />
              <p className="text-sm font-medium">ابدأ بإضافة المنتجات للسلة</p>
            </div>
          ) : (
            cart.map((l) => (
              <div
                key={l.variantId}
                className="grid grid-cols-12 gap-2 items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm"
                data-testid={`cart-line-${l.variantId}`}
              >
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
                <div className="col-span-2 text-center font-bold text-slate-700 text-sm">
                  {money(l.unitPrice)}
                </div>
                <div className="col-span-3 flex items-center justify-center">
                  <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => updateQty(l.variantId, 1)}
                      className="p-1.5 text-slate-600 hover:bg-slate-200"
                      data-testid={`button-inc-${l.variantId}`}
                    >
                      <Plus size={14} />
                    </button>
                    <div className="w-9 text-center font-bold text-slate-800 text-sm">{l.quantity}</div>
                    <button
                      onClick={() => updateQty(l.variantId, -1)}
                      className="p-1.5 text-slate-600 hover:bg-slate-200"
                      data-testid={`button-dec-${l.variantId}`}
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                </div>
                <div className="col-span-2 text-left font-black text-slate-800">
                  {money(l.unitPrice * l.quantity)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: payment */}
      <div className="w-[42%] bg-white flex flex-col h-full shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
        {/* customer */}
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-800 text-sm">العميل</h3>
            <button
              onClick={() => setShowSuspended(true)}
              className="text-xs font-bold text-amber-600 flex items-center gap-1 hover:text-amber-700"
              data-testid="button-show-suspended"
            >
              <PauseCircle size={14} />
              الطلبات المعلّقة ({suspended.length})
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                if (!e.target.value) setOnCredit(false);
              }}
              className="flex-1 bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              data-testid="select-customer"
            >
              <option value="">عميل نقدي (افتراضي)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCreateCustomer(true)}
              title="إضافة عميل جديد"
              className="shrink-0 flex items-center justify-center w-10 h-10 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-xl transition"
              data-testid="button-add-customer-inline"
            >
              <UserPlus size={18} />
            </button>
          </div>
          
          {canCustomDate && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <label className="font-bold text-slate-800 text-sm">تاريخ الفاتورة</label>
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg py-1.5 px-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                title="اتركه فارغاً لاستخدام الوقت الحالي"
              />
            </div>
          )}
        </div>

        {/* payment methods */}
        <div className="p-4 border-b border-slate-100 flex-1 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-slate-800 text-sm">طرق الدفع</h3>
            <button
              onClick={() => setPaymentLines(prev => [...prev, { method: "CASH", amount: "" }])}
              className="text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition"
            >
              <Plus size={14} /> إضافة دفعة
            </button>
          </div>
          
          <div className="space-y-3">
            {paymentLines.map((line, index) => (
              <div key={index} className="p-3 bg-slate-50 border border-slate-200 rounded-xl relative">
                {paymentLines.length > 1 && (
                  <button
                    onClick={() => setPaymentLines(prev => prev.filter((_, i) => i !== index))}
                    className="absolute top-2 left-2 text-slate-400 hover:text-red-500 bg-white rounded-full p-1 shadow-sm transition"
                  >
                    <X size={14} />
                  </button>
                )}
                
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {PAY_METHODS.map((m) => {
                    const Icon = m.icon;
                    const active = line.method === m.value;
                    return (
                      <button
                        key={m.value}
                        onClick={() => {
                          const newLines = [...paymentLines];
                          newLines[index].method = m.value;
                          setPaymentLines(newLines);
                        }}
                        className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition ${
                          active
                            ? "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-slate-100 bg-white hover:border-slate-200 text-slate-500"
                        }`}
                      >
                        <Icon size={18} className={active ? "text-amber-600" : "text-slate-400"} />
                        <span className="font-bold text-[10px]">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
                
                <div className="relative">
                  <input
                    value={line.amount}
                    onChange={(e) => {
                      const newLines = [...paymentLines];
                      newLines[index].amount = e.target.value;
                      setPaymentLines(newLines);
                    }}
                    inputMode="decimal"
                    placeholder={onCredit ? "0.00" : (isImplicitTotal ? total.toFixed(2) : "0.00")}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg py-2.5 px-3 focus:outline-none focus:border-amber-500 font-bold text-lg"
                    dir="ltr"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    {CUR}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {customerId && (
            <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onCredit}
                onChange={(e) => setOnCredit(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
                data-testid="checkbox-on-credit"
              />
              <span className="text-sm font-bold text-slate-700 flex items-center gap-1">
                <Landmark size={15} /> بيع آجل (على حساب العميل)
              </span>
            </label>
          )}

          <div className="mt-4">
            {changeDue > 0 && (
              <p className="mt-2 text-sm font-bold text-green-600" data-testid="text-change">
                الباقي للعميل: {money(changeDue)} {CUR}
              </p>
            )}
            {onCredit && creditPortion > 0 && (
              <p className="mt-2 text-sm font-bold text-red-600" data-testid="text-credit">
                يُضاف للحساب: {money(creditPortion)} {CUR}
              </p>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">خصم على الفاتورة</label>
            <input
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
              dir="ltr"
              data-testid="input-discount"
            />
          </div>

          {error && (
            <div className="mt-4 bg-red-50 text-red-700 text-sm font-bold rounded-xl p-3" data-testid="text-error">
              {error}
            </div>
          )}
        </div>

        {/* summary + actions */}
        <div className="bg-slate-800 text-white p-5 rounded-t-3xl mt-auto">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-slate-300 text-sm">
              <span>المجموع الفرعي:</span>
              <span className="font-bold">{money(subtotal)} {CUR}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-red-300 text-sm">
                <span>الخصم:</span>
                <span className="font-bold">- {money(discountAmount)} {CUR}</span>
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

          <div className="grid grid-cols-4 gap-2">
            <button
              id="btn-complete-sale"
              onClick={completeSale}
              disabled={createSale.isPending || cart.length === 0}
              className="col-span-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-slate-900 rounded-xl py-3.5 font-black flex items-center justify-center gap-2 transition active:scale-95"
              data-testid="button-complete-sale"
            >
              {createSale.isPending ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
              إتمام البيع [F4]
            </button>
            <button
              onClick={suspendOrder}
              disabled={cart.length === 0}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-xl py-3.5 font-bold flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
              data-testid="button-suspend"
            >
              <PauseCircle size={18} />
              <span className="text-xs">تعليق</span>
            </button>
            <button
              id="btn-reset-sale"
              onClick={resetCart}
              disabled={cart.length === 0}
              className="bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 rounded-xl py-3.5 font-bold flex flex-col items-center justify-center gap-0.5 transition active:scale-95"
              data-testid="button-cancel"
            >
              <XCircle size={18} />
              <span className="text-xs">إلغاء [F8]</span>
            </button>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <button
              type="button"
              onClick={() => void openCashDrawer()}
              className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
              title="فتح الدرج"
              data-testid="button-open-drawer"
            >
              <Banknote size={16} />
              فتح الدرج
            </button>
          </div>
        </div>
      </div>

      {/* variant picker */}
      {pickProduct && (
        <VariantPickerModal
          product={pickProduct}
          onClose={() => setPickProduct(null)}
          onPick={(variant) => {
            addVariant(pickProduct, variant);
            setPickProduct(null);
            resetSearch();
            searchRef.current?.focus();
          }}
        />
      )}

      {/* suspended orders */}
      <Modal open={showSuspended} onClose={() => setShowSuspended(false)} title="الطلبات المعلّقة">
        {suspended.length === 0 ? (
          <p className="text-center text-slate-400 py-8">لا توجد طلبات معلّقة</p>
        ) : (
          <div className="space-y-2">
            {suspended.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
                data-testid={`suspended-${o.id}`}
              >
                <div>
                  <div className="font-bold text-slate-800 text-sm">
                    {o.customerName ?? "عميل نقدي"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {o.itemCount} صنف • {money(o.totalAmount)} {CUR}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      resumeOrder(o.cart, o.customerId);
                      void removeSuspended(o.id);
                    }}
                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600"
                    data-testid={`button-resume-${o.id}`}
                  >
                    استئناف
                  </button>
                  <button
                    onClick={() => void removeSuspended(o.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                    data-testid={`button-delete-suspended-${o.id}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* receipt — shown briefly while auto-print dialog opens */}
      <Modal open={!!receiptData} onClose={() => setReceiptData(null)} title="تمت العملية بنجاح" maxWidth="max-w-md">
        {receiptData && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold text-center flex items-center justify-center gap-2">
              <Printer size={16} className="animate-pulse" />
              جارٍ إرسال الفاتورة للطابعة الحرارية...
            </div>
            <div className="bg-slate-50 p-4 rounded-xl flex justify-center max-h-[50vh] overflow-y-auto">
              <ThermalReceipt data={receiptData} />
            </div>
            {/* hidden print portal */}
            <PrintPortal>
              <ThermalReceipt data={receiptData} forPrint />
            </PrintPortal>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  void printReceipt().then(() => setReceiptData(null));
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 font-bold flex items-center justify-center gap-2"
                data-testid="button-print"
              >
                <Printer size={18} /> إعادة الطباعة
              </button>
              <button
                onClick={() => setReceiptData(null)}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-3 font-bold"
                data-testid="button-new-sale"
              >
                بيع جديد
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* inline customer creation modal */}
      {showCreateCustomer && (
        <CreateCustomerInlineModal
          onClose={() => setShowCreateCustomer(false)}
          onCreated={(newId) => {
            setCustomerId(newId);
            setShowCreateCustomer(false);
          }}
        />
      )}

      {!canReturn && null}
    </div>
  );
}

function VariantPickerModal({
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

  useEffect(() => {
    if (detailQuery.isSuccess && variants.length === 1) {
      const v = variants[0];
      if ((v.totalStock ?? 0) > 0) {
        onPick(v);
      }
    }
  }, [detailQuery.isSuccess, variants, onPick]);

  if (detailQuery.isSuccess && variants.length === 1 && (variants[0].totalStock ?? 0) > 0) {
    return null; // auto-picking
  }

  return (
    <Modal open onClose={onClose} title={product.name} maxWidth="max-w-2xl">
      {detailQuery.isLoading ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : variants.length === 0 ? (
        <p className="text-center text-slate-400 py-6">لا توجد أصناف متاحة</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {variants.map((v) => {
            const out = (v.totalStock ?? 0) <= 0;
            return (
              <button
                key={v.id}
                onClick={() => onPick(v)}
                disabled={out}
                className={`p-3 rounded-xl border text-right transition ${
                  out
                    ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                    : "border-slate-200 hover:border-amber-400 hover:shadow-sm"
                }`}
                data-testid={`variant-${v.id}`}
              >
                <div className="font-bold text-slate-800 text-sm">
                  {[v.sizeName && `مقاس ${v.sizeName}`, v.colorName].filter(Boolean).join(" • ") ||
                    v.sku}
                </div>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-amber-600 font-bold">
                    {money(v.sellingPrice ?? product.basePrice)}
                  </span>
                  <span className="text-slate-400">متوفر: {v.totalStock ?? 0}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline Customer Creation Modal (for POS)
// ─────────────────────────────────────────────────────────────────────────────

function CreateCustomerInlineModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createCustomer = useCreateCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("اسم العميل مطلوب.");
    if (!phone.trim()) return setError("رقم الهاتف مطلوب.");
    try {
      const res = await createCustomer.mutateAsync({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          address: null,
          notes: null,
        },
      });
      onCreated(res.id);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إضافة العميل."));
    }
  }

  return (
    <Modal open onClose={onClose} title="عميل جديد" maxWidth="max-w-sm">
      <form onSubmit={handle} className="space-y-4" dir="rtl">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">الاسم</label>
          <input
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-new-customer-name"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1.5">رقم الهاتف</label>
          <input
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition text-left"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="input-new-customer-phone"
          />
        </div>
        {error && (
          <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold">{error}</div>
        )}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={createCustomer.isPending}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-new-customer"
          >
            {createCustomer.isPending ? <Loader2 size={18} className="animate-spin" /> : "إضافة"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
