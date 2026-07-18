import React, { useMemo } from 'react';
import { Order, Product } from '../types';
import { Language, getTranslation } from '../translations';
import { BarChart3, TrendingUp, Package, DollarSign, Calendar } from 'lucide-react';

interface DoctorAnalyticsProps {
  orders: Order[];
  lang: Language;
}

export default function DoctorAnalytics({ orders, lang }: DoctorAnalyticsProps) {
  const isRtl = lang === 'ar';

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' دج';
  };

  const analytics = useMemo(() => {
    // Filter only delivered orders
    const deliveredOrders = orders.filter(o => o.status === 'delivered');

    // Calculate most requested products
    const productFrequency = new Map<string, { name: string; count: number; revenue: number }>();
    deliveredOrders.forEach(order => {
      order.items.forEach(item => {
        const existing = productFrequency.get(item.name) || { name: item.name, count: 0, revenue: 0 };
        productFrequency.set(item.name, {
          name: item.name,
          count: existing.count + item.quantity,
          revenue: existing.revenue + (item.price * item.quantity)
        });
      });
    });

    const topProducts = Array.from(productFrequency.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate monthly spending
    const monthlySpending = new Map<string, number>();
    deliveredOrders.forEach(order => {
      const month = order.createdAt.substring(0, 7); // YYYY-MM
      const existing = monthlySpending.get(month) || 0;
      monthlySpending.set(month, existing + order.totalAfterDiscount);
    });

    const monthlyData = Array.from(monthlySpending.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6); // Last 6 months

    // Calculate average monthly spending
    const totalSpending = Array.from(monthlySpending.values()).reduce((a, b) => a + b, 0);
    const avgMonthlySpending = monthlyData.length > 0 ? totalSpending / monthlyData.length : 0;

    // Calculate total orders and revenue
    const totalOrders = deliveredOrders.length;
    const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.totalAfterDiscount, 0);

    return {
      topProducts,
      monthlyData,
      avgMonthlySpending,
      totalOrders,
      totalRevenue
    };
  }, [orders]);

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
        <p className="text-sm">
          {lang === 'fr' ? 'Aucune donnée disponible' : 'لا توجد بيانات متاحة'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-xl">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                {lang === 'fr' ? 'Commandes livrées' : 'الطلبات المسلمة'}
              </p>
              <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                {analytics.totalOrders}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-xl">
              <DollarSign size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                {lang === 'fr' ? 'Total dépensé' : 'إجمالي الإنفاق'}
              </p>
              <p className="text-2xl font-black text-blue-900 dark:text-blue-100">
                {formatPrice(analytics.totalRevenue)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-2xl border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-xl">
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                {lang === 'fr' ? 'Moyenne mensuelle' : 'المتوسط الشهري'}
              </p>
              <p className="text-2xl font-black text-purple-900 dark:text-purple-100">
                {formatPrice(analytics.avgMonthlySpending)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Most Requested Products */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Package size={20} className="text-brand-cyan" />
          {lang === 'fr' ? 'Produits les plus demandés' : 'المنتجات الأكثر طلباً'}
        </h3>
        <div className="space-y-3">
          {analytics.topProducts.map((product, index) => (
            <div key={product.name} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 flex items-center justify-center bg-brand-cyan text-white text-xs font-bold rounded-full">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {product.name}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {product.count}x
                </p>
                <p className="text-xs text-slate-500">
                  {formatPrice(product.revenue)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Spending */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-brand-cyan" />
          {lang === 'fr' ? 'Dépenses mensuelles' : 'الإنفاق الشهري'}
        </h3>
        <div className="space-y-3">
          {analytics.monthlyData.map(([month, amount]) => (
            <div key={month} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {month}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatPrice(amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
