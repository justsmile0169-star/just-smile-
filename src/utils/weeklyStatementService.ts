import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, Payment, ProductReturn, UserProfile } from '../types';
import { computeAllClientsFinancials, computeClientFinancials, ClientFinancialSummary } from './clientFinancials';
import { getNotificationConfig } from './orderNotificationService';
import { generateDoctorFinancialStatementPDFBlob } from './exportFinancialStatement';

export interface WeeklyStatementRecipient {
  id: string;
  chatId: string;
  label: string;
  enabled: boolean;
}

export interface WeeklyStatementConfig {
  enabled: boolean;
  sendDay: number; // 4 = Thursday (ليلة الجمعة), 0 = Sunday...
  sendHour: number; // 23 (11:00 PM)
  sendMinute: number; // 59
  filter: 'debtors_only' | 'all' | 'active_only'; // default 'debtors_only' (المدينين فقط)
  useMainTelegramBot: boolean; // if true, uses botToken from notification_config
  customBotToken?: string;
  recipients: WeeklyStatementRecipient[];
  includeSummaryMessage: boolean;
  delayBetweenMessagesMs: number; // default 400ms
  lastSentWeekKey?: string; // e.g. "2026-W39"
  lastSentAt?: string; // ISO string
  lastSendStatus?: 'idle' | 'in_progress' | 'success' | 'failed';
  lastSendCount?: number;
  lastSendErrors?: string[];
}

export const DEFAULT_WEEKLY_STATEMENT_CONFIG: WeeklyStatementConfig = {
  enabled: true,
  sendDay: 4, // Thursday
  sendHour: 23, // 23:00 / Midnight
  sendMinute: 59,
  filter: 'debtors_only', // Send only doctors with debt > 0
  useMainTelegramBot: true,
  customBotToken: '',
  recipients: [],
  includeSummaryMessage: true,
  delayBetweenMessagesMs: 400,
  lastSendStatus: 'idle',
  lastSendCount: 0,
};

/**
 * Format currency amount with DA suffix
 */
