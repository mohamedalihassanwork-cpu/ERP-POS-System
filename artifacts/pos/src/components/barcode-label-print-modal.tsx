import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, X, Minus, Plus, Settings2, AlignJustify } from "lucide-react";
import { Modal } from "@/components/modal";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PrintPortal } from "./print-portal";
import { printBarcode, labelPageSize } from "@/lib/printer-settings";

// ── Types ─────────────────────────────────────────────────────────────────────

type LabelSize =
  | "47x25"
  | "40x20"
  | "20x10"
  | "30x20"
  | "40x25"
  | "40x30"
  | "50x30"
  | "57x32"
  | "58x40"
  | "60x40"
  | "100x50";

const DEFAULT_LABEL_W_MM = 40;
const DEFAULT_LABEL_H_MM = 20;
const DEFAULT_LABEL_SIZE: LabelSize = "40x20";
const MAX_COPIES = 100;

/**
 * Standard thermal label sizes used widely in retail / POS environments.
 * Format: "WIDTHxHEIGHT" in mm (landscape orientation on the roll).
 */
const LABEL_SIZES: { value: LabelSize; label: string; note?: string }[] = [
  { value: "40x20", label: "40×20 مم", note: "افتراضي" },
  { value: "47x25", label: "47×25 مم", note: "شائع" },
  { value: "20x10", label: "20×10 مم", note: "مجوهرات" },
  { value: "30x20", label: "30×20 مم", note: "أقراص / بطاقات صغيرة" },
  { value: "40x25", label: "40×25 مم", note: "أحذية / ملابس" },
  { value: "40x30", label: "40×30 مم", note: "بطاقة قياسية" },
  { value: "50x30", label: "50×30 مم", note: "إلكترونيات" },
  { value: "57x32", label: "57×32 مم", note: "POS حراري" },
  { value: "58x40", label: "58×40 مم", note: "حراري عريض" },
  { value: "60x40", label: "60×40 مم", note: "صيدلية / أغذية" },
  { value: "100x50", label: "100×50 مم", note: "علبة / شحن" },
];

export interface BarcodeLabelVariant {
  id: string;
  sku: string;
  barcode: string;
  shortId?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  sellingPrice?: string | null;
}

export interface BarcodeLabelProps {
  open: boolean;
  onClose: () => void;
  storeName?: string | null;
  productName: string;
  variants: BarcodeLabelVariant[];
  currency?: string;
}

// ── Resolved label dimensions ─────────────────────────────────────────────────

interface LabelDims {
  /** Width in mm (the short edge of the label) */
  wMm: number;
  /** Height in mm (the tall edge of the label) */
  hMm: number;
}

function resolveDims(
  mode: "preset" | "custom",
  preset: LabelSize,
  customW: string,
  customH: string,
): LabelDims {
  if (mode === "custom") {
    const w = Math.max(10, Math.min(300, Number(customW) || DEFAULT_LABEL_W_MM));
    const h = Math.max(10, Math.min(300, Number(customH) || DEFAULT_LABEL_H_MM));
    return { wMm: w, hMm: h };
  }
  const [rawW, rawH] = preset.split("x").map(Number);
  return { wMm: rawW, hMm: rawH };
}

// ── px conversion for screen preview (96dpi → 3.779528px per mm) ──────────────

const MM_TO_PX = 3.779528;

// ── Single SVG Barcode ────────────────────────────────────────────────────────

function BarcodeDisplay({
  value,
  dims,
}: {
  value: string;
  dims: LabelDims;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      const barcodeValue = value || "000000";
      const isEAN13 = /^\d{13}$/.test(barcodeValue);

      const targetHeightPx = dims.hMm * 0.65 * 3.7795; // 65% of label height natively

      // Render barcode using thick, native widths for fast scanning
      JsBarcode(ref.current, barcodeValue, {
        format: isEAN13 ? "EAN13" : "CODE128",
        width: dims.wMm <= 20 ? 1.5 : dims.wMm <= 30 ? 2.0 : 2.5, // Make bars THICK natively!
        height: targetHeightPx, 
        margin: 0,
        displayValue: false,
        background: "transparent",
        lineColor: "#000000",
      });

      // Let the browser proportionally scale it down if it's too big, but never stretch it!
      ref.current.removeAttribute("style");
      ref.current.setAttribute("preserveAspectRatio", "xMidYMid meet");
    } catch {
      // silent fail
    }
  }, [value, dims]);

  return <svg ref={ref} style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />;
}

