import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, like, lte, or, sql, inArray } from "drizzle-orm";
import {
  db,
  colorsTable,
  customersTable,
  customerTransactionsTable,
  invoiceItemsTable,
  invoicePaymentsTable,
  invoicesTable,
  operationalDaysTable,
  productsTable,
  productVariantsTable,
  salesReturnItemsTable,
  salesReturnsTable,
  sizesTable,
  storeSettingsTable,
  suspendedOrdersTable,
  treasuryAccountsTable,
  usersTable,
  warehousesTable,
} from "@workspace/db";
import {
  CreateSaleBody,
  CreateSalesReturnBody,
  ListInvoicesQueryParams,
  ListSalesReturnsQueryParams,
  LookupInvoiceQueryParams,
  CreateSuspendedOrderBody,
  UpdateInvoiceBody,
} from "@workspace/api-zod";
import { hasPermission } from "@workspace/shared";
import { writeAuditLog } from "../lib/audit";
import { ensureStoreFinancials, resolveTreasuryAccount, TREASURY_TYPE_TO_ACCOUNT_CODE } from "../lib/seed";
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

// Payment method → treasury drawer type. CREDIT does not touch a drawer.
const METHOD_TO_TREASURY_TYPE: Record<string, "CASH" | "CARD" | "INSTAPAY" | "WALLET" | "MAIN_SAFE"> = {
  CASH: "CASH",
  CARD: "CARD",
  INSTAPAY: "INSTAPAY",
  WALLET: "WALLET",
};

function genBarcode(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

// ---- shared loaders ---------------------------------------------------------

async function loadInvoiceDetail(invoiceId: string, storeId: string) {
  const [inv] = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceBarcode: invoicesTable.invoiceBarcode,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      warehouseId: invoicesTable.warehouseId,
      warehouseName: warehousesTable.name,
      saleType: invoicesTable.saleType,
      subtotal: invoicesTable.subtotal,
      discountAmount: invoicesTable.discountAmount,
      taxAmount: invoicesTable.taxAmount,
      totalAmount: invoicesTable.totalAmount,
      totalCost: invoicesTable.totalCost,
      amountPaid: invoicesTable.amountPaid,
      changeDue: invoicesTable.changeDue,
      paymentStatus: invoicesTable.paymentStatus,
      returnStatus: invoicesTable.returnStatus,
      notes: invoicesTable.notes,
      userName: usersTable.fullName,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .leftJoin(warehousesTable, eq(invoicesTable.warehouseId, warehousesTable.id))
    .leftJoin(usersTable, eq(invoicesTable.createdBy, usersTable.id))
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.storeId, storeId)))
    .limit(1);
  if (!inv) return null;

  const items = await db
    .select({
      id: invoiceItemsTable.id,
      variantId: invoiceItemsTable.variantId,
      sku: productVariantsTable.sku,
      barcode: productVariantsTable.barcode,
      productName: productsTable.name,
      colorName: colorsTable.name,
      sizeName: sizesTable.name,
      quantity: invoiceItemsTable.quantity,
      unitPrice: invoiceItemsTable.unitPrice,
      unitCost: invoiceItemsTable.unitCost,
      discountAmount: invoiceItemsTable.discountAmount,
      lineTotal: invoiceItemsTable.lineTotal,
      returnedQuantity: invoiceItemsTable.returnedQuantity,
    })
    .from(invoiceItemsTable)
    .leftJoin(productVariantsTable, eq(invoiceItemsTable.variantId, productVariantsTable.id))
    .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .leftJoin(colorsTable, eq(productVariantsTable.colorId, colorsTable.id))
    .leftJoin(sizesTable, eq(productVariantsTable.sizeId, sizesTable.id))
    .where(eq(invoiceItemsTable.invoiceId, invoiceId));

  const payments = await db
    .select({
      id: invoicePaymentsTable.id,
      method: invoicePaymentsTable.method,
      treasuryAccountId: invoicePaymentsTable.treasuryAccountId,
      accountName: treasuryAccountsTable.name,
      amount: invoicePaymentsTable.amount,
      createdAt: invoicePaymentsTable.createdAt,
    })
    .from(invoicePaymentsTable)
    .leftJoin(
      treasuryAccountsTable,
      eq(invoicePaymentsTable.treasuryAccountId, treasuryAccountsTable.id),
    )
    .where(eq(invoicePaymentsTable.invoiceId, invoiceId));

  return {
    ...inv,
    createdAt: inv.createdAt.toISOString(),
    items,
    payments: payments.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
  };
}

// ===========================================================================
// SALES HISTORY
// ===========================================================================

