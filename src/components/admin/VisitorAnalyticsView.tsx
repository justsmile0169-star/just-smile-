import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { Order, Product, UserProfile, VisitorSession } from '../../types';
import { Language } from '../../translations';
import { getLocalDateKey, subscribeToVisitorSessions } from '../../utils/visitorAnalytics';
import {
  Users, Eye, ShoppingCart, TrendingUp, TrendingDown, Clock, Phone,
  Stethoscope, Sparkles, Flame, Calendar, Smartphone, Monitor, Package,
  CheckCircle2, AlertCircle, Search
} from 'lucide-react';

interface VisitorAnalyticsViewProps {
  lang: Language;
  ordersList: Order[];
  productsList: Product[];
  usersList: UserProfile[];
}

export default function VisitorAnalyticsView({
  lang,
  ordersList,
  productsList,
  usersList
}: VisitorAnalyticsViewProps) {
  const isRtl = lang === 'ar';
  const [sessions, setSessions] = useState<VisitorSession[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'doctors' | 'guests' | 'with_cart'>('all');
  const [radarSearch, setRadarSearch] = useState('');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const unsub = subscribeToVisitorSessions((list) => {
      setSessions(list);
    }, 500);
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const formatPrice = (p: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(Math.round(p)) +
    (lang === 'fr' ? ' DA' : ' دج');

  const formatRelativeTime = (iso: string) => {
    const diffMs = Math.max(0, nowTick - new Date(iso).getTime());
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return lang === 'fr' ? 'À l’instant' : 'الآن';
    if (mins < 60) return lang === 'fr' ? `Il y a ${mins} min` : `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return lang === 'fr' ? `Il y a ${hours}h` : `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return lang === 'fr' ? `Il y a ${days}j` : `منذ ${days} يوم`;
  };

  const analytics = useMemo(() => {
    const now = new Date(nowTick);
    const todayKey = getLocalDateKey(now);

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayKey = getLocalDateKey(yesterdayDate);

    const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgoMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
    const fiveMinsAgoMs = now.getTime() - 5 * 60 * 1000;

    // 1. Live active visitors (active in last 5 minutes)
    const liveVisitors = sessions.filter((s) => {
      const t = new Date(s.lastActiveAt).getTime();
      return !isNaN(t) && t >= fiveMinsAgoMs;
    });
    const liveDoctors = liveVisitors.filter((s) => s.isDoctor);
    const liveGuests = liveVisitors.filter((s) => !s.isDoctor);

    // 2. Today vs Yesterday
    const todaySessions = sessions.filter((s) => s.dateKey === todayKey);
    const yesterdaySessions = sessions.filter((s) => s.dateKey === yesterdayKey);

    const todayUnique = todaySessions.length;
    const yesterdayUnique = yesterdaySessions.length;
    const todayPageViews = todaySessions.reduce((acc, s) => acc + (s.pageViews || 1), 0);
    const todayDoctorsCount = todaySessions.filter((s) => s.isDoctor).length;
    const todayGuestsCount = todayUnique - todayDoctorsCount;

    let todayVsYesterdayPct: number | null = null;
    if (yesterdayUnique > 0) {
      todayVsYesterdayPct = Math.round(((todayUnique - yesterdayUnique) / yesterdayUnique) * 100);
    }

    // 3. Weekly (7d) & Monthly (30d) Unique Visitors
    const unique7dIds = new Set<string>();
    const unique7dDoctors = new Set<string>();
    const unique30dIds = new Set<string>();
    const unique30dDoctors = new Set<string>();
    let total30dPageViews = 0;

    sessions.forEach((s) => {
      const t = new Date(s.lastActiveAt).getTime();
      if (isNaN(t)) return;
      if (t >= sevenDaysAgoMs) {
        unique7dIds.add(s.visitorId);
        if (s.isDoctor) unique7dDoctors.add(s.visitorId);
      }
      if (t >= thirtyDaysAgoMs) {
        unique30dIds.add(s.visitorId);
        if (s.isDoctor) unique30dDoctors.add(s.visitorId);
        total30dPageViews += s.pageViews || 1;
      }
    });

    // 4. Conversion Rate (Orders vs Visitors)
    const activeOrders = (ordersList || []).filter((o) => o.status !== 'cancelled');
    const todayOrdersCount = activeOrders.filter(
      (o) => o.createdAt && getLocalDateKey(new Date(o.createdAt)) === todayKey
    ).length;

    const orders7dCount = activeOrders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return !isNaN(t) && t >= sevenDaysAgoMs;
    }).length;

    const conversionTodayPct = todayUnique > 0 ? Math.min(100, Math.round((todayOrdersCount / todayUnique) * 100)) : 0;
    const conversion7dPct =
      unique7dIds.size > 0 ? Math.min(100, Math.round((orders7dCount / unique7dIds.size) * 100)) : 0;

    // 5. Most Viewed Products (across all recorded sessions)
    const productViewsMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string;
        viewsCount: number;
        uniqueViewers: Set<string>;
        doctorViewers: Set<string>;
      }
    >();

    sessions.forEach((s) => {
      if (!Array.isArray(s.viewedProducts)) return;
      s.viewedProducts.forEach((vp) => {
        if (!vp.productId) return;
        const existing = productViewsMap.get(vp.productId) || {
          productId: vp.productId,
          productName: vp.productName || 'Produit',
          category: vp.category || '',
          viewsCount: 0,
          uniqueViewers: new Set<string>(),
          doctorViewers: new Set<string>()
        };
        existing.viewsCount += 1;
        existing.uniqueViewers.add(s.visitorId);
        if (s.isDoctor && s.doctorName) {
          existing.doctorViewers.add(s.doctorName);
        }
        productViewsMap.set(vp.productId, existing);
      });
    });

    // Count actual orders per product
    const productOrdersMap = new Map<string, number>();
    activeOrders.forEach((o) => {
      (o.items || []).forEach((it) => {
        if (it.productId) {
          productOrdersMap.set(it.productId, (productOrdersMap.get(it.productId) || 0) + (it.quantity || 1));
        }
      });
    });

    const mostViewedProducts = Array.from(productViewsMap.values())
      .map((item) => {
        const prod = productsList.find((p) => p.id === item.productId);
        const soldUnits = productOrdersMap.get(item.productId) || 0;
        return {
          productId: item.productId,
          name: prod?.name || item.productName,
          category: prod?.category || item.category,
          image: prod?.image || '',
          price: prod?.price || 0,
          stock: prod?.stock ?? 0,
          viewsCount: item.viewsCount,
          uniqueViewersCount: item.uniqueViewers.size,
          doctorNames: Array.from(item.doctorViewers),
          soldUnits,
          needsPromo: item.viewsCount >= 2 && soldUnits === 0
        };
      })
      .sort((a, b) => b.viewsCount - a.viewsCount || b.uniqueViewersCount - a.uniqueViewersCount)
      .slice(0, 10);

    // 6. Sales Radar: Registered Doctors who browsed recently WITHOUT placing an order after their visit
    const doctorLatestSessionMap = new Map<string, VisitorSession>();
    sessions.forEach((s) => {
      if (!s.isDoctor || !s.doctorId) return;
      const existing = doctorLatestSessionMap.get(s.doctorId);
      if (!existing || new Date(s.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()) {
        doctorLatestSessionMap.set(s.doctorId, s);
      }
    });

    const salesRadarDoctors = Array.from(doctorLatestSessionMap.values())
      .map((sess) => {
        const docProfile = usersList.find((u) => u.uid === sess.doctorId);
        const docOrders = activeOrders.filter((o) => o.userId === sess.doctorId);
        const lastOrderTime =
          docOrders.length > 0
            ? Math.max(...docOrders.map((o) => new Date(o.createdAt).getTime() || 0))
            : 0;
        const lastVisitTime = new Date(sess.lastActiveAt).getTime() || 0;
        const orderedSinceVisit = lastOrderTime >= new Date(sess.firstVisitAt).getTime();

        return {
          session: sess,
          doctorId: sess.doctorId!,
          doctorName: docProfile?.name || sess.doctorName || 'طبيب مسجل',
          doctorClinic: docProfile?.clinicName || sess.doctorClinic || '',
          doctorPhone: docProfile?.phone || sess.doctorPhone || '',
          wilayaName: docProfile?.wilayaName || docProfile?.location || sess.wilayaName || '',
          lastActiveAt: sess.lastActiveAt,
          lastVisitTime,
          pageViews: sess.pageViews || 1,
          cartItemsCount: sess.cartItemsCount || 0,
          viewedProducts: sess.viewedProducts || [],
          orderedSinceVisit,
          totalOrdersCount: docOrders.length
        };
      })
      .sort((a, b) => {
        // Prioritize doctors who have NOT ordered since their visit and have items in cart
        if (a.orderedSinceVisit !== b.orderedSinceVisit) {
          return a.orderedSinceVisit ? 1 : -1;
        }
        return b.lastVisitTime - a.lastVisitTime;
      });

    // 7. Daily Traffic Chart (Last 14 Days)
    const dailyTraffic: Array<{
      dateKey: string;
      label: string;
      visitors: number;
      doctors: number;
      pageViews: number;
    }> = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dKey = getLocalDateKey(d);
      const daySessions = sessions.filter((s) => s.dateKey === dKey);
      const label = d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
        day: '2-digit',
        month: 'short'
      });
      dailyTraffic.push({
        dateKey: dKey,
        label,
        visitors: daySessions.length,
        doctors: daySessions.filter((s) => s.isDoctor).length,
        pageViews: daySessions.reduce((acc, s) => acc + (s.pageViews || 1), 0)
      });
    }

    // 8. Peak Hours Distribution (00:00 to 23:00)
    const hourCounts = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      visits: 0
    }));

    sessions.forEach((s) => {
      const h = typeof s.hourOfDay === 'number' ? s.hourOfDay : new Date(s.lastActiveAt).getHours();
      if (h >= 0 && h < 24) {
        hourCounts[h].visits += 1;
      }
    });

    const peakHourObj = [...hourCounts].sort((a, b) => b.visits - a.visits)[0];

    return {
      liveVisitors,
      liveDoctors,
      liveGuests,
      todayUnique,
      yesterdayUnique,
      todayPageViews,
      todayDoctorsCount,
      todayGuestsCount,
      todayVsYesterdayPct,
      unique7dCount: unique7dIds.size,
      unique7dDoctorsCount: unique7dDoctors.size,
      unique30dCount: unique30dIds.size,
      unique30dDoctorsCount: unique30dDoctors.size,
      total30dPageViews,
      todayOrdersCount,
      orders7dCount,
      conversionTodayPct,
      conversion7dPct,
      mostViewedProducts,
      salesRadarDoctors,
      dailyTraffic,
      hourCounts,
      peakHourLabel: peakHourObj && peakHourObj.visits > 0 ? peakHourObj.label : '--:--'
    };
  }, [sessions, ordersList, productsList, usersList, nowTick, lang]);

  const filteredRadarDoctors = useMemo(() => {
    const q = radarSearch.trim().toLowerCase();
    if (!q) return analytics.salesRadarDoctors;
    return analytics.salesRadarDoctors.filter(
      (d) =>
        d.doctorName.toLowerCase().includes(q) ||
        d.doctorClinic.toLowerCase().includes(q) ||
        d.doctorPhone.toLowerCase().includes(q) ||
        d.wilayaName.toLowerCase().includes(q) ||
        d.viewedProducts.some((vp) => vp.productName.toLowerCase().includes(q))
    );
  }, [analytics.salesRadarDoctors, radarSearch]);

  const filteredLogSessions = useMemo(() => {
    return sessions
      .filter((s) => {
        if (logFilter === 'doctors') return s.isDoctor;
        if (logFilter === 'guests') return !s.isDoctor;
        if (logFilter === 'with_cart') return (s.cartItemsCount || 0) > 0;
        return true;
      })
      .slice(0, 40);
  }, [sessions, logFilter]);

  return (
    <div className="space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <span className="p-2 bg-brand-cyan/10 text-brand-cyan rounded-2xl">
              <Eye size={22} />
            </span>
            <span>
              {lang === 'fr'
                ? 'Analyse des Visiteurs & Radar Commercial'
                : 'إحصائيات الزوار ورادار المبيعات الذكي'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            {lang === 'fr'
              ? 'Suivez en temps réel le trafic de la plateforme, les produits les plus consultés et les médecins actifs.'
              : 'متابعة حية ومباشرة لعدد زوار المنصة، المنتجات الأكثر مشاهدة، والأطباء الذين يتصفحون المتجر الآن.'}
          </p>
        </div>

        {/* Live Active Status Pill */}
        <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-md self-start md:self-auto">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div className="text-xs">
            <span className="font-black text-emerald-400 text-sm">
              {analytics.liveVisitors.length}
            </span>{' '}
            <span className="font-bold text-slate-200">
              {lang === 'fr' ? 'en ligne maintenant' : 'يتصفحون المنصة الآن'}
            </span>
            <span className="block text-[10px] text-slate-400">
              {lang === 'fr'
                ? `${analytics.liveDoctors.length} médecins • ${analytics.liveGuests.length} visiteurs`
                : `${analytics.liveDoctors.length} أطباء مسجلون • ${analytics.liveGuests.length} زوار`}
            </span>
          </div>
        </div>
      </div>

      {/* Live Online Doctors Strip (if any doctor is browsing right now!) */}
      {analytics.liveDoctors.length > 0 && (
        <div className="bg-emerald-50/90 border-2 border-emerald-300 rounded-2xl p-4 space-y-2.5 animate-fade-in">
          <div className="flex items-center gap-2 text-emerald-900 font-black text-xs">
            <Stethoscope size={16} className="text-emerald-600" />
            <span>
              {lang === 'fr'
                ? 'Médecins connectés sur la boutique en ce moment :'
                : 'أطباء يتصفحون المتجر في هذه اللحظة :'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {analytics.liveDoctors.map((docSess) => (
              <div
                key={docSess.id}
                className="bg-white border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-3 shadow-2xs text-xs"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <p className="font-extrabold text-slate-800">
                    {docSess.doctorName || (lang === 'fr' ? 'Médecin' : 'طبيب')}
                    {docSess.doctorClinic && (
                      <span className="text-slate-500 font-bold"> ({docSess.doctorClinic})</span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {docSess.wilayaName && `${docSess.wilayaName} • `}
                    {lang === 'fr' ? `${docSess.pageViews} pages vues` : `تصفح ${docSess.pageViews} صفحات`}
                    {(docSess.cartItemsCount || 0) > 0 && (
                      <span className="text-emerald-700 font-black">
                        {' '}• 🛒 {docSess.cartItemsCount} {lang === 'fr' ? 'articles au panier' : 'منتجات بالسلة'}
                      </span>
                    )}
                  </p>
                </div>
                {docSess.doctorPhone && (
                  <a
                    href={`tel:${docSess.doctorPhone}`}
                    className="p-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors"
                    title={docSess.doctorPhone}
                  >
                    <Phone size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Unique Visitors */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500">
              {lang === 'fr' ? 'Visiteurs Aujourd’hui' : 'زوار اليوم (الفريدون)'}
            </span>
            <div className="p-2.5 bg-brand-cyan/10 text-brand-cyan rounded-xl">
              <Users size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-slate-900">{analytics.todayUnique}</h4>
            {analytics.todayVsYesterdayPct !== null && (
              <span
                className={`text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                  analytics.todayVsYesterdayPct >= 0
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {analytics.todayVsYesterdayPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {analytics.todayVsYesterdayPct >= 0 ? `+${analytics.todayVsYesterdayPct}%` : `${analytics.todayVsYesterdayPct}%`}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-bold flex items-center justify-between pt-1 border-t border-slate-200/60">
            <span>
              {lang === 'fr'
                ? `${analytics.todayDoctorsCount} médecins • ${analytics.todayGuestsCount} invités`
                : `${analytics.todayDoctorsCount} أطباء • ${analytics.todayGuestsCount} ضيوف`}
            </span>
            <span className="text-brand-cyan font-black">
              {analytics.todayPageViews} {lang === 'fr' ? 'vues' : 'تصفح'}
            </span>
          </div>
        </div>

        {/* Last 7 Days & 30 Days Visitors */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500">
              {lang === 'fr' ? 'Visiteurs (7j / 30j)' : 'الزوار (7 أيام / 30 يوماً)'}
            </span>
            <div className="p-2.5 bg-purple-100 text-purple-600 rounded-xl">
              <Calendar size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-slate-900">{analytics.unique7dCount}</h4>
            <span className="text-xs text-slate-400 font-bold">
              / {analytics.unique30dCount} ({lang === 'fr' ? '30j' : '30 يوم'})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-bold flex items-center justify-between pt-1 border-t border-slate-200/60">
            <span>
              {lang === 'fr'
                ? `${analytics.unique30dDoctorsCount} médecins actifs (30j)`
                : `${analytics.unique30dDoctorsCount} طبيب نشط خلال شهر`}
            </span>
            <span className="text-purple-700 font-black">
              {analytics.total30dPageViews} {lang === 'fr' ? 'pages' : 'مشاهدة'}
            </span>
          </div>
        </div>

        {/* Conversion Rate (Visitors -> Orders) */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500">
              {lang === 'fr' ? 'Taux de Conversion (7j)' : 'معدل التحويل للطلبيات (7 أيام)'}
            </span>
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
              <ShoppingCart size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-emerald-600">{analytics.conversion7dPct}%</h4>
            <span className="text-xs text-slate-500 font-bold">
              ({analytics.orders7dCount} {lang === 'fr' ? 'commandes' : 'طلبيات'})
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-bold flex items-center justify-between pt-1 border-t border-slate-200/60">
            <span>
              {lang === 'fr' ? 'Aujourd’hui :' : 'تحويل اليوم :'}
            </span>
            <span className="text-emerald-700 font-black">
              {analytics.todayOrdersCount} {lang === 'fr' ? 'cmd' : 'طلب'} ({analytics.conversionTodayPct}%)
            </span>
          </div>
        </div>

        {/* Peak Browsing Hour */}
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500">
              {lang === 'fr' ? 'Heure de Pointe (Pic)' : 'وقت الذروة لتصفح الأطباء'}
            </span>
            <div className="p-2.5 bg-amber-100 text-amber-600 rounded-xl">
              <Clock size={20} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h4 className="text-3xl font-black text-slate-900" dir="ltr">
              {analytics.peakHourLabel}
            </h4>
          </div>
          <div className="text-[11px] text-slate-500 font-bold pt-1 border-t border-slate-200/60">
            {lang === 'fr'
              ? 'Meilleur moment pour publier vos offres'
              : 'أفضل وقت لنشر العروض وإرسال الإشعارات'}
          </div>
        </div>
      </div>

      {/* 2. SALES RADAR: Registered Doctors Who Browsed Without Ordering */}
      <div className="bg-gradient-to-br from-amber-50/70 via-white to-cyan-50/40 rounded-3xl border border-amber-200/80 p-5 md:p-6 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-500 text-white rounded-xl shadow-2xs">
                <Sparkles size={18} />
              </span>
              <h4 className="text-base md:text-lg font-black text-slate-900">
                {lang === 'fr'
                  ? 'Radar Commercial : Médecins ayant consulté le catalogue récemment'
                  : 'رادار المبيعات الذكي : أطباء تصفحوا الكتالوج مؤخراً'}
              </h4>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              {lang === 'fr'
                ? 'Identifiez les médecins qui visitent la plateforme et consultent des produits sans encore valider de commande — idéal pour une relance téléphonique.'
                : 'يكشف لك الأطباء المسجلين الذين دخلوا المنصة وتفحصوا منتجات معينة أو تركوا منتجات في سلتهم دون إتمام الطلبية، ليتواصل معهم مندوب المبيعات في الوقت المثالي!'}
            </p>
          </div>

          <div className="relative w-full md:w-64 shrink-0">
            <Search size={14} className="absolute top-2.5 right-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={radarSearch}
              onChange={(e) => setRadarSearch(e.target.value)}
              placeholder={
                lang === 'fr'
                  ? 'Chercher médecin, wilaya, produit...'
                  : 'ابحث باسم الطبيب، الولاية، أو المنتج...'
              }
              className="w-full bg-white border border-slate-200 rounded-xl py-2 pr-8 pl-3 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
            />
          </div>
        </div>

        {filteredRadarDoctors.length === 0 ? (
          <div className="bg-white/80 rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 font-bold">
            {lang === 'fr'
              ? 'Aucune visite de médecin enregistrée pour le moment.'
              : 'لا توجد زيارات مسجلة للأطباء مطابقة للبحث حالياً.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
            {filteredRadarDoctors.slice(0, 20).map((item) => {
              const needsFollowUp = !item.orderedSinceVisit;
              return (
                <div
                  key={item.doctorId}
                  className={`p-4 rounded-2xl border bg-white flex flex-col justify-between gap-3 transition-all ${
                    needsFollowUp
                      ? 'border-amber-300 shadow-xs hover:border-amber-400'
                      : 'border-emerald-200 bg-emerald-50/20'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h5 className="font-black text-slate-900 text-sm">{item.doctorName}</h5>
                          {needsFollowUp ? (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                              <AlertCircle size={10} />
                              {lang === 'fr' ? 'Visite sans commande' : 'تصفح بدون طلبية'}
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              {lang === 'fr' ? 'A commandé' : 'أنجز طلبية'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-bold mt-0.5">
                          {item.doctorClinic}
                          {item.wilayaName ? ` • ${item.wilayaName}` : ''}
                        </p>
                      </div>

                      {item.doctorPhone && (
                        <a
                          href={`tel:${item.doctorPhone}`}
                          className="px-3 py-1.5 bg-brand-cyan text-white hover:bg-brand-cyan/90 rounded-xl text-[11px] font-black flex items-center gap-1.5 shrink-0 shadow-2xs transition-all"
                        >
                          <Phone size={12} />
                          <span dir="ltr">{item.doctorPhone}</span>
                        </a>
                      )}
                    </div>

                    {/* Visit metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                        🕒 {formatRelativeTime(item.lastActiveAt)}
                      </span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                        👁️ {item.pageViews} {lang === 'fr' ? 'pages vues' : 'صفحات متصفحة'}
                      </span>
                      {item.cartItemsCount > 0 && (
                        <span className="bg-rose-100 text-rose-700 font-black px-2 py-0.5 rounded-md">
                          🛒 {lang === 'fr' ? `Panier actif: ${item.cartItemsCount}` : `في سلته الآن: ${item.cartItemsCount} منتجات`}
                        </span>
                      )}
                    </div>

                    {/* Viewed Products Pills */}
                    {item.viewedProducts.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-100">
                        <span className="text-[10px] font-extrabold text-slate-400 block mb-1">
                          {lang === 'fr' ? 'Produits consultés récemment :' : 'المنتجات التي تصفحها الطبيب :'}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {item.viewedProducts.slice(0, 6).map((vp, idx) => (
                            <span
                              key={`${vp.productId}_${idx}`}
                              className="text-[10px] bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-lg font-bold truncate max-w-[180px]"
                              title={vp.productName}
                            >
                              {vp.productName}
                            </span>
                          ))}
                          {item.viewedProducts.length > 6 && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-lg font-bold">
                              +{item.viewedProducts.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. MOST VIEWED PRODUCTS & CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Viewed Products */}
        <div className="bg-slate-50 rounded-3xl border border-slate-200/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-slate-900 text-sm md:text-base flex items-center gap-2">
                <Flame size={18} className="text-rose-500" />
                <span>
                  {lang === 'fr'
                    ? 'Produits les Plus Consultés (Intérêt Client)'
                    : 'المنتجات الأكثر مشاهدة واهتماماً من الزوار'}
                </span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {lang === 'fr'
                  ? 'Comparaison entre le nombre de vues et les ventes réelles'
                  : 'مقارنة بين عدد مرات تفحص المنتج ومبيعاته الفعلية'}
              </p>
            </div>
          </div>

          {analytics.mostViewedProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400 font-bold">
              {lang === 'fr'
                ? 'Les produits consultés par les visiteurs apparaîtront ici.'
                : 'ستظهر هنا المنتجات الأكثر مشاهدة بمجرد تصفح الزوار لتفاصيل المنتجات.'}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {analytics.mostViewedProducts.map((prod, idx) => (
                <div
                  key={prod.productId}
                  className="bg-white p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 hover:border-brand-cyan/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-black text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                      {prod.image ? (
                        <img src={prod.image} alt={prod.name} className="w-full h-full object-contain" />
                      ) : (
                        <Package size={16} className="text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-extrabold text-xs text-slate-900 truncate">{prod.name}</p>
                        {prod.needsPromo && (
                          <span className="bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-black px-1.5 py-0.2 rounded-full">
                            🔥 {lang === 'fr' ? 'Fort intérêt / 0 vente' : 'اهتمام عالٍ - يقترح عمل تخفيض'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="font-bold">{prod.category}</span>
                        <span>•</span>
                        <span className="font-black text-brand-dark">{formatPrice(prod.price)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0 space-y-0.5">
                    <span className="inline-flex items-center gap-1 bg-brand-cyan/10 text-brand-cyan px-2.5 py-1 rounded-xl text-xs font-black">
                      <Eye size={12} />
                      {prod.viewsCount} {lang === 'fr' ? 'vues' : 'مشاهدة'}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-bold">
                      {prod.uniqueViewersCount} {lang === 'fr' ? 'visiteurs' : 'زائر'} • {prod.soldUnits}{' '}
                      {lang === 'fr' ? 'vendus' : 'مباع'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Charts Column: 14-Day Traffic & 24-Hour Peak Times */}
        <div className="space-y-6">
          {/* 14-Day Daily Visitors Chart */}
          <div className="bg-slate-50 rounded-3xl border border-slate-200/80 p-5 space-y-3">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <TrendingUp size={16} className="text-brand-cyan" />
              <span>
                {lang === 'fr'
                  ? 'Évolution des Visites (14 derniers jours)'
                  : 'تطور عدد الزوار والتصفح (آخر 14 يوماً)'}
              </span>
            </h4>
            <div className="h-44 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.dailyTraffic}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="visitors"
                    name={lang === 'fr' ? 'Visiteurs uniques' : 'الزوار الفريدون'}
                    fill="#06b6d4"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="doctors"
                    name={lang === 'fr' ? 'Médecins' : 'الأطباء المسجلون'}
                    fill="#8b5cf6"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 24-Hour Peak Browsing Hours Chart */}
          <div className="bg-slate-50 rounded-3xl border border-slate-200/80 p-5 space-y-3">
            <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              <span>
                {lang === 'fr'
                  ? 'Répartition par Heure de la Journée (24h)'
                  : 'توزيع الزوار حسب ساعات اليوم (أوقات الذروة)'}
              </span>
            </h4>
            <div className="h-40 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.hourCounts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="visits"
                    name={lang === 'fr' ? 'Sessions' : 'عدد الزيارات'}
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Recent Visitor Sessions Log */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-black text-slate-900 text-sm md:text-base flex items-center gap-2">
            <Users size={18} className="text-brand-cyan" />
            <span>
              {lang === 'fr' ? 'Journal des Dernières Visites' : 'سجل الزيارات المباشر وتفاصيل الجلسات'}
            </span>
          </h4>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', ar: 'جميع الزوار', fr: 'Tous' },
                { id: 'doctors', ar: 'أطباء مسجلون', fr: 'Médecins' },
                { id: 'guests', ar: 'زوار ضيوف', fr: 'Invités' },
                { id: 'with_cart', ar: 'لديهم سلة نشطة 🛒', fr: 'Avec panier 🛒' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLogFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  logFilter === tab.id
                    ? 'bg-brand-cyan text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {lang === 'fr' ? tab.fr : tab.ar}
              </button>
            ))}
          </div>
        </div>

        {filteredLogSessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl">
            {lang === 'fr' ? 'Aucune session trouvée.' : 'لا توجد جلسات مطابقة للفلتر المحدد.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left md:rtl:text-right border-collapse text-xs min-w-[650px]">
              <thead>
                <tr className="text-[11px] font-black text-slate-400 uppercase border-b border-slate-100">
                  <th className="pb-3">{lang === 'fr' ? 'Visiteur / Médecin' : 'الزائر / الطبيب'}</th>
                  <th className="pb-3">{lang === 'fr' ? 'Appareil' : 'الجهاز'}</th>
                  <th className="pb-3">{lang === 'fr' ? 'Pages vues' : 'مرات التصفح'}</th>
                  <th className="pb-3">{lang === 'fr' ? 'Produits vus' : 'المنتجات المتفحصة'}</th>
                  <th className="pb-3">{lang === 'fr' ? 'Dernière activité' : 'آخر تواجد'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLogSessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3">
                      {sess.isDoctor ? (
                        <div>
                          <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <Stethoscope size={13} className="text-brand-cyan" />
                            {sess.doctorName || (lang === 'fr' ? 'Médecin' : 'طبيب مسجل')}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {sess.doctorClinic}
                            {sess.wilayaName ? ` • ${sess.wilayaName}` : ''}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-bold text-slate-600">
                            {lang === 'fr' ? 'Visiteur Invité' : 'زائر ضيف (غير مسجل)'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            #{sess.visitorId.slice(-6)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                        {sess.deviceType === 'mobile' ? <Smartphone size={12} /> : <Monitor size={12} />}
                        {sess.deviceType === 'mobile'
                          ? (lang === 'fr' ? 'Mobile' : 'هاتف')
                          : (lang === 'fr' ? 'Ordinateur' : 'حاسوب')}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="font-extrabold text-slate-800">{sess.pageViews || 1}</span>
                      {(sess.cartItemsCount || 0) > 0 && (
                        <span className="ml-2 mr-2 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full">
                          🛒 {sess.cartItemsCount}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {sess.viewedProducts && sess.viewedProducts.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {sess.viewedProducts.slice(0, 3).map((vp, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold truncate max-w-[130px]"
                            >
                              {vp.productName}
                            </span>
                          ))}
                          {sess.viewedProducts.length > 3 && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              +{sess.viewedProducts.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3 font-bold text-slate-500">
                      {formatRelativeTime(sess.lastActiveAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

