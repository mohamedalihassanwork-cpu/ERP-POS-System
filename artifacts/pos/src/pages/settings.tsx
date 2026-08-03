import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Loader2,
  Save,
  Hash,
  Pencil,
  Printer as PrinterIcon,
  DatabaseBackup,
} from "lucide-react";
import {
  useGetStoreSettings,
  useUpdateStoreSettings,
  useListNumberSequences,
  useUpdateNumberSequence,
  getGetStoreSettingsQueryKey,
  getListNumberSequencesQueryKey,
  ApiError,
  type StoreSettings,
  type NumberSequence,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Modal } from "@/components/modal";
import { getPrinterSettings, savePrinterSettings } from "@/lib/printer-settings";

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition";

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string } | undefined;
    return data?.error ?? fallback;
  }
  return fallback;
}

const SEQUENCE_LABELS: Record<string, string> = {
  SALE: "فاتورة بيع",
  SALES_RETURN: "مرتجع بيع",
  PURCHASE: "فاتورة شراء",
  PURCHASE_RETURN: "مرتجع شراء",
  TRANSFER: "تحويل مخزني",
  STOCK_COUNT: "جرد مخزني",
};

type TabKey = "store" | "sequences" | "printers" | "backup";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "store", label: "إعدادات المتجر", icon: <SettingsIcon size={16} /> },
  { key: "sequences", label: "ترقيم المستندات", icon: <Hash size={16} /> },
  { key: "printers", label: "الطابعات", icon: <PrinterIcon size={16} /> },
  { key: "backup", label: "النسخ الاحتياطي", icon: <DatabaseBackup size={16} /> },
];

