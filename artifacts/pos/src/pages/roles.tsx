import { useState } from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Loader2,
  Users as UsersIcon,
} from "lucide-react";
import {
  useListRoles,
  useListPermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  ApiError,
  type Role,
  type PermissionGroup,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { WILDCARD_PERMISSION } from "@workspace/shared";
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

export function RolesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission("roles.manage");

  const rolesQuery = useListRoles();
  const permissionsQuery = useListPermissions();

  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/roles"] });

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="الأدوار والصلاحيات"
          subtitle="تحكّم في صلاحيات كل دور وظيفي"
          icon={<ShieldCheck size={24} />}
          action={
            canManage ? (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 shrink-0"
                data-testid="button-add-role"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">دور جديد</span>
              </button>
            ) : undefined
          }
        />

        {rolesQuery.isLoading ? (
          <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
        ) : rolesQuery.isError ? (
          <p className="text-red-500 text-center py-16">تعذّر تحميل الأدوار.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rolesQuery.data?.map((role) => (
              <div
                key={role.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col"
                data-testid={`card-role-${role.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <ShieldCheck size={22} />
                  </div>
                  {role.isSystem && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg font-bold">
                      <Lock size={12} /> دور نظام
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  {role.nameAr ?? role.name}
                </h3>
                <p className="text-sm text-slate-400 mb-4">{role.name}</p>
                <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                  <span className="flex items-center gap-1">
                    <UsersIcon size={15} />
                    {role.userCount} مستخدم
                  </span>
                  <span>
                    {role.permissions.includes(WILDCARD_PERMISSION)
                      ? "كل الصلاحيات"
                      : `${role.permissions.length} صلاحية`}
                  </span>
                </div>
                {canManage && (
                  <div className="flex gap-2 mt-auto pt-4 border-t border-slate-100">
                    <button
                      onClick={() => setEditing(role)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100 font-bold text-sm transition"
                      data-testid={`button-edit-role-${role.id}`}
                    >
                      <Pencil size={15} /> تعديل
                    </button>
                    {!role.isSystem && (
                      <button
                        onClick={() => setDeleting(role)}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 font-bold text-sm transition"
                        data-testid={`button-delete-role-${role.id}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <RoleFormModal
          role={editing}
          groups={permissionsQuery.data ?? []}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            void invalidate();
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteRoleModal
          role={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            void invalidate();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function RoleFormModal({
  role,
  groups,
  onClose,
  onSaved,
}: {
  role: Role | null;
  groups: PermissionGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(role);
  const isWildcard = role?.permissions.includes(WILDCARD_PERMISSION) ?? false;
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(role?.name ?? "");
  const [nameAr, setNameAr] = useState(role?.nameAr ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  );

  const submitting = createMutation.isPending || updateMutation.isPending;
  const lockedAll = isWildcard;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (checked) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("اسم الدور (بالإنجليزية) مطلوب.");
    const permissions = lockedAll
      ? [WILDCARD_PERMISSION]
      : Array.from(selected);
    if (permissions.length === 0)
      return setError("يجب اختيار صلاحية واحدة على الأقل.");
    try {
      if (isEdit && role) {
        await updateMutation.mutateAsync({
          id: role.id,
          data: {
            name: name.trim(),
            nameAr: nameAr.trim() || undefined,
            permissions,
          },
        });
      } else {
        await createMutation.mutateAsync({
          data: {
            name: name.trim(),
            nameAr: nameAr.trim() || undefined,
            permissions,
          },
        });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ الدور."));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "تعديل الدور" : "دور جديد"}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              الاسم (بالإنجليزية) <span className="text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cashier"
              data-testid="input-role-name"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              الاسم (بالعربية)
            </label>
            <input
              className={inputClass}
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="أمين الصندوق"
              data-testid="input-role-nameAr"
            />
          </div>
        </div>

        {lockedAll ? (
          <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl px-4 py-3 text-sm font-medium">
            هذا الدور يملك جميع الصلاحيات (صلاحية كاملة) ولا يمكن تعديل صلاحياته
            التفصيلية.
          </div>
        ) : (
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-3">
              الصلاحيات <span className="text-red-500">*</span>
            </label>
            <div className="space-y-4 max-h-[40vh] overflow-y-auto pl-1">
              {groups.map((group) => {
                const allChecked = group.permissions.every((p) =>
                  selected.has(p.key),
                );
                return (
                  <div
                    key={group.module}
                    className="border border-slate-100 rounded-xl p-4"
                  >
                    <label className="flex items-center gap-2 font-bold text-slate-700 mb-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => toggleGroup(group, e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                        data-testid={`checkbox-group-${group.module}`}
                      />
                      {group.labelAr}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
                      {group.permissions.map((perm) => (
                        <label
                          key={perm.key}
                          className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(perm.key)}
                            onChange={() => toggle(perm.key)}
                            className="w-4 h-4 accent-amber-500"
                            data-testid={`checkbox-perm-${perm.key}`}
                          />
                          {perm.labelAr}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div
            className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
            data-testid="text-role-form-error"
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
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-role"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteRoleModal({
  role,
  onClose,
  onDeleted,
}: {
  role: Role;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteRole();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: role.id });
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حذف الدور."));
    }
  }

  return (
    <Modal open onClose={onClose} title="حذف الدور">
      <div className="space-y-4">
        <p className="text-slate-600">
          هل أنت متأكد من حذف الدور{" "}
          <span className="font-bold text-slate-800">
            {role.nameAr ?? role.name}
          </span>
          ؟
        </p>
        {error && (
          <div
            className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
            data-testid="text-delete-role-error"
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
            onClick={() => void handleDelete()}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-confirm-delete-role"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            حذف
          </button>
        </div>
      </div>
    </Modal>
  );
}
