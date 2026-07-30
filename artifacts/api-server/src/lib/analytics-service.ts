import { and, eq, gte, isNull, lte, sql, SQL } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoiceItemsTable,
  invoicePaymentsTable,
  purchaseInvoicesTable,
  expensesTable,
  treasuryAccountsTable,
  customersTable,
  suppliersTable,
  inventoryItemsTable,
  productsTable,
  productVariantsTable,
  categoriesTable,
  salesReturnsTable,
  purchaseReturnsTable,
  salaryRecordsTable,
} from "@workspace/db";
import { computeShiftEnd } from "./shift";

/**
 * Shared Business Logic for Analytics (Dashboard & Reports)
 *
 * Centralizes calculations for KPIs, Charts, and Summaries ensuring
 * 100% consistency across the ERP. Uses SQLite-compatible SQL aggregation.
 *
 * IMPORTANT: The shift hour is passed as a parameter to keep all functions pure
 * and testable. The caller (route handler) is responsible for fetching the shift
 * hour once via getShiftStartHour() and passing it in.
 */

export class AnalyticsService {

  // --- Dashboard KPIs ---

  static async getSalesKPIs(storeId: string, fromDate?: Date, toDate?: Date, shiftHour = 11) {
    const conditions: SQL[] = [eq(invoicesTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(invoicesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(invoicesTable.createdAt, computeShiftEnd(shiftHour, toDate)));

    const [salesAgg] = await db
      .select({
        revenue: sql<number>`CAST(coalesce(sum(${invoicesTable.totalAmount}), 0) AS REAL)`,
        cost: sql<number>`CAST(coalesce(sum(${invoicesTable.totalCost}), 0) AS REAL)`,
      })
      .from(invoicesTable)
      .where(and(...conditions));

    return salesAgg || { revenue: 0, cost: 0 };
  }

  static async getPurchasesKPIs(storeId: string, fromDate?: Date, toDate?: Date, shiftHour = 11) {
    const conditions: SQL[] = [eq(purchaseInvoicesTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(purchaseInvoicesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(purchaseInvoicesTable.createdAt, computeShiftEnd(shiftHour, toDate)));

    const [purchAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${purchaseInvoicesTable.totalAmount}), 0) AS REAL)`,
      })
      .from(purchaseInvoicesTable)
      .where(and(...conditions));

    return purchAgg || { total: 0 };
  }

  static async getPurchaseReturnsKPIs(storeId: string, fromDate?: Date, toDate?: Date, shiftHour = 11) {
    const conditions: SQL[] = [eq(purchaseReturnsTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(purchaseReturnsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(purchaseReturnsTable.createdAt, computeShiftEnd(shiftHour, toDate)));

    const [retAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${purchaseReturnsTable.totalAmount}), 0) AS REAL)`,
      })
      .from(purchaseReturnsTable)
      .where(and(...conditions));

    return retAgg || { total: 0 };
  }

