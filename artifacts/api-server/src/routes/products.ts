import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, like, inArray, or, sql } from "drizzle-orm";
import {
  db,
  brandsTable,
  categoriesTable,
  colorsTable,
  inventoryItemsTable,
  inventoryMovementsTable,
  productsTable,
  productVariantsTable,
  sizesTable,
  warehousesTable,
} from "@workspace/db";
import {
  CreateProductBody,
  CreateVariantBody,
  ListProductsQueryParams,
  SearchProductsQueryParams,
  UpdateProductBody,
  UpdateVariantBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";
import {
  generateBarcodeCandidate,
  generateSkuCandidate,
  generateUnique,
} from "../lib/codes";

const router: IRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

function money(n: number | null | undefined): string | undefined {
  return n === null || n === undefined ? undefined : n.toFixed(2);
}

// Per-product aggregates (variant count + total stock across all warehouses).
const variantCountSql = sql<number>`(
  select count(*) from ${productVariantsTable} v
  where v.product_id = ${productsTable.id} and v.is_active = true
)`;
const totalStockSql = sql<number>`(
  select coalesce(sum(ii.quantity), 0) from ${inventoryItemsTable} ii
  join ${productVariantsTable} v on v.id = ii.variant_id
  where v.product_id = ${productsTable.id}
)`;

const productColumns = {
  id: productsTable.id,
  name: productsTable.name,
  nameEn: productsTable.nameEn,
  categoryId: productsTable.categoryId,
  brandId: productsTable.brandId,
  description: productsTable.description,
  basePrice: productsTable.basePrice,
  baseCostPrice: productsTable.baseCostPrice,
  reorderPoint: productsTable.reorderPoint,
  barcode: productsTable.barcode,
  isActive: productsTable.isActive,
  createdAt: productsTable.createdAt,
  categoryName: categoriesTable.name,
  brandName: brandsTable.name,
  variantCount: variantCountSql,
  totalStock: totalStockSql,
};

type ProductRow = {
  id: string;
  name: string;
  nameEn: string | null;
  categoryId: string;
  brandId: string | null;
  description: string | null;
  basePrice: string;
  baseCostPrice: string;
  reorderPoint: number;
  barcode: string | null;
  isActive: boolean;
  createdAt: Date;
  categoryName: string | null;
  brandName: string | null;
  variantCount: number;
  totalStock: number;
};

function toProductDto(r: ProductRow) {
  return {
    id: r.id,
    name: r.name,
    nameEn: r.nameEn,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    brandId: r.brandId,
    brandName: r.brandName,
    description: r.description,
    basePrice: r.basePrice,
    baseCostPrice: r.baseCostPrice,
    reorderPoint: r.reorderPoint,
    barcode: r.barcode,
    variantCount: r.variantCount,
    totalStock: r.totalStock,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

const variantStockSql = sql<number>`(
  select coalesce(sum(ii.quantity), 0) from ${inventoryItemsTable} ii
  where ii.variant_id = ${productVariantsTable.id}
)`;

async function loadVariants(productId: string) {
  const rows = await db
    .select({
      id: productVariantsTable.id,
      productId: productVariantsTable.productId,
      colorId: productVariantsTable.colorId,
      sizeId: productVariantsTable.sizeId,
      sku: productVariantsTable.sku,
      barcode: productVariantsTable.barcode,
      sellingPrice: productVariantsTable.sellingPrice,
      costPrice: productVariantsTable.costPrice,
      isActive: productVariantsTable.isActive,
      createdAt: productVariantsTable.createdAt,
      colorName: colorsTable.name,
      sizeName: sizesTable.name,
      totalStock: variantStockSql,
    })
    .from(productVariantsTable)
    .innerJoin(colorsTable, eq(productVariantsTable.colorId, colorsTable.id))
    .innerJoin(sizesTable, eq(productVariantsTable.sizeId, sizesTable.id))
    .where(eq(productVariantsTable.productId, productId))
    .orderBy(asc(productVariantsTable.createdAt));
  return rows.map((v) => ({
    id: v.id,
    productId: v.productId,
    colorId: v.colorId,
    sizeId: v.sizeId,
    colorName: v.colorName,
    sizeName: v.sizeName,
    sku: v.sku,
    barcode: v.barcode,
    sellingPrice: v.sellingPrice,
    costPrice: v.costPrice,
    totalStock: v.totalStock,
    isActive: v.isActive,
    createdAt: v.createdAt.toISOString(),
  }));
}

async function loadProductRow(id: string, storeId: string): Promise<ProductRow | undefined> {
  const [row] = await db
    .select(productColumns)
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .where(and(eq(productsTable.id, id), eq(productsTable.storeId, storeId)))
    .limit(1);
  return row as ProductRow | undefined;
}

// GET /products
router.get(
  "/products",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const parsed = ListProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, search, categoryId, brandId, includeInactive } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(productsTable.storeId, storeId)];
    if (includeInactive === false) conditions.push(eq(productsTable.isActive, true));
    if (categoryId) conditions.push(eq(productsTable.categoryId, categoryId));
    if (brandId) conditions.push(eq(productsTable.brandId, brandId));
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const cond = or(like(productsTable.name, term), like(productsTable.nameEn, term));
      if (cond) conditions.push(cond);
    }
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(productsTable)
      .where(where);

    const rows = await db
      .select(productColumns)
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
      .where(where)
      .orderBy(desc(productsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: (rows as ProductRow[]).map(toProductDto),
      total: count,
      page,
      pageSize,
    });
  },
);