router.get("/sales/invoices", requireAuth, requirePermission("sales.view"), async (req, res) => {
  const parsed = ListInvoicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { page, pageSize, search, customerId, paymentStatus, dateFrom, dateTo } = parsed.data;
  const storeId = req.auth!.storeId;

  const conditions = [eq(invoicesTable.storeId, storeId)];
  if (customerId) conditions.push(eq(invoicesTable.customerId, customerId));
  if (paymentStatus) {
    conditions.push(eq(invoicesTable.paymentStatus, paymentStatus as "PAID" | "PARTIAL" | "UNPAID"));
  }
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo)));
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const cond = or(
      like(invoicesTable.invoiceNumber, term),
      like(invoicesTable.invoiceBarcode, term),
    );
    if (cond) conditions.push(cond);
  }
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(invoicesTable)
    .where(where);

  const rows = await db
    .select({
      id: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceBarcode: invoicesTable.invoiceBarcode,
      customerId: invoicesTable.customerId,
      customerName: customersTable.name,
      warehouseId: invoicesTable.warehouseId,
      warehouseName: warehousesTable.name,
      saleType: invoicesTable.saleType,
      subtotal: invoicesTable.subtotal,
      discountAmount: invoicesTable.discountAmount,
      taxAmount: invoicesTable.taxAmount,
      totalAmount: invoicesTable.totalAmount,
      totalCost: invoicesTable.totalCost,
      amountPaid: invoicesTable.amountPaid,
      changeDue: invoicesTable.changeDue,
      paymentStatus: invoicesTable.paymentStatus,
      returnStatus: invoicesTable.returnStatus,
      notes: invoicesTable.notes,
      userName: usersTable.fullName,
      createdAt: invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .leftJoin(warehousesTable, eq(invoicesTable.warehouseId, warehousesTable.id))
    .leftJoin(usersTable, eq(invoicesTable.createdBy, usersTable.id))
    .where(where)
    .orderBy(desc(invoicesTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total: count,
    page,
    pageSize,
  });
});

// Lookup by number or barcode (for returns). Must precede /:id.
router.get(
  "/sales/invoices/lookup",
  requireAuth,
  requirePermission("sales.return"),
  async (req, res) => {
    const parsed = LookupInvoiceQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "معاملات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const q = parsed.data.q.trim();
    const [inv] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.storeId, storeId),
          or(eq(invoicesTable.invoiceNumber, q), eq(invoicesTable.invoiceBarcode, q)),
        ),
      )
      .limit(1);
    if (!inv) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }
    const detail = await loadInvoiceDetail(inv.id, storeId);
    res.json(detail);
  },
);

router.get(
  "/sales/invoices/:id",
  requireAuth,
  requirePermission("sales.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const detail = await loadInvoiceDetail(String(req.params["id"]), storeId);
    if (!detail) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }
    res.json(detail);
  },
);

// ===========================================================================
// UPDATE SALE INVOICE — metadata only (notes)
// ===========================================================================

router.patch(
  "/sales/invoices/:id",
  requireAuth,
  requirePermission("sales.delete"),
  async (req, res) => {
    const parsed = UpdateInvoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      return;
    }
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    const [inv] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.storeId, storeId)))
      .limit(1);
    if (!inv) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }

    await db
      .update(invoicesTable)
      .set({ notes: parsed.data.notes ?? null })
      .where(eq(invoicesTable.id, id));

    await writeAuditLog({
      storeId,
      userId,
      action: "sale.update_notes",
      entityType: "invoice",
      entityId: id,
      newValue: { notes: parsed.data.notes },
      ipAddress: clientIp(req),
    });

    const detail = await loadInvoiceDetail(id, storeId);
    res.json(detail);
  },
);

// ===========================================================================
// CREATE SALE — the atomic core
// ===========================================================================

