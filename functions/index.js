const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

/**
 * Callable function for staff authentication
 * Allows staff members (admin, manager, cashier, accountant) to sign in
 * using email and password stored in Firestore, and optionally generates a custom auth token
 */
exports.signInStaff = functions.https.onCall(async (data, context) => {
  const { email, password } = data;

  if (!email || !password) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Email and password are required'
    );
  }

  try {
    const emailTrimmed = email.trim();
    const emailLower = emailTrimmed.toLowerCase();
    const usersRef = admin.firestore().collection('users');

    let snapshot = await usersRef.where('email', '==', emailTrimmed).limit(1).get();
    if (snapshot.empty && emailTrimmed !== emailLower) {
      snapshot = await usersRef.where('email', '==', emailLower).limit(1).get();
    }

    if (snapshot.empty) {
      throw new functions.https.HttpsError(
        'not-found',
        'Invalid email or password'
      );
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    // Check if user is staff (not doctor)
    if (userData.role === 'doctor') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Doctors must use Firebase Auth'
      );
    }

    // Check if user is approved/active
    if (userData.status && userData.status !== 'approved' && userData.status !== 'active') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Account is not approved'
      );
    }

    // Compare password (supports bcrypt hash or plaintext)
    let passwordMatches = false;
    if (userData.password) {
      const isBcrypt = userData.password.startsWith('$2') && userData.password.length > 50;
      if (isBcrypt) {
        try {
          const bcrypt = require('bcryptjs');
          passwordMatches = await bcrypt.compare(password, userData.password);
        } catch (e) {
          // Fallback if bcryptjs is not loaded
          passwordMatches = false;
        }
      } else {
        passwordMatches = (userData.password === password);
      }
    }

    if (!passwordMatches) {
      throw new functions.https.HttpsError(
        'not-found',
        'Invalid email or password'
      );
    }

    // Create Firebase Auth custom token so client can authenticate with full privileges
    let customToken = null;
    try {
      customToken = await admin.auth().createCustomToken(userDoc.id, {
        role: userData.role
      });
    } catch (tokenErr) {
      console.warn('Could not create custom token for staff:', tokenErr);
    }

    // Update last login time
    await userDoc.ref.update({
      lastLoginAt: new Date().toISOString()
    });

    // Return user data (without password) and the customToken
    const { password: _, ...userWithoutPassword } = userData;
    return {
      user: userWithoutPassword,
      customToken
    };
  } catch (error) {
    console.error('Error signing in staff:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      'internal',
      error.message
    );
  }
});

/**
 * Firestore Trigger on new order creation
 * Sends real-time Telegram & WhatsApp notifications based on settings/notification_config
 */
exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap, context) => {
    const orderData = snap.data();
    if (!orderData) return null;

    try {
      const configDoc = await admin.firestore().doc('settings/notification_config').get();
      if (!configDoc.exists) return null;

      const config = configDoc.data();
      if (!config || !config.enabled) return null;

      const orderRef = snap.id.slice(-6).toUpperCase();
      const shopTitle = config.template?.shopTitle || 'JUST SMILE';
      const orderTime = orderData.createdAt ? new Date(orderData.createdAt).toLocaleString('fr-DZ') : new Date().toLocaleString();

      // Format Telegram text
      let tgMsg = `🛍 <b>طلب جديد في ${shopTitle}!</b>\n`;
      tgMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      tgMsg += `🔖 <b>رقم الطلبية:</b> #<code>${orderRef}</code>\n`;
      tgMsg += `🕒 <b>التوقيت:</b> ${orderTime}\n\n`;
      tgMsg += `👤 <b>معلومات العميل:</b>\n`;
      tgMsg += `• <b>الاسم:</b> ${orderData.doctorName || 'زبون زائر'}\n`;
      if (orderData.doctorPhone) tgMsg += `• <b>الهاتف:</b> <code>${orderData.doctorPhone}</code>\n`;
      if (orderData.doctorClinic) tgMsg += `• <b>العيادة:</b> ${orderData.doctorClinic}\n`;
      const location = [orderData.doctorWilayaName, orderData.doctorCommuneName].filter(Boolean).join(' - ');
      if (location) tgMsg += `• <b>العنوان:</b> ${location}\n`;

      if (Array.isArray(orderData.items) && orderData.items.length > 0) {
        tgMsg += `\n📦 <b>المنتجات المطلوبة (${orderData.items.length}):</b>\n`;
        orderData.items.forEach((item, idx) => {
          const varName = item.variantName ? ` (${item.variantName})` : '';
          const lineTotal = (item.price || 0) * (item.quantity || 1);
          tgMsg += `${idx + 1}. <b>${item.name}</b>${varName} × ${item.quantity} = <b>${lineTotal.toLocaleString()} DA</b>\n`;
        });
      }

      tgMsg += `\n💰 <b>الصافي الإجمالي: <u>${(orderData.totalAfterDiscount || 0).toLocaleString()} DA</u></b>\n`;
      if (orderData.notes) tgMsg += `\n📝 <b>الملاحظات:</b> <i>${orderData.notes}</i>\n`;

      // Format WhatsApp text
      let waMsg = `🛍 *طلب جديد في ${shopTitle}!*\n`;
      waMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      waMsg += `🔖 *رقم الطلبية:* #${orderRef}\n`;
      waMsg += `👤 *الاسم:* ${orderData.doctorName || 'زبون زائر'}\n`;
      if (orderData.doctorPhone) waMsg += `📞 *الهاتف:* ${orderData.doctorPhone}\n`;
      if (orderData.doctorClinic) waMsg += `🏢 *العيادة:* ${orderData.doctorClinic}\n`;
      if (location) waMsg += `📍 *العنوان:* ${location}\n`;
      waMsg += `💰 *الصافي الإجمالي: ${(orderData.totalAfterDiscount || 0).toLocaleString()} DA*\n`;

      // 1. Send Telegram
      if ((config.channel === 'telegram' || config.channel === 'both') && config.telegram?.enabled && config.telegram?.botToken) {
        const activeTg = (config.telegram.recipients || []).filter(r => r.enabled && r.chatId);
        for (const recipient of activeTg) {
          try {
            await fetch(`https://api.telegram.org/bot${config.telegram.botToken.trim()}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: recipient.chatId.trim(),
                text: tgMsg,
                parse_mode: 'HTML',
                disable_web_page_preview: true
              })
            });
          } catch (e) {
            console.error('Cloud Function Telegram send error:', e);
          }
        }
      }

      // 2. Send WhatsApp (CallMeBot)
      if ((config.channel === 'whatsapp' || config.channel === 'both') && config.whatsapp?.enabled) {
        if (config.whatsapp.provider === 'callmebot') {
          const activeWa = (config.whatsapp.callmebotRecipients || []).filter(r => r.enabled && r.phone && r.apiKey);
          for (const rec of activeWa) {
            try {
              let phone = rec.phone.replace(/[^\d+]/g, '');
              if (phone.startsWith('0') && phone.length === 10) phone = '+213' + phone.substring(1);
              const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(waMsg)}&apikey=${encodeURIComponent(rec.apiKey.trim())}`;
              await fetch(url);
            } catch (e) {
              console.error('Cloud Function WhatsApp send error:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error executing onOrderCreated trigger:', err);
    }
    return null;
  });

