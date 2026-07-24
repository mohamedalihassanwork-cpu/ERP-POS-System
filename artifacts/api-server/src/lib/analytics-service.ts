import { and, eq, gte, lte, sql, SQL } from "drizzle-orm";
import {
  db,
  invoicesTable,
  invoiceItemsTable,
  invoicePaymentsTable,
  purchaseInvoicesTable,
  expensesTable,
  treasuryAccountsTable,
  treasuryTransactionsTable,
  customersTable,
  suppliersTable,
  inventoryItemsTable,
  productsTable,
  productVariantsTable,
  categoriesTable,
  salesReturnsTable,
  purchaseReturnsTable,
  salaryRecordsTable
} from "@workspace/db";
function endOfDay(d: Date | string): Date {
  const dt = new Date(d);
  const str = dt.toISOString().slice(0, 10);
  const e = new Date(`${str}T11:00:00`);
  e.setDate(e.getDate() + 1);
  e.setMilliseconds(e.getMilliseconds() - 1);
  return e;
}
/**
 * Shared Business Logic for Analytics (Dashboard & Reports)
 * 
 * Centralizes calculations for KPIs, Charts, and Summaries ensuring
 * 100% consistency across the ERP. Uses SQLite-compatible SQL aggregation.
 */

export class AnalyticsService {
  
  // --- Dashboard KPIs ---
  
  static async getSalesKPIs(storeId: string, fromDate?: Date, toDate?: Date) {
    const conditions: SQL[] = [eq(invoicesTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(invoicesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(invoicesTable.createdAt, endOfDay(toDate)));

    const [salesAgg] = await db
      .select({
        revenue: sql<number>`CAST(coalesce(sum(${invoicesTable.totalAmount}), 0) AS REAL)`,
        cost: sql<number>`CAST(coalesce(sum(${invoicesTable.totalCost}), 0) AS REAL)`,
      })
      .from(invoicesTable)
      .where(and(...conditions));

    return salesAgg || { revenue: 0, cost: 0 };
  }

  static async getPurchasesKPIs(storeId: string, fromDate?: Date, toDate?: Date) {
    const conditions: SQL[] = [eq(purchaseInvoicesTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(purchaseInvoicesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(purchaseInvoicesTable.createdAt, endOfDay(toDate)));

    const [purchAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${purchaseInvoicesTable.totalAmount}), 0) AS REAL)`,
      })
      .from(purchaseInvoicesTable)
      .where(and(...conditions));

    return purchAgg || { total: 0 };
  }

  static async getPurchaseReturnsKPIs(storeId: string, fromDate?: Date, toDate?: Date) {
    const conditions: SQL[] = [eq(purchaseReturnsTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(purchaseReturnsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(purchaseReturnsTable.createdAt, endOfDay(toDate)));

    const [retAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${purchaseReturnsTable.totalAmount}), 0) AS REAL)`,
      })
      .from(purchaseReturnsTable)
      .where(and(...conditions));

    return retAgg || { total: 0 };
  }

