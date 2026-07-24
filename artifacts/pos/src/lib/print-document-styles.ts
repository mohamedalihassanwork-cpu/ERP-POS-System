/**
 * Styles embedded in Electron standalone print HTML documents.
 *
 * The SPA keeps receipt/label rules in index.css under @media print, but
 * collectPrintDocument() builds a separate HTML file that does not load the
 * app bundle. These rules mirror index.css print styles as normal CSS so
 * layout is correct before webContents.print() runs.
 */
export const PRINT_DOCUMENT_STYLES = `
#print-portal {
  display: block;
  position: static;
  background: white;
}

.receipt-print-root {
  display: block;
  width: 80mm;
  max-width: 80mm;
  margin: 0;
  padding: 3mm 5mm;
  background: white;
  color: black;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9pt;
  line-height: 1.4;
  box-sizing: border-box;
}

.receipt-print-root.size-58mm {
  width: 58mm;
  max-width: 58mm;
  font-size: 8pt;
}

.receipt-print-root .receipt-logo {
  display: block;
  max-width: 30mm;
  max-height: 20mm;
  margin: 0 auto 2mm;
  object-fit: contain;
}

.receipt-print-root .receipt-store-name {
  font-size: 15pt;
  font-weight: bold;
  text-align: center;
  margin-bottom: 2mm;
  letter-spacing: 0.3pt;
}

.receipt-print-root.size-58mm .receipt-store-name {
  font-size: 11pt;
}

.receipt-print-root .receipt-divider {
  border: none;
  border-top: 1px dashed black;
  margin: 2mm 0;
}

.receipt-print-root .receipt-divider-solid {
  border: none;
  border-top: 1px solid black;
  margin: 2mm 0;
}

.receipt-print-root .receipt-row {
  display: flex;
  justify-content: space-between;
  gap: 2mm;
}

.receipt-print-root .receipt-items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
}

.receipt-print-root .receipt-items-table th {
  text-align: right;
  border-bottom: 1px solid black;
  padding: 0.5mm 0;
  font-weight: bold;
}

.receipt-print-root .receipt-items-table td {
  padding: 0.5mm 0;
  vertical-align: top;
}

.receipt-print-root .receipt-total-row {
  font-size: 11pt;
  font-weight: bold;
}

.receipt-print-root .receipt-center {
  text-align: center;
}

.receipt-print-root .receipt-barcode {
  display: block;
  width: 100%;
  height: 15mm;
  margin: 2mm auto;
}

.barcode-label-print-root {
  display: block;
  padding: 0;
  margin: 0;
}

.barcode-label-page {
  display: block;
  padding: 0;
  margin: 0;
}

.barcode-label {
  box-sizing: border-box;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
  background: white;
  page-break-after: always;
  break-after: page;
}

.barcode-label:last-child {
  page-break-after: auto;
  break-after: auto;
}

.barcode-label .label-product-name {
  font-weight: bold;
  text-align: center;
  line-height: 1.2;
  max-height: 2.4em;
  overflow: hidden;
  width: 100%;
}

.barcode-label .label-store-name {
  text-align: center;
  line-height: 1.1;
  opacity: 0.7;
  width: 100%;
  overflow: hidden;
  max-height: 1.3em;
}

.barcode-label .label-barcode-svg {
  display: block;
  /*
   * width:auto + max-width:100% — render at natural intrinsic width.
   * On tiny labels the SVG scales DOWN to fit; on wide labels it stays
   * at the natural JsBarcode size (never stretched, so bars stay narrow).
   * shape-rendering:crispEdges — disables anti-aliasing on bar edges,
   * which is the key fix for scanner read reliability.
   */
  width: auto;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  shape-rendering: crispEdges;
}

.barcode-label .label-sku {
  text-align: center;
  letter-spacing: 0.5pt;
  font-family: monospace;
}

.barcode-label .label-price {
  font-weight: bold;
  text-align: center;
}

.a4-invoice {
  box-sizing: border-box;
}
`;
