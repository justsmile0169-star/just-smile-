import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import { Order, Expense, Product } from '../../types';
import { Language, getTranslation } from '../../translations';
import {
  TrendingUp, TrendingDown, Calendar, DollarSign,
  ShoppingBag, Scale, CreditCard, ChevronLeft, ChevronRight,
  ArrowUpRight, ArrowDownRight, Percent, CheckCircle2, ArrowRight
} from 'lucide-react';

interface AnalyticsDashboardProps {
  lang: Language;
  ordersList: Order[];
  expensesList: Expense[];
  productsList?: Product[];
}

interface MonthStat {
  key: string; // 'YYYY-MM'
  year: number;
  month: number; // 0-11
  label: string; // e.g. "Août 2026" / "أوت 2026"
  shortLabel: string;
  sales: number;
  purchaseCost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  orderCount: number;
  marginPercent: number;
  changeVsPrevProfit: number | null;
  changeVsPrevSales: number | null;
}

export default function AnalyticsDashboard({ lang, ordersList, expensesList, productsList = [] }: AnalyticsDashboardProps) {
  const isRtl = lang === 'ar';
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(Math.round(n)) +
    ' ' + getTranslation(lang, 'currency');

  const stats = useMemo(() => {
    const activeOrders = ordersList.filter((o) => o.status !== 'cancelled');

    // Create lookup map for products purchase price
    const productsMap = new Map<string, Product>();
    productsList.forEach(p => productsMap.set(p.id, p));

    // Grouping by YYYY-MM
    const monthlyMap = new Map<string, {
      year: number;
      month: number;
      sales: number;
      purchaseCost: number;
      expenses: number;
      orderCount: number;
    }>();

    // Ensure at least the last 12 months exist in monthlyMap
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, {
        year: d.getFullYear(),
        month: d.getMonth(),
        sales: 0,
        purchaseCost: 0,
        expenses: 0,
        orderCount: 0
      });
    }

    // Populate active orders
    let totalSales = 0;
    let totalPurchaseCost = 0;
    let totalDeliveryFees = 0;
    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    const dayMap = new Map<string, number>();

    activeOrders.forEach((o) => {
      // Exclude courier delivery fee from store product sales and profit
      const delivery = Number(o.deliveryCost) || 0;
      totalDeliveryFees += delivery;
      const orderProductSales = Math.max(0, o.totalAfterDiscount - delivery);
      totalSales += orderProductSales;

      // Peak days
      if (o.createdAt) {
        const key = new Date(o.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
          weekday: 'short', day: '2-digit', month: 'short'
        });
        dayMap.set(key, (dayMap.get(key) || 0) + orderProductSales);
      }

      // Monthly assignment
      if (o.createdAt) {
        const d = new Date(o.createdAt);
        if (!isNaN(d.getTime())) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!monthlyMap.has(mKey)) {
            monthlyMap.set(mKey, {
              year: d.getFullYear(),
              month: d.getMonth(),
              sales: 0,
              purchaseCost: 0,
              expenses: 0,
              orderCount: 0
            });
          }
          const mData = monthlyMap.get(mKey)!;
          mData.sales += orderProductSales;
          mData.orderCount += 1;
        }
      }

      // Order items COGS & product popularity
      o.items.forEach((item) => {
        const prod = productsMap.get(item.productId);
        let purchasePrice = Number((item as any).purchasePrice ?? 0);
        if (!purchasePrice && prod) {
          if (item.variantId && prod.variants) {
            const matchedVar = prod.variants.find((v) => v.id === item.variantId);
            purchasePrice = Number(matchedVar?.purchasePrice ?? prod.purchasePrice ?? 0);
          } else {
            purchasePrice = Number(prod.purchasePrice ?? 0);
          }
        }
        const itemCost = purchasePrice * (Number(item.quantity) || 1);
        totalPurchaseCost += itemCost;

        if (o.createdAt) {
          const d = new Date(o.createdAt);
          if (!isNaN(d.getTime())) {
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyMap.has(mKey)) {
              monthlyMap.get(mKey)!.purchaseCost += itemCost;
            }
          }
        }

        const curProd = productMap.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        curProd.qty += item.quantity;
        curProd.revenue += item.price * item.quantity;
        productMap.set(item.productId, curProd);
      });
    });

    // Populate expenses
    let totalExpenses = 0;
    expensesList.forEach((e) => {
      totalExpenses += Number(e.amount) || 0;
      const dateStr = e.date || e.createdAt;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!monthlyMap.has(mKey)) {
            monthlyMap.set(mKey, {
              year: d.getFullYear(),
              month: d.getMonth(),
              sales: 0,
              purchaseCost: 0,
              expenses: 0,
              orderCount: 0
            });
          }
          monthlyMap.get(mKey)!.expenses += Number(e.amount) || 0;
        }
      }
    });

    // Total volumes
    const grossProfit = totalSales - totalPurchaseCost;
    const netProfit = grossProfit - totalExpenses;

    const totalUnpaidDebts = activeOrders.reduce((sum, order) => {
      const remaining = order.remainingBalance !== undefined
        ? Math.max(0, order.remainingBalance)
        : Math.max(0, order.totalAfterDiscount - (order.paidAmount || 0));
      return sum + remaining;
    }, 0);

    // Build raw sorted months list
    const rawKeys = Array.from(monthlyMap.keys()).sort(); // chronological
    const computedMonths: MonthStat[] = [];

    for (let i = 0; i < rawKeys.length; i++) {
      const key = rawKeys[i];
      const data = monthlyMap.get(key)!;
      const d = new Date(data.year, data.month, 1);

      const rawLabel = d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
        month: 'long',
        year: 'numeric'
      });
      const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
      const shortLabel = d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
        month: 'short',
        year: '2-digit'
      });

      const mGross = data.sales - data.purchaseCost;
      const mNet = mGross - data.expenses;
      const mMargin = data.sales > 0 ? (mNet / data.sales) * 100 : 0;

      let changeVsPrevProfit: number | null = null;
      let changeVsPrevSales: number | null = null;

      if (i > 0) {
        const prevKey = rawKeys[i - 1];
        const prevData = monthlyMap.get(prevKey)!;
        const prevGross = prevData.sales - prevData.purchaseCost;
        const prevNet = prevGross - prevData.expenses;

        if (prevNet !== 0) {
          changeVsPrevProfit = Math.round(((mNet - prevNet) / Math.abs(prevNet)) * 100);
        }
        if (prevData.sales > 0) {
          changeVsPrevSales = Math.round(((data.sales - prevData.sales) / prevData.sales) * 100);
        }
      }

      computedMonths.push({
        key,
        year: data.year,
        month: data.month,
        label,
        shortLabel,
        sales: data.sales,
        purchaseCost: data.purchaseCost,
        grossProfit: mGross,
        expenses: data.expenses,
        netProfit: mNet,
        orderCount: data.orderCount,
        marginPercent: mMargin,
        changeVsPrevProfit,
        changeVsPrevSales
      });
    }

    // Sort descending for dropdown & table
    const monthsListDesc = [...computedMonths].sort((a, b) => b.key.localeCompare(a.key));

    // Chronological for charts (take last 12)
    const chartData = computedMonths.slice(-12).map((m) => ({
      name: m.shortLabel,
      fullLabel: m.label,
      [lang === 'fr' ? 'Ventes' : 'المبيعات']: m.sales,
      [lang === 'fr' ? 'Dépenses' : 'المصاريف']: m.expenses,
      [lang === 'fr' ? 'Profit Net' : 'صافي الربح']: m.netProfit
    }));

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map((p) => ({
        name: p.name && p.name.length > 22 ? p.name.slice(0, 22) + '…' : (p.name || 'Unknown'),
        qty: p.qty,
        revenue: p.revenue
      }));

    const peakDays = [...dayMap.entries()]
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);

    return {
      totalSales,
      totalPurchaseCost,
      totalDeliveryFees,
      grossProfit,
      totalExpenses,
      netProfit,
      totalUnpaidDebts,
      monthsList: monthsListDesc,
      chartData,
      topProducts,
      peakDays
    };
  }, [ordersList, expensesList, productsList, lang, now]);

  // Selected Month Data
  const selectedMonthData = useMemo(() => {
    return (
      stats.monthsList.find((m) => m.key === selectedMonthKey) ||
      stats.monthsList[0] || {
        key: currentMonthKey,
        year: now.getFullYear(),
        month: now.getMonth(),
        label: lang === 'fr' ? 'Mois actuel' : 'الشهر الحالي',
        shortLabel: '---',
        sales: 0,
        purchaseCost: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        orderCount: 0,
        marginPercent: 0,
        changeVsPrevProfit: null,
        changeVsPrevSales: null
      }
    );
  }, [stats.monthsList, selectedMonthKey, currentMonthKey, now, lang]);

  // Navigation handlers for next / previous month
  const handleNavMonth = (direction: 'prev' | 'next') => {
    const currentIndex = stats.monthsList.findIndex((m) => m.key === selectedMonthData.key);
    if (currentIndex === -1) return;
    if (direction === 'prev' && currentIndex < stats.monthsList.length - 1) {
      setSelectedMonthKey(stats.monthsList[currentIndex + 1].key);
    } else if (direction === 'next' && currentIndex > 0) {
      setSelectedMonthKey(stats.monthsList[currentIndex - 1].key);
    }
  };

  const isNetPositive = selectedMonthData.netProfit >= 0;

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
        <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
          <TrendingUp size={24} className="text-brand-cyan" />
          {lang === 'fr' ? 'Tableau de Bord Analytique & Rentabilité' : 'لوحة التحكم التحليلية وتقرير الأرباح'}
        </h3>
        <p className="text-xs text-slate-400 font-medium mt-1">
          {lang === 'fr'
            ? 'Calcul financier rigoureux : Profit net = Ventes réelles des produits (hors livraison) - Coût d\'achat (COGS) - Dépenses opérationnelles'
            : 'الحسابات المالية الدقيقة: صافي الربح = مبيعات المنتجات الفعلية (بدون احتساب التوصيل) - تكلفة شراء البضاعة المباعة - المصروفات التشغيلية'}
        </p>
      </div>

      {/* ── Global Summary KPIs (Overall) ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: lang === 'fr' ? 'Ventes totales' : 'إجمالي المبيعات العامة', value: stats.totalSales, icon: DollarSign, color: 'text-brand-cyan', bg: 'bg-brand-cyan/10' },
          { label: lang === 'fr' ? 'Coût d\'achat (COGS)' : 'تكلفة الشراء الكلية', value: stats.totalPurchaseCost, icon: ShoppingBag, color: 'text-slate-600 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800' },
          { label: lang === 'fr' ? 'Marge brute totale' : 'الربح الإجمالي العام', value: stats.grossProfit, icon: Scale, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: lang === 'fr' ? 'Dépenses totales' : 'المصروفات الكلية', value: stats.totalExpenses, icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
          { label: lang === 'fr' ? 'Profit net global' : 'صافي الربح العام النهائي', value: stats.netProfit, icon: TrendingUp, color: stats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600', bg: stats.netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-rose-50 dark:bg-rose-950/30' },
          { label: lang === 'fr' ? 'Dettes non payées' : 'إجمالي الديون المعلقة', value: stats.totalUnpaidDebts, icon: CreditCard, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/30' }
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${bg}`}>
                <Icon size={14} className={color} />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight truncate">{label}</span>
            </div>
            <p className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
              {fmt(value)}
            </p>
          </div>
        ))}
      </div>

      {/* ── ⭐ DEDICATED MONTHLY PROFIT SECTION (بطاقة الربح الشهري المستقلة) ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-md space-y-6 relative overflow-hidden">
        {/* Top Control Bar with Month Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Calendar size={20} />
              </span>
              <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {lang === 'fr' ? 'Analyse du Profit par Mois' : 'تقرير وصافي أرباح الشهر المحدد'}
              </h4>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {lang === 'fr'
                ? 'Consultez la rentabilité détaillée, le coût d\'achat et les dépenses propres à chaque mois'
                : 'تفاصيل دقيقة لصافي الأرباح، المبيعات، وتكاليف البضاعة والمصاريف الخاصة بكل شهر بشكل منفصل'}
            </p>
          </div>

          {/* Month Navigator & Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => handleNavMonth('prev')}
              disabled={stats.monthsList.findIndex((m) => m.key === selectedMonthData.key) >= stats.monthsList.length - 1}
              className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-2xs cursor-pointer"
              title={lang === 'fr' ? 'Mois précédent' : 'الشهر السابق'}
            >
              {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            <select
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100 px-3 py-1.5 focus:outline-hidden cursor-pointer"
            >
              {stats.monthsList.map((m) => (
                <option key={m.key} value={m.key} className="dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                  {m.label} {m.key === currentMonthKey ? (lang === 'fr' ? '(Mois en cours)' : '(الشهر الحالي)') : ''}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleNavMonth('next')}
              disabled={stats.monthsList.findIndex((m) => m.key === selectedMonthData.key) <= 0}
              className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-2xs cursor-pointer"
              title={lang === 'fr' ? 'Mois suivant' : 'الشهر التالي'}
            >
              {isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        </div>

        {/* Highlighted Monthly Profit Banner */}
        <div className={`rounded-2xl p-5 sm:p-6 border transition-all ${
          isNetPositive
            ? 'bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-cyan-500/10 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-950 dark:text-emerald-100'
            : 'bg-gradient-to-br from-rose-500/10 via-red-500/5 to-amber-500/10 border-rose-200/60 dark:border-rose-800/40 text-rose-950 dark:text-rose-100'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  isNetPositive
                    ? 'bg-emerald-500 text-white'
                    : 'bg-rose-500 text-white'
                }`}>
                  {lang === 'fr' ? 'Profit Net Réel' : 'صافي الربح الصافي'}
                </span>
                <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                  {selectedMonthData.label}
                </span>
              </div>
              <p className={`text-2xl sm:text-4xl font-black tracking-tight ${
                isNetPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {fmt(selectedMonthData.netProfit)}
              </p>
            </div>

            {/* Monthly Badges & Indicators */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Profit Margin */}
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3.5 py-2 shadow-2xs">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                  {lang === 'fr' ? 'Marge nette' : 'هامش الربح'}
                </p>
                <p className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1">
                  <Percent size={13} className="text-brand-cyan" />
                  {selectedMonthData.marginPercent.toFixed(1)}%
                </p>
              </div>

              {/* Evolution vs previous month */}
              {selectedMonthData.changeVsPrevProfit !== null && (
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3.5 py-2 shadow-2xs">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    {lang === 'fr' ? 'Vs mois précédent' : 'مقارنة بالشهر السابق'}
                  </p>
                  <p className={`text-sm font-black flex items-center gap-1 ${
                    selectedMonthData.changeVsPrevProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {selectedMonthData.changeVsPrevProfit >= 0 ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}
                    {selectedMonthData.changeVsPrevProfit > 0 ? `+${selectedMonthData.changeVsPrevProfit}%` : `${selectedMonthData.changeVsPrevProfit}%`}
                  </p>
                </div>
              )}

              {/* Orders count for this month */}
              <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/60 dark:border-slate-700/60 rounded-xl px-3.5 py-2 shadow-2xs">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                  {lang === 'fr' ? 'Commandes' : 'الطلبيات المكتملة'}
                </p>
                <p className="text-sm font-black text-slate-800 dark:text-white">
                  {selectedMonthData.orderCount} {lang === 'fr' ? 'commandes' : 'طلبية'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Pillars Grid for the Selected Month */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1 bg-cyan-100 dark:bg-cyan-950/50 text-brand-cyan rounded-md">
                <DollarSign size={14} />
              </div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tight">
                {lang === 'fr' ? 'Ventes du mois' : 'مبيعات الشهر'}
              </span>
            </div>
            <p className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
              {fmt(selectedMonthData.sales)}
            </p>
            {selectedMonthData.changeVsPrevSales !== null && (
              <p className={`text-[10px] font-bold mt-1 ${
                selectedMonthData.changeVsPrevSales >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {selectedMonthData.changeVsPrevSales >= 0 ? `+${selectedMonthData.changeVsPrevSales}%` : `${selectedMonthData.changeVsPrevSales}%`} {lang === 'fr' ? 'vs mois précédent' : 'مقارنة بالسابق'}
              </p>
            )}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md">
                <ShoppingBag size={14} />
              </div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tight">
                {lang === 'fr' ? 'Coût d\'achat (COGS)' : 'تكلفة شراء البضاعة'}
              </span>
            </div>
            <p className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
              {fmt(selectedMonthData.purchaseCost)}
            </p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">
              {selectedMonthData.sales > 0
                ? `${((selectedMonthData.purchaseCost / selectedMonthData.sales) * 100).toFixed(1)}% ${lang === 'fr' ? 'du CA' : 'من المبيعات'}`
                : '-'}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1 bg-blue-100 dark:bg-blue-950/50 text-blue-600 rounded-md">
                <Scale size={14} />
              </div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tight">
                {lang === 'fr' ? 'Marge brute' : 'الربح الإجمالي للشهر'}
              </span>
            </div>
            <p className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
              {fmt(selectedMonthData.grossProfit)}
            </p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">
              {lang === 'fr' ? 'Ventes - Achat' : 'المبيعات - تكلفة الشراء'}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1 bg-amber-100 dark:bg-amber-950/50 text-amber-600 rounded-md">
                <Calendar size={14} />
              </div>
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-tight">
                {lang === 'fr' ? 'Dépenses du mois' : 'مصاريف الشهر'}
              </span>
            </div>
            <p className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
              {fmt(selectedMonthData.expenses)}
            </p>
            <p className="text-[10px] text-slate-400 font-medium mt-1">
              {lang === 'fr' ? 'Charges opérationnelles' : 'المصروفات التشغيلية'}
            </p>
          </div>
        </div>

        {/* ── Monthly Breakdown History Table ─────────────────────────────── */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-black text-slate-500 uppercase tracking-wider">
              {lang === 'fr' ? 'Historique mensuel comparatif' : 'سجل المقارنة الشهرية لجميع الشهور'}
            </h5>
            <span className="text-[10px] font-bold text-slate-400">
              {stats.monthsList.length} {lang === 'fr' ? 'mois enregistrés' : 'شهر مسجل'}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
            <table className="w-full text-xs text-left rtl:text-right">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase font-black text-[10px]">
                <tr>
                  <th className="py-3 px-3.5">{lang === 'fr' ? 'Mois' : 'الشهر'}</th>
                  <th className="py-3 px-3.5">{lang === 'fr' ? 'Ventes' : 'المبيعات'}</th>
                  <th className="py-3 px-3.5">{lang === 'fr' ? 'Coût d\'achat' : 'تكلفة الشراء'}</th>
                  <th className="py-3 px-3.5">{lang === 'fr' ? 'Dépenses' : 'المصاريف'}</th>
                  <th className="py-3 px-3.5">{lang === 'fr' ? 'Profit Net' : 'صافي الربح'}</th>
                  <th className="py-3 px-3.5">{lang === 'fr' ? 'Marge' : 'الهامش'}</th>
                  <th className="py-3 px-3.5 text-center">{lang === 'fr' ? 'Action' : 'تفاصيل'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {stats.monthsList.map((m) => {
                  const isSelected = m.key === selectedMonthData.key;
                  const isPositive = m.netProfit >= 0;
                  return (
                    <tr
                      key={m.key}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-brand-cyan/10 dark:bg-brand-cyan/20 font-bold'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <td className="py-3 px-3.5 whitespace-nowrap font-black">
                        <div className="flex items-center gap-1.5">
                          {isSelected && <CheckCircle2 size={12} className="text-brand-cyan" />}
                          <span>{m.label}</span>
                          {m.key === currentMonthKey && (
                            <span className="text-[9px] bg-brand-cyan/20 text-brand-cyan px-1.5 py-0.2 rounded-md font-bold">
                              {lang === 'fr' ? 'Actuel' : 'الحالي'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">{fmt(m.sales)}</td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-slate-500">{fmt(m.purchaseCost)}</td>
                      <td className="py-3 px-3.5 whitespace-nowrap text-amber-600">{fmt(m.expenses)}</td>
                      <td className={`py-3 px-3.5 whitespace-nowrap font-black ${
                        isPositive ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {fmt(m.netProfit)}
                      </td>
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.marginPercent >= 20
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : m.marginPercent >= 0
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                        }`}>
                          {m.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedMonthKey(m.key)}
                          className={`text-xs font-black px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-brand-cyan text-white shadow-2xs'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-brand-cyan hover:text-white'
                          }`}
                        >
                          {isSelected ? (lang === 'fr' ? 'Sélectionné' : 'محدد') : (lang === 'fr' ? 'Afficher' : 'عرض')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Monthly Profit & Performance Evolution Chart ─────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
              {lang === 'fr' ? 'Évolution Mensuelle : Ventes, Dépenses & Profit Net' : 'مخطط التطور الشهري: المبيعات، المصاريف، وصافي الربح'}
            </h4>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {lang === 'fr' ? 'Visualisation comparative sur les 12 derniers mois' : 'رؤية بيانية مقارنة لآخر 12 شهراً'}
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-slate-800" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v: number, name: string) => [fmt(v), name]}
              labelFormatter={(_, items) => items?.[0]?.payload?.fullLabel || ''}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
            <Bar dataKey={lang === 'fr' ? 'Ventes' : 'المبيعات'} fill="#06b6d4" radius={[4, 4, 0, 0]} />
            <Bar dataKey={lang === 'fr' ? 'Dépenses' : 'المصاريف'} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey={lang === 'fr' ? 'Profit Net' : 'صافي الربح'} fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Products & Peak Days Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
          <h4 className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4">
            {lang === 'fr' ? 'Produits les plus vendus' : 'المنتجات الأكثر مبيعاً'}
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.topProducts} layout="vertical" margin={{ left: 8, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [v, lang === 'fr' ? 'Quantité' : 'الكمية']} />
              <Bar dataKey="qty" fill="#06b6d4" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 shadow-xs">
          <h4 className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-4">
            {lang === 'fr' ? 'Jours de forte activité' : 'أكثر الأيام ذروة'}
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={stats.peakDays}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-slate-800" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#b8963e"
                strokeWidth={2}
                dot={{ r: 4 }}
                name={lang === 'fr' ? 'Ventes' : 'المبيعات'}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