// GET /products/search — quick lookup by name, SKU, or barcode (Arabic substring)
router.get(
  "/products/search",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const parsed = SearchProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { q, limit } = parsed.data;
    const storeId = req.auth!.storeId;
    const term = `%${q.trim()}%`;

    const matchingByVariant = db
      .select({ productId: productVariantsTable.productId })
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.storeId, storeId),
          or(like(productVariantsTable.sku, term), like(productVariantsTable.barcode, term)),
        ),
      );

    const cond = or(
      like(productsTable.name, term),
      like(productsTable.nameEn, term),
      inArray(productsTable.id, matchingByVariant),
    );

    const rows = await db
      .select(productColumns)
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
      .where(and(eq(productsTable.storeId, storeId), eq(productsTable.isActive, true), cond))
      .orderBy(asc(productsTable.name))
      .limit(limit);

    res.json((rows as ProductRow[]).map(toProductDto));
  },
);

// Verifies a set of master-data IDs belong to the store and are usable.
async function validateRefs(
  storeId: string,
  refs: { categoryId?: string; brandId?: string | null; colorId?: string; sizeId?: string },
): Promise<string | null> {
  if (refs.categoryId) {
    const [c] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, refs.categoryId), eq(categoriesTable.storeId, storeId)))
      .limit(1);
    if (!c) return "التصنيف المحدد غير موجود";
  }
  if (refs.brandId) {
    const [b] = await db
      .select({ id: brandsTable.id })
      .from(brandsTable)
      .where(and(eq(brandsTable.id, refs.brandId), eq(brandsTable.storeId, storeId)))
      .limit(1);
    if (!b) return "العلامة التجارية المحددة غير موجودة";
  }
  if (refs.colorId) {
    const [c] = await db
      .select({ id: colorsTable.id })
      .from(colorsTable)
      .where(and(eq(colorsTable.id, refs.colorId), eq(colorsTable.storeId, storeId)))
      .limit(1);
    if (!c) return "اللون المحدد غير موجود";
  }
  if (refs.sizeId) {
    const [s] = await db
      .select({ id: sizesTable.id })
      .from(sizesTable)
      .where(and(eq(sizesTable.id, refs.sizeId), eq(sizesTable.storeId, storeId)))
      .limit(1);
    if (!s) return "المقاس المحدد غير موجود";
  }
  return null;
}

async function skuIsFree(storeId: string, sku: string): Promise<boolean> {
  const [row] = await db
    .select({ id: productVariantsTable.id })
    .from(productVariantsTable)
    .where(and(eq(productVariantsTable.storeId, storeId), eq(productVariantsTable.sku, sku)))
    .limit(1);
  return !row;
}

async function barcodeIsFree(storeId: string, barcode: string): Promise<boolean> {
  const [row] = await db
    .select({ id: productVariantsTable.id })
    .from(productVariantsTable)
    .where(and(eq(productVariantsTable.storeId, storeId), eq(productVariantsTable.barcode, barcode)))
    .limit(1);
  return !row;
}

