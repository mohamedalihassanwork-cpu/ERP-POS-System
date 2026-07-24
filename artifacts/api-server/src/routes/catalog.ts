import { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  brandsTable,
  categoriesTable,
  colorsTable,
  sizesTable,
} from "@workspace/db";
import {
  CreateBrandBody,
  CreateCategoryBody,
  CreateColorBody,
  CreateSizeBody,
  ListBrandsQueryParams,
  ListCategoriesQueryParams,
  ListColorsQueryParams,
  ListSizesQueryParams,
  UpdateBrandBody,
  UpdateCategoryBody,
  UpdateColorBody,
  UpdateSizeBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// ---- Categories ----

router.get(
  "/categories",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const parsed = ListCategoriesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const conditions = [eq(categoriesTable.storeId, storeId)];
    if (parsed.data.includeInactive === false) {
      conditions.push(eq(categoriesTable.isActive, true));
    }
    const rows = await db
      .select()
      .from(categoriesTable)
      .where(and(...conditions))
      .orderBy(asc(categoriesTable.name));
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/categories",
  requireAuth,
  requirePermission("products.create"),
  async (req, res) => {
    const parsed = CreateCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [existing] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.storeId, storeId), eq(categoriesTable.name, parsed.data.name)))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "اسم التصنيف مستخدم بالفعل" });
      return;
    }
    const [created] = await db
      .insert(categoriesTable)
      .values({
        storeId,
        name: parsed.data.name,
        nameEn: parsed.data.nameEn ?? null,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "category.created",
      entityType: "category",
      entityId: created.id,
      newValue: { name: created.name },
      ipAddress: clientIp(req),
    });
    res.status(201).json({
      id: created.id,
      name: created.name,
      nameEn: created.nameEn,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/categories/:id",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "التصنيف غير موجود" });
      return;
    }
    const parsed = UpdateCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, id), eq(categoriesTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "التصنيف غير موجود" });
      return;
    }
    if (parsed.data.name && parsed.data.name !== current.name) {
      const [dupe] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(and(eq(categoriesTable.storeId, storeId), eq(categoriesTable.name, parsed.data.name)))
        .limit(1);
      if (dupe) {
        res.status(409).json({ error: "اسم التصنيف مستخدم بالفعل" });
        return;
      }
    }
    const [updated] = await db
      .update(categoriesTable)
      .set({
        name: parsed.data.name ?? current.name,
        nameEn: parsed.data.nameEn === undefined ? current.nameEn : parsed.data.nameEn,
        isActive: parsed.data.isActive === undefined ? current.isActive : parsed.data.isActive,
      })
      .where(eq(categoriesTable.id, id))
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "category.updated",
      entityType: "category",
      entityId: id,
      oldValue: { name: current.name, isActive: current.isActive },
      newValue: parsed.data,
      ipAddress: clientIp(req),
    });
    res.json({
      id: updated.id,
      name: updated.name,
      nameEn: updated.nameEn,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/categories/:id",
  requireAuth,
  requirePermission("products.delete"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "التصنيف غير موجود" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, id), eq(categoriesTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "التصنيف غير موجود" });
      return;
    }
    await db
      .update(categoriesTable)
      .set({ isActive: false })
      .where(eq(categoriesTable.id, id));
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "category.deactivated",
      entityType: "category",
      entityId: id,
      oldValue: { name: current.name },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

// ---- Brands ----

