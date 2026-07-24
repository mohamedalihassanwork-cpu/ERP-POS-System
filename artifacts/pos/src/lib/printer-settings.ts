import { toast } from "@/hooks/use-toast";
import { PRINT_DOCUMENT_STYLES } from "@/lib/print-document-styles";

const PRINT_PORTAL_ID = "print-portal";
const PORTAL_POLL_MS = 16;
const PORTAL_MAX_ATTEMPTS = 40;

export type PrintPageSize =
  | string
  | { width: number; height: number };

export interface PrintJobOptions {
  copies?: number;
  pageSize?: PrintPageSize;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

async function waitForRenderedSvgs(root: ParentNode): Promise<void> {
  const svgs = Array.from(root.querySelectorAll("svg"));
  if (svgs.length === 0) return;

  for (let attempt = 0; attempt < PORTAL_MAX_ATTEMPTS; attempt++) {
    if (svgs.every((svg) => svg.childElementCount > 0)) return;
    await new Promise((resolve) => setTimeout(resolve, PORTAL_POLL_MS));
  }
}

/** Waits until PrintPortal content is mounted and painted. */
export async function waitForPrintPortalReady(): Promise<void> {
  for (let attempt = 0; attempt < PORTAL_MAX_ATTEMPTS; attempt++) {
    const portal = document.getElementById(PRINT_PORTAL_ID);
    if (portal && portal.childElementCount > 0) break;
    await new Promise((resolve) => setTimeout(resolve, PORTAL_POLL_MS));
  }

  const portal = document.getElementById(PRINT_PORTAL_ID);
  if (!portal || portal.childElementCount === 0) {
    throw new Error("Print portal content is not ready");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await waitForImages(portal);
  await waitForRenderedSvgs(portal);

  await nextAnimationFrame();
  await nextAnimationFrame();
}

/** Build a standalone HTML document from the hidden print portal. */
function collectPrintDocument(): string {
  const portal = document.getElementById(PRINT_PORTAL_ID);
  if (!portal || portal.childElementCount === 0) {
    throw new Error("Print portal content is not ready");
  }

  const componentStyles = Array.from(portal.querySelectorAll("style"))
    .map((node) => node.textContent || "")
    .join("\n");

  /*
   * Wrap content in #print-portal so SPA-only rules like
   * "body > *:not(#print-portal) { display: none }" keep the receipt visible.
   * Without this wrapper, Electron silent print renders a blank page.
   */
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${PRINT_DOCUMENT_STYLES}
    ${componentStyles}
  </style>
</head>
<body><div id="print-portal">${portal.innerHTML}</div></body>
</html>`;
}

export async function getPrinterSettings(): Promise<PrinterSettings> {
  if (window.electronAPI) {
    return await window.electronAPI.getPrinterSettings();
  }

  const stored = localStorage.getItem("printer-settings");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // ignore
    }
  }
  return {};
}

export async function savePrinterSettings(
  settings: PrinterSettings,
): Promise<{ success: boolean; error?: string }> {
  if (window.electronAPI) {
    return await window.electronAPI.savePrinterSettings(settings);
  }

  localStorage.setItem("printer-settings", JSON.stringify(settings));
  return { success: true };
}

async function printWithPrinter(
  printerName: string | undefined,
  options?: PrintJobOptions,
): Promise<void> {
  try {
    await waitForPrintPortalReady();
  } catch {
    toast({
      title: "خطأ في الطباعة",
      description: "تعذر تجهيز محتوى الطباعة",
      variant: "destructive",
    });
    return;
  }

  if (window.electronAPI) {
    let html: string;
    try {
      html = collectPrintDocument();
    } catch {
      toast({
        title: "خطأ في الطباعة",
        description: "تعذر تجهيز محتوى الطباعة",
        variant: "destructive",
      });
      return;
    }

    const printOpts: Parameters<typeof window.electronAPI.print>[0] = {
      silent: true,
      html,
      copies: options?.copies || 1,
    };

    if (printerName?.trim()) {
      printOpts.deviceName = printerName.trim();
    }

    if (options?.pageSize) {
      printOpts.pageSize = options.pageSize;
    }

    const result = await window.electronAPI.print(printOpts);

    if (!result.success) {
      toast({
        title: "خطأ في الطباعة",
        description: result.error || "فشل الاتصال بالطابعة",
        variant: "destructive",
      });
    }
  } else {
    window.print();
  }
}

/** Label dimensions in microns (both width and height required by Electron). */
export function labelPageSize(widthMm: number, heightMm: number): { width: number; height: number } {
  return { width: Math.round(widthMm * 1000), height: Math.round(heightMm * 1000) };
}

export async function printReceipt(options?: PrintJobOptions): Promise<void> {
  const settings = await getPrinterSettings();
  await printWithPrinter(settings.receiptPrinter, options);
}

export async function printBarcode(options?: PrintJobOptions): Promise<void> {
  const settings = await getPrinterSettings();
  await printWithPrinter(settings.barcodePrinter, options);
}

export async function printInvoice(options?: PrintJobOptions): Promise<void> {
  const settings = await getPrinterSettings();
  await printWithPrinter(settings.invoicePrinter, {
    ...options,
    pageSize: options?.pageSize ?? "A4",
  });
}

/** 
 * Hack to open the cash drawer: Send a tiny, silent print job to the receipt printer.
 * If the printer driver is configured to "Open Drawer Before Printing", this will trigger it
 * even without printing a real receipt.
 */
export async function openCashDrawer(): Promise<void> {
  const settings = await getPrinterSettings();
  if (window.electronAPI && settings.receiptPrinter) {
    const html = `<!DOCTYPE html><html lang="ar"><head><meta charset="utf-8"></head><body><div style="font-size:1px;">.</div></body></html>`;
    const printOpts: Parameters<typeof window.electronAPI.print>[0] = {
      silent: true,
      html,
      copies: 1,
      deviceName: settings.receiptPrinter,
    };
    await window.electronAPI.print(printOpts);
  }
}
