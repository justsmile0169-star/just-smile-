import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, ShopInfo } from '../types';
import { Language } from '../translations';
import { ShieldCheck, ShieldAlert, X, Printer } from 'lucide-react';

interface OrderVerificationModalProps {
  orderId: string;
  lang: Language;
  shopInfo: ShopInfo;
  existingOrders?: Order[];
  onClose: () => void;
  onPrintInvoice?: (order: Order) => void;
}

export default function OrderVerificationModal({
  orderId,
  lang,
  shopInfo,
  existingOrders,
  onClose,
  onPrintInvoice
}: OrderVerificationModalProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchOrder() {
      setLoading(true);
      setError(false);

      const targetId = orderId.trim();

      // Check if available in local state / props first
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

  const fmt = (num: number) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' DA';

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto no-print">
      <div className="bg-white dark:bg-slate-950 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden relative animate-in fade-in zoom-in duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full transition-colors z-10"
        >
          <X size={18} />
        </button>

        {loading ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-brand-cyan border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-extrabold text-slate-600 dark:text-slate-300">
              {lang === 'fr' ? 'Vérification de la facture...' : 'جاري التحقق من صحة الفاتورة...'}
            </p>
          </div>
        ) : error || !order ? (
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-200 dark:border-rose-800">
              <ShieldAlert size={36} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                {lang === 'fr' ? 'Facture Non Trouvée' : 'رمز الفاتورة غير صحيح أو غير موجود'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                {lang === 'fr'
                  ? 'Impossible de vérifier cette facture. Veuillez vérifier le رمز المطبوع.'
                  : 'لم يتم العثور على أي فاتورة مسجلة بهذا الرقم. يرجى التأكد من صحة رمز الاستجابة.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all"
            >
              {lang === 'fr' ? 'Fermer' : 'إغلاق'}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Header Banner */}
            <div className="p-6 bg-emerald-50/70 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/50 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <ShieldCheck size={32} />
              </div>
              <div>
                <span className="inline-block bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-black px-3 py-1 rounded-full uppercase tracking-wider mb-1">
                  ✓ {lang === 'fr' ? 'FACTURE OFFICIELLE VÉRIFIÉE' : 'فاتورة رسمية موثقة ومسجلة'}
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                  N° #{order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {shopInfo.companyName} • {new Date(order.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
                </p>
              </div>
            </div>

            {/* Details Section */}
            <div className="p-6 space-y-5">
              {/* Doctor / Client Info */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Client / Praticien' : 'الطبيب / العيادة'}</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">{order.doctorName}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Cabinet' : 'اسم العيادة'}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{order.doctorClinic}</span>
                </div>
                {order.doctorWilayaName && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Adresse / Wilaya' : 'الولاية / العنوان'}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{order.doctorWilayaName} ({order.doctorCommuneName || ''})</span>
                  </div>
                )}
              </div>

              {/* Order Status & Financial Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-purple-50/50 dark:bg-purple-950/20 p-3.5 rounded-2xl border border-purple-100 dark:border-purple-900/30">
                  <p className="text-purple-600 dark:text-purple-400 font-bold uppercase text-[10px]">{lang === 'fr' ? 'Paiement' : 'طريقة السداد'}</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5">
                    {order.paymentMethod === 'cash' ? (lang === 'fr' ? 'Comptant' : 'نقدي عند الاستلام') : (lang === 'fr' ? 'Crédit (20j)' : 'دفع مؤجل (دين)')}
                  </p>
                </div>
                <div className="bg-blue-50/50 dark:bg-blue-950/20 p-3.5 rounded-2xl border border-blue-100 dark:border-blue-900/30">
                  <p className="text-blue-600 dark:text-blue-400 font-bold uppercase text-[10px]">{lang === 'fr' ? 'Statut' : 'حالة الطلبية'}</p>
                  <p className="font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 uppercase">
                    {order.status === 'delivered' ? '✓ Livrée' : order.status === 'confirmed' ? 'Confirmée' : order.status}
                  </p>
                </div>
              </div>

              {/* Items Summary */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase">{lang === 'fr' ? 'Articles' : 'محتوى الطلبية'} ({order.items.length})</p>
                <div className="max-h-36 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{item.name} <span className="text-brand-cyan">x{item.quantity}</span></span>
                      <span className="font-extrabold text-slate-900 dark:text-white">{fmt(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Amount Box */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex justify-between items-center shadow-lg">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">{lang === 'fr' ? 'Montant Total TTC' : 'الإجمالي الكلي للفاتورة'}</p>
                  <p className="text-xl font-black text-amber-400">{fmt(order.totalAfterDiscount)}</p>
                </div>
                {order.remainingBalance > 0 ? (
                  <span className="text-xs font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-full">
                    {lang === 'fr' ? `Reste: ${fmt(order.remainingBalance)}` : `المتبقي: ${fmt(order.remainingBalance)}`}
                  </span>
                ) : (
                  <span className="text-xs font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full">
                    {lang === 'fr' ? 'Payée Intégralement' : 'مسددة بالكامل'}
                  </span>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/30 flex justify-end gap-3">
              {onPrintInvoice && (
                <button
                  onClick={() => {
                    onClose();
                    onPrintInvoice(order);
                  }}
                  className="px-4 py-2 bg-brand-cyan hover:bg-brand-dark text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2"
                >
                  <Printer size={16} />
                  {lang === 'fr' ? 'Imprimer Facture A4' : 'طباعة الفاتورة'}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all"
              >
                {lang === 'fr' ? 'Fermer' : 'إغلاق'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
