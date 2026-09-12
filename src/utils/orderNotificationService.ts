import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order } from '../types';

export interface TelegramRecipient {
  id: string;
  chatId: string;
  label: string;
  enabled: boolean;
}

export interface WhatsAppCallMeBotRecipient {
  id: string;
  phone: string;
  apiKey: string;
  label: string;
  enabled: boolean;
}

export interface WhatsAppUltraMsgConfig {
  instanceId: string;
  token: string;
  phoneNumbers: string[]; // List of international numbers e.g. +213661123456
}

export interface WhatsAppGenericWebhookConfig {
  url: string;
  secretHeader?: string;
}

export interface NotificationConfig {
  enabled: boolean;
  channel: 'telegram' | 'whatsapp' | 'both';
  notifyOnWebOrders: boolean;
  notifyOnAdminOrders: boolean;
  telegram: {
    enabled: boolean;
    botToken: string;
    recipients: TelegramRecipient[];
  };
  whatsapp: {
    enabled: boolean;
    provider: 'callmebot' | 'ultramsg' | 'generic_webhook';
    callmebotRecipients: WhatsAppCallMeBotRecipient[];
    ultramsg: WhatsAppUltraMsgConfig;
    genericWebhook: WhatsAppGenericWebhookConfig;
  };
  template: {
    shopTitle: string;
    includeItemsList: boolean;
    includeDeliveryDetails: boolean;
    includeNotes: boolean;
    customNoteFooter?: string;
  };
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: false,
  channel: 'telegram',
  notifyOnWebOrders: true,
  notifyOnAdminOrders: true,
  telegram: {
    enabled: true,
    botToken: '',
    recipients: [],
  },
  whatsapp: {
    enabled: false,
    provider: 'callmebot',
    callmebotRecipients: [],
    ultramsg: {
      instanceId: '',
      token: '',
      phoneNumbers: [],
    },
    genericWebhook: {
      url: '',
      secretHeader: '',
    },
  },
  template: {
    shopTitle: 'JUST SMILE - مستلزمات طب الأسنان',
    includeItemsList: true,
    includeDeliveryDetails: true,
    includeNotes: true,
    customNoteFooter: '',
  },
};

/**
 * Fetch notification configuration from Firestore settings
 */
export async function getNotificationConfig(): Promise<NotificationConfig> {
  try {
    const docRef = doc(db, 'settings', 'notification_config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...DEFAULT_NOTIFICATION_CONFIG,
        ...data,
        telegram: {
          ...DEFAULT_NOTIFICATION_CONFIG.telegram,
          ...(data.telegram || {}),
          recipients: data.telegram?.recipients || [],
        },
        whatsapp: {
          ...DEFAULT_NOTIFICATION_CONFIG.whatsapp,
          ...(data.whatsapp || {}),
          callmebotRecipients: data.whatsapp?.callmebotRecipients || [],
          ultramsg: {
            ...DEFAULT_NOTIFICATION_CONFIG.whatsapp.ultramsg,
            ...(data.whatsapp?.ultramsg || {}),
            phoneNumbers: data.whatsapp?.ultramsg?.phoneNumbers || [],
          },
          genericWebhook: {
            ...DEFAULT_NOTIFICATION_CONFIG.whatsapp.genericWebhook,
            ...(data.whatsapp?.genericWebhook || {}),
          },
        },
        template: {
          ...DEFAULT_NOTIFICATION_CONFIG.template,
          ...(data.template || {}),
        },
      };
    }
  } catch (err) {
    console.warn('Could not load notification config from Firestore:', err);
  }
  return DEFAULT_NOTIFICATION_CONFIG;
}

/**
 * Save notification configuration to Firestore
 */
export async function saveNotificationConfig(config: NotificationConfig): Promise<void> {
  const docRef = doc(db, 'settings', 'notification_config');
  await setDoc(docRef, config, { merge: true });
}

/**
 * Helper to format price with commas and DA
 */
