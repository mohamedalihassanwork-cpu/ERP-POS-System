import { useState } from "react";
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useListBrands,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  useListColors,
  useCreateColor,
  useUpdateColor,
  useDeleteColor,
  useListSizes,
  useCreateSize,
  useUpdateSize,
  useDeleteSize,
  ApiError,
  type Category,
  type Brand,
  type Color,
  type Size,
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

type TabKey = "categories" | "brands" | "colors" | "sizes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "categories", label: "الفئات" },
  { key: "brands", label: "الماركات" },
  { key: "colors", label: "الألوان" },
  { key: "sizes", label: "المقاسات" },
];

export function MasterDataPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState<TabKey>("categories");
  const canEdit = hasPermission("products.edit") || hasPermission("products.create");

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="البيانات الأساسية"
          subtitle="إدارة الفئات والماركات والألوان والمقاسات"
          icon={<Tags size={24} />}
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex gap-1 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm transition ${
                tab === t.key
                  ? "bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "categories" && <CategoriesPanel canEdit={canEdit} />}
        {tab === "brands" && <BrandsPanel canEdit={canEdit} />}
        {tab === "colors" && <ColorsPanel canEdit={canEdit} />}
        {tab === "sizes" && <SizesPanel canEdit={canEdit} />}
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2.5 py-1 rounded-lg text-xs font-bold">
      <CheckCircle2 size={14} /> نشط
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold">
      <XCircle size={14} /> معطّل
    </span>
  );
}

