import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, like, lte, or, sql, inArray } from "drizzle-orm";
import {
  db,
  colorsTable,
  productsTable,
  productVariantsTable,
  purchaseInvoiceItemsTable,
  purchaseInvoicesTable,
  purchasePaymentsTable,
  purchaseReturnItemsTable,
  purchaseReturnsTable,
  sizesTable,
  storeSettingsTable,
  suppliersTable,
  supplierTransactionsTable,
  treasuryAccountsTable,
  usersTable,
  warehousesTable,
} from "@workspace/db";
import {
  CreatePurchaseBody,
  CreatePurchaseReturnBody,
  ListPurchasesQueryParams,
  ListPurchaseReturnsQueryParams,
  UpdatePurchaseBody,
} from "@workspace/api-zod";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
import { postTreasuryTransaction, resolveBackdatedTreasuryAccount } from "../lib/treasury";
import { postJournalEntry } from "../lib/accounting";
import { postInventoryMovement } from "../lib/inventory";
import { nextDocumentNumber } from "../lib/sequences";
import { cents, money, toNum } from "../lib/money";
import { requireAuth, requirePermission } from "../middleware/auth";

const router: IRouter = Router();

function clientIp(req: Request): string | null {
  return req.ip ?? null;
}

// Non-credit payment method → treasury drawer type. CREDIT = supplier account.
const METHOD_TO_TREASURY_TYPE: Record<string, "CASH" | "CARD" | "INSTAPAY" | "WALLET" | "MAIN_SAFE"> = {
  CASH: "CASH",
  CARD: "CARD",
  INSTAPAY: "INSTAPAY",
  WALLET: "WALLET",
};

// ---- shared loaders ---------------------------------------------------------

async function loadPurchaseDetail(purchaseId: string, storeId: string) {
  const [pur] = await db
    .select({
      id: purchaseInvoicesTable.id,
      invoiceNumber: purchaseInvoicesTable.invoiceNumber,
      supplierInvoiceNumber: purchaseInvoicesTable.supplierInvoiceNumber,
      supplierId: purchaseInvoicesTable.supplierId,
      supplierName: suppliersTable.name,
      warehouseId: purchaseInvoicesTable.warehouseId,
      warehouseName: warehousesTable.name,
      invoiceDate: purchaseInvoicesTable.invoiceDate,
      dueDate: purchaseInvoicesTable.dueDate,
      subtotal: purchaseInvoicesTable.subtotal,
      taxAmount: purchaseInvoicesTable.taxAmount,
      totalAmount: purchaseInvoicesTable.totalAmount,
      amountPaid: purchaseInvoicesTable.amountPaid,
      remainingBalance: purchaseInvoicesTable.remainingBalance,
      status: purchaseInvoicesTable.status,
      returnStatus: purchaseInvoicesTable.returnStatus,
      notes: purchaseInvoicesTable.notes,
      userName: usersTable.fullName,
      createdAt: purchaseInvoicesTable.createdAt,
    })
    .from(purchaseInvoicesTable)
    .leftJoin(suppliersTable, eq(purchaseInvoicesTable.supplierId, suppliersTable.id))
    .leftJoin(warehousesTable, eq(purchaseInvoicesTable.warehouseId, warehousesTable.id))
    .leftJoin(usersTable, eq(purchaseInvoicesTable.createdBy, usersTable.id))
    .where(and(eq(purchaseInvoicesTable.id, purchaseId), eq(purchaseInvoicesTable.storeId, storeId)))
    .limit(1);
  if (!pur) return null;

  const items = await db
    .select({
      id: purchaseInvoiceItemsTable.id,
      variantId: purchaseInvoiceItemsTable.variantId,
      sku: productVariantsTable.sku,
      barcode: productVariantsTable.barcode,
      productName: productsTable.name,
      colorName: colorsTable.name,
      sizeName: sizesTable.name,
      quantity: purchaseInvoiceItemsTable.quantity,
      costPrice: purchaseInvoiceItemsTable.costPrice,
      lineTotal: purchaseInvoiceItemsTable.lineTotal,
      returnedQuantity: purchaseInvoiceItemsTable.returnedQuantity,
    })
    .from(purchaseInvoiceItemsTable)
    .leftJoin(productVariantsTable, eq(purchaseInvoiceItemsTable.variantId, productVariantsTable.id))
    .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .leftJoin(colorsTable, eq(productVariantsTable.colorId, colorsTable.id))
    .leftJoin(sizesTable, eq(productVariantsTable.sizeId, sizesTable.id))
    .where(eq(purchaseInvoiceItemsTable.purchaseId, purchaseId));

  const payments = await db
    .select({
      id: purchasePaymentsTable.id,
      method: purchasePaymentsTable.method,
      treasuryAccountId: purchasePaymentsTable.treasuryAccountId,
      accountName: treasuryAccountsTable.name,
      amount: purchasePaymentsTable.amount,
      createdAt: purchasePaymentsTable.createdAt,
    })
    .from(purchasePaymentsTable)
    .leftJoin(
      treasuryAccountsTable,
      eq(purchasePaymentsTable.treasuryAccountId, treasuryAccountsTable.id),
    )
    .where(eq(purchasePaymentsTable.purchaseId, purchaseId));

  return {
    ...pur,
    createdAt: pur.createdAt.toISOString(),
    items,
    payments: payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
  };
}