router.post("/sales/invoices", requireAuth, requirePermission("sales.create"), async (req, res) => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { warehouseId, customerId, discountAmount, taxAmount, notes, items, payments, createdAt: parsedCreatedAt } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  let createdAt: Date | undefined;
  if (parsedCreatedAt) {
    if (!hasPermission(req.auth!.permissions, "sales.custom_date")) {
      res.status(403).json({ error: "ليس لديك صلاحية لتعديل تاريخ البيع" });
      return;
    }
    createdAt = parsedCreatedAt;
  }

  if (items.length === 0) {
    res.status(400).json({ error: "الفاتورة فارغة" });
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

  if (creditAmount > 0 && !customerId) {
    res.status(400).json({ error: "البيع الآجل يتطلب اختيار عميل" });
    return;
  }

  await ensureStoreFinancials(db, storeId);

  // ── Operational-day session gate ────────────────────────────────────────
  // When requireSessionForCash is enabled, a cashier must have an open
  // operational day before making any cash (non-credit) sale.
  const hasCashPayment = nonCredit.some((p) => p.method === "CASH");
  if (hasCashPayment) {
    const [settings] = await db
      .select({ requireSessionForCash: storeSettingsTable.requireSessionForCash })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.storeId, storeId))
      .limit(1);

    if (settings?.requireSessionForCash) {
      const [openDay] = await db
        .select({ id: operationalDaysTable.id })
        .from(operationalDaysTable)
        .where(
          and(
            eq(operationalDaysTable.storeId, storeId),
            eq(operationalDaysTable.userId, userId),
            eq(operationalDaysTable.status, "OPEN"),
          ),
        )
        .limit(1);

      if (!openDay) {
        res.status(403).json({
          error:
            "يجب فتح يوم تشغيلي أولاً قبل إجراء مبيعات نقدية. اذهب إلى صفحة الخزينة وافتح يومك التشغيلي.",
        });
        return;
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  try {
    const invoiceId = await db.transaction(async (tx) => {
      // Validate warehouse.
      const [wh] = await tx
        .select({ id: warehousesTable.id })
        .from(warehousesTable)
        .where(and(eq(warehousesTable.id, warehouseId), eq(warehousesTable.storeId, storeId)))
        .limit(1);
      if (!wh) throw new Error("WAREHOUSE_NOT_FOUND");

      const [settings] = await tx
        .select({ allowNegativeStock: storeSettingsTable.allowNegativeStock })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.storeId, storeId))
        .limit(1);
      const allowNegativeStock = settings?.allowNegativeStock ?? false;

      // Load + validate every variant; capture cost snapshot.
      const variantIds = items.map((i) => i.variantId);
      const variants = await tx
        .select({
          id: productVariantsTable.id,
          costPrice: productVariantsTable.costPrice,
          baseCost: productsTable.baseCostPrice,
        })
        .from(productVariantsTable)
        .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
        .where(
          and(
            eq(productVariantsTable.storeId, storeId),
            inArray(productVariantsTable.id, variantIds)
          ),
        );
      const variantById = new Map(variants.map((v) => [v.id, v]));
      for (const it of items) {
        if (!variantById.has(it.variantId)) throw new Error("VARIANT_NOT_FOUND");
      }

      // Compute money.
      let subtotal = 0; // gross before any discount
      let lineDiscountTotal = 0;
      let totalCost = 0;
      const computed = items.map((it) => {
        const v = variantById.get(it.variantId)!;
        const unitCost = toNum(v.costPrice ?? v.baseCost ?? 0);
        const gross = it.quantity * toNum(it.unitPrice);
        const lineDiscount = toNum(it.discountAmount ?? 0);
        const lineTotal = gross - lineDiscount;
        subtotal += gross;
        lineDiscountTotal += lineDiscount;
        totalCost += it.quantity * unitCost;
        return { ...it, unitCost, gross, lineDiscount, lineTotal };
      });
      const totalDiscount = lineDiscountTotal + invoiceDiscount;
      const totalAmount = subtotal - totalDiscount + tax;
      if (totalAmount < 0) throw new Error("NEGATIVE_TOTAL");

      const required = totalAmount - creditAmount; // must be covered by tender
      if (cents(tendered) < cents(required) - 0) {
        throw new Error("INSUFFICIENT_PAYMENT");
      }
      const changeDue = tendered - required;
      // Change is only refundable from a cash tender.
      if (changeDue > 0 && !nonCredit.some((p) => p.method === "CASH")) {
        throw new Error("CHANGE_REQUIRES_CASH");
      }
      const amountPaid = totalAmount - creditAmount; // settled portion (non-credit)

      // Customer + credit-limit check.
      let customer: { id: string; currentBalance: string; creditLimit: string } | null = null;
      if (customerId) {
        const [c] = await tx
          .select({
            id: customersTable.id,
            currentBalance: customersTable.currentBalance,
            creditLimit: customersTable.creditLimit,
          })
          .from(customersTable)
          .where(and(eq(customersTable.id, customerId), eq(customersTable.storeId, storeId)))
          .limit(1);
        if (!c) throw new Error("CUSTOMER_NOT_FOUND");
        customer = c;
        if (creditAmount > 0) {
          const limit = toNum(c.creditLimit);
          if (limit <= 0) throw new Error("NO_CREDIT_ALLOWED");
          if (cents(toNum(c.currentBalance) + creditAmount) > cents(limit)) {
            throw new Error("CREDIT_LIMIT_EXCEEDED");
          }
        }
      }

      const saleType = creditAmount > 0 ? "CREDIT" : "CASH";
      const paymentStatus =
        creditAmount <= 0 ? "PAID" : cents(creditAmount) >= cents(totalAmount) ? "UNPAID" : "PARTIAL";

      const invoiceNumber = await nextDocumentNumber(tx, storeId, "SALE");

      const [invoice] = await tx
        .insert(invoicesTable)
        .values({
          storeId,
          invoiceNumber,
          invoiceBarcode: genBarcode(),
          customerId: customerId ?? null,
          warehouseId,
          saleType,
          subtotal: money(subtotal),
          discountAmount: money(totalDiscount),
          taxAmount: money(tax),
          totalAmount: money(totalAmount),
          totalCost: money(totalCost),
          amountPaid: money(amountPaid),
          changeDue: money(changeDue),
          paymentStatus,
          notes: notes ?? null,
          createdBy: userId,
          ...(createdAt ? { createdAt } : {}),
        })
        .returning({ id: invoicesTable.id });

      // Items + inventory OUT.
      for (const c of computed) {
        await tx.insert(invoiceItemsTable).values({
          storeId,
          invoiceId: invoice.id,
          variantId: c.variantId,
          quantity: c.quantity,
          unitPrice: money(toNum(c.unitPrice)),
          unitCost: money(c.unitCost),
          discountAmount: money(c.lineDiscount),
          lineTotal: money(c.lineTotal),
          ...(createdAt ? { createdAt } : {}),
        });
        await postInventoryMovement(tx, {
          storeId,
          variantId: c.variantId,
          warehouseId,
          type: "SALE",
          quantityChange: -c.quantity,
          referenceType: "SALE",
          referenceId: invoice.id,
          userId,
          allowNegative: allowNegativeStock,
          createdAt,
        });
      }

      // Payments: record applied (non-credit) amounts; reduce a cash tender by change.
      let remainingChange = changeDue;
      for (const p of nonCredit) {
        let applied = toNum(p.amount);
        if (p.method === "CASH" && remainingChange > 0) {
          const reduce = Math.min(remainingChange, applied);
          applied -= reduce;
          remainingChange -= reduce;
        }
        if (cents(applied) === 0) continue;
        const drawerType = METHOD_TO_TREASURY_TYPE[p.method];
        let drawerId = p.treasuryAccountId ?? null;
        if (!drawerId) {
        // Look up the cashier's own account for this payment type
        drawerId = await resolveTreasuryAccount(tx as any, storeId, drawerType, userId);
        if (!drawerId) throw new Error("TREASURY_ACCOUNT_NOT_FOUND");
        }
        drawerId = await resolveBackdatedTreasuryAccount(tx, storeId, drawerId, createdAt, req.auth!.permissions);
        await tx.insert(invoicePaymentsTable).values({
          storeId,
          invoiceId: invoice.id,
          method: p.method,
          treasuryAccountId: drawerId,
          amount: money(applied),
          ...(createdAt ? { createdAt } : {}),
        });
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawerId,
          direction: "IN",
          amount: applied,
          referenceType: "SALE",
          referenceId: invoice.id,
          description: `بيع فاتورة ${invoiceNumber}`,
          userId,
          createdAt,
        });
      }

      // Credit portion → customer ledger + AR.
      if (creditAmount > 0 && customer) {
        await tx.insert(invoicePaymentsTable).values({
          storeId,
          invoiceId: invoice.id,
          method: "CREDIT",
          amount: money(creditAmount),
          ...(createdAt ? { createdAt } : {}),
        });
        const newBalance = toNum(customer.currentBalance) + creditAmount;
        await tx.insert(customerTransactionsTable).values({
          storeId,
          customerId: customer.id,
          type: "INVOICE",
          debit: money(creditAmount),
          balanceAfter: money(newBalance),
          referenceType: "SALE",
          referenceId: invoice.id,
          description: `فاتورة ${invoiceNumber}`,
          createdBy: userId,
          ...(createdAt ? { createdAt } : {}),
        });
        await tx
          .update(customersTable)
          .set({ currentBalance: money(newBalance) })
          .where(eq(customersTable.id, customer.id));
      }

      // Accounting: revenue recognition + COGS.
      // Build the debit side from applied non-credit payments (per drawer asset
      // account) plus Accounts Receivable for the credit portion.
      const debitByCode = new Map<string, number>();
      let applyChange = changeDue;
      for (const p of nonCredit) {
        let applied = toNum(p.amount);
        if (p.method === "CASH" && applyChange > 0) {
          const reduce = Math.min(applyChange, applied);
          applied -= reduce;
          applyChange -= reduce;
        }
        if (cents(applied) === 0) continue;
        const code = TREASURY_TYPE_TO_ACCOUNT_CODE[METHOD_TO_TREASURY_TYPE[p.method]];
        debitByCode.set(code, (debitByCode.get(code) ?? 0) + applied);
      }
      if (creditAmount > 0) {
        debitByCode.set("1100", (debitByCode.get("1100") ?? 0) + creditAmount);
      }
      const saleLines = [
        ...[...debitByCode.entries()].map(([code, amount]) => ({ code, debit: amount })),
        { code: "4000", credit: totalAmount },
      ];
      await postJournalEntry(tx, {
        storeId,
        userId,
        description: `إيراد مبيعات فاتورة ${invoiceNumber}`,
        referenceType: "SALE",
        referenceId: invoice.id,
        entryDate: createdAt,
        lines: saleLines,
      });
      if (cents(totalCost) > 0) {
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `تكلفة بضاعة مباعة ${invoiceNumber}`,
          referenceType: "SALE_COGS",
          referenceId: invoice.id,
          entryDate: createdAt,
          lines: [
            { code: "5000", debit: totalCost },
            { code: "1200", credit: totalCost },
          ],
        });
      }

      return invoice.id;
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "sale.created",
      entityType: "invoice",
      entityId: invoiceId,
      newValue: { items: items.length, total: parsed.data },
      ipAddress: clientIp(req),
    });

    const detail = await loadInvoiceDetail(invoiceId, storeId);
    res.status(201).json(detail);
  } catch (err) {
    if (err instanceof Error && handleSaleError(err, res)) return;
    console.error("[CHECKOUT ERROR]", err);
    throw err;
  }
});

