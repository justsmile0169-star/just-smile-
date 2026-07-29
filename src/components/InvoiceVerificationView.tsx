import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, ShopInfo } from '../types';
import { Language } from '../translations';
import { ShieldCheck, ShieldAlert, Printer, ShoppingBag, ArrowRight, CheckCircle2, Clock, MapPin, Phone, Building } from 'lucide-react';
import { getLogoUrl } from '../constants/brand';

interface InvoiceVerificationViewProps {
  orderId: string;
  lang: Language;
  shopInfo: ShopInfo;
  existingOrders?: Order[];
  onGoToShop: () => void;
  onPrintInvoice?: (order: Order) => void;
}

export default function InvoiceVerificationView({
  orderId,
  lang,
  shopInfo,
  existingOrders,
  onGoToShop,
  onPrintInvoice
}: InvoiceVerificationViewProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError(false);

      const targetId = orderId.trim();

      // Check if order exists in local state first
      if (existingOrders && existingOrders.length > 0) {
        const found = existingOrders.find(
          (o) =>
            o.id === targetId ||
            (o.id && o.id.slice(-8).toUpperCase() === targetId.toUpperCase()) ||
            (o.id && o.id.slice(-6).toUpperCase() === targetId.toUpperCase())
        );
        if (found) {
          setOrder(found);
          setLoading(false);
          return;
        }
      }

      // Fetch directly from Firestore
      try {
        const snap = await getDoc(doc(db, 'orders', targetId));
        if (snap.exists()) {
          setOrder({ id: snap.id, ...snap.data() } as Order);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Failed to fetch verification order:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    if (orderId) {
      fetchOrder();
    }
  }, [orderId, existingOrders]);

  const fmt = (num: number) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(Math.round(num)) + ' DA';
  const isRtl = lang === 'ar';

  const invoiceNum = order?.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN';
  const invoiceDate = order?.createdAt ? new Date(order.createdAt).toLocaleDateString('fr-FR') : '';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Top Brand Bar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={getLogoUrl(shopInfo.logoUrl)}
              alt={shopInfo.companyName}
              className="h-10 w-auto object-contain"
            />
            <div>
              <h1 className="text-lg font-black tracking-wider text-white">{shopInfo.companyName}</h1>
              <p className="text-xs text-blue-400 font-semibold uppercase">{shopInfo.activity || 'Vente de Matériel Dentaire'}</p>
            </div>
          </div>

          <button
            onClick={onGoToShop}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ShoppingBag size={16} />
            <span>{isRtl ? 'تصفح المتجر' : 'Visiter le store'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {loading ? (
          <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
            <div className="inline-block animate-spin text-blue-500">
              <Clock size={40} />
            </div>
            <p className="text-slate-400 font-medium text-sm">
              {isRtl ? 'جاري التحقق من صحة الفاتورة من السجل الرقمي...' : 'Vérification du document auprès du registre numérique...'}
            </p>
          </div>
        ) : error || !order ? (
          /* Invalid / Not Found Invoice */
          <div className="bg-slate-950/80 border border-rose-500/30 rounded-3xl p-8 sm:p-12 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 bg-rose-500/10 text-rose-400 rounded-3xl flex items-center justify-center mx-auto border border-rose-500/20">
              <ShieldAlert size={44} />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h2 className="text-2xl font-black text-rose-400">
                {isRtl ? 'الفاتورة غير مسجلة أو غير صالحة' : 'Facture non trouvée ou invalide'}
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                {isRtl
                  ? `لم نتمكن من العثور على الفاتورة رقم (${orderId}). يرجى التثبت من الرمز أو الاتصال بخدمة العملاء.`
                  : `Impossible de vérifier la facture N° (${orderId}). Veuillez vérifier le code QR ou contacter le support.`}
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={onGoToShop}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-3 rounded-2xl text-sm transition-all cursor-pointer"
              >
                {isRtl ? 'العودة للصفحة الرئيسية' : 'Retourner à la boutique'}
              </button>
            </div>
          </div>
        ) : (
          /* Official Verified Invoice View */
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* Verified Header Banner */}
            <div className="bg-gradient-to-r from-emerald-950/80 via-slate-950 to-emerald-950/80 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              
              <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right">
                <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-500/30 shadow-inner">
                  <CheckCircle2 size={38} />
                </div>

                <div className="space-y-1 flex-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-black rounded-full border border-emerald-500/30 uppercase tracking-widest">
                    <ShieldCheck size={14} />
                    <span>DOCUMENT OFFICIEL VÉRIFIÉ | وثيقة رسمية موثقة</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {isRtl ? 'فاتورة أصلية مسجلة وموثقة' : 'Facture Mère Authentique'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {isRtl
                      ? `تم تأكيد أصالة الفاتورة الصادرة من منصة JUST SMILE بتاريخ ${invoiceDate}`
                      : `Authenticité de la facture vérifiée et enregistrée le ${invoiceDate}`}
                  </p>
                </div>
              </div>
            </div>

            {/* General Info Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
              
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                    {isRtl ? 'رقم الفاتورة' : 'Numéro de Facture'}
                  </span>
                  <span className="text-xl font-black text-blue-400 font-mono">
                    N° {invoiceNum}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border ${
                    order.paymentStatus === 'paid'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {order.paymentStatus === 'paid' ? (isRtl ? 'خالصة (Payée)' : 'PAYÉE') : (isRtl ? 'غير خالصة' : 'EN ATTENTE')}
                  </span>

                  <span className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-extrabold">
                    {order.paymentMethod === 'cash' ? (isRtl ? 'دفع عند التسليم' : 'Comptant') : (isRtl ? 'دفع بالآجل' : 'Crédit 15j')}
                  </span>
                </div>
              </div>

              {/* Client Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 font-bold uppercase text-xs">
                    <Building size={14} className="text-blue-400" />
                    <span>{isRtl ? 'معلومات العيادة والطبيب' : 'Client & Cabinet'}</span>
                  </div>
                  <div className="text-white font-extrabold text-base">{order.doctorName}</div>
                  <div className="text-slate-300 font-medium">{order.doctorClinic}</div>
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono text-xs">
                    <Phone size={12} />
                    <span>{order.doctorPhone}</span>
                  </div>
                </div>

                <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 font-bold uppercase text-xs">
                    <MapPin size={14} className="text-emerald-400" />
                    <span>{isRtl ? 'عنوان التوصيل' : 'Adresse de Livraison'}</span>
                  </div>
                  <div className="text-white font-bold">
                    {order.doctorWilayaName
                      ? `${order.doctorWilayaName}${order.doctorCommuneName ? ` - ${order.doctorCommuneName}` : ''}`
                      : 'Non spécifiée'}
                  </div>
                  <div className="text-slate-400 text-xs">
                    {isRtl ? 'التوصيل عبر موزع JUST SMILE المعتمد' : 'Livraison assurée par le réseau JUST SMILE'}
                  </div>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  {isRtl ? 'تفاصيل المنتجات المطلوبة' : 'Détail des Articles Commandés'}
                </h3>
                
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
                  <table className="w-full text-right sm:text-left text-xs">
                    <thead>
                      <tr className="bg-slate-800/80 text-slate-300 font-bold text-xs border-b border-slate-700">
                        <th className="p-3">{isRtl ? 'المنتج' : 'Article'}</th>
                        <th className="p-3 text-center">{isRtl ? 'الكمية' : 'Qté'}</th>
                        <th className="p-3 text-left">{isRtl ? 'المجموع' : 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {order.items.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-semibold text-white">
                            <div>{item.name}</div>
                            {item.variantName && (
                              <div className="text-[11px] text-purple-400 font-bold">Option: {item.variantName}</div>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-300">x{item.quantity}</td>
                          <td className="p-3 text-left font-bold text-blue-400">{fmt(item.price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals Card */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between items-center text-slate-400 font-medium">
                  <span>{isRtl ? 'إجمالي المنتجات TTC:' : 'Total Net TTC:'}</span>
                  <span className="font-extrabold text-white text-base">{fmt(order.totalAfterDiscount)}</span>
                </div>
                {order.paidAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-400 font-semibold">
                    <span>{isRtl ? 'المبلغ المسدد:' : 'Montant Réglé:'}</span>
                    <span className="font-extrabold">{fmt(order.paidAmount)}</span>
                  </div>
                )}
                {order.remainingBalance > 0 && (
                  <div className="flex justify-between items-center text-amber-400 font-bold pt-2 border-t border-slate-800">
                    <span>{isRtl ? 'المبلغ المتبقي للدفعة:' : 'Reste à Payer:'}</span>
                    <span className="font-black text-base">{fmt(order.remainingBalance)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Welcome & Shop Call To Action Banner */}
            <div className="bg-gradient-to-br from-blue-900/60 via-slate-950 to-purple-950/60 border border-blue-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-center">
              <div className="space-y-2 max-w-lg mx-auto">
                <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-xs font-bold rounded-full border border-blue-500/30 inline-block">
                  JUST SMILE ALGERIA 🇩🇿
                </span>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  {isRtl ? 'شكراً لثقتكم بشركة JUST SMILE' : 'Merci pour votre confiance'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {isRtl
                    ? 'نوفر لكم أفضل المواد ومعدات عيادات طب الأسنان في الجزائر بأعلى معايير الجودة والتوصيل السريع.'
                    : 'Nous fournissons les meilleurs équipements et consommables dentaires en Algérie avec garantie officielle.'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={onGoToShop}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-extrabold px-8 py-4 rounded-2xl shadow-xl shadow-blue-600/20 transition-all hover:scale-105 active:scale-95 text-sm cursor-pointer"
                >
                  <ShoppingBag size={18} />
                  <span>{isRtl ? 'تصفح منتجات المتجر الآن' : 'Découvrir le catalogue en ligne'}</span>
                  <ArrowRight size={16} className={isRtl ? 'rotate-180' : ''} />
                </button>

                {onPrintInvoice && (
                  <button
                    onClick={() => onPrintInvoice(order)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-6 py-4 rounded-2xl transition-all text-sm cursor-pointer"
                  >
                    <Printer size={18} />
                    <span>{isRtl ? 'طباعة الفاتورة' : 'Imprimer la facture'}</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Simple Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} {shopInfo.companyName} — Tous droits réservés.</p>
      </footer>
    </div>
  );
}
