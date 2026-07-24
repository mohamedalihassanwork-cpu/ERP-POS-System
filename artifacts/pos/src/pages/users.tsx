import { useState } from "react";
import {
  Users as UsersIcon,
  Search,
  Plus,
  Pencil,
  KeyRound,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  useListUsers,
  useListRoles,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
  ApiError,
  type User,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 10;
const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

export function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = hasPermission("users.create");
  const canEdit = hasPermission("users.edit");
  const canDelete = hasPermission("users.delete");
  const canManage = canEdit || canDelete;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);

  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  const usersQuery = useListUsers({
    page,
    pageSize: PAGE_SIZE,
    search: appliedSearch || undefined,
    includeInactive,
  });
  const rolesQuery = useListRoles();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
  };

  const totalPages = usersQuery.data
    ? Math.max(Math.ceil(usersQuery.data.total / PAGE_SIZE), 1)
    : 1;

  function applySearch() {
    setPage(1);
    setAppliedSearch(search.trim());
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="المستخدمون"
          subtitle="إدارة حسابات الموظفين وصلاحياتهم"
          icon={<UsersIcon size={24} />}
          action={
            canCreate ? (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 shrink-0"
                data-testid="button-add-user"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">مستخدم جديد</span>
              </button>
            ) : undefined
          }
        />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              placeholder="بحث بالاسم أو اسم المستخدم..."
              className={inputClass}
              style={{ paddingRight: "2.5rem" }}
              data-testid="input-user-search"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 px-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setPage(1);
                setIncludeInactive(e.target.checked);
              }}
              className="w-4 h-4 accent-amber-500"
              data-testid="checkbox-include-inactive"
            />
            عرض المعطّلين
          </label>
          <button
            onClick={applySearch}
            className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition"
            data-testid="button-user-search"
          >
            بحث
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {usersQuery.isLoading ? (
            <p className="text-slate-400 text-center py-16">جارٍ التحميل...</p>
          ) : usersQuery.isError ? (
            <p className="text-red-500 text-center py-16">
              تعذّر تحميل المستخدمين.
            </p>
          ) : usersQuery.data && usersQuery.data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-right font-bold px-6 py-4">الاسم</th>
                    <th className="text-right font-bold px-6 py-4">
                      اسم المستخدم
                    </th>
                    <th className="text-right font-bold px-6 py-4">الدور</th>
                    <th className="text-right font-bold px-6 py-4">الحالة</th>
                    <th className="text-right font-bold px-6 py-4">آخر دخول</th>
                    {canManage && (
                      <th className="text-left font-bold px-6 py-4">إجراءات</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersQuery.data.items.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50 transition-colors"
                      data-testid={`row-user-${u.id}`}
                    >
                      <td className="px-6 py-4 font-bold text-slate-800">
                        {u.fullName}
                        {u.id === currentUser?.id && (
                          <span className="mr-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">
                            أنت
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-mono">
                        {u.username}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.role.nameAr ?? u.role.name}
                      </td>
                      <td className="px-6 py-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                            <CheckCircle2 size={14} /> نشط
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-bold">
                            <XCircle size={14} /> معطّل
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {formatDateTime(u.lastLoginAt)}
                      </td>
                      {canManage && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 justify-end">
                            {canEdit && (
                              <button
                                onClick={() => setEditing(u)}
                                className="p-2 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition"
                                title="تعديل"
                                data-testid={`button-edit-${u.id}`}
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => setResetting(u)}
                                className="p-2 rounded-lg text-slate-500 hover:bg-amber-50 hover:text-amber-600 transition"
                                title="إعادة تعيين كلمة المرور"
                                data-testid={`button-reset-${u.id}`}
                              >
                                <KeyRound size={16} />
                              </button>
                            )}
                            {canDelete && u.id !== currentUser?.id && (
                              <button
                                onClick={() => setDeleting(u)}
                                className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
                                title="حذف"
                                data-testid={`button-delete-${u.id}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-slate-400 text-center py-16">
              لا يوجد مستخدمون مطابقون.
            </p>
          )}

          {usersQuery.data && usersQuery.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                صفحة {page} من {totalPages} — {usersQuery.data.total} مستخدم
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-users-prev"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-users-next"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <UserFormModal
          user={editing}
          roles={rolesQuery.data ?? []}
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

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
        />
      )}

      {deleting && (
        <DeleteUserModal
          user={deleting}
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

function UserFormModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User | null;
  roles: { id: string; name: string; nameAr?: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(user);
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(user?.roleId ?? roles[0]?.id ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  const submitting = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit() {
    setError(null);
    if (!fullName.trim()) return setError("الاسم الكامل مطلوب.");
    if (!roleId) return setError("يجب اختيار دور.");
    if (!isEdit) {
      if (username.trim().length < 3)
        return setError("اسم المستخدم يجب أن يكون 3 أحرف على الأقل.");
      if (password.length < 4)
        return setError("Password must contain at least 4 characters.");
    }
    try {
      if (isEdit && user) {
        await updateMutation.mutateAsync({
          id: user.id,
          data: {
            fullName: fullName.trim(),
            roleId,
            phone: phone.trim() || null,
            email: email.trim() || null,
            isActive,
          },
        });
      } else {
        await createMutation.mutateAsync({
          data: {
            fullName: fullName.trim(),
            username: username.trim(),
            password,
            roleId,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            isActive,
          },
        });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ المستخدم."));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "تعديل المستخدم" : "مستخدم جديد"}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الاسم الكامل <span className="text-red-500">*</span>
          </label>
          <input
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            data-testid="input-fullName"
          />
        </div>

        {!isEdit && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                اسم المستخدم <span className="text-red-500">*</span>
              </label>
              <input
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                data-testid="input-new-username"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                كلمة المرور <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                data-testid="input-new-password"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            الدور <span className="text-red-500">*</span>
          </label>
          <select
            className={inputClass}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            data-testid="select-role"
          >
            <option value="" disabled>
              اختر دوراً
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameAr ?? r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              رقم الهاتف
            </label>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="input-user-phone"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-user-email"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
            data-testid="checkbox-active"
          />
          حساب نشط
        </label>

        {error && (
          <div
            className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
            data-testid="text-user-form-error"
          >
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition"
            data-testid="button-cancel"
          >
            إلغاء
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
            data-testid="button-save-user"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            حفظ
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
}: {
  user: User;
  onClose: () => void;
}) {
  const mutation = useResetUserPassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (password.length < 4)
      return setError("Password must contain at least 4 characters.");
    if (password !== confirm) return setError("كلمتا المرور غير متطابقتين.");
    try {
      await mutation.mutateAsync({ id: user.id, data: { newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر إعادة تعيين كلمة المرور."));
    }
  }

  return (
    <Modal open onClose={onClose} title="إعادة تعيين كلمة المرور">
      {done ? (
        <div className="text-center py-4">
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-3" />
          <p className="font-bold text-slate-800">
            تم تحديث كلمة مرور {user.fullName} بنجاح.
          </p>
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition"
            data-testid="button-reset-done"
          >
            إغلاق
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            تعيين كلمة مرور جديدة للمستخدم{" "}
            <span className="font-bold text-slate-700">{user.fullName}</span>.
          </p>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              كلمة المرور الجديدة <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              data-testid="input-reset-password"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              تأكيد كلمة المرور <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              data-testid="input-reset-confirm"
            />
          </div>
          {error && (
            <div
              className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
              data-testid="text-reset-error"
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
              disabled={mutation.isPending}
              className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20 disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="button-confirm-reset"
            >
              {mutation.isPending && (
                <Loader2 size={18} className="animate-spin" />
              )}
              تحديث
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: User;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteUser();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: user.id });
      onDeleted();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حذف المستخدم."));
    }
  }

  return (
    <Modal open onClose={onClose} title="حذف المستخدم">
      <div className="space-y-4">
        <p className="text-slate-600">
          هل أنت متأكد من حذف المستخدم{" "}
          <span className="font-bold text-slate-800">{user.fullName}</span>؟ لن
          يتمكن من تسجيل الدخول بعد الآن.
        </p>
        {error && (
          <div
            className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
            data-testid="text-delete-error"
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
            data-testid="button-confirm-delete"
          >
            {mutation.isPending && <Loader2 size={18} className="animate-spin" />}
            حذف
          </button>
        </div>
      </div>
    </Modal>
  );
}