// ===========================================================================
// PURCHASE HISTORY
// ===========================================================================

router.get(
  "/purchases/invoices",
  requireAuth,
  requirePermission("purchases.view"),
  async (req, res) => {
    const parsed = ListPurchasesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, search, supplierId, status, dateFrom, dateTo } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(purchaseInvoicesTable.storeId, storeId)];
    if (supplierId) conditions.push(eq(purchaseInvoicesTable.supplierId, supplierId));
    if (status) {
      conditions.push(
        eq(purchaseInvoicesTable.status, status as "DRAFT" | "CONFIRMED" | "PARTIAL" | "PAID"),
      );
    }
    if (dateFrom) conditions.push(gte(purchaseInvoicesTable.createdAt, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(purchaseInvoicesTable.createdAt, new Date(dateTo)));
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const cond = or(
        like(purchaseInvoicesTable.invoiceNumber, term),
        like(purchaseInvoicesTable.supplierInvoiceNumber, term),
      );
      if (cond) conditions.push(cond);
    }
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseInvoicesTable)
      .where(where);

    const rows = await db
      .select({
        id: purchaseInvoicesTable.id,
        invoiceNumber: purchaseInvoicesTable.invoiceNumber,
        supplierInvoiceNumber: purchaseInvoicesTable.supplierInvoiceNumber,
        supplierId: purchaseInvoicesTable.supplierId,
        supplierName: suppliersTable.name,
        warehouseId: purchaseInvoicesTable.warehouseId,
        warehouseName: warehousesTable.name,
        invoiceDate: purchaseInvoicesTable.invoiceDate,
        dueDate: purchaseInvoicesTable.dueDate,
        subtotal: purchaseInvoicesTable.subtotal,
        taxAmount: purchaseInvoicesTable.taxAmount,
        totalAmount: purchaseInvoicesTable.totalAmount,
        amountPaid: purchaseInvoicesTable.amountPaid,
        remainingBalance: purchaseInvoicesTable.remainingBalance,
        status: purchaseInvoicesTable.status,
        returnStatus: purchaseInvoicesTable.returnStatus,
        notes: purchaseInvoicesTable.notes,
        userName: usersTable.fullName,
        createdAt: purchaseInvoicesTable.createdAt,
      })
      .from(purchaseInvoicesTable)
      .leftJoin(suppliersTable, eq(purchaseInvoicesTable.supplierId, suppliersTable.id))
      .leftJoin(warehousesTable, eq(purchaseInvoicesTable.warehouseId, warehousesTable.id))
      .leftJoin(usersTable, eq(purchaseInvoicesTable.createdBy, usersTable.id))
      .where(where)
      .orderBy(desc(purchaseInvoicesTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: count,
      page,
      pageSize,
    });
  },
);

router.get(
  "/purchases/invoices/:id",
  requireAuth,
  requirePermission("purchases.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const detail = await loadPurchaseDetail(String(req.params["id"]), storeId);
    if (!detail) {
      res.status(404).json({ error: "فاتورة الشراء غير موجودة" });
      return;
    }
    res.json(detail);
  },
);

// ===========================================================================
// UPDATE PURCHASE — metadata only (notes, supplier invoice number, dates)
// ===========================================================================