export function formatCurrency(amount: number | undefined | null): string {
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${val.toLocaleString()} دج`;
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
 * Sanitize doctor name for PDF filename
 */
function sanitizeFileName(name: string): string {
  if (!name) return 'Docteur';
  return name.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_').slice(0, 35);
}

/**
 * Sleep helper for throttling Telegram requests
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate ISO week key (e.g., "2026-W39")
 */
export function getCurrentWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Calculate the next Thursday midnight (ليلة الجمعة)
 */
export function getUpcomingThursdayMidnight(): Date {
  const now = new Date();
  const result = new Date(now);
  const dayOfWeek = now.getDay(); // 0 = Sun, 4 = Thu
  let daysUntilThursday = (4 - dayOfWeek + 7) % 7;
  
  if (daysUntilThursday === 0 && now.getHours() >= 23 && now.getMinutes() >= 59) {
    daysUntilThursday = 7;
  }
  
  result.setDate(now.getDate() + daysUntilThursday);
  result.setHours(23, 59, 0, 0);
  return result;
}

/**
 * Fetch weekly statement configuration from Firestore
 */
export async function getWeeklyStatementConfig(): Promise<WeeklyStatementConfig> {
  try {
    const docRef = doc(db, 'settings', 'weekly_statement_config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        ...DEFAULT_WEEKLY_STATEMENT_CONFIG,
        ...data,
        recipients: data.recipients || [],
      };
    }
  } catch (err) {
    console.warn('Could not load weekly statement config from Firestore:', err);
  }
  return DEFAULT_WEEKLY_STATEMENT_CONFIG;
}

/**
 * Save weekly statement configuration to Firestore
 */
export async function saveWeeklyStatementConfig(config: WeeklyStatementConfig): Promise<void> {
  const docRef = doc(db, 'settings', 'weekly_statement_config');
  await setDoc(docRef, config, { merge: true });
}

/**
 * Build caption text accompanying the doctor's statement PDF file on Telegram
 */
export function buildDoctorStatementPDFCaption(
  summary: ClientFinancialSummary,
  shopTitle: string = 'JUST SMILE'
): string {
  const { client, totalPurchases, totalPaid, debt } = summary;
  const nowStr = new Date().toLocaleDateString('ar-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let cap = `📑 <b>كشف حساب مالي PDF — ${escapeHtml(shopTitle)}</b>\n`;
  cap += `━━━━━━━━━━━━━━━━━━━━━\n`;
  cap += `👨‍⚕️ <b>الطبيب:</b> د. <b>${escapeHtml(client.name || 'غير محدد')}</b>\n`;
  if (client.clinicName) cap += `🏥 <b>العيادة:</b> ${escapeHtml(client.clinicName)}\n`;
  if (client.phone) cap += `📞 <b>الهاتف:</b> <code>${escapeHtml(client.phone)}</code>\n`;
  if (client.wilayaName) cap += `📍 <b>الولاية:</b> ${escapeHtml(client.wilayaName)}${client.communeName ? ' - ' + escapeHtml(client.communeName) : ''}\n`;
  cap += `━━━━━━━━━━━━━━━━━━━━━\n`;
  cap += `🛍️ <b>إجمالي المشتريات:</b> ${formatCurrency(totalPurchases)}\n`;
  cap += `💵 <b>المبالغ المسددة:</b> ${formatCurrency(totalPaid)}\n`;
  cap += `⚠️ <b>الديون المتبقية الواجب سدادها:</b> <u>${formatCurrency(debt)}</u> 🔴\n`;
  cap += `📅 <b>تاريخ الاستخراج:</b> ${escapeHtml(nowStr)}\n`;
  cap += `<i>مرفق ملف PDF كشف الحساب المالي التفصيلي أعلاه.</i>`;

  return cap;
}

/**
 * Build summary report message sent at the end of the batch
 */
export function buildWeeklySummaryMessage(
  stats: {
    totalDebtors: number;
    sentCount: number;
    failedCount: number;
    totalDebt: number;
    totalPurchases: number;
    totalPaid: number;
  },
  shopTitle: string = 'JUST SMILE'
): string {
  const nowStr = new Date().toLocaleString('ar-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let msg = `📈 <b>التقرير الشامل لكشوفات حسابات الديون (PDF)</b>\n`;
  msg += `🏪 <b>${escapeHtml(shopTitle)}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕒 <b>توقيت الإرسال:</b> ${escapeHtml(nowStr)}\n`;
  msg += `👥 <b>عدد الأطباء المدينين:</b> ${stats.totalDebtors}\n`;
  msg += `✅ <b>تم إرسال ملفات PDF بنجاح:</b> ${stats.sentCount} ملف\n`;
  if (stats.failedCount > 0) {
    msg += `❌ <b>فشل الإرسال:</b> ${stats.failedCount}\n`;
  }
  msg += `\n📊 <b>الوضعية المالية الإجمالية للديون:</b>\n`;
  msg += `• 💳 <b>إجمالي الديون القائمة:</b> <u>${formatCurrency(stats.totalDebt)}</u> 🔴\n`;
  msg += `• 🛍️ <b>إجمالي المبيعات للأطباء المدينين:</b> ${formatCurrency(stats.totalPurchases)}\n`;
  msg += `• 💵 <b>إجمالي المحصل منهم:</b> ${formatCurrency(stats.totalPaid)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✨ <i>تم إكمال دورة الإرسال الأسبوعي لملفات PDF بنجاح (ليلة الجمعة).</i>`;

  return msg;
}

/**
 * Send a PDF document file to Telegram via Bot API sendDocument
 */
export async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  pdfBlob: Blob,
  fileName: string,
  captionHtml?: string
): Promise<{ ok: boolean; description?: string }> {
  const cleanToken = botToken.trim();
  const cleanChatId = chatId.trim();

  const formData = new FormData();
  formData.append('chat_id', cleanChatId);
  formData.append('document', pdfBlob, fileName);
  if (captionHtml) {
    formData.append('caption', captionHtml);
    formData.append('parse_mode', 'HTML');
  }

  try {
    const url = `https://api.telegram.org/bot${cleanToken}/sendDocument`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    return { ok: Boolean(data && data.ok), description: data?.description };
  } catch (err: any) {
    return { ok: false, description: err?.message || 'Network error' };
  }
}

/**
 * Send a raw text Telegram message (used for summary report)
 */
