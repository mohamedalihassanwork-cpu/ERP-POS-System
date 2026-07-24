import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  ShoppingBag, 
  Users, 
  Truck, 
  Wallet, 
  Settings,
  LogOut
} from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export function AppLayout({ children, activePath = '/dashboard' }: AppLayoutProps) {
  const menuItems = [
    { path: '/dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard size={20} /> },
    { path: '/pos', label: 'نقطة البيع', icon: <ShoppingCart size={20} /> },
    { path: '/inventory', label: 'المخزون', icon: <Package size={20} /> },
    { path: '/purchases', label: 'المشتريات', icon: <ShoppingBag size={20} /> },
    { path: '/customers', label: 'العملاء', icon: <Users size={20} /> },
    { path: '/suppliers', label: 'الموردين', icon: <Truck size={20} /> },
    { path: '/finance', label: 'المالية', icon: <Wallet size={20} /> },
    { path: '/settings', label: 'الإعدادات', icon: <Settings size={20} /> },
  ];

  return (
    <div dir="rtl" className="flex h-screen bg-slate-50 text-slate-900 font-['Noto_Sans_Arabic'] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col h-full shrink-0 shadow-xl z-20">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center shrink-0 shadow-inner">
            <Package size={24} className="text-slate-900" />
          </div>
          <h1 className="text-xl font-bold font-['Noto_Sans_Arabic'] text-white">متجر الأحذية POS</h1>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {menuItems.map((item) => (
              <li key={item.path}>
                <a 
                  href={item.path === '/dashboard' ? '#' : item.path === '/pos' ? '#' : item.path === '/inventory' ? '#' : '#'}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activePath === item.path 
                      ? 'bg-amber-500 text-slate-900 font-bold shadow-md shadow-amber-500/20' 
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white font-medium'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-sm font-bold">
              م
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">محمد أحمد</p>
              <p className="text-xs text-slate-400 truncate">مدير الفرع</p>
            </div>
          </div>
          <button className="flex items-center gap-3 px-4 py-2.5 w-full rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors font-medium">
            <LogOut size={18} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-full overflow-hidden flex flex-col relative z-10 bg-slate-50">
        {children}
      </main>
    </div>
  );
}
