import { useState } from "react";
import {
  Landmark,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Tags,
  Users,
  Wallet,
  HandCoins,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
} from "lucide-react";
import {
  useListExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
  useListExpenses,
  useCreateExpense,
  useDeleteExpense,
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useListSalaries,
  useCreateSalary,
  usePaySalary,
  useDeleteSalary,
  useListAdvances,
  useCreateAdvance,
  useDeleteAdvance,
  useListEquityMovements,
  useCreateEquityMovement,
  useDeleteEquityMovement,
  ApiError,
  type ExpenseCategory,
  type Employee,
  type SalaryRecord,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { TreasurySelect } from "@/components/treasury-select";
import { openCashDrawer } from "@/lib/printer-settings";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

function money(v: string | number | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

type TabKey = "expenses" | "categories" | "employees" | "salaries" | "advances" | "equity";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "expenses", label: "المصروفات", icon: <Wallet size={16} /> },
  { key: "categories", label: "فئات المصروفات", icon: <Tags size={16} /> },
  { key: "employees", label: "الموظفون", icon: <Users size={16} /> },
  { key: "salaries", label: "الرواتب", icon: <HandCoins size={16} /> },
  { key: "advances", label: "السلف", icon: <ArrowUpCircle size={16} /> },
  { key: "equity", label: "حركات المالك", icon: <Landmark size={16} /> },
];

export function FinancePage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("finance.manage") || hasPermission("expenses.create");
  const canViewFinance = hasPermission("finance.view");
  const canCreateExpense = hasPermission("expenses.create");
  const canCreateSalaries = hasPermission("salaries.create");
  const canCreateAdvances = hasPermission("advances.create");
  const canCreateEquity = hasPermission("equity.create");

  const availableTabs = TABS.filter(t => {
    if (t.key === "expenses" || t.key === "categories") return canViewFinance || canCreateExpense;
    if (t.key === "salaries") return canViewFinance || canCreateSalaries;
    if (t.key === "advances") return canViewFinance || canCreateAdvances;
    if (t.key === "equity") return canViewFinance || canCreateEquity;
    if (t.key === "employees") return canViewFinance || canCreateSalaries || canCreateAdvances;
    return false;
  });

  const [tab, setTab] = useState<TabKey>(availableTabs.length > 0 ? availableTabs[0].key : "expenses");

  if (availableTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
        ليس لديك صلاحية الوصول إلى هذه الصفحة.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="الشؤون المالية"
          subtitle="المصروفات والموظفون والرواتب والسلف وحركات المالك"
          icon={<Landmark size={24} />}
        />

        <div className="flex flex-wrap gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
          {availableTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
                tab === t.key
                  ? "bg-amber-500 text-slate-900"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "expenses" && <ExpensesTab canManage={canManage} />}
        {tab === "categories" && <CategoriesTab canManage={canManage} />}
        {tab === "employees" && <EmployeesTab canManage={canManage} />}
        {tab === "salaries" && <SalariesTab canManage={canManage} />}
        {tab === "advances" && <AdvancesTab canManage={canManage} />}
        {tab === "equity" && <EquityTab canManage={canManage} />}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition"
      data-testid="button-add"
    >
      <Plus size={18} />
      {label}
    </button>
  );
}

function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
      <h2 className="font-bold text-slate-800">{title}</h2>
      {action}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100">
      {message}
    </div>
  );
}

function SubmitButton({
  busy,
  label,
}: {
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition disabled:opacity-60 flex items-center justify-center gap-2"
      data-testid="button-submit"
    >
      {busy && <Loader2 size={18} className="animate-spin" />}
      {label}
    </button>
  );
}

// TreasurySelect is imported from @/components/treasury-select

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Expense Categories ──────────────────────────────────────────────────────

function CategoriesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const listQuery = useListExpenseCategories();
  const createMutation = useCreateExpenseCategory();
  const updateMutation = useUpdateExpenseCategory();
  const deleteMutation = useDeleteExpenseCategory();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const categories = listQuery.data ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["/api/finance/expense-categories"] });
  }

  function openAdd() {
    setEditing(null);
    setName("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(c: ExpenseCategory) {
    setEditing(c);
    setName(c.name);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("أدخل اسم الفئة.");
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, data: { name: name.trim() } });
      } else {
        await createMutation.mutateAsync({ data: { name: name.trim() } });
      }
      invalidate();
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ الفئة."));
    }
  }

  async function handleDelete(c: ExpenseCategory) {
    if (!confirm(`حذف الفئة «${c.name}»؟`)) return;
    try {
      await deleteMutation.mutateAsync({ id: c.id });
      invalidate();
    } catch (err) {
      alert(apiErrorMessage(err, "تعذّر حذف الفئة."));
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <SectionHead
        title="فئات المصروفات"
        action={canManage ? <AddButton onClick={openAdd} label="فئة جديدة" /> : undefined}
      />
      {listQuery.isLoading ? (
        <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
      ) : categories.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">الاسم</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {canManage && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id} data-testid={`row-category-${c.id}`}>
                <td className="px-6 py-3 font-medium text-slate-700">{c.name}</td>
                <td className="px-6 py-3">
                  {c.isActive ? (
                    <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-bold">
                      نشطة
                    </span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">
                      غير نشطة
                    </span>
                  )}
                </td>
                {canManage && (
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        data-testid={`button-edit-${c.id}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => void handleDelete(c)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        data-testid={`button-delete-${c.id}`}
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
        <p className="text-slate-400 text-center py-12">لا توجد فئات.</p>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "تعديل الفئة" : "فئة جديدة"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="اسم الفئة" required>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-category-name"
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <SubmitButton busy={busy} label={editing ? "حفظ" : "إضافة"} />
        </form>
      </Modal>
    </Card>
  );
}

// ── Expenses ────────────────────────────────────────────────────────────────

function ExpensesTab({ canManage }: { canManage: boolean }) {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission("finance.delete");
  const queryClient = useQueryClient();
  const listQuery = useListExpenses({ page: 1, pageSize: 50 });
  const categoriesQuery = useListExpenseCategories();
  const createMutation = useCreateExpense();
  const deleteMutation = useDeleteExpense();

  const [modalOpen, setModalOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const expenses = listQuery.data?.items ?? [];
  const categories = (categoriesQuery.data ?? []).filter((c) => c.isActive);

  function openAdd() {
    setCategoryId("");
    setAmount("");
    setExpenseDate(todayStr());
    setTreasuryAccountId("");
    setDescription("");
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!categoryId) return setError("اختر فئة المصروف.");
    if (!(amt > 0)) return setError("أدخل مبلغاً صحيحاً أكبر من صفر.");
    if (!treasuryAccountId) return setError("اختر الخزينة.");
    try {
      await createMutation.mutateAsync({
        data: {
          categoryId,
          amount: amt,
          expenseDate,
          treasuryAccountId,
          description: description.trim() || null,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/finance/expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      
      // Real-time Reports Sync
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تسجيل المصروف."));
    }
  }

  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<{
    id: string;
    desc: string | null;
  } | null>(null);

  async function handleDeleteExpense(id: string, desc: string | null) {
    try {
      await deleteMutation.mutateAsync({ id });
      void queryClient.invalidateQueries({ queryKey: ["/api/finance/expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
      setPendingDeleteExpense(null);
    } catch (err) {
      setPendingDeleteExpense(null);
      // Surface error inside the list table via a brief re-render; no native alert
      setError(apiErrorMessage(err, "تعذّر إلغاء المصروف."));
    }
  }

  const canCreate = canManage || hasPermission("expenses.create");

  return (
    <Card>
      <SectionHead
        title="المصروفات"
        action={canCreate ? <AddButton onClick={openAdd} label="مصروف جديد" /> : undefined}
      />
      {listQuery.isLoading ? (
        <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
      ) : expenses.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">التاريخ</th>
              <th className="text-right font-bold px-6 py-3">الفئة</th>
              <th className="text-right font-bold px-6 py-3">البيان</th>
              <th className="text-right font-bold px-6 py-3">المبلغ</th>
              {canDelete && <th className="text-left font-bold px-6 py-3">إجراء</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map((x) => (
              <tr key={x.id} data-testid={`row-expense-${x.id}`}>
                <td className="px-6 py-3 text-slate-600">{x.expenseDate}</td>
                <td className="px-6 py-3 text-slate-700 font-medium">{x.categoryName ?? "—"}</td>
                <td className="px-6 py-3 text-slate-500">{x.description ?? "—"}</td>
                <td className="px-6 py-3 font-bold text-red-600">{money(x.amount)}</td>
                {canDelete && (
                  <td className="px-6 py-3">
                    <button
                      onClick={() => setPendingDeleteExpense({ id: x.id, desc: x.description ?? null })}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="إلغاء المصروف (عكس الحركة)"
                      data-testid={`button-delete-expense-${x.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-400 text-center py-12">لا توجد مصروفات.</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="مصروف جديد">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="الفئة" required>
            <select
              className={inputClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              data-testid="select-expense-category"
            >
              <option value="">اختر الفئة</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="المبلغ" required>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-expense-amount"
            />
          </Field>
          <Field label="التاريخ" required>
            <input
              type="date"
              className={inputClass}
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              data-testid="input-expense-date"
            />
          </Field>
          <TreasurySelect
            value={treasuryAccountId}
            onChange={setTreasuryAccountId}
            defaultType="CASH"
            className=""
            selectClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            labelClassName="block text-sm font-bold text-slate-700 mb-2"
          />
          <Field label="البيان">
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-expense-description"
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <SubmitButton busy={createMutation.isPending} label="تسجيل المصروف" />
        </form>
      </Modal>

      {pendingDeleteExpense && (
        <ConfirmModal
          message={`إلغاء المصروف «${pendingDeleteExpense.desc ?? "مصروف"}»`}
          detail="سيتم عكس حركة الخزينة والقيد المحاسبي بالكامل."
          busy={deleteMutation.isPending}
          onConfirm={() => void handleDeleteExpense(pendingDeleteExpense.id, pendingDeleteExpense.desc)}
          onCancel={() => setPendingDeleteExpense(null)}
        />
      )}
    </Card>
  );
}

// ── Employees ───────────────────────────────────────────────────────────────

function EmployeesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const listQuery = useListEmployees();
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [error, setError] = useState<string | null>(null);

  const employees = listQuery.data ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["/api/finance/employees"] });
  }

  function openAdd() {
    setEditing(null);
    setName("");
    setPhone("");
    setJobTitle("");
    setMonthlySalary("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setName(emp.name);
    setPhone(emp.phone ?? "");
    setJobTitle(emp.jobTitle ?? "");
    setMonthlySalary(emp.monthlySalary);
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("أدخل اسم الموظف.");
    const salary = monthlySalary ? Number(monthlySalary) : 0;
    if (Number.isNaN(salary) || salary < 0) return setError("أدخل راتباً شهرياً صحيحاً.");
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: {
            name: name.trim(),
            phone: phone.trim() || null,
            jobTitle: jobTitle.trim() || null,
            monthlySalary: salary,
          },
        });
      } else {
        await createMutation.mutateAsync({
          data: {
            name: name.trim(),
            phone: phone.trim() || null,
            jobTitle: jobTitle.trim() || null,
            monthlySalary: salary,
          },
        });
      }
      invalidate();
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ الموظف."));
    }
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`إلغاء تفعيل الموظف «${emp.name}»؟`)) return;
    try {
      await deleteMutation.mutateAsync({ id: emp.id });
      invalidate();
    } catch (err) {
      alert(apiErrorMessage(err, "تعذّر حذف الموظف."));
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <SectionHead
        title="الموظفون"
        action={canManage ? <AddButton onClick={openAdd} label="موظف جديد" /> : undefined}
      />
      {listQuery.isLoading ? (
        <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
      ) : employees.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">الاسم</th>
              <th className="text-right font-bold px-6 py-3">الوظيفة</th>
              <th className="text-right font-bold px-6 py-3">الهاتف</th>
              <th className="text-right font-bold px-6 py-3">الراتب الشهري</th>
              <th className="text-right font-bold px-6 py-3">رصيد السلف</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {canManage && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <tr key={emp.id} data-testid={`row-employee-${emp.id}`}>
                <td className="px-6 py-3 font-medium text-slate-700">{emp.name}</td>
                <td className="px-6 py-3 text-slate-600">{emp.jobTitle ?? "—"}</td>
                <td className="px-6 py-3 text-slate-600">{emp.phone ?? "—"}</td>
                <td className="px-6 py-3 text-slate-700">{money(emp.monthlySalary)}</td>
                <td className="px-6 py-3 font-bold text-amber-600">{money(emp.advanceBalance)}</td>
                <td className="px-6 py-3">
                  {emp.isActive ? (
                    <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-bold">
                      نشط
                    </span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">
                      غير نشط
                    </span>
                  )}
                </td>
                {canManage && (
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(emp)}
                        className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        data-testid={`button-edit-${emp.id}`}
                      >
                        <Pencil size={16} />
                      </button>
                      {emp.isActive && (
                        <button
                          onClick={() => void handleDelete(emp)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          data-testid={`button-delete-${emp.id}`}
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
      ) : (
        <p className="text-slate-400 text-center py-12">لا يوجد موظفون.</p>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "تعديل الموظف" : "موظف جديد"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="الاسم" required>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-employee-name"
            />
          </Field>
          <Field label="الوظيفة">
            <input
              className={inputClass}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              data-testid="input-employee-job"
            />
          </Field>
          <Field label="الهاتف">
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="input-employee-phone"
            />
          </Field>
          <Field label="الراتب الشهري">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={monthlySalary}
              onChange={(e) => setMonthlySalary(e.target.value)}
              data-testid="input-employee-salary"
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <SubmitButton busy={busy} label={editing ? "حفظ" : "إضافة"} />
        </form>
      </Modal>
    </Card>
  );
}

// ── Salaries ────────────────────────────────────────────────────────────────

function SalariesTab({ canManage }: { canManage: boolean }) {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission("finance.delete");
  const queryClient = useQueryClient();
  const listQuery = useListSalaries({ page: 1, pageSize: 50 });
  const deleteSalaryMutation = useDeleteSalary();
  const employeesQuery = useListEmployees();
  const createMutation = useCreateSalary();
  const payMutation = usePaySalary();

  const [modalOpen, setModalOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [payPeriodType, setPayPeriodType] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("MONTHLY");
  const [periodMonth, setPeriodMonth] = useState(thisMonth());
  const [baseSalary, setBaseSalary] = useState("");
  const [bonuses, setBonuses] = useState("");
  const [advanceDeduction, setAdvanceDeduction] = useState("");
  const [otherDeductions, setOtherDeductions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [payTarget, setPayTarget] = useState<SalaryRecord | null>(null);
  const [pendingDeleteSalary, setPendingDeleteSalary] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const salaries = listQuery.data?.items ?? [];
  const employees = (employeesQuery.data ?? []).filter((e) => e.isActive);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["/api/finance/salaries"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/finance/employees"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
    
    // Real-time Reports Sync
    void queryClient.invalidateQueries({ queryKey: ["/api/reports/profit-loss"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
  }

  function openAdd() {
    setEmployeeId("");
    setPayPeriodType("MONTHLY");
    setPeriodMonth(thisMonth());
    setBaseSalary("");
    setBonuses("");
    setAdvanceDeduction("");
    setOtherDeductions("");
    setError(null);
    setModalOpen(true);
  }

  function updateSalaryBasedOnType(monthlyStr: string, type: string, advanceBalanceStr: string) {
    let amt = Number(monthlyStr) || 0;
    if (type === "WEEKLY") amt = amt / 4;
    else if (type === "DAILY") amt = amt / 30;
    setBaseSalary(amt > 0 ? amt.toFixed(2) : "");

    const advance = Number(advanceBalanceStr) || 0;
    if (advance > 0) {
      const maxDeductible = Math.max(0, amt);
      const deduct = Math.min(advance, maxDeductible);
      setAdvanceDeduction(deduct > 0 ? deduct.toFixed(2) : "");
    } else {
      setAdvanceDeduction("");
    }
  }

  function onEmployeeChange(id: string) {
    setEmployeeId(id);
    const emp = employees.find((e) => e.id === id);
    if (emp) {
      updateSalaryBasedOnType(emp.monthlySalary, payPeriodType, emp.advanceBalance);
    }
  }

  function onPayPeriodTypeChange(type: "DAILY" | "WEEKLY" | "MONTHLY") {
    setPayPeriodType(type);
    const emp = employees.find((e) => e.id === employeeId);
    if (emp) {
      updateSalaryBasedOnType(emp.monthlySalary, type, emp.advanceBalance);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!employeeId) return setError("اختر الموظف.");
    if (!periodMonth) return setError("أدخل فترة الاستحقاق.");
    try {
      await (createMutation.mutateAsync as any)({
        data: {
          employeeId,
          periodMonth,
          payPeriodType,
          baseSalary: baseSalary ? Number(baseSalary) : 0,
          bonuses: bonuses ? Number(bonuses) : 0,
          advanceDeduction: advanceDeduction ? Number(advanceDeduction) : 0,
          otherDeductions: otherDeductions ? Number(otherDeductions) : 0,
        },
      });
      invalidate();
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تسجيل الراتب."));
    }
  }

  return (
    <Card>
      <SectionHead
        title="الرواتب"
        action={canManage ? <AddButton onClick={openAdd} label="استحقاق راتب" /> : undefined}
      />
      {listQuery.isLoading ? (
        <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
      ) : salaries.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">الموظف</th>
              <th className="text-right font-bold px-6 py-3">الفترة</th>
              <th className="text-right font-bold px-6 py-3">الأساسي</th>
              <th className="text-right font-bold px-6 py-3">حوافز</th>
              <th className="text-right font-bold px-6 py-3">خصم السلف</th>
              <th className="text-right font-bold px-6 py-3">خصم أخرى</th>
              <th className="text-right font-bold px-6 py-3">الصافي</th>
              <th className="text-right font-bold px-6 py-3">الحالة</th>
              {(canManage || canDelete) && <th className="text-left font-bold px-6 py-3">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {salaries.map((s: any) => (
              <tr key={s.id} data-testid={`row-salary-${s.id}`}>
                <td className="px-6 py-3 font-medium text-slate-700">{s.employeeName ?? "—"}</td>
                <td className="px-6 py-3 text-slate-600">
                  <div className="flex flex-col">
                    <span>{s.periodMonth}</span>
                    <span className="text-[10px] text-slate-400">
                      {s.payPeriodType === "DAILY" ? "يومي" : s.payPeriodType === "WEEKLY" ? "أسبوعي" : "شهري"}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3 text-slate-600">{money(s.baseSalary)}</td>
                <td className="px-6 py-3 text-green-600">{money(s.bonuses)}</td>
                <td className="px-6 py-3 text-red-600">{money(s.advanceDeduction)}</td>
                <td className="px-6 py-3 text-red-600">{money(s.otherDeductions)}</td>
                <td className="px-6 py-3 font-bold text-slate-800">{money(s.netAmount)}</td>
                <td className="px-6 py-3">
                  {s.status === "PAID" ? (
                    <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-bold">
                      مدفوع
                    </span>
                  ) : (
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-xs font-bold">
                      مستحق
                    </span>
                  )}
                </td>
                {(canManage || canDelete) && (
                  <td className="px-6 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canManage && s.status === "PENDING" && (
                        <button
                          onClick={() => setPayTarget(s)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 transition"
                          data-testid={`button-pay-${s.id}`}
                        >
                          <CheckCircle2 size={14} />
                          صرف
                        </button>
                      )}
                      {canDelete && s.status === "PENDING" && (
                        <button
                          onClick={() => setPendingDeleteSalary({ id: s.id, label: s.periodMonth })}
                          disabled={deleteSalaryMutation.isPending}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="حذف الراتب المستحق"
                          data-testid={`button-delete-salary-${s.id}`}
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
      ) : (
        <p className="text-slate-400 text-center py-12">لا توجد رواتب.</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="استحقاق راتب">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="الموظف" required>
            <select
              className={inputClass}
              value={employeeId}
              onChange={(e) => onEmployeeChange(e.target.value)}
              data-testid="select-salary-employee"
            >
              <option value="">اختر الموظف</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نظام الدفع" required>
            <select
              className={inputClass}
              value={payPeriodType}
              onChange={(e) => onPayPeriodTypeChange(e.target.value as any)}
            >
              <option value="MONTHLY">شهري</option>
              <option value="WEEKLY">أسبوعي</option>
              <option value="DAILY">يومي</option>
            </select>
          </Field>
          <Field label="الفترة (اسم أو تاريخ يعبر عن الاستحقاق)" required>
            <input
              type="text"
              className={inputClass}
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
              placeholder="مثال: يناير 2026 أو الأسبوع الأول..."
            />
          </Field>
          <Field label="الراتب الأساسي أو قيمة الفترة المحددة">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value)}
            />
          </Field>
          <Field label="الحوافز">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={bonuses}
              onChange={(e) => setBonuses(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="استقطاع السلف">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={advanceDeduction}
                onChange={(e) => setAdvanceDeduction(e.target.value)}
                placeholder="يُحسب تلقائياً إذا تُرك فارغاً"
              />
              <span className="text-xs text-slate-500 mt-1 block">
                تخصم من رصيد السلف (حساب 1300)
              </span>
            </Field>
            <Field label="خصومات أخرى">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={otherDeductions}
                onChange={(e) => setOtherDeductions(e.target.value)}
                placeholder="غياب، جزاءات..."
              />
              <span className="text-xs text-slate-500 mt-1 block">
                تخفض مصروف الرواتب
              </span>
            </Field>
          </div>
          {error && <ErrorBox message={error} />}
          <SubmitButton busy={createMutation.isPending} label="تسجيل الاستحقاق" />
        </form>
      </Modal>

      {payTarget && (
        <PaySalaryModal
          salary={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => {
            invalidate();
            setPayTarget(null);
          }}
          payMutation={payMutation}
        />
      )}

      {pendingDeleteSalary && (
        <ConfirmModal
          message={`حذف راتب استحقاق ${pendingDeleteSalary.label}`}
          detail="سيتم حذف سجل الراتب المعلق وعكس قيد الاستحقاق المحاسبي."
          busy={deleteSalaryMutation.isPending}
          onConfirm={async () => {
            try {
              await deleteSalaryMutation.mutateAsync({ id: pendingDeleteSalary.id });
              void queryClient.invalidateQueries({ queryKey: ["/api/finance/salaries"] });
              setPendingDeleteSalary(null);
            } catch (err) {
              setPendingDeleteSalary(null);
              setError(apiErrorMessage(err, "تعذّر حذف الراتب."));
            }
          }}
          onCancel={() => setPendingDeleteSalary(null)}
        />
      )}
    </Card>
  );
}

function PaySalaryModal({
  salary,
  onClose,
  onPaid,
  payMutation,
}: {
  salary: SalaryRecord;
  onClose: () => void;
  onPaid: () => void;
  payMutation: ReturnType<typeof usePaySalary>;
}) {
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!treasuryAccountId) return setError("اختر الخزينة.");
    try {
      await payMutation.mutateAsync({ id: salary.id, data: { treasuryAccountId } });
      void queryClient.invalidateQueries({ queryKey: ["/api/finance/salaries"] });
      onPaid();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر صرف الراتب."));
    }
  }

  return (
    <Modal open onClose={onClose} title={`صرف راتب — ${salary.employeeName ?? ""}`}>
      <form onSubmit={handlePay} className="space-y-4">
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">الشهر</span>
            <span className="font-bold text-slate-800">{salary.periodMonth}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">الصافي المستحق</span>
            <span className="font-bold text-slate-800">{money(salary.netAmount)}</span>
          </div>
        </div>
        <TreasurySelect
          value={treasuryAccountId}
          onChange={setTreasuryAccountId}
          defaultType="CASH"
          className=""
          selectClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
          labelClassName="block text-sm font-bold text-slate-700 mb-2"
        />
        {error && <ErrorBox message={error} />}
        <button
          type="submit"
          disabled={payMutation.isPending}
          className="w-full py-2.5 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition disabled:opacity-60 flex items-center justify-center gap-2"
          data-testid="button-confirm-pay"
        >
          {payMutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle2 size={18} />
          )}
          تأكيد الصرف
        </button>
      </form>
    </Modal>
  );
}

// ── Advances ────────────────────────────────────────────────────────────────

function AdvancesTab({ canManage }: { canManage: boolean }) {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission("finance.delete");
  const queryClient = useQueryClient();
  const listQuery = useListAdvances({ page: 1, pageSize: 50 });
  const employeesQuery = useListEmployees();
  const createMutation = useCreateAdvance();
  const deleteMutation = useDeleteAdvance();

  const [modalOpen, setModalOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState(todayStr());
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteAdvance, setPendingDeleteAdvance] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const advances = listQuery.data?.items ?? [];
  const employees = (employeesQuery.data ?? []).filter((e) => e.isActive);

  function openAdd() {
    setEmployeeId("");
    setAmount("");
    setAdvanceDate(todayStr());
    setTreasuryAccountId("");
    setNotes("");
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!employeeId) return setError("اختر الموظف.");
    if (!(amt > 0)) return setError("أدخل مبلغاً صحيحاً أكبر من صفر.");
    if (!treasuryAccountId) return setError("اختر الخزينة.");
    try {
      await createMutation.mutateAsync({
        data: {
          employeeId,
          amount: amt,
          advanceDate,
          treasuryAccountId,
          notes: notes.trim() || null,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/finance/advances"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/finance/employees"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تسجيل السلفة."));
    }
  }

  return (
    <Card>
      <SectionHead
        title="السلف"
        action={canManage ? <AddButton onClick={openAdd} label="سلفة جديدة" /> : undefined}
      />
      {listQuery.isLoading ? (
        <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
      ) : advances.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">التاريخ</th>
              <th className="text-right font-bold px-6 py-3">الموظف</th>
              <th className="text-right font-bold px-6 py-3">المبلغ</th>
              <th className="text-right font-bold px-6 py-3">ملاحظات</th>
              {canDelete && <th className="text-left font-bold px-6 py-3">إجراء</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {advances.map((a) => (
              <tr key={a.id} data-testid={`row-advance-${a.id}`}>
                <td className="px-6 py-3 text-slate-600">{a.advanceDate}</td>
                <td className="px-6 py-3 font-medium text-slate-700">{a.employeeName ?? "—"}</td>
                <td className="px-6 py-3 font-bold text-amber-600">{money(a.amount)}</td>
                <td className="px-6 py-3 text-slate-500">{a.notes ?? "—"}</td>
                {canDelete && (
                  <td className="px-6 py-3">
                    <button
                      onClick={() =>
                        setPendingDeleteAdvance({
                          id: a.id,
                          label: `${a.employeeName ?? ""} — ${money(a.amount)}`,
                        })
                      }
                      disabled={deleteMutation.isPending}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="إلغاء السلفة (عكس الحركة)"
                      data-testid={`button-delete-advance-${a.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-400 text-center py-12">لا توجد سلف.</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="سلفة جديدة">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="الموظف" required>
            <select
              className={inputClass}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              data-testid="select-advance-employee"
            >
              <option value="">اختر الموظف</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="المبلغ" required>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-advance-amount"
            />
          </Field>
          <Field label="التاريخ" required>
            <input
              type="date"
              className={inputClass}
              value={advanceDate}
              onChange={(e) => setAdvanceDate(e.target.value)}
              data-testid="input-advance-date"
            />
          </Field>
          <TreasurySelect
            value={treasuryAccountId}
            onChange={setTreasuryAccountId}
            defaultType="CASH"
            className=""
            selectClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            labelClassName="block text-sm font-bold text-slate-700 mb-2"
          />
          <Field label="ملاحظات">
            <input
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="input-advance-notes"
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <SubmitButton busy={createMutation.isPending} label="تسجيل السلفة" />
        </form>
      </Modal>

      {pendingDeleteAdvance && (
        <ConfirmModal
          message={`إلغاء سلفة — ${pendingDeleteAdvance.label}`}
          detail="سيتم عكس حركة الخزينة والقيد المحاسبي، وتقليل رصيد السلف للموظف."
          busy={deleteMutation.isPending}
          onConfirm={async () => {
            try {
              await deleteMutation.mutateAsync({ id: pendingDeleteAdvance.id });
              void queryClient.invalidateQueries({ queryKey: ["/api/finance/advances"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/finance/employees"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
              setPendingDeleteAdvance(null);
            } catch (err) {
              setPendingDeleteAdvance(null);
              setError(apiErrorMessage(err, "تعذّر إلغاء السلفة."));
            }
          }}
          onCancel={() => setPendingDeleteAdvance(null)}
        />
      )}
    </Card>
  );
}

// ── Equity Movements ────────────────────────────────────────────────────────


function EquityTab({ canManage }: { canManage: boolean }) {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission("finance.delete");
  const queryClient = useQueryClient();
  const listQuery = useListEquityMovements({ page: 1, pageSize: 50 });
  const createMutation = useCreateEquityMovement();
  const deleteMutation = useDeleteEquityMovement();

  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<"WITHDRAWAL" | "DEPOSIT">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [movementDate, setMovementDate] = useState(todayStr());
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteEquity, setPendingDeleteEquity] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const movements = listQuery.data?.items ?? [];

  function openAdd() {
    setType("DEPOSIT");
    setAmount("");
    setMovementDate(todayStr());
    setTreasuryAccountId("");
    setDescription("");
    setError(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!(amt > 0)) return setError("أدخل مبلغاً صحيحاً أكبر من صفر.");
    if (!treasuryAccountId) return setError("اختر الخزينة.");
    try {
      await createMutation.mutateAsync({
        data: {
          type,
          amount: amt,
          movementDate,
          treasuryAccountId,
          description: description.trim() || null,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/finance/equity-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر تسجيل الحركة."));
    }
  }

  return (
    <Card>
      <SectionHead
        title="حركات المالك (إيداع / سحب)"
        action={canManage ? <AddButton onClick={openAdd} label="حركة جديدة" /> : undefined}
      />
      {listQuery.isLoading ? (
        <p className="text-slate-400 text-center py-12">جارٍ التحميل...</p>
      ) : movements.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-right font-bold px-6 py-3">التاريخ</th>
              <th className="text-right font-bold px-6 py-3">النوع</th>
              <th className="text-right font-bold px-6 py-3">المبلغ</th>
              <th className="text-right font-bold px-6 py-3">البيان</th>
              {canDelete && <th className="text-left font-bold px-6 py-3">إجراء</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movements.map((m) => (
              <tr key={m.id} data-testid={`row-equity-${m.id}`}>
                <td className="px-6 py-3 text-slate-600">{m.movementDate}</td>
                <td className="px-6 py-3">
                  {m.type === "DEPOSIT" ? (
                    <span className="inline-flex items-center gap-1 text-green-700 font-bold">
                      <ArrowDownCircle size={15} />
                      إيداع
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                      <ArrowUpCircle size={15} />
                      سحب
                    </span>
                  )}
                </td>
                <td
                  className={`px-6 py-3 font-bold ${
                    m.type === "DEPOSIT" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {m.type === "DEPOSIT" ? "+" : "−"}
                  {money(m.amount)}
                </td>
                <td className="px-6 py-3 text-slate-500">{m.description ?? "—"}</td>
                {canDelete && (
                  <td className="px-6 py-3">
                    <button
                      onClick={() =>
                        setPendingDeleteEquity({
                          id: m.id,
                          label: `${m.type === "DEPOSIT" ? "إيداع" : "سحب"} — ${money(m.amount)}`,
                        })
                      }
                      disabled={deleteMutation.isPending}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="إلغاء الحركة (عكس الخزينة والقيد)"
                      data-testid={`button-delete-equity-${m.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-400 text-center py-12">لا توجد حركات.</p>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="حركة مالك جديدة">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="النوع" required>
            <select
              className={inputClass}
              value={type}
              onChange={(e) => setType(e.target.value as "WITHDRAWAL" | "DEPOSIT")}
              data-testid="select-equity-type"
            >
              <option value="DEPOSIT">إيداع رأس مال</option>
              <option value="WITHDRAWAL">سحب من المالك</option>
            </select>
          </Field>
          <Field label="المبلغ" required>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-equity-amount"
            />
          </Field>
          <Field label="التاريخ" required>
            <input
              type="date"
              className={inputClass}
              value={movementDate}
              onChange={(e) => setMovementDate(e.target.value)}
              data-testid="input-equity-date"
            />
          </Field>
          <TreasurySelect
            value={treasuryAccountId}
            onChange={setTreasuryAccountId}
            defaultType="CASH"
            className=""
            selectClassName="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            labelClassName="block text-sm font-bold text-slate-700 mb-2"
          />
          <Field label="البيان">
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-equity-description"
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <SubmitButton busy={createMutation.isPending} label="تسجيل الحركة" />
        </form>
      </Modal>

      {pendingDeleteEquity && (
        <ConfirmModal
          message={`إلغاء حركة المالك (${pendingDeleteEquity.label})`}
          detail="سيتم عكس حركة الخزينة والقيد المحاسبي بالكامل."
          busy={deleteMutation.isPending}
          onConfirm={async () => {
            try {
              await deleteMutation.mutateAsync({ id: pendingDeleteEquity.id });
              void queryClient.invalidateQueries({ queryKey: ["/api/finance/equity-movements"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/treasury/accounts"] });
              void queryClient.invalidateQueries({ queryKey: ["/api/reports/treasury"] });
              setPendingDeleteEquity(null);
            } catch (err) {
              setPendingDeleteEquity(null);
              setError(apiErrorMessage(err, "تعذّر إلغاء الحركة."));
            }
          }}
          onCancel={() => setPendingDeleteEquity(null)}
        />
      )}
    </Card>
  );
}

// ── Shared: Confirm Modal ─────────────────────────────────────────────

function ConfirmModal({
  message,
  detail,
  onConfirm,
  onCancel,
  busy,
}: {
  message: string;
  detail?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal open onClose={onCancel} title="تأكيد العملية" maxWidth="max-w-sm">
      <div className="space-y-4">
        <p className="text-slate-700 font-medium text-sm">{message}</p>
        {detail && (
          <p className="text-slate-500 text-xs bg-slate-50 rounded-xl p-3 border border-slate-100">
            {detail}
          </p>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition disabled:opacity-50"
          >
            لا، إلغاء
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 px-5 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition disabled:opacity-50"
            data-testid="button-confirm-delete"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            تأكيد الإلغاء
          </button>
        </div>
      </div>
    </Modal>
  );
}
