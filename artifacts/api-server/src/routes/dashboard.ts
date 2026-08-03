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

    // ── Sales scope (strict 3-tier) ──────────────────────────────────────────
    // sales.view (or *)  → store-wide — pass no userId filter
    // sales.view_own     → own invoices only — pass userId
    // neither            → no access — use a sentinel that returns 0
    const canViewAllSales = hasPermission(perms, "sales.view");
    const canViewOwnSales = hasPermission(perms, "sales.view_own");
    const hasSalesAccess = canViewAllSales || canViewOwnSales;

    // salesScopeUserId:
    //   undefined → no userId filter (store-wide)
    //   string    → filter to that user's invoices
    //   null      → no sales access at all (queries are skipped / return 0)
    const salesScopeUserId: string | undefined | null =
      !hasSalesAccess ? null
      : canViewAllSales ? undefined
      : userId; // canViewOwnSales only

    // ── Other module access flags ─────────────────────────────────────────────
    const canViewPurchases = hasPermission(perms, "purchases.view");
    const canViewExpenses =
      hasPermission(perms, "finance.view") || hasPermission(perms, "expenses.create");
    const canViewCustomerDebts = hasPermission(perms, "customers.view");
    const canViewSupplierDebts = hasPermission(perms, "suppliers.view");
    const canViewAssociations =
      hasPermission(perms, "associations.view") ||
      hasPermission(perms, "associations.transactions");

    // ── Shift window ──────────────────────────────────────────────────────────
    const shiftHour = await getShiftStartHour(storeId);
    const today = computeShiftStart(shiftHour);

    // ── Sales KPIs ────────────────────────────────────────────────────────────
    let netSales = 0;
    let todayProfit = 0;
    if (salesScopeUserId !== null) {
      const salesAgg = await AnalyticsService.getSalesKPIs(storeId, today, undefined, shiftHour, salesScopeUserId);
      const returnAgg = await AnalyticsService.getSalesReturnsKPIs(storeId, today, undefined, shiftHour, salesScopeUserId);
      netSales = (salesAgg.revenue ?? 0) - (returnAgg.total ?? 0);
      const cogs = (salesAgg.cost ?? 0) - (returnAgg.cost ?? 0);
      todayProfit = netSales - cogs;
    }

    // ── Purchases KPIs ────────────────────────────────────────────────────────
    let netPurchases = 0;
    if (canViewPurchases) {
      const purchAgg = await AnalyticsService.getPurchasesKPIs(storeId, today, undefined, shiftHour);
      const purchRetAgg = await AnalyticsService.getPurchaseReturnsKPIs(storeId, today, undefined, shiftHour);
      netPurchases = (purchAgg.total ?? 0) - (purchRetAgg.total ?? 0);
    }

    // ── Expense KPIs ─────────────────────────────────────────────────────────
    let todayRegularExpenses = 0;
    let todayAssociationWithdrawals: number | null = null;
    if (canViewExpenses) {
      const expAgg = await AnalyticsService.getExpensesKPIs(storeId, today, undefined, shiftHour);
      todayRegularExpenses = expAgg.total ?? 0;
    }
    if (canViewAssociations) {
      todayAssociationWithdrawals = await AnalyticsService.getTodayAssociationWithdrawals(storeId, today);
    }
    const todayExpenses = todayRegularExpenses + (todayAssociationWithdrawals ?? 0);

    // ── Debt KPIs ─────────────────────────────────────────────────────────────
    const customerDebts = canViewCustomerDebts
      ? await AnalyticsService.getCustomerDebts(storeId)
      : 0;
    const supplierDebts = canViewSupplierDebts
      ? await AnalyticsService.getSupplierDebts(storeId)
      : 0;

    // ── Treasury KPIs (role-aware) ────────────────────────────────────────────
    let treasuryBalance: number | null = null;
    let mainSafeBalance: number | null = null;
    let cashierSubTreasury: number | null = null;

    if (hasPermission(perms, "treasury.view_all")) {
      treasuryBalance = await AnalyticsService.getTreasuryBalance(storeId);
    }
    if (hasPermission(perms, "treasury.main_safe")) {
      mainSafeBalance = await AnalyticsService.getMainSafeBalance(storeId);
    }
    if (hasPermission(perms, "treasury.view") || hasPermission(perms, "treasury.session")) {
      cashierSubTreasury = await AnalyticsService.getCashierSubTreasuryBalance(storeId, userId);
    }

    // ── Low stock (requires inventory.view) ──────────────────────────────────
    let lowStockCount = 0;
    if (hasPermission(perms, "inventory.view")) {
      const lowStockRows = await db
        .select({ variantId: inventoryItemsTable.variantId })
        .from(inventoryItemsTable)
        .innerJoin(productVariantsTable, eq(productVariantsTable.id, inventoryItemsTable.variantId))
        .innerJoin(productsTable, eq(productsTable.id, productVariantsTable.productId))
        .where(and(eq(inventoryItemsTable.storeId, storeId), gt(productsTable.reorderPoint, 0)))
        .groupBy(inventoryItemsTable.variantId, productsTable.reorderPoint)
        .having(sql`sum(${inventoryItemsTable.quantity}) <= ${productsTable.reorderPoint}`);
      lowStockCount = lowStockRows.length;
    }

    // ── Association KPIs ─────────────────────────────────────────────────────
    let activeAssociationsCount = 0;
    let totalAssociationsWithdrawn = 0;
    let totalAssociationsReturned = 0;
    if (canViewAssociations) {
      const activeAssocRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(associationsTable)
        .where(and(eq(associationsTable.storeId, storeId), eq(associationsTable.status, "ACTIVE")));
      activeAssociationsCount = Number(activeAssocRows[0]?.count ?? 0);

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

      for (const r of assocTotals) {
        if (r.type === "WITHDRAWAL") totalAssociationsWithdrawn = Number(r.total);
        else totalAssociationsReturned = Number(r.total);
      }
    }

    res.json({
      todaySales: netSales,
      todayProfit: todayProfit,
      todayPurchases: netPurchases,
      todayExpenses: todayExpenses,
      todayRegularExpenses: todayRegularExpenses,
      todayAssociationWithdrawals: todayAssociationWithdrawals,
      treasuryBalance,
      mainSafeBalance,
      cashierSubTreasury,
      cashDrawerBalance: cashierSubTreasury,
      lowStockCount,
      customerDebts,
      supplierDebts,
      activeAssociationsCount,
      totalAssociationsWithdrawn,
      totalAssociationsReturned,
      totalAssociationsBalance: totalAssociationsWithdrawn - totalAssociationsReturned,
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
    const userId = req.auth!.userId;
    const perms = req.auth!.permissions;
    const shiftHour = await getShiftStartHour(storeId);
    const shiftStart = computeShiftStart(shiftHour);

    // Strict 3-tier sales scope (same logic as KPIs)
    const canViewAllSales = hasPermission(perms, "sales.view");
    const canViewOwnSales = hasPermission(perms, "sales.view_own");
    const hasSalesAccess = canViewAllSales || canViewOwnSales;
    // null = no access (return empty arrays), undefined = store-wide, string = own only
    const salesScopeUserId: string | undefined | null =
      !hasSalesAccess ? null
      : canViewAllSales ? undefined
      : userId;

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

    const empty: { label: string; value: number }[] = [];

    const dailySales = salesScopeUserId === null
      ? empty
      : await AnalyticsService.getDailySales(storeId, last30, shiftHour, salesScopeUserId);
    const monthlyRevenue = salesScopeUserId === null
      ? empty
      : await AnalyticsService.getMonthlyRevenue(storeId, last12mo, shiftHour, salesScopeUserId);
    const cashFlow = hasPermission(perms, "treasury.view_all") || hasPermission(perms, "treasury.view")
      ? await AnalyticsService.getCashFlowSimple(storeId, last30)
      : [];
    const bestSellingProducts = salesScopeUserId === null
      ? empty
      : await AnalyticsService.getBestSellingProducts(storeId, salesScopeUserId);
    const salesByPaymentMethod = salesScopeUserId === null
      ? empty
      : await AnalyticsService.getSalesByPaymentMethod(storeId, salesScopeUserId);
    const salesByCategory = salesScopeUserId === null
      ? empty
      : await AnalyticsService.getSalesByCategory(storeId, salesScopeUserId);

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

