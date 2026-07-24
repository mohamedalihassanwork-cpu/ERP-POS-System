import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ScrollText,
  Settings,
  LogOut,
  Package,
  Tags,
  Warehouse,
  Boxes,
  Wallet,
  Landmark,
  Truck,
  Menu,
  X,
  ShoppingCart,
  Receipt,
  Undo2,
  FileBarChart,
  ArrowLeftRight,
  ClipboardList,
  ChevronDown,
  HandCoins,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NotificationBell } from "@/components/notification-bell";

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  permission?: string;
  anyOf?: string[];
}

interface NavGroupDef {
  label: string;
  icon: ReactNode;
  items: NavItem[];
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "الرئيسية",
    icon: <LayoutDashboard size={20} />,
    items: [
      { path: "/dashboard", label: "لوحة التحكم", icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    label: "المبيعات",
    icon: <ShoppingCart size={20} />,
    items: [
      { path: "/pos", label: "نقطة البيع", icon: <ShoppingCart size={18} />, permission: "sales.create" },
      { path: "/sales", label: "سجل المبيعات", icon: <Receipt size={18} />, permission: "sales.view" },
      { path: "/sales-returns", label: "مرتجعات المبيعات", icon: <Undo2 size={18} />, permission: "sales.return" },
      { path: "/customers", label: "العملاء", icon: <Users size={18} />, permission: "customers.view" },
    ],
  },
  {
    label: "المشتريات",
    icon: <Truck size={20} />,
    items: [
      { path: "/purchases", label: "المشتريات", icon: <ShoppingCart size={18} />, permission: "purchases.view" },
      { path: "/purchase-returns", label: "مرتجعات المشتريات", icon: <Undo2 size={18} />, permission: "purchases.return" },
      { path: "/suppliers", label: "الموردون", icon: <Truck size={18} />, permission: "suppliers.view" },
    ],
  },
  {
    label: "المخزون",
    icon: <Boxes size={20} />,
    items: [
      { path: "/products", label: "المنتجات", icon: <Package size={18} />, permission: "products.view" },
      { path: "/warehouses", label: "المخازن", icon: <Warehouse size={18} />, permission: "inventory.view" },
      { path: "/stock", label: "المخزون", icon: <Boxes size={18} />, permission: "inventory.view" },
      { path: "/transfers", label: "التحويلات", icon: <ArrowLeftRight size={18} />, permission: "inventory.view" },
      { path: "/stock-counts", label: "الجرد", icon: <ClipboardList size={18} />, permission: "inventory.view" },
      { path: "/movements", label: "حركات المخزون", icon: <ScrollText size={18} />, permission: "inventory.view" },
    ],
  },
  {
    label: "المالية",
    icon: <Landmark size={20} />,
    items: [
      { path: "/treasury", label: "الخزينة", icon: <Wallet size={18} />, anyOf: ["treasury.view", "treasury.session", "treasury.manage"] },
      { path: "/finance", label: "المالية والمصروفات", icon: <Landmark size={18} />, anyOf: ["finance.view", "expenses.create", "salaries.create", "advances.create", "equity.create"] },
      { path: "/associations", label: "إدارة الجمعيات", icon: <HandCoins size={18} />, anyOf: ["associations.view", "associations.transactions", "associations.create", "associations.edit"] },
    ],
  },
  {
    label: "الإدارة والنظام",
    icon: <Settings size={20} />,
    items: [
      { path: "/reports", label: "التقارير", icon: <FileBarChart size={18} />, permission: "reports.view" },
      { path: "/master-data", label: "البيانات الأساسية", icon: <Tags size={18} />, permission: "products.view" },
      { path: "/users", label: "المستخدمون", icon: <Users size={18} />, permission: "users.view" },
      { path: "/roles", label: "الأدوار والصلاحيات", icon: <ShieldCheck size={18} />, permission: "roles.view" },
      { path: "/audit", label: "سجل النشاط", icon: <ScrollText size={18} />, permission: "audit.view" },
      { path: "/settings", label: "الإعدادات", icon: <Settings size={18} />, permission: "settings.view" },
    ],
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "؟") + (parts[1]?.[0] ?? "");
}

function NavGroup({
  group,
  currentPath,
  hasPermission,
  closeMobile,
}: {
  group: NavGroupDef;
  currentPath: string;
  hasPermission: (p: string) => boolean;
  closeMobile: () => void;
}) {
  const visibleItems = group.items.filter((item) => {
    if (!item.permission && !item.anyOf) return true;
    if (item.permission && hasPermission(item.permission)) return true;
    if (item.anyOf && item.anyOf.some((p) => hasPermission(p))) return true;
    return false;
  });
  if (visibleItems.length === 0) return null;

  const isActiveGroup = visibleItems.some((item) => currentPath === item.path);
  const [expanded, setExpanded] = useState(isActiveGroup);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition ${
          isActiveGroup ? "text-amber-500" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        }`}
      >
        <div className="flex items-center gap-3 font-bold text-sm">
          {group.icon}
          <span>{group.label}</span>
        </div>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <ul className="mt-1 space-y-0.5 pr-6 border-r-2 border-slate-800/50 mr-4">
          {visibleItems.map((item) => {
            const active = currentPath === item.path;
            return (
              <li key={item.path}>
                <Link
                  href={item.path}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${
                    active
                      ? "bg-amber-500 text-slate-900 font-bold shadow-md shadow-amber-500/10"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
                  }`}
                  data-testid={`nav-${item.path.slice(1)}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout, hasPermission } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <aside className="w-72 bg-slate-900 text-white flex flex-col h-full shrink-0 shadow-xl overflow-hidden" dir="rtl">
      <div className="p-6 flex items-center gap-3 bg-slate-900/50 backdrop-blur-sm z-10 border-b border-slate-800">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
          <Package size={24} className="text-slate-900" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-black text-white truncate">
            {user?.storeName ?? "نظام إدارة المتجر"}
          </h1>
          <p className="text-xs text-amber-500 font-bold tracking-wide">ERP & POS SYSTEM</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-4 custom-scrollbar">
        {NAV_GROUPS.map((group) => (
          <NavGroup
            key={group.label}
            group={group}
            currentPath={location}
            hasPermission={hasPermission}
            closeMobile={() => setMobileOpen(false)}
          />
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-slate-800/50 rounded-xl">
          <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-amber-400 rounded-full flex items-center justify-center text-slate-900 font-black shadow-inner">
            {user ? initials(user.fullName) : "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{user?.fullName ?? ""}</p>
            <p className="text-xs text-amber-500 truncate font-medium">
              {user?.role.nameAr ?? user?.role.name ?? ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => void logout()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 w-full rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors font-bold text-sm"
          data-testid="button-logout"
        >
          <LogOut size={16} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden" dir="rtl">
      <div className="hidden lg:flex">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full shadow-2xl">{sidebar}</div>
        </div>
      )}

      <main className="flex-1 h-full overflow-hidden flex flex-col bg-slate-50/50">
        <header className="flex items-center justify-between p-4 lg:px-8 bg-white/80 backdrop-blur-md border-b border-slate-200/60 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 lg:hidden transition-colors"
              data-testid="button-menu-toggle"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <span className="font-black text-slate-800 lg:hidden text-lg tracking-tight">
              {user?.storeName ?? "نظام الإدارة"}
            </span>
          </div>
          <NotificationBell />
        </header>
        <div className="flex-1 overflow-auto relative">
          {children}
        </div>
      </main>
    </div>
  );
}
