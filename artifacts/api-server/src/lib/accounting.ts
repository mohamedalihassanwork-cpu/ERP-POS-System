import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  accountingAccountsTable,
  accountingTransactionsTable,
  accountingTransactionLinesTable,
} from "@workspace/db";
import { cents, money } from "./money";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface JournalLine {
  code: string;
  debit?: number;
  credit?: number;
}

export interface JournalEntry {
  storeId: string;
  userId?: string | null;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  entryDate?: Date;
  lines: JournalLine[];
}

// Posts a balanced double-entry journal entry inside the caller's transaction.
// Enforces sum(debit) === sum(credit) and a non-zero total, then resolves chart
// codes to account ids and writes the header + lines. Throws on imbalance or an
// unknown account code so a bad entry rolls back the whole operation.
export async function postJournalEntry(tx: Tx, entry: JournalEntry): Promise<string> {
  const totalDebit = entry.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = entry.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (cents(totalDebit) !== cents(totalCredit)) {
    throw new Error("UNBALANCED_JOURNAL");
  }
  if (cents(totalDebit) === 0) {
    throw new Error("EMPTY_JOURNAL");
  }

  const codes = [...new Set(entry.lines.map((l) => l.code))];
  const accounts = await tx
    .select({ id: accountingAccountsTable.id, code: accountingAccountsTable.code })
    .from(accountingAccountsTable)
    .where(
      and(
        eq(accountingAccountsTable.storeId, entry.storeId),
        inArray(accountingAccountsTable.code, codes),
      ),
    );
  const idByCode = new Map(accounts.map((a) => [a.code, a.id]));
  for (const code of codes) {
    if (!idByCode.has(code)) throw new Error(`MISSING_ACCOUNT_${code}`);
  }

  const [header] = await tx
    .insert(accountingTransactionsTable)
    .values({
      storeId: entry.storeId,
      description: entry.description ?? null,
      referenceType: entry.referenceType ?? null,
      referenceId: entry.referenceId ?? null,
      createdBy: entry.userId ?? null,
      ...(entry.entryDate ? { entryDate: entry.entryDate } : {}),
    })
    .returning({ id: accountingTransactionsTable.id });

  await tx.insert(accountingTransactionLinesTable).values(
    entry.lines.map((l) => ({
      storeId: entry.storeId,
      transactionId: header.id,
      accountId: idByCode.get(l.code)!,
      debit: money(l.debit ?? 0),
      credit: money(l.credit ?? 0),
    })),
  );

  return header.id;
}
