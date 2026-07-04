import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import { Order, Expense } from '../../types';
import { Language, getTranslation } from '../../translations';
import { TrendingUp, Package, Calendar, DollarSign } from 'lucide-react';

interface AnalyticsDashboardProps {
  lang: Language;
  ordersList: Order[];
  expensesList: Expense[];
}

export default function AnalyticsDashboard({ lang, ordersList, expensesList }: AnalyticsDashboardProps) {
  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(Math.round(n)) +
    ' ' + getTranslation(lang, 'currency');

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const activeOrders = ordersList.filter((o) => o.status !== 'cancelled');

    const monthSales = (m: number, y: number) =>
      activeOrders
        .filter((o) => {
          const d = new Date(o.createdAt);
          return d.getMonth() === m && d.getFullYear() === y;
        })
        .reduce((s, o) => s + o.totalAfterDiscount, 0);

    const currentMonthSales = monthSales(thisMonth, thisYear);
    const previousMonthSales = monthSales(lastMonth, lastMonthYear);
    const monthChange =
      previousMonthSales > 0
        ? Math.round(((currentMonthSales - previousMonthSales) / previousMonthSales) * 100)
        : 0;

    const totalSales = activeOrders.reduce((s, o) => s + o.totalAfterDiscount, 0);
    const totalExpenses = expensesList.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalSales - totalExpenses;

    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    activeOrders.forEach((o) => {
      o.items.forEach((item) => {
        const cur = productMap.get(item.productId) || { name: item.name, qty: 0, revenue: 0 };
        cur.qty += item.quantity;
        cur.revenue += item.price * item.quantity;
        productMap.set(item.productId, cur);
      });
    });
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)
      .map((p) => ({ name: p.name.length > 22 ? p.name.slice(0, 22) + '…' : p.name, qty: p.qty, revenue: p.revenue }));

    const dayMap = new Map<string, number>();
    activeOrders.forEach((o) => {
      const key = new Date(o.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
        weekday: 'short', day: '2-digit', month: 'short'
      });
      dayMap.set(key, (dayMap.get(key) || 0) + o.totalAfterDiscount);
    });
    const peakDays = [...dayMap.entries()]
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);

    const monthCompare = [
      {
        label: lang === 'fr' ? 'Mois précédent' : 'الشهر السابق',
        sales: previousMonthSales
      },
      {
        label: lang === 'fr' ? 'Mois actuel' : 'الشهر الحالي',
        sales: currentMonthSales
      }
    ];

    return { totalSales, totalExpenses, netProfit, monthChange, topProducts, peakDays, monthCompare, currentMonthSales, previousMonthSales };
  }, [ordersList, expensesList, lang]);

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <TrendingUp size={20} className="text-brand-cyan" />
          {lang === 'fr' ? 'Tableau de Bord Analytique' : 'لوحة التحكم التحليلية'}
        </h3>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: lang === 'fr' ? 'Ventes totales' : 'إجمالي المبيعات', value: stats.totalSales, icon: DollarSign, color: 'text-brand-cyan' },
          { label: lang === 'fr' ? 'Dépenses' : 'المصروفات', value: stats.totalExpenses, icon: Calendar, color: 'text-amber-600' },
          { label: lang === 'fr' ? 'Profit net' : 'صافي الربح', value: stats.netProfit, icon: TrendingUp, color: stats.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600' },
          { label: lang === 'fr' ? 'Évolution mensuelle' : 'تغير شهري', value: stats.monthChange, icon: Package, color: 'text-violet-600', suffix: '%' }
        ].map(({ label, value, icon: Icon, color, suffix }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={14} className={color} />
              <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
            </div>
            <p className="font-black text-slate-900 text-lg">
              {suffix ? `${value > 0 ? '+' : ''}${value}${suffix}` : fmt(value)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <h4 className="text-xs font-extrabold text-slate-500 uppercase mb-4">
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

        <div className="bg-white border border-slate-100 rounded-2xl p-4">
          <h4 className="text-xs font-extrabold text-slate-500 uppercase mb-4">
            {lang === 'fr' ? 'Comparaison mensuelle' : 'مقارنة المبيعات الشهرية'}
          </h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.monthCompare}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-4 lg:col-span-2">
          <h4 className="text-xs font-extrabold text-slate-500 uppercase mb-4">
            {lang === 'fr' ? 'Jours de forte activité' : 'أكثر الأيام ذروة'}
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={stats.peakDays}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#b8963e" strokeWidth={2} dot={{ r: 4 }} name={lang === 'fr' ? 'Ventes' : 'المبيعات'} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