  static async getExpensesKPIs(storeId: string, fromDate?: Date, toDate?: Date) {
    const conditions: SQL[] = [eq(expensesTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(expensesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(expensesTable.createdAt, endOfDay(toDate)));

    const [expAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${expensesTable.amount}), 0) AS REAL)`,
      })
      .from(expensesTable)
      .where(and(...conditions));

    return expAgg || { total: 0 };
  }

  static async getTreasuryBalance(storeId: string) {
    const [treasuryAgg] = await db
      .select({
        balance: sql<number>`CAST(coalesce(sum(${treasuryAccountsTable.balance}), 0) AS REAL)`,
      })
      .from(treasuryAccountsTable)
      .where(eq(treasuryAccountsTable.storeId, storeId));

    return treasuryAgg?.balance || 0;
  }

  static async getCashDrawerBalance(storeId: string, fromDate?: Date) {
    if (!fromDate) {
      const [drawerAgg] = await db
        .select({
          balance: sql<number>`CAST(coalesce(sum(${treasuryAccountsTable.balance}), 0) AS REAL)`,
        })
        .from(treasuryAccountsTable)
        .where(and(eq(treasuryAccountsTable.storeId, storeId), eq(treasuryAccountsTable.type, "CASH")));

      return drawerAgg?.balance || 0;
    }

    const [txAgg] = await db
      .select({
        net: sql<number>`CAST(coalesce(sum(case when ${treasuryTransactionsTable.direction} = 'IN' then ${treasuryTransactionsTable.amount} else -${treasuryTransactionsTable.amount} end), 0) AS REAL)`
      })
      .from(treasuryTransactionsTable)
      .innerJoin(treasuryAccountsTable, eq(treasuryAccountsTable.id, treasuryTransactionsTable.treasuryAccountId))
      .where(and(
        eq(treasuryAccountsTable.storeId, storeId),
        eq(treasuryAccountsTable.type, "CASH"),
        gte(treasuryTransactionsTable.createdAt, fromDate)
      ));

    return txAgg?.net || 0;
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

  static async getSalesReturnsKPIs(storeId: string, fromDate?: Date, toDate?: Date) {
    const conditions: SQL[] = [eq(salesReturnsTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(invoicesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(invoicesTable.createdAt, endOfDay(toDate)));

    const [retAgg] = await db
      .select({
        total: sql<number>`CAST(coalesce(sum(${salesReturnsTable.totalAmount}), 0) AS REAL)`,
        cost: sql<number>`CAST(coalesce(sum(${salesReturnsTable.totalCost}), 0) AS REAL)`,
      })
      .from(salesReturnsTable)
      .innerJoin(invoicesTable, eq(invoicesTable.id, salesReturnsTable.invoiceId))
      .where(and(...conditions));
    return retAgg || { total: 0, cost: 0 };
  }

  static async getSalariesKPIs(storeId: string, fromDate?: Date, toDate?: Date) {
    const conditions: SQL[] = [eq(salaryRecordsTable.storeId, storeId)];
    if (fromDate) conditions.push(gte(salaryRecordsTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(salaryRecordsTable.createdAt, endOfDay(toDate)));

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
  
  static async getDailySales(storeId: string, fromDate: Date) {
    // SQLite: strftime('%Y-%m-%d', datetime((created_at / 1000) - 39600, 'unixepoch'))
    const dayExpr = sql<string>`strftime('%Y-%m-%d', datetime((${invoicesTable.createdAt} / 1000) - 39600, 'unixepoch'))`;
    const sales = await db
      .select({
        label: dayExpr,
        value: sql<number>`CAST(coalesce(sum(${invoicesTable.totalAmount}), 0) AS REAL)`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.storeId, storeId), gte(invoicesTable.createdAt, fromDate)))
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    const retDayExpr = sql<string>`strftime('%Y-%m-%d', datetime((${salesReturnsTable.createdAt} / 1000) - 39600, 'unixepoch'))`;
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

  static async getMonthlyRevenue(storeId: string, fromDate: Date) {
    const monthExpr = sql<string>`strftime('%Y-%m', datetime((${invoicesTable.createdAt} / 1000) - 39600, 'unixepoch'))`;
    const sales = await db
      .select({
        label: monthExpr,
        value: sql<number>`CAST(coalesce(sum(${invoicesTable.totalAmount}), 0) AS REAL)`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.storeId, storeId), gte(invoicesTable.createdAt, fromDate)))
      .groupBy(monthExpr)
      .orderBy(monthExpr);

    const retMonthExpr = sql<string>`strftime('%Y-%m', datetime((${salesReturnsTable.createdAt} / 1000) - 39600, 'unixepoch'))`;
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

  static async getCashFlow(storeId: string, fromDate: Date) {
    const cfDayExpr = sql<string>`strftime('%Y-%m-%d', datetime((${treasuryTransactionsTable.createdAt} / 1000) - 39600, 'unixepoch'))`;
    return await db
      .select({
        label: cfDayExpr,
        inflow: sql<number>`CAST(coalesce(sum(case when ${treasuryTransactionsTable.direction} = 'IN' then ${treasuryTransactionsTable.amount} else 0 end), 0) AS REAL)`,
        outflow: sql<number>`CAST(coalesce(sum(case when ${treasuryTransactionsTable.direction} = 'OUT' then ${treasuryTransactionsTable.amount} else 0 end), 0) AS REAL)`,
      })
      .from(treasuryTransactionsTable)
      .where(and(eq(treasuryTransactionsTable.storeId, storeId), gte(treasuryTransactionsTable.createdAt, fromDate)))
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
