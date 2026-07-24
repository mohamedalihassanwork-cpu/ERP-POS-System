import { and, eq } from "drizzle-orm";
import { db, numberSequencesTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Default prefix/padding per document kind. A store may later customise these in
// the number_sequences row; defaults only seed the first time.
const DEFAULTS: Record<string, { prefix: string; padding: number }> = {
  SALE: { prefix: "INV-", padding: 5 },
  SALES_RETURN: { prefix: "SRET-", padding: 5 },
  PURCHASE: { prefix: "PUR-", padding: 5 },
  PURCHASE_RETURN: { prefix: "PRET-", padding: 5 },
  TRANSFER: { prefix: "TRF-", padding: 5 },
  STOCK_COUNT: { prefix: "SC-", padding: 5 },
};

// Returns the next human-friendly document number for a (store, kind) and
// atomically advances the counter. Must run inside the document's transaction:
// the counter row is locked FOR UPDATE so concurrent documents never collide.
export async function nextDocumentNumber(tx: Tx, storeId: string, kind: string): Promise<string> {
  const def = DEFAULTS[kind] ?? { prefix: "", padding: 5 };

  await tx
    .insert(numberSequencesTable)
    .values({ storeId, kind, prefix: def.prefix, padding: def.padding, nextValue: 1 })
    .onConflictDoNothing();

  const [row] = await tx
    .select()
    .from(numberSequencesTable)
    .where(and(eq(numberSequencesTable.storeId, storeId), eq(numberSequencesTable.kind, kind)))
    
    .limit(1);

  const value = row.nextValue;
  await tx
    .update(numberSequencesTable)
    .set({ nextValue: value + 1 })
    .where(eq(numberSequencesTable.id, row.id));

  return `${row.prefix}${String(value).padStart(row.padding, "0")}`;
}
