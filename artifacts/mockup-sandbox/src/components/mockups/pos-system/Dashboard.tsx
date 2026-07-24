import React from 'react';
import { AppLayout } from './_shared/AppLayout';
import { Wallet, TrendingUp, ShoppingBag, CreditCard, DollarSign, AlertTriangle, Users, Truck, PlusCircle, ArrowUpRight } from 'lucide-react';

export function Dashboard() {
  const kpis = [
    { label: "مبيعات اليوم", value: "12,450 ريال", icon: <TrendingUp className="text-green-600" size={24} />, bg: "bg-green-100", border: "border-green-200" },
    { label: "ربح اليوم", value: "3,820 ريال", icon: <Wallet className="text-blue-600" size={24} />, bg: "bg-blue-100", border: "border-blue-200" },
    { label: "مشتريات اليوم", value: "8,200 ريال", icon: <ShoppingBag className="text-purple-600" size={24} />, bg: "bg-purple-100", border: "border-purple-200" },
    { label: "مصاريف اليوم", value: "450 ريال", icon: <CreditCard className="text-red-600" size={24} />, bg: "bg-red-100", border: "border-red-200" },
    { label: "رصيد الخزينة", value: "24,300 ريال", icon: <DollarSign className="text-amber-600" size={24} />, bg: "bg-amber-100", border: "border-amber-200" },
    { label: "منتجات منخفضة المخزون", value: "7 منتجات", icon: <AlertTriangle className="text-orange-600" size={24} />, bg: "bg-orange-100", border: "border-orange-200" },
    { label: "ديون العملاء", value: "5,200 ريال", icon: <Users className="text-indigo-600" size={24} />, bg: "bg-indigo-100", border: "border-indigo-200" },
    { label: "ديون الموردين", value: "11,800 ريال", icon: <Truck className="text-slate-600" size={24} />, bg: "bg-slate-200", border: "border-slate-300" }
  ];

  const recentSales = [
    { id: "INV-1042", time: "14:30", amount: "450 ريال", method: "فيزا", customer: "أحمد محمد" },
    { id: "INV-1041", time: "13:15", amount: "1,200 ريال", method: "نقدي", customer: "عميل نقدي" },
    { id: "INV-1040", time: "11:45", amount: "320 ريال", method: "إنستاباي", customer: "سالم عبدالله" },
    { id: "INV-1039", time: "10:20", amount: "890 ريال", method: "نقدي", customer: "خالد سعيد" },
    { id: "INV-1038", time: "09:05", amount: "550 ريال", method: "فيزا", customer: "فهد العتيبي" }
  ];

  const chartData = [
    { day: "السبت", height: "h-32", val: "4.2K" },
    { day: "الأحد", height: "h-40", val: "5.8K" },
    { day: "الإثنين", height: "h-24", val: "3.1K" },
    { day: "الثلاثاء", height: "h-52", val: "8.4K" },
    { day: "الأربعاء", height: "h-36", val: "4.9K" },
    { day: "الخميس", height: "h-48", val: "7.2K" },
    { day: "الجمعة", height: "h-64", val: "12.4K" }
  ];

  return (
    <AppLayout activePath="/dashboard">
      <div className="flex-1 overflow-auto p-8 bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">مرحباً بك، مدير النظام 👋</h2>
              <p className="text-slate-500 mt-1 font-medium">إليك ملخص أداء متجرك لهذا اليوم.</p>
            </div>
            <div className="flex gap-4">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-medium shadow-sm active:scale-95">
                <ShoppingBag size={18} />
                <span>فاتورة شراء</span>
              </button>
              <button className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-slate-900 rounded-xl hover:bg-amber-400 transition-all font-bold shadow-md shadow-amber-500/20 active:scale-95">
                <PlusCircle size={20} />
                <span>بيع جديد</span>
              </button>
            </div>
          </div>

          {/* KPIs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi, index) => (
              <div key={index} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4 group">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border ${kpi.bg} ${kpi.border} group-hover:scale-110 transition-transform`}>
                  {kpi.icon}
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-semibold mb-1">{kpi.label}</p>
                  <p className="text-2xl font-black text-slate-800 tracking-tight">{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Chart */}
            <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">المبيعات خلال 7 أيام</h3>
                  <p className="text-sm text-slate-500">إجمالي المبيعات الأسبوعية</p>
                </div>
                <div className="px-4 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-bold text-sm">
                  هذا الأسبوع
                </div>
              </div>
              
              <div className="h-72 flex items-end justify-between gap-2 px-4 pb-8 relative pt-6">
                {/* Horizontal grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 z-0">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-full h-px bg-slate-100 flex items-center">
                      <span className="absolute right-0 text-[10px] text-slate-400 -translate-y-1/2 translate-x-8 font-mono">{10 - i * 2}k</span>
                    </div>
                  ))}
                </div>
                
                {/* Bars */}
                {chartData.map((data, index) => (
                  <div key={index} className="flex flex-col items-center gap-3 relative z-10 flex-1 group">
                    <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded font-bold">
                      {data.val}
                    </div>
                    <div className={`w-full max-w-[48px] bg-slate-800 rounded-t-lg ${data.height} group-hover:bg-amber-500 transition-colors cursor-pointer shadow-sm relative overflow-hidden`}>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                    </div>
                    <span className="text-sm text-slate-600 font-bold mt-2">{data.day}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Sales */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">أحدث المبيعات</h3>
                <button className="text-sm text-amber-600 font-bold hover:text-amber-700 transition-colors">عرض الكل</button>
              </div>
              <div className="space-y-4 flex-1">
                {recentSales.map((sale, index) => (
                  <div key={index} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                        <ArrowUpRight size={20} className="text-slate-800" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{sale.id}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                          <span>{sale.time}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                          <span className="truncate max-w-[100px]">{sale.customer}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-slate-800">{sale.amount}</p>
                      <p className="text-xs font-bold text-slate-500 mt-1 bg-slate-100 px-2 py-0.5 rounded inline-block">{sale.method}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full py-3 mt-4 border-2 border-slate-100 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-colors">
                عرض تقرير المبيعات
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
