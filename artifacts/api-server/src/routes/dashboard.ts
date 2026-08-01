import { Router, type IRouter } from "express";
import { requireAuth, requirePermission } from "../middleware/auth";
import { AnalyticsService } from "../lib/analytics-service";
import { getShiftStartHour, computeShiftStart } from "../lib/shift";
import { hasPermission } from "@workspace/shared";
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

function daysAgo(n: number, shiftStart: Date): Date {
  const d = new Date(shiftStart);
  d.setDate(d.getDate() - n);
  return d;
}

router.get(
  "/dashboard/kpis",
  requireAuth,
  requirePermission("dashboard.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;

    // Use the store's configured shift hour (replaces hardcoded 11)
    const shiftHour = await getShiftStartHour(storeId);
    const today = computeShiftStart(shiftHour);

    const salesAgg = await AnalyticsService.getSalesKPIs(storeId, today, undefined, shiftHour);
    const returnAgg = await AnalyticsService.getSalesReturnsKPIs(storeId, today, undefined, shiftHour);
    const purchAgg = await AnalyticsService.getPurchasesKPIs(storeId, today, undefined, shiftHour);
    const purchRetAgg = await AnalyticsService.getPurchaseReturnsKPIs(storeId, today, undefined, shiftHour);
    const expAgg = await AnalyticsService.getExpensesKPIs(storeId, today, undefined, shiftHour);
    const customerDebts = await AnalyticsService.getCustomerDebts(storeId);
    const supplierDebts = await AnalyticsService.getSupplierDebts(storeId);

    // --- Treasury KPIs (role-aware) ---
    let treasuryBalance: number | null = null;
    let mainSafeBalance: number | null = null;
    let cashierSubTreasury: number | null = null;

    if (hasPermission(perms, "treasury.view_all") || hasPermission(perms, "*")) {
      // Manager/Accountant: total of ALL accounts
      treasuryBalance = await AnalyticsService.getTreasuryBalance(storeId);
    }
    if (hasPermission(perms, "treasury.main_safe") || hasPermission(perms, "*")) {
      mainSafeBalance = await AnalyticsService.getMainSafeBalance(storeId);
    }
    if (hasPermission(perms, "treasury.view") || hasPermission(perms, "*")) {
      // Cashier: sum of their own 4 accounts (actual balance, not net flow)
      cashierSubTreasury = await AnalyticsService.getCashierSubTreasuryBalance(storeId, userId);
    }

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
      // Role-aware treasury KPIs
      treasuryBalance,                  // null for cashiers (no treasury.view_all)
      mainSafeBalance,                   // null without treasury.main_safe permission
      cashierSubTreasury,               // sum of the logged-in cashier's own 4 accounts
      // Legacy alias for backward compat with frontend
      cashDrawerBalance: cashierSubTreasury,
      lowStockCount: lowStockRows.length,
      customerDebts: customerDebts,
      supplierDebts: supplierDebts,
      activeAssociationsCount: Number(activeAssocRows[0]?.count ?? 0),
      totalAssociationsWithdrawn: assocWithdrawn,
      totalAssociationsReturned: assocReturned,
      totalAssociationsBalance: assocWithdrawn - assocReturned,
      // Metadata for frontend to understand which KPIs are available
      shiftStartHour: shiftHour,
      shiftStartTime: today.toISOString(),
    });
  },
);

router.get(
  "/dashboard/charts",
  requireAuth,
  requirePermission("dashboard.view"),
  async (req, res) => {
    const storeId = req.auth!.storeId;
    const shiftHour = await getShiftStartHour(storeId);
    const shiftStart = computeShiftStart(shiftHour);

    // Last 30 operational days from now
    const last30 = new Date(shiftStart);
    last30.setDate(last30.getDate() - 29);

    const last12mo = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const dailySales = await AnalyticsService.getDailySales(storeId, last30, shiftHour);
    const monthlyRevenue = await AnalyticsService.getMonthlyRevenue(storeId, last12mo, shiftHour);
    const cashFlow = await AnalyticsService.getCashFlowSimple(storeId, last30);
    const bestSellingProducts = await AnalyticsService.getBestSellingProducts(storeId);
    const salesByPaymentMethod = await AnalyticsService.getSalesByPaymentMethod(storeId);
    const salesByCategory = await AnalyticsService.getSalesByCategory(storeId);

    res.json({
      dailySales,
      monthlyRevenue,
      cashFlow,
      bestSellingProducts,
      salesByPaymentMethod,
      categoryPerformance: salesByCategory,
    });
  },
);

export default router;