router.patch(
  "/purchases/invoices/:id",
  requireAuth,
  requirePermission("purchases.edit"),
  async (req, res) => {
    const parsed = UpdatePurchaseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    const [inv] = await db
      .select({ id: purchaseInvoicesTable.id })
      .from(purchaseInvoicesTable)
      .where(and(eq(purchaseInvoicesTable.id, id), eq(purchaseInvoicesTable.storeId, storeId)))
      .limit(1);
    if (!inv) {
      res.status(404).json({ error: "فاتورة الشراء غير موجودة" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.notes !== undefined) updates["notes"] = parsed.data.notes ?? null;
    if (parsed.data.supplierInvoiceNumber !== undefined) updates["supplierInvoiceNumber"] = parsed.data.supplierInvoiceNumber ?? null;
    if (parsed.data.invoiceDate !== undefined) updates["invoiceDate"] = parsed.data.invoiceDate ?? null;
    if (parsed.data.dueDate !== undefined) updates["dueDate"] = parsed.data.dueDate ?? null;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "لا توجد تغييرات" });
      return;
    }

    await db
      .update(purchaseInvoicesTable)
      .set(updates)
      .where(eq(purchaseInvoicesTable.id, id));

    await writeAuditLog({
      storeId,
      userId,
      action: "purchase.update_metadata",
      entityType: "purchase_invoice",
      entityId: id,
      newValue: updates,
      ipAddress: clientIp(req),
    });

    const detail = await loadPurchaseDetail(id, storeId);
    res.json(detail);
  },
);

// ===========================================================================
// CREATE PURCHASE — the atomic core
// ===========================================================================

