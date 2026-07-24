import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptItem {
  productName: string;
  colorName?: string | null;
  sizeName?: string | null;
  quantity: number;
  unitPrice: string | number;
  discountAmount?: string | number | null;
  lineTotal: string | number;
}

export interface ReceiptPayment {
  method: string;
  amount: string | number;
}

export interface ReceiptData {
  // Store info (from settings)
  storeName?: string | null;
  storePhone?: string | null;
  storeAddress?: string | null;
  logoUrl?: string | null;
  receiptFooter?: string | null;
  receiptSize?: string; // "80mm" | "58mm"
  currency?: string;
  taxEnabled?: boolean;
  taxRate?: string;
  // Invoice info
  invoiceNumber: string;
  cashierName?: string | null;
  customerName?: string | null;
  createdAt: string; // ISO
  // Line items
  items: ReceiptItem[];
  // Totals
  subtotal: string | number;
  discountAmount?: string | number | null;
  taxAmount?: string | number | null;
  totalAmount: string | number;
  // Payment
  payments: ReceiptPayment[];
  amountPaid?: string | number | null;
  changeDue?: string | number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  CASH: "نقدي",
  CARD: "بطاقة / فيزا",
  INSTAPAY: "إنستاباي",
  WALLET: "محفظة",
  CREDIT: "آجل",
};