// POST /products
router.post(
  "/products",
  requireAuth,
  requirePermission("products.create"),
  async (req, res) => {
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const input = parsed.data;
    const storeId = req.auth!.storeId;

    const refErr = await validateRefs(storeId, {
      categoryId: input.categoryId,
      brandId: input.brandId ?? undefined,
    });
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }

    // Validate every seed variant's color/size and reject duplicate combos.
    const seeds = input.variants ?? [];
    const seen = new Set<string>();
    for (const seed of seeds) {
      const key = `${seed.colorId}:${seed.sizeId}`;
      if (seen.has(key)) {
        res.status(400).json({ error: "لا يمكن تكرار نفس اللون والمقاس في نفس المنتج" });
        return;
      }
      seen.add(key);
      const e = await validateRefs(storeId, { colorId: seed.colorId, sizeId: seed.sizeId });
      if (e) {
        res.status(400).json({ error: e });
        return;
      }
    }

    // Pre-generate unique SKU/barcode for each seed (outside the tx; the unique
    // index is the final guard).
    const [category] = await db
      .select({ name: categoriesTable.name })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, input.categoryId))
      .limit(1);

    const prepared: {
      colorId: string;
      sizeId: string;
      sku: string;
      barcode: string;
      sellingPrice: string | null;
      costPrice: string | null;
    }[] = [];
    for (const seed of seeds) {
      const [color] = await db
        .select({ name: colorsTable.name })
        .from(colorsTable)
        .where(eq(colorsTable.id, seed.colorId))
        .limit(1);
      const [size] = await db
        .select({ name: sizesTable.name })
        .from(sizesTable)
        .where(eq(sizesTable.id, seed.sizeId))
        .limit(1);
      const sku = await generateUnique(
        () => generateSkuCandidate({ category: category?.name, color: color?.name, size: size?.name }),
        (c) => skuIsFree(storeId, c),
      );
      const barcode = await generateUnique(
        () => generateBarcodeCandidate(),
        (c) => barcodeIsFree(storeId, c),
      );
      prepared.push({
        colorId: seed.colorId,
        sizeId: seed.sizeId,
        sku,
        barcode,
        sellingPrice: money(seed.sellingPrice) ?? null,
        costPrice: money(seed.costPrice) ?? null,
      });
    }

    const product = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(productsTable)
        .values({
          storeId,
          name: input.name,
          nameEn: input.nameEn ?? null,
          categoryId: input.categoryId,
          brandId: input.brandId ?? null,
          description: input.description ?? null,
          basePrice: money(input.basePrice) ?? "0",
          baseCostPrice: money(input.baseCostPrice) ?? "0",
          reorderPoint: input.reorderPoint ?? 0,
        })
        .returning();

      if (prepared.length > 0) {
        const inserted = await tx
          .insert(productVariantsTable)
          .values(
            prepared.map((p) => ({
              productId: created.id,
              storeId,
              colorId: p.colorId,
              sizeId: p.sizeId,
              sku: p.sku,
              barcode: p.barcode,
              sellingPrice: p.sellingPrice,
              costPrice: p.costPrice,
            })),
          )
          .returning({ id: productVariantsTable.id, colorId: productVariantsTable.colorId, sizeId: productVariantsTable.sizeId });

        // Process opening stock for each seed variant that has openingStock entries.
        for (let i = 0; i < seeds.length; i++) {
          const seed = seeds[i];
          const variant = inserted[i];
          if (!seed || !variant) continue;
          const stockEntries = (seed as any).openingStock ?? [];
          for (const entry of stockEntries) {
            if (!entry.warehouseId || !entry.quantity || entry.quantity <= 0) continue;
            // Verify warehouse belongs to the store.
            const [wh] = await tx
              .select({ id: warehousesTable.id })
              .from(warehousesTable)
              .where(and(eq(warehousesTable.id, entry.warehouseId), eq(warehousesTable.storeId, storeId)))
              .limit(1);
            if (!wh) continue;

            // Upsert inventory cache.
            const [item] = await tx
              .insert(inventoryItemsTable)
              .values({
                storeId,
                variantId: variant.id,
                warehouseId: entry.warehouseId,
                quantity: entry.quantity,
              })
              .onConflictDoUpdate({
                target: [inventoryItemsTable.variantId, inventoryItemsTable.warehouseId],
                set: { quantity: sql`${inventoryItemsTable.quantity} + ${entry.quantity}` },
              })
              .returning({ quantity: inventoryItemsTable.quantity });

            // Append immutable movement record.
            await tx.insert(inventoryMovementsTable).values({
              storeId,
              variantId: variant.id,
              warehouseId: entry.warehouseId,
              type: "ADJUSTMENT_IN",
              quantityChange: entry.quantity,
              balanceAfter: item.quantity,
              referenceType: "OPENING_STOCK",
              referenceId: created.id,
              notes: `مخزون افتتاحي عند إنشاء المنتج`,
              createdBy: req.auth!.userId,
            });
          }
        }
      }
      return created;
    });

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
      newValue: { name: product.name, variants: prepared.length },
      ipAddress: clientIp(req),
    });

    const row = await loadProductRow(product.id, storeId);
    const variants = await loadVariants(product.id);
    res.status(201).json({ ...toProductDto(row!), variants });
  },
);

