import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Eye,
  EyeOff,
  Phone,
  MessageSquare,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Save,
  Info,
  Check,
  Calendar,
  Clock,
  FileSpreadsheet,
  Users,
  AlertTriangle,
  Play,
  CheckCircle,
  XCircle,
  Layers,
  FileText
} from 'lucide-react';
import {
  NotificationConfig,
  DEFAULT_NOTIFICATION_CONFIG,
  getNotificationConfig,
  saveNotificationConfig,
  sendTestNotification,
  buildTelegramMessage,
  buildWhatsAppMessage,
  TelegramRecipient,
  WhatsAppCallMeBotRecipient
} from '../../utils/orderNotificationService';
import {
  WeeklyStatementConfig,
  DEFAULT_WEEKLY_STATEMENT_CONFIG,
  WeeklyStatementRecipient,
  getWeeklyStatementConfig,
  saveWeeklyStatementConfig,
  buildDoctorStatementPDFCaption,
  buildWeeklySummaryMessage,
  executeWeeklyStatementsDispatch,
  sendSingleDoctorStatementToTelegram,
  getUpcomingThursdayMidnight,
  formatCurrency,
  BatchDispatchProgress
} from '../../utils/weeklyStatementService';
import { computeClientFinancials, ClientFinancialSummary } from '../../utils/clientFinancials';
import { Order, Payment, ProductReturn, UserProfile } from '../../types';

interface NotificationSettingsManagerProps {
  lang?: 'ar' | 'fr';
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  usersList?: UserProfile[];
  ordersList?: Order[];
  paymentsList?: Payment[];
  returnsList?: ProductReturn[];
}

