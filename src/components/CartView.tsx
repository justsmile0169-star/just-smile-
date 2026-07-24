import React, { useState, useEffect } from 'react';
import { CartItem, UserProfile, Order, Product, Promotion } from '../types';
import { calculatePromotionDiscount } from '../utils/promotionEngine';
import { Language, getTranslation } from '../translations';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { ShoppingCart, Trash2, Plus, Minus, CreditCard, ShieldAlert, CheckCircle, Truck, User, Phone, MapPin, ChevronDown, LogIn, Sparkles } from 'lucide-react';
import { useAppDialog } from '../context/AppDialogContext';
import {
  isFreeDelivery, getDeliveryPricing, getWilayas, getCommunesByWilaya,
  WilayaOption, CommuneOption
} from '../utils/algeriaData';

interface CartViewProps {
  cart: CartItem[];
  user: UserProfile | null;
  currentUser: UserProfile | null;
  userOrders: Order[];
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
  const [scheduledDeliveryDate, setScheduledDeliveryDate] = useState<string>('');

  // ── Guest Checkout Fields ───────────────────────────────────────────────────
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [wilayas, setWilayas] = useState<WilayaOption[]>([]);
  const [communes, setCommunes] = useState<CommuneOption[]>([]);
  const [selectedWilaya, setSelectedWilaya] = useState<WilayaOption | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<CommuneOption | null>(null);
  const [loadingWilayas, setLoadingWilayas] = useState(false);

  const isRtl = lang === 'ar';

  // Load wilayas if user is guest
  useEffect(() => {
    if (!user && wilayas.length === 0) {
      setLoadingWilayas(true);
      getWilayas()
        .then(setWilayas)
        .finally(() => setLoadingWilayas(false));
    }
  }, [user, wilayas.length]);