// GET /products/:id
router.get(
  "/products/:id",
  requireAuth,
  requirePermission("products.view"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }
    const row = await loadProductRow(id, req.auth!.storeId);
    if (!row) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }
    const variants = await loadVariants(id);
    res.json({ ...toProductDto(row), variants });
  },
);

// PATCH /products/:id
router.patch(
  "/products/:id",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const input = parsed.data;

    const [current] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }

    const refErr = await validateRefs(storeId, {
      categoryId: input.categoryId,
      brandId: input.brandId ?? undefined,
    });
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }

    await db
      .update(productsTable)
      .set({
        name: input.name ?? current.name,
        nameEn: input.nameEn === undefined ? current.nameEn : input.nameEn,
        categoryId: input.categoryId ?? current.categoryId,
        brandId: input.brandId === undefined ? current.brandId : input.brandId,
        description: input.description === undefined ? current.description : input.description,
        basePrice: input.basePrice === undefined ? current.basePrice : money(input.basePrice)!,
        baseCostPrice:
          input.baseCostPrice === undefined ? current.baseCostPrice : money(input.baseCostPrice)!,
        reorderPoint: input.reorderPoint === undefined ? current.reorderPoint : input.reorderPoint,
        isActive: input.isActive === undefined ? current.isActive : input.isActive,
      })
      .where(eq(productsTable.id, id));

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "product.updated",
      entityType: "product",
      entityId: id,
      oldValue: { name: current.name, isActive: current.isActive },
      newValue: input,
      ipAddress: clientIp(req),
    });

    const row = await loadProductRow(id, storeId);
    const variants = await loadVariants(id);
    res.json({ ...toProductDto(row!), variants });
  },
);