function formatAmount(amount: number | undefined | null): string {
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${val.toLocaleString()} دج`;
}

/**
 * Build rich HTML formatted notification message for Telegram
 */
export function buildTelegramMessage(order: Order, config: NotificationConfig): string {
  const orderRef = order.id ? order.id.slice(-6).toUpperCase() : 'NOUVEAU';
  const orderTime = order.createdAt ? new Date(order.createdAt).toLocaleString('fr-DZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : new Date().toLocaleString();

  const shopTitle = config.template?.shopTitle || 'JUST SMILE';

  let msg = `🛍 <b>طلب جديد في ${escapeHtml(shopTitle)} !</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔖 <b>رقم الطلبية:</b> #<code>${orderRef}</code>\n`;
  msg += `🕒 <b>التوقيت:</b> ${escapeHtml(orderTime)}\n\n`;

  msg += `👤 <b>معلومات العميل:</b>\n`;
  msg += `• <b>الاسم:</b> ${escapeHtml(order.doctorName || 'زبون زائر')}\n`;
  if (order.doctorPhone) {
    msg += `• <b>الهاتف:</b> <code>${escapeHtml(order.doctorPhone)}</code>\n`;
  }
  if (order.doctorClinic) {
    msg += `• <b>العيادة / المؤسسة:</b> ${escapeHtml(order.doctorClinic)}\n`;
  }

  if (config.template?.includeDeliveryDetails) {
    const wilayaStr = [order.doctorWilayaName || (order.doctorWilayaCode ? `ولاية ${order.doctorWilayaCode}` : ''), order.doctorCommuneName].filter(Boolean).join(' - ');
    if (wilayaStr) {
      msg += `• <b>العنوان:</b> ${escapeHtml(wilayaStr)}\n`;
    }
    const deliveryTypeLabel = order.deliveryType === 'to_clinic' ? 'توصيل للعيادة / المقر' : order.deliveryType === 'to_office' ? 'توصيل للمكتب (Stopdesk)' : order.deliveryType === 'free' ? 'توصيل مجاني' : 'عادي';
    msg += `• <b>طريقة التوصيل:</b> ${escapeHtml(deliveryTypeLabel)}`;
    if (order.deliveryCost && order.deliveryCost > 0) {
      msg += ` (${formatAmount(order.deliveryCost)})\n`;
    } else {
      msg += `\n`;
    }
  }

  const paymentLabel = order.paymentMethod === 'cash' ? 'نقداً عند التسليم (Cash)' : 'دفع آجل (Crédit)';
  msg += `• <b>طريقة الدفع:</b> ${escapeHtml(paymentLabel)}\n\n`;

  if (config.template?.includeItemsList && Array.isArray(order.items) && order.items.length > 0) {
    msg += `📦 <b>المنتجات المطلوبة (${order.items.length}):</b>\n`;
    order.items.forEach((item, index) => {
      const varInfo = item.variantName ? ` <i>(${escapeHtml(item.variantName)})</i>` : '';
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      msg += `${index + 1}. <b>${escapeHtml(item.name || 'منتج')}</b>${varInfo}\n`;
      msg += `   └─ <b>الكمية:</b> ${item.quantity} × ${formatAmount(item.price)} = <b>${formatAmount(itemTotal)}</b>\n`;
    });
    msg += `\n`;
  }

  msg += `💰 <b>الملخص المالي:</b>\n`;
  msg += `• المجموع قبل التخفيض: ${formatAmount(order.totalBeforeDiscount || order.totalAfterDiscount)}\n`;
  if (order.discountAmount && order.discountAmount > 0) {
    msg += `• التخفيض: -${formatAmount(order.discountAmount)}\n`;
  }
  if (order.deliveryCost && order.deliveryCost > 0) {
    msg += `• مصاريف التوصيل: +${formatAmount(order.deliveryCost)}\n`;
  }
  msg += `• <b>الصافي الإجمالي الواجب دفعه: <u>${formatAmount(order.totalAfterDiscount)}</u></b>\n`;

  if (config.template?.includeNotes && order.notes && order.notes.trim()) {
    msg += `\n📝 <b>ملاحظات العميل:</b>\n<i>${escapeHtml(order.notes.trim())}</i>\n`;
  }

  if (config.template?.customNoteFooter && config.template.customNoteFooter.trim()) {
    msg += `\n💡 <i>${escapeHtml(config.template.customNoteFooter.trim())}</i>\n`;
  }

  return msg;
}

