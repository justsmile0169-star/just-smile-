import React, { useState } from 'react';
import { CartItem, UserProfile, Order, Product, Promotion, DeliveryType } from '../types';
import { calculatePromotionDiscount } from '../utils/promotionEngine';
import { Language, getTranslation } from '../translations';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, ShieldAlert, CheckCircle, Clock, Truck } from 'lucide-react';
import { useAppDialog } from '../context/AppDialogContext';
import { isFreeDelivery, getDeliveryPricing } from '../utils/algeriaData';

interface CartViewProps {
  cart: CartItem[];
  user: UserProfile | null;
  currentUser: UserProfile | null;
  userOrders: Order[]; // To check blocking debt rules
  lang: Language;
  promotions?: Promotion[];
  onUpdateQuantity: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onCheckoutSuccess: () => void;
  setActiveTab: (tab: any) => void;
}

export default function CartView({
  cart,
  user,
  currentUser,
  userOrders,
  lang,
  promotions = [],
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onCheckoutSuccess,
  setActiveTab
}: CartViewProps) {
  const { alert } = useAppDialog();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash'>('cash');
  const [deliveryOption, setDeliveryOption] = useState<'to_office' | 'to_clinic'>('to_clinic');

  const isRtl = lang === 'ar';

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  // --- Calculate Totals & Discounts ---
  const totals = cart.reduce(
    (acc, item) => {
      // 1. Calculate base product price and apply product discount if exists
      const pDiscount = item.product.discountPercent || 0;
      const baseProductTotal = item.product.price * item.quantity;
      const finalProductPrice = Math.round(item.product.price * (1 - pDiscount / 100));
      const finalProductTotal = finalProductPrice * item.quantity;

      acc.grossTotal += baseProductTotal;
      acc.productDiscounts += baseProductTotal - finalProductTotal;
      acc.runningTotalAfterProductDiscounts += finalProductTotal;
      return acc;
    },
    { grossTotal: 0, productDiscounts: 0, runningTotalAfterProductDiscounts: 0 }
  );

  // Apply doctor-level custom invoice discount from profile if approved
  const doctorDiscountPercent = user?.discountPercent || 0;
  const doctorDiscountAmount = Math.round(
    totals.runningTotalAfterProductDiscounts * (doctorDiscountPercent / 100)
  );

  const promoResult = calculatePromotionDiscount(cart, promotions);
  const totalDiscount = totals.productDiscounts + doctorDiscountAmount + promoResult.promotionDiscount;
  
  // --- Delivery cost calculations ---
  const userWilayaCode = user?.wilayaCode || '';
  const userCommuneNameAscii = user?.communeNameAscii || '';
  
  const hasFreeDelivery = userWilayaCode && userCommuneNameAscii 
    ? isFreeDelivery(userWilayaCode, userCommuneNameAscii) 
    : false;

  const deliveryPricing = userWilayaCode ? getDeliveryPricing(userWilayaCode) : { toOffice: 450, toClinic: 700 };
  const deliveryCost = hasFreeDelivery ? 0 : (deliveryOption === 'to_office' ? deliveryPricing.toOffice : deliveryPricing.toClinic);

  const netTotalToPay = totals.grossTotal - totalDiscount + deliveryCost;

  // --- Blocking Rule Check ---
  // Overdue means: order remaining balance > 0 and current time > order creation + 20 days. Cash on delivery is not counted.
  const overdueOrders = userOrders.filter((order) => {
    if (order.remainingBalance <= 0) return false;
    if (order.paymentMethod === 'cash') return false; // cash on delivery is not on credit
    const deadline = new Date(order.deadlineDate);
    const today = new Date();
    return today > deadline;
  });

  const isBlockedFromOrdering = overdueOrders.length > 0;

  // Handle Checkout submission
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert(lang === 'fr' ? 'Veuillez vous connecter pour commander.' : 'يرجى تسجيل الدخول للقيام بالطلب.', 'info');
      setActiveTab('auth');
      return;
    }

    if (user.role !== 'doctor') {
      alert(lang === 'fr' ? 'Réservé aux praticiens uniquement.' : 'هذا الحساب غير مخول للطلب (خاص بالأطباء فقط).', 'error');
      return;
    }

    if (isBlockedFromOrdering) {
      alert(getTranslation(lang, 'orderBlockedDebt'), 'error');
      return;
    }

    if (cart.length === 0) return;

    setLoading(true);

    try {
      const orderDate = new Date();
      const deadlineDate = new Date();
      deadlineDate.setDate(orderDate.getDate() + 20); // 20 days deadline payment

      const orderRef = collection(db, 'orders');

      // Create new Order object
      const newOrder: Omit<Order, 'id'> = {
        userId: user.uid,
        doctorName: user.name,
        doctorClinic: user.clinicName,
        doctorPhone: user.phone,
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.discountPercent ? Math.round(item.product.price * (1 - item.product.discountPercent / 100)) : item.product.price,
          quantity: item.quantity,
          category: item.product.category,
          discountPercent: item.product.discountPercent || 0
        })),
        totalBeforeDiscount: totals.grossTotal,
        discountAmount: totalDiscount,
        totalAfterDiscount: netTotalToPay,
        status: 'pending',
        paymentStatus: 'unpaid',
        paidAmount: 0,
        remainingBalance: netTotalToPay,
        createdAt: orderDate.toISOString(),
        deadlineDate: deadlineDate.toISOString(),
        paymentMethod: paymentMethod,
        commercialName: user.commercialName || 'Directe',
        notes: notes.trim() || "",
        processedBy: currentUser?.uid,
        processedByName: currentUser?.name,
        // Delivery fields
        deliveryType: hasFreeDelivery ? 'free' : deliveryOption,
        deliveryCost: deliveryCost,
        doctorWilayaCode: user.wilayaCode || '',
        doctorWilayaName: user.wilayaName || '',
        doctorCommuneName: user.communeName || '',
      };

      // 1. Write the order
      const orderDoc = await addDoc(orderRef, newOrder);
      if (!orderDoc.id) {
        throw new Error('Failed to create order document');
      }
      await updateDoc(doc(db, 'orders', orderDoc.id), { id: orderDoc.id });

      // 2. Decrement inventory stock inside transaction/batch
      const batch = writeBatch(db);
      const lowStockAlertsToCreate: { product: Product; newStock: number }[] = [];
      cart.forEach((item) => {
        const prodRef = doc(db, 'products', item.product.id);
        const newStock = Math.max(0, item.product.stock - item.quantity);
        batch.update(prodRef, { stock: newStock });

        const threshold = item.product.lowStockAlert ?? 5;
        if (newStock <= threshold && item.product.stock > threshold) {
          lowStockAlertsToCreate.push({
            product: item.product,
            newStock
          });
        }
      });
      await batch.commit();

      // Create low stock notifications for admin
      for (const alertInfo of lowStockAlertsToCreate) {
        const threshold = alertInfo.product.lowStockAlert ?? 5;
        await addDoc(collection(db, 'notifications'), {
          userId: 'admin',
          titleFr: 'Alerte Stock Bas !',
          titleAr: 'تنبيـه انخفاض المخزون!',
          messageFr: `Le produit "${alertInfo.product.name}" est tombé sous son seuil d'alerte. Stock actuel : ${alertInfo.newStock} (Seuil : ${threshold}).`,
          messageAr: `المنتج "${alertInfo.product.name}" انخفض تحت حد التنبيه. المخزون الحالي: ${alertInfo.newStock} (الحد: ${threshold}).`,
          type: 'system',
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }

      // 3. Create success in-app notification
      await addDoc(collection(db, 'notifications'), {
        userId: user.uid,
        titleFr: 'Commande enregistrée !',
        titleAr: 'تم تسجيل طلبك!',
        messageFr: paymentMethod === 'credit'
          ? `Votre commande #${orderDoc.id.slice(-6).toUpperCase()} d'un montant net de ${formatPrice(netTotalToPay)} a été reçue. Échéance de paiement : ${deadlineDate.toLocaleDateString('fr-FR')}.`
          : `Votre commande #${orderDoc.id.slice(-6).toUpperCase()} d'un montant net de ${formatPrice(netTotalToPay)} a été reçue. Mode : Paiement comptant à la livraison.`,
        messageAr: paymentMethod === 'credit'
          ? `تم استلام طلبك رقم #${orderDoc.id.slice(-6).toUpperCase()} بقيمة ${formatPrice(netTotalToPay)}. يرجى السداد قبل تاريخ: ${deadlineDate.toLocaleDateString('ar-DZ')}.`
          : `تم استلام طلبك رقم #${orderDoc.id.slice(-6).toUpperCase()} بقيمة ${formatPrice(netTotalToPay)}. طريقة السداد: دفع فوري عند الاستلام.`,
        type: 'order_update',
        isRead: false,
        createdAt: new Date().toISOString()
      });

      // Clear layout and reset
      setSuccess(true);
      onClearCart();
      onCheckoutSuccess();
    } catch (err) {
      console.error('Order creation error:', err);
      if (err instanceof Error) {
        console.error('Error message:', err.message);
        console.error('Error code:', (err as any).code);
      }
      alert(lang === 'fr' ? 'Erreur lors du passage de commande.' : 'حدث خطأ أثناء إتمام الطلب.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-16 space-y-6 max-w-md mx-auto" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-500">
          <CheckCircle size={44} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900">{getTranslation(lang, 'orderSuccess')}</h2>
          <p className="text-sm text-slate-500">
            {lang === 'fr' 
              ? 'Votre commande a été transmise à notre équipe pour préparation. Vous recevrez une notification d\'expédition sous peu.'
              : 'تم استلام طلبكم بنجاح وجارٍ تحضيره. ستتلقون إشعارًا فور شحنه إلى عيادتكم.'}
          </p>
        </div>
        <button
          onClick={() => {
            setSuccess(false);
            setActiveTab('dashboard');
          }}
          className="w-full bg-brand-cyan text-white font-extrabold py-3.5 rounded-xl hover:bg-brand-cyan/90 transition-all shadow-xs"
        >
          {lang === 'fr' ? 'Consulter mon tableau de bord' : 'الذهاب إلى لوحة التحكم الخاصة بي'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <ShoppingCart className="text-brand-cyan" size={24} />
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
          {getTranslation(lang, 'cart')} ({cart.length})
        </h2>
      </div>

      {cart.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-100 rounded-3xl p-8 space-y-4">
          <ShoppingCart className="mx-auto text-slate-300" size={48} />
          <h3 className="font-bold text-slate-700 text-sm md:text-base">{getTranslation(lang, 'emptyCart')}</h3>
          <button
            onClick={() => setActiveTab('browse')}
            className="bg-brand-cyan text-white font-extrabold text-xs md:text-sm px-6 py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-colors"
          >
            {lang === 'fr' ? 'Continuer mes achats' : 'تصفح المنتجات الآن'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Columns: Items list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xs divide-y divide-slate-100">
              {cart.map((item) => {
                const discount = item.product.discountPercent || 0;
                const priceBefore = item.product.price;
                const priceAfter = discount > 0 ? Math.round(priceBefore * (1 - discount / 100)) : priceBefore;

                return (
                  <div key={item.product.id} className="flex items-start gap-4 py-5 first:pt-0 last:pb-0">
                    <img
                      src={item.product.image && String(item.product.image) !== '0' ? item.product.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300'}
                      alt={item.product.name}
                      className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-2xl bg-slate-150 border border-slate-50 shrink-0"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-[10px] bg-brand-cyan/5 text-brand-cyan px-2 py-0.5 rounded-md font-bold uppercase">
                        {item.product.category}
                      </span>
                      <h4 className="font-bold text-slate-800 text-sm md:text-base truncate">{item.product.name}</h4>
                      
                      <div className="flex items-center gap-2">
                        {discount > 0 && (
                          <span className="text-xs text-slate-400 line-through">
                            {formatPrice(priceBefore)}
                          </span>
                        )}
                        <span className="text-sm md:text-base font-black text-brand-dark">
                          {formatPrice(priceAfter)}
                        </span>
                      </div>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex flex-col items-end gap-3 justify-between self-stretch shrink-0">
                      <button
                        onClick={() => onRemoveItem(item.product.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                        title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                      >
                        <Trash2 size={16} />
                      </button>

                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden h-8 bg-slate-50">
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                          className="px-2.5 hover:bg-slate-200 transition-colors h-full text-slate-500 font-bold"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-3 font-extrabold text-xs text-slate-800 text-center w-8 select-none">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                          className="px-2.5 hover:bg-slate-200 transition-colors h-full text-slate-500 font-bold"
                          disabled={item.quantity >= item.product.stock}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Checkout Order Summary info */}
          <div className="space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
              <h3 className="text-base font-black text-slate-800 border-b border-slate-50 pb-3">
                {lang === 'fr' ? 'Résumé de la commande' : 'ملخص الطلب والسداد'}
              </h3>

              {/* Pricing breakdown */}
              <div className="space-y-3.5 text-sm font-medium text-slate-600">
                <div className="flex justify-between">
                  <span>{lang === 'fr' ? 'Sous-total brut' : 'المجموع الإجمالي'}</span>
                  <span className="text-slate-800 font-bold">{formatPrice(totals.grossTotal)}</span>
                </div>

                {totals.productDiscounts > 0 && (
                  <div className="flex justify-between text-rose-500 font-semibold">
                    <span>{lang === 'fr' ? 'Remises articles' : 'تخفيضات المنتجات'}</span>
                    <span>-{formatPrice(totals.productDiscounts)}</span>
                  </div>
                )}

                {user && doctorDiscountPercent > 0 && (
                  <div className="flex justify-between text-rose-500 font-semibold">
                    <span>{lang === 'fr' ? `Votre remise cabinet (${doctorDiscountPercent}%)` : `التخفيض المخصص لعيادتكم (${doctorDiscountPercent}%)`}</span>
                    <span>-{formatPrice(doctorDiscountAmount)}</span>
                  </div>
                )}

                {promoResult.promotionDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span>{lang === 'fr' ? 'Promotions actives' : 'العروض الترويجية'}</span>
                    <span>-{formatPrice(promoResult.promotionDiscount)}</span>
                  </div>
                )}

                {deliveryCost > 0 ? (
                  <div className="flex justify-between text-slate-600 font-semibold">
                    <span>{lang === 'fr' ? 'Frais de livraison' : 'سعر التوصيل'}</span>
                    <span>+{formatPrice(deliveryCost)}</span>
                  </div>
                ) : (
                  hasFreeDelivery && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>{lang === 'fr' ? 'Livraison' : 'التوصيل'}</span>
                      <span>{lang === 'fr' ? 'Gratuit (Djelfa)' : 'مجاني (الجلفة)'}</span>
                    </div>
                  )
                )}

                <div className="flex justify-between text-base font-black text-slate-800 border-t border-slate-50 pt-3.5">
                  <span>
                    {paymentMethod === 'credit'
                      ? (lang === 'fr' ? 'Net à payer (Dette / Crédit)' : 'الصافي (قيمة الدين)')
                      : (lang === 'fr' ? 'Net à payer (Comptant)' : 'الصافي (الدفع نقداً)')}
                  </span>
                  <span>{formatPrice(netTotalToPay)}</span>
                </div>
              </div>

              {/* Overdue alert rules */}
              {isBlockedFromOrdering && (
                <div className="flex items-start gap-2 text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 text-xs leading-relaxed font-bold">
                  <ShieldAlert size={20} className="shrink-0 mt-0.5" />
                  <span>{getTranslation(lang, 'orderBlockedDebt')}</span>
                </div>
              )}

              {/* Delivery Option Selection */}
              {user && !isBlockedFromOrdering && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                    {lang === 'fr' ? 'Option de livraison' : 'خيارات التوصيل والشحن'}
                  </label>
                  {hasFreeDelivery ? (
                    <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold p-3.5 rounded-xl">
                      <Truck size={16} className="shrink-0 mt-0.5" />
                      <span>
                        {lang === 'fr'
                          ? 'Félicitations ! La livraison est gratuite pour la commune de Djelfa.'
                          : 'تهانينا! التوصيل مجاني بالكامل لبلدية الجلفة.'}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryOption('to_office')}
                        className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          deliveryOption === 'to_office'
                            ? 'border-brand-cyan bg-brand-cyan/5 text-brand-dark'
                            : 'border-slate-200 bg-white text-slate-650 hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full border border-slate-350 flex items-center justify-center mt-1 shrink-0">
                          {deliveryOption === 'to_office' && <div className="w-2 h-2 rounded-full bg-brand-cyan" />}
                        </div>
                        <div className="text-xs space-y-0.5">
                          <p className="font-extrabold text-slate-800">
                            {lang === 'fr' ? 'Livraison vers Bureau de livraison' : 'شحن إلى مكتب التوصيل'}
                          </p>
                          <p className="text-slate-400">
                            {lang === 'fr'
                              ? `Récupérez votre colis au bureau. Tarif : ${formatPrice(deliveryPricing.toOffice)}`
                              : `استلام الطرد من مكتب شركة الشحن. السعر: ${formatPrice(deliveryPricing.toOffice)}`}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeliveryOption('to_clinic')}
                        className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          deliveryOption === 'to_clinic'
                            ? 'border-brand-cyan bg-brand-cyan/5 text-brand-dark'
                            : 'border-slate-200 bg-white text-slate-650 hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full border border-slate-350 flex items-center justify-center mt-1 shrink-0">
                          {deliveryOption === 'to_clinic' && <div className="w-2 h-2 rounded-full bg-brand-cyan" />}
                        </div>
                        <div className="text-xs space-y-0.5">
                          <p className="font-extrabold text-slate-800">
                            {lang === 'fr' ? 'Livraison à la Clinique / Cabinet' : 'توصيل مباشر إلى العيادة'}
                          </p>
                          <p className="text-slate-400">
                            {lang === 'fr'
                              ? `Livraison à domicile à votre adresse. Tarif : ${formatPrice(deliveryPricing.toClinic)}`
                              : `توصيل الطرد مباشرة إلى مقر عيادتك. السعر: ${formatPrice(deliveryPricing.toClinic)}`}
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method Info (Cash on Delivery Only) */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                  {lang === 'fr' ? 'Mode de paiement' : 'طريقة الدفع والسداد'}
                </label>
                <div className="p-3.5 rounded-2xl border border-brand-cyan bg-brand-cyan/5 text-brand-dark dark:bg-brand-cyan/10 flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full border border-brand-cyan flex items-center justify-center mt-1 shrink-0">
                    <div className="w-2 h-2 rounded-full bg-brand-cyan" />
                  </div>
                  <div className="text-xs space-y-0.5">
                    <p className="font-extrabold text-slate-800 dark:text-slate-200">
                      {lang === 'fr' ? 'Paiement au Comptant à la Livraison' : 'الدفع عند الاستلام نقداً'}
                    </p>
                    <p className="text-slate-400">
                      {lang === 'fr'
                        ? 'Règlement en espèces au livreur à la réception.'
                        : 'الدفع المباشر نقداً للمندوب فور استلام الطلب.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Delivery Notes */}
              {user && !isBlockedFromOrdering && (
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'notes')}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === 'fr' ? 'Indiquez des détails pour le livreur...' : 'أي تفاصيل خاصة بالتوصيل...'}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3 text-xs focus:outline-hidden focus:border-brand-cyan"
                    rows={2}
                  />
                </div>
              )}

              {/* Place Order checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={loading || isBlockedFromOrdering}
                className={`w-full font-bold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs ${
                  isBlockedFromOrdering
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-brand-cyan text-white hover:bg-brand-cyan/90'
                }`}
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
                    <CreditCard size={18} />
                    {getTranslation(lang, 'placeOrder')}
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