function PanelShell({
  title,
  canEdit,
  onAdd,
  children,
  testid,
}: {
  title: string;
  canEdit: boolean;
  onAdd: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="font-bold text-slate-800">{title}</h3>
        {canEdit && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 text-sm"
            data-testid={`button-add-${testid}`}
          >
            <Plus size={16} />
            إضافة
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function RowActions({
  canEdit,
  onEdit,
  onDelete,
  testid,
}: {
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  testid: string;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex items-center gap-1 justify-end">
      <button
        onClick={onEdit}
        className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
        title="تعديل"
        data-testid={`button-edit-${testid}`}
      >
        <Pencil size={16} />
      </button>
      <button
        onClick={onDelete}
        className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
        title="حذف"
        data-testid={`button-delete-${testid}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function LoadState({
  isLoading,
  isError,
  isEmpty,
  label,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  label: string;
}) {
  if (isLoading)
    return <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>;
  if (isError)
    return <p className="text-red-500 text-center py-12">تعذّر تحميل {label}.</p>;
  if (isEmpty)
    return <p className="text-slate-400 text-center py-12">لا توجد بيانات.</p>;
  return null;
}

function CategoriesPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useListCategories({ includeInactive: true });
  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["/api/categories"] });

  const items = query.data ?? [];

  return (
    <PanelShell
      title="الفئات"
      canEdit={canEdit}
      onAdd={() => setCreating(true)}
      testid="category"
    >
      <LoadState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={items.length === 0}
        label="الفئات"
      />
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">الاسم</th>
              <th className="text-right font-bold px-6 py-3">بالإنجليزية</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {canEdit && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50" data-testid={`row-category-${c.id}`}>
                <td className="px-6 py-3 font-bold text-slate-800">{c.name}</td>
                <td className="px-6 py-3 text-slate-500">{c.nameEn || "—"}</td>
                <td className="px-6 py-3">
                  <StatusBadge active={c.isActive} />
                </td>
                {canEdit && (
                  <td className="px-6 py-3">
                    <RowActions
                      canEdit={canEdit}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setDeleting(c)}
                      testid={c.id}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <SimpleNameModal
          title={editing ? "تعديل الفئة" : "فئة جديدة"}
          initial={editing ?? undefined}
          withActive={Boolean(editing)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (values) => {
            if (editing) {
              await updateMutation.mutateAsync({ id: editing.id, data: values });
            } else {
              await createMutation.mutateAsync({ data: values });
            }
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteMutation.mutateAsync({ id: deleting.id });
            invalidate();
            setDeleting(null);
          }}
        />
      )}
    </PanelShell>
  );
}

function BrandsPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useListBrands({ includeInactive: true });
  const createMutation = useCreateBrand();
  const updateMutation = useUpdateBrand();
  const deleteMutation = useDeleteBrand();
  const [editing, setEditing] = useState<Brand | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Brand | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["/api/brands"] });

  const items = query.data ?? [];

  return (
    <PanelShell
      title="الماركات"
      canEdit={canEdit}
      onAdd={() => setCreating(true)}
      testid="brand"
    >
      <LoadState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={items.length === 0}
        label="الماركات"
      />
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">الاسم</th>
              <th className="text-right font-bold px-6 py-3">بالإنجليزية</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {canEdit && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50" data-testid={`row-brand-${b.id}`}>
                <td className="px-6 py-3 font-bold text-slate-800">{b.name}</td>
                <td className="px-6 py-3 text-slate-500">{b.nameEn || "—"}</td>
                <td className="px-6 py-3">
                  <StatusBadge active={b.isActive} />
                </td>
                {canEdit && (
                  <td className="px-6 py-3">
                    <RowActions
                      canEdit={canEdit}
                      onEdit={() => setEditing(b)}
                      onDelete={() => setDeleting(b)}
                      testid={b.id}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <SimpleNameModal
          title={editing ? "تعديل الماركة" : "ماركة جديدة"}
          initial={editing ?? undefined}
          withActive={Boolean(editing)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (values) => {
            if (editing) {
              await updateMutation.mutateAsync({ id: editing.id, data: values });
            } else {
              await createMutation.mutateAsync({ data: values });
            }
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteMutation.mutateAsync({ id: deleting.id });
            invalidate();
            setDeleting(null);
          }}
        />
      )}
    </PanelShell>
  );
}

function ColorsPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useListColors({ includeInactive: true });
  const createMutation = useCreateColor();
  const updateMutation = useUpdateColor();
  const deleteMutation = useDeleteColor();
  const [editing, setEditing] = useState<Color | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Color | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["/api/colors"] });

  const items = query.data ?? [];

  return (
    <PanelShell
      title="الألوان"
      canEdit={canEdit}
      onAdd={() => setCreating(true)}
      testid="color"
    >
      <LoadState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={items.length === 0}
        label="الألوان"
      />
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">اللون</th>
              <th className="text-right font-bold px-6 py-3">بالإنجليزية</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {canEdit && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50" data-testid={`row-color-${c.id}`}>
                <td className="px-6 py-3 font-bold text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-full border border-slate-200 shrink-0"
                      style={{ backgroundColor: c.hex || "#e2e8f0" }}
                    />
                    {c.name}
                  </span>
                </td>
                <td className="px-6 py-3 text-slate-500">{c.nameEn || "—"}</td>
                <td className="px-6 py-3">
                  <StatusBadge active={c.isActive} />
                </td>
                {canEdit && (
                  <td className="px-6 py-3">
                    <RowActions
                      canEdit={canEdit}
                      onEdit={() => setEditing(c)}
                      onDelete={() => setDeleting(c)}
                      testid={c.id}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <ColorModal
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (values) => {
            if (editing) {
              await updateMutation.mutateAsync({ id: editing.id, data: values });
            } else {
              await createMutation.mutateAsync({ data: values });
            }
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteMutation.mutateAsync({ id: deleting.id });
            invalidate();
            setDeleting(null);
          }}
        />
      )}
    </PanelShell>
  );
}

function SizesPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const query = useListSizes({ includeInactive: true });
  const createMutation = useCreateSize();
  const updateMutation = useUpdateSize();
  const deleteMutation = useDeleteSize();
  const [editing, setEditing] = useState<Size | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Size | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["/api/sizes"] });

  const items = query.data ?? [];

  return (
    <PanelShell
      title="المقاسات"
      canEdit={canEdit}
      onAdd={() => setCreating(true)}
      testid="size"
    >
      <LoadState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={items.length === 0}
        label="المقاسات"
      />
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">المقاس</th>
              <th className="text-right font-bold px-6 py-3">النظام</th>
              <th className="text-right font-bold px-6 py-3">الترتيب</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {canEdit && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50" data-testid={`row-size-${s.id}`}>
                <td className="px-6 py-3 font-bold text-slate-800">{s.name}</td>
                <td className="px-6 py-3 text-slate-500">{s.system}</td>
                <td className="px-6 py-3 text-slate-500">{s.sortOrder}</td>
                <td className="px-6 py-3">
                  <StatusBadge active={s.isActive} />
                </td>
                {canEdit && (
                  <td className="px-6 py-3">
                    <RowActions
                      canEdit={canEdit}
                      onEdit={() => setEditing(s)}
                      onDelete={() => setDeleting(s)}
                      testid={s.id}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(creating || editing) && (
        <SizeModal
          initial={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (values) => {
            if (editing) {
              await updateMutation.mutateAsync({ id: editing.id, data: values });
            } else {
              await createMutation.mutateAsync({ data: values });
            }
            invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteModal
          name={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteMutation.mutateAsync({ id: deleting.id });
            invalidate();
            setDeleting(null);
          }}
        />
      )}
    </PanelShell>
  );
}

function ModalFooter({
  onClose,
  onSubmit,
  submitting,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={onClose}
        className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
        data-testid="button-cancel"
      >
        إلغاء
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
        data-testid="button-save"
      >
        {submitting && <Loader2 size={18} className="animate-spin" />}
        حفظ
      </button>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
      data-testid="text-form-error"
    >
      {message}
    </div>
  );
}

function SimpleNameModal({
  title,
  initial,
  withActive,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: { name: string; nameEn?: string | null; isActive?: boolean };
  withActive: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    nameEn: string | null;
    isActive?: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setError(null);
    if (!name.trim()) return setError("الاسم مطلوب.");
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        nameEn: nameEn.trim() || null,
        ...(withActive ? { isActive } : {}),
      });
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر الحفظ."));
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الاسم <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-name"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الاسم بالإنجليزية
          </label>
          <input
            className={inputClass}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            data-testid="input-nameEn"
          />
        </div>
        {withActive && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-active"
            />
            نشط
          </label>
        )}
        {error && <ErrorBox message={error} />}
        <ModalFooter onClose={onClose} onSubmit={() => void handle()} submitting={submitting} />
      </div>
    </Modal>
  );
}

function ColorModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: Color;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    nameEn: string | null;
    hex: string | null;
    isActive?: boolean;
  }) => Promise<void>;
}) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? "");
  const [hex, setHex] = useState(initial?.hex ?? "#000000");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setError(null);
    if (!name.trim()) return setError("اسم اللون مطلوب.");
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        nameEn: nameEn.trim() || null,
        hex: hex || null,
        ...(isEdit ? { isActive } : {}),
      });
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر الحفظ."));
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "تعديل اللون" : "لون جديد"}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            اسم اللون <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-color-name"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              بالإنجليزية
            </label>
            <input
              className={inputClass}
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              data-testid="input-color-nameEn"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              اللون
            </label>
            <input
              type="color"
              className="w-full h-11 rounded-xl border border-slate-200 cursor-pointer"
              value={hex || "#000000"}
              onChange={(e) => setHex(e.target.value)}
              data-testid="input-color-hex"
            />
          </div>
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-color-active"
            />
            نشط
          </label>
        )}
        {error && <ErrorBox message={error} />}
        <ModalFooter onClose={onClose} onSubmit={() => void handle()} submitting={submitting} />
      </div>
    </Modal>
  );
}

function SizeModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: Size;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    system: string;
    sortOrder: number;
    isActive?: boolean;
  }) => Promise<void>;
}) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [system, setSystem] = useState(initial?.system ?? "EU");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setError(null);
    if (!name.trim()) return setError("المقاس مطلوب.");
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        system: system.trim() || "EU",
        sortOrder: Number(sortOrder) || 0,
        ...(isEdit ? { isActive } : {}),
      });
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر الحفظ."));
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "تعديل المقاس" : "مقاس جديد"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              المقاس <span className="text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-size-name"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              النظام
            </label>
            <select
              className={inputClass}
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              data-testid="select-size-system"
            >
              <option value="EU">EU</option>
              <option value="US">US</option>
              <option value="UK">UK</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            ترتيب العرض
          </label>
          <input
            type="number"
            className={inputClass}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            data-testid="input-size-sort"
          />
        </div>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-size-active"
            />
            نشط
          </label>
        )}
        {error && <ErrorBox message={error} />}
        <ModalFooter onClose={onClose} onSubmit={() => void handle()} submitting={submitting} />
      </div>
    </Modal>
  );
}

function ConfirmDeleteModal({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handle() {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر الحذف."));
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="تأكيد الحذف">
      <div className="space-y-4">
        <p className="text-slate-600">
          هل تريد حذف <span className="font-bold text-slate-800">{name}</span>؟ سيتم
          تعطيله.
        </p>
        {error && <ErrorBox message={error} />}
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
            className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-confirm-delete"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            حذف
          </button>
        </div>
      </div>
    </Modal>
  );
}