/**
 * Build clean plain text notification message for WhatsApp (CallMeBot / UltraMsg)
 */
export function buildWhatsAppMessage(order: Order, config: NotificationConfig): string {
  const orderRef = order.id ? order.id.slice(-6).toUpperCase() : 'NOUVEAU';
  const orderTime = order.createdAt ? new Date(order.createdAt).toLocaleString('fr-DZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : new Date().toLocaleString();

  const shopTitle = config.template?.shopTitle || 'JUST SMILE';

  let msg = `🛍 *طلب جديد في ${shopTitle}!*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔖 *رقم الطلبية:* #${orderRef}\n`;
  msg += `🕒 *التوقيت:* ${orderTime}\n\n`;

  msg += `👤 *معلومات العميل:*\n`;
  msg += `• *الاسم:* ${order.doctorName || 'زبون زائر'}\n`;
  if (order.doctorPhone) {
    msg += `• *الهاتف:* ${order.doctorPhone}\n`;
  }
  if (order.doctorClinic) {
    msg += `• *العيادة:* ${order.doctorClinic}\n`;
  }

  if (config.template?.includeDeliveryDetails) {
    const wilayaStr = [order.doctorWilayaName || (order.doctorWilayaCode ? `ولاية ${order.doctorWilayaCode}` : ''), order.doctorCommuneName].filter(Boolean).join(' - ');
    if (wilayaStr) {
      msg += `• *العنوان:* ${wilayaStr}\n`;
    }
    const deliveryTypeLabel = order.deliveryType === 'to_clinic' ? 'توصيل للعيادة' : order.deliveryType === 'to_office' ? 'توصيل للمكتب (Stopdesk)' : order.deliveryType === 'free' ? 'توصيل مجاني' : 'عادي';
    msg += `• *التوصيل:* ${deliveryTypeLabel}`;
    if (order.deliveryCost && order.deliveryCost > 0) {
      msg += ` (${formatAmount(order.deliveryCost)})\n`;
    } else {
      msg += `\n`;
    }
  }

  const paymentLabel = order.paymentMethod === 'cash' ? 'نقداً عند التسليم (Cash)' : 'دفع آجل (Crédit)';
  msg += `• *طريقة الدفع:* ${paymentLabel}\n\n`;

  if (config.template?.includeItemsList && Array.isArray(order.items) && order.items.length > 0) {
    msg += `📦 *المنتجات المطلوبة (${order.items.length}):*\n`;
    order.items.forEach((item, index) => {
      const varInfo = item.variantName ? ` (${item.variantName})` : '';
      const itemTotal = (item.price || 0) * (item.quantity || 1);
      msg += `${index + 1}. *${item.name || 'منتج'}*${varInfo}\n`;
      msg += `   └─ الكمية: ${item.quantity} × ${formatAmount(item.price)} = *${formatAmount(itemTotal)}*\n`;
    });
    msg += `\n`;
  }

  msg += `💰 *الملخص المالي:*\n`;
  msg += `• المجموع قبل التخفيض: ${formatAmount(order.totalBeforeDiscount || order.totalAfterDiscount)}\n`;
  if (order.discountAmount && order.discountAmount > 0) {
    msg += `• التخفيض: -${formatAmount(order.discountAmount)}\n`;
  }
  if (order.deliveryCost && order.deliveryCost > 0) {
    msg += `• مصاريف التوصيل: +${formatAmount(order.deliveryCost)}\n`;
  }
  msg += `• *الصافي الإجمالي: ${formatAmount(order.totalAfterDiscount)}*\n`;

  if (config.template?.includeNotes && order.notes && order.notes.trim()) {
    msg += `\n📝 *ملاحظات العميل:*\n${order.notes.trim()}\n`;
  }

  if (config.template?.customNoteFooter && config.template.customNoteFooter.trim()) {
    msg += `\n💡 ${config.template.customNoteFooter.trim()}\n`;
  }

  return msg;
}

/**
 * Escape HTML special chars for Telegram HTML parse mode
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send Telegram message to all active recipients
 */
export async function sendTelegramNotification(
  order: Order,
  config: NotificationConfig
): Promise<{ success: boolean; results: any[]; errors?: string[] }> {
  const { botToken, recipients, enabled } = config.telegram || {};

  if (!enabled || !botToken || !recipients || recipients.length === 0) {
    return { success: false, results: [], errors: ['إشعارات تيليغرام معطلة أو لم يتم إعدادها.'] };
  }

  const cleanToken = botToken.trim();

  // Validate Telegram Bot Token format
  if (!cleanToken.includes(':') || cleanToken.length < 15 || cleanToken.includes('@')) {
    const formatErr = 'رمز Telegram Bot Token غير صحيح. يجب أن يكون بالصيغة: 123456789:ABCdefGhIJK... (يتم نسخه من @BotFather على تيليغرام، وليس رقم هاتف أو اسم مستخدم).';
    return { success: false, results: [], errors: [formatErr] };
  }

  const activeRecipients = recipients.filter((r) => r.enabled && r.chatId && r.chatId.trim());
  if (activeRecipients.length === 0) {
    return { success: false, results: [], errors: ['لم يتم العثور على أي مستلم مفعل في قائمة تيليغرام.'] };
  }

  const messageText = buildTelegramMessage(order, config);
  const results: any[] = [];
  const errors: string[] = [];

  for (const recipient of activeRecipients) {
    const cleanChatId = recipient.chatId.trim();
    let isSuccess = false;
    let errorDetail = '';

    // Params for Telegram API
    const params = new URLSearchParams({
      chat_id: cleanChatId,
      text: messageText,
      parse_mode: 'HTML',
      disable_web_page_preview: 'true',
    });

    // Method 1: POST using application/x-www-form-urlencoded (Avoids CORS preflight OPTIONS in browsers)
    try {
      const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        body: params,
      });

      const resData = await response.json();
      if (resData && resData.ok) {
        results.push({ recipient: recipient.label || cleanChatId, status: 'sent', data: resData });
        isSuccess = true;
      } else {
        const desc = resData?.description || 'Unknown error';
        errorDetail = formatTelegramError(desc);
      }
    } catch (postErr: any) {
      // Method 2: GET fallback if POST was blocked by CORS or network
      try {
        const getUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage?${params.toString()}`;
        const getResp = await fetch(getUrl, { method: 'GET' });
        const getData = await getResp.json();
        if (getData && getData.ok) {
          results.push({ recipient: recipient.label || cleanChatId, status: 'sent', data: getData });
          isSuccess = true;
        } else {
          errorDetail = formatTelegramError(getData?.description || 'Unknown error');
        }
      } catch (getErr: any) {
        errorDetail = `تعذر الاتصال بـ Telegram API: ${getErr.message || postErr.message}`;
      }
    }

    if (!isSuccess) {
      const errMsg = `فشل إرسال الرسالة إلى [${recipient.label || cleanChatId}]: ${errorDetail}`;
      console.error(errMsg);
      errors.push(errMsg);
      results.push({ recipient: recipient.label || cleanChatId, status: 'failed', error: errorDetail });
    }
  }

  return {
    success: results.some((r) => r.status === 'sent'),
    results,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Format Telegram API error descriptions into user-friendly Arabic
 */
function formatTelegramError(desc: string): string {
  if (desc.includes('bot can\'t send messages to the bot') || desc.includes('bot can\'t send messages to bots')) {
    return 'لقد أدخلت معرف البوت نفسه كـ Chat ID! البوت لا يمكنه مراسلة نفسه، يجب إدخال Chat ID الخاص بحسابك الشخصي (المستخرج من @userinfobot).';
  }
  if (desc.includes('Not Found') || desc.includes('404')) {
    return 'رمز Bot Token غير موجود أو خاطئ. تأكد من نسخه كاملاً من @BotFather.';
  }
  if (desc.includes('chat not found')) {
    return 'لم يتم العثور على Chat ID. تأكد من صحة الرقم ومن فتح محادثة مع البوت والضغط على Start أولاً.';
  }
  if (desc.includes('bot was blocked')) {
    return 'البوت محظور من طرف هذا الحساب أو لم يبدأ المحادثة معه بعد.';
  }
  if (desc.includes('can\'t parse entities')) {
    return 'خطأ في تنسيق نص الرسالة.';
  }
  return desc;
}

/**
 * Normalize phone number format (e.g., convert 0661... to +213661... or 213661...)
 */
export function normalizePhoneNumber(rawPhone: string): string {
  let cleaned = rawPhone.replace(/[^\d+]/g, '').trim();
  // If starts with 0 and Algerian length (10 digits e.g. 0770821021), convert to +213770821021
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '+213' + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Send WhatsApp notification to all active recipients
 */
export async function sendWhatsAppNotification(
  order: Order,
  config: NotificationConfig
): Promise<{ success: boolean; results: any[]; errors?: string[] }> {
  const { enabled, provider, callmebotRecipients, ultramsg, genericWebhook } = config.whatsapp || {};

  if (!enabled) {
    return { success: false, results: [], errors: ['WhatsApp notification is disabled'] };
  }

  const messageText = buildWhatsAppMessage(order, config);
  const results: any[] = [];
  const errors: string[] = [];

  // Provider 1: CallMeBot (Free WhatsApp API)
  if (provider === 'callmebot') {
    const activeRecipients = (callmebotRecipients || []).filter((r) => r.enabled && r.phone && r.apiKey);
    if (activeRecipients.length === 0) {
      return { success: false, results: [], errors: ['No active CallMeBot recipients configured'] };
    }

    for (const recipient of activeRecipients) {
      try {
        const phoneFormatted = normalizePhoneNumber(recipient.phone);
        const encodedText = encodeURIComponent(messageText);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phoneFormatted)}&text=${encodedText}&apikey=${encodeURIComponent(recipient.apiKey.trim())}`;
        
        const response = await fetch(url, { method: 'GET' });
        const resText = await response.text();
        
        if (response.ok && !resText.toLowerCase().includes('error')) {
          results.push({ recipient: recipient.label || recipient.phone, status: 'sent', response: resText });
        } else {
          const errMsg = `CallMeBot error for ${recipient.label || recipient.phone}: ${resText}`;
          console.error(errMsg);
          errors.push(errMsg);
          results.push({ recipient: recipient.label || recipient.phone, status: 'failed', error: resText });
        }
      } catch (err: any) {
        const errMsg = `Network error sending WhatsApp to ${recipient.label || recipient.phone}: ${err.message}`;
        console.error(errMsg);
        errors.push(errMsg);
        results.push({ recipient: recipient.label || recipient.phone, status: 'failed', error: err.message });
      }
    }
  }

  // Provider 2: UltraMsg
  else if (provider === 'ultramsg') {
    const { instanceId, token, phoneNumbers } = ultramsg || {};
    if (!instanceId || !token || !phoneNumbers || phoneNumbers.length === 0) {
      return { success: false, results: [], errors: ['UltraMsg instance ID, token, or phone numbers missing'] };
    }

    for (const phone of phoneNumbers) {
      try {
        const phoneFormatted = normalizePhoneNumber(phone);
        const url = `https://api.ultramsg.com/${instanceId.trim()}/messages/chat`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: token.trim(),
            to: phoneFormatted,
            body: messageText,
          }),
        });
        const resData = await response.json();
        if (resData.sent === 'true' || resData.id) {
          results.push({ recipient: phone, status: 'sent', data: resData });
        } else {
          const errMsg = `UltraMsg error for ${phone}: ${resData.message || resData.error || 'Failed'}`;
          errors.push(errMsg);
          results.push({ recipient: phone, status: 'failed', error: resData });
        }
      } catch (err: any) {
        errors.push(`UltraMsg error for ${phone}: ${err.message}`);
        results.push({ recipient: phone, status: 'failed', error: err.message });
      }
    }
  }

  // Provider 3: Generic Webhook (Zapier, Make, n8n, custom server)
  else if (provider === 'generic_webhook') {
    const { url, secretHeader } = genericWebhook || {};
    if (!url) {
      return { success: false, results: [], errors: ['Webhook URL not configured'] };
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secretHeader && secretHeader.trim()) {
        headers['Authorization'] = secretHeader.trim();
      }
      const response = await fetch(url.trim(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: 'new_order',
          order,
          formattedMessage: messageText,
          timestamp: new Date().toISOString(),
        }),
      });
      if (response.ok) {
        results.push({ recipient: 'Generic Webhook', status: 'sent' });
      } else {
        const errText = await response.text();
        errors.push(`Webhook returned ${response.status}: ${errText}`);
        results.push({ recipient: 'Generic Webhook', status: 'failed', error: errText });
      }
    } catch (err: any) {
      errors.push(`Webhook fetch error: ${err.message}`);
      results.push({ recipient: 'Generic Webhook', status: 'failed', error: err.message });
    }
  }

  return {
    success: results.some((r) => r.status === 'sent'),
    results,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Master dispatcher: sends notifications based on current Firestore configuration
 */
export async function sendOrderNotifications(order: Order): Promise<{
  telegram?: { success: boolean; results: any[]; errors?: string[] };
  whatsapp?: { success: boolean; results: any[]; errors?: string[] };
}> {
  try {
    const config = await getNotificationConfig();
    if (!config.enabled) {
      console.log('Order notifications are disabled in settings.');
      return {};
    }

    const output: {
      telegram?: { success: boolean; results: any[]; errors?: string[] };
      whatsapp?: { success: boolean; results: any[]; errors?: string[] };
    } = {};

    const shouldSendTelegram = (config.channel === 'telegram' || config.channel === 'both') && config.telegram?.enabled;
    const shouldSendWhatsApp = (config.channel === 'whatsapp' || config.channel === 'both') && config.whatsapp?.enabled;

    if (shouldSendTelegram) {
      output.telegram = await sendTelegramNotification(order, config);
    }

    if (shouldSendWhatsApp) {
      output.whatsapp = await sendWhatsAppNotification(order, config);
    }

    return output;
  } catch (err) {
    console.error('Error executing order notifications:', err);
    return {};
  }
}

/**
 * Send a mock/test notification to verify configuration
 */
export async function sendTestNotification(
  channel: 'telegram' | 'whatsapp',
  config: NotificationConfig
): Promise<{ success: boolean; message: string; details?: any }> {
  const sampleOrder: Order = {
    id: `TEST-${Math.floor(100000 + Math.random() * 900000)}`,
    userId: 'test_user',
    doctorName: 'د. أحمد بن علي (تجريبي)',
    doctorPhone: '0770821021',
    doctorClinic: 'عيادة الابتسامة المشرقة للأسنان',
    doctorWilayaName: 'الجلفة',
    doctorWilayaCode: '17',
    doctorCommuneName: 'الجلفة المركز',
    deliveryType: 'to_clinic',
    deliveryCost: 500,
    paymentMethod: 'cash',
    totalBeforeDiscount: 15400,
    discountAmount: 1400,
    totalAfterDiscount: 14500,
    createdAt: new Date().toISOString(),
    status: 'pending',
    paymentStatus: 'unpaid',
    paidAmount: 0,
    remainingBalance: 14500,
    notes: 'هذه رسالة اختبار للتأكد من إعدادات الإشعارات بنجاح.',
    items: [
      {
        productId: 'sample_1',
        name: 'Composite Nano-Hybride Dentaire A2',
        price: 4500,
        quantity: 2,
        category: 'Consommables',
      },
      {
        productId: 'sample_2',
        name: 'Boîte de Fraises Diamantées (10 pcs)',
        variantName: 'Grain Moyen / Bleu',
        price: 2700,
        quantity: 2,
        category: 'Instruments',
      },
    ],
  };

  if (channel === 'telegram') {
    const res = await sendTelegramNotification(sampleOrder, config);
    if (res.success) {
      return { success: true, message: 'تم إرسال رسالة الاختبار بنجاح إلى حسابات تيليغرام المحددة! ✅', details: res };
    } else {
      const err = res.errors?.join('\n') || 'فشل إرسال الرسالة لتيليغرام. يرجى التحقق من صحة Bot Token و Chat ID.';
      return { success: false, message: err, details: res };
    }
  } else {
    const res = await sendWhatsAppNotification(sampleOrder, config);
    if (res.success) {
      return { success: true, message: 'تم إرسال رسالة الاختبار بنجاح إلى أرقام واتساب المحددة! ✅', details: res };
    } else {
      const err = res.errors?.join('\n') || 'فشل إرسال الرسالة لواتساب. يرجى التحقق من أرقام الهواتف ومفتاح API.';
      return { success: false, message: err, details: res };
    }
  }
}