function handleSaleError(err: Error, res: import("express").Response): boolean {
  const map: Record<string, [number, string]> = {
    UNAUTHORIZED_MAIN_SAFE: [403, "ليس لديك صلاحية لاستخدام الخزينة الرئيسية (أو لعمليات بأثر رجعي)"],
    WAREHOUSE_NOT_FOUND: [404, "المخزن غير موجود"],
    VARIANT_NOT_FOUND: [404, "أحد المنتجات غير موجود"],
    CUSTOMER_NOT_FOUND: [404, "العميل غير موجود"],
    TREASURY_ACCOUNT_NOT_FOUND: [404, "حساب الخزينة غير موجود"],
    INSUFFICIENT_STOCK: [400, "الكمية غير كافية في المخزن"],
    INSUFFICIENT_PAYMENT: [400, "المبلغ المدفوع أقل من إجمالي الفاتورة"],
    CHANGE_REQUIRES_CASH: [400, "الفكة تتطلب دفعة نقدية"],
    NO_CREDIT_ALLOWED: [400, "هذا العميل لا يسمح له بالشراء الآجل"],
    CREDIT_LIMIT_EXCEEDED: [400, "تجاوز الحد الائتماني للعميل"],
    NEGATIVE_TOTAL: [400, "إجمالي الفاتورة غير صالح"],
    INSUFFICIENT_TREASURY: [400, "رصيد الخزينة غير كافٍ"],
  };
  const hit = map[err.message];
  if (hit) {
    res.status(hit[0]).json({ error: hit[1] });
    return true;
  }
  return false;
}