router.post(
  "/purchases/invoices",
  requireAuth,
  requirePermission("purchases.create"),
  async (req, res) => {
    const parsed = CreatePurchaseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const {
      supplierId,
      warehouseId,
      supplierInvoiceNumber,
      invoiceDate,
      dueDate,
      discountAmount,
      taxAmount,
      notes,
      items,
      payments,
    } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    if (items.length === 0) {
      res.status(400).json({ error: "فاتورة الشراء فارغة" });
      return;
    }
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) {
      res.status(400).json({ error: "الكمية يجب أن تكون عدداً صحيحاً موجباً" });
      return;
    }

    const invoiceDiscount = toNum(discountAmount ?? 0);
    const tax = toNum(taxAmount ?? 0);
    const creditAmount = payments
      .filter((p) => p.method === "CREDIT")
      .reduce((s, p) => s + toNum(p.amount), 0);
    const nonCredit = payments.filter((p) => p.method !== "CREDIT");
    const tendered = nonCredit.reduce((s, p) => s + toNum(p.amount), 0);

    await ensureStoreFinancials(db, storeId);

    try {
      const purchaseId = await db.transaction(async (tx) => {
        // Validate supplier + warehouse.
        const [supplier] = await tx
          .select({
            id: suppliersTable.id,
            currentBalance: suppliersTable.currentBalance,
          })
          .from(suppliersTable)
          .where(and(eq(suppliersTable.id, supplierId), eq(suppliersTable.storeId, storeId)))
          
          .limit(1);
        if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");

        const [wh] = await tx
          .select({ id: warehousesTable.id })
          .from(warehousesTable)
          .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.storeId, storeId)))
          .limit(1);
        if (!wh) throw new Error("WAREHOUSE_NOT_FOUND");

        // Load + validate every variant.
        const variantIds = items.map((i) => i.variantId);
        const variants = await tx
          .select({ id: productVariantsTable.id })
          .from(productVariantsTable)
          .where(
            and(
              eq(productVariantsTable.storeId, storeId),
              inArray(productVariantsTable.id, variantIds),
            ),
          );
        const variantSet = new Set(variants.map((v) => v.id));
        for (const it of items) {
          if (!variantSet.has(it.variantId)) throw new Error("VARIANT_NOT_FOUND");
        }

        // Compute money.
        let subtotal = 0;
        const computed = items.map((it) => {
          const cost = toNum(it.costPrice);
          const lineTotal = it.quantity * cost;
          subtotal += lineTotal;
          return { ...it, cost, lineTotal };
        });
        const totalAmount = subtotal - invoiceDiscount + tax;
        if (totalAmount < 0) throw new Error("NEGATIVE_TOTAL");

        if (cents(tendered + creditAmount) !== cents(totalAmount)) {
          throw new Error("PAYMENT_MISMATCH");
        }
        if (creditAmount < 0) throw new Error("NEGATIVE_TOTAL");

        const amountPaid = tendered;
        const remainingBalance = creditAmount;
        const status =
          cents(creditAmount) <= 0
            ? "PAID"
            : cents(amountPaid) <= 0
              ? "CONFIRMED"
              : "PARTIAL";

        const invoiceNumber = await nextDocumentNumber(tx, storeId, "PURCHASE");

        const [purchase] = await tx
          .insert(purchaseInvoicesTable)
          .values({
            storeId,
            invoiceNumber,
            supplierInvoiceNumber: supplierInvoiceNumber ?? null,
            supplierId,
            warehouseId,
            invoiceDate: invoiceDate ?? null,
            dueDate: dueDate ?? null,
            subtotal: money(subtotal),
            taxAmount: money(tax),
            totalAmount: money(totalAmount),
            amountPaid: money(amountPaid),
            remainingBalance: money(remainingBalance),
            status,
            notes: notes ?? null,
            createdBy: userId,
          })
          .returning({ id: purchaseInvoicesTable.id });

        // Items + inventory IN + update variant last-cost.
        for (const c of computed) {
          await tx.insert(purchaseInvoiceItemsTable).values({
            storeId,
            purchaseId: purchase.id,
            variantId: c.variantId,
            quantity: c.quantity,
            costPrice: money(c.cost),
            lineTotal: money(c.lineTotal),
          });
          await postInventoryMovement(tx, {
            storeId,
            variantId: c.variantId,
            warehouseId,
            type: "PURCHASE",
            quantityChange: c.quantity,
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            userId,
          });
          // Last-cost valuation: future sales read this for COGS.
          await tx
            .update(productVariantsTable)
            .set({ costPrice: money(c.cost) })
            .where(eq(productVariantsTable.id, c.variantId));
        }

        // Payments to supplier (treasury OUT per drawer).
        const debitInventory = totalAmount; // inventory asset increases by total
        const creditByCode = new Map<string, number>();
        for (const p of nonCredit) {
          const applied = toNum(p.amount);
          if (cents(applied) === 0) continue;
          const drawerType = METHOD_TO_TREASURY_TYPE[p.method];
          let drawerId = p.treasuryAccountId ?? null;
          if (!drawerId) {
            const [drawer] = await tx
              .select({ id: treasuryAccountsTable.id })
              .from(treasuryAccountsTable)
              .where(
                and(
                  eq(treasuryAccountsTable.storeId, storeId),
                  eq(treasuryAccountsTable.type, drawerType),
                ),
              )
              .limit(1);
            if (!drawer) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");
            drawerId = drawer.id;
          }
          drawerId = await resolveBackdatedTreasuryAccount(tx, storeId, drawerId, invoiceDate, req.auth!.permissions);
          await tx.insert(purchasePaymentsTable).values({
            storeId,
            purchaseId: purchase.id,
            method: p.method,
            treasuryAccountId: drawerId,
            amount: money(applied),
          });
          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: drawerId,
            direction: "OUT",
            amount: applied,
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            description: `شراء فاتورة ${invoiceNumber}`,
            userId,
            allowNegative: true,
          });
          const code = TREASURY_TYPE_TO_ACCOUNT_CODE[drawerType];
          creditByCode.set(code, (creditByCode.get(code) ?? 0) + applied);
        }

        // Supplier ledger: always record full PURCHASE, then immediately record PAYMENT if cash paid.
        let currentSupplierBalance = toNum(supplier.currentBalance);
        
        if (totalAmount > 0) {
          currentSupplierBalance += totalAmount;
          await tx.insert(supplierTransactionsTable).values({
            storeId,
            supplierId,
            type: "PURCHASE",
            credit: money(totalAmount),
            balanceAfter: money(currentSupplierBalance),
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            description: `فاتورة شراء ${invoiceNumber}`,
            createdBy: userId,
          });
        }
        
        if (tendered > 0) {
          currentSupplierBalance -= tendered;
          await tx.insert(supplierTransactionsTable).values({
            storeId,
            supplierId,
            type: "PAYMENT",
            debit: money(tendered),
            balanceAfter: money(currentSupplierBalance),
            referenceType: "PURCHASE",
            referenceId: purchase.id,
            description: `سداد نقدي لفاتورة ${invoiceNumber}`,
            createdBy: userId,
          });
        }
        
        if (currentSupplierBalance !== toNum(supplier.currentBalance)) {
          await tx
            .update(suppliersTable)
            .set({ currentBalance: money(currentSupplierBalance) })
            .where(eq(suppliersTable.id, supplierId));
        }

        if (creditAmount > 0) {
          await tx.insert(purchasePaymentsTable).values({
            storeId,
            purchaseId: purchase.id,
            method: "CREDIT",
            amount: money(creditAmount),
          });
          creditByCode.set("2000", (creditByCode.get("2000") ?? 0) + creditAmount);
        }

        // Accounting: debit Inventory; credit drawers + AP.
        const purchaseLines = [
          { code: "1200", debit: debitInventory },
          ...[...creditByCode.entries()].map(([code, amount]) => ({ code, credit: amount })),
        ];
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `فاتورة شراء ${invoiceNumber}`,
          referenceType: "PURCHASE",
          referenceId: purchase.id,
          lines: purchaseLines,
        });

        return purchase.id;
      });

      await writeAuditLog({
        storeId,
        userId,
        action: "purchase.created",
        entityType: "purchase_invoice",
        entityId: purchaseId,
        newValue: { items: items.length, supplierId },
        ipAddress: clientIp(req),
      });

      const detail = await loadPurchaseDetail(purchaseId, storeId);
      res.status(201).json(detail);
    } catch (err) {
      if (err instanceof Error && handlePurchaseError(err, res)) return;
      throw err;
    }
  },
);

