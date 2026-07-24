import * as XLSX from "xlsx";

export interface ExcelColumnOption {
  header: string;
  key: string;
  width?: number;
  formatter?: (val: any, row: any) => string | number;
}

export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  fileName: string,
  sheetName: string = "التقرير",
  columns?: ExcelColumnOption[]
) {
  if (!data || data.length === 0) {
    alert("لا توجد بيانات للتصدير في هذا التقرير.");
    return;
  }

  let rows: Record<string, any>[] = [];

  if (columns && columns.length > 0) {
    rows = data.map((item) => {
      const rowObj: Record<string, any> = {};
      for (const col of columns) {
        const val = item[col.key];
        rowObj[col.header] = col.formatter ? col.formatter(val, item) : (val ?? "");
      }
      return rowObj;
    });
  } else {
    rows = data;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set Right-to-Left view on worksheet
  (worksheet as any)["!dir"] = "rtl";

  // Calculate auto column widths
  if (rows.length > 0) {
    const colWidths = Object.keys(rows[0]).map((key) => {
      let maxLen = key.length;
      for (const r of rows) {
        const cellVal = String(r[key] ?? "");
        if (cellVal.length > maxLen) {
          maxLen = cellVal.length;
        }
      }
      return { wch: Math.max(maxLen + 4, 12) };
    });
    worksheet["!cols"] = colWidths;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const cleanFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, cleanFileName);
}
