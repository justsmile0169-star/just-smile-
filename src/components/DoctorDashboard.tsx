import React, { useState, useEffect } from 'react';
import { Order, Payment, Product, ProductReturn, UserProfile, ProfileUpdateRequest } from '../types';
import { Language, getTranslation } from '../translations';
import { ShoppingBag, FileText, Heart, Clock, AlertTriangle, RefreshCw, Eye, CheckCircle, HelpCircle, LayoutGrid, Activity, Syringe, Scissors, Smile, ShieldCheck, Layers, MessageSquare, Send, X, Trash2, User, MapPin, Building, Phone, ChevronDown, Truck, BarChart3, Lock, Printer, Key, Edit3 } from 'lucide-react';
import { collection, addDoc, serverTimestamp, updateDoc, doc, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { db, auth } from '../firebase';
import { hashPassword } from '../utils/crypto';
import { useAppDialog } from '../context/AppDialogContext';
import { getWilayas, getCommunesByWilaya, WilayaOption, CommuneOption, isFreeDelivery } from '../utils/algeriaData';
import { exportFinancialStatement } from '../utils/exportFinancialStatement';
import DoctorAnalytics from './DoctorAnalytics';
import SearchableWilayaCommuneSelector from './SearchableWilayaCommuneSelector';

interface DoctorDashboardProps {
  user: UserProfile;
  orders: Order[];
  allProducts: Product[];
  favorites: string[]; // list of product IDs
  recentlyViewed: string[]; // list of product IDs
  paymentsList?: Payment[];
  returnsList?: ProductReturn[];
  lang: Language;
  categoryCounts?: Record<string, number>;
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
  paymentsList = [],
  returnsList = [],
  lang,
  categoryCounts,
  onAddToCart,
  onToggleFavorite,
  onViewProduct,
  onQuickReorder,
  onPrintInvoice,
  onSelectCategory
}: DoctorDashboardProps) {
  const isRtl = lang === 'ar';
  const { alert, confirm } = useAppDialog();
  const [activeTab, setActiveTab] = useState<'orders' | 'analytics'>('orders');

  // Scroll to top when switching between doctor tabs/views
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.body.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    };
    scrollToTop();
    const raf = requestAnimationFrame(scrollToTop);
    const timeout = setTimeout(scrollToTop, 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [activeTab]);

  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  // --- Profile Edit & Password Change State ---
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingProfileRequest, setPendingProfileRequest] = useState<ProfileUpdateRequest | null>(null);

  const [profileName, setProfileName] = useState(user.name);
  const [profilePhone, setProfilePhone] = useState(user.phone);
  const [profileClinic, setProfileClinic] = useState(user.clinicName);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [wilayas, setWilayas] = useState<WilayaOption[]>([]);
  const [communes, setCommunes] = useState<CommuneOption[]>([]);
  const [selectedWilaya, setSelectedWilaya] = useState<WilayaOption | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<CommuneOption | null>(null);
  const [loadingWilayas, setLoadingWilayas] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Sync real-time pending profile update requests for this doctor
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'profile_update_requests'),
      where('doctorId', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: ProfileUpdateRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<ProfileUpdateRequest, 'id'>) });
      });
      const pending = list.find((r) => r.status === 'pending') || null;
      setPendingProfileRequest(pending);
    });
    return () => unsub();
  }, [user?.uid]);

  // Update edit form values when user prop changes (e.g. after database load/update)
  useEffect(() => {
    setProfileName(user.name || '');
    setProfilePhone(user.phone || '');
    setProfileClinic(user.clinicName || '');
  }, [user]);

  const handleOpenProfileModal = async () => {
    if (pendingProfileRequest) {
      alert(
        lang === 'fr'
          ? 'Vous avez déjà une demande de modification en cours d\'examen par l\'administration.'
          : 'لديك طلب تعديل بيانات قيد المراجعة حالياً من قبل الإدارة، يرجى انتظار قرار الإدارة أو إلغاء الطلب الحالي أولاً.',
        'info'
      );
      return;
    }

    setShowProfileModal(true);
    setLoadingWilayas(true);
    try {
      const wilayaList = await getWilayas();
      setWilayas(wilayaList);
      
      const currentWilaya = wilayaList.find(w => w.code === user.wilayaCode) || null;
      setSelectedWilaya(currentWilaya);
      
      if (currentWilaya) {
        const communeList = await getCommunesByWilaya(currentWilaya.code);
        setCommunes(communeList);
        const currentCommune = communeList.find(c => c.nameAr === user.communeName || c.nameAscii === user.communeNameAscii) || null;
        setSelectedCommune(currentCommune);
      }
    } catch (error) {
      console.error('Error loading location data for edit profile:', error);
    } finally {
      setLoadingWilayas(false);
    }
  };

  const handleWilayaChange = async (code: string) => {
    const w = wilayas.find((w) => w.code === code) ?? null;
    setSelectedWilaya(w);
    setSelectedCommune(null);
    setCommunes([]);
    if (w) {
      const list = await getCommunesByWilaya(w.code);
      setCommunes(list);
    }
  };

  // 1. Direct Password Change (Instant without admin approval)
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      alert(lang === 'fr' ? 'Veuillez saisir le nouveau mot de passe.' : 'يرجى إدخال وتأكيد كلمة المرور الجديدة.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert(lang === 'fr' ? 'Les mots de passe ne correspondent pas.' : 'كلمتا المرور غير متطابقتين.', 'error');
      return;
    }
    if (newPassword.length < 4) {
      alert(lang === 'fr' ? 'Le mot de passe doit contenir au moins 4 caractères.' : 'يجب أن تحتوي كلمة المرور على 4 أحرف كحد أدنى.', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      const hashed = await hashPassword(newPassword.trim());
      if (auth.currentUser) {
        try {
          await updatePassword(auth.currentUser, newPassword.trim());
        } catch (pErr) {
          console.warn('Firebase Auth updatePassword notice:', pErr);
        }
      }

      await updateDoc(doc(db, 'users', user.uid), {
        password: hashed
      });

      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordModal(false);
      alert(
        lang === 'fr'
          ? 'Mot de passe mis à jour avec succès !'
          : 'تم تغيير كلمة المرور بنجاح!',
        'success'
      );
    } catch (error) {
      console.error('Error updating password:', error);
      alert(
        lang === 'fr'
          ? 'Erreur lors du changement de mot de passe.'
          : 'حدث خطأ أثناء تغيير كلمة المرور.',
        'error'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  // 2. Submit Profile Update Request (Sent to Admin for review)
  const handleSubmitProfileRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim() || !profilePhone.trim() || !profileClinic.trim() || !selectedWilaya || !selectedCommune) {
      alert(lang === 'fr' ? 'Tous les champs sont requis.' : 'جميع الحقول مطلوبة.', 'error');
      return;
    }

    setSavingProfile(true);
    try {
      const wilayaName  = lang === 'ar' ? selectedWilaya.nameAr : selectedWilaya.nameAscii;
      const communeName = lang === 'ar' ? selectedCommune.nameAr : selectedCommune.nameAscii;
      const locationStr = `${wilayaName}، ${communeName}`;

      await addDoc(collection(db, 'profile_update_requests'), {
        doctorId: user.uid,
        doctorName: user.name || '',
        doctorEmail: user.email || '',
        doctorPhone: user.phone || '',
        currentData: {
          name: user.name || '',
          phone: user.phone || '',
          clinicName: user.clinicName || '',
          location: user.location || '',
          wilayaCode: user.wilayaCode || '',
          wilayaName: user.wilayaName || '',
          communeName: user.communeName || '',
          communeNameAscii: user.communeNameAscii || ''
        },
        requestedChanges: {
          name: profileName.trim(),
          phone: profilePhone.trim(),
          clinicName: profileClinic.trim(),
          location: locationStr,
          wilayaCode: selectedWilaya.code,
          wilayaName: selectedWilaya.nameAr,
          communeName: selectedCommune.nameAr,
          communeNameAscii: selectedCommune.nameAscii
        },
        status: 'pending',
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'notifications'), {
        userId: 'admin',
        titleFr: 'Demande de modification de profil',
        titleAr: 'طلب تعديل ملف شخصي لطبيب',
        messageFr: `Le Dr. ${user.name} a envoyé une demande de modification de son profil pour validation.`,
        messageAr: `أرسل الطبيب ${user.name} طلباً لتعديل معلومات حسابه الشخصي للمراجعة والاعتماد.`,
        type: 'profile_request',
        isRead: false,
        createdAt: new Date().toISOString()
      }).catch(console.error);

      setShowProfileModal(false);
      alert(
        lang === 'fr' 
          ? 'Votre demande de modification a été transmise à l\'administration avec succès. Les modifications seront appliquées dès approbation.' 
          : 'تم إرسال طلب تعديل البيانات إلى الإدارة بنجاح! سيتم تطبيق التعديلات فور مراجعتها وقبولها من الإدارة.', 
        'success'
      );
    } catch (error) {
      console.error('Error submitting profile request:', error);
      alert(
        lang === 'fr' 
          ? 'Erreur lors de l\'envoi de la demande.' 
          : 'حدث خطأ أثناء إرسال طلب التعديل.', 
        'error'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  // 3. Cancel Pending Request
  const handleCancelProfileRequest = async () => {
    if (!pendingProfileRequest) return;
    const confirmed = await confirm(
      lang === 'fr'
        ? 'Voulez-vous vraiment annuler votre demande de modification en attente ?'
        : 'هل أنت متأكد من إلغاء طلب تعديل البيانات المعلق؟'
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'profile_update_requests', pendingProfileRequest.id));
      alert(
        lang === 'fr' ? 'Demande annulée avec succès.' : 'تم إلغاء طلب التعديل بنجاح.',
        'success'
      );
    } catch (err) {
      console.error('Error cancelling profile request:', err);
      alert(
        lang === 'fr' ? 'Erreur lors de l\'annulation de la demande.' : 'حدث خطأ أثناء إلغاء الطلب.',
        'error'
      );
    }
  };

  const freeDelivery =
    selectedWilaya && selectedCommune
      ? isFreeDelivery(selectedWilaya.code, selectedCommune.nameAscii)
      : false;

  const handleCancelOrder = async (orderId: string) => {
    const confirmed = await confirm(lang === 'fr' ? 'Voulez-vous vraiment annuler cette commande ?' : 'هل أنت متأكد من إلغاء هذه الطلبية؟');
    if (!confirmed) return;
    
    setCancellingOrderId(orderId);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: user.uid,
        cancelledByName: user.name
      });
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert(lang === 'fr' ? 'Erreur lors de l\'annulation de la commande.' : 'حدث خطأ أثناء إلغاء الطلبية.', 'error');
    } finally {
      setCancellingOrderId(null);
    }
  };

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
      alert(lang === 'fr' ? 'Message envoyé avec succès!' : 'تم إرسال الرسالة بنجاح!', 'success');
    } catch (error) {
      console.error('Error sending message:', error);
      alert(lang === 'fr' ? 'Erreur lors de l\'envoi du message.' : 'حدث خطأ أثناء إرسال الرسالة.', 'error');
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
    const extraDays = user?.extraGraceDays || 0;
    if (extraDays > 0) {
      deadline.setDate(deadline.getDate() + extraDays);
    }
    const today = new Date();
    return today > deadline;
  });

  const isBlocked = overdueOrders.length > 0;

  // Find products matching arrays
  const favoriteProducts = allProducts.filter((p) => favorites.includes(p.id));
  const recentlyViewedProducts = allProducts.filter((p) => recentlyViewed.includes(p.id));

  const handleExportStatement = () => {
    const userId = user.uid || (user as any).id;
    const userPayments = (paymentsList || []).filter(
      (p) => p.userId === userId
    );
    const userReturns = (returnsList || []).filter(
      (r) => r.userId === userId
    );
    exportFinancialStatement({
      client: user,
      orders,
      payments: userPayments,
      returns: userReturns,
      lang
    });
  };

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

        {/* Tab Navigation */}
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'orders'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={16} />
            {lang === 'fr' ? 'Commandes' : 'الطلبات'}
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'analytics'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 size={16} />
            {lang === 'fr' ? 'Analytiques' : 'التحليلات'}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Export Financial Statement Button */}
          <button
            onClick={handleExportStatement}
            className="flex items-center gap-2 bg-brand-cyan text-white hover:bg-brand-cyan/90 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-xs cursor-pointer"
            title={lang === 'fr' ? 'Imprimer le relevé financier' : 'تصدير / طباعة كشف الحساب المالي'}
          >
            <Printer size={16} />
            <span>{lang === 'fr' ? 'Relevé Financier 📑' : 'تصدير كشف الحساب 📑'}</span>
          </button>

          {/* Change Password Button (Direct & Instant) */}
          <button
            onClick={() => {
              setNewPassword('');
              setConfirmPassword('');
              setShowPasswordModal(true);
            }}
            className="flex items-center gap-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer"
            title={lang === 'fr' ? 'Changer mon mot de passe' : 'تغيير كلمة المرور مباشرة'}
          >
            <Key size={16} className="text-amber-500" />
            <span>{lang === 'fr' ? 'Mot de passe' : 'تغيير كلمة المرور'}</span>
          </button>

          {/* Request Profile Edit Button (Requires Admin Approval) */}
          <button
            onClick={handleOpenProfileModal}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer ${
              pendingProfileRequest
                ? 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
                : 'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
            }`}
          >
            <Edit3 size={16} className={pendingProfileRequest ? 'text-amber-600' : 'text-slate-500'} />
            <span>{lang === 'fr' ? 'Demander modification profil' : 'طلب تعديل البيانات'}</span>
            {pendingProfileRequest && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            )}
          </button>

          {/* Contact Admin Button */}
          <button
            onClick={() => setShowMessageModal(true)}
            className="flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer"
          >
            <MessageSquare size={16} />
            <span>{lang === 'fr' ? 'Contacter l\'administration' : 'اتصل بالإدارة'}</span>
          </button>
        </div>
      </div>

      {/* Pending Profile Update Request Alert Banner */}
      {pendingProfileRequest && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-bold shadow-2xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
              <Clock size={20} className="animate-spin" />
            </div>
            <div>
              <span className="block font-black text-sm text-amber-900">
                {lang === 'fr' ? '⏳ Demande de modification du profil en cours d\'examen par l\'administration' : '⏳ طلب تعديل معلومات الملف الشخصي قيد مراجعة الإدارة'}
              </span>
              <span className="text-xs text-amber-700 font-medium">
                {lang === 'fr'
                  ? `Demande envoyée le ${new Date(pendingProfileRequest.createdAt).toLocaleDateString('fr-FR')}. Vos nouvelles coordonnées seront mises à jour dès validation par l'administration.`
                  : `أُرسل طلب التعديل بتاريخ ${new Date(pendingProfileRequest.createdAt).toLocaleDateString('ar-DZ')}. ستُحدّث معلوماتك مباشرة فور مراجعة وقبول الإدارة للطلب.`}
              </span>
            </div>
          </div>
          <button
            onClick={handleCancelProfileRequest}
            className="text-rose-700 bg-rose-50 hover:bg-rose-100 px-3.5 py-2 rounded-xl border border-rose-200 text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            {lang === 'fr' ? 'Annuler la demande' : 'إلغاء الطلب'}
          </button>
        </div>
      )}

      {user.extraGraceDays && user.extraGraceDays > 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center justify-between text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Clock size={18} className="text-emerald-600 shrink-0" />
            <span>
              {lang === 'fr'
                ? `Privilège accordé par l'administration: +${user.extraGraceDays} jours de délai de grâce supplémentaire pour le règlement de vos créances.`
                : `امتياز خاص من الإدارة: تم منحك مهلة سداد إضافية قدرها +${user.extraGraceDays} أيام لتسوية الديون.`}
            </span>
          </div>
        </div>
      ) : null}

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
            { id: 'all', labelFr: 'Tous', labelAr: 'الكل', icon: LayoutGrid, count: categoryCounts?.all ?? allProducts.length },
            { id: 'Équipements', labelFr: 'Équipements', labelAr: 'المعدات', icon: Activity, count: categoryCounts?.['Équipements'] ?? allProducts.filter(p => p.category === 'Équipements').length },
            { id: 'Consommables', labelFr: 'Consommables', labelAr: 'المواد الاستهلاكية', icon: Syringe, count: categoryCounts?.['Consommables'] ?? allProducts.filter(p => p.category === 'Consommables').length },
            { id: 'Instruments', labelFr: 'Instruments', labelAr: 'الأدوات', icon: Scissors, count: categoryCounts?.['Instruments'] ?? allProducts.filter(p => p.category === 'Instruments').length },
            { id: 'Orthodontie', labelFr: 'Orthodontie', labelAr: 'تقويم الأسنان', icon: Smile, count: categoryCounts?.['Orthodontie'] ?? allProducts.filter(p => p.category === 'Orthodontie').length },
            { id: 'Hygiène & Stérilisation', labelFr: 'Hygiène & Stérilisation', labelAr: 'النظافة والتعقيم', icon: ShieldCheck, count: categoryCounts?.['Hygiène & Stérilisation'] ?? allProducts.filter(p => p.category === 'Hygiène & Stérilisation').length },
            { id: 'Prothèse dentaire', labelFr: 'Prothèse dentaire', labelAr: 'بدائل الأسنان', icon: Layers, count: categoryCounts?.['Prothèse dentaire'] ?? allProducts.filter(p => p.category === 'Prothèse dentaire').length }
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
        
        {/* Left 2 Columns: Orders List or Analytics */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'orders' ? (
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
                      const deadline = new Date(order.deadlineDate);
                      const extraDays = user?.extraGraceDays || 0;
                      if (extraDays > 0) {
                        deadline.setDate(deadline.getDate() + extraDays);
                      }
                      const isOrderOverdue = order.remainingBalance > 0 && order.paymentMethod !== 'cash' && new Date() > deadline;

                      return (
                        <tr key={order.id} className="text-sm hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 font-bold text-slate-800">
                            <div>#{order.id ? order.id.slice(-6).toUpperCase() : 'UNKNOWN'}</div>
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
                              {order.status === 'pending' && (
                                <button
                                  onClick={() => handleCancelOrder(order.id)}
                                  disabled={cancellingOrderId === order.id}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-50"
                                  title={lang === 'fr' ? 'Annuler la commande' : 'إلغاء الطلبية'}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
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
          ) : (
            <DoctorAnalytics orders={orders} lang={lang} />
          )}
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

      {/* 1. Request Profile Update Modal (Requires Admin Approval) */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-extrabold text-slate-800 text-base md:text-lg flex items-center gap-2">
                <Edit3 size={20} className="text-brand-cyan" />
                {lang === 'fr' ? 'Demande de modification du profil' : 'طلب تعديل معلومات الملف الشخصي'}
              </h3>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitProfileRequest} className="p-6 space-y-4">
              {/* Notice Box */}
              <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3.5 rounded-2xl text-xs font-semibold leading-relaxed">
                {lang === 'fr'
                  ? 'ℹ️ Note : Les modifications apportées à vos coordonnées (nom, téléphone, clinique, wilaya) seront soumises à l\'administration pour révision et validation avant d\'être appliquées.'
                  : 'ℹ️ تنبيه: تعديلات بيانات الحساب (الاسم، الهاتف، العيادة، العنوان) تُرسل كطلب رسمي للإدارة لمراجعتها والموافقة عليها قبل اعتمادها في حسابك.'}
              </div>

              {/* Doctor Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {getTranslation(lang, 'name')}
                </label>
                <div className="relative">
                  <User size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Dr. Ahmed Benali' : 'د. أحمد بن علي'}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-10 text-sm focus:outline-hidden focus:border-brand-cyan ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {getTranslation(lang, 'phone')}
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="tel"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    placeholder="0550 12 34 56"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-10 text-sm focus:outline-hidden focus:border-brand-cyan ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                  />
                </div>
              </div>

              {/* Clinic Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {getTranslation(lang, 'clinicName')}
                </label>
                <div className="relative">
                  <Building size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text"
                    required
                    value={profileClinic}
                    onChange={(e) => setProfileClinic(e.target.value)}
                    placeholder={lang === 'fr' ? 'Cabinet Dentaire El-Yasmine' : 'عيادة الياسمين لطب الأسنان'}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-10 text-sm focus:outline-hidden focus:border-brand-cyan ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                  />
                </div>
              </div>

              {/* Searchable Wilaya & Commune Selector */}
              <SearchableWilayaCommuneSelector
                lang={lang}
                selectedWilaya={selectedWilaya}
                selectedCommune={selectedCommune}
                onSelectWilaya={(w) => {
                  setSelectedWilaya(w);
                  setSelectedCommune(null);
                }}
                onSelectCommune={(c) => setSelectedCommune(c)}
                required
              />

              {/* Delivery badge */}
              {selectedCommune && (
                <div
                  className={`mt-2 flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border ${
                    freeDelivery
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}
                >
                  <Truck size={14} className="shrink-0" />
                  {freeDelivery
                    ? (lang === 'fr'
                        ? '🎉 Livraison GRATUITE — Commune de Djelfa !'
                        : '🎉 التوصيل مجاني — بلدية الجلفة!')
                    : (lang === 'fr'
                        ? '📦 Des frais de livraison s\'appliqueront selon la localisation.'
                        : '📦 سيتم احتساب تكلفة التوصيل حسب الموقع.')}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-brand-cyan hover:bg-brand-cyan/90 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  {savingProfile ? (
                    <span>{lang === 'fr' ? 'Envoi en cours...' : 'جاري الإرسال...'}</span>
                  ) : (
                    <span>{lang === 'fr' ? 'Envoyer la demande' : 'إرسال طلب التعديل للإدارة'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Direct Password Change Modal (Instant) */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-extrabold text-slate-800 text-base md:text-lg flex items-center gap-2">
                <Key size={20} className="text-amber-500" />
                {lang === 'fr' ? 'Changer mon mot de passe' : 'تغيير كلمة المرور'}
              </h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                {lang === 'fr'
                  ? 'Vous pouvez modifier votre mot de passe directement sans avoir besoin de l\'approbation de l\'administration.'
                  : 'يمكنك تغيير وتحديث كلمة المرور لحسابك بشكل فوري ومباشر دون الحاجة لموافقة الإدارة.'}
              </p>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {lang === 'fr' ? 'Nouveau mot de passe' : 'كلمة المرور الجديدة'}
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-10 text-sm focus:outline-hidden focus:border-brand-cyan font-mono ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {lang === 'fr' ? 'Confirmer le mot de passe' : 'تأكيد كلمة المرور الجديدة'}
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-10 text-sm focus:outline-hidden focus:border-brand-cyan font-mono ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'}`}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-amber-500 hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  {savingPassword ? (
                    <span>{lang === 'fr' ? 'Mise à jour...' : 'جاري التحديث...'}</span>
                  ) : (
                    <span>{lang === 'fr' ? 'Mettre à jour' : 'تحديث كلمة المرور'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="button"
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
