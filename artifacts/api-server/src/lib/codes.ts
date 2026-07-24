// SKU and barcode generation for product variants. Both must be unique per
// store; callers supply a uniqueness checker and these helpers retry until a
// free candidate is found.

function randomAlnum(n: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Short ASCII token derived from a (possibly Arabic) label. Falls back to a
// random token when the label has no usable ASCII alphanumerics.
function token(label: string | null | undefined, len: number): string {
  const ascii = (label ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ascii.length >= len) return ascii.slice(0, len);
  return (ascii + randomAlnum(len)).slice(0, len);
}

export function generateSkuCandidate(parts: {
  category?: string | null;
  size?: string | null;
  color?: string | null;
}): string {
  return [
    token(parts.category, 3),
    token(parts.size, 3),
    token(parts.color, 2),
    randomAlnum(4),
  ].join("-");
}

// 4-digit zero-padded sequential barcode (0001–9999).
// The generateUnique() + barcodeIsFree() wrapper guarantees no duplicates.
export function generateBarcodeCandidate(): string {
  const n = Math.floor(Math.random() * 9999) + 1; // 1..9999
  return String(n).padStart(4, "0");
}

// Retry a generator until `isFree` accepts the candidate (or attempts run out).
export async function generateUnique(
  generate: () => string,
  isFree: (candidate: string) => Promise<boolean>,
  attempts = 12,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const candidate = generate();
    if (await isFree(candidate)) return candidate;
  }
  throw new Error("تعذّر توليد رمز فريد");
}