function handlePurchaseError(err: Error, res: import("express").Response): boolean {
  const map: Record<string, [number, string]> = {
    UNAUTHORIZED_MAIN_SAFE: [403, "ليس لديك صلاحية لاستخدام الخزينة الرئيسية (أو لعمليات بأثر رجعي)"],
    SUPPLIER_NOT_FOUND: [404, "المورد غير موجود"],
    WAREHOUSE_NOT_FOUND: [404, "المخزن غير موجود"],
    VARIANT_NOT_FOUND: [404, "أحد المنتجات غير موجود"],
    TREASURY_ACCOUNT_NOT_FOUND: [404, "حساب الخزينة غير موجود"],
    PAYMENT_MISMATCH: [400, "مجموع المدفوعات لا يساوي إجمالي الفاتورة"],
    NEGATIVE_TOTAL: [400, "إجمالي الفاتورة غير صالح"],
    INSUFFICIENT_TREASURY: [400, "رصيد الخزينة غير كافٍ"],
    INSUFFICIENT_STOCK: [400, "الكمية غير كافية في المخزن"],
  };
  const hit = map[err.message];
  if (hit) {
    res.status(hit[0]).json({ error: hit[1] });
    return true;
  }
  return false;
}

// ===========================================================================
// PURCHASE RETURNS
// ===========================================================================

router.get(
  "/purchases/returns",
  requireAuth,
  requirePermission("purchases.return"),
  async (req, res) => {
    const parsed = ListPurchaseReturnsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const { page, pageSize, purchaseId } = parsed.data;
    const storeId = req.auth!.storeId;

    const conditions = [eq(purchaseReturnsTable.storeId, storeId)];
    if (purchaseId) conditions.push(eq(purchaseReturnsTable.purchaseId, purchaseId));
    const where = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(purchaseReturnsTable)
      .where(where);

    const rows = await db
      .select({
        id: purchaseReturnsTable.id,
        returnNumber: purchaseReturnsTable.returnNumber,
        purchaseId: purchaseReturnsTable.purchaseId,
        invoiceNumber: purchaseInvoicesTable.invoiceNumber,
        warehouseId: purchaseReturnsTable.warehouseId,
        totalAmount: purchaseReturnsTable.totalAmount,
        reason: purchaseReturnsTable.reason,
        userName: usersTable.fullName,
        createdAt: purchaseReturnsTable.createdAt,
      })
      .from(purchaseReturnsTable)
      .leftJoin(purchaseInvoicesTable, eq(purchaseReturnsTable.purchaseId, purchaseInvoicesTable.id))
      .leftJoin(usersTable, eq(purchaseReturnsTable.createdBy, usersTable.id))
      .where(where)
      .orderBy(desc(purchaseReturnsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      total: count,
      page,
      pageSize,
    });
  },
);

