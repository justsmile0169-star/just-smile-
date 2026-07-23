/**
 * Translation Dictionary (French and Arabic) for JUST SMILE
 */

export type Language = 'fr' | 'ar';

export const translations = {
  fr: {
    appName: 'JUST SMILE',
    tagline: 'Fournitures Dentaires B2B',
    currency: 'DA',
    searchPlaceholder: 'Rechercher un produit...',
    categories: 'Catégories',
    allCategories: 'Toutes les catégories',
    cart: 'Panier',
    emptyCart: 'Votre panier est vide',
    addToCart: 'Ajouter au panier',
    outOfStock: 'Rupture de stock',
    onlyStockLeft: 'Plus que {count} en stock',
    login: 'Connexion',
    register: 'S\'inscrire',
    logout: 'Déconnexion',
    dashboard: 'Tableau de bord',
    admin: 'Administration',
    browse: 'Produits',
    favorites: 'Favoris',
    notifications: 'Notifications',
    pendingApproval: 'Votre compte est en cours de révision. Vous pourrez vous connecter dès son activation par l\'administration. Merci pour votre compréhension 😊.',
    rejectedApproval: 'Votre compte a été refusé. Veuillez contacter le support.',

    // Auth fields
    name: 'Nom complet',
    phone: 'Numéro de téléphone',
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    clinicName: 'Nom de la clinique / Cabinet',
    location: 'Wilaya / Commune',
    submit: 'Soumettre',
    alreadyHaveAccount: 'Déjà un compte ? Se connecter',
    noAccount: 'Nouveau praticien ? S\'inscrire',

    // Credit rules
    creditStatus: 'État de votre crédit',
    totalDebt: 'Dette totale',
    paidAmount: 'Montant payé',
    remainingBalance: 'Solde restant',
    overdueAlert: '⚠️ ATTENTION : Vous avez une facture en retard de paiement (> 20 jours). Le passage de commande est bloqué.',
    overdueBadge: 'En retard',
    daysLeft: '{days} jours restants',
    overdueBy: 'En retard de {days} jours',
    deadline: 'Échéance',

    // Orders
    orderHistory: 'Historique des commandes',
    orderDate: 'Date de commande',
    orderId: 'N° Commande',
    total: 'Total',
    status: 'Statut',
    actions: 'Actions',
    reorder: 'Recommander',
    invoice: 'Facture',
    invoiceDownload: 'Imprimer Facture',
    noOrders: 'Aucune commande effectuée',
    checkout: 'Valider la commande (Paiement à la livraison)',
    notes: 'Instructions de livraison (facultatif)',
    placeOrder: 'Confirmer la commande',

    // Order Statuses
    status_pending: 'En attente',
    status_confirmed: 'Confirmée',
    status_preparing: 'En cours de préparation',
    status_shipped: 'Expédiée',
    status_delivered: 'Livrée',
    status_cancelled: 'Annulée',
    status_approved: 'Validé',
    status_rejected: 'Refusé',

    // Payment Statuses
    payment_unpaid: 'Non payée',
    payment_partial: 'Partiel',
    payment_paid: 'Payée',

    // Product detail
    technicalSheet: 'Fiche Technique',
    specs: 'Spécifications',
    recentlyViewed: 'Consultés récemment',

    // Admin Dashboard
    pendingDoctors: 'Praticiens en attente',
    approvedDoctors: 'Praticiens validés',
    approve: 'Approuver',
    reject: 'Refuser',
    lowStock: 'Alerte Stock Bas',
    expiryAlerts: 'Alerte Expiration',
    importProducts: 'Importer des produits (Excel)',
    importSelectFile: 'Sélectionner un fichier Excel (.xlsx)',
    importReport: 'Rapport d\'importation',
    importReportSuccess: '{count} produits importés avec succès.',
    importReportError: 'Erreurs de validation trouvées dans {count} lignes.',
    registerPayment: 'Enregistrer un paiement',
    doctorDiscounts: 'Remises Spéciales',
    inventory: 'Gestion de stock',
    registeredDoctors: 'Praticiens inscrits',
    clientSituation: 'Situation du client',
    clientSearchPlaceholder: 'Rechercher par nom, ID, clinique ou email...',
    addNewProduct: 'Ajouter un produit',
    editProduct: 'Modifier le produit',
    stockAlert: 'Seuil alerte',
    expiryDate: 'Date d\'expiration',
    productImportTemplate: 'Télécharger modèle Excel',

    // Notifications
    noNotifications: 'Pas de notifications',
    markAllRead: 'Tout marquer comme lu',
    notification_payment_reminder: 'Rappel de paiement',
    notification_order_update: 'Mise à jour commande',
    notification_system: 'Système',

    // Validation alerts
    orderBlockedDebt: 'Commande bloquée : Vous devez régler vos factures en retard de plus de 20 jours.',
    orderSuccess: 'Commande enregistrée avec succès !',
    cartAdded: 'Produit ajouté au panier',
    recentSearches: 'Recherches récentes',
    clearHistory: 'Effacer l\'historique',
  },
  ar: {
    appName: 'JUST SMILE',
    tagline: 'المستلزمات الطبية لطب الأسنان B2B',
    currency: 'دج',
    searchPlaceholder: 'البحث عن منتج...',
    categories: 'الفئات',
    allCategories: 'كل الفئات',
    cart: 'سلة المشتريات',
    emptyCart: 'سلة المشتريات فارغة',
    addToCart: 'إضافة إلى السلة',
    outOfStock: 'نفد من المخزون',
    onlyStockLeft: 'المتبقي {count} في المخزون فقط',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    logout: 'تسجيل الخروج',
    dashboard: 'لوحة التحكم',
    admin: 'الإدارة',
    browse: 'المنتجات',
    favorites: 'المفضلة',
    notifications: 'الإشعارات',
    pendingApproval: 'حسابك قيد المراجعة ، ستتمكن من تسجيل الدخول فور تفعيله من طرف الإدارة ، شكرا على تفهمك 😊 .',
    rejectedApproval: 'تم رفض حسابك. يرجى الاتصال بالدعم الفني.',

    // Auth fields
    name: 'الاسم الكامل',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    clinicName: 'اسم العيادة / المكتب',
    location: 'الولاية / البلدية',
    submit: 'إرسال',
    alreadyHaveAccount: 'هل لديك حساب بالفعل؟ تسجيل الدخول',
    noAccount: 'طبيب أسنان جديد؟ إنشاء حساب',

    // Credit rules
    creditStatus: 'حالة الائتمان والدين',
    totalDebt: 'إجمالي الدين',
    paidAmount: 'المبلغ المدفوع',
    remainingBalance: 'المبلغ المتبقي',
    overdueAlert: '⚠️ تنبيه: لديك فواتير متأخرة الدفع (> 20 يومًا). تم حظر إمكانية تقديم طلبات جديدة.',
    overdueBadge: 'متأخر',
    daysLeft: 'متبقي {days} يوم',
    overdueBy: 'متأخر بـ {days} يوم',
    deadline: 'تاريخ الاستحقاق',

    // Orders
    orderHistory: 'سجل الطلبات',
    orderDate: 'تاريخ الطلب',
    orderId: 'رقم الطلب',
    total: 'الإجمالي',
    status: 'الحالة',
    actions: 'الإجراءات',
    reorder: 'إعادة الطلب',
    invoice: 'الفاتورة',
    invoiceDownload: 'طباعة الفاتورة',
    noOrders: 'لم تقم بأي طلبات بعد',
    checkout: 'تأكيد الطلب (الدفع عند الاستلام)',
    notes: 'تعليمات التوصيل (اختياري)',
    placeOrder: 'تأكيد الطلب',

    // Order Statuses
    status_pending: 'قيد الانتظار',
    status_confirmed: 'مؤكد',
    status_preparing: 'قيد التحضير',
    status_shipped: 'تم الشحن',
    status_delivered: 'تم التوصيل',
    status_cancelled: 'ملغي',
    status_approved: 'مفعّل',
    status_rejected: 'مرفوض',

    // Payment Statuses
    payment_unpaid: 'غير مدفوعة',
    payment_partial: 'دفع جزئي',
    payment_paid: 'مدفوعة',

    // Product detail
    technicalSheet: 'البطاقة التقنية',
    specs: 'المواصفات',
    recentlyViewed: 'المنتجات المعروضة مؤخراً',

    // Admin Dashboard
    pendingDoctors: 'الأطباء في انتظار التفعيل',
    approvedDoctors: 'الأطباء المعتمدون',
    approve: 'موافقة',
    reject: 'رفض',
    lowStock: 'تنبيه مخزون منخفض',
    expiryAlerts: 'تنبيه تاريخ الصلاحية',
    importProducts: 'استيراد المنتجات (Excel)',
    importSelectFile: 'اختر ملف إكسل (.xlsx)',
    importReport: 'تقرير الاستيراد',
    importReportSuccess: 'تم استيراد {count} منتجات بنجاح.',
    importReportError: 'تم العثور على أخطاء تحقق في {count} أسطر.',
    registerPayment: 'تسجيل دفعة مالية',
    doctorDiscounts: 'التخفيضات الخاصة',
    inventory: 'إدارة المخزون',
    registeredDoctors: 'الأطباء المسجلون',
    clientSituation: 'وضعية الزبون',
    clientSearchPlaceholder: 'بحث بالاسم، المعرف، العيادة أو البريد...',
    addNewProduct: 'إضافة منتج جديد',
    editProduct: 'تعديل المنتج',
    stockAlert: 'حد التنبيه',
    expiryDate: 'تاريخ انتهاء الصلاحية',
    productImportTemplate: 'تحميل نموذج إكسل',

    // Notifications
    noNotifications: 'لا توجد إشعارات',
    markAllRead: 'تحديد الكل كمقروء',
    notification_payment_reminder: 'تذكير بالدفع',
    notification_order_update: 'تحديث الطلب',
    notification_system: 'النظام',

    // Validation alerts
    orderBlockedDebt: 'الطلب محظور: يجب تسوية فواتيرك المتأخرة لأكثر من 20 يومًا أولاً.',
    orderSuccess: 'تم تسجيل الطلب بنجاح!',
    cartAdded: 'تمت إضافة المنتج إلى السلة',
    recentSearches: 'عمليات البحث الأخيرة',
    clearHistory: 'مسح السجل',
  }
};

export function getTranslation(lang: Language, key: keyof typeof translations['fr'], replacements?: Record<string, string | number>): string {
  let text = translations[lang][key] || translations['fr'][key] || String(key);
  if (replacements) {
    Object.entries(replacements).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
}