// ===========================================================================
// SALES RETURNS
// ===========================================================================

router.get("/sales/returns", requireAuth, requirePermission("sales.return"), async (req, res) => {
  const parsed = ListSalesReturnsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "معاملات غير صالحة" });
    return;
  }
  const { page, pageSize, invoiceId } = parsed.data;
  const storeId = req.auth!.storeId;

  const conditions = [eq(salesReturnsTable.storeId, storeId)];
  if (invoiceId) conditions.push(eq(salesReturnsTable.invoiceId, invoiceId));
  const where = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(salesReturnsTable)
    .where(where);

  const rows = await db
    .select({
      id: salesReturnsTable.id,
      returnNumber: salesReturnsTable.returnNumber,
      invoiceId: salesReturnsTable.invoiceId,
      invoiceNumber: invoicesTable.invoiceNumber,
      warehouseId: salesReturnsTable.warehouseId,
      totalAmount: salesReturnsTable.totalAmount,
      totalCost: salesReturnsTable.totalCost,
      refundMethod: salesReturnsTable.refundMethod,
      reason: salesReturnsTable.reason,
      userName: usersTable.fullName,
      createdAt: salesReturnsTable.createdAt,
    })
    .from(salesReturnsTable)
    .leftJoin(invoicesTable, eq(salesReturnsTable.invoiceId, invoicesTable.id))
    .leftJoin(usersTable, eq(salesReturnsTable.createdBy, usersTable.id))
    .where(where)
    .orderBy(desc(salesReturnsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total: count,
    page,
    pageSize,
  });
});

