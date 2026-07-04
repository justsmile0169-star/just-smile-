import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Product } from '../types';
import { Language, getTranslation } from '../translations';
import { 
  Calendar, AlertTriangle, Search, Filter, Percent, Check, X, 
  Sparkles, ShieldAlert, BadgeAlert, ArrowUpRight, TrendingDown 
} from 'lucide-react';
import { useAppDialog } from '../context/AppDialogContext';

interface ExpiryScannerProps {
  lang: Language;
  productsList: Product[];
  onRefreshData: () => void;
}

export default function ExpiryScanner({ 
  lang, 
  productsList, 
  onRefreshData 
}: ExpiryScannerProps) {
  const { alert } = useAppDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [liquidateProduct, setLiquidateProduct] = useState<Product | null>(null);
  const [discountValue, setDiscountValue] = useState<number>(30); // Default suggested 30% discount
  const [savingDiscount, setSavingDiscount] = useState(false);

  const isRtl = lang === 'ar';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse and calculate expiry details for all products having an expiry date
  const scannedProducts = productsList
    .map((p) => {
      if (!p.expiryDate) return null;
      
      const expiry = new Date(p.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      
      const diffTime = expiry.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let level: 'red' | 'yellow' | 'green' | 'none' = 'none';
      if (daysLeft <= 30) {
        level = 'red'; // Urgent / Expired
      } else if (daysLeft <= 60) {
        level = 'yellow'; // Warning
      } else if (daysLeft <= 90) {
        level = 'green'; // Moderate attention
      }

      return {
        ...p,
        daysLeft,
        level
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null && item.level !== 'none');

  // Counts
  const totalScanned = scannedProducts.length;
  const redCount = scannedProducts.filter((p) => p.level === 'red').length;
  const yellowCount = scannedProducts.filter((p) => p.level === 'yellow').length;
  const greenCount = scannedProducts.filter((p) => p.level === 'green').length;

  // Filtered lists
  const filteredProducts = scannedProducts.filter((p) => {
    // 1. Search term
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 2. Alert Level
    if (filterLevel === 'all') return matchesSearch;
    return p.level === filterLevel && matchesSearch;
  });

  // Handle setting discount for quick liquidation
  const handleApplyLiquidationDiscount = async () => {
    if (!liquidateProduct) return;
    setSavingDiscount(true);
    try {
      await updateDoc(doc(db, 'products', liquidateProduct.id), {
        discountPercent: discountValue
      });
      alert(
        lang === 'fr' 
          ? `Remise de ${discountValue}% appliquée avec succès à ${liquidateProduct.name} !` 
          : `تم تطبيق خصم ${discountValue}% بنجاح على ${liquidateProduct.name}!`
      );
      setLiquidateProduct(null);
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la mise à jour.' : 'خطأ أثناء التحديث.', 'error');
    } finally {
      setSavingDiscount(false);
    }
  };

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Header Widget */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-50 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-brand-cyan shrink-0 relative overflow-hidden">
            <span className="absolute inset-0 bg-brand-cyan/5 animate-pulse rounded-full scale-110"></span>
            <Calendar size={22} className="relative z-10 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                {lang === 'fr' ? 'Scanner de Péremption Intelligent' : 'مستكشف تواريخ الصلاحية الذكي'}
              </h3>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {lang === 'fr' 
                ? 'Analyse automatisée du catalogue pour détecter les produits proches de la date limite.' 
                : 'تحليل تلقائي متقدم للكشف عن المنتجات التي اقتربت نهاية صلاحيتها.'}
            </p>
          </div>
        </div>

        {/* Action Info text */}
        <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl hidden md:flex items-center gap-2 text-[11px] font-bold text-slate-600">
          <Sparkles size={14} className="text-teal-600 animate-pulse" />
          <span>
            {lang === 'fr'
              ? `${totalScanned} produits sous surveillance active`
              : `${totalScanned} منتج تحت المراقبة النشطة`}
          </span>
        </div>
      </div>

      {/* Bento Stats Display */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        
        {/* Stat 1: Total Scanned */}
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
            {lang === 'fr' ? 'Produits à Date' : 'المنتجات المؤرخة'}
          </span>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-black text-slate-800">{totalScanned}</span>
            <span className="text-xs text-slate-400 font-bold">{lang === 'fr' ? 'total' : 'إجمالي'}</span>
          </div>
        </div>

        {/* Stat 2: Red - Critical */}
        <button 
          onClick={() => setFilterLevel('red')}
          className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            filterLevel === 'red' 
              ? 'bg-rose-50 border-rose-200 ring-2 ring-rose-200' 
              : 'bg-white border-slate-100 hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-rose-600 font-black uppercase tracking-wider">
              {lang === 'fr' ? 'Urgent (≤ 30j)' : 'عاجل جداً (≤ 30 يوم)'}
            </span>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-rose-600">{redCount}</span>
            <span className="text-[11px] text-rose-500 font-bold">
              {lang === 'fr' ? 'articles' : 'مواد'}
            </span>
          </div>
        </button>

        {/* Stat 3: Yellow - Warning */}
        <button 
          onClick={() => setFilterLevel('yellow')}
          className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            filterLevel === 'yellow' 
              ? 'bg-amber-50 border-amber-200 ring-2 ring-amber-200' 
              : 'bg-white border-slate-100 hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider">
              {lang === 'fr' ? 'Alerte (31 - 60j)' : 'إنذار مبكر (31 - 60 يوم)'}
            </span>
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-amber-600">{yellowCount}</span>
            <span className="text-[11px] text-amber-500 font-bold">
              {lang === 'fr' ? 'articles' : 'مواد'}
            </span>
          </div>
        </button>

        {/* Stat 4: Green - Moderate */}
        <button 
          onClick={() => setFilterLevel('green')}
          className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            filterLevel === 'green' 
              ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-200' 
              : 'bg-white border-slate-100 hover:bg-slate-50/50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-emerald-600 font-black uppercase tracking-wider">
              {lang === 'fr' ? 'Surveillance (61 - 90j)' : 'مراقبة هادئة (61 - 90 يوم)'}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-emerald-600">{greenCount}</span>
            <span className="text-[11px] text-emerald-500 font-bold">
              {lang === 'fr' ? 'articles' : 'مواد'}
            </span>
          </div>
        </button>

      </div>

      {/* Search and Filters Section */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        
        {/* Search Bar */}
        <div className="relative w-full sm:flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={lang === 'fr' ? 'Rechercher un produit ou une catégorie...' : 'بحث عن منتج منتهي الصلاحية أو فئة...'}
            className="w-full bg-slate-50/70 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-hidden focus:border-brand-cyan focus:bg-white transition-all"
          />
        </div>

        {/* Quick Filter Select Buttons */}
        <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterLevel('all')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              filterLevel === 'all' 
                ? 'bg-slate-800 text-white' 
                : 'bg-slate-100 text-slate-500 hover:bg-slate-150'
            }`}
          >
            {lang === 'fr' ? 'Tous' : 'الكل'}
          </button>
          
          <button
            onClick={() => setFilterLevel('red')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterLevel === 'red' 
                ? 'bg-rose-600 text-white' 
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            {lang === 'fr' ? '≤ 30 jours' : '≤ 30 يوم'}
          </button>

          <button
            onClick={() => setFilterLevel('yellow')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterLevel === 'yellow' 
                ? 'bg-amber-500 text-white' 
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            {lang === 'fr' ? '31 - 60 jours' : '31 - 60 يوم'}
          </button>

          <button
            onClick={() => setFilterLevel('green')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterLevel === 'green' 
                ? 'bg-emerald-600 text-white' 
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            {lang === 'fr' ? '61 - 90 jours' : '61 - 90 يوم'}
          </button>
        </div>

      </div>

      {/* List / Table of Expiring Products */}
      <div className="bg-slate-50/50 border border-slate-100 rounded-2xl overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <ShieldAlert size={24} className="text-slate-300" />
            <p>
              {lang === 'fr' 
                ? 'Aucun produit critique trouvé avec ces filtres.' 
                : 'لم يتم العثور على أي منتج يطابق معايير المراقبة المحددة.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left md:rtl:text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 text-slate-400 font-extrabold border-b border-slate-150 uppercase">
                  <th className="py-3 px-4">{lang === 'fr' ? 'Produit' : 'المنتج'}</th>
                  <th className="py-3 px-4">{lang === 'fr' ? 'Stock & Prix' : 'المخزون والسعر'}</th>
                  <th className="py-3 px-4">{lang === 'fr' ? 'Date d\'expiration' : 'تاريخ الصلاحية'}</th>
                  <th className="py-3 px-4">{lang === 'fr' ? 'Alerte' : 'الإنذار الكاشف'}</th>
                  <th className="py-3 px-4 text-center">{lang === 'fr' ? 'Campagne Liquidation' : 'تصفية المخزون'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium bg-white">
                {filteredProducts.map((p) => {
                  
                  // Color styling based on warning level
                  let borderStyle = '';
                  let badgeStyle = '';
                  let message = '';

                  if (p.level === 'red') {
                    borderStyle = 'border-l-4 border-l-rose-500';
                    badgeStyle = 'bg-rose-50 text-rose-700 border border-rose-150';
                    message = p.daysLeft <= 0 
                      ? (lang === 'fr' ? `Expiré (${Math.abs(p.daysLeft)}j)` : `منتهي الصلاحية (${Math.abs(p.daysLeft)} يوم)`)
                      : (lang === 'fr' ? `Périme dans ${p.daysLeft}j` : `ينتهي في ${p.daysLeft} يوم`);
                  } else if (p.level === 'yellow') {
                    borderStyle = 'border-l-4 border-l-amber-500';
                    badgeStyle = 'bg-amber-50 text-amber-700 border border-amber-150';
                    message = lang === 'fr' ? `Périme dans ${p.daysLeft}j` : `ينتهي في ${p.daysLeft} يوم`;
                  } else {
                    borderStyle = 'border-l-4 border-l-emerald-500';
                    badgeStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-150';
                    message = lang === 'fr' ? `Périme dans ${p.daysLeft}j` : `ينتهي في ${p.daysLeft} يوم`;
                  }

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors ${borderStyle}`}>
                      {/* Name & category */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-800">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{p.category}</div>
                      </td>

                      {/* Stock levels and Pricing */}
                      <td className="py-3.5 px-4 font-bold text-slate-600">
                        <div>
                          {lang === 'fr' ? 'Stock: ' : 'مخزون: '}
                          <span className={p.stock <= 5 ? 'text-rose-600 font-black' : 'text-slate-800'}>
                            {p.stock}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {formatPrice(p.price)}
                          {p.discountPercent && p.discountPercent > 0 ? (
                            <span className="text-rose-500 ml-1 font-bold">(-{p.discountPercent}%)</span>
                          ) : null}
                        </div>
                      </td>

                      {/* Expiration exact date */}
                      <td className="py-3.5 px-4 font-mono text-slate-500 font-bold">
                        {p.expiryDate}
                      </td>

                      {/* Color Coded warning level */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${badgeStyle}`}>
                          {message}
                        </span>
                      </td>

                      {/* Liquidate Actions */}
                      <td className="py-3.5 px-4 text-center">
                        {p.discountPercent && p.discountPercent >= 30 ? (
                          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                            <Check size={12} />
                            <span>{lang === 'fr' ? 'Liquidation Active' : 'تصفية نشطة حالياً'}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setLiquidateProduct(p);
                              setDiscountValue(p.discountPercent || 30);
                            }}
                            className="bg-teal-50 hover:bg-teal-100 text-teal-700 font-black text-[10px] px-3 py-1.5 rounded-xl border border-teal-100 transition-all inline-flex items-center gap-1 uppercase tracking-wider"
                          >
                            <TrendingDown size={11} />
                            <span>{lang === 'fr' ? 'Liquider' : 'تصفية سريعة'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QUICK LIQUIDATION DISCOUNT MODAL */}
      {liquidateProduct && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                <Percent size={16} className="text-teal-600 animate-pulse" />
                <span>{lang === 'fr' ? 'Lancer une Promotion' : 'إطلاق حملة تخفيضات لتصفية المخزون'}</span>
              </h4>
              <button onClick={() => setLiquidateProduct(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                {lang === 'fr'
                  ? `Pour liquider rapidement ${liquidateProduct.name} avant sa date de péremption (${liquidateProduct.expiryDate}), vous pouvez appliquer une remise promotionnelle spéciale pour encourager les cliniques à commander.`
                  : `لتسريع بيع منتج "${liquidateProduct.name}" وتصفية الكميات المتوفرة قبل انتهاء صلاحيته (${liquidateProduct.expiryDate})، يمكنك تطبيق نسبة خصم تشجيعية فورية تظهر لجميع العيادات.`}
              </p>

              {/* Discount selection block */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center space-y-2">
                <p className="text-xs text-slate-400 font-black uppercase">
                  {lang === 'fr' ? 'Taux de remise suggéré' : 'نسبة التخفيض المقترحة'}
                </p>
                <div className="flex justify-center gap-2">
                  {[20, 30, 50, 70].map((val) => (
                    <button
                      key={val}
                      onClick={() => setDiscountValue(val)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                        discountValue === val 
                          ? 'bg-rose-500 text-white shadow-xs' 
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom discount manual input */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-black uppercase">
                  {lang === 'fr' ? 'Ou spécifier un taux précis (%)' : 'أو تحديد نسبة مخصصة (%)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-hidden focus:border-brand-cyan"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setLiquidateProduct(null)}
                className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-all"
                disabled={savingDiscount}
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                onClick={handleApplyLiquidationDiscount}
                className="flex-1 bg-brand-cyan hover:bg-brand-cyan/95 text-white text-xs font-extrabold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1"
                disabled={savingDiscount}
              >
                {savingDiscount ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-b-white rounded-full animate-spin"></span>
                ) : (
                  <>
                    <Check size={14} />
                    <span>{lang === 'fr' ? 'Appliquer' : 'تطبيق التخفيض'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
