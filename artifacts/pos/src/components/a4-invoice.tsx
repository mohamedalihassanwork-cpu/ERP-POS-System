import React from "react";
import type { InvoiceDetail } from "@workspace/api-client-react";

const CUR = "ج.م";
function money(val: string | number | undefined | null) {
  if (val == null) return "0.00";
  return Number(val).toFixed(2);
}

export interface A4InvoiceProps {
  invoice: InvoiceDetail;
  storeName?: string | null;
}

export function A4Invoice({ invoice, storeName }: A4InvoiceProps) {
  return (
    <div
      className="a4-invoice"
      dir="rtl"
      style={{
        padding: "40px",
        fontFamily: "sans-serif",
        color: "#000",
        background: "#fff",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        {storeName && (
          <h1 style={{ margin: "0 0 10px 0", fontSize: "28px" }}>
            {storeName}
          </h1>
        )}
        <h2 style={{ margin: 0, fontSize: "20px", color: "#555" }}>
          فاتورة ضريبية / Invoice
        </h2>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "30px",
          borderBottom: "2px solid #eee",
          paddingBottom: "20px",
        }}
      >
        <div>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>رقم الفاتورة:</strong> {invoice.invoiceNumber}
          </p>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>التاريخ:</strong>{" "}
            {new Date(invoice.createdAt).toLocaleString("ar-EG")}
          </p>
        </div>
        <div style={{ textAlign: "left" }}>
          <p style={{ margin: "0 0 8px 0" }}>
            <strong>العميل:</strong> {invoice.customerName || "عميل نقدي"}
          </p>
          {invoice.warehouseName && (
            <p style={{ margin: 0 }}>
              <strong>المخزن:</strong> {invoice.warehouseName}
            </p>
          )}
        </div>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginBottom: "30px",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#f9fafb" }}>
            <th
              style={{
                border: "1px solid #ddd",
                padding: "12px",
                textAlign: "right",
              }}
            >
              المنتج
            </th>
            <th
              style={{
                border: "1px solid #ddd",
                padding: "12px",
                textAlign: "center",
              }}
            >
              الكمية
            </th>
            <th
              style={{
                border: "1px solid #ddd",
                padding: "12px",
                textAlign: "center",
              }}
            >
              السعر ({CUR})
            </th>
            <th
              style={{
                border: "1px solid #ddd",
                padding: "12px",
                textAlign: "left",
              }}
            >
              الإجمالي ({CUR})
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it) => (
            <tr key={it.id}>
              <td style={{ border: "1px solid #ddd", padding: "12px" }}>
                <div style={{ fontWeight: "bold" }}>{it.productName}</div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {[
                    it.sizeName && `مقاس ${it.sizeName}`,
                    it.colorName,
                  ]
                    .filter(Boolean)
                    .join(" • ")}
                  {(it.returnedQuantity ?? 0) > 0 && (
                    <span style={{ color: "#e11d48", marginRight: "8px" }}>
                      (مرتجع {it.returnedQuantity})
                    </span>
                  )}
                </div>
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "12px",
                  textAlign: "center",
                  fontWeight: "bold",
                }}
              >
                {it.quantity}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "12px",
                  textAlign: "center",
                }}
              >
                {money(it.unitPrice)}
              </td>
              <td
                style={{
                  border: "1px solid #ddd",
                  padding: "12px",
                  textAlign: "left",
                  fontWeight: "bold",
                }}
              >
                {money(it.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          width: "300px",
          marginLeft: "auto",
          border: "1px solid #ddd",
          padding: "20px",
          borderRadius: "8px",
          backgroundColor: "#f9fafb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <span>المجموع الفرعي:</span>
          <strong>{money(invoice.subtotal)}</strong>
        </div>
        {Number(invoice.discountAmount) > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "12px",
              color: "#e11d48",
            }}
          >
            <span>الخصم:</span>
            <strong>- {money(invoice.discountAmount)}</strong>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "12px",
            paddingTop: "12px",
            borderTop: "1px solid #ddd",
            fontSize: "18px",
            fontWeight: "bold",
          }}
        >
          <span>الإجمالي:</span>
          <span>
            {money(invoice.totalAmount)} {CUR}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <span>المدفوع:</span>
          <strong>{money(invoice.amountPaid)}</strong>
        </div>
      </div>

      <div style={{ marginTop: "50px", textAlign: "center", color: "#666" }}>
        <p>شكراً لتعاملكم معنا</p>
      </div>
    </div>
  );
}