async function loadReturnDetail(returnId: string, storeId: string) {
  const [ret] = await db
    .select({
      id: salesReturnsTable.id,
      returnNumber: salesReturnsTable.returnNumber,
      invoiceId: salesReturnsTable.invoiceId,
      invoiceNumber: invoicesTable.invoiceNumber,
      warehouseId: salesReturnsTable.warehouseId,
      totalAmount: salesReturnsTable.totalAmount,
      totalCost: salesReturnsTable.totalCost,
      refundMethod: salesReturnsTable.refundMethod,
      reason: salesReturnsTable.reason,
      userName: usersTable.fullName,
      createdAt: salesReturnsTable.createdAt,
    })
    .from(salesReturnsTable)
    .leftJoin(invoicesTable, eq(salesReturnsTable.invoiceId, invoicesTable.id))
    .leftJoin(usersTable, eq(salesReturnsTable.createdBy, usersTable.id))
    .where(and(eq(salesReturnsTable.id, returnId), eq(salesReturnsTable.storeId, storeId)))
    .limit(1);
  if (!ret) return null;

  const items = await db
    .select({
      id: salesReturnItemsTable.id,
      variantId: salesReturnItemsTable.variantId,
      sku: productVariantsTable.sku,
      productName: productsTable.name,
      quantity: salesReturnItemsTable.quantity,
      unitPrice: salesReturnItemsTable.unitPrice,
      lineTotal: salesReturnItemsTable.lineTotal,
    })
    .from(salesReturnItemsTable)
    .leftJoin(productVariantsTable, eq(salesReturnItemsTable.variantId, productVariantsTable.id))
    .leftJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
    .where(eq(salesReturnItemsTable.returnId, returnId));

  return { ...ret, createdAt: ret.createdAt.toISOString(), items };
}

router.get(
  "/sales/returns/:id",
  requireAuth,
  requirePermission("sales.return"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const detail = await loadReturnDetail(String(req.params["id"]), storeId);
    if (!detail) {
      res.status(404).json({ error: "المرتجع غير موجود" });
      return;
    }
    res.json(detail);
  },
);