router.get(
  "/brands",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const parsed = ListBrandsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const conditions = [eq(brandsTable.storeId, storeId)];
    if (parsed.data.includeInactive === false) {
      conditions.push(eq(brandsTable.isActive, true));
    }
    const rows = await db
      .select()
      .from(brandsTable)
      .where(and(...conditions))
      .orderBy(asc(brandsTable.name));
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/brands",
  requireAuth,
  requirePermission("products.create"),
  async (req, res) => {
    const parsed = CreateBrandBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [existing] = await db
      .select({ id: brandsTable.id })
      .from(brandsTable)
      .where(and(eq(brandsTable.storeId, storeId), eq(brandsTable.name, parsed.data.name)))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "اسم العلامة التجارية مستخدم بالفعل" });
      return;
    }
    const [created] = await db
      .insert(brandsTable)
      .values({
        storeId,
        name: parsed.data.name,
        nameEn: parsed.data.nameEn ?? null,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "brand.created",
      entityType: "brand",
      entityId: created.id,
      newValue: { name: created.name },
      ipAddress: clientIp(req),
    });
    res.status(201).json({
      id: created.id,
      name: created.name,
      nameEn: created.nameEn,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/brands/:id",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "العلامة التجارية غير موجودة" });
      return;
    }
    const parsed = UpdateBrandBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(brandsTable)
      .where(and(eq(brandsTable.id, id), eq(brandsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "العلامة التجارية غير موجودة" });
      return;
    }
    if (parsed.data.name && parsed.data.name !== current.name) {
      const [dupe] = await db
        .select({ id: brandsTable.id })
        .from(brandsTable)
        .where(and(eq(brandsTable.storeId, storeId), eq(brandsTable.name, parsed.data.name)))
        .limit(1);
      if (dupe) {
        res.status(409).json({ error: "اسم العلامة التجارية مستخدم بالفعل" });
        return;
      }
    }
    const [updated] = await db
      .update(brandsTable)
      .set({
        name: parsed.data.name ?? current.name,
        nameEn: parsed.data.nameEn === undefined ? current.nameEn : parsed.data.nameEn,
        isActive: parsed.data.isActive === undefined ? current.isActive : parsed.data.isActive,
      })
      .where(eq(brandsTable.id, id))
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "brand.updated",
      entityType: "brand",
      entityId: id,
      oldValue: { name: current.name, isActive: current.isActive },
      newValue: parsed.data,
      ipAddress: clientIp(req),
    });
    res.json({
      id: updated.id,
      name: updated.name,
      nameEn: updated.nameEn,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/brands/:id",
  requireAuth,
  requirePermission("products.delete"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "العلامة التجارية غير موجودة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(brandsTable)
      .where(and(eq(brandsTable.id, id), eq(brandsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "العلامة التجارية غير موجودة" });
      return;
    }
    await db.update(brandsTable).set({ isActive: false }).where(eq(brandsTable.id, id));
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "brand.deactivated",
      entityType: "brand",
      entityId: id,
      oldValue: { name: current.name },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

// ---- Colors ----

router.get(
  "/colors",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const parsed = ListColorsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const conditions = [eq(colorsTable.storeId, storeId)];
    if (parsed.data.includeInactive === false) {
      conditions.push(eq(colorsTable.isActive, true));
    }
    const rows = await db
      .select()
      .from(colorsTable)
      .where(and(...conditions))
      .orderBy(asc(colorsTable.name));
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        nameEn: r.nameEn,
        hex: r.hex,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/colors",
  requireAuth,
  requirePermission("products.create"),
  async (req, res) => {
    const parsed = CreateColorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [existing] = await db
      .select({ id: colorsTable.id })
      .from(colorsTable)
      .where(and(eq(colorsTable.storeId, storeId), eq(colorsTable.name, parsed.data.name)))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "اسم اللون مستخدم بالفعل" });
      return;
    }
    const [created] = await db
      .insert(colorsTable)
      .values({
        storeId,
        name: parsed.data.name,
        nameEn: parsed.data.nameEn ?? null,
        hex: parsed.data.hex ?? null,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "color.created",
      entityType: "color",
      entityId: created.id,
      newValue: { name: created.name },
      ipAddress: clientIp(req),
    });
    res.status(201).json({
      id: created.id,
      name: created.name,
      nameEn: created.nameEn,
      hex: created.hex,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/colors/:id",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "اللون غير موجود" });
      return;
    }
    const parsed = UpdateColorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(colorsTable)
      .where(and(eq(colorsTable.id, id), eq(colorsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "اللون غير موجود" });
      return;
    }
    if (parsed.data.name && parsed.data.name !== current.name) {
      const [dupe] = await db
        .select({ id: colorsTable.id })
        .from(colorsTable)
        .where(and(eq(colorsTable.storeId, storeId), eq(colorsTable.name, parsed.data.name)))
        .limit(1);
      if (dupe) {
        res.status(409).json({ error: "اسم اللون مستخدم بالفعل" });
        return;
      }
    }
    const [updated] = await db
      .update(colorsTable)
      .set({
        name: parsed.data.name ?? current.name,
        nameEn: parsed.data.nameEn === undefined ? current.nameEn : parsed.data.nameEn,
        hex: parsed.data.hex === undefined ? current.hex : parsed.data.hex,
        isActive: parsed.data.isActive === undefined ? current.isActive : parsed.data.isActive,
      })
      .where(eq(colorsTable.id, id))
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "color.updated",
      entityType: "color",
      entityId: id,
      oldValue: { name: current.name, isActive: current.isActive },
      newValue: parsed.data,
      ipAddress: clientIp(req),
    });
    res.json({
      id: updated.id,
      name: updated.name,
      nameEn: updated.nameEn,
      hex: updated.hex,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/colors/:id",
  requireAuth,
  requirePermission("products.delete"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "اللون غير موجود" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(colorsTable)
      .where(and(eq(colorsTable.id, id), eq(colorsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "اللون غير موجود" });
      return;
    }
    await db.update(colorsTable).set({ isActive: false }).where(eq(colorsTable.id, id));
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "color.deactivated",
      entityType: "color",
      entityId: id,
      oldValue: { name: current.name },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

// ---- Sizes ----

router.get(
  "/sizes",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const parsed = ListSizesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const conditions = [eq(sizesTable.storeId, storeId)];
    if (parsed.data.includeInactive === false) {
      conditions.push(eq(sizesTable.isActive, true));
    }
    const rows = await db
      .select()
      .from(sizesTable)
      .where(and(...conditions))
      .orderBy(asc(sizesTable.sortOrder), asc(sizesTable.name));
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        system: r.system,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/sizes",
  requireAuth,
  requirePermission("products.create"),
  async (req, res) => {
    const parsed = CreateSizeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const system = parsed.data.system ?? "EU";
    const [existing] = await db
      .select({ id: sizesTable.id })
      .from(sizesTable)
      .where(
        and(
          eq(sizesTable.storeId, storeId),
          eq(sizesTable.system, system),
          eq(sizesTable.name, parsed.data.name),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "المقاس مستخدم بالفعل" });
      return;
    }
    const [created] = await db
      .insert(sizesTable)
      .values({
        storeId,
        name: parsed.data.name,
        system,
        sortOrder: parsed.data.sortOrder ?? 0,
        isActive: parsed.data.isActive ?? true,
      })
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "size.created",
      entityType: "size",
      entityId: created.id,
      newValue: { name: created.name, system: created.system },
      ipAddress: clientIp(req),
    });
    res.status(201).json({
      id: created.id,
      name: created.name,
      system: created.system,
      sortOrder: created.sortOrder,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/sizes/:id",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المقاس غير موجود" });
      return;
    }
    const parsed = UpdateSizeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(sizesTable)
      .where(and(eq(sizesTable.id, id), eq(sizesTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المقاس غير موجود" });
      return;
    }
    const [updated] = await db
      .update(sizesTable)
      .set({
        name: parsed.data.name ?? current.name,
        system: parsed.data.system ?? current.system,
        sortOrder: parsed.data.sortOrder === undefined ? current.sortOrder : parsed.data.sortOrder,
        isActive: parsed.data.isActive === undefined ? current.isActive : parsed.data.isActive,
      })
      .where(eq(sizesTable.id, id))
      .returning();
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "size.updated",
      entityType: "size",
      entityId: id,
      oldValue: { name: current.name, isActive: current.isActive },
      newValue: parsed.data,
      ipAddress: clientIp(req),
    });
    res.json({
      id: updated.id,
      name: updated.name,
      system: updated.system,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/sizes/:id",
  requireAuth,
  requirePermission("products.delete"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المقاس غير موجود" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select()
      .from(sizesTable)
      .where(and(eq(sizesTable.id, id), eq(sizesTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المقاس غير موجود" });
      return;
    }
    await db.update(sizesTable).set({ isActive: false }).where(eq(sizesTable.id, id));
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "size.deactivated",
      entityType: "size",
      entityId: id,
      oldValue: { name: current.name },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

export default router;