export function SettingsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("settings.manage");
  const [tab, setTab] = useState<TabKey>("store");

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="الإعدادات"
          subtitle="إعدادات المتجر والضريبة والإيصالات وترقيم المستندات"
          icon={<SettingsIcon size={24} />}
        />

        <div className="flex flex-wrap gap-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-2">
          {TABS.map((t) => (
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

        {/* All tab panels always mounted — CSS display toggle preserves form state across tab switches */}
        <div style={{ display: tab === "store" ? "block" : "none" }}>
          <StoreSettingsTab canManage={canManage} />
        </div>
        <div style={{ display: tab === "sequences" ? "block" : "none" }}>
          <SequencesTab canManage={canManage} />
        </div>
        <div style={{ display: tab === "printers" ? "block" : "none" }}>
          <PrintersTab />
        </div>
        <div style={{ display: tab === "backup" ? "block" : "none" }}>
          <BackupTab />
        </div>
      </div>
    </div>
  );
}

type StoreForm = {
  currency: string;
  taxEnabled: boolean;
  taxRate: string;
  taxInclusive: boolean;
  receiptSize: string;
  receiptFooter: string;
  numeralFormat: string;
  allowNegativeStock: boolean;
  allowBelowCostDiscount: boolean;
  allowNegativeTreasury: boolean;
  requireSessionForCash: boolean;
  shiftStartHour: number;
};

function settingsToForm(s: StoreSettings): StoreForm {
  return {
    currency: s.currency,
    taxEnabled: s.taxEnabled,
    taxRate: s.taxRate,
    taxInclusive: s.taxInclusive,
    receiptSize: s.receiptSize,
    receiptFooter: s.receiptFooter ?? "",
    numeralFormat: s.numeralFormat,
    allowNegativeStock: s.allowNegativeStock,
    allowBelowCostDiscount: s.allowBelowCostDiscount,
    allowNegativeTreasury: s.allowNegativeTreasury,
    requireSessionForCash: s.requireSessionForCash,
    shiftStartHour: (s as any).shiftStartHour ?? 11,
  };
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-100 ${
        disabled ? "opacity-60" : "cursor-pointer hover:border-slate-200"
      }`}
    >
      <div className="min-w-0">
        <p className="font-bold text-slate-700 text-sm">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition shrink-0 ${
          checked ? "bg-amber-500" : "bg-slate-300"
        }`}
        data-testid={testId}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
            checked ? "right-0.5" : "right-[22px]"
          }`}
        />
      </button>
    </label>
  );
}

function StoreSettingsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const settingsQuery = useGetStoreSettings();
  const updateMutation = useUpdateStoreSettings();
  const [form, setForm] = useState<StoreForm | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsToForm(settingsQuery.data));
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading || !form) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Loader2 className="animate-spin inline" size={24} />
      </div>
    );
  }

  async function handleSave() {
    if (!form) return;
    setError("");
    setSaved(false);
    const rate = Number(form.taxRate);
    if (form.taxEnabled && (Number.isNaN(rate) || rate < 0 || rate > 100)) {
      setError("نسبة الضريبة يجب أن تكون بين 0 و 100");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        data: {
          currency: form.currency.trim(),
          taxEnabled: form.taxEnabled,
          taxRate: rate,
          taxInclusive: form.taxInclusive,
          receiptSize: form.receiptSize as "58mm" | "80mm" | "A4",
          receiptFooter: form.receiptFooter.trim() || null,
          numeralFormat: form.numeralFormat as "western" | "arabic",
          allowNegativeStock: form.allowNegativeStock,
          allowBelowCostDiscount: form.allowBelowCostDiscount,
          allowNegativeTreasury: form.allowNegativeTreasury,
          requireSessionForCash: form.requireSessionForCash,
          shiftStartHour: form.shiftStartHour,
        },
      });
      void queryClient.invalidateQueries({
        queryKey: getGetStoreSettingsQueryKey(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ الإعدادات"));
    }
  }

  const set = <K extends keyof StoreForm>(k: K, v: StoreForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-700">العملة والضريبة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              العملة
            </label>
            <input
              className={inputClass}
              value={form.currency}
              disabled={!canManage}
              onChange={(e) => set("currency", e.target.value)}
              data-testid="input-currency"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              نظام الأرقام
            </label>
            <select
              className={inputClass}
              value={form.numeralFormat}
              disabled={!canManage}
              onChange={(e) => set("numeralFormat", e.target.value)}
              data-testid="select-numeral-format"
            >
              <option value="western">غربي (123)</option>
              <option value="arabic">عربي (١٢٣)</option>
            </select>
          </div>
        </div>

        <Toggle
          label="تفعيل الضريبة"
          hint="احتساب ضريبة القيمة المضافة على الفواتير"
          checked={form.taxEnabled}
          onChange={(v) => set("taxEnabled", v)}
          disabled={!canManage}
          testId="toggle-tax-enabled"
        />
        {form.taxEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">
                نسبة الضريبة (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                className={inputClass}
                value={form.taxRate}
                disabled={!canManage}
                onChange={(e) => set("taxRate", e.target.value)}
                data-testid="input-tax-rate"
              />
            </div>
            <div className="flex items-end">
              <Toggle
                label="الضريبة شاملة بالسعر"
                checked={form.taxInclusive}
                onChange={(v) => set("taxInclusive", v)}
                disabled={!canManage}
                testId="toggle-tax-inclusive"
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-700">الإيصالات</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              حجم الإيصال
            </label>
            <select
              className={inputClass}
              value={form.receiptSize}
              disabled={!canManage}
              onChange={(e) => set("receiptSize", e.target.value)}
              data-testid="select-receipt-size"
            >
              <option value="58mm">حراري 58 مم</option>
              <option value="80mm">حراري 80 مم</option>
              <option value="A4">A4</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-1.5">
            تذييل الإيصال
          </label>
          <textarea
            className={inputClass}
            rows={2}
            value={form.receiptFooter}
            disabled={!canManage}
            onChange={(e) => set("receiptFooter", e.target.value)}
            placeholder="شكراً لزيارتكم"
            data-testid="input-receipt-footer"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
        <h3 className="font-bold text-slate-700">قواعد التشغيل</h3>
        <Toggle
          label="السماح بالمخزون السالب"
          hint="السماح بالبيع حتى عند نفاد الرصيد"
          checked={form.allowNegativeStock}
          onChange={(v) => set("allowNegativeStock", v)}
          disabled={!canManage}
          testId="toggle-allow-negative-stock"
        />
        <Toggle
          label="السماح بالخصم تحت التكلفة"
          hint="السماح ببيع المنتج بأقل من سعر التكلفة"
          checked={form.allowBelowCostDiscount}
          onChange={(v) => set("allowBelowCostDiscount", v)}
          disabled={!canManage}
          testId="toggle-allow-below-cost"
        />
        <Toggle
          label="السماح بالخزينة السالبة"
          hint="السماح بالصرف حتى عند عدم كفاية الرصيد"
          checked={form.allowNegativeTreasury}
          onChange={(v) => set("allowNegativeTreasury", v)}
          disabled={!canManage}
          testId="toggle-allow-negative-treasury"
        />
        <Toggle
          label="إلزام فتح وردية للمبيعات النقدية"
          hint="يجب فتح وردية خزينة قبل تنفيذ مبيعات نقدية"
          checked={form.requireSessionForCash}
          onChange={(v) => set("requireSessionForCash", v)}
          disabled={!canManage}
          testId="toggle-require-session"
        />

        {/* Shift start hour */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-100">
          <div className="min-w-0">
            <p className="font-bold text-slate-700 text-sm">وقت بداية الوردية</p>
            <p className="text-xs text-slate-400 mt-0.5">
              ساعة بداية اليوم التشغيلي (بالتوقيت المحلي). المبيعات قبل هذه الساعة تُحتسب ضمن اليوم السابق.
            </p>
          </div>
          <select
            className="px-3 py-2 rounded-xl border border-slate-200 focus:border-amber-500 outline-none transition text-sm font-bold text-slate-700 bg-white shrink-0"
            value={form.shiftStartHour}
            disabled={!canManage}
            onChange={(e) => set("shiftStartHour", Number(e.target.value))}
            data-testid="select-shift-start-hour"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="text-emerald-600 text-sm font-bold">
              تم الحفظ ✓
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-amber-400 transition disabled:opacity-60"
            data-testid="button-save-settings"
          >
            {updateMutation.isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            حفظ الإعدادات
          </button>
        </div>
      )}
    </div>
  );
}

function SequencesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const sequencesQuery = useListNumberSequences();
  const updateMutation = useUpdateNumberSequence();
  const [editing, setEditing] = useState<NumberSequence | null>(null);
  const [prefix, setPrefix] = useState("");
  const [padding, setPadding] = useState("4");
  const [error, setError] = useState("");

  const sequences = sequencesQuery.data ?? [];

  function openEdit(seq: NumberSequence) {
    setEditing(seq);
    setPrefix(seq.prefix);
    setPadding(String(seq.padding));
    setError("");
  }

  async function handleSave() {
    if (!editing) return;
    setError("");
    const pad = Number(padding);
    if (Number.isNaN(pad) || pad < 1 || pad > 10) {
      setError("عدد الخانات يجب أن يكون بين 1 و 10");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        kind: editing.kind,
        data: { prefix: prefix.trim(), padding: pad },
      });
      void queryClient.invalidateQueries({
        queryKey: getListNumberSequencesQueryKey(),
      });
      setEditing(null);
    } catch (err) {
      setError(apiErrorMessage(err, "تعذّر حفظ الترقيم"));
    }
  }

  function preview(seq: NumberSequence): string {
    return `${seq.prefix}${String(seq.nextValue).padStart(seq.padding, "0")}`;
  }

  if (sequencesQuery.isLoading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Loader2 className="animate-spin inline" size={24} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-right p-4 font-bold">المستند</th>
            <th className="text-right p-4 font-bold">البادئة</th>
            <th className="text-center p-4 font-bold">الخانات</th>
            <th className="text-right p-4 font-bold">الرقم التالي</th>
            {canManage && <th className="p-4"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sequences.map((seq) => (
            <tr key={seq.id} data-testid={`row-sequence-${seq.kind}`}>
              <td className="p-4 font-bold text-slate-700">
                {SEQUENCE_LABELS[seq.kind] ?? seq.kind}
              </td>
              <td className="p-4 text-slate-500">{seq.prefix || "—"}</td>
              <td className="p-4 text-center text-slate-500">{seq.padding}</td>
              <td className="p-4">
                <span className="font-mono font-bold text-amber-600">
                  {preview(seq)}
                </span>
              </td>
              {canManage && (
                <td className="p-4 text-left">
                  <button
                    onClick={() => openEdit(seq)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-amber-600"
                    data-testid={`button-edit-sequence-${seq.kind}`}
                  >
                    <Pencil size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`ترقيم: ${editing ? SEQUENCE_LABELS[editing.kind] ?? editing.kind : ""}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              البادئة
            </label>
            <input
              className={inputClass}
              value={prefix}
              maxLength={12}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="INV-"
              data-testid="input-sequence-prefix"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              عدد الخانات (1–10)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              className={inputClass}
              value={padding}
              onChange={(e) => setPadding(e.target.value)}
              data-testid="input-sequence-padding"
            />
          </div>
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setEditing(null)}
              className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
              data-testid="button-cancel-sequence"
            >
              إلغاء
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-amber-400 transition disabled:opacity-60"
              data-testid="button-save-sequence"
            >
              {updateMutation.isPending && (
                <Loader2 className="animate-spin" size={18} />
              )}
              حفظ
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PrintersTab() {
  const [printers, setPrinters] = useState<ElectronPrinter[]>([]);
  const [receiptPrinter, setReceiptPrinter] = useState("");
  const [barcodePrinter, setBarcodePrinter] = useState("");
  const [invoicePrinter, setInvoicePrinter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        if (window.electronAPI) {
          const list = await window.electronAPI.getPrinters();
          setPrinters(list);
        }
        const settings = await getPrinterSettings();
        setReceiptPrinter(settings.receiptPrinter || "");
        setBarcodePrinter(settings.barcodePrinter || "");
        setInvoicePrinter(settings.invoicePrinter || "");
      } catch (err) {
        setError("فشل تحميل إعدادات الطابعات");
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await savePrinterSettings({
        receiptPrinter,
        barcodePrinter,
        invoicePrinter,
      });
      if (res.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error || "تعذّر حفظ إعدادات الطابعات");
      }
    } catch (err) {
      setError("حدث خطأ غير متوقع");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Loader2 className="animate-spin inline" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-700">إعدادات الطباعة الافتراضية</h3>
        
        {!window.electronAPI && (
          <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm font-bold">
            أنت تستخدم نسخة المتصفح. يرجى استخدام تطبيق سطح المكتب للطباعة الصامتة والآلية.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              طابعة الإيصالات (58mm / 80mm)
            </label>
            <select
              className={inputClass}
              value={receiptPrinter}
              onChange={(e) => setReceiptPrinter(e.target.value)}
            >
              <option value="">طابعة النظام الافتراضية</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              طابعة الباركود / الملصقات
            </label>
            <select
              className={inputClass}
              value={barcodePrinter}
              onChange={(e) => setBarcodePrinter(e.target.value)}
            >
              <option value="">طابعة النظام الافتراضية</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1.5">
              طابعة الفواتير (A4)
            </label>
            <select
              className={inputClass}
              value={invoicePrinter}
              onChange={(e) => setInvoicePrinter(e.target.value)}
            >
              <option value="">طابعة النظام الافتراضية</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="text-emerald-600 text-sm font-bold">
            تم الحفظ ✓
          </span>
        )}
        <button
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-amber-400 transition disabled:opacity-60"
        >
          {isSaving ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <Save size={18} />
          )}
          حفظ إعدادات الطابعات
        </button>
      </div>
    </div>
  );
}

