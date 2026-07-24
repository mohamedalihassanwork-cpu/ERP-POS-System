import { Router, type IRouter } from "express";
import { requireAuth, requirePermission } from "../middleware/auth";
import { AnalyticsService } from "../lib/analytics-service";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  db,
  associationsTable,
  associationTransactionsTable,
  inventoryItemsTable,
  productsTable,
  productVariantsTable,
} from "@workspace/db";

const router: IRouter = Router();

function startOfToday(): Date {
  const d = new Date();
  if (d.getHours() < 11) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(11, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get(
  "/dashboard/kpis",
  requireAuth,
  requirePermission("dashboard.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const today = startOfToday();

    const salesAgg = await AnalyticsService.getSalesKPIs(storeId, today);
    const returnAgg = await AnalyticsService.getSalesReturnsKPIs(storeId, today);
    const purchAgg = await AnalyticsService.getPurchasesKPIs(storeId, today);
    const purchRetAgg = await AnalyticsService.getPurchaseReturnsKPIs(storeId, today);
    const expAgg = await AnalyticsService.getExpensesKPIs(storeId, today);
    const treasuryBalance = await AnalyticsService.getTreasuryBalance(storeId);
    const cashDrawerBalance = await AnalyticsService.getCashDrawerBalance(storeId, today);
    const customerDebts = await AnalyticsService.getCustomerDebts(storeId);
    const supplierDebts = await AnalyticsService.getSupplierDebts(storeId);

    // Low stock count: variants whose total stock is at or below the product's reorder point.
    const lowStockRows = await db
      .select({ variantId: inventoryItemsTable.variantId })
      .from(inventoryItemsTable)
      .innerJoin(productVariantsTable, eq(productVariantsTable.id, inventoryItemsTable.variantId))
      .innerJoin(productsTable, eq(productsTable.id, productVariantsTable.productId))
      .where(and(eq(inventoryItemsTable.storeId, storeId), gt(productsTable.reorderPoint, 0)))
      .groupBy(inventoryItemsTable.variantId, productsTable.reorderPoint)
      .having(sql`sum(${inventoryItemsTable.quantity}) <= ${productsTable.reorderPoint}`);

    // Association KPIs
    const activeAssocRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(associationsTable)
      .where(and(eq(associationsTable.storeId, storeId), eq(associationsTable.status, "ACTIVE")));

    const assocTotals = await db
      .select({
        type: associationTransactionsTable.type,
        total: sql<number>`CAST(coalesce(sum(cast(${associationTransactionsTable.amount} as REAL)), 0) AS REAL)`,
      })
      .from(associationTransactionsTable)
      .where(and(
        eq(associationTransactionsTable.storeId, storeId),
        eq(associationTransactionsTable.isReversed, false),
      ))
      .groupBy(associationTransactionsTable.type);

    let assocWithdrawn = 0, assocReturned = 0;
    for (const r of assocTotals) {
      if (r.type === "WITHDRAWAL") assocWithdrawn = Number(r.total);
      else assocReturned = Number(r.total);
    }

    const netSales = (salesAgg.revenue ?? 0) - (returnAgg.total ?? 0);
    const cogs = (salesAgg.cost ?? 0) - (returnAgg.cost ?? 0);
    const todayProfit = netSales - cogs;
    
    const netPurchases = (purchAgg.total ?? 0) - (purchRetAgg.total ?? 0);

    res.json({
      todaySales: netSales,
      todayProfit: todayProfit,
      todayPurchases: netPurchases,
      todayExpenses: expAgg.total,
      treasuryBalance: treasuryBalance,
      cashDrawerBalance: cashDrawerBalance,
      lowStockCount: lowStockRows.length,
      customerDebts: customerDebts,
      supplierDebts: supplierDebts,
      activeAssociationsCount: Number(activeAssocRows[0]?.count ?? 0),
      totalAssociationsWithdrawn: assocWithdrawn,
      totalAssociationsReturned: assocReturned,
      totalAssociationsBalance: assocWithdrawn - assocReturned,
    });
  },
);

router.get(
  "/dashboard/charts",
  requireAuth,
  requirePermission("dashboard.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const last30 = daysAgo(29);
    const last12mo = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const dailySales = await AnalyticsService.getDailySales(storeId, last30);
    const monthlyRevenue = await AnalyticsService.getMonthlyRevenue(storeId, last12mo);
    const cashFlow = await AnalyticsService.getCashFlow(storeId, last30);
    const bestSellingProducts = await AnalyticsService.getBestSellingProducts(storeId);
    const salesByPaymentMethod = await AnalyticsService.getSalesByPaymentMethod(storeId);
    const salesByCategory = await AnalyticsService.getSalesByCategory(storeId);

    res.json({
      dailySales,
      monthlyRevenue,
      cashFlow,
      bestSellingProducts,
      salesByPaymentMethod,
      salesByCategory,
    });
  },
);

export default router;
