// Money helpers. All monetary values are stored as Postgres numeric(14,2) and
// surface as strings via Drizzle. These helpers convert to/from JS numbers and
// normalise to a fixed 2-decimal string for storage. Rounding is half-up at the
// cent to avoid binary-float drift accumulating across postings.

export function money(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function toNum(s: string | number | null | undefined): number {
  if (s == null) return 0;
  return typeof s === "number" ? s : Number(s);
}

// Integer cents, useful for exact equality checks (e.g. debit === credit).
export function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100);
}