function BackupTab() {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupPath, setAutoBackupPath] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    async function load() {
      if (window.electronAPI) {
        try {
          const settings = await window.electronAPI.getBackupSettings();
          setAutoBackupEnabled(settings.autoBackupEnabled);
          setAutoBackupPath(settings.autoBackupPath);
        } catch (err) {
          setError("فشل تحميل إعدادات النسخ الاحتياطي");
        }
      }
      setIsLoading(false);
    }
    void load();
  }, []);

  async function handleSaveSettings() {
    setIsSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await window.electronAPI?.saveBackupSettings({ autoBackupEnabled, autoBackupPath });
      if (res?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res?.error || "تعذّر حفظ إعدادات النسخ التلقائي");
      }
    } catch (err) {
      setError("حدث خطأ غير متوقع");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSelectPath() {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.selectDirectory();
    if (res.success && res.path) {
      setAutoBackupPath(res.path);
    }
  }

  async function handleManualBackup() {
    if (!window.electronAPI) return;
    setIsProcessing(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await window.electronAPI.backupDataFolder();
      if (res.canceled) return;
      if (res.success) {
        setSuccessMsg(`تم أخذ النسخة الاحتياطية بنجاح في: ${res.path}`);
      } else {
        setError(res.error || "فشل إنشاء النسخة الاحتياطية");
      }
    } catch (e) {
      setError("حدث خطأ غير متوقع");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleManualRestore() {
    if (!window.electronAPI) return;
    if (!window.confirm("تحذير: سيتم مسح قاعدة البيانات الحالية واستبدالها بالنسخة التي ستختارها. وسيعاد تشغيل النظام. هل أنت متأكد؟")) return;
    
    setIsProcessing(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await window.electronAPI.restoreDataFolder();
      if (res.canceled) return;
      if (res.success) {
        // App will restart
      } else {
        setError(res.error || "فشل استرجاع النسخة الاحتياطية");
      }
    } catch (e) {
      setError("حدث خطأ غير متوقع أثناء الاسترجاع");
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400">
        <Loader2 className="animate-spin inline" size={24} />
      </div>
    );
  }

  if (!window.electronAPI) {
    return (
      <div className="bg-amber-50 text-amber-700 p-4 rounded-xl text-sm font-bold">
        أنت تستخدم نسخة المتصفح. ميزة النسخ الاحتياطي متاحة فقط في تطبيق سطح المكتب.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-700">النسخ الاحتياطي اليدوي</h3>
        <p className="text-sm text-slate-500">
          استخدم هذه الأزرار لأخذ نسخة من قاعدة بياناتك ومجلد البيانات كملف عادي غير مضغوط لتسهيل نقله واسترجاعه.
        </p>
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => void handleManualBackup()}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-amber-500 text-slate-900 font-bold px-6 py-2.5 rounded-xl hover:bg-amber-400 transition disabled:opacity-60"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <DatabaseBackup size={18} />}
            أخذ نسخة احتياطية الآن
          </button>
          
          <button
            onClick={() => void handleManualRestore()}
            disabled={isProcessing}
            className="flex items-center gap-2 bg-slate-100 text-slate-700 font-bold px-6 py-2.5 rounded-xl hover:bg-slate-200 transition disabled:opacity-60 border border-slate-200"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            استرجاع من نسخة احتياطية
          </button>
        </div>
        {successMsg && (
          <div className="bg-emerald-50 text-emerald-700 text-sm rounded-xl p-3 font-bold">
            {successMsg}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <h3 className="font-bold text-slate-700">النسخ الاحتياطي التلقائي</h3>
        <p className="text-sm text-slate-500">
          سيقوم النظام بأخذ نسخة احتياطية بشكل تلقائي كل 5 ساعات إذا كان التطبيق مفتوحاً. سيتم الكتابة فوق النسخة التلقائية السابقة لتوفير المساحة.
        </p>
        
        <Toggle
          label="تفعيل النسخ الاحتياطي التلقائي (كل 5 ساعات)"
          checked={autoBackupEnabled}
          onChange={setAutoBackupEnabled}
          testId="toggle-auto-backup"
        />

        {autoBackupEnabled && (
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600">
              مسار النسخ التلقائي (مثل مسار الفلاشة)
            </label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={autoBackupPath}
                readOnly
                placeholder="لم يتم التحديد..."
              />
              <button
                onClick={() => void handleSelectPath()}
                className="bg-slate-100 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-200 transition border border-slate-200 shrink-0"
              >
                تصفح...
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4">
          {saved && (
            <span className="text-emerald-600 text-sm font-bold">
              تم حفظ الإعدادات ✓
            </span>
          )}
          <button
            onClick={() => void handleSaveSettings()}
            disabled={isSaving}
            className="flex items-center gap-2 bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-slate-700 transition disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            حفظ إعدادات النسخ التلقائي
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center font-bold">
          {error}
        </div>
      )}
    </div>
  );
}
