import { useState } from "react";
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import {
  useListMovements,
  useListWarehouses,
  type InventoryMovement,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 15;

const TYPE_LABELS: Record<string, string> = {
  ADJUSTMENT_IN: "تسوية إضافة",
  ADJUSTMENT_OUT: "تسوية خصم",
  SALE: "بيع",
  PURCHASE: "شراء",
  TRANSFER_IN: "تحويل وارد",
  TRANSFER_OUT: "تحويل صادر",
  RETURN_IN: "مرتجع وارد",
  RETURN_OUT: "مرتجع صادر",
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

export function MovementsPage() {
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [type, setType] = useState("");

  const warehousesQuery = useListWarehouses({ includeInactive: true });
  const query = useListMovements({
    page,
    pageSize: PAGE_SIZE,
    warehouseId: warehouseId || undefined,
    type: type || undefined,
  });

  const totalPages = query.data
    ? Math.max(Math.ceil(query.data.total / PAGE_SIZE), 1)
    : 1;

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="سجل حركات المخزون"
          subtitle="سجل غير قابل للتعديل لكل حركات الكميات"
          icon={<ScrollText size={24} />}
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <select
            value={warehouseId}
            onChange={(e) => {
              setPage(1);
              setWarehouseId(e.target.value);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-medium text-slate-700"
            data-testid="select-movement-warehouse"
          >
            <option value="">كل المخازن</option>
            {(warehousesQuery.data ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value);
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 outline-none font-medium text-slate-700"
            data-testid="select-movement-type"
          >
            <option value="">كل أنواع الحركات</option>
            <option value="ADJUSTMENT_IN">تسوية إضافة</option>
            <option value="ADJUSTMENT_OUT">تسوية خصم</option>
          </select>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {query.isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : query.isError ? (
            <p className="text-red-500 text-center py-16">تعذّر تحميل الحركات.</p>
          ) : query.data && query.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-bold px-6 py-4">التاريخ</th>
                    <th className="text-right font-bold px-6 py-4">المنتج</th>
                    <th className="text-right font-bold px-6 py-4">رمز الصنف</th>
                    <th className="text-right font-bold px-6 py-4">المخزن</th>
                    <th className="text-right font-bold px-6 py-4">الحركة</th>
                    <th className="text-center font-bold px-6 py-4">الكمية</th>
                    <th className="text-center font-bold px-6 py-4">الرصيد بعدها</th>
                    <th className="text-right font-bold px-6 py-4">المستخدم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data.items.map((m: InventoryMovement) => {
                    const isIn = m.quantityChange >= 0;
                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-slate-50"
                        data-testid={`row-movement-${m.id}`}
                      >
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-800">
                          {m.productName || "—"}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                          {m.sku || "—"}
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {m.warehouseName || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                            {isIn ? (
                              <ArrowUpCircle size={14} className="text-green-600" />
                            ) : (
                              <ArrowDownCircle size={14} className="text-red-600" />
                            )}
                            {typeLabel(m.type)}
                          </span>
                        </td>
                        <td
                          className={`px-6 py-4 text-center font-black ${
                            isIn ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isIn ? "+" : ""}
                          {m.quantityChange}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-800">
                          {m.balanceAfter}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {m.userName || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-16">لا توجد حركات.</p>
          )}

          {query.data && query.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                صفحة {page} من {totalPages} — {query.data.total} حركة
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-movements-prev"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-movements-next"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