async function loadPurchaseReturnDetail(returnId: string, storeId: string) {
  const [ret] = await db
    .select({
      id: purchaseReturnsTable.id,
      returnNumber: purchaseReturnsTable.returnNumber,
      purchaseId: purchaseReturnsTable.purchaseId,
      invoiceNumber: purchaseInvoicesTable.invoiceNumber,
      warehouseId: purchaseReturnsTable.warehouseId,
      totalAmount: purchaseReturnsTable.totalAmount,
      reason: purchaseReturnsTable.reason,
      userName: usersTable.fullName,
      createdAt: purchaseReturnsTable.createdAt,
    })
    .from(purchaseReturnsTable)
    .leftJoin(purchaseInvoicesTable, eq(purchaseReturnsTable.purchaseId, purchaseInvoicesTable.id))
    .leftJoin(usersTable, eq(purchaseReturnsTable.createdBy, usersTable.id))
    .where(and(eq(purchaseReturnsTable.id, returnId), eq(purchaseReturnsTable.storeId, storeId)))
    .limit(1);
  if (!ret) return null;

  const items = await db
    .select({
      id: purchaseReturnItemsTable.id,
      variantId: purchaseReturnItemsTable.variantId,
      sku: productVariantsTable.sku,
      productName: productsTable.name,
      quantity: purchaseReturnItemsTable.quantity,
      costPrice: purchaseReturnItemsTable.costPrice,
      lineTotal: purchaseReturnItemsTable.lineTotal,
    })
    .from(purchaseReturnItemsTable)
    .leftJoin(productVariantsTable, eq(purchaseReturnItemsTable.variantId, productVariantsTable.id))
    .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .where(eq(purchaseReturnItemsTable.returnId, returnId));

  return { ...ret, createdAt: ret.createdAt.toISOString(), items };
}

router.get(
  "/purchases/returns/:id",
  requireAuth,
  requirePermission("purchases.return"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const detail = await loadPurchaseReturnDetail(String(req.params["id"]), storeId);
    if (!detail) {
      res.status(404).json({ error: "المرتجع غير موجود" });
      return;
    }
    res.json(detail);
  },
);