export const NotificationSettingsManager: React.FC<NotificationSettingsManagerProps> = ({
  lang = 'ar',
  onShowToast,
  usersList = [],
  ordersList = [],
  paymentsList = [],
  returnsList = []
}) => {
  const isRtl = lang === 'ar';
  const [activeMainTab, setActiveMainTab] = useState<'orders' | 'weekly_statements'>('weekly_statements');

  // Order notifications config state
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [testResultTelegram, setTestResultTelegram] = useState<{ success: boolean; message: string } | null>(null);
  const [testResultWhatsApp, setTestResultWhatsApp] = useState<{ success: boolean; message: string } | null>(null);

  // Form states for order notifications
  const [newTgChatId, setNewTgChatId] = useState('');
  const [newTgLabel, setNewTgLabel] = useState('');
  const [newWaPhone, setNewWaPhone] = useState('');
  const [newWaApiKey, setNewWaApiKey] = useState('');
  const [newWaLabel, setNewWaLabel] = useState('');
  const [newUltraMsgPhone, setNewUltraMsgPhone] = useState('');

  // UI state for order notifications
  const [showTgToken, setShowTgToken] = useState(false);
  const [showTgGuide, setShowTgGuide] = useState(false);
  const [showWaGuide, setShowWaGuide] = useState(false);
  const [previewTab, setPreviewTab] = useState<'telegram' | 'whatsapp'>('telegram');

  // ──────────────────────────────────────────────────────────────────────────
  // Weekly Statements State
  // ──────────────────────────────────────────────────────────────────────────
  const [weeklyConfig, setWeeklyConfig] = useState<WeeklyStatementConfig>(DEFAULT_WEEKLY_STATEMENT_CONFIG);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [newWeeklyTgChatId, setNewWeeklyTgChatId] = useState('');
  const [newWeeklyTgLabel, setNewWeeklyTgLabel] = useState('');
  const [showWeeklyCustomToken, setShowWeeklyCustomToken] = useState(false);

  // Batch dispatch execution state
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchDispatchProgress | null>(null);
  const [batchResult, setBatchResult] = useState<{
    success: boolean;
    totalDoctors: number;
    sentCount: number;
    failedCount: number;
    errors: string[];
  } | null>(null);

  // Single test statement state
  const [testingSingleDoctor, setTestingSingleDoctor] = useState(false);
  const [singleTestResult, setSingleTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load configs on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [loadedOrderCfg, loadedWeeklyCfg] = await Promise.all([
          getNotificationConfig(),
          getWeeklyStatementConfig()
        ]);
        setConfig(loadedOrderCfg);
        setWeeklyConfig(loadedWeeklyCfg);
      } catch (err) {
        console.error('Error loading notification settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (onShowToast) {
      onShowToast(msg, type);
    } else {
      alert(msg);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Order Notifications Handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleSaveOrderConfig = async () => {
    setSaving(true);
    try {
      await saveNotificationConfig(config);
      notify(
        lang === 'fr'
          ? 'Paramètres de notification enregistrés avec succès !'
          : 'تم حفظ إعدادات إشعارات الطلبيات بنجاح! ✅',
        'success'
      );
    } catch (err: any) {
      console.error(err);
      notify(err.message || 'Error saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTelegramRecipient = () => {
    if (!newTgChatId.trim()) {
      notify(lang === 'fr' ? 'Veuillez saisir un Chat ID.' : 'يرجى إدخال Chat ID صالح.', 'error');
      return;
    }
    const newRecipient: TelegramRecipient = {
      id: `tg_${Date.now()}`,
      chatId: newTgChatId.trim(),
      label: newTgLabel.trim() || (lang === 'fr' ? `Destinataire ${config.telegram.recipients.length + 1}` : `مستلم ${config.telegram.recipients.length + 1}`),
      enabled: true,
    };
    setConfig((prev) => ({
      ...prev,
      telegram: {
        ...prev.telegram,
        recipients: [...prev.telegram.recipients, newRecipient],
      },
    }));
    setNewTgChatId('');
    setNewTgLabel('');
  };

  const handleToggleTelegramRecipient = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      telegram: {
        ...prev.telegram,
        recipients: prev.telegram.recipients.map((r) =>
          r.id === id ? { ...r, enabled: !r.enabled } : r
        ),
      },
    }));
  };

  const handleDeleteTelegramRecipient = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      telegram: {
        ...prev.telegram,
        recipients: prev.telegram.recipients.filter((r) => r.id !== id),
      },
    }));
  };

  const handleAddCallMeBotRecipient = () => {
    if (!newWaPhone.trim() || !newWaApiKey.trim()) {
      notify(
        lang === 'fr'
          ? 'Veuillez saisir le numéro de téléphone et la clé API CallMeBot.'
          : 'يرجى إدخال رقم الهاتف والـ API Key الخاص به.',
        'error'
      );
      return;
    }
    const newRecipient: WhatsAppCallMeBotRecipient = {
      id: `wa_${Date.now()}`,
      phone: newWaPhone.trim(),
      apiKey: newWaApiKey.trim(),
      label: newWaLabel.trim() || (lang === 'fr' ? `Numéro ${config.whatsapp.callmebotRecipients.length + 1}` : `رقم هاتف ${config.whatsapp.callmebotRecipients.length + 1}`),
      enabled: true,
    };
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        callmebotRecipients: [...prev.whatsapp.callmebotRecipients, newRecipient],
      },
    }));
    setNewWaPhone('');
    setNewWaApiKey('');
    setNewWaLabel('');
  };

  const handleToggleCallMeBotRecipient = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        callmebotRecipients: prev.whatsapp.callmebotRecipients.map((r) =>
          r.id === id ? { ...r, enabled: !r.enabled } : r
        ),
      },
    }));
  };

  const handleDeleteCallMeBotRecipient = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        callmebotRecipients: prev.whatsapp.callmebotRecipients.filter((r) => r.id !== id),
      },
    }));
  };

  const handleAddUltraMsgPhone = () => {
    if (!newUltraMsgPhone.trim()) return;
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        ultramsg: {
          ...prev.whatsapp.ultramsg,
          phoneNumbers: [...prev.whatsapp.ultramsg.phoneNumbers, newUltraMsgPhone.trim()],
        },
      },
    }));
    setNewUltraMsgPhone('');
  };

  const handleDeleteUltraMsgPhone = (phoneToDelete: string) => {
    setConfig((prev) => ({
      ...prev,
      whatsapp: {
        ...prev.whatsapp,
        ultramsg: {
          ...prev.whatsapp.ultramsg,
          phoneNumbers: prev.whatsapp.ultramsg.phoneNumbers.filter((p) => p !== phoneToDelete),
        },
      },
    }));
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTestResultTelegram(null);
    try {
      const res = await sendTestNotification('telegram', config);
      setTestResultTelegram({ success: res.success, message: res.message });
      if (res.success) {
        notify(res.message, 'success');
      } else {
        notify(res.message, 'error');
      }
    } catch (err: any) {
      setTestResultTelegram({ success: false, message: err.message });
      notify(err.message, 'error');
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWhatsApp(true);
    setTestResultWhatsApp(null);
    try {
      const res = await sendTestNotification('whatsapp', config);
      setTestResultWhatsApp({ success: res.success, message: res.message });
      if (res.success) {
        notify(res.message, 'success');
      } else {
        notify(res.message, 'error');
      }
    } catch (err: any) {
      setTestResultWhatsApp({ success: false, message: err.message });
      notify(err.message, 'error');
    } finally {
      setTestingWhatsApp(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Weekly Statements Handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleSaveWeeklyConfig = async () => {
    setSavingWeekly(true);
    try {
      await saveWeeklyStatementConfig(weeklyConfig);
      notify(
        lang === 'fr'
          ? 'Paramètres des relevés hebdomadaires enregistrés !'
          : 'تم حفظ إعدادات كشوفات الحسابات الأسبوعية بنجاح! ✅',
        'success'
      );
    } catch (err: any) {
      console.error(err);
      notify(err.message || 'Error saving weekly config', 'error');
    } finally {
      setSavingWeekly(false);
    }
  };

  const handleAddWeeklyRecipient = () => {
    if (!newWeeklyTgChatId.trim()) {
      notify(lang === 'fr' ? 'Veuillez saisir un Chat ID.' : 'يرجى إدخال Chat ID صالح.', 'error');
      return;
    }
    const newRecipient: WeeklyStatementRecipient = {
      id: `w_tg_${Date.now()}`,
      chatId: newWeeklyTgChatId.trim(),
      label: newWeeklyTgLabel.trim() || (lang === 'fr' ? `Compte ${weeklyConfig.recipients.length + 1}` : `حساب كشوفات ${weeklyConfig.recipients.length + 1}`),
      enabled: true,
    };
    setWeeklyConfig((prev) => ({
      ...prev,
      recipients: [...(prev.recipients || []), newRecipient],
    }));
    setNewWeeklyTgChatId('');
    setNewWeeklyTgLabel('');
  };

  const handleToggleWeeklyRecipient = (id: string) => {
    setWeeklyConfig((prev) => ({
      ...prev,
      recipients: (prev.recipients || []).map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  };

  const handleDeleteWeeklyRecipient = (id: string) => {
    setWeeklyConfig((prev) => ({
      ...prev,
      recipients: (prev.recipients || []).map((r) => r.id !== id),
    }));
  };

  // Trigger manual batch send now
  const handleRunWeeklyBatchNow = async () => {
    const confirmMsg = isRtl
      ? 'هل أنت متأكد من رغبتك في بدء إرسال كشوفات الحساب لجميع الأطباء عبر تيليجرام الآن؟'
      : 'Voulez-vous vraiment lancer l\'envoi des relevés hebdomadaires à tous les médecins sur Telegram maintenant ?';
    
    if (!window.confirm(confirmMsg)) return;

    setBatchRunning(true);
    setBatchProgress(null);
    setBatchResult(null);

    try {
      const result = await executeWeeklyStatementsDispatch({
        config: weeklyConfig,
        usersList: usersList.length > 0 ? usersList : undefined,
        ordersList: ordersList.length > 0 ? ordersList : undefined,
        paymentsList: paymentsList.length > 0 ? paymentsList : undefined,
        returnsList: returnsList.length > 0 ? returnsList : undefined,
        onProgress: (prog) => setBatchProgress(prog)
      });

      setBatchResult(result);
      // Reload updated weekly config for timestamps
      const updated = await getWeeklyStatementConfig();
      setWeeklyConfig(updated);

      if (result.success) {
        notify(
          isRtl
            ? `تم إرسال كشوفات الحسابات بنجاح إلى تيليجرام (${result.sentCount} طبيب)! 🚀`
            : `Relevés envoyés avec succès (${result.sentCount} médecins) !`,
          'success'
        );
      } else {
        notify(
          isRtl ? 'حدث خطأ أثناء الإرسال. يرجى مراجعة التفاصيل.' : 'Erreur lors de l\'envoi.',
          'error'
        );
      }
    } catch (err: any) {
      console.error(err);
      notify(err.message || 'Error executing batch send', 'error');
    } finally {
      setBatchRunning(false);
    }
  };

  // Send single test doctor statement
  const handleSendSingleTestDoctor = async () => {
    const sampleDoctor: UserProfile = usersList.find((u) => u.role === 'doctor') || {
      uid: 'sample_doc_123',
      name: 'د. يوسف شريف (طبيب تجريبي)',
      clinicName: 'عيادة النور لطب وجراحة الأسنان',
      phone: '0770821021',
      wilayaName: 'الجلفة',
      communeName: 'الجلفة المركز',
      location: 'الجلفة - الجلفة المركز',
      role: 'doctor',
      status: 'active',
      email: 'doctor.test@justsmile.dz',
      createdAt: new Date().toISOString(),
    };

    setTestingSingleDoctor(true);
    setSingleTestResult(null);

    try {
      const res = await sendSingleDoctorStatementToTelegram(
        sampleDoctor,
        ordersList,
        paymentsList,
        returnsList
      );
      setSingleTestResult(res);
      notify(res.message, res.success ? 'success' : 'error');
    } catch (err: any) {
      setSingleTestResult({ success: false, message: err.message });
      notify(err.message, 'error');
    } finally {
      setTestingSingleDoctor(false);
    }
  };

  // Sample data for preview
  const sampleOrder: Order = useMemo(() => ({
    id: 'ORD-892401',
    userId: 'doctor_123',
    doctorName: 'د. يوسف شريف',
    doctorPhone: '0770821021',
    doctorClinic: 'عيادة النور لطب وجراحة الأسنان',
    doctorWilayaName: 'الجلفة',
    doctorWilayaCode: '17',
    doctorCommuneName: 'الجلفة المركز',
    deliveryType: 'to_clinic',
    deliveryCost: 500,
    paymentMethod: 'cash',
    totalBeforeDiscount: 18500,
    discountAmount: 1500,
    totalAfterDiscount: 17500,
    createdAt: new Date().toISOString(),
    status: 'pending',
    paymentStatus: 'unpaid',
    paidAmount: 0,
    remainingBalance: 17500,
    notes: 'يرجى الاتصال قبل الوصول للتسليم بالعيادة.',
    items: [
      {
        productId: 'p1',
        name: 'Composite Nano-Hybride Dentaire A2',
        price: 4500,
        quantity: 2,
        category: 'Consommables',
      },
      {
        productId: 'p2',
        name: 'Boîte de Fraises Diamantées (10 pcs)',
        variantName: 'Grain Moyen / Bleu',
        price: 2700,
        quantity: 3,
        category: 'Instruments',
      },
    ],
  }), []);

  const sampleDoctorSummary: ClientFinancialSummary = useMemo(() => {
    const sampleDoc: UserProfile = {
      uid: 'sample_preview',
      name: 'د. يوسف شريف',
      clinicName: 'عيادة النور لطب وجراحة الأسنان',
      phone: '0770821021',
      wilayaName: 'الجلفة',
      communeName: 'الجلفة المركز',
      location: 'الجلفة - الجلفة المركز',
      role: 'doctor',
      status: 'active',
      email: 'doctor@example.com',
      createdAt: new Date().toISOString()
    };
    return {
      client: sampleDoc,
      activeOrdersCount: 4,
      totalPurchases: 125000,
      totalReturns: 5000,
      totalPaid: 80000,
      netBalance: 40000,
      debt: 40000,
      credit: 0,
      isDebtor: true
    };
  }, []);

  const sampleUnpaidOrders: Order[] = useMemo(() => [
    {
      id: 'ORD-98214',
      userId: 'sample_preview',
      doctorName: 'د. يوسف شريف',
      doctorClinic: 'عيادة النور',
      doctorPhone: '0770821021',
      totalBeforeDiscount: 25000,
      discountAmount: 0,
      totalAfterDiscount: 25000,
      status: 'confirmed',
      paymentStatus: 'unpaid',
      paidAmount: 0,
      remainingBalance: 25000,
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      items: []
    },
    {
      id: 'ORD-97501',
      userId: 'sample_preview',
      doctorName: 'د. يوسف شريف',
      doctorClinic: 'عيادة النور',
      doctorPhone: '0770821021',
      totalBeforeDiscount: 20000,
      discountAmount: 0,
      totalAfterDiscount: 20000,
      status: 'delivered',
      paymentStatus: 'partial',
      paidAmount: 5000,
      remainingBalance: 15000,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      items: []
    }
  ], []);

  const nextThursdayDate = useMemo(() => getUpcomingThursdayMidnight(), []);

  if (loading) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-3">
        <RefreshCw className="animate-spin text-brand-cyan" size={32} />
        <p className="text-xs font-black text-slate-500">
          {lang === 'fr' ? 'Chargement des paramètres de notification...' : 'جاري تحميل إعدادات الإشعارات...'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-8 animate-fade-in" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ── Top Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="p-2.5 bg-brand-cyan/10 text-brand-cyan rounded-2xl">
              <Bell size={22} />
            </div>
            <span>
              {lang === 'fr'
                ? 'Centre d\'alertes & Notifications Telegram / WhatsApp'
                : 'مركز الإشعارات وكشوفات الحسابات الأوتوماتيكية'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 font-semibold">
            {lang === 'fr'
              ? 'Configurez les alertes de commandes en direct et l\'envoi hebdomadaire des relevés de comptes des médecins.'
              : 'إدارة إشعارات الطلبيات اللحظية والإرسال الأسبوعي التلقائي لكشوفات حسابات كل طبيب ليلة الجمعة.'}
          </p>
        </div>

        {/* Tab Switcher Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200/80 shadow-2xs self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveMainTab('weekly_statements')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeMainTab === 'weekly_statements'
                ? 'bg-brand-cyan text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileSpreadsheet size={15} />
            <span>{lang === 'fr' ? 'Relevés de Dettes PDF (Jeudi)' : 'كشوفات الديون الأسبوعية (ملفات PDF) 📑'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMainTab('orders')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeMainTab === 'orders'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Bell size={15} />
            <span>{lang === 'fr' ? 'Commandes Instantanées' : 'إشعارات الطلبيات الفورية 🛍️'}</span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: WEEKLY DOCTOR STATEMENTS (PDF DOCUMENTS)                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'weekly_statements' && (
        <div className="space-y-8 animate-fade-in">
          {/* Header Info & Auto-Schedule Banner */}
          <div className="bg-gradient-to-r from-sky-50 via-indigo-50/50 to-emerald-50 border border-sky-100 p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 bg-sky-600 text-white rounded-lg text-[10px] font-black tracking-wide flex items-center gap-1.5 shadow-2xs">
                  <Clock size={12} />
                  {isRtl ? 'الجدولة الأوتوماتيكية: كل خميس منتصف الليل (ليلة الجمعة)' : 'Envoi auto: Chaque jeudi minuit (PDF)'}
                </span>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-black flex items-center gap-1">
                  <CheckCircle size={12} />
                  {weeklyConfig.enabled
                    ? (isRtl ? 'إرسال ملفات PDF مفعل تلقائياً' : 'Envoi PDF actif')
                    : (isRtl ? 'معطل حالياً' : 'Désactivé')}
                </span>
              </div>
              <p className="text-xs font-black text-slate-800 pt-1">
                {isRtl
                  ? 'يقوم النظام أوتوماتيكياً كل ليلة جمعة (الخميس 23:59) بتوليد ملف PDF رسمي لكشف الحساب لكل طبيب عليه ديون متبقية فقط، وإرساله كملف مرفق إلى حساب تيليجرام المحدد.'
                  : 'Chaque jeudi à minuit, le système génère et envoie le fichier PDF officiel du relevé de compte de chaque médecin débiteur sur Telegram.'}
              </p>
              <p className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
                <Calendar size={13} className="text-sky-600" />
                {isRtl ? 'موعد الإرسال الأسبوعي القادم المتوقع:' : 'Prochain envoi automatique :'}
                <span className="font-extrabold text-sky-700">
                  {nextThursdayDate.toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-DZ', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </p>
            </div>

            {/* Master Toggle */}
            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-xs border border-sky-200/80 px-4 py-3 rounded-2xl shrink-0 shadow-xs">
              <div>
                <p className="text-xs font-black text-slate-800">
                  {isRtl ? 'تفعيل الإرسال الأسبوعي' : 'Activer l\'envoi hebdo'}
                </p>
                <p className="text-[10px] font-bold text-slate-400">
                  {weeklyConfig.enabled ? (isRtl ? 'شغال تلقائياً' : 'Actif') : (isRtl ? 'معطل' : 'Désactivé')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWeeklyConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-12 h-6 rounded-full transition-all relative shrink-0 cursor-pointer ${
                  weeklyConfig.enabled ? 'bg-sky-600 shadow-xs shadow-sky-600/30' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${
                    weeklyConfig.enabled ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Configuration Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Filter Selection */}
            <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-200/70 space-y-3">
              <label className="text-xs font-black text-slate-800 flex items-center gap-2">
                <Users size={16} className="text-sky-600" />
                {isRtl ? 'تحديد الأطباء المشمولين بالكشف الأسبوعي :' : 'Médecins ciblés pour le relevé :'}
              </label>
              
              <div className="space-y-2">
                {[
                  {
                    id: 'debtors_only',
                    title: isRtl ? 'الأطباء المدينون فقط (عليهم ديون متبقية) 🔴' : 'Médecins avec dettes impayées uniquement',
                    desc: isRtl ? 'موصى به: يرسل فقط لمن عليهم مبالغ غير مسددة لترشيد الرسائل والتركيز على التحصيل' : 'Recommandé: se concentre sur les créances actives',
                  },
                  {
                    id: 'all',
                    title: isRtl ? 'جميع الأطباء المسجلين 👥' : 'Tous les médecins inscrits',
                    desc: isRtl ? 'يرسل كشف حساب كامل لكل طبيب مسجل في التطبيق حتى لو كان حسابه 0 دج' : 'Envoie le relevé à tous les médecins du système',
                  },
                  {
                    id: 'active_only',
                    title: isRtl ? 'الأطباء أصحاب الطلبيات السابقة فقط 🛍️' : 'Médecins avec historique de commandes',
                    desc: isRtl ? 'يرسل فقط لمن قام بطلبية واحدة على الأقل في المتجر' : 'Exclut les comptes sans aucune commande',
                  },
                ].map((opt) => {
                  const isSel = weeklyConfig.filter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setWeeklyConfig((prev) => ({ ...prev, filter: opt.id as any }))}
                      className={`w-full p-3.5 rounded-2xl border text-start transition-all cursor-pointer flex items-start gap-3 ${
                        isSel
                          ? 'bg-white border-sky-500 ring-2 ring-sky-500/20 shadow-xs'
                          : 'bg-white/60 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border mt-0.5 shrink-0 flex items-center justify-center ${
                        isSel ? 'border-sky-600 bg-sky-600' : 'border-slate-300 bg-white'
                      }`}>
                        {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-xs text-slate-800">{opt.title}</p>
                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* General Settings */}
            <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-200/70 space-y-4">
              <label className="text-xs font-black text-slate-800 flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                {isRtl ? 'خيارات المحتوى والتقرير الشامل :' : 'Options du contenu et rapport global :'}
              </label>

              <label className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200/80 cursor-pointer hover:border-sky-300 transition-colors">
                <input
                  type="checkbox"
                  checked={weeklyConfig.includeSummaryMessage}
                  onChange={(e) => setWeeklyConfig((prev) => ({ ...prev, includeSummaryMessage: e.target.checked }))}
                  className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                />
                <div>
                  <p className="font-extrabold text-xs text-slate-800">
                    {isRtl ? 'إرسال رسالة ملخص إجمالي في نهاية الدفعة 📈' : 'Envoyer un résumé global à la fin du lot'}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold">
                    {isRtl ? 'تتضمن إجمالي عدد الأطباء، مجموع الديون الإجمالية، والمبيعات' : 'Affiche le total des dettes, ventes et encaissements'}
                  </p>
                </div>
              </label>

              {/* Bot Token Configuration */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200/80 space-y-2.5">
                <label className="flex items-center gap-2.5 text-xs font-extrabold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={weeklyConfig.useMainTelegramBot}
                    onChange={(e) => setWeeklyConfig((prev) => ({ ...prev, useMainTelegramBot: e.target.checked }))}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>
                    {isRtl ? 'استخدام نفس Telegram Bot Token الأساسي' : 'Utiliser le même Bot Token Telegram principal'}
                  </span>
                </label>

                {!weeklyConfig.useMainTelegramBot && (
                  <div className="space-y-1 pt-1 animate-fade-in">
                    <label className="text-[11px] font-bold text-slate-600">
                      {isRtl ? 'Telegram Bot Token مخصص لكشوفات الحساب :' : 'Bot Token personnalisé :'}
                    </label>
                    <div className="relative">
                      <input
                        type={showWeeklyCustomToken ? 'text' : 'password'}
                        placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                        value={weeklyConfig.customBotToken || ''}
                        onChange={(e) => setWeeklyConfig((prev) => ({ ...prev, customBotToken: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowWeeklyCustomToken(!showWeeklyCustomToken)}
                        className="absolute end-2 top-2 text-slate-400 hover:text-slate-600"
                      >
                        {showWeeklyCustomToken ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION: Telegram Recipients for Weekly Statements */}
          <div className="bg-slate-50/80 p-5 md:p-6 rounded-3xl border border-slate-200/70 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Send size={16} className="text-sky-500" />
                  <span>{isRtl ? 'حسابات ومجموعات تيليجرام المستلمة لكشوفات الحساب :' : 'Comptes / Groupes Telegram destinataires des relevés :'}</span>
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {isRtl
                    ? 'أضف معرف الشات (Chat ID) للحساب أو المجموعة التي ترغب في وصول كشوفات الحسابات الأسبوعية إليها.'
                    : 'Ajoutez les Chat IDs des comptes recevant les relevés hebdomadaires.'}
                </p>
              </div>

              {/* Bot Info Helper */}
              {config.telegram.botToken && (
                <span className="px-2.5 py-1 bg-sky-100 text-sky-800 rounded-lg text-[10px] font-black border border-sky-200 self-start sm:self-auto">
                  Bot Token: {config.telegram.botToken.slice(0, 8)}••••
                </span>
              )}
            </div>

            {/* Add Weekly Recipient Input Form */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-6">
                <input
                  type="text"
                  placeholder={isRtl ? 'معرف الشات Chat ID (مثال: 123456789 أو -100... للمجموعات)' : 'Chat ID (ex: 123456789)...'}
                  value={newWeeklyTgChatId}
                  onChange={(e) => setNewWeeklyTgChatId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-mono font-bold focus:border-sky-500 shadow-2xs"
                />
              </div>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  placeholder={isRtl ? 'اسم المستلم (مثال: المحاسبة / الإدارة)' : 'Libellé (ex: Comptabilité)'}
                  value={newWeeklyTgLabel}
                  onChange={(e) => setNewWeeklyTgLabel(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold focus:border-sky-500 shadow-2xs"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddWeeklyRecipient}
                  className="w-full h-full bg-sky-600 hover:bg-sky-700 text-white font-black text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{isRtl ? 'إضافة' : 'Ajouter'}</span>
                </button>
              </div>
            </div>

            {/* Recipients List */}
            {(!weeklyConfig.recipients || weeklyConfig.recipients.length === 0) ? (
              <div className="bg-amber-50/80 border border-amber-200/80 p-4 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black">
                    {isRtl ? 'لم تضف حسابات تيليجرام مخصصة لكشوفات الحساب بعد.' : 'Aucun destinataire spécifique configuré.'}
                  </p>
                  <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
                    {isRtl
                      ? 'سيتم تلقائياً استخدام حسابات تيليجرام المحددة في تبويب "إشعارات الطلبيات الفورية" كوجهة افتراضية.'
                      : 'Les destinataires principaux seront utilisés par défaut.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {weeklyConfig.recipients.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-sky-300 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${rec.enabled ? 'bg-sky-500' : 'bg-slate-300'}`} />
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-800 truncate">{rec.label}</p>
                        <p className="font-mono text-[11px] text-slate-400 font-bold">Chat ID: {rec.chatId}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleWeeklyRecipient(rec.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                          rec.enabled
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {rec.enabled ? (isRtl ? 'مفعل' : 'Activé') : (isRtl ? 'معطل' : 'Désactivé')}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWeeklyRecipient(rec.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title={isRtl ? 'حذف' : 'Supprimer'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION: Live Preview & Testing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            {/* Live Message & PDF Attachment Preview */}
            <div className="space-y-2.5">
              <h4 className="font-black text-slate-800 text-xs flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-sky-500" />
                <span>{isRtl ? 'معاينة ملف الـ PDF ورسالة الكابشن على تيليجرام :' : 'Aperçu du document PDF et légende sur Telegram :'}</span>
              </h4>

              {/* PDF Document Attachment Card Mockup */}
              <div className="p-4 rounded-3xl bg-slate-900 text-sky-200 border border-slate-800 space-y-3 shadow-inner">
                {/* PDF File Bubble */}
                <div className="bg-slate-800/90 border border-slate-700/80 p-3 rounded-2xl flex items-center gap-3">
                  <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                    <FileText size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-xs text-white truncate">Releve_Dettes_Dr_Youssef_Cherif.pdf</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">142 KB • Document PDF</p>
                  </div>
                </div>

                {/* Caption text */}
                <div className="text-xs font-mono leading-relaxed whitespace-pre-wrap text-sky-100 border-t border-slate-800 pt-2">
                  {buildDoctorStatementPDFCaption(
                    sampleDoctorSummary,
                    config.template?.shopTitle || 'JUST SMILE'
                  ).replace(/<[^>]+>/g, '')}
                </div>
              </div>
            </div>

            {/* Test Actions & Execution Status */}
            <div className="bg-slate-50/80 p-5 rounded-3xl border border-slate-200/70 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="font-black text-slate-800 text-xs flex items-center gap-2">
                  <Play size={16} className="text-emerald-600" />
                  <span>{isRtl ? 'الإرسال اليدوي والاختبار الفوري :' : 'Envoi manuel et test :'}</span>
                </h4>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  {isRtl
                    ? 'يمكنك توليد وإرسال ملفات PDF الخاصة بديون الأطباء فوراً إلى حساب تيليجرام دون انتظار ليلة الجمعة، أو إرسال ملف PDF تجريبي لطبيب واحد للتأكد.'
                    : 'Vous pouvez déclencher l\'envoi manuel immédiat des fichiers PDF à tous les médecins débiteurs à tout moment.'}
                </p>

                {/* Last Execution Info */}
                {weeklyConfig.lastSentAt && (
                  <div className="bg-white p-3 rounded-2xl border border-slate-200 text-xs space-y-1">
                    <p className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock size={13} className="text-slate-400" />
                      {isRtl ? 'آخر إرسال أسبوعي لملفات PDF تم في:' : 'Dernier envoi :'}
                      <span className="font-extrabold text-slate-900">
                        {new Date(weeklyConfig.lastSentAt).toLocaleString(isRtl ? 'ar-DZ' : 'fr-DZ')}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      {isRtl ? `تم إرسال: ${weeklyConfig.lastSendCount || 0} ملف PDF • الحالة: ` : `Envoyé: ${weeklyConfig.lastSendCount || 0} fichiers PDF • État: `}
                      <span className={`font-black ${weeklyConfig.lastSendStatus === 'success' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {weeklyConfig.lastSendStatus === 'success' ? (isRtl ? 'ناجح بنسبة 100%' : 'Succès') : weeklyConfig.lastSendStatus}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-2">
                {/* Single Test Button */}
                <button
                  type="button"
                  onClick={handleSendSingleTestDoctor}
                  disabled={testingSingleDoctor || batchRunning}
                  className="w-full bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {testingSingleDoctor ? <RefreshCw size={14} className="animate-spin text-sky-600" /> : <FileText size={14} className="text-rose-500" />}
                  <span>{isRtl ? 'إرسال ملف PDF تجريبي لطبيب واحد 📑' : 'Envoyer un fichier PDF test'}</span>
                </button>

                {/* Run Full Batch Button */}
                <button
                  type="button"
                  onClick={handleRunWeeklyBatchNow}
                  disabled={batchRunning || testingSingleDoctor}
                  className="w-full bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {batchRunning ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>{isRtl ? '🚀 إرسال ملفات PDF الديون الآن لجميع الأطباء المدينين' : '🚀 Lancer l\'envoi de tous les PDF maintenant'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Batch Progress Modal / Inline Status */}
          {batchRunning && batchProgress && (
            <div className="bg-sky-50 border border-sky-200 p-5 rounded-3xl space-y-3 animate-fade-in shadow-sm">
              <div className="flex items-center justify-between text-xs font-black text-sky-950">
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-sky-600" />
                  {isRtl
                    ? `جاري الإرسال للطبيب: د. ${batchProgress.currentDoctorName}...`
                    : `Envoi en cours: Dr ${batchProgress.currentDoctorName}...`}
                </span>
                <span>{batchProgress.currentIndex} / {batchProgress.total}</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-sky-200/80 rounded-full h-3 overflow-hidden shadow-inner">
                <div
                  className="bg-gradient-to-r from-sky-600 to-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((batchProgress.currentIndex / Math.max(1, batchProgress.total)) * 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold text-sky-800">
                <span>{isRtl ? `نجح: ${batchProgress.successCount}` : `Succès: ${batchProgress.successCount}`}</span>
                <span>{Math.round((batchProgress.currentIndex / Math.max(1, batchProgress.total)) * 100)}%</span>
              </div>
            </div>
          )}

          {/* Batch Result Report */}
          {batchResult && (
            <div className={`p-5 rounded-3xl border text-xs space-y-2 animate-fade-in ${
              batchResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}>
              <div className="flex items-center gap-2 font-black text-sm">
                {batchResult.success ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-rose-600" />}
                <span>
                  {batchResult.success
                    ? (isRtl ? `اكتمل الإرسال بنجاح! تم إرسال ${batchResult.sentCount} كشف حساب على تيليجرام.` : `Envoi terminé avec succès (${batchResult.sentCount} relevés envoyés).`)
                    : (isRtl ? 'حدثت أخطاء أثناء الإرسال.' : 'Des erreurs sont survenues.')}
                </span>
              </div>
              {batchResult.errors.length > 0 && (
                <div className="pt-2 border-t border-rose-200 text-[11px] text-rose-800 space-y-1 font-mono">
                  {batchResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i}>• {err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Save Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleSaveWeeklyConfig}
              disabled={savingWeekly}
              className="bg-brand-cyan hover:bg-brand-cyan/90 text-white font-black text-xs py-3 px-6 rounded-xl transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {savingWeekly ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{isRtl ? 'حفظ إعدادات الكشوفات الأسبوعية' : 'Enregistrer la configuration'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: INSTANT ORDER NOTIFICATIONS                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'orders' && (
        <div className="space-y-8 animate-fade-in">
          {/* Master Enable Toggle */}
          <div className="border-b border-slate-100 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h4 className="text-base font-black text-slate-900">
                {isRtl ? 'إشعارات الطلبيات الفورية (Real-time)' : 'Notifications des commandes instantanées'}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5 font-semibold">
                {isRtl ? 'إرسال إشعار فوري عند قيام أي طبيب بطلب جديد عبر التطبيق أو المتجر.' : 'Alerte immédiate à chaque nouvelle commande.'}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-2xl self-start md:self-auto shadow-2xs">
              <div>
                <p className="text-xs font-black text-slate-800">
                  {lang === 'fr' ? 'Service d\'alertes' : 'حالة نظام الإشعارات'}
                </p>
                <p className="text-[10px] font-bold text-slate-400">
                  {config.enabled
                    ? (lang === 'fr' ? 'Actif en temps réel' : 'مفعل ويعمل في الخلفية')
                    : (lang === 'fr' ? 'Désactivé' : 'معطل حالياً')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`w-12 h-6 rounded-full transition-all relative shrink-0 cursor-pointer ${
                  config.enabled ? 'bg-emerald-500 shadow-xs shadow-emerald-500/30' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${
                    config.enabled ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Main Channel Selector */}
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
              {lang === 'fr' ? 'Canal d\'envoi principal :' : 'قناة إرسال الإشعارات المطلوبة:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'telegram',
                  title: lang === 'fr' ? 'Telegram uniquement' : 'تيليغرام فقط',
                  sub: lang === 'fr' ? 'Gratuit, rapide et illimité' : 'سريع ومجاني 100% وبدون قيود',
                  icon: Send,
                  color: 'text-sky-500 bg-sky-50 border-sky-200',
                  activeColor: 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-50/50'
                },
                {
                  id: 'whatsapp',
                  title: lang === 'fr' ? 'WhatsApp uniquement' : 'واتساب فقط',
                  sub: lang === 'fr' ? 'Messages directs aux numéros' : 'رسائل فورية للأرقام المحددة',
                  icon: MessageSquare,
                  color: 'text-emerald-500 bg-emerald-50 border-emerald-200',
                  activeColor: 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/50'
                },
                {
                  id: 'both',
                  title: lang === 'fr' ? 'Telegram + WhatsApp' : 'تيليغرام وواتساب معاً',
                  sub: lang === 'fr' ? 'Envoi simultané sur les deux' : 'إرسال متزامن للقناتين في نفس الوقت',
                  icon: Sparkles,
                  color: 'text-purple-500 bg-purple-50 border-purple-200',
                  activeColor: 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/50'
                },
              ].map((ch) => {
                const isSelected = config.channel === ch.id;
                const Icon = ch.icon;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, channel: ch.id as any }))}
                    className={`p-4 rounded-2xl border text-start transition-all cursor-pointer flex items-start gap-3 relative ${
                      isSelected ? ch.activeColor : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl border ${ch.color} shrink-0`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-800 text-xs">{ch.title}</p>
                      <p className="text-[11px] text-slate-500 font-semibold truncate mt-0.5">{ch.sub}</p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-3 end-3 text-brand-cyan">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trigger Triggers Selection */}
          <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-2">
            <label className="text-xs font-black text-slate-700 block">
              {lang === 'fr' ? 'Déclencheurs des notifications :' : 'حالات إرسال الإشعار :'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200/80 cursor-pointer hover:border-brand-cyan/50 transition-colors">
                <input
                  type="checkbox"
                  checked={config.notifyOnWebOrders}
                  onChange={(e) => setConfig((prev) => ({ ...prev, notifyOnWebOrders: e.target.checked }))}
                  className="w-4 h-4 rounded text-brand-cyan focus:ring-brand-cyan"
                />
                <div>
                  <p className="font-extrabold text-xs text-slate-800">
                    {lang === 'fr' ? 'Commandes passées par les clients (Web)' : 'طلبيات الزبائن والأطباء من المتجر الإلكتروني'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {lang === 'fr' ? 'Lorsqu\'un médecin valide son panier' : 'إشعار فوري عند إتمام أي طلبية من طرف الطبيب'}
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200/80 cursor-pointer hover:border-brand-cyan/50 transition-colors">
                <input
                  type="checkbox"
                  checked={config.notifyOnAdminOrders}
                  onChange={(e) => setConfig((prev) => ({ ...prev, notifyOnAdminOrders: e.target.checked }))}
                  className="w-4 h-4 rounded text-brand-cyan focus:ring-brand-cyan"
                />
                <div>
                  <p className="font-extrabold text-xs text-slate-800">
                    {lang === 'fr' ? 'Factures créées manuellement (Admin)' : 'الفواتير والطلبيات المنشأة يدوياً من لوحة التحكم'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    {lang === 'fr' ? 'Lors de la création depuis l\'interface admin' : 'إشعار عند إضافة فاتورة جديدة من طرف الإدارة'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* TELEGRAM SECTION */}
          {(config.channel === 'telegram' || config.channel === 'both') && (
            <div className="bg-sky-50/40 p-5 md:p-6 rounded-3xl border border-sky-200/80 space-y-6 animate-fade-in">
              <div className="flex items-center justify-between gap-4 border-b border-sky-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-sky-500 text-white rounded-2xl shadow-xs">
                    <Send size={20} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">
                      {lang === 'fr' ? 'Configuration de Telegram Bot' : 'إعدادات روبوت تيليغرام (Telegram Bot)'}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-semibold">
                      {lang === 'fr' ? 'Gratuit, instantané et sans frais de service.' : 'مجاني 100% وسريع جداً لإرسال التنبيهات لأي عدد من الحسابات.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTgGuide(!showTgGuide)}
                  className="text-sky-700 bg-sky-100/80 hover:bg-sky-200/80 px-3 py-1.5 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <HelpCircle size={14} />
                  <span>{lang === 'fr' ? 'Guide d\'installation' : 'دليل الإعداد خطوة بخطوة'}</span>
                </button>
              </div>

              {/* Bot Token Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-sky-600" />
                    <span>{lang === 'fr' ? 'Token du Bot Telegram (Bot Token) :' : 'رمز البوت السري (Telegram Bot Token) :'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTgToken(!showTgToken)}
                    className="text-[11px] text-sky-700 font-bold hover:underline flex items-center gap-1"
                  >
                    {showTgToken ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showTgToken ? (lang === 'fr' ? 'Masquer' : 'إخفاء') : (lang === 'fr' ? 'Afficher' : 'إظهار')}</span>
                  </button>
                </div>
                <input
                  type={showTgToken ? 'text' : 'password'}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  value={config.telegram.botToken || ''}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    telegram: { ...prev.telegram, botToken: e.target.value }
                  }))}
                  className="w-full bg-white border border-sky-200 rounded-2xl py-2.5 px-4 text-xs font-mono font-bold focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 shadow-2xs"
                />
              </div>

              {/* Telegram Recipients Manager */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-700 block">
                  {lang === 'fr' ? 'Comptes & Groupes destinataires (Chat IDs) :' : 'الحسابات والمجموعات المستلمة للتنبيهات (Chat IDs) :'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-6">
                    <input
                      type="text"
                      placeholder={lang === 'fr' ? 'Chat ID (ex: 123456789 ou -100123...)' : 'معرف الشات Chat ID (مثال: 123456789)'}
                      value={newTgChatId}
                      onChange={(e) => setNewTgChatId(e.target.value)}
                      className="w-full bg-white border border-sky-200 rounded-xl py-2.5 px-3 text-xs font-mono font-bold focus:border-sky-500 shadow-2xs"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="text"
                      placeholder={lang === 'fr' ? 'Nom / Rôle (ex: Mon Téléphone)' : 'اسم الحساب (مثال: هاتفي الشخصي)'}
                      value={newTgLabel}
                      onChange={(e) => setNewTgLabel(e.target.value)}
                      className="w-full bg-white border border-sky-200 rounded-xl py-2.5 px-3 text-xs font-bold focus:border-sky-500 shadow-2xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleAddTelegramRecipient}
                      className="w-full h-full bg-sky-600 hover:bg-sky-700 text-white font-black text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Plus size={15} />
                      <span>{lang === 'fr' ? 'Ajouter' : 'إضافة'}</span>
                    </button>
                  </div>
                </div>

                {/* List of active recipients */}
                <div className="space-y-2">
                  {config.telegram.recipients.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-white p-3 rounded-2xl border border-sky-100 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-sky-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${rec.enabled ? 'bg-sky-500' : 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-800 truncate">{rec.label}</p>
                          <p className="font-mono text-[11px] text-slate-400 font-bold">Chat ID: {rec.chatId}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleTelegramRecipient(rec.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                            rec.enabled
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {rec.enabled ? (lang === 'fr' ? 'Activé' : 'مفعل') : (lang === 'fr' ? 'Désactivé' : 'معطل')}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTelegramRecipient(rec.id)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Test Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-sky-100">
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testingTelegram}
                  className="bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {testingTelegram ? <RefreshCw size={14} className="animate-spin text-sky-600" /> : <Send size={14} />}
                  <span>{lang === 'fr' ? 'Envoyer une alerte test Telegram' : 'إرسال رسالة تجريبية لتيليغرام (Test)'}</span>
                </button>

                {testResultTelegram && (
                  <div
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                      testResultTelegram.success
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    {testResultTelegram.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span className="truncate max-w-xs">{testResultTelegram.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Save Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleSaveOrderConfig}
              disabled={saving}
              className="bg-brand-cyan hover:bg-brand-cyan/90 text-white font-black text-xs py-3 px-6 rounded-xl transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{lang === 'fr' ? 'Sauvegarder les paramètres de notification' : 'حفظ إعدادات إشعارات الطلبيات'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