router.post("/sales/returns", requireAuth, requirePermission("sales.return"), async (req, res) => {
  const parsed = CreateSalesReturnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { invoiceId, refundMethod, treasuryAccountId, reason, items } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  if (items.length === 0) {
    res.status(400).json({ error: "لا توجد أصناف للإرجاع" });
    return;
  }

  await ensureStoreFinancials(db, storeId);

  try {
    const returnId = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select({
          id: invoicesTable.id,
          warehouseId: invoicesTable.warehouseId,
          customerId: invoicesTable.customerId,
          invoiceNumber: invoicesTable.invoiceNumber,
        })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.storeId, storeId)))
        .limit(1);
      if (!invoice) throw new Error("INVOICE_NOT_FOUND");

      const [settings] = await tx
        .select({ allowNegativeTreasury: storeSettingsTable.allowNegativeTreasury })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.storeId, storeId))
        .limit(1);
      const allowNegativeTreasury = settings?.allowNegativeTreasury ?? false;

      const invItems = await tx
        .select({
          id: invoiceItemsTable.id,
          variantId: invoiceItemsTable.variantId,
          quantity: invoiceItemsTable.quantity,
          unitPrice: invoiceItemsTable.unitPrice,
          unitCost: invoiceItemsTable.unitCost,
          returnedQuantity: invoiceItemsTable.returnedQuantity,
        })
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.invoiceId, invoiceId));
      const itemById = new Map(invItems.map((i) => [i.id, i]));

      let totalAmount = 0;
      let totalCost = 0;
      const computed = items.map((r) => {
        const src = itemById.get(r.invoiceItemId);
        if (!src) throw new Error("INVOICE_ITEM_NOT_FOUND");
        if (!Number.isInteger(r.quantity) || r.quantity <= 0) throw new Error("BAD_QUANTITY");
        const remaining = src.quantity - src.returnedQuantity;
        if (r.quantity > remaining) throw new Error("RETURN_EXCEEDS_SOLD");
        const lineTotal = r.quantity * toNum(src.unitPrice);
        const lineCost = r.quantity * toNum(src.unitCost);
        totalAmount += lineTotal;
        totalCost += lineCost;
        return { src, quantity: r.quantity, unitPrice: toNum(src.unitPrice), lineTotal, lineCost };
      });

      const returnNumber = await nextDocumentNumber(tx, storeId, "SALES_RETURN");

      // Resolve refund drawer when refunding to treasury.
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
          // Look up the cashier's own account for this refund type
          drawerId = await resolveTreasuryAccount(tx as any, storeId, drawerType, userId);
          drawerCode = TREASURY_TYPE_TO_ACCOUNT_CODE[drawerType];
        }
      }

      const [ret] = await tx
        .insert(salesReturnsTable)
        .values({
          storeId,
          returnNumber,
          invoiceId,
          warehouseId: invoice.warehouseId,
          totalAmount: money(totalAmount),
          totalCost: money(totalCost),
          refundMethod,
          treasuryAccountId: drawerId,
          reason: reason ?? null,
          createdBy: userId,
        })
        .returning({ id: salesReturnsTable.id });

      for (const c of computed) {
        await tx.insert(salesReturnItemsTable).values({
          storeId,
          returnId: ret.id,
          invoiceItemId: c.src.id,
          variantId: c.src.variantId,
          quantity: c.quantity,
          unitPrice: money(c.unitPrice),
          unitCost: money(toNum(c.src.unitCost)),
          lineTotal: money(c.lineTotal),
        });
        await tx
          .update(invoiceItemsTable)
          .set({ returnedQuantity: c.src.returnedQuantity + c.quantity })
          .where(eq(invoiceItemsTable.id, c.src.id));
        await postInventoryMovement(tx, {
          storeId,
          variantId: c.src.variantId,
          warehouseId: invoice.warehouseId,
          type: "SALE_RETURN",
          quantityChange: c.quantity,
          referenceType: "SALES_RETURN",
          referenceId: ret.id,
          userId,
        });
      }

      // Update invoice return status.
      const refreshed = await tx
        .select({ quantity: invoiceItemsTable.quantity, returnedQuantity: invoiceItemsTable.returnedQuantity })
        .from(invoiceItemsTable)
        .where(eq(invoiceItemsTable.invoiceId, invoiceId));
      const fullyReturned = refreshed.every((i) => i.returnedQuantity >= i.quantity);
      const anyReturned = refreshed.some((i) => i.returnedQuantity > 0);
      await tx
        .update(invoicesTable)
        .set({ returnStatus: fullyReturned ? "FULL" : anyReturned ? "PARTIAL" : "NONE" })
        .where(eq(invoicesTable.id, invoiceId));

      // Refund: treasury OUT or reduce customer debt.
      if (refundMethod === "CREDIT") {
        if (!invoice.customerId) throw new Error("REFUND_CREDIT_REQUIRES_CUSTOMER");
        const [c] = await tx
          .select({ id: customersTable.id, currentBalance: customersTable.currentBalance })
          .from(customersTable)
          .limit(1);
        if (!c) throw new Error("CUSTOMER_NOT_FOUND");
        const newBalance = toNum(c.currentBalance) - totalAmount;
        await tx.insert(customerTransactionsTable).values({
          storeId,
          customerId: c.id,
          type: "RETURN",
          credit: money(totalAmount),
          balanceAfter: money(newBalance),
          referenceType: "SALES_RETURN",
          referenceId: ret.id,
          description: `مرتجع ${returnNumber}`,
          createdBy: userId,
        });
        await tx
          .update(customersTable)
          .set({ currentBalance: money(newBalance) })
          .where(eq(customersTable.id, c.id));
      } else if (drawerId) {
        await postTreasuryTransaction(tx, {
          storeId,
          treasuryAccountId: drawerId,
          direction: "OUT",
          amount: totalAmount,
          referenceType: "SALES_RETURN",
          referenceId: ret.id,
          description: `مرتجع ${returnNumber}`,
          userId,
          allowNegative: allowNegativeTreasury,
        });
      }

      // Accounting reversal: contra-revenue + restore inventory/COGS.
      if (cents(totalAmount) > 0) {
        const creditCode = refundMethod === "CREDIT" ? "1100" : drawerCode!;
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `مردودات مبيعات ${returnNumber}`,
          referenceType: "SALES_RETURN",
          referenceId: ret.id,
          lines: [
            { code: "4100", debit: totalAmount },
            { code: creditCode, credit: totalAmount },
          ],
        });
      }
      if (cents(totalCost) > 0) {
        await postJournalEntry(tx, {
          storeId,
          userId,
          description: `عكس تكلفة مرتجع ${returnNumber}`,
          referenceType: "SALES_RETURN_COGS",
          referenceId: ret.id,
          lines: [
            { code: "1200", debit: totalCost },
            { code: "5000", credit: totalCost },
          ],
        });
      }

      return ret.id;
    });

    await writeAuditLog({
      storeId,
      userId,
      action: "sale.returned",
      entityType: "sales_return",
      entityId: returnId,
      newValue: { invoiceId, items: items.length },
      ipAddress: clientIp(req),
    });

    const detail = await loadReturnDetail(returnId, storeId);
    res.status(201).json(detail);
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, string]> = {
        INVOICE_NOT_FOUND: [404, "الفاتورة غير موجودة"],
        INVOICE_ITEM_NOT_FOUND: [404, "أحد الأصناف غير موجود في الفاتورة"],
        BAD_QUANTITY: [400, "كمية غير صالحة"],
        RETURN_EXCEEDS_SOLD: [400, "الكمية المرتجعة أكبر من المباعة"],
        TREASURY_ACCOUNT_NOT_FOUND: [404, "حساب الخزينة غير موجود"],
        REFUND_CREDIT_REQUIRES_CUSTOMER: [400, "الاسترداد للحساب يتطلب عميلاً على الفاتورة"],
        CUSTOMER_NOT_FOUND: [404, "العميل غير موجود"],
        INSUFFICIENT_TREASURY: [400, "رصيد الخزينة غير كافٍ للاسترداد"],
      };
      const hit = map[err.message];
      if (hit) {
        res.status(hit[0]).json({ error: hit[1] });
        return;
      }
    }
    throw err;
  }
});

