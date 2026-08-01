import { useState, useEffect } from "react";
import {
  Undo2,
  Search,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import {
  useListSalesReturns,
  useGetSalesReturn,
  useLookupInvoice,
  getLookupInvoiceQueryKey,
  useCreateSalesReturn,
  ApiError,
  type InvoiceDetail,
} from "@workspace/api-client-react";
import { normalizeBarcodeInput } from "@/lib/barcode-input";
import { openCashDrawer } from "@/lib/printer-settings";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";

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

export function SalesReturnsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const query = useListSalesReturns({ page, pageSize });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [viewId, setViewId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [voidTerm, setVoidTerm] = useState<string | null>(null);

  // Auto-open the create-return modal when navigated with ?void=INVOICE_NUMBER
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inv = params.get("void");
    if (inv) {
      setVoidTerm(inv);
      setCreating(true);
      // Clean the URL so back-navigation doesn't re-trigger
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="مرتجعات المبيعات"
          subtitle="إرجاع الأصناف للعملاء"
          icon={<Undo2 size={24} />}
          action={
            <button
              onClick={() => setCreating(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl px-4 py-2.5 font-bold flex items-center gap-2"
              data-testid="button-new-return"
            >
              <Plus size={18} /> مرتجع جديد
            </button>
          }
        />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          {query.isLoading ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 className="animate-spin inline" size={28} />
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-400">لا توجد مرتجعات</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold">
                <tr>
                  <th className="text-right p-4">رقم المرتجع</th>
                  <th className="text-right p-4">الفاتورة الأصلية</th>
                  <th className="text-right p-4">التاريخ</th>
                  <th className="text-left p-4">المبلغ</th>
                  <th className="text-center p-4">طريقة الاسترداد</th>
                  <th className="text-center p-4">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50" data-testid={`return-row-${r.id}`}>
                    <td className="p-4 font-bold text-slate-800">{r.returnNumber}</td>
                    <td className="p-4 text-slate-600">{r.invoiceNumber ?? "-"}</td>
                    <td className="p-4 text-slate-500 text-xs">{dateTime(r.createdAt)}</td>
                    <td className="p-4 text-left font-bold text-red-600">{money(r.totalAmount)} {CUR}</td>
                    <td className="p-4 text-center text-slate-600">{r.refundMethod}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => setViewId(r.id)}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                        data-testid={`button-view-return-${r.id}`}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                صفحة {page} من {totalPages} — {total} مرتجع
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  data-testid="button-prev-page"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                  data-testid="button-next-page"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {viewId && <ReturnDetailModal id={viewId} onClose={() => setViewId(null)} />}
      {creating && (
        <CreateReturnModal
          initialTerm={voidTerm ?? undefined}
          onClose={() => { setCreating(false); setVoidTerm(null); }}
        />
      )}
    </div>
  );
}

function ReturnDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useGetSalesReturn(id);
  const ret = query.data;
  return (
    <Modal open onClose={onClose} title={ret ? `مرتجع ${ret.returnNumber}` : "تفاصيل المرتجع"} maxWidth="max-w-2xl">
      {query.isLoading || !ret ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 className="animate-spin inline" size={24} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">الفاتورة الأصلية</p>
              <p className="font-bold text-slate-800">{ret.invoiceNumber ?? "-"}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-slate-400 text-xs">طريقة الاسترداد</p>
              <p className="font-bold text-slate-800">{ret.refundMethod}</p>
            </div>
          </div>
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-bold">
                <tr>
                  <th className="text-right p-3">المنتج</th>
                  <th className="text-center p-3">الكمية</th>
                  <th className="text-left p-3">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ret.items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3 font-bold text-slate-800">{it.productName}</td>
                    <td className="p-3 text-center font-bold">{it.quantity}</td>
                    <td className="p-3 text-left font-bold">{money(it.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between bg-slate-50 rounded-xl p-4">
            <span className="font-bold text-slate-700">إجمالي المرتجع</span>
            <span className="font-black text-red-600">{money(ret.totalAmount)} {CUR}</span>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateReturnModal({
  onClose,
  initialTerm,
}: {
  onClose: () => void;
  initialTerm?: string;
}) {
  const queryClient = useQueryClient();
  const [lookupTerm, setLookupTerm] = useState(initialTerm ?? "");
  const [submittedTerm, setSubmittedTerm] = useState(initialTerm ?? "");
  const lookup = useLookupInvoice(
    { q: submittedTerm },
    {
      query: {
        enabled: submittedTerm.trim().length > 0,
        retry: false,
        queryKey: getLookupInvoiceQueryKey({ q: submittedTerm }),
      },
    },
  );
  const invoice = lookup.data as InvoiceDetail | undefined;

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createReturn = useCreateSalesReturn();

  // When invoice loads from a pre-filled term, pre-fill all available quantities
  useEffect(() => {
    if (invoice && initialTerm) {
      const preset: Record<string, number> = {};
      invoice.items.forEach((it) => {
        const available = it.quantity - (it.returnedQuantity ?? 0);
        if (available > 0) preset[it.id] = available;
      });
      setQuantities(preset);
    }
    if (invoice && invoice.saleType === "CREDIT") {
      setRefundMethod("CREDIT");
    }
  // Only run once when invoice first resolves from the pre-filled term
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  function setQty(itemId: string, value: number, max: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, Math.min(value, max)) }));
  }

  const returnItems = invoice
    ? invoice.items
        .filter((it) => (quantities[it.id] ?? 0) > 0)
        .map((it) => ({ invoiceItemId: it.id, quantity: quantities[it.id]! }))
    : [];

  const totalRefund = invoice
    ? invoice.items.reduce((s, it) => {
        const effectiveUnitPrice = Number(it.lineTotal) / it.quantity;
        return s + (quantities[it.id] ?? 0) * effectiveUnitPrice;
      }, 0)
    : 0;

  async function submit() {
    setError(null);
    if (!invoice) return;
    if (returnItems.length === 0) {
      setError("اختر صنفاً واحداً على الأقل للإرجاع");
      return;
    }
    try {
      await createReturn.mutateAsync({
        data: {
          invoiceId: invoice.id,
          refundMethod: refundMethod as "CASH" | "CARD" | "INSTAPAY" | "WALLET" | "CREDIT",
          reason: reason || null,
          items: returnItems,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/sales/returns"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/sales/invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      
      // Real-time Reports Sync
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/sales-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/inventory-stock"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/dashboard/kpis"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/dashboard/charts"] });
      
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إنشاء المرتجع"));
    }
  }

  return (
    <Modal open onClose={onClose} title="مرتجع جديد" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            ابحث عن الفاتورة (رقم أو باركود)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={lookupTerm}
                onChange={(e) => setLookupTerm(normalizeBarcodeInput(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && setSubmittedTerm(lookupTerm)}
                placeholder="INV-00001 ..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                data-testid="input-lookup-invoice"
              />
            </div>
            <button
              onClick={() => setSubmittedTerm(lookupTerm)}
              className="bg-slate-800 text-white rounded-xl px-5 font-bold hover:bg-slate-700"
              data-testid="button-lookup"
            >
              بحث
            </button>
          </div>
        </div>

        {lookup.isLoading && submittedTerm && (
          <div className="py-6 text-center text-slate-400">
            <Loader2 className="animate-spin inline" size={22} />
          </div>
        )}
        {lookup.isError && (
          <div className="bg-red-50 text-red-700 text-sm font-bold rounded-xl p-3">
            لم يتم العثور على الفاتورة
          </div>
        )}

        {invoice && (
          <>
            <div className="bg-slate-50 rounded-xl p-3 text-sm flex justify-between">
              <span className="font-bold text-slate-800">{invoice.invoiceNumber}</span>
              <span className="text-slate-500">{invoice.customerName ?? "عميل نقدي"}</span>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs font-bold">
                  <tr>
                    <th className="text-right p-3">المنتج</th>
                    <th className="text-center p-3">المباع</th>
                    <th className="text-center p-3">المتاح للإرجاع</th>
                    <th className="text-center p-3">كمية الإرجاع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((it) => {
                    const available = it.quantity - (it.returnedQuantity ?? 0);
                    return (
                      <tr key={it.id}>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{it.productName}</div>
                          <div className="text-xs text-slate-500">
                            {[it.sizeName && `مقاس ${it.sizeName}`, it.colorName]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </td>
                        <td className="p-3 text-center">{it.quantity}</td>
                        <td className="p-3 text-center font-bold">{available}</td>
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={available}
                            value={quantities[it.id] ?? 0}
                            onChange={(e) => setQty(it.id, Number(e.target.value), available)}
                            disabled={available <= 0}
                            className="w-16 text-center bg-slate-50 border border-slate-200 rounded-lg py-1.5 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-40"
                            data-testid={`input-return-qty-${it.id}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">طريقة الاسترداد</label>
                <select
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  data-testid="select-refund-method"
                >
                  <option value="CASH">نقدي</option>
                  <option value="CARD">فيزا / كارد</option>
                  <option value="INSTAPAY">إنستاباي</option>
                  <option value="WALLET">محفظة</option>
                  <option value="CREDIT">خصم من حساب العميل</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">السبب (اختياري)</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
                  data-testid="input-reason"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm font-bold rounded-xl p-3" data-testid="text-return-error">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="font-bold text-slate-700">
                إجمالي المرتجع: <span className="text-red-600">{money(totalRefund)} {CUR}</span>
              </span>
              <button
                onClick={submit}
                disabled={createReturn.isPending || returnItems.length === 0}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl px-6 py-2.5 font-bold flex items-center gap-2"
                data-testid="button-submit-return"
              >
                {createReturn.isPending && <Loader2 className="animate-spin" size={18} />}
                تأكيد المرتجع
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
