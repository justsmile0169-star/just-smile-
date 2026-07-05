import React, { useState } from 'react';
import { Order, Product, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { ShoppingBag, FileText, Heart, Clock, AlertTriangle, RefreshCw, Eye, CheckCircle, HelpCircle, LayoutGrid, Activity, Syringe, Scissors, Smile, ShieldCheck, Layers, MessageSquare, Send, X } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface DoctorDashboardProps {
  user: UserProfile;
  orders: Order[];
  allProducts: Product[];
  favorites: string[]; // list of product IDs
  recentlyViewed: string[]; // list of product IDs
  lang: Language;
  onAddToCart: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
  onViewProduct: (product: Product) => void;
  onQuickReorder: (items: any[]) => void;
  onPrintInvoice: (order: Order) => void;
  onSelectCategory?: (category: string) => void;
}

export default function DoctorDashboard({
  user,
  orders,
  allProducts,
  favorites,
  recentlyViewed,
  lang,
  onAddToCart,
  onToggleFavorite,
  onViewProduct,
  onQuickReorder,
  onPrintInvoice,
  onSelectCategory
}: DoctorDashboardProps) {
  const isRtl = lang === 'ar';
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    setSendingMessage(true);
    try {
      await addDoc(collection(db, 'admin_messages'), {
        doctorId: user.uid,
        doctorName: user.name,
        doctorClinic: user.clinicName,
        doctorPhone: user.phone,
        doctorEmail: user.email,
        message: messageText.trim(),
        createdAt: serverTimestamp(),
        isRead: false
      });
      setMessageText('');
      setShowMessageModal(false);
      alert(lang === 'fr' ? 'Message envoyé avec succès!' : 'تم إرسال الرسالة بنجاح!');
    } catch (error) {
      console.error('Error sending message:', error);
      alert(lang === 'fr' ? 'Erreur lors de l\'envoi du message.' : 'حدث خطأ أثناء إرسال الرسالة.');
    } finally {
      setSendingMessage(false);
    }
  };

  const formatPrice = (num: number) => {
    if (num === 0 || num === undefined || num === null) return '-';
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  // --- Credit and Debt calculations ---
  const totals = orders.reduce(
    (acc, order) => {
      if (order.paymentMethod === 'cash') {
        acc.cashRemaining += order.remainingBalance;
        acc.cashTotal += order.totalAfterDiscount;
      } else {
        acc.creditRemaining += order.remainingBalance;
        acc.creditTotal += order.totalAfterDiscount;
      }
      acc.totalDebt += order.totalAfterDiscount;
      acc.paidAmount += order.paidAmount;
      acc.remainingBalance += order.remainingBalance;
      return acc;
    },
    { totalDebt: 0, paidAmount: 0, remainingBalance: 0, creditRemaining: 0, creditTotal: 0, cashRemaining: 0, cashTotal: 0 }
  );

  // Check if any invoice is overdue (> 20 days and remainingBalance > 0)
  const overdueOrders = orders.filter((order) => {
    if (order.remainingBalance <= 0) return false;
    if (order.paymentMethod === 'cash') return false; // cash on delivery is not on credit
    const deadline = new Date(order.deadlineDate);
    const today = new Date();
    return today > deadline;
  });

  const isBlocked = overdueOrders.length > 0;

  // Find products matching arrays
  const favoriteProducts = allProducts.filter((p) => favorites.includes(p.id));
  const recentlyViewedProducts = allProducts.filter((p) => recentlyViewed.includes(p.id));

  return (
    <div className="space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
              {lang === 'fr' ? `Cabinet de ${user.name}` : `عيادة ${user.name}`}
            </h2>

            {/* Account Status Badge - Professional Polish design style */}
            {isBlocked ? (
              <div className="flex items-center gap-2 bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-150 shrink-0">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                <span>{lang === 'fr' ? 'Compte Bloqué' : 'الحساب معلق'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-150 shrink-0">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                <span>{lang === 'fr' ? 'Compte Actif' : 'الحساب نشط'}</span>
              </div>
            )}
          </div>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            {user.clinicName} • {user.location}
          </p>
        </div>

        {/* Contact Admin Button */}
        <button
          onClick={() => setShowMessageModal(true)}
          className="flex items-center gap-2 bg-brand-cyan text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-brand-cyan/90 transition-colors shadow-xs"
        >
          <MessageSquare size={16} />
          <span>{lang === 'fr' ? 'Contacter l\'administration' : 'اتصل بالإدارة'}</span>
        </button>
      </div>

      {/* Credit Status Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Orders Debt value */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {getTranslation(lang, 'totalDebt')}
          </p>
          <p className="text-2xl font-black text-brand-dark">
            {formatPrice(totals.totalDebt)}
          </p>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-dark rounded-full" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Paid amount card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {getTranslation(lang, 'paidAmount')}
          </p>
          <p className="text-2xl font-black text-emerald-600">
            {formatPrice(totals.paidAmount)}
          </p>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
              style={{ width: totals.totalDebt > 0 ? `${(totals.paidAmount / totals.totalDebt) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* Remaining balance (debt) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs space-y-2 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {getTranslation(lang, 'remainingBalance')}
          </p>
          <p className="text-2xl font-black text-rose-600">
            {formatPrice(totals.remainingBalance)}
          </p>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${isBlocked ? 'bg-rose-500' : 'bg-brand-cyan'}`} 
              style={{ width: totals.totalDebt > 0 ? `${(totals.remainingBalance / totals.totalDebt) * 100}%` : '0%' }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold pt-2 border-t border-slate-50 mt-1">
            <span>
              {lang === 'fr' ? 'Crédit (Dette) :' : 'ديون الدفع الآجل :'} <span className="text-rose-600">{formatPrice(totals.creditRemaining)}</span>
            </span>
            <span>
              {lang === 'fr' ? 'À la livraison :' : 'الدفع عند الاستلام :'} <span className="text-amber-600">{formatPrice(totals.cashRemaining)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Quick Category Navigation Section */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="text-brand-cyan" size={20} />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              {lang === 'fr' ? 'Accès Rapide par Catégorie' : 'الوصول السريع حسب الفئة'}
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-bold">
            {lang === 'fr' ? '6 Catégories' : '6 فئات'}
          </span>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[
            { id: 'all', labelFr: 'Tous', labelAr: 'الكل', icon: LayoutGrid, count: allProducts.length },
            { id: 'Équipements', labelFr: 'Équipements', labelAr: 'المعدات', icon: Activity, count: allProducts.filter(p => p.category === 'Équipements').length },
            { id: 'Consommables', labelFr: 'Consommables', labelAr: 'المواد الاستهلاكية', icon: Syringe, count: allProducts.filter(p => p.category === 'Consommables').length },
            { id: 'Instruments', labelFr: 'Instruments', labelAr: 'الأدوات', icon: Scissors, count: allProducts.filter(p => p.category === 'Instruments').length },
            { id: 'Orthodontie', labelFr: 'Orthodontie', labelAr: 'تقويم الأسنان', icon: Smile, count: allProducts.filter(p => p.category === 'Orthodontie').length },
            { id: 'Hygiène & Stérilisation', labelFr: 'Hygiène & Stérilisation', labelAr: 'النظافة والتعقيم', icon: ShieldCheck, count: allProducts.filter(p => p.category === 'Hygiène & Stérilisation').length },
            { id: 'Prothèse dentaire', labelFr: 'Prothèse dentaire', labelAr: 'بدائل الأسنان', icon: Layers, count: allProducts.filter(p => p.category === 'Prothèse dentaire').length }
          ].map((cat) => {
            const IconComponent = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory?.(cat.id)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-100 dark:border-slate-850 bg-slate-50/50 dark:bg-slate-900/50 hover:border-brand-cyan/40 dark:hover:border-brand-cyan/60 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer group hover:shadow-xs text-center space-y-2"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-cyan/10 text-brand-cyan flex items-center justify-center group-hover:scale-110 transition-all">
                  <IconComponent size={18} />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-brand-cyan transition-colors truncate max-w-full px-1">
                    {isRtl ? cat.labelAr : cat.labelFr}
                  </p>
                  <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500">
                    {cat.count} {lang === 'fr' ? 'prod.' : 'منتج'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Orders List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xs">
            <div className="flex items-center gap-2 mb-6">
              <ShoppingBag className="text-brand-cyan" size={22} />
              <h3 className="text-lg font-extrabold text-slate-900">
                {getTranslation(lang, 'orderHistory')}
              </h3>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <HelpCircle className="mx-auto text-slate-300" size={40} />
                <p className="text-sm font-semibold text-slate-500">{getTranslation(lang, 'noOrders')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto">
                <table className="w-full text-left md:rtl:text-right border-collapse min-w-[500px]">
                  <thead>
                    <tr className="text-xs font-extrabold text-slate-400 uppercase border-b border-slate-100 pb-3">
                      <th className="pb-3">{getTranslation(lang, 'orderId')}</th>
                      <th className="pb-3">{getTranslation(lang, 'orderDate')}</th>
                      <th className="pb-3">{getTranslation(lang, 'total')}</th>
                      <th className="pb-3">{getTranslation(lang, 'status')}</th>
                      <th className="pb-3">{lang === 'fr' ? 'Dette' : 'الدين'}</th>
                      <th className="pb-3 text-right">{getTranslation(lang, 'actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orders.map((order) => {
                      // Check order level overdue state
                      const isOrderOverdue = order.remainingBalance > 0 && order.paymentMethod !== 'cash' && new Date() > new Date(order.deadlineDate);

                      return (
                        <tr key={order.id} className="text-sm hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 font-bold text-slate-800">
                            <div>#{order.id.slice(-6).toUpperCase()}</div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                              {order.paymentMethod === 'cash' 
                                ? (lang === 'fr' ? 'Comptant à la livraison' : 'مباشر عند الاستلام')
                                : (lang === 'fr' ? 'Crédit (20 jours)' : 'دين (آجل 20 يوم)')}
                            </div>
                          </td>
                          <td className="py-4 text-slate-500 font-medium">
                            {new Date(order.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
                          </td>
                          <td className="py-4 font-black text-slate-900">
                            {formatPrice(order.totalAfterDiscount)}
                          </td>
                          <td className="py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold tracking-wide uppercase ${
                              order.status === 'delivered' 
                                ? 'bg-emerald-50 text-emerald-600' 
                                : order.status === 'cancelled' 
                                  ? 'bg-rose-50 text-rose-600' 
                                  : 'bg-brand-cyan/10 text-brand-cyan'
                            }`}>
                              {getTranslation(lang, `status_${order.status}` as any)}
                            </span>
                          </td>
                          <td className="py-4 font-bold">
                            {order.remainingBalance > 0 ? (
                              order.paymentMethod === 'cash' ? (
                                <span className="text-amber-600 text-xs font-bold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  {lang === 'fr' ? 'À payer à la livraison' : 'مطلوب عند التسليم'}
                                </span>
                              ) : (
                                <span className={`flex items-center gap-1 text-xs ${isOrderOverdue ? 'text-rose-600 font-black' : 'text-slate-600'}`}>
                                  {isOrderOverdue && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />}
                                  {formatPrice(order.remainingBalance)}
                                </span>
                              )
                            ) : (
                              <span className="text-emerald-600 text-xs font-bold flex items-center gap-1">
                                <CheckCircle size={12} />
                                {lang === 'fr' ? 'Réglé' : 'خالص'}
                              </span>
                            )}
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => onPrintInvoice(order)}
                                className="p-2 text-slate-400 hover:text-brand-cyan hover:bg-brand-cyan/5 rounded-xl transition-all"
                                title={getTranslation(lang, 'invoiceDownload')}
                              >
                                <FileText size={16} />
                              </button>
                              <button
                                onClick={() => onQuickReorder(order.items)}
                                className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                                title={getTranslation(lang, 'reorder')}
                              >
                                <RefreshCw size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Favorites & Recently viewed */}
        <div className="space-y-6">
          
          {/* Favorites Component List */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-50">
              <Heart className="text-red-500" size={20} fill="currentColor" />
              <h3 className="text-sm font-extrabold text-slate-800">
                {getTranslation(lang, 'favorites')} ({favoriteProducts.length})
              </h3>
            </div>

            {favoriteProducts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                {lang === 'fr' ? 'Aucun favori enregistré.' : 'لا توجد منتجات مفضلة بعد.'}
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {favoriteProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <img 
                      src={p.image && String(p.image) !== '0' ? p.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
                      alt={p.name} 
                      className="w-10 h-10 object-cover rounded-lg bg-slate-100"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs font-black text-brand-cyan">{formatPrice(p.price)}</p>
                    </div>
                    <button
                      onClick={() => onAddToCart(p)}
                      className="p-1.5 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan hover:text-white rounded-lg transition-colors"
                    >
                      <ShoppingBag size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recently Viewed List */}
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-50">
              <Clock className="text-slate-400" size={20} />
              <h3 className="text-sm font-extrabold text-slate-800">
                {getTranslation(lang, 'recentlyViewed')} ({recentlyViewedProducts.length})
              </h3>
            </div>

            {recentlyViewedProducts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                {lang === 'fr' ? 'Aucun produit consulté récemment.' : 'لا توجد معروضات مؤخراً.'}
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {recentlyViewedProducts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <img 
                      src={p.image && String(p.image) !== '0' ? p.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
                      alt={p.name} 
                      className="w-10 h-10 object-cover rounded-lg bg-slate-100"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-xs font-black text-slate-500">{formatPrice(p.price)}</p>
                    </div>
                    <button
                      onClick={() => onViewProduct(p)}
                      className="p-1.5 text-slate-400 hover:text-brand-cyan rounded-lg hover:bg-brand-cyan/5 transition-colors"
                    >
                      <Eye size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Message Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-extrabold text-slate-800 text-base md:text-lg flex items-center gap-2">
                <MessageSquare size={20} className="text-brand-cyan" />
                {lang === 'fr' ? 'Contacter l\'administration' : 'اتصل بالإدارة'}
              </h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {lang === 'fr' ? 'Votre message' : 'رسالتك'}
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={lang === 'fr' ? 'Écrivez votre message ici...' : 'اكتب رسالتك هنا...'}
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-hidden focus:border-brand-cyan resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowMessageModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendingMessage}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-brand-cyan hover:bg-brand-cyan/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sendingMessage ? (
                    <span>{lang === 'fr' ? 'Envoi...' : 'جاري الإرسال...'}</span>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>{lang === 'fr' ? 'Envoyer' : 'إرسال'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
