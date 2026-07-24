import React, { useState } from 'react';
import { AppLayout } from './_shared/AppLayout';
import { Search, UserPlus, Trash2, Plus, Minus, CreditCard, Banknote, Smartphone, Receipt, CheckCircle, PauseCircle, XCircle, Wallet } from 'lucide-react';

export function POS() {
  const [cartItems, setCartItems] = useState([
    { id: 1, name: 'حذاء نايكي إير ماكس', size: '42', color: 'أسود', qty: 1, price: 350, total: 350 },
    { id: 2, name: 'حذاء أديداس سوبرستار', size: '40', color: 'أبيض', qty: 2, price: 200, total: 400 },
    { id: 3, name: 'صندل كلاركس مريح', size: '38', color: 'بني', qty: 1, price: 100, total: 100 }
  ]);

  const updateQty = (id: number, delta: number) => {
    setCartItems(items => 
      items.map(item => {
        if (item.id === id) {
          const newQty = Math.max(1, item.qty + delta);
          return { ...item, qty: newQty, total: newQty * item.price };
        }
        return item;
      })
    );
  };

  const removeItem = (id: number) => {
    setCartItems(items => items.filter(item => item.id !== id));
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
  const discount = 50;
  const tax = subtotal * 0.15; // 15% VAT for example
  const total = subtotal - discount + tax;

  const [paymentMethod, setPaymentMethod] = useState('cash');

  return (
    <AppLayout activePath="/pos">
      <div className="flex-1 flex overflow-hidden bg-slate-100">
        
        {/* Left Side: Cart & Search (60%) */}
        <div className="w-[60%] flex flex-col h-full border-l border-slate-200 bg-white">
          
          {/* Top Search Bar */}
          <div className="p-4 border-b border-slate-100 bg-white z-10 shadow-sm">
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <Search className="text-slate-400" size={20} />
              </div>
              <input 
                type="text" 
                placeholder="بحث عن منتج بالاسم أو الباركود..." 
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl py-3.5 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent font-medium text-lg placeholder:text-slate-400 transition-all"
                dir="rtl"
              />
              <div className="absolute inset-y-0 left-0 pl-2 flex items-center">
                <kbd className="hidden sm:inline-flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded text-xs font-sans font-bold text-slate-400">
                  F2
                </kbd>
              </div>
            </div>
          </div>

          {/* Table Headers */}
          <div className="grid grid-cols-12 gap-2 p-4 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-600">
            <div className="col-span-5">المنتج</div>
            <div className="col-span-2 text-center">السعر</div>
            <div className="col-span-3 text-center">الكمية</div>
            <div className="col-span-2 text-left">الإجمالي</div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50">
            {cartItems.map((item) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-3 bg-white rounded-xl border border-slate-100 shadow-sm group">
                <div className="col-span-5 flex items-center gap-3">
                  <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                    <Trash2 size={18} />
                  </button>
                  <div>
                    <h4 className="font-bold text-slate-800 text-base line-clamp-1">{item.name}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">مقاس: {item.size} • لون: {item.color}</p>
                  </div>
                </div>
                <div className="col-span-2 text-center font-bold text-slate-700">
                  {item.price} ريال
                </div>
                <div className="col-span-3 flex items-center justify-center">
                  <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <button onClick={() => updateQty(item.id, 1)} className="p-2 text-slate-600 hover:bg-slate-200 transition-colors active:bg-slate-300">
                      <Plus size={16} />
                    </button>
                    <div className="w-10 text-center font-bold text-slate-800 select-none">
                      {item.qty}
                    </div>
                    <button onClick={() => updateQty(item.id, -1)} className="p-2 text-slate-600 hover:bg-slate-200 transition-colors active:bg-slate-300">
                      <Minus size={16} />
                    </button>
                  </div>
                </div>
                <div className="col-span-2 text-left font-black text-slate-800 text-lg">
                  {item.total}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Right Side: Payment & Summary (40%) */}
        <div className="w-[40%] bg-white flex flex-col h-full z-10 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          
          {/* Customer Selection */}
          <div className="p-5 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">بيانات العميل</h3>
              <button className="text-sm font-bold text-amber-600 flex items-center gap-1 hover:text-amber-700">
                <UserPlus size={16} />
                إضافة عميل
              </button>
            </div>
            <div className="relative">
              <input 
                type="text" 
                placeholder="عميل نقدي (افتراضي)..." 
                className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div className="p-5 border-b border-slate-100 flex-1 overflow-y-auto">
            <h3 className="font-bold text-slate-800 mb-4">طريقة الدفع</h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setPaymentMethod('cash')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'cash' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote size={28} className={paymentMethod === 'cash' ? 'text-amber-600' : 'text-slate-400'} />
                <span className="font-bold">نقدي / كاش</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('card')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'card' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard size={28} className={paymentMethod === 'card' ? 'text-amber-600' : 'text-slate-400'} />
                <span className="font-bold">فيزا / كارد</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('instapay')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'instapay' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Smartphone size={28} className={paymentMethod === 'instapay' ? 'text-amber-600' : 'text-slate-400'} />
                <span className="font-bold">إنستاباي</span>
              </button>
              <button 
                onClick={() => setPaymentMethod('wallet')}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                  paymentMethod === 'wallet' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Wallet size={28} className={paymentMethod === 'wallet' ? 'text-amber-600' : 'text-slate-400'} />
                <span className="font-bold">محفظة إلكترونية</span>
              </button>
            </div>
            
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">المبلغ المدفوع</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={total.toFixed(2)}
                  className="w-full bg-slate-50 border-2 border-slate-200 text-slate-800 rounded-xl py-4 px-4 focus:outline-none focus:border-amber-500 font-black text-2xl"
                  dir="ltr"
                  readOnly
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">ريال</span>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-slate-800 text-white p-5 pt-6 rounded-t-3xl shadow-[0_-10px_20px_rgba(0,0,0,0.1)] mt-auto">
            <div className="space-y-3 mb-6">
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-medium">المجموع الفرعي:</span>
                <span className="font-bold">{subtotal.toFixed(2)} ريال</span>
              </div>
              <div className="flex justify-between items-center text-red-300">
                <span className="font-medium">الخصم:</span>
                <span className="font-bold">- {discount.toFixed(2)} ريال</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-medium">ضريبة القيمة المضافة (15%):</span>
                <span className="font-bold">+ {tax.toFixed(2)} ريال</span>
              </div>
              <div className="h-px bg-slate-700 my-2"></div>
              <div className="flex justify-between items-end">
                <span className="font-bold text-lg">الإجمالي المطلوب:</span>
                <span className="font-black text-4xl text-amber-400">{total.toFixed(2)}<span className="text-lg text-amber-200 ml-1">ريال</span></span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-3">
              <button className="col-span-2 bg-green-500 hover:bg-green-400 text-slate-900 rounded-xl py-4 font-black text-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-green-500/20 active:scale-95">
                <CheckCircle size={24} />
                إتمام البيع
              </button>
              <button className="col-span-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-4 font-bold flex flex-col items-center justify-center gap-1 transition-colors active:scale-95">
                <PauseCircle size={20} />
                <span className="text-sm">تعليق</span>
              </button>
              <button className="col-span-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl py-4 font-bold flex flex-col items-center justify-center gap-1 transition-colors active:scale-95">
                <XCircle size={20} />
                <span className="text-sm">إلغاء</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