router.post(
  "/purchases/returns",
  requireAuth,
  requirePermission("purchases.return"),
  async (req, res) => {
    const parsed = CreatePurchaseReturnBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const { purchaseId, refundMethod, treasuryAccountId, reason, items } = parsed.data;
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;

    if (items.length === 0) {
      res.status(400).json({ error: "لا توجد أصناف للإرجاع" });
      return;
    }

    await ensureStoreFinancials(db, storeId);

    try {
      const returnId = await db.transaction(async (tx) => {
        const [purchase] = await tx
          .select({
            id: purchaseInvoicesTable.id,
            warehouseId: purchaseInvoicesTable.warehouseId,
            supplierId: purchaseInvoicesTable.supplierId,
            invoiceNumber: purchaseInvoicesTable.invoiceNumber,
          })
          .from(purchaseInvoicesTable)
          .where(and(eq(purchaseInvoicesTable.id, purchaseId), eq(purchaseInvoicesTable.storeId, storeId)))
          
          .limit(1);
        if (!purchase) throw new Error("PURCHASE_NOT_FOUND");

        const [settings] = await tx
          .select({ allowNegativeStock: storeSettingsTable.allowNegativeStock })
          .from(storeSettingsTable)
          .where(eq(storeSettingsTable.storeId, storeId))
          .limit(1);
        const allowNegativeStock = settings?.allowNegativeStock ?? false;

        const purItems = await tx
          .select({
            id: purchaseInvoiceItemsTable.id,
            variantId: purchaseInvoiceItemsTable.variantId,
            quantity: purchaseInvoiceItemsTable.quantity,
            costPrice: purchaseInvoiceItemsTable.costPrice,
            returnedQuantity: purchaseInvoiceItemsTable.returnedQuantity,
          })
          .from(purchaseInvoiceItemsTable)
          .where(eq(purchaseInvoiceItemsTable.purchaseId, purchaseId));
        const itemById = new Map(purItems.map((i) => [i.id, i]));

        let totalAmount = 0;
        const computed = items.map((r) => {
          const src = itemById.get(r.purchaseItemId);
          if (!src) throw new Error("PURCHASE_ITEM_NOT_FOUND");
          if (!Number.isInteger(r.quantity) || r.quantity <= 0) throw new Error("BAD_QUANTITY");
          const remaining = src.quantity - src.returnedQuantity;
          if (r.quantity > remaining) throw new Error("RETURN_EXCEEDS_PURCHASED");
          const lineTotal = r.quantity * toNum(src.costPrice);
          totalAmount += lineTotal;
          return { src, quantity: r.quantity, cost: toNum(src.costPrice), lineTotal };
        });

        const returnNumber = await nextDocumentNumber(tx, storeId, "PURCHASE_RETURN");

        // Resolve drawer when supplier refunds to treasury.
        let drawerId: string | null = null;
        let drawerCode: string | null = null;
        if (refundMethod !== "CREDIT") {
          const drawerType = METHOD_TO_TREASURY_TYPE[refundMethod];
          if (treasuryAccountId) {
            const [d] = await tx
              .select({ id: treasuryAccountsTable.id, type: treasuryAccountsTable.type })
              .from(treasuryAccountsTable)
              .where(
                and(
                  eq(treasuryAccountsTable.id, treasuryAccountId),
                  eq(treasuryAccountsTable.storeId, storeId),
                ),
              )
              .limit(1);
            if (!d) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");
            drawerId = d.id;
            drawerCode = TREASURY_TYPE_TO_ACCOUNT_CODE[d.type];
          } else {
            const [d] = await tx
              .select({ id: treasuryAccountsTable.id })
              .from(treasuryAccountsTable)
              .where(
                and(
                  eq(treasuryAccountsTable.storeId, storeId),
                  eq(treasuryAccountsTable.type, drawerType),
                ),
              )
              .limit(1);
            if (!d) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");
            drawerId = d.id;
            drawerCode = TREASURY_TYPE_TO_ACCOUNT_CODE[drawerType];
          }
        }

        const [ret] = await tx
          .insert(purchaseReturnsTable)
          .values({
            storeId,
            returnNumber,
            purchaseId,
            warehouseId: purchase.warehouseId,
            totalAmount: money(totalAmount),
            reason: reason ?? null,
            createdBy: userId,
          })
          .returning({ id: purchaseReturnsTable.id });

        for (const c of computed) {
          await tx.insert(purchaseReturnItemsTable).values({
            storeId,
            returnId: ret.id,
            purchaseItemId: c.src.id,
            variantId: c.src.variantId,
            quantity: c.quantity,
            costPrice: money(c.cost),
            lineTotal: money(c.lineTotal),
          });
          await tx
            .update(purchaseInvoiceItemsTable)
            .set({ returnedQuantity: c.src.returnedQuantity + c.quantity })
            .where(eq(purchaseInvoiceItemsTable.id, c.src.id));
          await postInventoryMovement(tx, {
            storeId,
            variantId: c.src.variantId,
            warehouseId: purchase.warehouseId,
            type: "PURCHASE_RETURN",
            quantityChange: -c.quantity,
            referenceType: "PURCHASE_RETURN",
            referenceId: ret.id,
            userId,
            allowNegative: allowNegativeStock,
          });
        }

        // Update purchase return status.
        const refreshed = await tx
          .select({
            quantity: purchaseInvoiceItemsTable.quantity,
            returnedQuantity: purchaseInvoiceItemsTable.returnedQuantity,
          })
          .from(purchaseInvoiceItemsTable)
          .where(eq(purchaseInvoiceItemsTable.purchaseId, purchaseId));
        const fullyReturned = refreshed.every((i) => i.returnedQuantity >= i.quantity);
        const anyReturned = refreshed.some((i) => i.returnedQuantity > 0);
        await tx
          .update(purchaseInvoicesTable)
          .set({ returnStatus: fullyReturned ? "FULL" : anyReturned ? "PARTIAL" : "NONE" })
          .where(eq(purchaseInvoicesTable.id, purchaseId));

        // Refund: treasury IN (supplier gives money back) or reduce supplier debt.
        if (refundMethod === "CREDIT") {
          const [s] = await tx
            .select({ id: suppliersTable.id, currentBalance: suppliersTable.currentBalance })
            .from(suppliersTable)
            .where(eq(suppliersTable.id, purchase.supplierId))
            
            .limit(1);
          if (!s) throw new Error("SUPPLIER_NOT_FOUND");
          const newBalance = toNum(s.currentBalance) - totalAmount;
          await tx.insert(supplierTransactionsTable).values({
            storeId,
            supplierId: s.id,
            type: "RETURN",
            debit: money(totalAmount),
            balanceAfter: money(newBalance),
            referenceType: "PURCHASE_RETURN",
            referenceId: ret.id,
            description: `مرتجع ${returnNumber}`,
            createdBy: userId,
          });
          await tx
            .update(suppliersTable)
            .set({ currentBalance: money(newBalance) })
            .where(eq(suppliersTable.id, s.id));
        } else if (drawerId) {
          await postTreasuryTransaction(tx, {
            storeId,
            treasuryAccountId: drawerId,
            direction: "IN",
            amount: totalAmount,
            referenceType: "PURCHASE_RETURN",
            referenceId: ret.id,
            description: `مرتجع شراء ${returnNumber}`,
            userId,
          });
        }

        // Accounting reversal: credit Inventory; debit AP or treasury drawer.
        if (cents(totalAmount) > 0) {
          const debitCode = refundMethod === "CREDIT" ? "2000" : drawerCode!;
          await postJournalEntry(tx, {
            storeId,
            userId,
            description: `مرتجع مشتريات ${returnNumber}`,
            referenceType: "PURCHASE_RETURN",
            referenceId: ret.id,
            lines: [
              { code: debitCode, debit: totalAmount },
              { code: "1200", credit: totalAmount },
            ],
          });
        }

        return ret.id;
      });

      await writeAuditLog({
        storeId,
        userId,
        action: "purchase.returned",
        entityType: "purchase_return",
        entityId: returnId,
        newValue: { purchaseId, items: items.length },
        ipAddress: clientIp(req),
      });

      const detail = await loadPurchaseReturnDetail(returnId, storeId);
      res.status(201).json(detail);
    } catch (err) {
      if (err instanceof Error) {
        const map: Record<string, [number, string]> = {
          PURCHASE_NOT_FOUND: [404, "فاتورة الشراء غير موجودة"],
          PURCHASE_ITEM_NOT_FOUND: [404, "أحد الأصناف غير موجود في الفاتورة"],
          BAD_QUANTITY: [400, "كمية غير صالحة"],
          RETURN_EXCEEDS_PURCHASED: [400, "الكمية المرتجعة أكبر من المشتراة"],
          TREASURY_ACCOUNT_NOT_FOUND: [404, "حساب الخزينة غير موجود"],
          SUPPLIER_NOT_FOUND: [404, "المورد غير موجود"],
          INSUFFICIENT_TREASURY: [400, "رصيد الخزينة غير كافٍ للاسترداد"],
          INSUFFICIENT_STOCK: [400, "الكمية غير كافية في المخزن لإتمام المرتجع"],
        };
        const hit = map[err.message];
        if (hit) {
          res.status(hit[0]).json({ error: hit[1] });
          return;
        }
      }
      throw err;
    }
  },
);

