import React, { useState, useMemo } from 'react';
import { Order, UserProfile } from '../types';
import { Language } from '../translations';
import {
  MapPin,
  DollarSign,
  Users,
  TrendingUp,
  Phone,
  Building2,
  Calendar,
  ShoppingBag,
  Search,
  X,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface DoctorMapProps {
  doctors: UserProfile[];
  orders: Order[];
  lang: Language;
}

type ActivityCategory = 'active' | 'medium' | 'inactive';

interface EnrichedDoctorActivity {
  doctor: UserProfile;
  category: ActivityCategory;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
}

export default function DoctorMap({ doctors, orders, lang }: DoctorMapProps) {
  const isRtl = lang === 'ar';
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | 'all' | null>('inactive');
  const [clinicSearchQuery, setClinicSearchQuery] = useState('');
  const [selectedWilayaFilter, setSelectedWilayaFilter] = useState<string>('all');

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(Math.round(num || 0)) + (isRtl ? ' دج' : ' DA');
  };

  // Enrich each doctor with their activity level, order count, total spent, and last order date
  const enrichedDoctors = useMemo<EnrichedDoctorActivity[]>(() => {
    const now = Date.now();
    const activeOrders = orders.filter((o) => o.status !== 'cancelled');

    return doctors.map((doc) => {
      const docOrders = activeOrders.filter((o) => o.userId === doc.uid);
      if (docOrders.length === 0) {
        return {
          doctor: doc,
          category: 'inactive' as ActivityCategory,
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: null,
          daysSinceLastOrder: null
        };
      }

      const sorted = [...docOrders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const lastOrder = sorted[0];
      const lastTime = new Date(lastOrder.createdAt).getTime();
      const diffDays = Math.max(0, Math.ceil((now - lastTime) / (1000 * 60 * 60 * 24)));
      const totalSpent = docOrders.reduce(
        (sum, o) => sum + Math.max(0, o.totalAfterDiscount - (Number(o.deliveryCost) || 0)),
        0
      );

      let category: ActivityCategory = 'inactive';
      if (diffDays <= 30) {
        category = 'active';
      } else if (diffDays <= 90) {
        category = 'medium';
      }

      return {
        doctor: doc,
        category,
        orderCount: docOrders.length,
        totalSpent,
        lastOrderDate: lastOrder.createdAt,
        daysSinceLastOrder: diffDays
      };
    });
  }, [doctors, orders]);

  // Calculate clinic activity status counts
  const doctorActivityStats = useMemo(() => {
    let activeCount = 0;
    let mediumCount = 0;
    let inactiveCount = 0;

    enrichedDoctors.forEach((item) => {
      if (item.category === 'active') activeCount++;
      else if (item.category === 'medium') mediumCount++;
      else inactiveCount++;
    });

    return { activeCount, mediumCount, inactiveCount };
  }, [enrichedDoctors]);

  // Filtered doctors for the interactive heatmap drill-down panel
  const displayedClinics = useMemo(() => {
    if (!selectedCategory) return [];
    const q = clinicSearchQuery.trim().toLowerCase();

    return enrichedDoctors
      .filter((item) => {
        if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
        if (selectedWilayaFilter !== 'all') {
          const docWilaya = item.doctor.wilayaName || item.doctor.location || '';
          if (!docWilaya.includes(selectedWilayaFilter)) return false;
        }
        if (!q) return true;
        return (
          (item.doctor.name || '').toLowerCase().includes(q) ||
          (item.doctor.clinicName || '').toLowerCase().includes(q) ||
          (item.doctor.phone || '').toLowerCase().includes(q) ||
          (item.doctor.location || '').toLowerCase().includes(q) ||
          (item.doctor.wilayaName || '').toLowerCase().includes(q) ||
          (item.doctor.communeName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (selectedCategory === 'active' || selectedCategory === 'medium') {
          return b.totalSpent - a.totalSpent;
        }
        // For inactive, sort those who ordered longest ago or never ordered
        const daysA = a.daysSinceLastOrder ?? 999999;
        const daysB = b.daysSinceLastOrder ?? 999999;
        return daysB - daysA;
      });
  }, [enrichedDoctors, selectedCategory, clinicSearchQuery, selectedWilayaFilter]);

  const availableWilayaNames = useMemo(() => {
    const set = new Set<string>();
    doctors.forEach((d) => {
      if (d.wilayaName) set.add(d.wilayaName);
    });
    return Array.from(set).sort();
  }, [doctors]);

  // Calculate statistics per wilaya
  const wilayaStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        doctorCount: number;
        totalSales: number;
        orderCount: number;
        wilayaName: string;
        activeClinics: number;
        mediumClinics: number;
        inactiveClinics: number;
      }
    >();

    // Initialize with all wilayas
    enrichedDoctors.forEach(({ doctor }) => {
      if (doctor.wilayaCode && doctor.wilayaName && !stats.has(doctor.wilayaCode)) {
        stats.set(doctor.wilayaCode, {
          doctorCount: 0,
          totalSales: 0,
          orderCount: 0,
          wilayaName: doctor.wilayaName,
          activeClinics: 0,
          mediumClinics: 0,
          inactiveClinics: 0
        });
      }
    });

    // Count doctors and activity breakdown per wilaya
    enrichedDoctors.forEach(({ doctor, category }) => {
      if (doctor.wilayaCode && stats.has(doctor.wilayaCode)) {
        const existing = stats.get(doctor.wilayaCode)!;
        stats.set(doctor.wilayaCode, {
          ...existing,
          doctorCount: existing.doctorCount + 1,
          activeClinics: existing.activeClinics + (category === 'active' ? 1 : 0),
          mediumClinics: existing.mediumClinics + (category === 'medium' ? 1 : 0),
          inactiveClinics: existing.inactiveClinics + (category === 'inactive' ? 1 : 0)
        });
      }
    });

    // Calculate sales per wilaya (excluding delivery fee and excluding cancelled orders)
    const activeOrders = orders.filter((order) => order.status !== 'cancelled');

    activeOrders.forEach((order) => {
      const doctor = doctors.find((d) => d.uid === order.userId);
      const targetWilayaCode = doctor?.wilayaCode || order.doctorWilayaCode;
      if (targetWilayaCode && stats.has(targetWilayaCode)) {
        const existing = stats.get(targetWilayaCode)!;
        const orderSales = Math.max(0, order.totalAfterDiscount - (Number(order.deliveryCost) || 0));
        stats.set(targetWilayaCode, {
          ...existing,
          totalSales: existing.totalSales + orderSales,
          orderCount: existing.orderCount + 1
        });
      }
    });

    // Convert to array and sort by total sales
    return Array.from(stats.entries())
      .map(([code, data]) => ({ code, ...data }))
      .filter((w) => w.doctorCount > 0)
      .sort((a, b) => b.totalSales - a.totalSales);
  }, [enrichedDoctors, doctors, orders]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const activeOrders = orders.filter((order) => order.status !== 'cancelled');
    const totalDoctors = doctors.length;
    const totalSales = activeOrders.reduce(
      (sum, order) => sum + Math.max(0, order.totalAfterDiscount - (Number(order.deliveryCost) || 0)),
      0
    );
    const totalOrders = activeOrders.length;
    const avgSalesPerDoctor = totalDoctors > 0 ? totalSales / totalDoctors : 0;

    return { totalDoctors, totalSales, totalOrders, avgSalesPerDoctor };
  }, [doctors, orders]);

  // Get top performing wilayas
  const topWilayas = wilayaStats.slice(0, 5);
  const totalWilayas = wilayaStats.length;

  const handleCardClick = (cat: ActivityCategory) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  };

  const getCategoryBadge = (cat: ActivityCategory, days: number | null) => {
    if (cat === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {lang === 'fr' ? 'Très Actif' : 'عيادة نشطة جداً'}
          {days !== null && (
            <span className="text-[10px] font-bold opacity-80">
              ({lang === 'fr' ? `il y a ${days}j` : `منذ ${days} يوم`})
            </span>
          )}
        </span>
      );
    }
    if (cat === 'medium') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          {lang === 'fr' ? 'Activité Moyenne' : 'نشاط متوسط'}
          {days !== null && (
            <span className="text-[10px] font-bold opacity-80">
              ({lang === 'fr' ? `il y a ${days}j` : `منذ ${days} يوم`})
            </span>
          )}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        {lang === 'fr' ? 'Inactif / À visiter' : 'متوقفة / تحتاج زيارة'}
        <span className="text-[10px] font-bold opacity-80">
          ({days !== null
            ? (lang === 'fr' ? `il y a ${days}j` : `منذ ${days} يوم`)
            : (lang === 'fr' ? 'Aucune commande' : 'لم تطلب بعد')})
        </span>
      </span>
    );
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sales Rep Field Activity & Clinic Heatmap Summary */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 p-6 rounded-3xl text-white shadow-xl border border-cyan-900/50 space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
          <div>
            <h3 className="text-lg font-black flex items-center gap-2 text-cyan-400">
              <TrendingUp size={20} />
              {lang === 'fr'
                ? 'Carte Thermique & Activité des Cabinets (Field Sales Heatmap)'
                : 'الخريطة الحرارية الميدانية ونشاط العيادات'}
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              {lang === 'fr'
                ? 'Cliquez sur une catégorie ci-dessous pour afficher et filtrer les cabinets correspondants'
                : 'اضغط على أي فئة أدناه لعرض قائمة العيادات التابعة لها والتفريق بينها بالتفصيل'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory((prev) => (prev === 'all' ? null : 'all'))}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                selectedCategory === 'all'
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-md'
                  : 'bg-slate-800/80 text-slate-200 border-slate-600 hover:bg-slate-700'
              }`}
            >
              {lang === 'fr' ? `Tous les cabinets (${doctors.length})` : `عرض جميع العيادات (${doctors.length})`}
            </button>
          </div>
        </div>

        {/* Interactive Heatmap Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 1. Very Active Clinics (<30d) */}
          <button
            type="button"
            onClick={() => handleCardClick('active')}
            className={`text-right rtl:text-right ltr:text-left p-4 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer border ${
              selectedCategory === 'active'
                ? 'bg-emerald-900/80 border-emerald-400 ring-2 ring-emerald-400/50 shadow-lg scale-[1.01]'
                : 'bg-emerald-950/40 border-emerald-500/30 hover:bg-emerald-900/50 hover:border-emerald-400/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
              <div>
                <p className="text-xs text-emerald-300 font-extrabold">
                  {lang === 'fr' ? 'Cabinets Très Actifs (<30j)' : 'عيادات نشطة جداً (<30 يوماً)'}
                </p>
                <p className="text-2xl font-black text-white mt-0.5">
                  {doctorActivityStats.activeCount}{' '}
                  <span className="text-xs font-normal text-emerald-300">
                    {lang === 'fr' ? 'cabinet(s)' : 'عيادة'}
                  </span>
                </p>
                <p className="text-[10px] text-emerald-200/80 mt-1 font-semibold">
                  {selectedCategory === 'active'
                    ? (lang === 'fr' ? '✓ Liste affichée ci-dessous' : '✓ القائمة معروضة بالأسفل')
                    : (lang === 'fr' ? 'Cliquez pour voir les cabinets' : 'اضغط لعرض العيادات النشطة')}
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-emerald-300 transition-transform ${selectedCategory === 'active' ? 'rotate-180' : ''}`}
            />
          </button>

          {/* 2. Medium Activity Clinics (30-90d) */}
          <button
            type="button"
            onClick={() => handleCardClick('medium')}
            className={`text-right rtl:text-right ltr:text-left p-4 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer border ${
              selectedCategory === 'medium'
                ? 'bg-amber-900/80 border-amber-400 ring-2 ring-amber-400/50 shadow-lg scale-[1.01]'
                : 'bg-amber-950/40 border-amber-500/30 hover:bg-amber-900/50 hover:border-amber-400/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-amber-500 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
              <div>
                <p className="text-xs text-amber-300 font-extrabold">
                  {lang === 'fr' ? 'Activité Moyenne (30-90j)' : 'نشاط متوسط (30-90 يوماً)'}
                </p>
                <p className="text-2xl font-black text-white mt-0.5">
                  {doctorActivityStats.mediumCount}{' '}
                  <span className="text-xs font-normal text-amber-300">
                    {lang === 'fr' ? 'cabinet(s)' : 'عيادة'}
                  </span>
                </p>
                <p className="text-[10px] text-amber-200/80 mt-1 font-semibold">
                  {selectedCategory === 'medium'
                    ? (lang === 'fr' ? '✓ Liste affichée ci-dessous' : '✓ القائمة معروضة بالأسفل')
                    : (lang === 'fr' ? 'Cliquez pour voir les cabinets' : 'اضغط لعرض عيادات النشاط المتوسط')}
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-amber-300 transition-transform ${selectedCategory === 'medium' ? 'rotate-180' : ''}`}
            />
          </button>

          {/* 3. Inactive / Needs Visit Clinics (>90d or 0 orders) */}
          <button
            type="button"
            onClick={() => handleCardClick('inactive')}
            className={`text-right rtl:text-right ltr:text-left p-4 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer border ${
              selectedCategory === 'inactive'
                ? 'bg-rose-900/80 border-rose-400 ring-2 ring-rose-400/50 shadow-lg scale-[1.01]'
                : 'bg-rose-950/40 border-rose-500/30 hover:bg-rose-900/50 hover:border-rose-400/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full bg-rose-500 shrink-0 shadow-[0_0_12px_rgba(244,63,94,0.8)]" />
              <div>
                <p className="text-xs text-rose-300 font-extrabold">
                  {lang === 'fr' ? 'Inactifs / À Visiter (>90j)' : 'متوقفة / تحتاج زيارة (>90 يوماً)'}
                </p>
                <p className="text-2xl font-black text-white mt-0.5">
                  {doctorActivityStats.inactiveCount}{' '}
                  <span className="text-xs font-normal text-rose-300">
                    {lang === 'fr' ? 'cabinet(s)' : 'عيادة'}
                  </span>
                </p>
                <p className="text-[10px] text-rose-200/80 mt-1 font-semibold">
                  {selectedCategory === 'inactive'
                    ? (lang === 'fr' ? '✓ Liste affichée ci-dessous' : '✓ القائمة معروضة بالأسفل')
                    : (lang === 'fr' ? 'Cliquez pour voir les cabinets' : 'اضغط لعرض العيادات التي تحتاج زيارة')}
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-rose-300 transition-transform ${selectedCategory === 'inactive' ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Interactive Drill-Down List for Selected Heatmap Category */}
      {selectedCategory && (
        <div
          className={`rounded-3xl border-2 p-5 md:p-6 bg-white dark:bg-slate-800 shadow-sm space-y-4 transition-all ${
            selectedCategory === 'active'
              ? 'border-emerald-300'
              : selectedCategory === 'medium'
              ? 'border-amber-300'
              : selectedCategory === 'inactive'
              ? 'border-rose-300'
              : 'border-cyan-300'
          }`}
        >
          {/* Panel Header & Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  selectedCategory === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedCategory === 'medium'
                    ? 'bg-amber-100 text-amber-700'
                    : selectedCategory === 'inactive'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-cyan-100 text-cyan-700'
                }`}
              >
                {selectedCategory === 'active' ? (
                  <CheckCircle2 size={22} />
                ) : selectedCategory === 'medium' ? (
                  <Clock size={22} />
                ) : selectedCategory === 'inactive' ? (
                  <AlertCircle size={22} />
                ) : (
                  <Users size={22} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                    {selectedCategory === 'active'
                      ? (lang === 'fr' ? 'Cabinets Très Actifs (<30 jours)' : 'قائمة العيادات النشطة جداً (طلبت خلال آخر 30 يوماً)')
                      : selectedCategory === 'medium'
                      ? (lang === 'fr' ? 'Cabinets à Activité Moyenne (30-90 jours)' : 'قائمة العيادات ذات النشاط المتوسط (آخر طلب بين 30 و 90 يوماً)')
                      : selectedCategory === 'inactive'
                      ? (lang === 'fr' ? 'Cabinets Inactifs / À Visiter (>90 jours ou sans commande)' : 'قائمة العيادات المتوقفة / تحتاج زيارة ميدانية (>90 يوماً أو لم تطلب بعد)')
                      : (lang === 'fr' ? 'Tous les Cabinets avec Statut d\'Activité' : 'جميع العيادات مصنفة حسب مستوى النشاط')}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-800">
                    {displayedClinics.length} {lang === 'fr' ? 'cabinet(s)' : 'عيادة'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedCategory === 'active'
                    ? (lang === 'fr' ? 'Clients réguliers ayant commandé récemment.' : 'زبائن دائمون ونشطون قاموا بالطلب مؤخراً.')
                    : selectedCategory === 'medium'
                    ? (lang === 'fr' ? 'Clients à relancer prochainement pour maintenir le rythme.' : 'عيادات ينصح بالتواصل معها قريباً لتنشيط الطلبات.')
                    : selectedCategory === 'inactive'
                    ? (lang === 'fr' ? 'Priorité commerciale : ces cabinets nécessitent une visite ou un appel.' : 'أولوية للمندوب التجاري: هذه العيادات تحتاج زيارة ميدانية أو اتصالاً لمعرفة احتياجاتها.')
                    : (lang === 'fr' ? 'Vue comparative de tous les cabinets inscrits.' : 'مقارنة شاملة لجميع العيادات المسجلة في المنصة.')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search inside category */}
              <div className="relative flex-1 sm:w-64">
                <Search size={15} className="absolute top-3 right-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={clinicSearchQuery}
                  onChange={(e) => setClinicSearchQuery(e.target.value)}
                  placeholder={lang === 'fr' ? 'Chercher médecin, clinique, tél...' : 'ابحث باسم الطبيب، العيادة، الهاتف...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-3 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              {/* Wilaya filter */}
              <select
                value={selectedWilayaFilter}
                onChange={(e) => setSelectedWilayaFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:outline-hidden focus:border-brand-cyan cursor-pointer"
              >
                <option value="all">{lang === 'fr' ? 'Toutes les Wilayas' : 'كل الولايات'}</option>
                {availableWilayaNames.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                title={lang === 'fr' ? 'Fermer la liste' : 'إغلاق القائمة'}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Clinics Grid / Table */}
          {displayedClinics.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Building2 size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-500">
                {lang === 'fr'
                  ? 'Aucun cabinet trouvé dans cette catégorie.'
                  : 'لا توجد عيادات مطابقة في هذه الفئة حالياً.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[520px] overflow-y-auto p-1">
              {displayedClinics.map(({ doctor, category, orderCount, totalSpent, lastOrderDate, daysSinceLastOrder }) => {
                const borderStyle =
                  category === 'active'
                    ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-400'
                    : category === 'medium'
                    ? 'border-amber-200 bg-amber-50/30 hover:border-amber-400'
                    : 'border-rose-200 bg-rose-50/30 hover:border-rose-400';

                return (
                  <div
                    key={doctor.uid}
                    className={`rounded-2xl border p-4 transition-all flex flex-col justify-between gap-3 shadow-2xs ${borderStyle}`}
                  >
                    <div className="space-y-2">
                      {/* Top row: Name + Activity Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h5 className="font-black text-slate-900 text-sm leading-snug">
                            {doctor.name}
                          </h5>
                          <p className="text-xs font-bold text-slate-600 flex items-center gap-1 mt-0.5">
                            <Building2 size={13} className="text-brand-cyan shrink-0" />
                            <span>{doctor.clinicName || (lang === 'fr' ? 'Cabinet Dentaire' : 'عيادة طب الأسنان')}</span>
                          </p>
                        </div>
                        {getCategoryBadge(category, daysSinceLastOrder)}
                      </div>

                      {/* Location & Phone */}
                      <div className="space-y-1 text-xs text-slate-600 pt-1">
                        <p className="flex items-center gap-1.5 font-medium">
                          <MapPin size={13} className="text-slate-400 shrink-0" />
                          <span>
                            {doctor.wilayaName
                              ? `${doctor.wilayaName}${doctor.communeName ? ` — ${doctor.communeName}` : ''}`
                              : doctor.location || (lang === 'fr' ? 'Non spécifié' : 'العنوان غير محدد')}
                          </span>
                        </p>
                        {doctor.phone && (
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                              <Phone size={13} className="text-emerald-600 shrink-0" />
                              {doctor.phone}
                            </span>
                            <a
                              href={`tel:${doctor.phone}`}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold transition-colors flex items-center gap-1"
                            >
                              <Phone size={10} />
                              {lang === 'fr' ? 'Appeler' : 'اتصال'}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer metrics: Orders, Total Sales, Last Order Date */}
                    <div className="pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-600">
                      <span className="flex items-center gap-1 font-bold">
                        <ShoppingBag size={12} className="text-brand-cyan" />
                        {orderCount} {lang === 'fr' ? 'cmd(s)' : 'طلبات'}
                      </span>
                      <span className="font-extrabold text-slate-900">{formatPrice(totalSpent)}</span>
                      <span className="flex items-center gap-1 text-slate-500 font-semibold">
                        <Calendar size={12} />
                        {lastOrderDate
                          ? new Date(lastOrderDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')
                          : (lang === 'fr' ? 'Jamais commandé' : 'بدون طلبات')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
              <p className="text-2xl font-black text-purple-900 dark:text-blue-100">
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
                  <th className="px-6 py-4 text-left rtl:text-right">
                    {lang === 'fr' ? 'Wilaya' : 'الولاية'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {lang === 'fr' ? 'Code' : 'الرمز'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {lang === 'fr' ? 'Médecins' : 'الأطباء'}
                  </th>
                  <th className="px-6 py-4 text-center">
                    {lang === 'fr' ? 'État d\'Activité' : 'تفصيل النشاط'}
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
                      onClick={() => {
                        setSelectedCategory('all');
                        setSelectedWilayaFilter(wilaya.wilayaName);
                      }}
                      className={`text-sm hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer ${
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
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {wilaya.wilayaName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-500">
                        {wilaya.code}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          <Users size={12} />
                          {wilaya.doctorCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold">
                          <span
                            className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                            title={lang === 'fr' ? 'Très actifs' : 'نشطة جداً'}
                          >
                            🟢 {wilaya.activeClinics}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
                            title={lang === 'fr' ? 'Activité moyenne' : 'نشاط متوسط'}
                          >
                            🟡 {wilaya.mediumClinics}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700"
                            title={lang === 'fr' ? 'Inactifs / À visiter' : 'متوقفة / تحتاج زيارة'}
                          >
                            🔴 {wilaya.inactiveClinics}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-slate-500 font-bold">
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
              const percentage =
                overallStats.totalSales > 0
                  ? (wilaya.totalSales / overallStats.totalSales) * 100
                  : 0;

              return (
                <div key={wilaya.code} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded-full ${
                          index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-slate-400' : 'bg-amber-700'
                        }`}
                      >
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
