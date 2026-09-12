import React, { useState, useEffect } from 'react';
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
  Check
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
import { Order } from '../../types';

interface NotificationSettingsManagerProps {
  lang?: 'ar' | 'fr';
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const NotificationSettingsManager: React.FC<NotificationSettingsManagerProps> = ({
  lang = 'ar',
  onShowToast
}) => {
  const [config, setConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [testResultTelegram, setTestResultTelegram] = useState<{ success: boolean; message: string } | null>(null);
  const [testResultWhatsApp, setTestResultWhatsApp] = useState<{ success: boolean; message: string } | null>(null);

  // Form states for adding new recipients
  const [newTgChatId, setNewTgChatId] = useState('');
  const [newTgLabel, setNewTgLabel] = useState('');

  const [newWaPhone, setNewWaPhone] = useState('');
  const [newWaApiKey, setNewWaApiKey] = useState('');
  const [newWaLabel, setNewWaLabel] = useState('');

  const [newUltraMsgPhone, setNewUltraMsgPhone] = useState('');

  // UI state
  const [showTgToken, setShowTgToken] = useState(false);
  const [showTgGuide, setShowTgGuide] = useState(false);
  const [showWaGuide, setShowWaGuide] = useState(false);
  const [previewTab, setPreviewTab] = useState<'telegram' | 'whatsapp'>('telegram');

  // Load config on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const loaded = await getNotificationConfig();
        setConfig(loaded);
      } catch (err) {
        console.error(err);
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

  const handleSave = async () => {
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
      notify(
        lang === 'fr'
          ? `Erreur lors de la sauvegarde: ${err.message}`
          : `حدث خطأ أثناء الحفظ: ${err.message}`,
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  // Telegram recipient management
  const handleAddTelegramRecipient = () => {
    if (!newTgChatId.trim()) {
      notify(lang === 'fr' ? 'Veuillez saisir un Chat ID.' : 'يرجى إدخال معرف الدردشة (Chat ID).', 'error');
      return;
    }
    const botId = config.telegram.botToken?.split(':')[0]?.trim();
    if (botId && newTgChatId.trim() === botId) {
      notify(
        lang === 'fr'
          ? 'Ce numéro est l\'ID du bot lui-même ! Le bot ne peut pas s\'envoyer de messages à lui-même. Veuillez entrer votre propre Chat ID utilisateur (obtenu via @userinfobot).'
          : '⚠️ هذا الرقم هو معرف البوت نفسه! البوت لا يمكنه إرسال رسائل لنفسه. يرجى إدخال Chat ID الخاص بحسابك الشخصي (المستخرج من @userinfobot).',
        'error'
      );
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

  // WhatsApp CallMeBot recipient management
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

  // UltraMsg phone management
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

  // Test Buttons
  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTestResultTelegram(null);
    try {
      const res = await sendTestNotification('telegram', config);
      setTestResultTelegram(res);
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
      setTestResultWhatsApp(res);
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

  // Sample Order for Preview
  const sampleOrder: Order = {
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
        name: 'Boîte Fraises Diamantées FG (10 pcs)',
        variantName: 'Grain Bleu / Cylindrique',
        price: 3500,
        quantity: 2,
        category: 'Instruments',
      },
      {
        productId: 'p3',
        name: 'Gants d\'examen Latex poudrés (Boîte 100)',
        variantName: 'Taille M',
        price: 1000,
        quantity: 1,
        category: 'Hygiène & Stérilisation',
      },
    ],
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="animate-spin text-brand-cyan" size={32} />
          <p className="text-sm font-bold text-slate-500">
            {lang === 'fr' ? 'Chargement des paramètres de notification...' : 'جاري تحميل إعدادات الإشعارات...'}
          </p>
        </div>
      </div>
    );
  }

  const isRtl = lang === 'ar';

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-slate-100 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="p-2.5 bg-brand-cyan/10 text-brand-cyan rounded-2xl">
              <Bell size={22} />
            </div>
            <span>
              {lang === 'fr'
                ? 'Notifications des Commandes (Telegram & WhatsApp)'
                : 'إشعارات الطلبيات الجديدة (تيليغرام & واتساب)'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 font-semibold">
            {lang === 'fr'
              ? 'Recevez instantanément tous les détails des nouvelles commandes passées par vos clients sur Telegram et WhatsApp.'
              : 'استقبل إشعاراً فورياً ومفصلاً بجميع معلومات الطلبية والعميل عند قيام أي مستخدم بالطلب من المتجر.'}
          </p>
        </div>

        {/* Master Enable Toggle */}
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-extrabold text-slate-800 text-sm">{ch.title}</p>
                    {isSelected && <CheckCircle2 size={16} className="text-brand-cyan shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{ch.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: Telegram Settings */}
      {(config.channel === 'telegram' || config.channel === 'both') && (
        <div className="border border-sky-100 bg-sky-50/20 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500 text-white rounded-2xl shadow-xs shadow-sky-500/20">
                <Send size={20} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">
                  {lang === 'fr' ? 'Configuration Telegram' : 'إعدادات وقناة تيليغرام (Telegram Bot)'}
                </h4>
                <p className="text-xs text-slate-500 font-semibold">
                  {lang === 'fr'
                    ? 'Permet d\'envoyer des alertes à un ou plusieurs comptes ou groupes Telegram.'
                    : 'يتيح إرسال التنبيهات الفورية إلى حسابات أو مجموعات تيليغرام متعددة.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTgGuide((prev) => !prev)}
                className="text-xs font-bold text-sky-600 hover:text-sky-700 bg-sky-100/70 hover:bg-sky-100 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle size={14} />
                <span>{lang === 'fr' ? 'Guide de configuration' : 'طريقة الإعداد السريعة'}</span>
              </button>

              <button
                type="button"
                onClick={() => setConfig((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, enabled: !prev.telegram.enabled }
                }))}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 cursor-pointer ${
                  config.telegram.enabled ? 'bg-sky-500' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all shadow-sm ${
                    config.telegram.enabled ? (isRtl ? 'left-0.75' : 'right-0.75') : (isRtl ? 'right-0.75' : 'left-0.75')
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quick Guide Accordion */}
          {showTgGuide && (
            <div className="bg-white p-5 rounded-2xl border border-sky-200 text-xs space-y-3 shadow-sm animate-scale-up">
              <h5 className="font-black text-sky-900 flex items-center gap-2 text-sm">
                <Info size={16} className="text-sky-600" />
                {lang === 'fr' ? 'Comment configurer Telegram en 3 étapes :' : 'كيفية إنشاء بوت تيليغرام والحصول على الـ Token والـ Chat ID في دقيقة :'}
              </h5>
              <ol className="list-decimal list-inside space-y-2 text-slate-700 font-semibold leading-relaxed">
                <li>
                  {lang === 'fr' ? 'Ouvrez Telegram et recherchez ' : 'افتح تطبيق تيليغرام وابحث عن '}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-600 font-black underline inline-flex items-center gap-0.5">
                    @BotFather <ExternalLink size={11} />
                  </a>
                  {lang === 'fr' ? ', envoyez /newbot et suivez les instructions pour créer votre bot et copier son Token.' : '، وأرسل أمر /newbot واتبع الخطوات البسيطة لإنشاء بوتك ونسخ الـ Token.'}
                </li>
                <li>
                  {lang === 'fr' ? 'Pour trouver votre Chat ID personnel, ouvrez ' : 'لمعرفة Chat ID لحسابك، افتح '}
                  <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-sky-600 font-black underline inline-flex items-center gap-0.5">
                    @userinfobot <ExternalLink size={11} />
                  </a>
                  {lang === 'fr' ? ' ou ' : ' أو '}
                  <a href="https://t.me/getidsbot" target="_blank" rel="noreferrer" className="text-sky-600 font-black underline inline-flex items-center gap-0.5">
                    @getidsbot <ExternalLink size={11} />
                  </a>
                  {lang === 'fr' ? ' et copiez le numéro Id affiché.' : ' وانسخ رقم المعرف (Id) الظاهر.'}
                </li>
                <li>
                  {lang === 'fr'
                    ? 'IMPORTANT : Démarrez une conversation avec votre bot créé et cliquez sur « Démarrer / Start » pour qu\'il puisse vous envoyer des messages.'
                    : 'هام جداً: افتح محادثة مع البوت الذي أنشأته واضغط على زر « ابدأ / Start » لكي يسمح له تيليغرام بإرسال الرسائل إليك.'}
                </li>
                <li>
                  {lang === 'fr'
                    ? 'Pour recevoir les alertes dans un GROUPE : Ajoutez votre bot au groupe et entrez l\'Id du groupe (commence généralement par -100).'
                    : 'إذا أردت استقبال الإشعارات في مجموعة (Group): أضف البوت إلى المجموعة وضع معرف المجموعة (يبدأ عادة بـ -100).'}
                </li>
              </ol>
            </div>
          )}

          {/* Telegram Bot Token Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700">
                {lang === 'fr' ? 'Telegram Bot Token' : 'رمز البوت السري (Telegram Bot Token)'} :
              </label>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-sky-600 hover:text-sky-700 underline inline-flex items-center gap-1"
              >
                <span>{lang === 'fr' ? 'Obtenir via @BotFather' : 'الحصول على الرمز من @BotFather'}</span>
                <ExternalLink size={10} />
              </a>
            </div>
            <div className="relative">
              <input
                type={showTgToken ? 'text' : 'password'}
                value={config.telegram.botToken || ''}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, botToken: e.target.value }
                }))}
                placeholder="7291823791:AAHkZ9x7Q2P0mN8b-1kL..."
                className={`w-full bg-white border rounded-xl py-3 px-4 font-mono text-xs text-slate-800 focus:outline-hidden pr-10 ${
                  config.telegram.botToken && (!config.telegram.botToken.includes(':') || config.telegram.botToken.includes('@'))
                    ? 'border-amber-400 focus:border-amber-500 bg-amber-50/20'
                    : 'border-slate-200 focus:border-sky-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowTgToken((prev) => !prev)}
                className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1.5 ${isRtl ? 'left-2.5' : 'right-2.5'}`}
              >
                {showTgToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Warning if invalid format entered */}
            {config.telegram.botToken && (!config.telegram.botToken.includes(':') || config.telegram.botToken.includes('@') || config.telegram.botToken.length < 15) && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1 animate-fade-in">
                <p className="font-extrabold flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <span>{lang === 'fr' ? 'Format du Bot Token incorrect !' : 'تنبيه: صيغة الـ Bot Token غير صحيحة!'}</span>
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  {lang === 'fr'
                    ? 'Le token du bot doit contenir des chiffres suivis de deux points puis une clé secrète (ex: 789123456:AAHkZ...). Il est généré par @BotFather, ce n\'est ni un numéro de téléphone ni un mot de passe.'
                    : 'رمز البوت (Bot Token) يتكون دائماً من أرقام تليها نقطتان ثم رمز عشوائي طويل (مثال: 789123456:AAHkZ9...). يُنسخ مباشرة من محادثة @BotFather بعد كتابة /newbot (وليس رقم هاتف أو اسم مستخدم أو كلمة مرور).'}
                </p>
              </div>
            )}
          </div>

          {/* Telegram Recipients List (Multi-Recipient) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-700 flex items-center gap-2">
                <span>{lang === 'fr' ? 'Destinataires Telegram (Chat IDs)' : 'قائمة المستلمين وحسابات تيليغرام (Chat IDs)'} :</span>
                <span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full text-[10px] font-black">
                  {config.telegram.recipients.length}
                </span>
              </label>
            </div>

            {/* Add New Recipient Row */}
            <div className="bg-white p-3.5 rounded-2xl border border-sky-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              <div className="sm:col-span-4">
                <input
                  type="text"
                  placeholder={lang === 'fr' ? 'Nom/Rôle (ex: Gérant)' : 'تسمية الحساب (مثال: المدير العام)'}
                  value={newTgLabel}
                  onChange={(e) => setNewTgLabel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-hidden focus:border-sky-500"
                />
              </div>
              <div className="sm:col-span-5">
                <input
                  type="text"
                  placeholder={lang === 'fr' ? 'Chat ID (ex: 123456789 ou -100...)' : 'Chat ID (مثال: 582910293 أو -100...)'}
                  value={newTgChatId}
                  onChange={(e) => setNewTgChatId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:outline-hidden focus:border-sky-500"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={handleAddTelegramRecipient}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{lang === 'fr' ? 'Ajouter' : 'إضافة مستلم'}</span>
                </button>
              </div>
            </div>

            {/* List of Telegram Recipients */}
            {config.telegram.recipients.length === 0 ? (
              <div className="text-center py-6 bg-white/60 rounded-2xl border border-dashed border-sky-200">
                <p className="text-xs font-bold text-slate-400">
                  {lang === 'fr' ? 'Aucun destinataire configuré. Ajoutez au moins un Chat ID.' : 'لم يتم إضافة أي مستلم بعد. أضف Chat ID واحد على الأقل لتلقي الرسائل.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {config.telegram.recipients.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-sky-200 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${rec.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div className="min-w-0">
                        <p className="font-extrabold text-slate-800 truncate">{rec.label}</p>
                        <p className="font-mono text-[11px] text-slate-400 font-bold">{rec.chatId}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleTelegramRecipient(rec.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                          rec.enabled
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
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
            )}
          </div>

          {/* Test Telegram Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-sky-100">
            <button
              type="button"
              onClick={handleTestTelegram}
              disabled={testingTelegram || !config.telegram.botToken || config.telegram.recipients.length === 0}
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

      {/* SECTION 2: WhatsApp Settings */}
      {(config.channel === 'whatsapp' || config.channel === 'both') && (
        <div className="border border-emerald-100 bg-emerald-50/20 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500 text-white rounded-2xl shadow-xs shadow-emerald-500/20">
                <MessageSquare size={20} />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">
                  {lang === 'fr' ? 'Configuration WhatsApp' : 'إعدادات وقناة واتساب (WhatsApp)'}
                </h4>
                <p className="text-xs text-slate-500 font-semibold">
                  {lang === 'fr'
                    ? 'Permet d\'envoyer des alertes directement aux numéros WhatsApp des administrateurs.'
                    : 'إرسال تفاصيل الطلبية مباشرة إلى أرقام هواتف الإدارة عبر واتساب.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowWaGuide((prev) => !prev)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle size={14} />
                <span>{lang === 'fr' ? 'Guide WhatsApp' : 'طريقة تفعيل واتساب'}</span>
              </button>

              <button
                type="button"
                onClick={() => setConfig((prev) => ({
                  ...prev,
                  whatsapp: { ...prev.whatsapp, enabled: !prev.whatsapp.enabled }
                }))}
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 cursor-pointer ${
                  config.whatsapp.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-all shadow-sm ${
                    config.whatsapp.enabled ? (isRtl ? 'left-0.75' : 'right-0.75') : (isRtl ? 'right-0.75' : 'left-0.75')
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quick WhatsApp Guide */}
          {showWaGuide && (
            <div className="bg-white p-5 rounded-2xl border border-emerald-200 text-xs space-y-3 shadow-sm animate-scale-up">
              <h5 className="font-black text-emerald-900 flex items-center gap-2 text-sm">
                <ShieldCheck size={16} className="text-emerald-600" />
                {lang === 'fr' ? 'Configuration CallMeBot WhatsApp (100% Gratuite) :' : 'تفعيل خدمة CallMeBot المجانية لواتساب في دقيقة واحدة :'}
              </h5>
              <ol className="list-decimal list-inside space-y-2 text-slate-700 font-semibold leading-relaxed">
                <li>
                  {lang === 'fr' ? 'Enregistrez le numéro de bot CallMeBot dans vos contacts WhatsApp : ' : 'احفظ رقم بوت CallMeBot في جهات اتصالك: '}
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md dir-ltr inline-block">
                    +34 644 59 71 67
                  </span>
                  {lang === 'fr' ? ' ou ' : ' أو '}
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md dir-ltr inline-block">
                    +34 644 10 55 84
                  </span>
                </li>
                <li>
                  {lang === 'fr' ? 'Envoyez le message WhatsApp suivant au bot : ' : 'افتح محادثة مع الرقم في واتساب وأرسل النص التالي حرفياً: '}
                  <code className="bg-slate-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md text-[11px]">
                    I allow callmebot to send me messages
                  </code>
                </li>
                <li>
                  {lang === 'fr'
                    ? 'Le bot vous répondra immédiatement avec votre API Key (ex: 1234567). Copiez ce numéro et ajoutez-le ci-dessous avec votre numéro de téléphone.'
                    : 'سيرد عليك البوت مباشرة برسالة تحتوي على مفتاحك الخاص (apikey: 123456). انسخ المفتاح وأضفه في الحقل أدناه مع رقم هاتفك.'}
                </li>
              </ol>
            </div>
          )}

          {/* WhatsApp Provider Selector */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-700 block">
              {lang === 'fr' ? 'Méthode d\'envoi WhatsApp :' : 'مزود خدمة واتساب:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'callmebot', name: 'CallMeBot (مجاني وسهل)', desc: 'موصى به للأرقام الشخصية والإدارية' },
                { id: 'ultramsg', name: 'UltraMsg Gateway', desc: 'بوابة إرسال مدفوعة عبر Instance' },
                { id: 'generic_webhook', name: 'Custom Webhook (Zapier/Make)', desc: 'ربط مخصص عبر رابط Webhook' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setConfig((prev) => ({
                    ...prev,
                    whatsapp: { ...prev.whatsapp, provider: p.id as any }
                  }))}
                  className={`p-3 rounded-xl border text-start transition-all cursor-pointer ${
                    config.whatsapp.provider === p.id
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                      : 'bg-white/60 border-slate-200 hover:bg-white'
                  }`}
                >
                  <p className="font-bold text-slate-800 text-xs">{p.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Provider 1: CallMeBot Multi-Recipient Form & List */}
          {config.whatsapp.provider === 'callmebot' && (
            <div className="space-y-4">
              <label className="text-xs font-black text-slate-700 flex items-center justify-between">
                <span>{lang === 'fr' ? 'Numéros WhatsApp & Clés API CallMeBot :' : 'أرقام هواتف ومفاتيح الـ API للمستلمين:'}</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-black">
                  {config.whatsapp.callmebotRecipients.length}
                </span>
              </label>

              {/* Add New CallMeBot Recipient Row */}
              <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    placeholder={lang === 'fr' ? 'Label (ex: Admin 1)' : 'تسمية الرقم (مثال: هاتف الإدارة)'}
                    value={newWaLabel}
                    onChange={(e) => setNewWaLabel(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    placeholder={lang === 'fr' ? 'N° Téléphone (ex: 0770821021)' : 'رقم الهاتف (مثال: 0770821021)'}
                    value={newWaPhone}
                    onChange={(e) => setNewWaPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    placeholder={lang === 'fr' ? 'Clé API (ex: 1234567)' : 'مفتاح API Key (مثال: 1234567)'}
                    value={newWaApiKey}
                    onChange={(e) => setNewWaApiKey(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddCallMeBotRecipient}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>{lang === 'fr' ? 'Ajouter' : 'إضافة'}</span>
                  </button>
                </div>
              </div>

              {/* List of CallMeBot Recipients */}
              {config.whatsapp.callmebotRecipients.length === 0 ? (
                <div className="text-center py-6 bg-white/60 rounded-2xl border border-dashed border-emerald-200">
                  <p className="text-xs font-bold text-slate-400">
                    {lang === 'fr' ? 'Aucun numéro WhatsApp configuré. Ajoutez au moins un numéro et sa clé API.' : 'لم يتم إضافة أي رقم هاتف بعد. أضف رقم هاتف ورمز API الخاص به للبدء.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {config.whatsapp.callmebotRecipients.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-white p-3 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 text-xs shadow-2xs hover:border-emerald-200 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${rec.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-800 truncate">{rec.label}</p>
                          <p className="font-mono text-[11px] text-slate-500 font-bold">
                            {rec.phone} • <span className="text-slate-400 font-normal">API: {rec.apiKey.slice(0, 3)}••••</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleCallMeBotRecipient(rec.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                            rec.enabled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {rec.enabled ? (lang === 'fr' ? 'Activé' : 'مفعل') : (lang === 'fr' ? 'Désactivé' : 'معطل')}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteCallMeBotRecipient(rec.id)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Provider 2: UltraMsg Inputs */}
          {config.whatsapp.provider === 'ultramsg' && (
            <div className="space-y-4 bg-white p-4 rounded-2xl border border-emerald-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">UltraMsg Instance ID</label>
                  <input
                    type="text"
                    placeholder="instance12345"
                    value={config.whatsapp.ultramsg.instanceId || ''}
                    onChange={(e) => setConfig((prev) => ({
                      ...prev,
                      whatsapp: {
                        ...prev.whatsapp,
                        ultramsg: { ...prev.whatsapp.ultramsg, instanceId: e.target.value }
                      }
                    }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">UltraMsg Token</label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={config.whatsapp.ultramsg.token || ''}
                    onChange={(e) => setConfig((prev) => ({
                      ...prev,
                      whatsapp: {
                        ...prev.whatsapp,
                        ultramsg: { ...prev.whatsapp.ultramsg, token: e.target.value }
                      }
                    }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Phone numbers list */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600">{lang === 'fr' ? 'Numéros destinataires :' : 'أرقام الهواتف المستلمة :'}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="+213770821021"
                    value={newUltraMsgPhone}
                    onChange={(e) => setNewUltraMsgPhone(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleAddUltraMsgPhone}
                    className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {config.whatsapp.ultramsg.phoneNumbers.map((phone) => (
                    <span key={phone} className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                      {phone}
                      <button type="button" onClick={() => handleDeleteUltraMsgPhone(phone)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Provider 3: Generic Webhook Inputs */}
          {config.whatsapp.provider === 'generic_webhook' && (
            <div className="space-y-3 bg-white p-4 rounded-2xl border border-emerald-200">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Webhook URL (Zapier / Make / n8n / Server)</label>
                <input
                  type="url"
                  placeholder="https://hook.eu1.make.com/..."
                  value={config.whatsapp.genericWebhook.url || ''}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    whatsapp: {
                      ...prev.whatsapp,
                      genericWebhook: { ...prev.whatsapp.genericWebhook, url: e.target.value }
                    }
                  }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Secret / Authorization Header (Optionnel)</label>
                <input
                  type="password"
                  placeholder="Bearer token..."
                  value={config.whatsapp.genericWebhook.secretHeader || ''}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    whatsapp: {
                      ...prev.whatsapp,
                      genericWebhook: { ...prev.whatsapp.genericWebhook, secretHeader: e.target.value }
                    }
                  }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* Test WhatsApp Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-emerald-100">
            <button
              type="button"
              onClick={handleTestWhatsApp}
              disabled={testingWhatsApp}
              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center gap-2 shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {testingWhatsApp ? <RefreshCw size={14} className="animate-spin text-emerald-600" /> : <MessageSquare size={14} />}
              <span>{lang === 'fr' ? 'Envoyer une alerte test WhatsApp' : 'إرسال رسالة تجريبية لواتساب (Test)'}</span>
            </button>

            {testResultWhatsApp && (
              <div
                className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                  testResultWhatsApp.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {testResultWhatsApp.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span className="truncate max-w-xs">{testResultWhatsApp.message}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: Content Customization & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
        {/* Template Options */}
        <div className="space-y-4">
          <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <Sparkles size={16} className="text-purple-600" />
            {lang === 'fr' ? 'Contenu & Options du message' : 'تخصيص محتوى الرسالة وتفاصيل الطلبية :'}
          </h4>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600">{lang === 'fr' ? 'Nom / En-tête de la boutique' : 'عنوان ورأس الرسالة'}</label>
            <input
              type="text"
              value={config.template?.shopTitle || ''}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                template: { ...prev.template, shopTitle: e.target.value }
              }))}
              placeholder="JUST SMILE - مستلزمات طب الأسنان"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold"
            />
          </div>

          <div className="space-y-2.5 pt-1">
            {[
              {
                key: 'includeItemsList',
                label: lang === 'fr' ? 'Inclure la liste détaillée des articles et quantités' : 'تضمين قائمة المنتجات والكميات والأسعار بالتفصيل'
              },
              {
                key: 'includeDeliveryDetails',
                label: lang === 'fr' ? 'Inclure l\'adresse et le mode de livraison' : 'تضمين الولاية والبلدية ونوع التوصيل'
              },
              {
                key: 'includeNotes',
                label: lang === 'fr' ? 'Inclure les remarques et notes du client' : 'تضمين ملاحظات وتعليمات العميل'
              },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2.5 text-xs font-bold text-slate-700 cursor-pointer p-2 hover:bg-slate-50 rounded-xl transition-colors">
                <input
                  type="checkbox"
                  checked={Boolean((config.template as any)[opt.key])}
                  onChange={(e) => setConfig((prev) => ({
                    ...prev,
                    template: { ...prev.template, [opt.key]: e.target.checked }
                  }))}
                  className="w-4 h-4 rounded text-brand-cyan focus:ring-brand-cyan"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1 pt-1">
            <label className="text-xs font-bold text-slate-600">{lang === 'fr' ? 'Pied de message personnalisé (facultatif)' : 'ملاحظة أو تذييل مخصص أسفل الرسالة (اختياري)'}</label>
            <input
              type="text"
              value={config.template?.customNoteFooter || ''}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                template: { ...prev.template, customNoteFooter: e.target.value }
              }))}
              placeholder={lang === 'fr' ? 'Ex: Merci pour votre confiance !' : 'مثال: يرجى تجهيز الطلبية فوراً وإرسالها لشركة الشحن.'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs"
            />
          </div>
        </div>

        {/* Live Message Preview */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
              <Smartphone size={16} className="text-slate-500" />
              {lang === 'fr' ? 'Aperçu en direct du message' : 'معاينة حية لشكل الرسالة المستلمة :'}
            </h4>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setPreviewTab('telegram')}
                className={`px-2 py-0.5 rounded-md transition-all ${previewTab === 'telegram' ? 'bg-white text-sky-600 shadow-xs' : 'text-slate-500'}`}
              >
                Telegram
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('whatsapp')}
                className={`px-2 py-0.5 rounded-md transition-all ${previewTab === 'whatsapp' ? 'bg-white text-emerald-600 shadow-xs' : 'text-slate-500'}`}
              >
                WhatsApp
              </button>
            </div>
          </div>

          <div
            className={`p-4 rounded-2xl border text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto shadow-inner ${
              previewTab === 'telegram'
                ? 'bg-slate-900 text-sky-200 border-slate-800'
                : 'bg-emerald-950 text-emerald-100 border-emerald-900'
            }`}
          >
            {previewTab === 'telegram'
              ? buildTelegramMessage(sampleOrder, config).replace(/<[^>]+>/g, '')
              : buildWhatsAppMessage(sampleOrder, config)}
          </div>
        </div>
      </div>

      {/* Save Action Footer */}
      <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-cyan hover:bg-brand-cyan/90 text-white font-black text-xs py-3 px-6 rounded-xl transition-all flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer"
        >
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          <span>{lang === 'fr' ? 'Sauvegarder les paramètres de notification' : 'حفظ إعدادات الإشعارات بالكامل'}</span>
        </button>
      </div>
    </div>
  );
};
