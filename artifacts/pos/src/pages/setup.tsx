import { useState } from "react";
import { useLocation } from "wouter";
import {
  Package,
  Store,
  Receipt,
  UserCog,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeSetup,
  getGetSetupStatusQueryKey,
  ApiError,
  type SetupInput,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

interface FormState {
  storeName: string;
  phone: string;
  address: string;
  city: string;
  currency: string;
  taxRate: string;
  printerWidth: "58mm" | "80mm";
  paperType: string;
  adminFullName: string;
  adminUsername: string;
  adminPassword: string;
  adminPasswordConfirm: string;
}

const INITIAL: FormState = {
  storeName: "",
  phone: "",
  address: "",
  city: "",
  currency: "EGP",
  taxRate: "0",
  printerWidth: "80mm",
  paperType: "",
  adminFullName: "",
  adminUsername: "",
  adminPassword: "",
  adminPasswordConfirm: "",
};

const STEPS = [
  { title: "بيانات المتجر", icon: <Store size={20} /> },
  { title: "إعدادات الفوترة", icon: <Receipt size={20} /> },
  { title: "حساب المدير", icon: <UserCog size={20} /> },
  { title: "مراجعة وإنهاء", icon: <CheckCircle2 size={20} /> },
];

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2">
        {label}
        {required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

export function SetupPage() {
  const [, navigate] = useLocation();
  const { login } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (!form.storeName.trim()) return "اسم المتجر مطلوب.";
    }
    if (current === 1) {
      const tax = Number(form.taxRate);
      if (Number.isNaN(tax) || tax < 0 || tax > 100)
        return "نسبة الضريبة يجب أن تكون بين 0 و 100.";
      if (!form.currency.trim()) return "العملة مطلوبة.";
    }
    if (current === 2) {
      if (!form.adminFullName.trim()) return "الاسم الكامل للمدير مطلوب.";
      if (form.adminUsername.trim().length < 3)
        return "اسم المستخدم يجب أن يكون 3 أحرف على الأقل.";
      if (form.adminPassword.length < 4)
        return "Password must contain at least 4 characters.";
      if (form.adminPassword !== form.adminPasswordConfirm)
        return "كلمتا المرور غير متطابقتين.";
    }
    return null;
  }

  function next() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    for (let i = 0; i < 3; i++) {
      const validationError = validateStep(i);
      if (validationError) {
        setStep(i);
        setError(validationError);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    const payload: SetupInput = {
      storeName: form.storeName.trim(),
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      currency: form.currency.trim(),
      taxRate: Number(form.taxRate),
      printerWidth: form.printerWidth,
      paperType: form.paperType.trim() || undefined,
      adminFullName: form.adminFullName.trim(),
      adminUsername: form.adminUsername.trim(),
      adminPassword: form.adminPassword,
    };
    try {
      await completeSetup(payload);
      await login({
        username: form.adminUsername.trim(),
        password: form.adminPassword,
      });
      await queryClient.invalidateQueries({
        queryKey: getGetSetupStatusQueryKey(),
      });
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { error?: string } | undefined;
        setError(data?.error ?? "تعذّر إكمال الإعداد. حاول مرة أخرى.");
      } else {
        setError("حدث خطأ غير متوقع. حاول مرة أخرى.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestoreBackup() {
    if (!window.electronAPI) return;
    if (!window.confirm("سيتم مسح أي بيانات حالية واستبدالها بنسختك الاحتياطية. ثم سيتم إعادة تشغيل النظام. هل أنت متأكد؟")) return;
    
    setSubmitting(true);
    setError(null);
    try {
      const res = await window.electronAPI.restoreDataFolder();
      if (res.canceled) {
        setSubmitting(false);
        return;
      }
      if (res.success) {
        // App will restart
      } else {
        setError(res.error || "فشل استرجاع النسخة الاحتياطية");
        setSubmitting(false);
      }
    } catch (e) {
      setError("حدث خطأ غير متوقع أثناء الاسترجاع");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center shadow-lg mb-3">
            <Package size={28} className="text-slate-900" />
          </div>
          <h1 className="text-2xl font-bold text-white">إعداد النظام لأول مرة</h1>
          <p className="text-slate-400 mt-1">
            أكمل الخطوات التالية لتجهيز متجرك وحساب المدير.
          </p>
        </div>

        {window.electronAPI && (
          <div className="mb-8 flex justify-center">
            <button
              onClick={() => void handleRestoreBackup()}
              disabled={submitting}
              className="flex items-center gap-2 bg-slate-800 text-slate-300 font-bold px-6 py-3 rounded-xl hover:bg-slate-700 hover:text-white transition disabled:opacity-60"
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
              استرجاع النظام من نسخة احتياطية (تخطي الإعداد)
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8 bg-slate-800/50 rounded-2xl p-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    i < step
                      ? "bg-green-500 text-white"
                      : i === step
                        ? "bg-amber-500 text-slate-900"
                        : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {i < step ? <CheckCircle2 size={20} /> : s.icon}
                </div>
                <span
                  className={`text-xs font-bold hidden sm:block ${
                    i <= step ? "text-white" : "text-slate-500"
                  }`}
                >
                  {s.title}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    i < step ? "bg-green-500" : "bg-slate-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === 0 && (
            <div className="space-y-5">
              <Field label="اسم المتجر" required>
                <input
                  className={inputClass}
                  value={form.storeName}
                  onChange={(e) => update("storeName", e.target.value)}
                  placeholder="مثال: متجر الأحذية الأنيقة"
                  data-testid="input-storeName"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="رقم الهاتف">
                  <input
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="01xxxxxxxxx"
                    data-testid="input-phone"
                  />
                </Field>
                <Field label="المدينة">
                  <input
                    className={inputClass}
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    placeholder="مثال: القاهرة"
                    data-testid="input-city"
                  />
                </Field>
              </div>
              <Field label="العنوان">
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="عنوان المتجر بالتفصيل"
                  data-testid="input-address"
                />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="العملة" required>
                  <input
                    className={inputClass}
                    value={form.currency}
                    onChange={(e) => update("currency", e.target.value)}
                    placeholder="EGP"
                    data-testid="input-currency"
                  />
                </Field>
                <Field label="نسبة الضريبة (%)" required hint="من 0 إلى 100">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className={inputClass}
                    value={form.taxRate}
                    onChange={(e) => update("taxRate", e.target.value)}
                    data-testid="input-taxRate"
                  />
                </Field>
              </div>
              <Field label="عرض الطابعة" required>
                <div className="grid grid-cols-2 gap-4">
                  {(["58mm", "80mm"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => update("printerWidth", w)}
                      className={`py-3 rounded-xl border-2 font-bold transition-all ${
                        form.printerWidth === w
                          ? "border-amber-500 bg-amber-50 text-amber-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                      data-testid={`button-printer-${w}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="نوع الورق">
                <input
                  className={inputClass}
                  value={form.paperType}
                  onChange={(e) => update("paperType", e.target.value)}
                  placeholder="مثال: حراري"
                  data-testid="input-paperType"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <Field label="الاسم الكامل للمدير" required>
                <input
                  className={inputClass}
                  value={form.adminFullName}
                  onChange={(e) => update("adminFullName", e.target.value)}
                  placeholder="مثال: محمد أحمد"
                  data-testid="input-adminFullName"
                />
              </Field>
              <Field
                label="اسم المستخدم"
                required
                hint="3 أحرف على الأقل، يُستخدم لتسجيل الدخول"
              >
                <input
                  className={inputClass}
                  value={form.adminUsername}
                  onChange={(e) => update("adminUsername", e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  data-testid="input-adminUsername"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="كلمة المرور" required hint="8 أحرف على الأقل">
                  <input
                    type="password"
                    className={inputClass}
                    value={form.adminPassword}
                    onChange={(e) => update("adminPassword", e.target.value)}
                    autoComplete="new-password"
                    data-testid="input-adminPassword"
                  />
                </Field>
                <Field label="تأكيد كلمة المرور" required>
                  <input
                    type="password"
                    className={inputClass}
                    value={form.adminPasswordConfirm}
                    onChange={(e) =>
                      update("adminPasswordConfirm", e.target.value)
                    }
                    autoComplete="new-password"
                    data-testid="input-adminPasswordConfirm"
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-3">
                  بيانات المتجر
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <ReviewRow label="اسم المتجر" value={form.storeName} />
                  <ReviewRow label="الهاتف" value={form.phone || "—"} />
                  <ReviewRow label="المدينة" value={form.city || "—"} />
                  <ReviewRow label="العنوان" value={form.address || "—"} />
                </dl>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-3">
                  إعدادات الفوترة
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <ReviewRow label="العملة" value={form.currency} />
                  <ReviewRow label="نسبة الضريبة" value={`${form.taxRate}%`} />
                  <ReviewRow label="عرض الطابعة" value={form.printerWidth} />
                  <ReviewRow label="نوع الورق" value={form.paperType || "—"} />
                </dl>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-3">
                  حساب المدير
                </h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <ReviewRow label="الاسم" value={form.adminFullName} />
                  <ReviewRow label="اسم المستخدم" value={form.adminUsername} />
                </dl>
              </div>
            </div>
          )}

          {error && (
            <div
              className="mt-6 bg-red-50 text-red-700 text-sm font-medium rounded-xl px-4 py-3 border border-red-100"
              data-testid="text-setup-error"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
            <button
              type="button"
              onClick={back}
              disabled={step === 0 || submitting}
              className="flex items-center gap-1 px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="button-back"
            >
              <ChevronRight size={18} />
              السابق
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-1 px-6 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition shadow-md shadow-amber-500/20"
                data-testid="button-next"
              >
                التالي
                <ChevronLeft size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-500 transition shadow-md disabled:opacity-60"
                data-testid="button-finish"
              >
                {submitting && <Loader2 size={18} className="animate-spin" />}
                {submitting ? "جارٍ الإنشاء..." : "إنهاء الإعداد"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-4 py-3">
      <dt className="text-slate-400 text-xs font-semibold mb-1">{label}</dt>
      <dd className="text-slate-800 font-bold truncate">{value}</dd>
    </div>
  );
}
