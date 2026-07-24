import React from 'react';
import { AppLayout } from './_shared/AppLayout';
import { PlusCircle, Search, Filter, Download, ArrowUpDown, MoreVertical, Edit, Trash, Copy } from 'lucide-react';

export function Inventory() {
  const products = [
    { id: "SKU-9021", name: "حذاء نايكي إير ماكس بلس", category: "أحذية رياضية", brand: "نايكي", variants: "4 مقاسات، 3 ألوان", qty: 45, minQty: 10, status: "متوفر", price: "350 ريال", imageBg: "bg-slate-200" },
    { id: "SKU-9022", name: "حذاء أديداس سوبرستار كلاسيك", category: "أحذية رياضية", brand: "أديداس", variants: "6 مقاسات، لونين", qty: 8, minQty: 15, status: "منخفض", price: "280 ريال", imageBg: "bg-slate-100" },
    { id: "SKU-9023", name: "صندل كلاركس مريح للرجال", category: "صنادل", brand: "كلاركس", variants: "3 مقاسات، لون واحد", qty: 22, minQty: 5, status: "متوفر", price: "190 ريال", imageBg: "bg-amber-100" },
    { id: "SKU-9024", name: "حذاء بوما رياضي للجري", category: "أحذية رياضية", brand: "بوما", variants: "5 مقاسات، 4 ألوان", qty: 0, minQty: 10, status: "نافد", price: "320 ريال", imageBg: "bg-slate-200" },
    { id: "SKU-9025", name: "حذاء ريبوك كلاسيك جلد", category: "كاجوال", brand: "ريبوك", variants: "4 مقاسات، لونين", qty: 31, minQty: 8, status: "متوفر", price: "240 ريال", imageBg: "bg-blue-50" },
    { id: "SKU-9026", name: "صندل إيكو طبي", category: "صنادل", brand: "إيكو", variants: "2 مقاسات، لون واحد", qty: 5, minQty: 5, status: "منخفض", price: "410 ريال", imageBg: "bg-orange-50" },
    { id: "SKU-9027", name: "حذاء رسمي أوكسفورد أسود", category: "أحذية رسمية", brand: "تومي هيلفيغر", variants: "5 مقاسات، لونين", qty: 18, minQty: 5, status: "متوفر", price: "550 ريال", imageBg: "bg-slate-800" },
  ];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'متوفر':
        return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">متوفر</span>;
      case 'منخفض':
        return <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold border border-orange-200">منخفض</span>;
      case 'نافد':
        return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200">نافد</span>;
      default:
        return <span>{status}</span>;
    }
  };

  const getQtyColor = (status: string) => {
    switch(status) {
      case 'متوفر': return 'text-slate-800';
      case 'منخفض': return 'text-orange-600';
      case 'نافد': return 'text-red-600';
      default: return 'text-slate-800';
    }
  };

  return (
    <AppLayout activePath="/inventory">
      <div className="flex-1 overflow-auto bg-slate-50 flex flex-col h-full p-8">
        
        <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">إدارة المخزون</h2>
              <p className="text-slate-500 mt-2 font-medium">عرض وإدارة المنتجات، الكميات، والأسعار.</p>
            </div>
            <div className="flex gap-3">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border-2 border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all font-bold shadow-sm active:scale-95">
                <Download size={18} />
                <span>تصدير إكسيل</span>
              </button>
              <button className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all font-bold shadow-md shadow-slate-900/20 active:scale-95">
                <PlusCircle size={20} className="text-amber-400" />
                <span>إضافة منتج جديد</span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <Search className="text-slate-400" size={20} />
              </div>
              <input 
                type="text" 
                placeholder="ابحث برقم الصنف (SKU)، اسم المنتج، أو الباركود..." 
                className="w-full bg-slate-50 border-2 border-transparent text-slate-800 rounded-xl py-3 pr-12 pl-4 focus:outline-none focus:bg-white focus:border-amber-500 font-medium transition-all"
              />
            </div>
            
            <div className="flex gap-3 flex-wrap lg:flex-nowrap">
              <div className="relative min-w-[160px]">
                <select className="w-full appearance-none bg-slate-50 border-2 border-transparent text-slate-700 rounded-xl py-3 px-4 pl-10 focus:outline-none focus:bg-white focus:border-amber-500 font-bold transition-all cursor-pointer">
                  <option>جميع الفئات</option>
                  <option>أحذية رياضية</option>
                  <option>أحذية رسمية</option>
                  <option>صنادل</option>
                </select>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Filter className="text-slate-400" size={16} />
                </div>
              </div>
              
              <div className="relative min-w-[160px]">
                <select className="w-full appearance-none bg-slate-50 border-2 border-transparent text-slate-700 rounded-xl py-3 px-4 pl-10 focus:outline-none focus:bg-white focus:border-amber-500 font-bold transition-all cursor-pointer">
                  <option>الماركة التجارية</option>
                  <option>نايكي</option>
                  <option>أديداس</option>
                  <option>بوما</option>
                </select>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Filter className="text-slate-400" size={16} />
                </div>
              </div>

              <div className="relative min-w-[160px]">
                <select className="w-full appearance-none bg-slate-50 border-2 border-transparent text-slate-700 rounded-xl py-3 px-4 pl-10 focus:outline-none focus:bg-white focus:border-amber-500 font-bold transition-all cursor-pointer">
                  <option>حالة المخزون</option>
                  <option>متوفر</option>
                  <option>منخفض</option>
                  <option>نافد</option>
                </select>
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <ArrowUpDown className="text-slate-400" size={16} />
                </div>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b-2 border-slate-200 text-slate-600 text-sm font-bold">
                    <th className="p-4 w-12 text-center">
                      <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500" />
                    </th>
                    <th className="p-4 min-w-[300px]">المنتج</th>
                    <th className="p-4">الفئة / الماركة</th>
                    <th className="p-4">التنويعات</th>
                    <th className="p-4">السعر</th>
                    <th className="p-4 text-center">الكمية</th>
                    <th className="p-4 text-center">الحالة</th>
                    <th className="p-4 text-left w-16">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((product, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="p-4 text-center">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-xl ${product.imageBg} shrink-0 shadow-inner flex items-center justify-center overflow-hidden`}>
                            {/* Placeholder shoe image styling */}
                            <div className="w-10 h-6 bg-black/10 rounded-full blur-sm absolute translate-y-3 opacity-50"></div>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 w-8 h-8 relative z-10 -rotate-12">
                              <path d="M12 21.5c-4.5 0-8-2-8-5.5S7.5 10 12 10s8 2.5 8 5.5-3.5 5.5-8 5.5z"/>
                              <path d="M12 10V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6"/>
                            </svg>
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-base">{product.name}</p>
                            <p className="text-xs font-mono font-medium text-slate-500 mt-1 bg-slate-100 inline-block px-1.5 py-0.5 rounded">{product.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-slate-700">{product.category}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{product.brand}</p>
                      </td>
                      <td className="p-4 text-sm font-medium text-slate-600">
                        {product.variants}
                      </td>
                      <td className="p-4 font-black text-slate-800">
                        {product.price}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`font-black text-lg ${getQtyColor(product.status)}`}>{product.qty}</span>
                        <div className="text-[10px] text-slate-400 font-bold mt-1">حد إعادة الطلب: {product.minQty}</div>
                      </td>
                      <td className="p-4 text-center">
                        {getStatusBadge(product.status)}
                      </td>
                      <td className="p-4 text-left">
                        <button className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors">
                          <MoreVertical size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            <div className="border-t border-slate-200 p-4 bg-white flex items-center justify-between mt-auto">
              <span className="text-sm font-medium text-slate-500">عرض 1 إلى 7 من أصل 45 منتج</span>
              <div className="flex gap-1">
                <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-400 cursor-not-allowed">السابق</button>
                <button className="px-3 py-1.5 bg-amber-500 border border-amber-500 rounded-lg text-sm font-bold text-slate-900 shadow-sm">1</button>
                <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">2</button>
                <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">3</button>
                <span className="px-3 py-1.5 text-slate-400">...</span>
                <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">7</button>
                <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">التالي</button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
