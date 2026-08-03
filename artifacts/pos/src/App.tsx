import { Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { queryClient } from "@/lib/query-client";
import { useGetSetupStatus } from "@workspace/api-client-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { LoginPage } from "@/pages/login";
import { SetupPage } from "@/pages/setup";
import { DashboardPage } from "@/pages/dashboard";
import { UsersPage } from "@/pages/users";
import { RolesPage } from "@/pages/roles";
import { AuditPage } from "@/pages/audit";
import { ProductsPage } from "@/pages/products";
import { MasterDataPage } from "@/pages/master-data";
import { WarehousesPage } from "@/pages/warehouses";
import { StockPage } from "@/pages/stock";
import { MovementsPage } from "@/pages/movements";
import { CustomersPage } from "@/pages/customers";
import { SuppliersPage } from "@/pages/suppliers";
import { TreasuryPage } from "@/pages/treasury";
import { FinancePage } from "@/pages/finance";
import { ReportsPage } from "@/pages/reports";
import { POSPage } from "@/pages/pos";
import { SalesHistoryPage } from "@/pages/sales-history";
import { SalesReturnsPage } from "@/pages/sales-returns";
import { PurchasesPage } from "@/pages/purchases";
import { PurchaseReturnsPage } from "@/pages/purchase-returns";
import { SettingsPage } from "@/pages/settings";
import { TransfersPage } from "@/pages/transfers";
import { StockCountsPage } from "@/pages/stock-counts";
import { AssociationsPage } from "@/pages/associations";
import NotFound from "@/pages/not-found";

// queryClient is defined in @/lib/query-client — it includes the generic
// lookup-sync MutationCache that invalidates all dropdowns on any mutation.

// ---------------------------------------------------------------------------
// RouteTracker — notifies Electron main process of route changes
// so each window can be restored to the correct page.
// No-op in a regular browser.
// ---------------------------------------------------------------------------
function RouteTracker() {
  const [location] = useLocation();
  useEffect(() => {
    window.erp?.notifyRouteChanged(location);
  }, [location]);
  return null;
}


function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <Loader2 size={40} className="text-amber-500 animate-spin" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KeepAliveRoute — renders a page once it has been visited and keeps it
// mounted (via CSS display) even when not active, preserving all local state.
//
// requiredPermission / anyOfPermissions: if the user lacks these on the FIRST
// visit the page is never rendered (and they get redirected). On subsequent
// renders the guard is skipped to avoid a redirect loop.
// ---------------------------------------------------------------------------
interface KeepAliveRouteProps {
  path: string;
  component: React.ComponentType;
  /** permission required (exact) */
  permission?: string;
  /** OR-list of permissions required */
  anyOf?: string[];
}

function KeepAliveRoute({ path, component: Page, permission, anyOf }: KeepAliveRouteProps) {
  const [location] = useLocation();
  const { hasPermission } = useAuth();
  const hasBeenVisited = useRef(false);

  // Normalize: strip trailing slash, compare base segment
  const isActive = location === path || location.startsWith(path + "/");

  // Permission check on every render (not just first visit) —
  // if the user's role changes mid-session this still redirects them.
  const permitted =
    (!permission && !anyOf) ||
    (permission && hasPermission(permission)) ||
    (anyOf && anyOf.some((p) => hasPermission(p)));

  if (isActive && !permitted) {
    return <Redirect to="/dashboard" />;
  }

  // Only mount the page component once the route has been visited at least once
  // (and permission was granted). Before first visit display:none would render
  // an empty shell — pointless.
  if (isActive && !hasBeenVisited.current) {
    hasBeenVisited.current = true;
  }

  if (!hasBeenVisited.current) return null;

  return (
    <div
      style={{
        display: isActive ? "flex" : "none",
        flexDirection: "column",
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    >
      <Page />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthenticatedApp — renders ALL pages as keep-alive routes.
// Pages stay mounted after first visit; navigation only toggles visibility.
// ---------------------------------------------------------------------------
function AuthenticatedApp() {
  const [location] = useLocation();

  // Determine if the current path matches any known route.
  const knownPaths = [
    "/dashboard", "/pos", "/sales", "/sales-returns", "/purchases",
    "/purchase-returns", "/products", "/master-data", "/warehouses",
    "/stock", "/movements", "/transfers", "/stock-counts", "/customers",
    "/suppliers", "/treasury", "/finance", "/reports", "/associations",
    "/users", "/roles", "/audit", "/settings",
  ];
  const isKnown = knownPaths.some(
    (p) => location === p || location.startsWith(p + "/"),
  );

  return (
    <AppShell>
      <RouteTracker />

      {/* Root redirect */}
      {location === "/" && <Redirect to="/dashboard" />}

      {/* Not found — only shown for paths we don't recognise */}
      {!isKnown && location !== "/" && <NotFound />}

      {/* Keep-alive page slots — each page mounts once and stays alive */}
      <KeepAliveRoute path="/dashboard" component={DashboardPage} />
      <KeepAliveRoute path="/pos" component={POSPage} permission="sales.create" />
      <KeepAliveRoute path="/sales" component={SalesHistoryPage} permission="sales.view" />
      <KeepAliveRoute path="/sales-returns" component={SalesReturnsPage} permission="sales.return" />
      <KeepAliveRoute path="/purchases" component={PurchasesPage} permission="purchases.view" />
      <KeepAliveRoute path="/purchase-returns" component={PurchaseReturnsPage} permission="purchases.return" />
      <KeepAliveRoute path="/products" component={ProductsPage} permission="products.view" />
      <KeepAliveRoute path="/master-data" component={MasterDataPage} permission="products.view" />
      <KeepAliveRoute path="/warehouses" component={WarehousesPage} permission="inventory.view" />
      <KeepAliveRoute path="/stock" component={StockPage} permission="inventory.view" />
      <KeepAliveRoute path="/movements" component={MovementsPage} permission="inventory.view" />
      <KeepAliveRoute path="/transfers" component={TransfersPage} permission="inventory.view" />
      <KeepAliveRoute path="/stock-counts" component={StockCountsPage} permission="inventory.view" />
      <KeepAliveRoute path="/customers" component={CustomersPage} permission="customers.view" />
      <KeepAliveRoute path="/suppliers" component={SuppliersPage} permission="suppliers.view" />
      <KeepAliveRoute
        path="/treasury"
        component={TreasuryPage}
        anyOf={["treasury.view", "treasury.session", "treasury.view_all"]}
      />
      <KeepAliveRoute
        path="/finance"
        component={FinancePage}
        anyOf={["finance.view", "expenses.create", "salaries.create", "advances.create", "equity.create"]}
      />
      <KeepAliveRoute path="/reports" component={ReportsPage} permission="reports.view" />
      <KeepAliveRoute
        path="/associations"
        component={AssociationsPage}
        anyOf={["associations.view", "associations.transactions", "associations.create", "associations.edit"]}
      />
      <KeepAliveRoute path="/users" component={UsersPage} permission="users.view" />
      <KeepAliveRoute path="/roles" component={RolesPage} permission="roles.view" />
      <KeepAliveRoute path="/audit" component={AuditPage} permission="audit.view" />
      <KeepAliveRoute path="/settings" component={SettingsPage} permission="settings.view" />
    </AppShell>
  );
}

function Gateway() {
  const setupStatus = useGetSetupStatus();
  const { user, isLoading: authLoading } = useAuth();

  if (setupStatus.isLoading) return <FullScreenLoader />;

  if (setupStatus.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md">
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            تعذّر الاتصال بالخادم
          </h1>
          <p className="text-slate-500">
            يرجى التأكد من تشغيل الخادم ثم إعادة تحميل الصفحة.
          </p>
        </div>
      </div>
    );
  }

  if (!setupStatus.data?.isSetupComplete) {
    return <SetupPage />;
  }

  if (authLoading) return <FullScreenLoader />;

  if (!user) return <LoginPage />;

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Gateway />
        </WouterRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
