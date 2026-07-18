import React, { useMemo } from 'react';
import { Order, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { MapPin, DollarSign, Users, TrendingUp } from 'lucide-react';

interface DoctorMapProps {
  doctors: UserProfile[];
  orders: Order[];
  lang: Language;
}

export default function DoctorMap({ doctors, orders, lang }: DoctorMapProps) {
  const isRtl = lang === 'ar';

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' دج';
  };

  // Calculate statistics per wilaya
  const wilayaStats = useMemo(() => {
    const stats = new Map<string, {
      doctorCount: number;
      totalSales: number;
      orderCount: number;
      wilayaName: string;
    }>();

    // Initialize with all wilayas
    doctors.forEach(doctor => {
      if (doctor.wilayaCode && doctor.wilayaName) {
        stats.set(doctor.wilayaCode, {
          doctorCount: 0,
          totalSales: 0,
          orderCount: 0,
          wilayaName: doctor.wilayaName
        });
      }
    });

    // Count doctors per wilaya
    doctors.forEach(doctor => {
      if (doctor.wilayaCode && stats.has(doctor.wilayaCode)) {
        const existing = stats.get(doctor.wilayaCode)!;
        stats.set(doctor.wilayaCode, {
          ...existing,
          doctorCount: existing.doctorCount + 1
        });
      }
    });

    // Calculate sales per wilaya
    orders.forEach(order => {
      const doctor = doctors.find(d => d.uid === order.userId);
      if (doctor?.wilayaCode && stats.has(doctor.wilayaCode)) {
        const existing = stats.get(doctor.wilayaCode)!;
        stats.set(doctor.wilayaCode, {
          ...existing,
          totalSales: existing.totalSales + order.totalAfterDiscount,
          orderCount: existing.orderCount + 1
        });
      }
    });

    // Convert to array and sort by total sales
    return Array.from(stats.entries())
      .map(([code, data]) => ({ code, ...data }))
      .filter(w => w.doctorCount > 0)
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [doctors, orders]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const totalDoctors = doctors.length;
    const totalSales = orders.reduce((sum, order) => sum + order.totalAfterDiscount, 0);
    const totalOrders = orders.length;
    const avgSalesPerDoctor = totalDoctors > 0 ? totalSales / totalDoctors : 0;

    return { totalDoctors, totalSales, totalOrders, avgSalesPerDoctor };
  }, [doctors, orders]);

  // Get top performing wilayas
  const topWilayas = wilayaStats.slice(0, 5);
  const totalWilayas = wilayaStats.length;

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 rounded-xl">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                {lang === 'fr' ? 'Total Médecins' : 'إجمالي الأطباء'}
              </p>
              <p className="text-2xl font-black text-blue-900 dark:text-blue-100">
                {overallStats.totalDoctors}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 rounded-xl">
              <DollarSign size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                {lang === 'fr' ? 'Ventes Totales' : 'إجمالي المبيعات'}
              </p>
              <p className="text-2xl font-black text-emerald-900 dark:text-emerald-100">
                {formatPrice(overallStats.totalSales)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-2xl border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-xl">
              <MapPin size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                {lang === 'fr' ? 'Wilayas Actives' : 'الولايات النشطة'}
              </p>
              <p className="text-2xl font-black text-purple-900 dark:text-purple-100">
                {totalWilayas}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 p-4 rounded-2xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-xl">
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold">
                {lang === 'fr' ? 'Moyenne/Docteur' : 'المتوسط/طبيب'}
              </p>
              <p className="text-2xl font-black text-amber-900 dark:text-amber-100">
                {formatPrice(overallStats.avgSalesPerDoctor)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Wilaya Distribution Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin size={20} className="text-brand-cyan" />
            {lang === 'fr' ? 'Distribution par Wilaya' : 'التوزيع حسب الولاية'}
          </h3>
        </div>

        {wilayaStats.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <MapPin size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm">
              {lang === 'fr' ? 'Aucune donnée disponible' : 'لا توجد بيانات متاحة'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr className="text-xs font-extrabold text-slate-500 uppercase">
                  <th className="px-6 py-4 text-left">
                    {lang === 'fr' ? 'Wilaya' : 'الولاية'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {lang === 'fr' ? 'Code' : 'الرمز'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {lang === 'fr' ? 'Médecins' : 'الأطباء'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {lang === 'fr' ? 'Commandes' : 'الطلبات'}
                  </th>
                  <th className="px-6 py-4 text-right">
                    {lang === 'fr' ? 'Ventes Totales' : 'إجمالي المبيعات'}
                  </th>
                  <th className="px-6 py-4 text-right">
                    {lang === 'fr' ? 'Moyenne/Docteur' : 'المتوسط/طبيب'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {wilayaStats.map((wilaya, index) => {
                  const avgPerDoctor = wilaya.doctorCount > 0 ? wilaya.totalSales / wilaya.doctorCount : 0;
                  const isTop = index < 3;
                  
                  return (
                    <tr 
                      key={wilaya.code} 
                      className={`text-sm hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors ${
                        isTop ? 'bg-brand-cyan/5' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {isTop && (
                            <span className="w-6 h-6 flex items-center justify-center bg-brand-cyan text-white text-xs font-bold rounded-full">
                              {index + 1}
                            </span>
                          )}
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {wilaya.wilayaName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-500">
                        {wilaya.code}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          <Users size={12} />
                          {wilaya.doctorCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-500">
                        {wilaya.orderCount}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">
                        {formatPrice(wilaya.totalSales)}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500">
                        {formatPrice(avgPerDoctor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top Performing Wilayas */}
      {topWilayas.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-brand-cyan" />
            {lang === 'fr' ? 'Top Wilayas' : 'أعلى الولايات أداءً'}
          </h3>
          <div className="space-y-3">
            {topWilayas.map((wilaya, index) => {
              const percentage = overallStats.totalSales > 0 
                ? (wilaya.totalSales / overallStats.totalSales) * 100 
                : 0;
              
              return (
                <div key={wilaya.code} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-full ${
                        index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : 'bg-amber-700'
                      }`}>
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {wilaya.wilayaName}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {formatPrice(wilaya.totalSales)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-brand-cyan to-emerald-500 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