async function sendRawTelegramMessage(
  botToken: string,
  chatId: string,
  messageHtml: string
): Promise<{ ok: boolean; description?: string }> {
  const cleanToken = botToken.trim();
  const cleanChatId = chatId.trim();

  const params = new URLSearchParams({
    chat_id: cleanChatId,
    text: messageHtml,
    parse_mode: 'HTML',
    disable_web_page_preview: 'true',
  });

  try {
    const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      body: params,
    });
    const data = await response.json();
    return { ok: Boolean(data && data.ok), description: data?.description };
  } catch (postErr: any) {
    try {
      const getUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage?${params.toString()}`;
      const getResp = await fetch(getUrl, { method: 'GET' });
      const getData = await getResp.json();
      return { ok: Boolean(getData && getData.ok), description: getData?.description };
    } catch (getErr: any) {
      return { ok: false, description: getErr?.message || postErr?.message || 'Network error' };
    }
  }
}

/**
 * Send a single doctor's financial statement PDF directly to Telegram
 */
export async function sendSingleDoctorStatementToTelegram(
  doctor: UserProfile,
  ordersList: Order[],
  paymentsList: Payment[],
  returnsList: ProductReturn[],
  customChatId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const [weeklyCfg, notifCfg] = await Promise.all([
      getWeeklyStatementConfig(),
      getNotificationConfig(),
    ]);

    const botToken = (weeklyCfg.useMainTelegramBot ? notifCfg.telegram?.botToken : weeklyCfg.customBotToken) || notifCfg.telegram?.botToken;
    if (!botToken || !botToken.trim()) {
      return { success: false, message: 'لم يتم تعيين Telegram Bot Token في الإعدادات.' };
    }

    let targetChatIds: string[] = [];
    if (customChatId && customChatId.trim()) {
      targetChatIds = [customChatId.trim()];
    } else if (weeklyCfg.recipients && weeklyCfg.recipients.length > 0) {
      targetChatIds = weeklyCfg.recipients.filter((r) => r.enabled).map((r) => r.chatId.trim());
    } else if (notifCfg.telegram?.recipients && notifCfg.telegram.recipients.length > 0) {
      targetChatIds = notifCfg.telegram.recipients.filter((r) => r.enabled).map((r) => r.chatId.trim());
    }

    if (targetChatIds.length === 0) {
      return { success: false, message: 'لم يتم العثور على أي Chat ID صالح لاستقبال ملف PDF.' };
    }

    // 1. Generate the actual PDF Blob for the doctor
    const clientOrders = ordersList.filter((o) => o.userId === doctor.uid);
    const clientPayments = paymentsList.filter((p) => p.userId === doctor.uid);
    const clientReturns = returnsList.filter((r) => r.userId === doctor.uid);

    const pdfBlob = await generateDoctorFinancialStatementPDFBlob({
      client: doctor,
      orders: clientOrders,
      payments: clientPayments,
      returns: clientReturns,
      lang: 'ar'
    });

    const summary = computeClientFinancials(doctor, ordersList, paymentsList, returnsList);
    const shopTitle = notifCfg.template?.shopTitle || 'JUST SMILE';
    const captionHtml = buildDoctorStatementPDFCaption(summary, shopTitle);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Releve_Compte_${sanitizeFileName(doctor.name)}_${dateStr}.pdf`;

    let sentAny = false;
    const errors: string[] = [];

    for (const chatId of targetChatIds) {
      const res = await sendTelegramDocument(botToken, chatId, pdfBlob, fileName, captionHtml);
      if (res.ok) {
        sentAny = true;
      } else {
        errors.push(`فشل الإرسال إلى (${chatId}): ${res.description || 'Unknown'}`);
      }
    }

    if (sentAny) {
      return { success: true, message: `تم إرسال ملف PDF كشف حساب د. ${doctor.name} بنجاح إلى تيليجرام! 📑` };
    } else {
      return { success: false, message: errors.join('\n') || 'تعذر إرسال ملف PDF إلى تيليجرام.' };
    }
  } catch (err: any) {
    return { success: false, message: `حدث خطأ أثناء توليد أو إرسال PDF: ${err.message || err}` };
  }
}

export interface BatchDispatchProgress {
  currentIndex: number;
  total: number;
  currentDoctorName: string;
  successCount: number;
  failCount: number;
}

/**
 * Execute full batch dispatch of weekly PDF statements for doctors with debts
 */