// DELETE /products/:id (soft)
router.delete(
  "/products/:id",
  requireAuth,
  requirePermission("products.delete"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(and(eq(productsTable.id, id), eq(productsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.update(productsTable).set({ isActive: false }).where(eq(productsTable.id, id));
      await tx
        .update(productVariantsTable)
        .set({ isActive: false })
        .where(eq(productVariantsTable.productId, id));
    });
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "product.deactivated",
      entityType: "product",
      entityId: id,
      oldValue: { name: current.name },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

// POST /products/:id/variants
router.post(
  "/products/:id/variants",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const productId = String(req.params["id"]);
    if (!UUID_RE.test(productId)) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }
    const parsed = CreateVariantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const input = parsed.data;

    const [product] = await db
      .select({ id: productsTable.id, categoryId: productsTable.categoryId })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "المنتج غير موجود" });
      return;
    }

    const refErr = await validateRefs(storeId, { colorId: input.colorId, sizeId: input.sizeId });
    if (refErr) {
      res.status(400).json({ error: refErr });
      return;
    }

    const [dupeCombo] = await db
      .select({ id: productVariantsTable.id })
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.productId, productId),
          eq(productVariantsTable.colorId, input.colorId),
          eq(productVariantsTable.sizeId, input.sizeId),
        ),
      )
      .limit(1);
    if (dupeCombo) {
      res.status(409).json({ error: "هذا اللون والمقاس موجود بالفعل لهذا المنتج" });
      return;
    }

    // Resolve SKU/barcode: use supplied values (checked for uniqueness) or
    // auto-generate.
    let sku = input.sku?.trim();
    if (sku) {
      if (!(await skuIsFree(storeId, sku))) {
        res.status(409).json({ error: "رمز SKU مستخدم بالفعل" });
        return;
      }
    } else {
      const [category] = await db
        .select({ name: categoriesTable.name })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, product.categoryId))
        .limit(1);
      const [color] = await db
        .select({ name: colorsTable.name })
        .from(colorsTable)
        .where(eq(colorsTable.id, input.colorId))
        .limit(1);
      const [size] = await db
        .select({ name: sizesTable.name })
        .from(sizesTable)
        .where(eq(sizesTable.id, input.sizeId))
        .limit(1);
      sku = await generateUnique(
        () => generateSkuCandidate({ category: category?.name, color: color?.name, size: size?.name }),
        (c) => skuIsFree(storeId, c),
      );
    }

    let barcode = input.barcode?.trim();
    if (barcode) {
      if (!(await barcodeIsFree(storeId, barcode))) {
        res.status(409).json({ error: "الباركود مستخدم بالفعل" });
        return;
      }
    } else {
      barcode = await generateUnique(
        () => generateBarcodeCandidate(),
        (c) => barcodeIsFree(storeId, c),
      );
    }

    const [created] = await db
      .insert(productVariantsTable)
      .values({
        productId,
        storeId,
        colorId: input.colorId,
        sizeId: input.sizeId,
        sku,
        barcode,
        sellingPrice: money(input.sellingPrice) ?? null,
        costPrice: money(input.costPrice) ?? null,
      })
      .returning();

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "variant.created",
      entityType: "variant",
      entityId: created.id,
      newValue: { productId, sku: created.sku },
      ipAddress: clientIp(req),
    });

    const variants = await loadVariants(productId);
    const dto = variants.find((v) => v.id === created.id);
    res.status(201).json(dto);
  },
);

// PATCH /variants/:id
router.patch(
  "/variants/:id",
  requireAuth,
  requirePermission("products.edit"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المتغير غير موجود" });
      return;
    }
    const parsed = UpdateVariantBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const input = parsed.data;

    const [current] = await db
      .select()
      .from(productVariantsTable)
      .where(and(eq(productVariantsTable.id, id), eq(productVariantsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المتغير غير موجود" });
      return;
    }

    await db
      .update(productVariantsTable)
      .set({
        sellingPrice:
          input.sellingPrice === undefined ? current.sellingPrice : money(input.sellingPrice) ?? null,
        costPrice: input.costPrice === undefined ? current.costPrice : money(input.costPrice) ?? null,
        isActive: input.isActive === undefined ? current.isActive : input.isActive,
      })
      .where(eq(productVariantsTable.id, id));

    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "variant.updated",
      entityType: "variant",
      entityId: id,
      oldValue: { sku: current.sku, isActive: current.isActive },
      newValue: input,
      ipAddress: clientIp(req),
    });

    const variants = await loadVariants(current.productId);
    const dto = variants.find((v) => v.id === id);
    res.json(dto);
  },
);

// DELETE /variants/:id (soft)
router.delete(
  "/variants/:id",
  requireAuth,
  requirePermission("products.delete"),
  async (req, res) => {
    const id = String(req.params["id"]);
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: "المتغير غير موجود" });
      return;
    }
    const storeId = req.auth!.storeId;
    const [current] = await db
      .select({ id: productVariantsTable.id, sku: productVariantsTable.sku })
      .from(productVariantsTable)
      .where(and(eq(productVariantsTable.id, id), eq(productVariantsTable.storeId, storeId)))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "المتغير غير موجود" });
      return;
    }
    await db
      .update(productVariantsTable)
      .set({ isActive: false })
      .where(eq(productVariantsTable.id, id));
    await writeAuditLog({
      storeId,
      userId: req.auth!.userId,
      action: "variant.deactivated",
      entityType: "variant",
      entityId: id,
      oldValue: { sku: current.sku },
      ipAddress: clientIp(req),
    });
    res.status(204).end();
  },
);

export default router;