// ===========================================================================
// SUSPENDED ORDERS
// ===========================================================================

router.get("/suspended-orders", requireAuth, requirePermission("sales.create"), async (req, res) => {
  const storeId = req.auth!.storeId;
  const rows = await db
    .select({
      id: suspendedOrdersTable.id,
      label: suspendedOrdersTable.label,
      customerId: suspendedOrdersTable.customerId,
      customerName: customersTable.name,
      cart: suspendedOrdersTable.cart,
      itemCount: suspendedOrdersTable.itemCount,
      totalAmount: suspendedOrdersTable.totalAmount,
      userName: usersTable.fullName,
      createdAt: suspendedOrdersTable.createdAt,
    })
    .from(suspendedOrdersTable)
    .leftJoin(customersTable, eq(suspendedOrdersTable.customerId, customersTable.id))
    .leftJoin(usersTable, eq(suspendedOrdersTable.createdBy, usersTable.id))
    .where(eq(suspendedOrdersTable.storeId, storeId))
    .orderBy(desc(suspendedOrdersTable.createdAt));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/suspended-orders", requireAuth, requirePermission("sales.create"), async (req, res) => {
  const parsed = CreateSuspendedOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
    return;
  }
  const { label, customerId, cart, itemCount, totalAmount } = parsed.data;
  const storeId = req.auth!.storeId;
  const userId = req.auth!.userId;

  const [created] = await db
    .insert(suspendedOrdersTable)
    .values({
      storeId,
      label: label ?? null,
      customerId: customerId ?? null,
      cart: cart as object,
      itemCount: itemCount ?? 0,
      totalAmount: money(toNum(totalAmount ?? 0)),
      createdBy: userId,
    })
    .returning({
      id: suspendedOrdersTable.id,
      label: suspendedOrdersTable.label,
      customerId: suspendedOrdersTable.customerId,
      cart: suspendedOrdersTable.cart,
      itemCount: suspendedOrdersTable.itemCount,
      totalAmount: suspendedOrdersTable.totalAmount,
      createdAt: suspendedOrdersTable.createdAt,
    });

  res.status(201).json({ ...created, customerName: null, userName: null, createdAt: created.createdAt.toISOString() });
});

router.delete(
  "/suspended-orders/:id",
  requireAuth,
  requirePermission("sales.create"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const [existing] = await db
      .select({ id: suspendedOrdersTable.id })
      .from(suspendedOrdersTable)
      .where(
        and(
          eq(suspendedOrdersTable.id, String(req.params["id"])),
          eq(suspendedOrdersTable.storeId, storeId),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    await db.delete(suspendedOrdersTable).where(eq(suspendedOrdersTable.id, existing.id));
    res.status(204).end();
  },
);

// ── PATCH /sales/invoices/:id — notes-only edit ──────────────────────────────────

router.patch(
  "/sales/invoices/:id",
  requireAuth,
  requirePermission("sales.delete"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const id = String(req.params["id"]);

    const body = UpdateInvoiceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "بيانات غير صالحة", details: body.error.flatten() });
      return;
    }

    const [inv] = await db
      .select({ id: invoicesTable.id })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.storeId, storeId)))
      .limit(1);

    if (!inv) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }

    await db
      .update(invoicesTable)
      .set({ notes: body.data.notes })
      .where(eq(invoicesTable.id, id));

    await writeAuditLog({
      storeId,
      userId,
      action: "invoice.edit",
      entityType: "invoice",
      entityId: id,
      ipAddress: req.ip ?? null,
    });

    res.status(200).json({ id });
  },
);

export default router;
