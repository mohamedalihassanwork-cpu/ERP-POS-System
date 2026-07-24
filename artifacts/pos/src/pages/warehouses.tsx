import { useState } from "react";
import {
  Warehouse as WarehouseIcon,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Star,
} from "lucide-react";
import {
  useListWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeleteWarehouse,
  ApiError,
  type Warehouse,
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

export function WarehousesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission("inventory.manage");

  const query = useListWarehouses({ includeInactive: true });
  const deleteMutation = useDeleteWarehouse();

  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });

  const items = query.data ?? [];

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="المخازن"
          subtitle="إدارة مواقع تخزين المنتجات"
          icon={<WarehouseIcon size={24} />}
          action={
            canManage ? (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 shrink-0"
                data-testid="button-add-warehouse"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">مخزن جديد</span>
              </button>
            ) : undefined
          }
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {query.isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : query.isError ? (
            <p className="text-red-500 text-center py-16">تعذّر تحميل المخازن.</p>
          ) : items.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-right font-bold px-6 py-4">الاسم</th>
                  <th className="text-right font-bold px-6 py-4">الرمز</th>
                  <th className="text-right font-bold px-6 py-4">العنوان</th>
                  <th className="text-right font-bold px-6 py-4">الحالة</th>
                  {canManage && (
                    <th className="text-left font-bold px-6 py-4">إجراءات</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((w) => (
                  <tr
                    key={w.id}
                    className="hover:bg-slate-50"
                    data-testid={`row-warehouse-${w.id}`}
                  >
                    <td className="px-6 py-4 font-bold text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        {w.name}
                        {w.isDefault && (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-xs font-bold">
                            <Star size={12} /> افتراضي
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono">
                      {w.code || "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{w.address || "—"}</td>
                    <td className="px-6 py-4">
                      {w.isActive ? (
                        <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <CheckCircle2 size={14} /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                          <XCircle size={14} /> معطّل
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setEditing(w)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
                            title="تعديل"
                            data-testid={`button-edit-warehouse-${w.id}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => setDeleting(w)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                            title="حذف"
                            data-testid={`button-delete-warehouse-${w.id}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-slate-400 text-center py-16">لا توجد مخازن.</p>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <WarehouseModal
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
        <DeleteWarehouseModal
          warehouse={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            invalidate();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function WarehouseModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Warehouse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handle() {
    setError(null);
    if (!name.trim()) return setError("اسم المخزن مطلوب.");
    try {
      if (isEdit && initial) {
        await updateMutation.mutateAsync({
          id: initial.id,
          data: {
            name: name.trim(),
            code: code.trim() || null,
            address: address.trim() || null,
            isDefault,
            isActive,
          },
        });
      } else {
        await createMutation.mutateAsync({
          data: {
            name: name.trim(),
            code: code.trim() || null,
            address: address.trim() || null,
            isDefault,
          },
        });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ المخزن."));
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "تعديل المخزن" : "مخزن جديد"}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الاسم <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-warehouse-name"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الرمز
          </label>
          <input
            className={inputClass}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            data-testid="input-warehouse-code"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            العنوان
          </label>
          <input
            className={inputClass}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            data-testid="input-warehouse-address"
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
            data-testid="checkbox-warehouse-default"
          />
          المخزن الافتراضي
        </label>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-warehouse-active"
            />
            نشط
          </label>
        )}
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
            data-testid="button-save-warehouse"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteWarehouseModal({
  warehouse,
  onClose,
  onDeleted,
}: {
  warehouse: Warehouse;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteWarehouse();
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: warehouse.id });
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حذف المخزن."));
    }
  }

  return (
    <Modal open onClose={onClose} title="تأكيد الحذف">
      <div className="space-y-4">
        <p className="text-slate-600">
          هل تريد حذف المخزن{" "}
          <span className="font-bold text-slate-800">{warehouse.name}</span>؟ سيتم
          تعطيله.
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
            data-testid="button-confirm-delete-warehouse"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            حذف
          </button>
        </div>
      </div>
    </Modal>
  );
}
