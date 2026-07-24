import { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, numberSequencesTable, storeSettingsTable, storesTable } from "@workspace/db";
import { UpdateNumberSequenceBody, UpdateStoreSettingsBody } from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// Returns the store settings row, creating it with defaults the first time it is
// requested so the UI always has something to render.
async function ensureSettings(storeId: string) {
  await db.insert(storeSettingsTable).values({ storeId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.storeId, storeId))
    .limit(1);
  return row;
}

async function serializeSettings(
  storeId: string,
  row: typeof storeSettingsTable.$inferSelect,
) {
  const [store] = await db
    .select({ name: storesTable.name, phone: storesTable.phone, address: storesTable.address, logoUrl: storesTable.logoUrl })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);
  return {
    id: row.id,
    storeName: store?.name ?? null,
    storePhone: store?.phone ?? null,
    storeAddress: store?.address ?? null,
    logoUrl: store?.logoUrl ?? null,
    currency: row.currency,
    taxEnabled: row.taxEnabled,
    taxRate: row.taxRate,
    taxInclusive: row.taxInclusive,
    receiptSize: row.receiptSize,
    receiptFooter: row.receiptFooter,
    numeralFormat: row.numeralFormat,
    allowNegativeStock: row.allowNegativeStock,
    allowBelowCostDiscount: row.allowBelowCostDiscount,
    allowNegativeTreasury: row.allowNegativeTreasury,
    requireSessionForCash: row.requireSessionForCash,
  };
}

// GET /settings
router.get("/settings", requireAuth, async (req, res) => {
  const storeId = req.auth!.storeId;
  const row = await ensureSettings(storeId);
  res.json(await serializeSettings(storeId, row));
});

// PATCH /settings
router.patch("/settings", requireAuth, requirePermission("settings.manage"), async (req, res) => {
  const parsed = UpdateStoreSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const storeId = req.auth!.storeId;
  await ensureSettings(storeId);

  const body = parsed.data;
  const update: Partial<typeof storeSettingsTable.$inferInsert> = {};
  if (body.currency !== undefined) update.currency = body.currency;
  if (body.taxEnabled !== undefined) update.taxEnabled = body.taxEnabled;
  if (body.taxRate !== undefined) update.taxRate = String(body.taxRate);
  if (body.taxInclusive !== undefined) update.taxInclusive = body.taxInclusive;
  if (body.receiptSize !== undefined) update.receiptSize = body.receiptSize;
  if (body.receiptFooter !== undefined) update.receiptFooter = body.receiptFooter;
  if (body.numeralFormat !== undefined) update.numeralFormat = body.numeralFormat;
  if (body.allowNegativeStock !== undefined) update.allowNegativeStock = body.allowNegativeStock;
  if (body.allowBelowCostDiscount !== undefined)
    update.allowBelowCostDiscount = body.allowBelowCostDiscount;
  if (body.allowNegativeTreasury !== undefined)
    update.allowNegativeTreasury = body.allowNegativeTreasury;
  if (body.requireSessionForCash !== undefined)
    update.requireSessionForCash = body.requireSessionForCash;

  // logoUrl is stored on the stores table (tenant root), not store_settings.
  if ((body as any).logoUrl !== undefined) {
    await db
      .update(storesTable)
      .set({ logoUrl: (body as any).logoUrl })
      .where(eq(storesTable.id, storeId));
  }

  let row;
  if (Object.keys(update).length === 0) {
    row = await ensureSettings(storeId);
  } else {
    const [updated] = await db
      .update(storeSettingsTable)
      .set(update)
      .where(eq(storeSettingsTable.storeId, storeId))
      .returning();
    row = updated;
  }

  await writeAuditLog({
    storeId,
    userId: req.auth!.userId,
    action: "settings.updated",
    entityType: "store_settings",
    entityId: row.id,
    newValue: { ...update, logoUrl: (body as any).logoUrl },
    ipAddress: clientIp(req),
  });

  res.json(await serializeSettings(storeId, row));
});

// Document-number sequences the store may customise. Kept in sync with the
// DEFAULTS in lib/sequences.ts so the UI lists every kind even before its first
// document is created.
const SEQUENCE_KINDS: Record<string, { prefix: string; padding: number }> = {
  SALE: { prefix: "INV-", padding: 5 },
  SALES_RETURN: { prefix: "SRET-", padding: 5 },
  PURCHASE: { prefix: "PUR-", padding: 5 },
  PURCHASE_RETURN: { prefix: "PRET-", padding: 5 },
  TRANSFER: { prefix: "TRF-", padding: 5 },
  STOCK_COUNT: { prefix: "SC-", padding: 5 },
};

// GET /settings/sequences
router.get(
  "/settings/sequences",
  requireAuth,
  requirePermission("settings.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    for (const [kind, def] of Object.entries(SEQUENCE_KINDS)) {
      await db
        .insert(numberSequencesTable)
        .values({ storeId, kind, prefix: def.prefix, padding: def.padding, nextValue: 1 })
        .onConflictDoNothing();
    }
    const rows = await db
      .select({
        id: numberSequencesTable.id,
        kind: numberSequencesTable.kind,
        prefix: numberSequencesTable.prefix,
        padding: numberSequencesTable.padding,
        nextValue: numberSequencesTable.nextValue,
      })
      .from(numberSequencesTable)
      .where(eq(numberSequencesTable.storeId, storeId))
      .orderBy(asc(numberSequencesTable.kind));
    res.json(rows);
  },
);

// PATCH /settings/sequences/{kind}
router.patch(
  "/settings/sequences/:kind",
  requireAuth,
  requirePermission("settings.manage"),
  async (req, res) => {
    const parsed = UpdateNumberSequenceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const kind = String(req.params["kind"]);

    const update: Partial<typeof numberSequencesTable.$inferInsert> = {};
    if (parsed.data.prefix !== undefined) update.prefix = parsed.data.prefix;
    if (parsed.data.padding !== undefined) update.padding = parsed.data.padding;

    if (Object.keys(update).length === 0) {
      const [existing] = await db
        .select({
          id: numberSequencesTable.id,
          kind: numberSequencesTable.kind,
          prefix: numberSequencesTable.prefix,
          padding: numberSequencesTable.padding,
          nextValue: numberSequencesTable.nextValue,
        })
        .from(numberSequencesTable)
        .where(
          and(eq(numberSequencesTable.storeId, storeId), eq(numberSequencesTable.kind, kind)),
        )
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "التسلسل غير موجود" });
        return;
      }
      res.json(existing);
      return;
    }

    const [row] = await db
      .update(numberSequencesTable)
      .set(update)
      .where(and(eq(numberSequencesTable.storeId, storeId), eq(numberSequencesTable.kind, kind)))
      .returning({
        id: numberSequencesTable.id,
        kind: numberSequencesTable.kind,
        prefix: numberSequencesTable.prefix,
        padding: numberSequencesTable.padding,
        nextValue: numberSequencesTable.nextValue,
      });
    if (!row) {
      res.status(404).json({ error: "التسلسل غير موجود" });
      return;
    }

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "settings.sequence_updated",
      entityType: "number_sequence",
      entityId: row.id,
      newValue: update,
      ipAddress: clientIp(req),
    });

    res.json(row);
  },
);

export default router;