function LabelContent({
  productName,
  storeName,
  variant,
  dims,
  currency,
}: {
  productName: string;
  storeName?: string | null;
  variant: BarcodeLabelVariant;
  dims: LabelDims;
  currency: string;
}) {
  const price = variant.sellingPrice;
  let formattedPrice = null;
  if (price) {
    const num = Number(price);
    formattedPrice = `${parseFloat(num.toFixed(2))} ${currency}`;
  }

  const displayId = variant.barcode || "";

  // Dynamically scale fonts based on standard 40x20 size
  const scale = Math.min(dims.wMm / 40, dims.hMm / 20);

  return (
    <div
      style={{
        width: `${dims.wMm}mm`,
        height: `${dims.hMm}mm`,
        padding: "1.5mm",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "stretch",
        overflow: "hidden",
        backgroundColor: "white",
        color: "black",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: `${0.5 * scale}mm` }}>
        {storeName && (
          <div
            style={{
              fontSize: `${11 * scale}pt`,
              fontWeight: "900",
              lineHeight: 1,
              width: "100%",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {storeName}
          </div>
        )}

        <div
          style={{
            fontSize: `${10 * scale}pt`,
            fontWeight: "700",
            lineHeight: 1.1,
            width: "100%",
            maxHeight: "2.4em", // max 2 lines
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-word",
          }}
        >
          {productName}
        </div>
      </div>

      <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: `${0.5 * scale}mm 0`, width: "100%" }}>
        <BarcodeDisplay value={variant.barcode} dims={dims} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%", direction: "ltr" }}>
        <div style={{ fontSize: `${7 * scale}pt`, fontWeight: "800", lineHeight: 0.9, fontFamily: "monospace" }}>
          {displayId}
        </div>
        {formattedPrice && (
          <div style={{ fontSize: `${8 * scale}pt`, fontWeight: "900", lineHeight: 0.9, direction: "rtl" }}>
            {formattedPrice}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Screen Preview Label ──────────────────────────────────────────────────────

function LabelPreview({
  productName,
  storeName,
  variant,
  dims,
  currency,
}: {
  productName: string;
  storeName?: string | null;
  variant: BarcodeLabelVariant;
  dims: LabelDims;
  currency: string;
}) {
  const previewScale = 2;
  const previewW = dims.wMm * previewScale;
  const previewH = dims.hMm * previewScale;

  return (
    <div
      style={{
        width: previewW,
        height: previewH,
        border: "1px solid #e2e8f0",
        background: "#f1f5f9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left", width: `${dims.wMm}mm`, height: `${dims.hMm}mm` }}>
        <LabelContent
          productName={productName}
          storeName={storeName}
          variant={variant}
          dims={dims}
          currency={currency}
        />
      </div>
    </div>
  );
}

// ── Printable Label (injected into DOM for print portal) ──────────────────────

function PrintableLabel({
  productName,
  storeName,
  variant,
  dims,
  currency,
}: {
  productName: string;
  storeName?: string | null;
  variant: BarcodeLabelVariant;
  dims: LabelDims;
  currency: string;
}) {
  return (
    <div className="barcode-label" style={{ backgroundColor: "white", width: `${dims.wMm}mm`, height: `${dims.hMm}mm` }}>
      <LabelContent
        productName={productName}
        storeName={storeName}
        variant={variant}
        dims={dims}
        currency={currency}
      />
    </div>
  );
}

function clampCopies(value: number): number {
  return Math.max(1, Math.min(MAX_COPIES, Math.floor(value) || 1));
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function BarcodeLabelPrintModal({
  open,
  onClose,
  storeName,
  productName,
  variants,
  currency = "ج.م",
}: BarcodeLabelProps) {
  const [selectedVariantId, setSelectedVariantId] = useState(variants[0]?.id ?? "");
  const [copies, setCopies] = useState(1);
  const [sizeMode, setSizeMode] = useState<"preset" | "custom">("preset");
  const [labelSize, setLabelSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
  const [customW, setCustomW] = useState(String(DEFAULT_LABEL_W_MM));
  const [customH, setCustomH] = useState(String(DEFAULT_LABEL_H_MM));

  useEffect(() => {
    if (!open) return;
    setSelectedVariantId(variants[0]?.id ?? "");
    setCopies(1);
    setSizeMode("preset");
    setLabelSize(DEFAULT_LABEL_SIZE);
    setCustomW(String(DEFAULT_LABEL_W_MM));
    setCustomH(String(DEFAULT_LABEL_H_MM));
  }, [open, variants]);

  const selectedVariant =
    variants.find((v) => v.id === selectedVariantId) ?? variants[0];

  const dims = resolveDims(sizeMode, labelSize, customW, customH);

  function handlePrint() {
    // Quantity is encoded in the print portal (N label elements). Do not pass
    // `copies` to Electron — that would duplicate the whole document N times (N²).
    void printBarcode({
      pageSize: labelPageSize(dims.wMm, dims.hMm),
    });
  }

  if (!selectedVariant) return null;

  /*
   * The @page rule:
   * - size: {W}mm {H}mm → exact label paper size; Chrome/Edge respects this
   *   and shows a preview that matches the label dimensions 1:1.
   * - margin: 0 → no browser-added whitespace around the label.
   *
   * We also inject body > * hiding so the app shell disappears during print,
   * same pattern as ThermalReceipt.
   */
  const pageStyle = `
    size: ${dims.wMm}mm ${dims.hMm}mm;
    margin: 0;
  `;

  const bodyHideStyle = `
    @media print {
      body > *:not(#print-portal) { display: none !important; }
      #print-portal { display: block !important; position: static !important; width: ${dims.wMm}mm !important; }
      html, body { width: ${dims.wMm}mm !important; margin: 0 !important; padding: 0 !important; }
    }
  `;

  return (
    <Modal open={open} onClose={onClose} title="طباعة بطاقة باركود" maxWidth="max-w-lg">
      <div className="space-y-4" dir="rtl">

        {/* Variant picker — shown only when multiple variants */}
        {variants.length > 1 && (
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">اختر التنويع</label>
            <select
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.sizeName && `مقاس ${v.sizeName}`, v.colorName]
                    .filter(Boolean)
                    .join(" • ") || v.sku}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Size mode toggle */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">حجم البطاقة</label>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setSizeMode("preset")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition ${sizeMode === "preset"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
            >
              <AlignJustify size={15} /> قياسي
            </button>
            <button
              onClick={() => setSizeMode("custom")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 transition ${sizeMode === "custom"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
            >
              <Settings2 size={15} /> مخصص
            </button>
          </div>

          {sizeMode === "preset" ? (
            <div className="grid grid-cols-3 gap-2">
              {LABEL_SIZES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setLabelSize(s.value)}
                  className={`p-2 rounded-xl border-2 text-right transition ${labelSize === s.value
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                >
                  <div className="text-[11px] font-black">{s.label}</div>
                  {s.note && (
                    <div className="text-[9px] text-slate-400 mt-0.5">{s.note}</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-xs font-bold text-slate-600 mb-1">العرض (مم)</Label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="text-center font-bold"
                  placeholder={String(DEFAULT_LABEL_W_MM)}
                />
              </div>
              <div className="text-slate-400 font-bold pb-3">×</div>
              <div className="flex-1">
                <Label className="text-xs font-bold text-slate-600 mb-1">الارتفاع (مم)</Label>
                <Input
                  type="number"
                  min={10}
                  max={300}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="text-center font-bold"
                  placeholder={String(DEFAULT_LABEL_H_MM)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Copies */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">عدد النسخ</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCopies((c) => clampCopies(c - 1))}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              <Minus size={16} />
            </button>
            <Input
              type="number"
              min={1}
              max={MAX_COPIES}
              value={copies}
              onChange={(e) => setCopies(clampCopies(Number(e.target.value)))}
              className="w-20 text-center font-black text-xl text-slate-800"
            />
            <button
              onClick={() => setCopies((c) => clampCopies(c + 1))}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            معاينة — {dims.wMm}×{dims.hMm} مم
          </label>
          <div className="flex justify-center items-center bg-slate-50 rounded-xl p-4 border border-slate-200 min-h-[80px]">
            <LabelPreview
              productName={productName}
              storeName={storeName}
              variant={selectedVariant}
              dims={dims}
              currency={currency}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition flex items-center justify-center gap-2"
          >
            <X size={16} /> إلغاء
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition flex items-center justify-center gap-2 shadow-md shadow-amber-500/20"
          >
            <Printer size={16} /> طباعة {copies} نسخة
          </button>
        </div>
      </div>

      {/*
       * Hidden print portal — renders the actual labels that will be printed.
       *
       * Each label gets its own page (break-after: page) so copies print
       * cleanly. The style tag inside PrintPortal injects the @page rule
       * with exact label dimensions.
       *
       * We also inject the body-hiding rule here (via a separate <style>)
       * so the app shell is hidden during print, identical to how
       * ThermalReceipt handles it.
       */}
      <PrintPortal pageStyle={pageStyle}>
        <style dangerouslySetInnerHTML={{ __html: bodyHideStyle }} />
        <div className="barcode-label-print-root">
          <div className="barcode-label-page">
            {Array.from({ length: copies }).map((_, i) => (
              <PrintableLabel
                key={i}
                productName={productName}
                storeName={storeName}
                variant={selectedVariant}
                dims={dims}
                currency={currency}
              />
            ))}
          </div>
        </div>
      </PrintPortal>
    </Modal>
  );
}
