import { useState } from "react";
import { ScrollText, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useListAuditLogs } from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

const PAGE_SIZE = 20;

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [appliedAction, setAppliedAction] = useState("");

  const { data, isLoading, isError } = useListAuditLogs({
    page,
    pageSize: PAGE_SIZE,
    action: appliedAction || undefined,
  });

  const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;

  function applyFilter() {
    setPage(1);
    setAppliedAction(actionFilter.trim());
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="سجل النشاط"
          subtitle="جميع الإجراءات الحساسة المسجّلة في النظام"
          icon={<ScrollText size={24} />}
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="تصفية حسب نوع الإجراء..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
              style={{ paddingRight: "2.5rem" }}
              data-testid="input-audit-filter"
            />
          </div>
          <button
            onClick={applyFilter}
            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition"
            data-testid="button-audit-filter"
          >
            تصفية
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : isError ? (
            <p className="text-red-500 text-center py-16">
              تعذّر تحميل سجل النشاط.
            </p>
          ) : data && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-bold px-6 py-4">الإجراء</th>
                    <th className="text-right font-bold px-6 py-4">المستخدم</th>
                    <th className="text-right font-bold px-6 py-4">النوع</th>
                    <th className="text-right font-bold px-6 py-4">عنوان IP</th>
                    <th className="text-right font-bold px-6 py-4">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 transition-colors"
                      data-testid={`row-audit-${log.id}`}
                    >
                      <td className="px-6 py-4 font-bold text-slate-800">
                        {log.action}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {log.userName ?? "النظام"}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {log.entityType ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                        {log.ipAddress ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-16">
              لا توجد سجلات مطابقة.
            </p>
          )}

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                صفحة {page} من {totalPages} — {data.total} سجل
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-audit-prev"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-audit-next"
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