function fmt(v: string | number | null | undefined, currency = "ج.م"): string {
  if (v == null) return "0.00";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "0.00";
  return `${n.toFixed(2)} ${currency}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit", day: "2-digit" });
    const time = d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    return `${date}  ${time}`;
  } catch {
    return iso;
  }
}

// ── Barcode SVG (replaces QR Code) ───────────────────────────────────────────

function InvoiceBarcodeDisplay({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 1.5,
        height: 40,
        displayValue: true,
        fontSize: 10,
        margin: 10,
        background: "transparent",
        lineColor: "#000000",
      });
    } catch {
      // ignore invalid barcode values
    }
  }, [value]);
  return (
    <svg
      ref={ref}
      className="receipt-barcode"
      style={{ display: "block", margin: "2mm auto" }}
    />
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * ThermalReceipt renders a full professional thermal-printer receipt.
 *
 * - Set `forPrint=true` to render without screen card chrome (white bg, no border).
 * - Wrap with <div id="print-portal"> and trigger window.print() from outside.
 */
export function ThermalReceipt({
  data,
  forPrint = false,
}: {
  data: ReceiptData;
  forPrint?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cur = data.currency ?? "ج.م";
  const is58 = data.receiptSize === "58mm";

  const subtotal = Number(data.subtotal ?? 0);
  const discount = Number(data.discountAmount ?? 0);
  const tax = Number(data.taxAmount ?? 0);
  const total = Number(data.totalAmount ?? 0);
  const paid = Number(data.amountPaid ?? total);
  const change = Number(data.changeDue ?? 0);

  const screenStyle: React.CSSProperties = forPrint
    ? {}
    : {
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        maxWidth: is58 ? "220px" : "320px",
        margin: "0 auto",
        padding: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "11px",
        color: "#111",
        lineHeight: 1.5,
      };

  return (
    <>
      {forPrint && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              /* 
               * 80mm = printable width of Epson TM-T20II thermal paper.
               * "auto" height = browser shrinks page to exactly fit content,
               * eliminating the blank whitespace below the receipt that
               * occurs when the browser defaults to A4 (297mm) height.
               * margin: 0 removes the browser's built-in page margins (normally
               * ~10mm on each side) which would otherwise cut off the 80mm content.
               */
              size: ${is58 ? "58mm" : "80mm"} auto;
              margin: 0;
            }

            /*
             * During print, Chrome/Edge still use the body's layout dimensions
             * to compute the page count. Resetting width/margin here ensures the
             * body does not exceed 80mm, which would force a second empty page.
             */
            html, body {
              width: ${is58 ? "58mm" : "80mm"} !important;
              height: auto !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              background: white !important;
            }

            /*
             * The print portal is positioned fixed/absolute in screen mode
             * (display:none). In print mode we make it static so it participates
             * in normal flow — this prevents the browser from measuring an
             * incorrect page height based on fixed-position dimensions.
             */
            #print-portal {
              display: block !important;
              position: static !important;
              width: ${is58 ? "58mm" : "80mm"} !important;
              height: auto !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
            }

            /* Hide everything except the print portal */
            body > *:not(#print-portal) {
              display: none !important;
            }

            /* Store name: prominent header — larger than body text */
            .receipt-print-root .receipt-store-name {
              font-size: ${is58 ? "11pt" : "14pt"} !important;
              font-weight: bold !important;
              letter-spacing: 0.3pt;
            }
          }
        `}} />
      )}
      <div
        ref={rootRef}
        className={`receipt-print-root${is58 ? " size-58mm" : ""}`}
      dir="rtl"
      style={screenStyle}
    >
      {/* ── Store Header ── */}
      {data.logoUrl ? (
        <img src={data.logoUrl} alt="شعار المتجر" className="receipt-logo" />
      ) : null}

      <div className="receipt-store-name" style={{ textAlign: "center", fontWeight: "bold", fontSize: forPrint ? undefined : "18px", marginBottom: "4px" }}>
        {data.storeName ?? "المتجر"}
      </div>

      {data.storeAddress && (
        <div className="receipt-center" style={{ textAlign: "center", fontSize: forPrint ? undefined : "10px" }}>
          {data.storeAddress}
        </div>
      )}
      {/* Phone replaced by cashier/salesperson name per business requirement */}
      {data.cashierName && (
        <div className="receipt-center" style={{ textAlign: "center", fontSize: forPrint ? undefined : "10px" }}>
          الكاشير: {data.cashierName}
        </div>
      )}

      <hr className="receipt-divider-solid" style={{ border: "none", borderTop: "1px solid black", margin: "4px 0" }} />

      {/* ── Invoice Meta ── */}
      <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
        <span style={{ fontWeight: "bold" }}>رقم الفاتورة:</span>
        <span style={{ fontWeight: "bold" }}>{data.invoiceNumber}</span>
      </div>
      <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
        <span>التاريخ:</span>
        <span>{fmtDate(data.createdAt)}</span>
      </div>
      {/* cashierName is now shown in the store header above — omit duplicate here */}
      {data.customerName && (
        <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
          <span>العميل:</span>
          <span>{data.customerName}</span>
        </div>
      )}

      <hr className="receipt-divider" style={{ border: "none", borderTop: "1px dashed black", margin: "4px 0" }} />

      {/* ── Items Table ── */}
      <table className="receipt-items-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: forPrint ? undefined : "10px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "right", borderBottom: "1px solid black", paddingBottom: "2px" }}>الصنف</th>
            <th style={{ textAlign: "center", borderBottom: "1px solid black" }}>ك</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid black" }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, idx) => {
            const label = [
              item.productName,
              item.sizeName && `م${item.sizeName}`,
              item.colorName,
            ]
              .filter(Boolean)
              .join(" ");
            const disc = Number(item.discountAmount ?? 0);
            return (
              <tr key={idx}>
                <td style={{ paddingTop: "2px" }}>
                  <div style={{ fontWeight: "bold", lineHeight: 1.2 }}>{label}</div>
                  <div style={{ opacity: 0.75 }}>
                    {fmt(item.unitPrice, cur)}
                    {disc > 0 && <span> (-{fmt(disc, cur)})</span>}
                  </div>
                </td>
                <td style={{ textAlign: "center", verticalAlign: "top", paddingTop: "2px" }}>{item.quantity}</td>
                <td style={{ textAlign: "left", verticalAlign: "top", fontWeight: "bold", paddingTop: "2px", whiteSpace: "nowrap" }}>
                  {fmt(item.lineTotal, cur)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <hr className="receipt-divider" style={{ border: "none", borderTop: "1px dashed black", margin: "4px 0" }} />

      {/* ── Totals ── */}
      <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
        <span>المجموع الفرعي:</span>
        <span>{fmt(subtotal, cur)}</span>
      </div>
      {discount > 0 && (
        <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
          <span>الخصم:</span>
          <span>- {fmt(discount, cur)}</span>
        </div>
      )}
      {data.taxEnabled && tax > 0 && (
        <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
          <span>الضريبة ({data.taxRate}%):</span>
          <span>{fmt(tax, cur)}</span>
        </div>
      )}

      <hr className="receipt-divider-solid" style={{ border: "none", borderTop: "1px solid black", margin: "4px 0" }} />

      <div
        className="receipt-row receipt-total-row"
        style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: forPrint ? undefined : "13px" }}
      >
        <span>الإجمالي:</span>
        <span>{fmt(total, cur)}</span>
      </div>

      <hr className="receipt-divider" style={{ border: "none", borderTop: "1px dashed black", margin: "4px 0" }} />

      {/* ── Payments ── */}
      {data.payments.map((p, i) => (
        <div key={i} className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
          <span>طريقة الدفع: {METHOD_LABELS[p.method] ?? p.method}</span>
          <span>{fmt(p.amount, cur)}</span>
        </div>
      ))}

      {paid > 0 && (
        <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontSize: forPrint ? undefined : "10px" }}>
          <span>المدفوع:</span>
          <span>{fmt(paid, cur)}</span>
        </div>
      )}
      {change > 0 && (
        <div className="receipt-row" style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: forPrint ? undefined : "10px" }}>
          <span>الباقي للعميل:</span>
          <span>{fmt(change, cur)}</span>
        </div>
      )}

      <hr className="receipt-divider" style={{ border: "none", borderTop: "1px dashed black", margin: "4px 0" }} />

      {/* ── Invoice Barcode (CODE128 — scannable by standard barcode scanners) ── */}
      <InvoiceBarcodeDisplay value={data.invoiceNumber} />

      {/* ── Footer ── */}
      <div className="receipt-center" style={{ textAlign: "center", fontSize: forPrint ? undefined : "10px", marginTop: "4px" }}>
        {data.receiptFooter ?? "شكرا لتعاملكم معنا ❤"}
      </div>
    </div>
    </>
  );
}