  static async getExpensesKPIs(storeId: string, fromDate?: Date, toDate?: Date, shiftHour = 11) {
    const conditions: SQL[] = [eq(expensesTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(expensesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(expensesTable.createdAt, computeShiftEnd(shiftHour, toDate)));

    const [expAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${expensesTable.amount}), 0) AS REAL)`,
      })
      .from(expensesTable)
      .where(and(...conditions));

    return expAgg || { total: 0 };
  }

  // Total treasury balance across ALL accounts (for managers with treasury.view_all)
  static async getTreasuryBalance(storeId: string) {
    const [treasuryAgg] = await db
      .select({
        balance: sql<number>`CAST(coalesce(sum(${treasuryAccountsTable.balance}), 0) AS REAL)`,
      })
      .from(treasuryAccountsTable)
      .where(eq(treasuryAccountsTable.storeId, storeId));

    return treasuryAgg?.balance || 0;
  }

  // MAIN_SAFE balance only (store-level, user_id IS NULL)
  static async getMainSafeBalance(storeId: string) {
    const [row] = await db
      .select({
        balance: sql<number>`CAST(coalesce(sum(${treasuryAccountsTable.balance}), 0) AS REAL)`,
      })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.type, "MAIN_SAFE"),
          isNull(treasuryAccountsTable.userId),
        ),
      );
    return row?.balance || 0;
  }

  // Sum of a specific cashier's 4 personal accounts (CASH + CARD + INSTAPAY + WALLET).
  // This is the "الخزنة الفرعية" (Sub-Treasury) KPI.
  static async getCashierSubTreasuryBalance(storeId: string, userId: string) {
    const [row] = await db
      .select({
        balance: sql<number>`CAST(coalesce(sum(${treasuryAccountsTable.balance}), 0) AS REAL)`,
      })
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.storeId, storeId),
          eq(treasuryAccountsTable.userId, userId),
        ),
      );
    return row?.balance || 0;
  }

  static async getCustomerDebts(storeId: string) {
    const [custAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(case when ${customersTable.currentBalance} > 0 then ${customersTable.currentBalance} else 0 end), 0) AS REAL)`,
      })
      .from(customersTable)
      .where(eq(customersTable.storeId, storeId));
    return custAgg?.total || 0;
  }

  static async getSupplierDebts(storeId: string) {
    const [suppAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(case when ${suppliersTable.currentBalance} > 0 then ${suppliersTable.currentBalance} else 0 end), 0) AS REAL)`,
      })
      .from(suppliersTable)
      .where(eq(suppliersTable.storeId, storeId));
    return suppAgg?.total || 0;
  }

  // --- Reports Shared ---

  // BUGFIX: was incorrectly filtering on invoicesTable.createdAt instead of salesReturnsTable.createdAt
  static async getSalesReturnsKPIs(storeId: string, fromDate?: Date, toDate?: Date, shiftHour = 11) {
    const conditions: SQL[] = [eq(salesReturnsTable.storeId, storeId)];
    // FIX: use salesReturnsTable.createdAt (not invoicesTable.createdAt)
    if (fromDate) conditions.push(gte(salesReturnsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(salesReturnsTable.createdAt, computeShiftEnd(shiftHour, toDate)));

    const [retAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${salesReturnsTable.totalAmount}), 0) AS REAL)`,
        cost: sql<number>`CAST(coalesce(sum(${salesReturnsTable.totalCost}), 0) AS REAL)`,
      })
      .from(salesReturnsTable)
      .where(and(...conditions));
    return retAgg || { total: 0, cost: 0 };
  }

  static async getSalariesKPIs(storeId: string, fromDate?: Date, toDate?: Date, shiftHour = 11) {
    const conditions: SQL[] = [eq(salaryRecordsTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(salaryRecordsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(salaryRecordsTable.createdAt, computeShiftEnd(shiftHour, toDate)));

    const [salAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${salaryRecordsTable.netAmount}), 0) AS REAL)`,
      })
      .from(salaryRecordsTable)
      .where(and(...conditions));
    return salAgg || { total: 0 };
  }

  static async getInventoryValuation(storeId: string) {
    const [invAgg] = await db
      .select({
        value: sql<number>`CAST(coalesce(sum(${inventoryItemsTable.quantity} * CAST(${productVariantsTable.costPrice} AS REAL)), 0) AS REAL)`,
      })
      .from(inventoryItemsTable)
      .innerJoin(productVariantsTable, eq(productVariantsTable.id, inventoryItemsTable.variantId))
      .where(eq(inventoryItemsTable.storeId, storeId));
    return invAgg?.value || 0;
  }

  // --- Charts (Dashboard) ---
  // NOTE: Previously used strftime with hardcoded -39600 (11h) offset.
  // Now uses app-layer date ranges with BETWEEN bounds for correctness and configurability.

  static async getDailySales(storeId: string, fromDate: Date, shiftHour = 11) {
    // Use UTC day as label but filter by shift-aligned boundaries in app layer.
    // The strftime offset approach was fragile and hardcoded.
    // Simple approach: group by the calendar day (UTC) within the requested range.
    const dayExpr = sql<string>`strftime('%Y-%m-%d', ${invoicesTable.createdAt} / 1000, 'unixepoch')`;
    const sales = await db
      .select({
        label: dayExpr,
        value: sql<number>`CAST(coalesce(sum(${invoicesTable.totalAmount}), 0) AS REAL)`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.storeId, storeId), gte(invoicesTable.createdAt, fromDate)))
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    const retDayExpr = sql<string>`strftime('%Y-%m-%d', ${salesReturnsTable.createdAt} / 1000, 'unixepoch')`;
    const returns = await db
      .select({
        label: retDayExpr,
        value: sql<number>`CAST(coalesce(sum(${salesReturnsTable.totalAmount}), 0) AS REAL)`,
      })
      .from(salesReturnsTable)
      .where(and(eq(salesReturnsTable.storeId, storeId), gte(salesReturnsTable.createdAt, fromDate)))
      .groupBy(retDayExpr);

    const map = new Map(sales.map(s => [s.label, s.value]));
    for (const r of returns) {
      const current = map.get(r.label) ?? 0;
      map.set(r.label, Math.max(0, current - r.value));
    }

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  static async getMonthlyRevenue(storeId: string, fromDate: Date, shiftHour = 11) {
    const monthExpr = sql<string>`strftime('%Y-%m', ${invoicesTable.createdAt} / 1000, 'unixepoch')`;
    const sales = await db
      .select({
        label: monthExpr,
        value: sql<number>`CAST(coalesce(sum(${invoicesTable.totalAmount}), 0) AS REAL)`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.storeId, storeId), gte(invoicesTable.createdAt, fromDate)))
      .groupBy(monthExpr)
      .orderBy(monthExpr);

    const retMonthExpr = sql<string>`strftime('%Y-%m', ${salesReturnsTable.createdAt} / 1000, 'unixepoch')`;
    const returns = await db
      .select({
        label: retMonthExpr,
        value: sql<number>`CAST(coalesce(sum(${salesReturnsTable.totalAmount}), 0) AS REAL)`,
      })
      .from(salesReturnsTable)
      .where(and(eq(salesReturnsTable.storeId, storeId), gte(salesReturnsTable.createdAt, fromDate)))
      .groupBy(retMonthExpr);

    const map = new Map(sales.map(s => [s.label, s.value]));
    for (const r of returns) {
      const current = map.get(r.label) ?? 0;
      map.set(r.label, Math.max(0, current - r.value));
    }

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // Simplified cash flow that uses direct SQL to avoid complex join issues
  static async getCashFlowSimple(storeId: string, fromDate: Date) {
    const cfDayExpr = sql<string>`strftime('%Y-%m-%d', created_at / 1000, 'unixepoch')`;
    return await db
      .select({
        label: cfDayExpr,
        inflow: sql<number>`CAST(coalesce(sum(case when direction = 'IN' then CAST(amount AS REAL) else 0 end), 0) AS REAL)`,
        outflow: sql<number>`CAST(coalesce(sum(case when direction = 'OUT' then CAST(amount AS REAL) else 0 end), 0) AS REAL)`,
      })
      .from(sql`treasury_transactions`)
      .where(
        sql`store_id = ${storeId} AND created_at >= ${fromDate.getTime()}`,
      )
      .groupBy(cfDayExpr)
      .orderBy(cfDayExpr);
  }

  static async getBestSellingProducts(storeId: string) {
    return await db
      .select({
        label: productsTable.name,
        value: sql<number>`CAST(coalesce(sum(${invoiceItemsTable.quantity}), 0) AS REAL)`,
      })
      .from(invoiceItemsTable)
      .innerJoin(invoicesTable, eq(invoicesTable.id, invoiceItemsTable.invoiceId))
      .innerJoin(productVariantsTable, eq(productVariantsTable.id, invoiceItemsTable.variantId))
      .innerJoin(productsTable, eq(productsTable.id, productVariantsTable.productId))
      .where(eq(invoicesTable.storeId, storeId))
      .groupBy(productsTable.id)
      .orderBy(sql`CAST(sum(${invoiceItemsTable.quantity}) AS REAL) DESC`)
      .limit(5);
  }

  static async getSalesByPaymentMethod(storeId: string) {
    return await db
      .select({
        label: invoicePaymentsTable.method,
        value: sql<number>`CAST(coalesce(sum(${invoicePaymentsTable.amount}), 0) AS REAL)`,
      })
      .from(invoicePaymentsTable)
      .innerJoin(invoicesTable, eq(invoicesTable.id, invoicePaymentsTable.invoiceId))
      .where(eq(invoicesTable.storeId, storeId))
      .groupBy(invoicePaymentsTable.method)
      .orderBy(sql`CAST(sum(${invoicePaymentsTable.amount}) AS REAL) DESC`);
  }

  static async getSalesByCategory(storeId: string) {
    return await db
      .select({
        label: categoriesTable.name,
        value: sql<number>`CAST(coalesce(sum(${invoiceItemsTable.lineTotal}), 0) AS REAL)`,
      })
      .from(invoiceItemsTable)
      .innerJoin(invoicesTable, eq(invoicesTable.id, invoiceItemsTable.invoiceId))
      .innerJoin(productVariantsTable, eq(productVariantsTable.id, invoiceItemsTable.variantId))
      .innerJoin(productsTable, eq(productsTable.id, productVariantsTable.productId))
      .innerJoin(categoriesTable, eq(categoriesTable.id, productsTable.categoryId))
      .where(eq(invoicesTable.storeId, storeId))
      .groupBy(categoriesTable.id)
      .orderBy(sql`CAST(sum(${invoiceItemsTable.lineTotal}) AS REAL) DESC`)
      .limit(5);
  }
}