export async function executeWeeklyStatementsDispatch(options?: {
  config?: WeeklyStatementConfig;
  usersList?: UserProfile[];
  ordersList?: Order[];
  paymentsList?: Payment[];
  returnsList?: ProductReturn[];
  onProgress?: (progress: BatchDispatchProgress) => void;
}): Promise<{
  success: boolean;
  totalDoctors: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
}> {
  const config = options?.config || (await getWeeklyStatementConfig());
  const notifCfg = await getNotificationConfig();

  const botToken = (config.useMainTelegramBot ? notifCfg.telegram?.botToken : config.customBotToken) || notifCfg.telegram?.botToken;
  if (!botToken || !botToken.trim()) {
    throw new Error('Telegram Bot Token غير مضبوط. يرجى إضافته في إعدادات الإشعارات أولاً.');
  }

  // Determine recipients
  let activeRecipients = (config.recipients || []).filter((r) => r.enabled && r.chatId?.trim());
  if (activeRecipients.length === 0 && notifCfg.telegram?.recipients) {
    activeRecipients = notifCfg.telegram.recipients.filter((r) => r.enabled && r.chatId?.trim());
  }

  if (activeRecipients.length === 0) {
    throw new Error('لم يتم تحديد أي حساب أو Chat ID لاستقبال ملفات PDF لكشوفات الحسابات.');
  }

  // Load data if not provided
  let users = options?.usersList;
  let orders = options?.ordersList;
  let payments = options?.paymentsList;
  let returns = options?.returnsList;

  if (!users) {
    const snap = await getDocs(collection(db, 'users'));
    users = snap.docs.map((d) => ({ ...d.data(), uid: d.id } as UserProfile));
  }
  if (!orders) {
    const snap = await getDocs(collection(db, 'orders'));
    orders = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Order));
  }
  if (!payments) {
    const snap = await getDocs(collection(db, 'payments'));
    payments = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Payment));
  }
  if (!returns) {
    const snap = await getDocs(collection(db, 'returns'));
    returns = snap.docs.map((d) => ({ ...d.data(), id: d.id } as ProductReturn));
  }

  // Filter clients to doctors (or users with role doctor or who have orders)
  const doctorUsers = users.filter((u) => {
    const isDoc = u.role === 'doctor' || !u.role;
    const hasOrders = orders!.some((o) => o.userId === u.uid);
    return isDoc || hasOrders;
  });

  // Calculate summaries for all doctors
  const allSummaries = computeAllClientsFinancials(doctorUsers, orders, payments, returns);

  // Filter: by default, send ONLY doctors who have debt > 0
  let targetSummaries = allSummaries.filter((s) => s.debt > 0);
  if (config.filter === 'all') {
    targetSummaries = allSummaries;
  } else if (config.filter === 'active_only') {
    targetSummaries = allSummaries.filter((s) => s.activeOrdersCount > 0 || s.totalPurchases > 0);
  }

  // Sort highest debt first
  targetSummaries.sort((a, b) => b.debt - a.debt);

  // If no debtors found
  if (targetSummaries.length === 0) {
    const emptyMsg = `📊 <b>كشف حسابات الديون الأسبوعي (PDF) — ${escapeHtml(notifCfg.template?.shopTitle || 'JUST SMILE')}</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ <b>لا توجد أي ديون متبقية على أي طبيب لهذا الأسبوع!</b>\n` +
      `جميع الحسابات مسوّاة بالكامل (0 دج). 🟢`;
    for (const rec of activeRecipients) {
      await sendRawTelegramMessage(botToken, rec.chatId, emptyMsg);
    }
    return {
      success: true,
      totalDoctors: 0,
      sentCount: 0,
      failedCount: 0,
      errors: [],
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  const delayMs = config.delayBetweenMessagesMs || 400;
  const shopTitle = notifCfg.template?.shopTitle || 'JUST SMILE';
  const dateStr = new Date().toISOString().slice(0, 10);

  // Mark status in progress
  await saveWeeklyStatementConfig({
    ...config,
    lastSendStatus: 'in_progress',
  });

  // Iterate over each doctor with debt and generate & send their PDF
  for (let i = 0; i < targetSummaries.length; i++) {
    const summary = targetSummaries[i];
    const doctor = summary.client;

    if (options?.onProgress) {
      options.onProgress({
        currentIndex: i + 1,
        total: targetSummaries.length,
        currentDoctorName: doctor.name || 'طبيب',
        successCount: sentCount,
        failCount: failedCount,
      });
    }

    try {
      // 1. Generate the exact financial statement PDF Blob
      const clientOrders = orders.filter((o) => o.userId === doctor.uid);
      const clientPayments = payments.filter((p) => p.userId === doctor.uid);
      const clientReturns = returns.filter((r) => r.userId === doctor.uid);

      const pdfBlob = await generateDoctorFinancialStatementPDFBlob({
        client: doctor,
        orders: clientOrders,
        payments: clientPayments,
        returns: clientReturns,
        lang: 'ar'
      });

      const captionHtml = buildDoctorStatementPDFCaption(summary, shopTitle);
      const fileName = `Releve_Dettes_${sanitizeFileName(doctor.name)}_${dateStr}.pdf`;

      let docSent = false;
      for (const rec of activeRecipients) {
        const res = await sendTelegramDocument(botToken, rec.chatId, pdfBlob, fileName, captionHtml);
        if (res.ok) {
          docSent = true;
        } else {
          errors.push(`فشل إرسال PDF لدكتور [${doctor.name}] على [${rec.label || rec.chatId}]: ${res.description || ''}`);
        }
        await sleep(150);
      }

      if (docSent) {
        sentCount++;
      } else {
        failedCount++;
      }
    } catch (pdfErr: any) {
      console.error(`Error generating PDF for doctor ${doctor.name}:`, pdfErr);
      failedCount++;
      errors.push(`خطأ في توليد PDF لدكتور [${doctor.name}]: ${pdfErr.message || pdfErr}`);
    }

    // Rate limit throttle
    await sleep(delayMs);
  }

  // Send aggregate summary message at the end
  if (config.includeSummaryMessage && sentCount > 0) {
    const stats = {
      totalDebtors: targetSummaries.length,
      sentCount,
      failedCount,
      totalDebt: targetSummaries.reduce((sum, s) => sum + s.debt, 0),
      totalPurchases: targetSummaries.reduce((sum, s) => sum + s.totalPurchases, 0),
      totalPaid: targetSummaries.reduce((sum, s) => sum + s.totalPaid, 0),
    };

    const summaryMsg = buildWeeklySummaryMessage(stats, shopTitle);
    for (const rec of activeRecipients) {
      await sendRawTelegramMessage(botToken, rec.chatId, summaryMsg);
      await sleep(150);
    }
  }

  const weekKey = getCurrentWeekKey();
  const nowIso = new Date().toISOString();

  await saveWeeklyStatementConfig({
    ...config,
    lastSentWeekKey: weekKey,
    lastSentAt: nowIso,
    lastSendStatus: failedCount === 0 ? 'success' : 'failed',
    lastSendCount: sentCount,
    lastSendErrors: errors.slice(0, 10),
  });

  return {
    success: sentCount > 0,
    totalDoctors: targetSummaries.length,
    sentCount,
    failedCount,
    errors,
  };
}

/**
 * Check if today/time is due for weekly statement auto-send
 * Scheduled: Every Thursday (day 4) starting at 23:00 to Friday (day 5) 06:00
 */
export function isWeeklyStatementDue(config: WeeklyStatementConfig): boolean {
  if (!config.enabled) return false;

  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 4 = Thursday, 5 = Friday
  const hour = now.getHours();

  // Match: Thursday 23:00+ or Friday 00:00 - 06:00
  const isThursdayMidnight = (day === 4 && hour >= 23) || (day === 5 && hour < 6);

  if (!isThursdayMidnight) {
    return false;
  }

  const currentWeekKey = getCurrentWeekKey(now);
  if (config.lastSentWeekKey === currentWeekKey) {
    // Already dispatched this week
    return false;
  }

  return true;
}

/**
 * Background scheduler check that runs automatically
 */
export async function checkAndTriggerWeeklyStatementScheduler(): Promise<boolean> {
  try {
    const config = await getWeeklyStatementConfig();
    if (!isWeeklyStatementDue(config)) {
      return false;
    }

    console.log('[WeeklyStatementScheduler] Due for auto-dispatch of Debt PDFs! Starting batch...');
    const res = await executeWeeklyStatementsDispatch({ config });
    console.log('[WeeklyStatementScheduler] Completed PDF batch:', res);
    return true;
  } catch (err) {
    console.error('[WeeklyStatementScheduler] Error during scheduled PDF dispatch:', err);
    return false;
  }
}