// ── PATCH /purchases/invoices/:id — metadata edit ─────────────────────────────────

router.patch(
  "/purchases/invoices/:id",
  requireAuth,
  requirePermission("purchases.edit"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    const { notes, supplierInvoiceNumber, invoiceDate, dueDate } = req.body as {
      notes?: string | null;
      supplierInvoiceNumber?: string | null;
      invoiceDate?: string | null;
      dueDate?: string | null;
    };

    const [pur] = await db
      .select({ id: purchaseInvoicesTable.id })
      .from(purchaseInvoicesTable)
      .where(and(eq(purchaseInvoicesTable.id, id), eq(purchaseInvoicesTable.storeId, storeId)))
      .limit(1);

    if (!pur) {
      res.status(404).json({ error: "فاتورة الشراء غير موجودة" });
      return;
    }

    const updateSet: Record<string, unknown> = {};
    if (notes !== undefined) updateSet["notes"] = notes;
    if (supplierInvoiceNumber !== undefined) updateSet["supplierInvoiceNumber"] = supplierInvoiceNumber;
    if (invoiceDate !== undefined) updateSet["invoiceDate"] = invoiceDate;
    if (dueDate !== undefined) updateSet["dueDate"] = dueDate;

    if (Object.keys(updateSet).length > 0) {
      await db
        .update(purchaseInvoicesTable)
        .set(updateSet as any)
        .where(eq(purchaseInvoicesTable.id, id));
    }

    await writeAuditLog({
      storeId,
      userId,
      action: "purchase.edit",
      entityType: "purchase_invoice",
      entityId: id,
      ipAddress: req.ip ?? null,
    });

    res.status(200).json({ id });
  },
);

export default router;
