import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
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

function PermissionGate({
  permission,
  anyOf,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  children: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  
  let ok = false;
  if (permission && hasPermission(permission)) ok = true;
  if (anyOf && anyOf.some(p => hasPermission(p))) ok = true;

  if (!ok) {
    return <Redirect to="/dashboard" />;
  }
  return <>{children}</>;
}

function AuthenticatedApp() {
  return (
    <AppShell>
      <RouteTracker />
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/pos">
          <PermissionGate permission="sales.create">
            <POSPage />
          </PermissionGate>
        </Route>
        <Route path="/sales">
          <PermissionGate permission="sales.view">
            <SalesHistoryPage />
          </PermissionGate>
        </Route>
        <Route path="/sales-returns">
          <PermissionGate permission="sales.return">
            <SalesReturnsPage />
          </PermissionGate>
        </Route>
        <Route path="/purchases">
          <PermissionGate permission="purchases.view">
            <PurchasesPage />
          </PermissionGate>
        </Route>
        <Route path="/purchase-returns">
          <PermissionGate permission="purchases.return">
            <PurchaseReturnsPage />
          </PermissionGate>
        </Route>
        <Route path="/products">
          <PermissionGate permission="products.view">
            <ProductsPage />
          </PermissionGate>
        </Route>
        <Route path="/master-data">
          <PermissionGate permission="products.view">
            <MasterDataPage />
          </PermissionGate>
        </Route>
        <Route path="/warehouses">
          <PermissionGate permission="inventory.view">
            <WarehousesPage />
          </PermissionGate>
        </Route>
        <Route path="/stock">
          <PermissionGate permission="inventory.view">
            <StockPage />
          </PermissionGate>
        </Route>
        <Route path="/movements">
          <PermissionGate permission="inventory.view">
            <MovementsPage />
          </PermissionGate>
        </Route>
        <Route path="/transfers">
          <PermissionGate permission="inventory.view">
            <TransfersPage />
          </PermissionGate>
        </Route>
        <Route path="/stock-counts">
          <PermissionGate permission="inventory.view">
            <StockCountsPage />
          </PermissionGate>
        </Route>
        <Route path="/customers">
          <PermissionGate permission="customers.view">
            <CustomersPage />
          </PermissionGate>
        </Route>
        <Route path="/suppliers">
          <PermissionGate permission="suppliers.view">
            <SuppliersPage />
          </PermissionGate>
        </Route>
        <Route path="/treasury">
          <PermissionGate anyOf={["treasury.view", "treasury.session", "treasury.manage"]}>
            <TreasuryPage />
          </PermissionGate>
        </Route>
        <Route path="/finance">
          <PermissionGate anyOf={["finance.view", "expenses.create", "salaries.create", "advances.create", "equity.create"]}>
            <FinancePage />
          </PermissionGate>
        </Route>
        <Route path="/reports">
          <PermissionGate permission="reports.view">
            <ReportsPage />
          </PermissionGate>
        </Route>
        <Route path="/associations">
          <PermissionGate anyOf={["associations.view", "associations.transactions", "associations.create", "associations.edit"]}>
            <AssociationsPage />
          </PermissionGate>
        </Route>
        <Route path="/users">
          <PermissionGate permission="users.view">
            <UsersPage />
          </PermissionGate>
        </Route>
        <Route path="/roles">
          <PermissionGate permission="roles.view">
            <RolesPage />
          </PermissionGate>
        </Route>
        <Route path="/audit">
          <PermissionGate permission="audit.view">
            <AuditPage />
          </PermissionGate>
        </Route>
        <Route path="/settings">
          <PermissionGate permission="settings.view">
            <SettingsPage />
          </PermissionGate>
        </Route>
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route component={NotFound} />
      </Switch>
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
