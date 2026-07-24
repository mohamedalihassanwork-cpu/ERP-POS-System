import { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, warehousesTable } from "@workspace/db";
import {
  CreateWarehouseBody,
  ListWarehousesQueryParams,
  UpdateWarehouseBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

function toDto(r: typeof warehousesTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    address: r.address,
    isDefault: r.isDefault,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get(
  "/warehouses",
  requireAuth,
  requirePermission("inventory.view"),
  async (req, res) => {
    const parsed = ListWarehousesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const conditions = [eq(warehousesTable.storeId, storeId)];
    if (parsed.data.includeInactive === false) {
      conditions.push(eq(warehousesTable.isActive, true));
    }
    const rows = await db
      .select()
      .from(warehousesTable)
      .where(and(...conditions))
      .orderBy(asc(warehousesTable.name));
    res.json(rows.map(toDto));
  },
);

router.post(
  "/warehouses",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const parsed = CreateWarehouseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [existing] = await db
      .select({ id: warehousesTable.id })
      .from(warehousesTable)
      .where(and(eq(warehousesTable.storeId, storeId), eq(warehousesTable.name, parsed.data.name)))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "اسم المخزن مستخدم بالفعل" });
      return;
    }

    const makeDefault = parsed.data.isDefault ?? false;
    const created = await db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(warehousesTable)
          .set({ isDefault: false })
          .where(eq(warehousesTable.storeId, storeId));
      }
      const [row] = await tx
        .insert(warehousesTable)
        .values({
          storeId,
          name: parsed.data.name,
          code: parsed.data.code ?? null,
          address: parsed.data.address ?? null,
          isDefault: makeDefault,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      return row;
    });

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "warehouse.created",
      entityType: "warehouse",
      entityId: created.id,
      newValue: { name: created.name },
      ipAddress: clientIp(req),
    });
    res.status(201).json(toDto(created));
  },
);

router.patch(
  "/warehouses/:id",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المخزن غير موجود" });
      return;
    }
    const parsed = UpdateWarehouseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(warehousesTable)
      .where(and(eq(warehousesTable.id, id), eq(warehousesTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المخزن غير موجود" });
      return;
    }
    if (parsed.data.name && parsed.data.name !== current.name) {
      const [dupe] = await db
        .select({ id: warehousesTable.id })
        .from(warehousesTable)
        .where(and(eq(warehousesTable.storeId, storeId), eq(warehousesTable.name, parsed.data.name)))
        .limit(1);
      if (dupe) {
        res.status(409).json({ error: "اسم المخزن مستخدم بالفعل" });
        return;
      }
    }

    const makeDefault = parsed.data.isDefault === true && !current.isDefault;
    const updated = await db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(warehousesTable)
          .set({ isDefault: false })
          .where(eq(warehousesTable.storeId, storeId));
      }
      const [row] = await tx
        .update(warehousesTable)
        .set({
          name: parsed.data.name ?? current.name,
          code: parsed.data.code === undefined ? current.code : parsed.data.code,
          address: parsed.data.address === undefined ? current.address : parsed.data.address,
          isDefault: parsed.data.isDefault === undefined ? current.isDefault : parsed.data.isDefault,
          isActive: parsed.data.isActive === undefined ? current.isActive : parsed.data.isActive,
        })
        .where(eq(warehousesTable.id, id))
        .returning();
      return row;
    });

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "warehouse.updated",
      entityType: "warehouse",
      entityId: id,
      oldValue: { name: current.name, isActive: current.isActive },
      newValue: parsed.data,
      ipAddress: clientIp(req),
    });
    res.json(toDto(updated));
  },
);

router.delete(
  "/warehouses/:id",
  requireAuth,
  requirePermission("inventory.manage"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المخزن غير موجود" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(warehousesTable)
      .where(and(eq(warehousesTable.id, id), eq(warehousesTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المخزن غير موجود" });
      return;
    }
    await db.update(warehousesTable).set({ isActive: false }).where(eq(warehousesTable.id, id));
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "warehouse.deactivated",
      entityType: "warehouse",
      entityId: id,
      oldValue: { name: current.name },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

export default router;