  // When guest changes wilaya -> update communes
  const handleWilayaChange = async (code: string) => {
    const w = wilayas.find((item) => item.code === code) ?? null;
    setSelectedWilaya(w);
    setSelectedCommune(null);
    setCommunes([]);
    if (w) {
      const list = await getCommunesByWilaya(w.code);
      setCommunes(list);
    }
  };

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  // --- Calculate Totals & Discounts ---
  const totals = cart.reduce(
    (acc, item) => {
      const pDiscount = item.product.discountPercent || 0;
      const unitBasePrice = item.selectedVariant ? item.selectedVariant.price : item.product.price;
      const baseProductTotal = unitBasePrice * item.quantity;
      const finalProductPrice = Math.round(unitBasePrice * (1 - pDiscount / 100));
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
  const activeWilayaCode = user ? (user.wilayaCode || '') : (selectedWilaya?.code || '');
  const activeCommuneNameAscii = user ? (user.communeNameAscii || '') : (selectedCommune?.nameAscii || '');

  const hasFreeDelivery = activeWilayaCode && activeCommuneNameAscii
    ? isFreeDelivery(activeWilayaCode, activeCommuneNameAscii)
    : false;

  const deliveryPricing = activeWilayaCode ? getDeliveryPricing(activeWilayaCode) : { toOffice: 450, toClinic: 700 };
  const deliveryCost = hasFreeDelivery ? 0 : (deliveryOption === 'to_office' ? deliveryPricing.toOffice : deliveryPricing.toClinic);

  const netTotalToPay = totals.grossTotal - totalDiscount + deliveryCost;

  // --- Blocking Rule Check for Logged in User ---
  const overdueOrders = userOrders.filter((order) => {
    if (order.remainingBalance <= 0) return false;
    if (order.paymentMethod === 'cash') return false;
    const deadline = new Date(order.deadlineDate);
    const today = new Date();
    return today > deadline;
  });

  const isBlockedFromOrdering = user ? overdueOrders.length > 0 : false;

  // Handle Checkout submission
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cart.length === 0) return;

    if (user && user.role !== 'doctor') {
      alert(lang === 'fr' ? 'Réservé aux أطباء والعملاء فقط.' : 'هذا الحساب غير مخول للطلب.', 'error');
      return;
    }

    if (user && isBlockedFromOrdering) {
      alert(getTranslation(lang, 'orderBlockedDebt'), 'error');
      return;
    }

    // Validation for Guest Checkout
    if (!user) {
      if (!guestName.trim()) {
        alert(lang === 'fr' ? 'Veuillez saisir votre Nom et Prénom.' : 'يرجى إدخال الإسم واللقب.', 'error');
        return;
      }
      if (!guestPhone.trim()) {
        alert(lang === 'fr' ? 'Veuillez saisir votre numéro de téléphone.' : 'يرجى إدخال رقم الهاتف.', 'error');
        return;
      }
      if (!selectedWilaya || !selectedCommune) {
        alert(lang === 'fr' ? 'Veuillez sélectionner la Wilaya et la Commune.' : 'يرجى اختيار الولاية والبلدية والتوصيل.', 'error');
        return;
      }
    }

    setLoading(true);

    try {
      const orderDate = new Date();
      const deadlineDate = new Date();
      deadlineDate.setDate(orderDate.getDate() + 20);

      const orderRef = collection(db, 'orders');

      const userId = user ? user.uid : `guest_${Date.now()}`;
      const doctorName = user ? user.name : guestName.trim();
      const doctorClinic = user ? user.clinicName : (notes.trim() || selectedCommune?.nameAr || 'زبون زائر');
      const doctorPhone = user ? user.phone : guestPhone.trim();
      const wilayaCode = user ? (user.wilayaCode || '') : (selectedWilaya?.code || '');
      const wilayaName = user ? (user.wilayaName || '') : (selectedWilaya?.nameAr || '');
      const communeName = user ? (user.communeName || '') : (selectedCommune?.nameAr || '');

      const newOrder: Omit<Order, 'id'> = {
        userId,
        doctorName,
        doctorClinic,
        doctorPhone,
        items: cart.map((item) => {
          const unitBasePrice = item.selectedVariant ? item.selectedVariant.price : item.product.price;
          const finalPrice = item.product.discountPercent ? Math.round(unitBasePrice * (1 - item.product.discountPercent / 100)) : unitBasePrice;
          // Build item object — omit undefined fields (Firestore rejects them)
          const orderItem: any = {
            productId: item.product.id,
            name: item.product.name,
            price: finalPrice,
            quantity: item.quantity,
            category: item.product.category,
            discountPercent: item.product.discountPercent || 0,
          };
          if (item.selectedVariant?.id) orderItem.variantId = item.selectedVariant.id;
          if (item.selectedVariant?.name) orderItem.variantName = item.selectedVariant.name;
          if (item.selectedVariant?.attributes) orderItem.variantAttributes = item.selectedVariant.attributes;
          return orderItem;
        }),
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
        commercialName: user?.commercialName || 'Directe',
        notes: notes.trim() || "",
        // Optional fields: only include when defined (Firestore rejects undefined)
        ...(currentUser?.uid ? { processedBy: currentUser.uid } : {}),
        ...(currentUser?.name ? { processedByName: currentUser.name } : {}),
        ...(scheduledDeliveryDate ? { scheduledDeliveryDate } : {}),
        // Delivery fields
        deliveryType: hasFreeDelivery ? 'free' : deliveryOption,
        deliveryCost: deliveryCost,
        doctorWilayaCode: wilayaCode,
        doctorWilayaName: wilayaName,
        doctorCommuneName: communeName,
      };

      console.log('Creating order document:', newOrder);
      const orderDoc = await addDoc(orderRef, newOrder);
      if (!orderDoc.id) {
        throw new Error('Failed to create order document');
      }
      await updateDoc(doc(db, 'orders', orderDoc.id), { id: orderDoc.id }).catch(console.error);

      // Decrement inventory stock & update salesCount
      try {
        const batch = writeBatch(db);
        const lowStockAlertsToCreate: { product: Product; newStock: number }[] = [];
        cart.forEach((item) => {
          const prodRef = doc(db, 'products', item.product.id);
          const newStock = Math.max(0, item.product.stock - item.quantity);
          const newSalesCount = (item.product.salesCount || 0) + item.quantity;

          if (item.product.isVariable && item.selectedVariant && item.product.variants) {
            const updatedVariants = item.product.variants.map((v) =>
              v.id === item.selectedVariant!.id ? { ...v, stock: Math.max(0, v.stock - item.quantity) } : v
            );
            batch.update(prodRef, {
              stock: newStock,
              salesCount: newSalesCount,
              variants: updatedVariants
            });
          } else {
            batch.update(prodRef, {
              stock: newStock,
              salesCount: newSalesCount
            });
          }

          const threshold = item.product.lowStockAlert ?? 5;
          if (newStock <= threshold && item.product.stock > threshold) {
            lowStockAlertsToCreate.push({
              product: item.product,
              newStock
            });
          }
        });
        await batch.commit();

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
          }).catch(console.error);
        }
      } catch (stockErr) {
        console.warn('Inventory update error:', stockErr);
      }

      if (user) {
        await addDoc(collection(db, 'notifications'), {
          userId: user.uid,
          titleFr: 'Commande enregistrée !',
          titleAr: 'تم تسجيل طلبك!',
          messageFr: `Votre commande d'un montant net de ${formatPrice(netTotalToPay)} a été reçue.`,
          messageAr: `تم استلام طلبك بنجاح بقيمة ${formatPrice(netTotalToPay)}.`,
          type: 'order_update',
          isRead: false,
          createdAt: new Date().toISOString()
        }).catch(console.error);
      }

      setSuccess(true);
      onClearCart();
    } catch (err) {
      console.error('Order creation error:', err);
      alert(lang === 'fr' ? 'Erreur lors du passage de commande.' : 'حدث خطأ أثناء إتمام الطلب.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="py-12 px-4 flex items-center justify-center min-h-[60vh]" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-8 md:p-10 max-w-lg w-full text-center space-y-6 shadow-2xl relative overflow-hidden">
          {/* Top Decorative Gradient Overlay */}
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -top-16 -right-16 w-32 h-32 bg-brand-cyan/10 rounded-full blur-2xl pointer-events-none" />

          {/* Success Animated Icon Badge */}
          <div className="relative inline-flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-white dark:bg-slate-900 rounded-full flex items-center justify-center text-emerald-500">
                <CheckCircle size={52} className="stroke-[2.2]" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-amber-400 text-white p-1.5 rounded-full shadow-md">
              <Sparkles size={16} />
            </div>
          </div>

          {/* Text Content */}
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {lang === 'fr' ? 'Merci pour votre confiance !' : 'شكراً لثقتك بنا'}
            </h2>
            <p className="text-base md:text-lg text-slate-600 dark:text-slate-300 font-bold leading-relaxed px-2">
              {lang === 'fr'
                ? 'Votre commande a été reçue avec succès et nous la préparons actuellement. Nous avons hâte de vous revoir bientôt !'
                : 'تم استلام طلبك بنجاح، ونعمل حالياً على تجهيزه. نتطلع لرؤيتك قريباً!'}
            </p>
          </div>

          {/* OK Button */}
          <div className="pt-3">
            <button
              onClick={() => {
                setSuccess(false);
                onCheckoutSuccess();
                setActiveTab('browse');
              }}
              className="w-full bg-gradient-to-r from-brand-cyan to-teal-600 hover:from-brand-dark hover:to-teal-700 text-white font-black text-base py-4 px-8 rounded-2xl transition-all duration-200 shadow-lg shadow-brand-cyan/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
            >
              {lang === 'fr' ? "D'accord" : 'حسناً'}
            </button>
          </div>
        </div>
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
        <div className="text-center py-16 bg-white border border-slate-100 rounded-3xl p-8 space-y-4 shadow-xs">
          <ShoppingCart className="mx-auto text-slate-300" size={48} />
          <h3 className="font-bold text-slate-700 text-sm md:text-base">{getTranslation(lang, 'emptyCart')}</h3>
          <button
            onClick={() => setActiveTab('browse')}
            className="bg-brand-cyan text-white font-extrabold text-xs md:text-sm px-6 py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-colors shadow-xs"
          >
            {lang === 'fr' ? 'Continuer mes achats' : 'تصفح المنتجات الآن'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Columns: Items list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xs divide-y divide-slate-100">
              {cart.map((item, index) => {
                const discount = item.product.discountPercent || 0;
                const unitBase = item.selectedVariant ? item.selectedVariant.price : item.product.price;
                const priceBefore = unitBase;
                const priceAfter = discount > 0 ? Math.round(priceBefore * (1 - discount / 100)) : priceBefore;
                const itemKey = item.selectedVariant ? `${item.product.id}_${item.selectedVariant.id}_${index}` : `${item.product.id}_${index}`;

                return (
                  <div key={itemKey} className="flex items-start gap-4 py-5 first:pt-0 last:pb-0">
                    <img
                      src={item.selectedVariant?.image || (item.product.image && String(item.product.image) !== '0' ? item.product.image : 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300')}
                      alt={item.product.name}
                      className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-2xl bg-slate-150 border border-slate-50 shrink-0"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-brand-cyan/5 text-brand-cyan px-2 py-0.5 rounded-md font-bold uppercase">
                          {item.product.category}
                        </span>
                        {item.selectedVariant && (
                          <span className="text-[11px] bg-cyan-100 text-cyan-800 font-bold px-2 py-0.5 rounded-md border border-cyan-200">
                            {item.selectedVariant.name}
                          </span>
                        )}
                      </div>
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

          {/* Right Column: Checkout Order Summary & Fast Checkout Info */}
          <div className="space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
              <h3 className="text-base font-black text-slate-800 border-b border-slate-50 pb-3">
                {lang === 'fr' ? 'Résumé de la commande' : 'ملخص الطلب والمعلومات'}
              </h3>

              {/* Guest Checkout Fields Form */}
              {!user && (
                <div className="space-y-4 bg-slate-50/70 border border-slate-200/80 p-4 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <User size={15} className="text-brand-cyan" />
                      {lang === 'fr' ? 'Achat Rapide (Sans compte)' : 'الشراء السريع المباشر (معلومات الزبون)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('auth')}
                      className="text-xs font-bold text-brand-cyan hover:text-brand-dark flex items-center gap-1 transition-colors"
                    >
                      <LogIn size={13} />
                      {lang === 'fr' ? 'Se connecter' : 'تسجيل الدخول'}
                    </button>
                  </div>

                  <div className="space-y-3 pt-1">
                    {/* Name */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        {lang === 'fr' ? 'Nom et Prénom *' : 'الإسم واللقب *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder={lang === 'fr' ? 'Ex: Mohamed Amine' : 'مثال: محمد الأمين'}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-brand-cyan font-medium"
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        {lang === 'fr' ? 'Numéro de téléphone *' : 'رقم الهاتف *'}
                      </label>
                      <input
                        type="tel"
                        required
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="07XX XXX XXX"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-brand-cyan font-medium"
                        dir="ltr"
                      />
                    </div>

                    {/* Wilaya Dropdown */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        {lang === 'fr' ? 'Wilaya de livraison *' : 'الولاية *'}
                      </label>
                      <div className="relative">
                        <select
                          value={selectedWilaya?.code || ''}
                          onChange={(e) => handleWilayaChange(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs appearance-none focus:outline-none focus:border-brand-cyan font-medium text-slate-800"
                          disabled={loadingWilayas}
                        >
                          <option value="">{lang === 'fr' ? '-- Sélectionner la Wilaya --' : '-- اختر الولاية --'}</option>
                          {wilayas.map((w) => (
                            <option key={w.code} value={w.code}>
                              {w.code} - {isRtl ? w.nameAr : w.nameAscii}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none rtl:left-auto rtl:right-3" />
                      </div>
                    </div>

                    {/* Commune Dropdown */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">
                        {lang === 'fr' ? 'Commune de livraison *' : 'البلدية *'}
                      </label>
                      <div className="relative">
                        <select
                          value={selectedCommune?.id || ''}
                          onChange={(e) => {
                            const c = communes.find((item) => String(item.id) === e.target.value) ?? null;
                            setSelectedCommune(c);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs appearance-none focus:outline-none focus:border-brand-cyan font-medium text-slate-800"
                          disabled={!selectedWilaya || communes.length === 0}
                        >
                          <option value="">{lang === 'fr' ? '-- Sélectionner la Commune --' : '-- اختر البلدية --'}</option>
                          {communes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {isRtl ? c.nameAr : c.nameAscii}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none rtl:left-auto rtl:right-3" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Delivery Option Selection */}
              {(!user || (user && !isBlockedFromOrdering)) && (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block">
                    {lang === 'fr' ? 'Option de livraison' : 'مكان التوصيل للشحن'}
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
                        className={`w-full p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
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
                            {lang === 'fr' ? 'Livraison au المكتب (Bureau)' : 'التوصيل إلى المكتب (Stop Desk)'}
                          </p>
                          <p className="text-slate-400">
                            {lang === 'fr'
                              ? `Récupération au مكتب de livraison. Tarif : ${formatPrice(deliveryPricing.toOffice)}`
                              : `استلام الطرد من مكتب التوصيل. السعر: ${formatPrice(deliveryPricing.toOffice)}`}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeliveryOption('to_clinic')}
                        className={`w-full p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
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
                            {lang === 'fr' ? 'Livraison au المكان الذي يريده (Domicile/Clinique)' : 'التوصيل للمنزل أو المكان الذي يحدده الزبون'}
                          </p>
                          <p className="text-slate-400">
                            {lang === 'fr'
                              ? `Livraison directe à votre adresse. Tarif : ${formatPrice(deliveryPricing.toClinic)}`
                              : `توصيل مباشر إلى المكان والعنوان المحدد. السعر: ${formatPrice(deliveryPricing.toClinic)}`}
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing breakdown */}
              <div className="space-y-3.5 text-sm font-medium text-slate-600 border-t border-slate-100 pt-4">
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

                <div className="flex justify-between text-base font-black text-slate-800 border-t border-slate-100 pt-3.5">
                  <span>
                    {lang === 'fr' ? 'Net à payer (Comptant)' : 'الصافي الواجب دفعه'}
                  </span>
                  <span className="text-brand-dark">{formatPrice(netTotalToPay)}</span>
                </div>
              </div>

              {/* Overdue alert rules */}
              {isBlockedFromOrdering && (
                <div className="flex items-start gap-2 text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100 text-xs leading-relaxed font-bold">
                  <ShieldAlert size={20} className="shrink-0 mt-0.5" />
                  <span>{getTranslation(lang, 'orderBlockedDebt')}</span>
                </div>
              )}

              {/* Delivery Notes */}
              {(!user || (user && !isBlockedFromOrdering)) && (
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'notes')}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === 'fr' ? 'Indiquez des détails pour le livreur (ex: adresse exacte)...' : 'العنوان التفصيلي أو أية ملاحظات للتوصيل...'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-brand-cyan"
                    rows={2}
                  />
                </div>
              )}

              {/* Place Order checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={loading || (user ? isBlockedFromOrdering : false)}
                className={`w-full font-extrabold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs ${
                  user && isBlockedFromOrdering
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
