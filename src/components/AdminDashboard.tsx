import React, { useState, useEffect, lazy, Suspense } from 'react';
import { collection, updateDoc, doc, addDoc, setDoc, getDoc, getDocs, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, Product, ProductVariant, ProductAttribute, OrderStatus, UserProfile, ShopInfo, Payment, ProductReturn, Promotion, Expense, ActivityLog, AdminMessage } from '../types';
import { Language, getTranslation } from '../translations';
import { getLogoUrl } from '../constants/brand';
import { useAppDialog } from '../context/AppDialogContext';
import { cleanFirestoreData } from '../utils/firestoreHelpers';
import { hasPermission } from '../utils/permissions';
import { logActivity } from '../utils/activityLogger';
import { deleteProductFully } from '../utils/productFirestore';
import { getYalidineConfig, saveYalidineConfig, createYalidineParcel } from '../utils/yalidineService';
import {
  DollarSign, Package, Tag, AlertTriangle, Calendar,
  Trash2, Plus, Edit3, Check, X, FileSpreadsheet, Percent, Heart, ShieldAlert,
  Settings, Save, FileText, Stethoscope, ClipboardList, BarChart3, Wallet,
  History, Shield, Cloud, ImageIcon, Search, MessageSquare, Truck, Megaphone, Printer, Loader2, MapPin,
  ShoppingBag, ShoppingCart, Layers, Sliders, Eye, RefreshCw, Upload, Pencil
} from 'lucide-react';

// Lazy load heavy admin sub-components
const ExpiryScanner = lazy(() => import('./ExpiryScanner'));
const ExcelImporter = lazy(() => import('./ExcelImporter'));
const ClientSituationView = lazy(() => import('./ClientSituationView'));
const AnalyticsDashboard = lazy(() => import('./admin/AnalyticsDashboard'));
const PromotionManager = lazy(() => import('./admin/PromotionManager'));
const ExpenseManager = lazy(() => import('./admin/ExpenseManager'));
const ActivityLogView = lazy(() => import('./admin/ActivityLogView'));
const StaffManager = lazy(() => import('./admin/StaffManager'));
const BackupManager = lazy(() => import('./admin/BackupManager'));
const AnnouncementsSection = lazy(() => import('./AnnouncementsSection'));
const CatalogGenerator = lazy(() => import('./CatalogGenerator'));
const DoctorMap = lazy(() => import('./DoctorMap'));

interface AdminDashboardProps {
  lang: Language;
  currentUser: UserProfile;
  usersList: UserProfile[];
  ordersList: Order[];
  paymentsList: Payment[];
  returnsList: ProductReturn[];
  promotionsList: Promotion[];
  expensesList: Expense[];
  activityLogsList: ActivityLog[];
  productsList: Product[];
  adminMessagesList: AdminMessage[];
  shopInfo: ShopInfo;
  onShopInfoChange: (info: ShopInfo) => void;
  onRefreshData: () => void;
  onPrintInvoice: (order: Order) => void;
  onPrintBarcode?: (product: Product) => void;
  seedBarcode?: string | null;
  onSeedBarcodeConsumed?: () => void;
}

type AdminSubTab =
  | 'orders' | 'analytics' | 'doctors' | 'clientSituation' | 'debts' | 'inventory'
  | 'promotions' | 'expenses' | 'discounts' | 'staff' | 'activityLogs' | 'backup' | 'settings' | 'messages' | 'announcements';

export default function AdminDashboard({
  lang,
  currentUser,
  usersList,
  ordersList,
  paymentsList,
  returnsList,
  promotionsList,
  expensesList,
  activityLogsList,
  productsList,
  adminMessagesList,
  shopInfo,
  onShopInfoChange,
  onRefreshData,
  onPrintInvoice,
  onPrintBarcode,
  seedBarcode,
  onSeedBarcodeConsumed
}: AdminDashboardProps) {
  const { alert, confirm } = useAppDialog();
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(
    hasPermission(currentUser, 'view_analytics') ? 'analytics' : 'orders'
  );
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const isRtl = lang === 'ar';

  const formatPrice = (num: number) => {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  const approvedDoctors = usersList.filter((u) => u.role === 'doctor');
  const allDoctors = usersList.filter((u) => u.role === 'doctor');

  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');

  // --- 2. Debt Management ---
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | 'unpaid' | 'paid'>('unpaid');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // --- Order Details & Edit States ---
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editingOrderItems, setEditingOrderItems] = useState<Order['items']>([]);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<'cash' | 'credit'>('credit');
  const [editingDeliveryCost, setEditingDeliveryCost] = useState<number>(0);
  const [editingOrderPaidAmount, setEditingOrderPaidAmount] = useState<number>(0);
  const [yalidineSubmitting, setYalidineSubmitting] = useState(false);

  // --- Edit Order Payment from Debts Monitor State ---
  const [selectedOrderForEditPayment, setSelectedOrderForEditPayment] = useState<Order | null>(null);
  const [editOrderPaidAmount, setEditOrderPaidAmount] = useState<number>(0);
  const [savingEditOrderPayment, setSavingEditOrderPayment] = useState(false);

  const handleStartEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditingOrderItems(order.items.map((item) => ({ ...item })));
    setEditingPaymentMethod(order.paymentMethod || 'credit');
    setEditingDeliveryCost(order.deliveryCost || 0);
    setEditingOrderPaidAmount(order.paidAmount || 0);
  };

  const handleItemPriceChange = (index: number, newPrice: number) => {
    setEditingOrderItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], price: Math.max(0, newPrice) };
      return updated;
    });
  };

  const handleItemQuantityChange = (index: number, newQty: number) => {
    setEditingOrderItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: Math.max(1, newQty) };
      return updated;
    });
  };

  const handleRemoveItemFromEdit = (index: number) => {
    setEditingOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const calculateEditingTotals = () => {
    const totalBefore = editingOrderItems.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
      0
    );
    const delivery = Number(editingDeliveryCost) || 0;
    const netTotal = totalBefore + delivery;
    const paid = Math.max(0, Number(editingOrderPaidAmount) || 0);
    const remaining = Math.max(0, netTotal - paid);
    return { totalBefore, delivery, netTotal, paid, remaining };
  };

  const handleSaveOrderEdit = async () => {
    if (!editingOrder) return;
    if (editingOrderItems.length === 0) {
      alert(lang === 'fr' ? 'La commande doit contenir au moins un produit.' : 'يجب أن يحتوي الطلب على منتج واحد على الأقل.', 'error');
      return;
    }

    setLoading(true);
    try {
      const { totalBefore, delivery, netTotal, paid, remaining } = calculateEditingTotals();
      const orderRef = doc(db, 'orders', editingOrder.id);

      const newPaymentStatus = netTotal === 0 ? 'paid' : paid >= netTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

      const updatePayload: Partial<Order> = {
        items: editingOrderItems,
        paymentMethod: editingPaymentMethod,
        totalBeforeDiscount: totalBefore,
        totalAfterDiscount: netTotal,
        deliveryCost: delivery,
        paidAmount: paid,
        remainingBalance: remaining,
        paymentStatus: newPaymentStatus,
      };

      await updateDoc(orderRef, updatePayload);

      await logActivity(
        currentUser,
        'order_edit',
        'order',
        `Edited order #${editingOrder.id.slice(-6).toUpperCase()}: paymentMethod=${editingPaymentMethod}, total=${netTotal} DA, paid=${paid} DA`,
        editingOrder.id
      );

      alert(lang === 'fr' ? 'Commande modifiée avec succès !' : 'تم تعديل الطلب بنجاح!', 'success');

      setEditingOrder(null);
      setSelectedOrderForDetail((prev) => (prev && prev.id === editingOrder.id ? { ...prev, ...updatePayload } : prev));
      onRefreshData();
    } catch (err: any) {
      console.error('Error updating order:', err);
      alert(lang === 'fr' ? 'Erreur lors de la modification du produit.' : 'حدث خطأ أثناء تعديل الطلب.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOrderPaymentFromDebts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForEditPayment || editOrderPaidAmount < 0) return;
    setSavingEditOrderPayment(true);
    try {
      const newPaid = editOrderPaidAmount;
      const newRemaining = Math.max(0, selectedOrderForEditPayment.totalAfterDiscount - newPaid);
      const newPaymentStatus = newRemaining <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      await updateDoc(doc(db, 'orders', selectedOrderForEditPayment.id), {
        paidAmount: newPaid,
        remainingBalance: newRemaining,
        paymentStatus: newPaymentStatus
      });

      await logActivity(
        currentUser,
        'order_payment_edit',
        'order',
        `Modifié le montant payé pour la commande #${selectedOrderForEditPayment.id.slice(-6).toUpperCase()} : ${selectedOrderForEditPayment.paidAmount} DA -> ${newPaid} DA`,
        selectedOrderForEditPayment.id
      );

      alert(lang === 'fr' ? 'Montant payé mis à jour !' : 'تم تحديث المبلغ المدفوع بنجاح!', 'success');
      setSelectedOrderForEditPayment(null);
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la mise à jour.' : 'حدث خطأ أثناء التحديث.', 'error');
    } finally {
      setSavingEditOrderPayment(false);
    }
  };

  const handleSendToYalidine = async (order: Order) => {
    setYalidineSubmitting(true);
    try {
      const result = await createYalidineParcel(order, yalidineConfig);
      if (result.success && result.trackingNumber) {
        const orderRef = doc(db, 'orders', order.id);
        const updateData = {
          yalidineTrackingNumber: result.trackingNumber,
          yalidineStatus: 'created',
          yalidineLabelUrl: result.labelUrl || '',
          status: 'confirmed' as const
        };
        await updateDoc(orderRef, updateData);

        alert(
          lang === 'fr'
            ? `Colis créé sur Yalidine ! N° de suivi : ${result.trackingNumber}`
            : `تم إنشاء الشحنة بنجاح في يالدين! رقم التتبع: ${result.trackingNumber}`,
          'success'
        );

        await logActivity(
          currentUser,
          'yalidine_parcel_created',
          'order',
          `Created Yalidine parcel for order ${order.id}. Tracking: ${result.trackingNumber}`,
          order.id
        );

        setSelectedOrderForDetail(prev => prev && prev.id === order.id ? {
          ...prev,
          ...updateData
        } : prev);
      } else {
        alert(
          lang === 'fr'
            ? `Erreur Yalidine: ${result.error}`
            : `خطأ في يالدين: ${result.error}`,
          'error'
        );
      }
    } catch (err: any) {
      console.error(err);
      alert('Erreur: ' + (err.message || err), 'error');
    } finally {
      setYalidineSubmitting(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: any) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { status: newStatus });

      const targetOrder = ordersList.find(o => o.id === orderId);
      if (targetOrder) {
        const statusArMap: Record<OrderStatus, string> = {
          pending: 'قيد الانتظار',
          confirmed: 'تم التأكيد',
          preparing: 'قيد التجهيز',
          shipped: 'تم الشحن',
          delivered: 'تم التسليم',
          cancelled: 'ملغى'
        };
        const statusFrMap: Record<OrderStatus, string> = {
          pending: 'En attente',
          confirmed: 'Confirmée',
          preparing: 'En préparation',
          shipped: 'Expédiée',
          delivered: 'Livrée',
          cancelled: 'Annulée'
        };
        await addDoc(collection(db, 'notifications'), {
          userId: targetOrder.userId,
          titleFr: `Statut de commande mis à jour`,
          titleAr: `تحديث حالة الطلب`,
          messageFr: `Votre commande #${orderId.slice(-6).toUpperCase()} est maintenant: ${statusFrMap[newStatus as OrderStatus] || newStatus}.`,
          messageAr: `حالة طلبك رقم #${orderId.slice(-6).toUpperCase()} أصبحت الآن: ${statusArMap[newStatus as OrderStatus] || newStatus}.`,
          type: 'order_update',
          isRead: false,
          createdAt: new Date().toISOString()
        }).catch(console.warn);
      }

      alert(lang === 'fr' ? 'Statut mis à jour !' : 'تم تحديث حالة الطلب!', 'success');

      setSelectedOrderForDetail(prev => prev && prev.id === orderId ? {
        ...prev,
        status: newStatus
      } : prev);
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour.', 'error');
    }
  };

  const handleExportCSV = (ordersToExport: Order[]) => {
    // CSV headers
    const headers = [
      'ID de Commande',
      'Date de Creation',
      'Medecin',
      'Clinique',
      'Telephone',
      'Wilaya',
      'Commune',
      'Type Livraison',
      'Frais Livraison (DA)',
      'Total Brut (DA)',
      'Remise (DA)',
      'Total Net (DA)',
      'Montant Paye (DA)',
      'Reste a Regler (DA)',
      'Statut Paiement',
      'Statut Commande',
      'Date Echeance',
      'N° Suivi Yalidine',
      'Resume des Produits'
    ];

    // Map rows
    const rows = ordersToExport.map((order) => {
      const itemsSummary = order.items
        .map((item) => `${item.name} (x${item.quantity})`)
        .join('; ');

      const formatDate = (dateStr: string) => {
        try {
          return new Date(dateStr).toLocaleDateString('fr-FR');
        } catch {
          return dateStr;
        }
      };

      const deliveryTypeLabel =
        order.deliveryType === 'free' ? 'Gratuit (Djelfa)' :
          order.deliveryType === 'to_office' ? 'Bureau de livraison' :
            order.deliveryType === 'to_clinic' ? 'Clinique' : '';

      return [
        order.id ? order.id.slice(-6).toUpperCase() : 'UNKNOWN',
        formatDate(order.createdAt),
        order.doctorName,
        order.doctorClinic,
        order.doctorPhone,
        order.doctorWilayaName || '',
        order.doctorCommuneName || '',
        deliveryTypeLabel,
        order.deliveryCost ?? 0,
        order.totalBeforeDiscount,
        order.discountAmount,
        order.totalAfterDiscount,
        order.paidAmount,
        order.remainingBalance,
        order.paymentStatus,
        order.status,
        formatDate(order.deadlineDate),
        order.yalidineTrackingNumber || '',
        itemsSummary
      ];
    });

    // Construct CSV string with UTF-8 BOM to support accents and special characters
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((val) => {
            const str = val === undefined || val === null ? '' : String(val);
            // Escape double quotes and wrap in double quotes
            const escaped = str.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(',')
      )
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `justsmile_export_commandes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForPayment) return;
    if (paymentAmount <= 0 || paymentAmount > selectedOrderForPayment.remainingBalance) {
      alert(lang === 'fr' ? 'Montant de paiement invalide.' : 'قيمة الدفعة غير صالحة.', 'error');
      return;
    }

    setLoading(true);
    try {
      const newPaid = selectedOrderForPayment.paidAmount + paymentAmount;
      const newRemaining = selectedOrderForPayment.remainingBalance - paymentAmount;
      const newPaymentStatus = newRemaining <= 0 ? 'paid' : 'partial';

      // 1. Update order document
      await updateDoc(doc(db, 'orders', selectedOrderForPayment.id), {
        paidAmount: newPaid,
        remainingBalance: newRemaining,
        paymentStatus: newPaymentStatus
      });

      // 2. Add history log of payment
      await addDoc(collection(db, 'payments'), {
        orderId: selectedOrderForPayment.id,
        userId: selectedOrderForPayment.userId,
        amount: paymentAmount,
        paymentDate: new Date().toISOString(),
        notes: paymentNotes
      });

      // 3. Send payment received notification to doctor
      await addDoc(collection(db, 'notifications'), {
        userId: selectedOrderForPayment.userId,
        titleFr: 'Paiement enregistré !',
        titleAr: 'تم تسجيل دفعة مالية!',
        messageFr: `Un paiement de ${formatPrice(paymentAmount)} a été validé pour la commande #${selectedOrderForPayment.id ? selectedOrderForPayment.id.slice(-6).toUpperCase() : 'UNKNOWN'}. Solde restant: ${formatPrice(newRemaining)}.`,
        messageAr: `تم تسجيل دفعة بقيمة ${formatPrice(paymentAmount)} للطلب رقم #${selectedOrderForPayment.id ? selectedOrderForPayment.id.slice(-6).toUpperCase() : 'UNKNOWN'}. الرصيد المتبقي: ${formatPrice(newRemaining)}.`,
        type: 'payment_reminder',
        isRead: false,
        createdAt: new Date().toISOString()
      });

      alert(lang === 'fr' ? 'Paiement enregistré avec succès !' : 'تم تسجيل الدفعة بنجاح!', 'success');
      setSelectedOrderForPayment(null);
      setPaymentAmount(0);
      setPaymentNotes('');
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de l\'enregistrement du paiement.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // --- Orders SubTab State ---
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');

  // --- 3. Product Inventory State ---
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [productSearchQuery, setProductSearchQuery] = useState('');

  // Filter products based on search query
  const filteredProducts = productsList.filter((product) => {
    const query = productSearchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query) ||
      (product.barcode && product.barcode.toLowerCase().includes(query)) ||
      (product.description && product.description.toLowerCase().includes(query))
    );
  });

  // Product Form states
  const [pName, setPName] = useState('');
  const [pPrice, setPPrice] = useState(0);
  const [pStock, setPStock] = useState(0);
  const [pDesc, setPDesc] = useState('');
  const [pCategory, setPCategory] = useState<any>('Consommables');
  const [pTechSheet, setPTechSheet] = useState('');
  const [pExpiry, setPExpiry] = useState('');
  const [pLowStock, setPLowStock] = useState(5);
  const [pDiscount, setPDiscount] = useState(0);
  const [pImage, setPImage] = useState('');
  const [pBarcode, setPBarcode] = useState('');
  const [pIsRoutineClinic, setPIsRoutineClinic] = useState(false);
  const [pPurchasePrice, setPPurchasePrice] = useState(0); // سعر الشراء لحساب الفائدة

  // Custom Categories Management
  const [customCategories, setCustomCategories] = useState<string[]>([
    'Équipements', 'Consommables', 'Instruments', 'Orthodontie', 'Hygiène & Stérilisation', 'Prothèse dentaire'
  ]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Load custom categories from Firestore on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'categories'));
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.list) && data.list.length > 0) {
            setCustomCategories(data.list);
          }
        }
      } catch (err) {
        console.error('Error loading categories:', err);
      }
    };
    loadCategories();
  }, []);

  const handleAddCategory = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (customCategories.includes(trimmed)) {
      alert(lang === 'fr' ? 'Cette catégorie existe déjà.' : 'هذه الفئة موجودة مسبقاً.', 'error');
      return;
    }
    setSavingCategory(true);
    try {
      const updated = [...customCategories, trimmed];
      await setDoc(doc(db, 'settings', 'categories'), { list: updated });
      setCustomCategories(updated);
      setNewCategoryInput('');
      alert(lang === 'fr' ? `Catégorie "${trimmed}" ajoutée !` : `تمت إضافة الفئة "${trimmed}" بنجاح!`, 'success');
    } catch (err) {
      console.error(err);
      alert('Erreur.', 'error');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (cat: string) => {
    const defaultCats = ['Équipements', 'Consommables', 'Instruments', 'Orthodontie', 'Hygiène & Stérilisation', 'Prothèse dentaire'];
    if (defaultCats.includes(cat)) {
      alert(lang === 'fr' ? 'Impossible de supprimer une catégorie par défaut.' : 'لا يمكن حذف الفئات الأساسية.', 'error');
      return;
    }
    const ok = await confirm(
      lang === 'fr' ? `Supprimer la catégorie "${cat}" ?` : `حذف الفئة "${cat}" ؟`,
      lang === 'fr' ? 'Cette action ne supprime pas les produits existants dans cette catégorie.' : 'هذا لن يحذف المنتجات الموجودة في هذه الفئة.'
    );
    if (!ok) return;
    setSavingCategory(true);
    try {
      const updated = customCategories.filter(c => c !== cat);
      await setDoc(doc(db, 'settings', 'categories'), { list: updated });
      setCustomCategories(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCategory(false);
    }
  };

  // Variable Product States inside Product Form
  const [pIsVariable, setPIsVariable] = useState(false);
  const [pAttributes, setPAttributes] = useState<ProductAttribute[]>([]);
  const [pVariants, setPVariants] = useState<ProductVariant[]>([]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrOptions, setNewAttrOptions] = useState('');

  const handleAddAttribute = () => {
    if (!newAttrName.trim() || !newAttrOptions.trim()) return;
    const options = newAttrOptions.split(',').map(s => s.trim()).filter(Boolean);
    if (options.length === 0) return;
    setPAttributes(prev => [...prev, { name: newAttrName.trim(), options }]);
    setNewAttrName('');
    setNewAttrOptions('');
  };

  const handleRemoveAttribute = (index: number) => {
    setPAttributes(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateVariants = () => {
    if (pAttributes.length === 0) {
      alert(lang === 'fr' ? 'Veuillez ajouter au moins un attribut.' : 'يرجى إضافة خاصية واحدة على الأقل.', 'error');
      return;
    }

    const cartesian = (args: ProductAttribute[]): Record<string, string>[] => {
      let r: Record<string, string>[] = [{}];
      for (const attr of args) {
        const next: Record<string, string>[] = [];
        for (const prevObj of r) {
          for (const opt of attr.options) {
            next.push({ ...prevObj, [attr.name]: opt });
          }
        }
        r = next;
      }
      return r;
    };

    const combinations = cartesian(pAttributes);
    const generated: ProductVariant[] = combinations.map((combo, idx) => {
      const variantName = Object.values(combo).join(' - ');
      return {
        id: `var_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        name: variantName,
        attributes: combo,
        price: pPrice > 0 ? pPrice : 0,
        stock: pStock > 0 ? pStock : 10,
        barcode: '',
        image: pImage || ''
      };
    });

    setPVariants(generated);
    alert(lang === 'fr' ? `${generated.length} variants générés !` : `تم توليد ${generated.length} خيار بنجاح!`, 'success');
  };

  const handleUpdateVariant = (variantId: string, field: keyof ProductVariant, value: any) => {
    setPVariants(prev => prev.map(v => v.id === variantId ? { ...v, [field]: value } : v));
  };

  const handleVariantNumericBlur = (variantId: string, field: 'stock' | 'price', raw: string) => {
    const parsed = parseFloat(raw);
    const safeValue = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    handleUpdateVariant(variantId, field, safeValue);
  };

  const handleRemoveVariant = (variantId: string) => {
    setPVariants(prev => prev.filter(v => v.id !== variantId));
  };

  // Generate a random EAN-13 style barcode
  const generateBarcode = () => {
    const base = '613' + String(Date.now()).slice(-9);
    const digits = base.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    setPBarcode(base + checkDigit);
  };

  const handleQuickStockUpdate = async (product: Product, delta: number) => {
    const newStock = Math.max(0, product.stock + delta);
    try {
      if (product.isVariable && product.variants && product.variants.length > 0) {
        const updatedVariants = product.variants.map((v, i) =>
          i === 0 ? { ...v, stock: Math.max(0, v.stock + delta) } : v
        );
        const computedStock = updatedVariants.reduce((sum, v) => sum + v.stock, 0);
        await updateDoc(doc(db, 'products', product.id), {
          stock: computedStock,
          variants: updatedVariants
        });
      } else {
        await updateDoc(doc(db, 'products', product.id), { stock: newStock });
      }
      alert(
        lang === 'fr'
          ? `Stock mis à jour pour "${product.name}": ${newStock}`
          : `تم تحديث مخزون "${product.name}" إلى: ${newStock}`,
        'success'
      );
      onRefreshData();
    } catch (err: any) {
      console.error(err);
      alert('Erreur lors de la mise à jour du stock.', 'error');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800_000) {
      alert(lang === 'fr' ? 'Image trop volumineuse (max 800 Ko).' : 'الصورة كبيرة جداً (800 ك.ب كحد أقصى).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleOpenProductForm = (prod?: Product) => {
    if (prod) {
      setEditingProduct(prod);
      setPName(prod.name);
      setPPrice(prod.price);
      setPStock(prod.stock);
      setPDesc(prod.description);
      setPCategory(prod.category);
      setPTechSheet(prod.technicalSheet || '');
      setPExpiry(prod.expiryDate || '');
      setPLowStock(prod.lowStockAlert || 5);
      setPDiscount(prod.discountPercent || 0);
      setPImage(prod.image || '');
      setPBarcode(prod.barcode || '');
      setPIsRoutineClinic(prod.isRoutineClinic ?? false);
      setPIsVariable(prod.isVariable ?? false);
      setPAttributes(prod.attributes || []);
      setPVariants(prod.variants || []);
      setPPurchasePrice((prod as any).purchasePrice || 0);
    } else {
      setEditingProduct(null);
      setPName('');
      setPPrice(0);
      setPStock(0);
      setPDesc('');
      setPCategory('Consommables');
      setPTechSheet('');
      setPExpiry('');
      setPLowStock(5);
      setPDiscount(0);
      setPImage('');
      setPIsRoutineClinic(false);
      setPIsVariable(false);
      setPAttributes([]);
      setPVariants([]);
      setPPurchasePrice(0);
      const scannedBarcode = localStorage.getItem('justsmile_new_product_barcode');
      setPBarcode(scannedBarcode || '');
      if (scannedBarcode) {
        localStorage.removeItem('justsmile_new_product_barcode');
      }
    }
    setShowProductForm(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName || (!pIsVariable && pPrice <= 0) || (!pIsVariable && pStock < 0)) {
      alert(lang === 'fr' ? 'Champs invalides.' : 'معلومات غير صالحة.', 'error');
      return;
    }

    setLoading(true);
    try {
      // Prepare clean variants and calculate total stock
      let finalVariants = pVariants;
      const initialVariantSum = pVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      // If user entered a main stock > 0 but variants sum is 0, assign stock to variants
      if (pIsVariable && pVariants.length > 0 && initialVariantSum === 0 && Number(pStock) > 0) {
        const stockPerVar = Math.max(1, Math.floor(Number(pStock) / pVariants.length));
        finalVariants = pVariants.map((v) => ({ ...v, stock: stockPerVar }));
      }

      const finalVariantSum = finalVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      const computedStock = pIsVariable
        ? (finalVariants.length > 0
            ? (finalVariantSum > 0 ? finalVariantSum : Number(pStock))
            : Number(pStock))
        : Number(pStock);

      const computedMinPrice = pIsVariable && finalVariants.length > 0
        ? Math.min(...finalVariants.map(v => Number(v.price) || 0))
        : Number(pPrice);

      const payload = cleanFirestoreData({
        name: pName.trim(),
        price: computedMinPrice > 0 ? computedMinPrice : Number(pPrice),
        purchasePrice: Number(pPurchasePrice) > 0 ? Number(pPurchasePrice) : undefined,
        stock: computedStock,
        description: pDesc.trim(),
        category: pCategory,
        technicalSheet: pTechSheet.trim() || undefined,
        expiryDate: pExpiry || undefined,
        lowStockAlert: Number(pLowStock),
        discountPercent: Number(pDiscount),
        image: pImage || editingProduct?.image || `https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=300`,
        barcode: pBarcode.trim() || undefined,
        isRoutineClinic: pIsRoutineClinic,
        isVariable: pIsVariable,
        attributes: pIsVariable ? pAttributes : undefined,
        variants: pIsVariable ? finalVariants : undefined,
        ...(!editingProduct && { createdAt: new Date().toISOString() })
      });

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), payload);
        await logActivity(currentUser, 'update_product', 'product', pName, editingProduct.id);
        alert(lang === 'fr' ? 'Produit mis à jour !' : 'تم تحديث المنتج!', 'success');

        // Check if stock fell below threshold
        const threshold = payload.lowStockAlert;
        const oldThreshold = editingProduct.lowStockAlert ?? 5;
        const wasLow = editingProduct.stock <= oldThreshold;
        const isLow = payload.stock <= threshold;
        if (isLow && !wasLow) {
          await addDoc(collection(db, 'notifications'), {
            userId: 'admin',
            titleFr: 'Alerte Stock Bas !',
            titleAr: 'تنبيـه انخفاض المخزون!',
            messageFr: `Le produit "${payload.name}" est sous son seuil d'alerte. Stock actuel : ${payload.stock} (Seuil : ${threshold}).`,
            messageAr: `المنتج "${payload.name}" تحت حد التنبيه. المخزون الحالي: ${payload.stock} (الحد: ${threshold}).`,
            type: 'system',
            isRead: false,
            createdAt: new Date().toISOString()
          });
        }
      } else {
        const newRef = doc(collection(db, 'products'));
        await setDoc(newRef, cleanFirestoreData({
          ...payload,
          id: newRef.id
        }));

        const createdSnap = await getDoc(newRef);
        if (!createdSnap.exists()) {
          throw new Error('Product was not persisted to Firestore');
        }
        await logActivity(currentUser, 'create_product', 'product', pName, newRef.id);

        alert(lang === 'fr' ? 'Produit ajouté à la base de données !' : 'تم إضافة المنتج إلى قاعدة البيانات!', 'success');

        // Check if created with low stock
        const threshold = payload.lowStockAlert;
        if (payload.stock <= threshold) {
          await addDoc(collection(db, 'notifications'), {
            userId: 'admin',
            titleFr: 'Alerte Stock Bas !',
            titleAr: 'تنبيـه انخفاض المخزون!',
            messageFr: `Le produit "${payload.name}" a été créé sous son seuil d'alerte. Stock actuel : ${payload.stock} (Seuil : ${threshold}).`,
            messageAr: `تم إنشاء المنتج "${payload.name}" تحت حد التنبيه. المخزون الحالي: ${payload.stock} (الحد: ${threshold}).`,
            type: 'system',
            isRead: false,
            createdAt: new Date().toISOString()
          });
        }
      }

      setShowProductForm(false);
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de l\'enregistrement.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!(await confirm(
      lang === 'fr'
        ? `Supprimer "${product.name}" ? Cette action est irréversible.`
        : `حذف "${product.name}"؟ لا يمكن التراجع عن هذا الإجراء.`
    ))) return;

    setLoading(true);
    try {
      const deletedCount = await deleteProductFully(product);
      if (deletedCount === 0) {
        alert(lang === 'fr' ? 'Produit introuvable dans la base de données.' : 'المنتج غير موجود في قاعدة البيانات.', 'error');
        return;
      }
      await logActivity(currentUser, 'delete_product', 'product', `${product.name} (${deletedCount} doc(s))`, product.id);
      alert(
        lang === 'fr'
          ? `Produit supprimé de la base de données (${deletedCount} entrée(s)).`
          : `تم حذف المنتج من قاعدة البيانات (${deletedCount} سجل).`,
        'success'
      );
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء الحذف.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMultipleProducts = async () => {
    if (selectedProducts.size === 0) return;

    if (!(await confirm(
      lang === 'fr'
        ? `Supprimer ${selectedProducts.size} produit(s) ? Cette action est irréversible.`
        : `حذف ${selectedProducts.size} منتج(ات)؟ لا يمكن التراجع عن هذا الإجراء.`
    ))) return;

    setLoading(true);
    try {
      let deletedCount = 0;
      for (const productId of selectedProducts) {
        const product = productsList.find(p => p.id === productId);
        if (product) {
          const count = await deleteProductFully(product);
          deletedCount += count;
        }
      }
      await logActivity(currentUser, 'delete_products', 'product', `${selectedProducts.size} produits (${deletedCount} docs)`, Array.from(selectedProducts).join(','));
      alert(
        lang === 'fr'
          ? `${selectedProducts.size} produit(s) supprimé(s) de la base de données.`
          : `تم حذف ${selectedProducts.size} منتج(ات) من قاعدة البيانات.`,
        'success'
      );
      setSelectedProducts(new Set());
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء الحذف.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleAllProducts = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // --- 4. Special Custom Doctor Discounts ---
  const [selectedDoctorForDiscount, setSelectedDoctorForDiscount] = useState<UserProfile | null>(null);
  const [doctorDiscountPercent, setDoctorDiscountPercent] = useState<number>(0);
  const [doctorCommercial, setDoctorCommercial] = useState('');
  const [doctorAllowCredit, setDoctorAllowCredit] = useState<boolean>(true);

  const handleUpdateDoctorDiscount = async () => {
    if (!selectedDoctorForDiscount) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', selectedDoctorForDiscount.uid), {
        discountPercent: doctorDiscountPercent,
        commercialName: doctorCommercial.trim() || undefined,
        allowCreditPayment: doctorAllowCredit
      });
      alert(lang === 'fr' ? 'Remise, commercial et mode de paiement mis à jour !' : 'تم تطبيق التخفيض والمندوب وطريقة الدفع!', 'success');
      setSelectedDoctorForDiscount(null);
      setDoctorDiscountPercent(0);
      setDoctorCommercial('');
      setDoctorAllowCredit(true);
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert('Erreur.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDoctorCredit = async (doctor: UserProfile) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', doctor.uid), {
        allowCreditPayment: !doctor.allowCreditPayment
      });
      alert(
        lang === 'fr'
          ? `Mode de paiement mis à jour pour ${doctor.name}.`
          : `تم تحديث طريقة الدفع لـ ${doctor.name}.`,
        'success'
      );
      onRefreshData();
    } catch (err) {
      console.error(err);
      alert('Erreur.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Low Stock Warnings list
  const lowStockProducts = productsList.filter((p) => p.stock <= (p.lowStockAlert || 5));

  // Expiring soon Products list (within 90 days)
  const expiringProducts = productsList.filter((p) => {
    if (!p.expiryDate) return false;
    const expiry = new Date(p.expiryDate);
    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 90;
  });

  // --- 5. Shop Settings State ---
  const [shopForm, setShopForm] = useState<ShopInfo>(shopInfo);
  const [shopSaving, setShopSaving] = useState(false);
  const [yalidineConfig, setYalidineConfig] = useState<any>({
    enabled: false,
    apiKey: '',
    apiToken: '',
    senderName: 'JUST SMILE',
    senderPhone: '0770821021',
    senderAddress: 'Djelfa, Algérie',
    isSandbox: true,
  });

  useEffect(() => { setShopForm(shopInfo); }, [shopInfo]);

  useEffect(() => {
    async function loadYalidine() {
      const cfg = await getYalidineConfig();
      setYalidineConfig(cfg);
    }
    loadYalidine();
  }, []);

  useEffect(() => {
    if (!seedBarcode) return;
    setActiveSubTab('inventory');
    setEditingProduct(null);
    setPName('');
    setPPrice(0);
    setPStock(0);
    setPDesc('');
    setPCategory('Consommables');
    setPTechSheet('');
    setPExpiry('');
    setPLowStock(5);
    setPDiscount(0);
    setPImage('');
    setPBarcode(seedBarcode);
    setShowProductForm(true);
    onSeedBarcodeConsumed?.();
  }, [seedBarcode, onSeedBarcodeConsumed]);

  const handleSaveShopInfo = async () => {
    setShopSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'shop_info'), shopForm);
      onShopInfoChange(shopForm);
      await saveYalidineConfig(yalidineConfig);
      alert(lang === 'fr' ? 'Paramètres sauvegardés !' : 'تم حفظ الإعدادات!', 'success');
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la sauvegarde.', 'error');
    } finally {
      setShopSaving(false);
    }
  };

  return (
    <div className="space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* Sub Tabs Selection Navigation Bar */}
      <div className="flex border-b border-slate-100 bg-white p-2 rounded-2xl shadow-xs gap-1.5 overflow-x-auto shrink-0 scrollbar-hide">
        <button
          onClick={() => setActiveSubTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'orders'
              ? 'bg-brand-cyan text-white shadow-xs'
              : 'text-slate-500 hover:bg-slate-50'
            }`}
        >
          <ShoppingCart size={16} />
          {lang === 'fr' ? 'Commandes' : 'إدارة الطلبات'}
          {ordersList.filter(o => o.status === 'pending').length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
              {ordersList.filter(o => o.status === 'pending').length}
            </span>
          )}
        </button>

        {hasPermission(currentUser, 'view_analytics') && (
          <button onClick={() => setActiveSubTab('analytics')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'analytics' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <BarChart3 size={16} />{lang === 'fr' ? 'Analytics' : 'التحليلات'}
          </button>
        )}
        {hasPermission(currentUser, 'view_doctors') && (
          <button
            onClick={() => setActiveSubTab('doctors')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'doctors'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <Stethoscope size={16} />
            {getTranslation(lang, 'registeredDoctors')} ({allDoctors.length})
          </button>
        )}

        {hasPermission(currentUser, 'view_client_situation') && (
          <button
            onClick={() => setActiveSubTab('clientSituation')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'clientSituation'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <ClipboardList size={16} />
            {getTranslation(lang, 'clientSituation')}
          </button>
        )}

        {hasPermission(currentUser, 'manage_payments') && (
          <button
            onClick={() => setActiveSubTab('debts')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'debts'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <DollarSign size={16} />
            {lang === 'fr' ? 'Suivi des Dettes' : 'متابعة الديون والمدفوعات'}
          </button>
        )}

        {hasPermission(currentUser, 'manage_inventory') && (
          <button
            onClick={() => setActiveSubTab('inventory')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'inventory'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <Package size={16} />
            {getTranslation(lang, 'inventory')}
          </button>
        )}

        {hasPermission(currentUser, 'manage_promotions') && (
          <button onClick={() => setActiveSubTab('promotions')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'promotions' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Tag size={16} />{lang === 'fr' ? 'Promotions' : 'العروض'}
          </button>
        )}
        {hasPermission(currentUser, 'view_analytics') && (
          <button onClick={() => setActiveSubTab('catalog')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'catalog' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <FileText size={16} />{lang === 'fr' ? 'Catalogue' : 'كتالوج'}
          </button>
        )}
        {hasPermission(currentUser, 'view_analytics') && (
          <button onClick={() => setActiveSubTab('doctorsMap')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'doctorsMap' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <MapPin size={16} />{lang === 'fr' ? 'Carte Médecins' : 'خريطة الأطباء'}
          </button>
        )}
        {hasPermission(currentUser, 'view_expenses') && (
          <button onClick={() => setActiveSubTab('expenses')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'expenses' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Wallet size={16} />{lang === 'fr' ? 'Dépenses' : 'المصروفات'}
          </button>
        )}
        {hasPermission(currentUser, 'view_doctors') && (
          <button
            onClick={() => setActiveSubTab('discounts')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'discounts'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <Percent size={16} />
            {getTranslation(lang, 'doctorDiscounts')}
          </button>
        )}

        {hasPermission(currentUser, 'manage_staff') && (
          <button onClick={() => setActiveSubTab('staff')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'staff' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Shield size={16} />{lang === 'fr' ? 'Rôles' : 'الصلاحيات'}
          </button>
        )}
        {hasPermission(currentUser, 'view_activity_logs') && (
          <button onClick={() => setActiveSubTab('activityLogs')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'activityLogs' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <History size={16} />{lang === 'fr' ? 'Journal' : 'السجل'}
          </button>
        )}
        {hasPermission(currentUser, 'manage_backup') && (
          <button onClick={() => setActiveSubTab('backup')} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'backup' ? 'bg-brand-cyan text-white shadow-xs' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Cloud size={16} />{lang === 'fr' ? 'Backup' : 'نسخ احتياطي'}
          </button>
        )}
        {hasPermission(currentUser, 'manage_settings') && (
          <button
            onClick={() => setActiveSubTab('settings')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'settings'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <Settings size={16} />
            {lang === 'fr' ? 'Paramètres' : 'إعدادات المتجر'}
          </button>
        )}

        {currentUser.role === 'admin' && (
          <button
            onClick={() => setActiveSubTab('messages')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'messages'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <MessageSquare size={16} />
            {lang === 'fr' ? 'Messages' : 'الرسائل'}
            {adminMessagesList.filter(m => !m.isRead).length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {adminMessagesList.filter(m => !m.isRead).length}
              </span>
            )}
          </button>
        )}

        {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cashier') && (
          <button
            onClick={() => setActiveSubTab('announcements')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-extrabold rounded-xl transition-all whitespace-nowrap ${activeSubTab === 'announcements'
                ? 'bg-brand-cyan text-white shadow-xs'
                : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
            <Megaphone size={16} />
            {lang === 'fr' ? 'Publicités / Annonces' : 'إعلانات الواجهة'}
          </button>
        )}
      </div>

      {/* --- CONTENT RENDER PANELS --- */}

      {activeSubTab === 'orders' && (
        <div className="space-y-6">
          {/* Header & Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Total Commandes' : 'إجمالي الطلبات'}</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">{ordersList.length}</h3>
              </div>
              <div className="p-3 bg-cyan-50 text-brand-cyan rounded-xl">
                <ShoppingCart size={24} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-amber-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-600 font-bold uppercase">{lang === 'fr' ? 'En attente' : 'طلبات قيد الانتظار'}</p>
                <h3 className="text-2xl font-black text-amber-600 mt-1">
                  {ordersList.filter(o => o.status === 'pending').length}
                </h3>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-600 font-bold uppercase">{lang === 'fr' ? 'Confirmées / Livrées' : 'طلبات مؤكدة / مسلّمة'}</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-1">
                  {ordersList.filter(o => o.status === 'confirmed' || o.status === 'delivered').length}
                </h3>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <Check size={24} />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Chiffre d\'affaires' : 'إجمالي المبيعات'}</p>
                <h3 className="text-xl font-black text-brand-dark mt-1">
                  {formatPrice(ordersList.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalAfterDiscount, 0))}
                </h3>
              </div>
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                <DollarSign size={24} />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-100 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              {/* Search input */}
              <div className="relative flex-1 w-full">
                <Search size={18} className="absolute top-3.5 right-3.5 text-slate-400" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder={lang === 'fr' ? 'Rechercher par N° commande, nom médecin, téléphone, clinique...' : 'ابحث برقم الطلب، اسم الطبيب، العيادة، رقم الهاتف...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pr-10 pl-4 text-sm focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-hide shrink-0">
                {(['all', 'pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'] as const).map((st) => {
                  const labelMap: Record<string, { ar: string; fr: string }> = {
                    all: { ar: 'الكل', fr: 'Tous' },
                    pending: { ar: 'قيد الانتظار', fr: 'En attente' },
                    confirmed: { ar: 'مؤكد', fr: 'Confirmée' },
                    preparing: { ar: 'قيد التجهيز', fr: 'Préparation' },
                    shipped: { ar: 'تم الشحن', fr: 'Expédiée' },
                    delivered: { ar: 'تم التسليم', fr: 'Livrée' },
                    cancelled: { ar: 'ملغى', fr: 'Annulée' }
                  };
                  const count = st === 'all' ? ordersList.length : ordersList.filter(o => o.status === st).length;
                  const isAct = orderStatusFilter === st;

                  return (
                    <button
                      key={st}
                      onClick={() => setOrderStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        isAct
                          ? 'bg-brand-cyan text-white shadow-xs'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>{lang === 'fr' ? labelMap[st].fr : labelMap[st].ar}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isAct ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Orders List Table / Cards */}
            {(() => {
              const filtered = ordersList.filter((order) => {
                const query = orderSearchQuery.trim().toLowerCase();
                const matchesStatus = orderStatusFilter === 'all' || order.status === orderStatusFilter;
                if (!query) return matchesStatus;

                const searchTarget = `${order.id} ${order.doctorName} ${order.doctorClinic} ${order.doctorPhone} ${order.doctorWilayaName || ''}`.toLowerCase();
                return matchesStatus && searchTarget.includes(query);
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <ShoppingCart size={40} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold text-sm">
                      {lang === 'fr' ? 'Aucune commande trouvée' : 'لا توجد طلبات مطابقة للبحث'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4 pt-2">
                  {filtered.map((order) => {
                    const statusBadgeColors: Record<OrderStatus, string> = {
                      pending: 'bg-amber-100 text-amber-800 border-amber-200',
                      confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
                      preparing: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                      shipped: 'bg-purple-100 text-purple-800 border-purple-200',
                      delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      cancelled: 'bg-rose-100 text-rose-800 border-rose-200'
                    };

                    const statusLabels: Record<OrderStatus, { ar: string; fr: string }> = {
                      pending: { ar: 'قيد الانتظار', fr: 'En attente' },
                      confirmed: { ar: 'تم التأكيد', fr: 'Confirmée' },
                      preparing: { ar: 'قيد التجهيز', fr: 'En préparation' },
                      shipped: { ar: 'تم الشحن', fr: 'Expédiée' },
                      delivered: { ar: 'تم التسليم', fr: 'Livrée' },
                      cancelled: { ar: 'ملغى', fr: 'Annulée' }
                    };

                    const isUrgentEmergency = order.isEmergency && order.status !== 'delivered' && order.status !== 'cancelled';

                    return (
                      <div
                        key={order.id}
                        className={`bg-white p-5 rounded-2xl border transition-all ${
                          isUrgentEmergency
                            ? 'border-2 border-rose-500 shadow-xl ring-2 ring-rose-300 bg-rose-50/20'
                            : order.status === 'pending'
                            ? 'border-amber-200 shadow-md ring-1 ring-amber-100'
                            : 'border-slate-200 hover:border-brand-cyan/30'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                          {/* Doctor & Order Header Info */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {order.isEmergency && (
                                isUrgentEmergency ? (
                                  <span className="text-xs bg-rose-600 text-white font-black px-3 py-1 rounded-full animate-pulse shadow-md flex items-center gap-1">
                                    🚨 {lang === 'fr' ? 'URGENCE CABINET - PRIORITÉ' : 'طلب طوارئ عاجل للعيادة - أولوية قصوى!'}
                                  </span>
                                ) : (
                                  <span className="text-xs bg-emerald-600 text-white font-bold px-3 py-1 rounded-full shadow-xs flex items-center gap-1">
                                    ✓ {lang === 'fr' ? 'URGENCE LIVRÉE' : 'طلب طوارئ (تم التسليم)'}
                                  </span>
                                )
                              )}
                              <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-700">
                                #{order.id ? order.id.slice(-8).toUpperCase() : 'N/A'}
                              </span>
                              <h4 className="font-extrabold text-slate-900 text-base">{order.doctorName}</h4>
                              <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${statusBadgeColors[order.status]}`}>
                                {lang === 'fr' ? statusLabels[order.status].fr : statusLabels[order.status].ar}
                              </span>
                              {order.paymentMethod === 'credit' && (
                                <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                                  {lang === 'fr' ? 'Crédit (20j)' : 'دَين (20 يوم)'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                              <span>🏥 {order.doctorClinic}</span>
                              <span>📞 {order.doctorPhone}</span>
                              {order.doctorWilayaName && <span>📍 {order.doctorWilayaName} ({order.doctorCommuneName || ''})</span>}
                              <span>🕒 {new Date(order.createdAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}</span>
                            </div>
                          </div>

                          {/* Order Price summary */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-slate-400 font-semibold">{lang === 'fr' ? 'Montant Net' : 'الصافي للإجمالي'}</p>
                              <p className="text-lg font-black text-brand-dark">{formatPrice(order.totalAfterDiscount)}</p>
                              {order.remainingBalance > 0 && (
                                <p className="text-[11px] font-bold text-rose-500">
                                  {lang === 'fr' ? `Reste: ${formatPrice(order.remainingBalance)}` : `المتبقي: ${formatPrice(order.remainingBalance)}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Order Items Preview */}
                        <div className="py-3 border-b border-slate-100">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            {lang === 'fr' ? 'Articles' : 'المنتجات المطلوبة'} ({order.items.length}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {order.items.map((item, i) => (
                              <div key={i} className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 text-xs flex items-center gap-2">
                                <span className="font-bold text-slate-800">{item.name}</span>
                                {item.variantName && (
                                  <span className="bg-cyan-100 text-cyan-800 text-[10px] font-extrabold px-1.5 py-0.2 rounded-md">
                                    {item.variantName}
                                  </span>
                                )}
                                <span className="bg-brand-cyan/10 text-brand-cyan font-black px-1.5 py-0.2 rounded-md">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Order Actions Footer */}
                        <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                          {/* Status Updater Select */}
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">
                              {lang === 'fr' ? 'Changer statut:' : 'تغيير الحالة:'}
                            </label>
                            <select
                              value={order.status}
                              onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)}
                              disabled={loading}
                              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                            >
                              <option value="pending">قيد الانتظار (En attente)</option>
                              <option value="confirmed">تم التأكيد (Confirmée)</option>
                              <option value="preparing">قيد التجهيز (En préparation)</option>
                              <option value="shipped">تم الشحن (Expédiée)</option>
                              <option value="delivered">تم التسليم (Livrée)</option>
                              <option value="cancelled">ملغى (Annulée)</option>
                            </select>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                            <button
                              onClick={() => handleStartEditOrder(order)}
                              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Edit3 size={14} />
                              {lang === 'fr' ? 'Modifier' : 'تعديل الطلب'}
                            </button>

                            <button
                              onClick={() => setSelectedOrderForDetail(order)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Eye size={14} />
                              {lang === 'fr' ? 'Détails' : 'التفاصيل'}
                            </button>

                            <button
                              onClick={() => onPrintInvoice(order)}
                              className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-all flex items-center gap-1"
                            >
                              <Printer size={14} />
                              {lang === 'fr' ? 'Facture' : 'طباعة الفاتورة'}
                            </button>

                            {order.remainingBalance > 0 && (
                              <button
                                onClick={() => setSelectedOrderForPayment(order)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-1"
                              >
                                <DollarSign size={14} />
                                {lang === 'fr' ? 'Régler' : 'تسجيل دفعة'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Full Order Detail Modal */}
          {selectedOrderForDetail && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
                    <ShoppingCart className="text-brand-cyan" size={20} />
                    {lang === 'fr' ? `Détails de la commande #${selectedOrderForDetail.id.slice(-6).toUpperCase()}` : `تفاصيل الطلب رقم #${selectedOrderForDetail.id.slice(-6).toUpperCase()}`}
                  </h3>
                  <button
                    onClick={() => setSelectedOrderForDetail(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Doctor Info Card */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Praticien' : 'اسم الطبيب والعيادة'}</p>
                      <p className="font-extrabold text-slate-900 text-sm mt-0.5">{selectedOrderForDetail.doctorName}</p>
                      <p className="text-slate-600 font-medium">{selectedOrderForDetail.doctorClinic}</p>
                      <p className="text-slate-500 mt-1">📞 {selectedOrderForDetail.doctorPhone}</p>
                    </div>

                    <div>
                      <p className="text-slate-400 font-bold uppercase">{lang === 'fr' ? 'Livraison & Paiement' : 'معلومات الشحن والسداد'}</p>
                      <p className="text-slate-700 font-semibold mt-0.5">
                        📍 {selectedOrderForDetail.doctorWilayaName || ''} {selectedOrderForDetail.doctorCommuneName ? `(${selectedOrderForDetail.doctorCommuneName})` : ''}
                      </p>
                      <p className="text-slate-700 font-semibold">
                        💳 {selectedOrderForDetail.paymentMethod === 'credit' ? 'دَين مؤجل (20 يوم)' : 'دفع فوري عند الاستلام'}
                      </p>
                      <p className="text-slate-500 mt-1">
                        📅 {new Date(selectedOrderForDetail.createdAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
                      </p>
                    </div>
                  </div>

                  {/* Items List Table */}
                  <div className="space-y-3">
                    <h4 className="font-extrabold text-slate-800 text-sm">{lang === 'fr' ? 'Liste des produits' : 'قائمة المنتجات والكميات'}</h4>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
                      {selectedOrderForDetail.items.map((item, idx) => (
                        <div key={idx} className="p-3 bg-white flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-900">{item.name}</p>
                            {item.variantName && (
                              <p className="text-[11px] text-purple-600 font-semibold mt-0.5">
                                {lang === 'fr' ? `Option: ${item.variantName}` : `النوع: ${item.variantName}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-extrabold text-slate-800">{formatPrice(item.price)} x {item.quantity}</p>
                            <p className="font-black text-brand-dark">{formatPrice(item.price * item.quantity)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Summary */}
                  <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100 space-y-2 text-xs font-semibold text-slate-700">
                    <div className="flex justify-between">
                      <span>{lang === 'fr' ? 'Sous-total' : 'المجموع قبل التخفيض'}</span>
                      <span>{formatPrice(selectedOrderForDetail.totalBeforeDiscount)}</span>
                    </div>
                    {selectedOrderForDetail.discountAmount > 0 && (
                      <div className="flex justify-between text-rose-600 font-bold">
                        <span>{lang === 'fr' ? 'Remises' : 'مجموع التخفيضات'}</span>
                        <span>-{formatPrice(selectedOrderForDetail.discountAmount)}</span>
                      </div>
                    )}
                    {selectedOrderForDetail.deliveryCost !== undefined && selectedOrderForDetail.deliveryCost > 0 && (
                      <div className="flex justify-between">
                        <span>{lang === 'fr' ? 'Frais de livraison' : 'سعر التوصيل'}</span>
                        <span>+{formatPrice(selectedOrderForDetail.deliveryCost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-black text-slate-900 border-t border-purple-100 pt-2">
                      <span>{lang === 'fr' ? 'Net à payer' : 'إجمالي المظفي للطلب'}</span>
                      <span>{formatPrice(selectedOrderForDetail.totalAfterDiscount)}</span>
                    </div>
                  </div>

                  {selectedOrderForDetail.notes && (
                    <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-100 text-xs">
                      <p className="font-bold text-amber-800">{lang === 'fr' ? 'Notes du médecin:' : 'ملاحظات الطبيب:'}</p>
                      <p className="text-amber-900 mt-1 whitespace-pre-wrap">{selectedOrderForDetail.notes}</p>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => {
                      handleStartEditOrder(selectedOrderForDetail);
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5"
                  >
                    <Edit3 size={16} />
                    {lang === 'fr' ? 'Modifier la commande' : 'تعديل الطلب'}
                  </button>
                  <button
                    onClick={() => {
                      onPrintInvoice(selectedOrderForDetail);
                    }}
                    className="bg-brand-cyan text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-brand-cyan/90 transition-all flex items-center gap-1.5"
                  >
                    <Printer size={16} />
                    {lang === 'fr' ? 'Imprimer la facture' : 'طباعة الفاتورة'}
                  </button>
                  <button
                    onClick={() => setSelectedOrderForDetail(null)}
                    className="bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-300 transition-all"
                  >
                    {lang === 'fr' ? 'Fermer' : 'إغلاق'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit Order Modal */}
          {editingOrder && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]" dir={isRtl ? 'rtl' : 'ltr'}>
                {/* Header */}
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-base md:text-lg flex items-center gap-2">
                    <Edit3 className="text-amber-500" size={20} />
                    {lang === 'fr' ? `Modifier la commande #${editingOrder.id.slice(-6).toUpperCase()}` : `تعديل الطلب رقم #${editingOrder.id.slice(-6).toUpperCase()}`}
                  </h3>
                  <button
                    onClick={() => setEditingOrder(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                  {/* Doctor Summary */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-extrabold text-slate-900 text-sm">{editingOrder.doctorName}</p>
                      <p className="text-slate-500">{editingOrder.doctorClinic} • 📞 {editingOrder.doctorPhone}</p>
                    </div>
                  </div>

                  {/* 1. Payment Method Selection (Cash vs Credit) */}
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase text-slate-500 tracking-wider block">
                      💳 {lang === 'fr' ? 'Mode de paiement de la commande :' : 'طريقة دفع الفاتورة (نقداً أم دَين):'}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingPaymentMethod('cash')}
                        className={`p-4 rounded-2xl border text-right font-extrabold text-xs md:text-sm transition-all flex items-center justify-between ${
                          editingPaymentMethod === 'cash'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-200'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-black">{lang === 'fr' ? 'Paiement Comptant (Cash)' : 'دفع نقداً (دفع فوري)'}</p>
                          <p className="text-[11px] text-slate-500 font-normal mt-0.5">{lang === 'fr' ? 'Règlement direct lors de la livraison' : 'تسليم وتصفية الحساب كاش عند الاستلام'}</p>
                        </div>
                        <Check className={`shrink-0 ${editingPaymentMethod === 'cash' ? 'opacity-100 text-emerald-600' : 'opacity-0'}`} size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingPaymentMethod('credit')}
                        className={`p-4 rounded-2xl border text-right font-extrabold text-xs md:text-sm transition-all flex items-center justify-between ${
                          editingPaymentMethod === 'credit'
                            ? 'bg-purple-50 border-purple-500 text-purple-800 ring-2 ring-purple-200'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-black">{lang === 'fr' ? 'Paiement Crédit (Dette 15j)' : 'دفع كدين (مهلة 15 يوماً)'}</p>
                          <p className="text-[11px] text-slate-500 font-normal mt-0.5">{lang === 'fr' ? 'Compte débité pour le médecin' : 'إبقاء الفاتورة كدين على حساب الطبيب'}</p>
                        </div>
                        <Check className={`shrink-0 ${editingPaymentMethod === 'credit' ? 'opacity-100 text-purple-600' : 'opacity-0'}`} size={18} />
                      </button>
                    </div>
                  </div>

                  {/* 2. Product Items and Price Modifications */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-extrabold text-slate-800 text-xs md:text-sm uppercase tracking-wider">
                        📦 {lang === 'fr' ? 'Modification des prix & quantités :' : 'تعديل أسعار وكميات المنتجات المطلوبة:'}
                      </h4>
                      <span className="text-xs text-slate-400 font-medium">
                        {lang === 'fr' ? 'Vous pouvez augmenter, réduire ou laisser le prix d’origine.' : 'يمكنك رفع السعر، تخفيضه (عمل تخفيض)، أو إبقائه كما هو.'}
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                      {editingOrderItems.map((item, idx) => {
                        const originalProduct = productsList.find(p => p.id === item.productId);
                        const originalPrice = originalProduct?.price ?? item.price;
                        const subtotal = item.price * item.quantity;
                        const isDiscounted = item.price < originalPrice;
                        const isIncreased = item.price > originalPrice;

                        return (
                          <div key={idx} className="p-4 bg-white hover:bg-slate-50/50 transition-colors space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="space-y-0.5">
                                <p className="font-extrabold text-slate-900 text-xs md:text-sm">{item.name}</p>
                                {item.variantName && (
                                  <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-md inline-block">
                                    {item.variantName}
                                  </span>
                                )}
                                <p className="text-[11px] text-slate-400">
                                  {lang === 'fr' ? `Prix d'origine : ${formatPrice(originalPrice)}` : `السعر الأصلي للمنتج: ${formatPrice(originalPrice)}`}
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleRemoveItemFromEdit(idx)}
                                className="text-rose-500 hover:text-rose-700 text-xs font-bold self-start sm:self-center flex items-center gap-1 bg-rose-50 px-2.5 py-1 rounded-lg hover:bg-rose-100 transition-colors"
                              >
                                <Trash2 size={13} />
                                {lang === 'fr' ? 'Supprimer' : 'حذف المنتج'}
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                              {/* Price Edit Input */}
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                  {lang === 'fr' ? 'Prix unitaire (DA) :' : 'سعر المنتج المحسوب (دج):'}
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.price}
                                  onChange={(e) => handleItemPriceChange(idx, parseFloat(e.target.value) || 0)}
                                  className={`w-full bg-white border rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-900 focus:outline-hidden focus:ring-2 ${
                                    isDiscounted
                                      ? 'border-emerald-400 focus:ring-emerald-200 text-emerald-700'
                                      : isIncreased
                                      ? 'border-amber-400 focus:ring-amber-200 text-amber-700'
                                      : 'border-slate-300 focus:ring-brand-cyan/20'
                                  }`}
                                />
                                {isDiscounted && (
                                  <span className="text-[10px] font-bold text-emerald-600 mt-0.5 block">
                                    ↓ {lang === 'fr' ? 'Prix réduit (Remise)' : 'تخفيض خاص للزبون'} (-{formatPrice(originalPrice - item.price)})
                                  </span>
                                )}
                                {isIncreased && (
                                  <span className="text-[10px] font-bold text-amber-600 mt-0.5 block">
                                    ↑ {lang === 'fr' ? 'Prix augmenté' : 'سعر مرفوع للزبون'} (+{formatPrice(item.price - originalPrice)})
                                  </span>
                                )}
                              </div>

                              {/* Quantity Edit Input */}
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                                  {lang === 'fr' ? 'Quantité :' : 'الكمية المطلوبة:'}
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => handleItemQuantityChange(idx, parseInt(e.target.value) || 1)}
                                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                                />
                              </div>

                              {/* Item Subtotal Preview */}
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">{lang === 'fr' ? 'Sous-total' : 'إجمالي المادة'}</span>
                                <span className="text-sm font-black text-brand-dark">{formatPrice(subtotal)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Delivery Cost Edit */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                    <label className="text-xs font-extrabold text-slate-700 whitespace-nowrap">
                      🚚 {lang === 'fr' ? 'Frais de livraison (DA) :' : 'مصاريف / سعر التوصيل (دج):'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editingDeliveryCost}
                      onChange={(e) => setEditingDeliveryCost(parseFloat(e.target.value) || 0)}
                      className="w-36 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-extrabold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                    />
                  </div>

                  {/* 4. Live Total Recalculation Summary */}
                  {(() => {
                    const { totalBefore, delivery, netTotal, remaining } = calculateEditingTotals();
                    return (
                      <div className="bg-gradient-to-br from-brand-dark to-[#164e63] p-5 rounded-2xl text-white space-y-2 shadow-md">
                        <div className="flex justify-between text-xs text-slate-200">
                          <span>{lang === 'fr' ? 'Sous-total produits :' : 'مجموع المنتجات:'}</span>
                          <span className="font-bold">{formatPrice(totalBefore)}</span>
                        </div>
                        {delivery > 0 && (
                          <div className="flex justify-between text-xs text-slate-200">
                            <span>{lang === 'fr' ? 'Frais de livraison :' : 'مصاريف التوصيل:'}</span>
                            <span className="font-bold">+{formatPrice(delivery)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-base font-black border-t border-white/20 pt-2 text-white">
                          <span>{lang === 'fr' ? 'Nouveau Total Net :' : 'الصافي النهائي الجديد للطلب:'}</span>
                          <span className="text-brand-cyan">{formatPrice(netTotal)}</span>
                        </div>
                        {editingPaymentMethod === 'credit' && (
                          <div className="flex justify-between text-xs text-amber-300 font-bold pt-1">
                            <span>{lang === 'fr' ? 'Nouveau Solde Reste à Payer (Dette) :' : 'المبلغ المتبقي كدين على الطبيب:'}</span>
                            <span>{formatPrice(remaining)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Action Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveOrderEdit}
                    disabled={loading}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {lang === 'fr' ? 'Enregistrer les modifications' : 'حفظ التعديلات على الطلب'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'analytics' && hasPermission(currentUser, 'view_analytics') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <AnalyticsDashboard lang={lang} ordersList={ordersList} expensesList={expensesList} productsList={productsList} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'promotions' && hasPermission(currentUser, 'manage_promotions') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <PromotionManager lang={lang} promotions={promotionsList} productsList={productsList} currentUser={currentUser} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'catalog' && hasPermission(currentUser, 'view_analytics') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <CatalogGenerator products={productsList} lang={lang} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'doctorsMap' && hasPermission(currentUser, 'view_analytics') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <DoctorMap doctors={usersList.filter(u => u.role === 'doctor')} orders={ordersList} lang={lang} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'expenses' && hasPermission(currentUser, 'view_expenses') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <ExpenseManager lang={lang} expenses={expensesList} ordersList={ordersList} productsList={productsList} currentUser={currentUser} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'staff' && hasPermission(currentUser, 'manage_staff') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <StaffManager lang={lang} usersList={usersList} currentUser={currentUser} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'activityLogs' && hasPermission(currentUser, 'view_activity_logs') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <ActivityLogView lang={lang} logs={activityLogsList} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'backup' && hasPermission(currentUser, 'manage_backup') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <BackupManager lang={lang} currentUser={currentUser} />
          </Suspense>
        </div>
      )}

      {activeSubTab === 'announcements' && (currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cashier') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <AnnouncementsSection lang={lang} currentUser={currentUser} />
          </Suspense>
        </div>
      )}


      {/* 1b. All registered doctors */}
      {activeSubTab === 'doctors' && hasPermission(currentUser, 'view_doctors') && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
          <div className="border-b border-slate-50 pb-4">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Stethoscope size={20} className="text-brand-cyan" />
              {getTranslation(lang, 'registeredDoctors')}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {lang === 'fr'
                ? 'Liste complète des praticiens inscrits sur la plateforme (depuis Firestore).'
                : 'قائمة كاملة بالأطباء المسجلين على المنصة (من قاعدة البيانات).'}
            </p>
          </div>

          <input
            type="text"
            value={doctorSearchQuery}
            onChange={(e) => setDoctorSearchQuery(e.target.value)}
            placeholder={getTranslation(lang, 'clientSearchPlaceholder')}
            className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-hidden focus:border-brand-cyan font-medium text-slate-800"
          />

          {allDoctors.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-semibold text-sm">
              {lang === 'fr' ? 'Aucun praticien inscrit.' : 'لا يوجد أطباء مسجلون.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left md:rtl:text-right border-collapse text-sm min-w-[700px]">
                <thead>
                  <tr className="text-xs font-extrabold text-slate-400 uppercase border-b border-slate-100">
                    <th className="pb-3">{getTranslation(lang, 'name')}</th>
                    <th className="pb-3">{getTranslation(lang, 'clinicName')}</th>
                    <th className="pb-3">{getTranslation(lang, 'phone')}</th>
                    <th className="pb-3">{getTranslation(lang, 'email')}</th>
                    <th className="pb-3">{getTranslation(lang, 'location')}</th>
                    <th className="pb-3">{getTranslation(lang, 'status')}</th>
                    <th className="pb-3">{lang === 'fr' ? 'Paiement Crédit' : 'البيع بالدين'}</th>
                    <th className="pb-3">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allDoctors
                    .filter((d) => {
                      const q = doctorSearchQuery.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        d.name.toLowerCase().includes(q) ||
                        d.uid.toLowerCase().includes(q) ||
                        d.clinicName.toLowerCase().includes(q) ||
                        d.email.toLowerCase().includes(q)
                      );
                    })
                    .map((docProfile) => (
                      <tr key={docProfile.uid} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 font-bold text-slate-800">{docProfile.name}</td>
                        <td className="py-3 text-slate-600 text-xs">{docProfile.clinicName}</td>
                        <td className="py-3 text-slate-500 text-xs">{docProfile.phone}</td>
                        <td className="py-3 text-slate-500 text-xs">{docProfile.email}</td>
                        <td className="py-3 text-slate-500 text-xs">{docProfile.location}</td>
                        <td className="py-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600">
                            {lang === 'fr' ? 'Actif' : 'مفعّل'}
                          </span>
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => handleToggleDoctorCredit(docProfile)}
                            disabled={loading}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${docProfile.allowCreditPayment !== false
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                              }`}
                          >
                            {docProfile.allowCreditPayment !== false
                              ? (lang === 'fr' ? 'Activé' : 'مفعّل')
                              : (lang === 'fr' ? 'Désactivé' : 'معطّل')}
                          </button>
                        </td>
                        <td className="py-3 font-mono text-[10px] text-slate-400 max-w-[120px] truncate">
                          {docProfile.uid}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 1c. Client account statement */}
      {activeSubTab === 'clientSituation' && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs">
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <ClientSituationView
              lang={lang}
              usersList={usersList}
              ordersList={ordersList}
              paymentsList={paymentsList}
              returnsList={returnsList}
              onPrintInvoice={onPrintInvoice}
              currentUser={currentUser}
            />
          </Suspense>
        </div>
      )}

      {/* 2. Debts and payments Monitor */}
      {activeSubTab === 'debts' && (() => {
        const filteredOrders = ordersList.filter((order) => {
          // 1. Payment status filter
          if (orderPaymentFilter === 'unpaid' && order.remainingBalance <= 0) return false;
          if (orderPaymentFilter === 'paid' && order.remainingBalance > 0) return false;

          // 2. Search query filter (Doctor, Clinic, Order ID)
          if (orderSearchQuery) {
            const queryLower = orderSearchQuery.toLowerCase();
            const matchName = order.doctorName.toLowerCase().includes(queryLower);
            const matchClinic = order.doctorClinic.toLowerCase().includes(queryLower);
            const matchId = order.id.toLowerCase().includes(queryLower);
            return matchName || matchClinic || matchId;
          }

          return true;
        });

        return (
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6 animate-fade-in">
            <div className="border-b border-slate-50 pb-4">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <DollarSign size={20} className="text-brand-cyan" />
                {lang === 'fr' ? 'Suivi du Crédit et des Règlements' : 'متابعة الديون والتحصيلات'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {lang === 'fr'
                  ? 'Supervisez l\'état financier des praticiens et enregistrez les paiements partiels.'
                  : 'راقب المبالغ المتبقية على العيادات وسجل الدفعات المقبوضة.'}
              </p>
            </div>

            {/* Filter Bar with Search & Export to CSV */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/80">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-2xl">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder={lang === 'fr' ? 'Rechercher un médecin, clinique ou ID...' : 'بحث عن طبيب، عيادة، أو رقم الطلب...'}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3.5 text-sm focus:outline-hidden focus:border-brand-cyan placeholder:text-slate-400 font-medium text-slate-800"
                  />
                </div>

                <div className="flex bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setOrderPaymentFilter('all')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${orderPaymentFilter === 'all'
                        ? 'bg-brand-cyan text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    {lang === 'fr' ? 'Tous' : 'الكل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderPaymentFilter('unpaid')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${orderPaymentFilter === 'unpaid'
                        ? 'bg-brand-cyan text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    {lang === 'fr' ? 'Crédits' : 'الديون'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderPaymentFilter('paid')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${orderPaymentFilter === 'paid'
                        ? 'bg-brand-cyan text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    {lang === 'fr' ? 'Payés' : 'المسددة'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleExportCSV(filteredOrders)}
                disabled={filteredOrders.length === 0}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all shadow-sm cursor-pointer border border-emerald-700 shrink-0"
                title={lang === 'fr' ? 'Exporter au format CSV' : 'تصدير بصيغة CSV'}
              >
                <FileSpreadsheet size={16} />
                <span>{lang === 'fr' ? 'Exporter en CSV' : 'تصدير إلى CSV'}</span>
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-semibold text-sm bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                {lang === 'fr'
                  ? 'Aucune commande ne correspond à vos filtres.'
                  : 'لم يتم العثور على أي طلبات تطابق خيارات البحث.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left md:rtl:text-right border-collapse min-w-[700px]">
                  <thead>
                    <tr className="text-xs font-extrabold text-slate-400 uppercase border-b border-slate-100 pb-3">
                      <th className="pb-3">{lang === 'fr' ? 'Médecin / Cabinet' : 'الطبيب / العيادة'}</th>
                      <th className="pb-3">{getTranslation(lang, 'orderId')}</th>
                      <th className="pb-3">{getTranslation(lang, 'status')}</th>
                      <th className="pb-3">{getTranslation(lang, 'deadline')}</th>
                      <th className="pb-3">{getTranslation(lang, 'total')}</th>
                      <th className="pb-3">{getTranslation(lang, 'paidAmount')}</th>
                      <th className="pb-3">{getTranslation(lang, 'remainingBalance')}</th>
                      <th className="pb-3 text-right">{getTranslation(lang, 'actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {filteredOrders.map((order) => {
                      const isOverdue = order.paymentMethod !== 'cash' && new Date() > new Date(order.deadlineDate);
                      return (
                        <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4">
                            <p className="font-bold text-slate-900">{order.doctorName}</p>
                            <p className="text-xs text-slate-400">{order.doctorClinic}</p>
                          </td>
                          <td className="py-4">
                            <p className="font-mono font-bold">#{order.id ? order.id.slice(-6).toUpperCase() : 'UNKNOWN'}</p>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                              {order.paymentMethod === 'cash'
                                ? (lang === 'fr' ? 'Comptant (COD)' : 'نقدي عند الاستلام')
                                : (lang === 'fr' ? 'Crédit' : 'آجل (دين)')}
                            </p>
                          </td>
                          <td className="py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold tracking-wide uppercase ${order.status === 'delivered'
                                ? 'bg-emerald-50 text-emerald-600'
                                : order.status === 'cancelled'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-brand-cyan/10 text-brand-cyan'
                              }`}>
                              {getTranslation(lang, `status_${order.status}` as any)}
                            </span>
                            {order.cancelledByName && (
                              <p className="text-[10px] text-rose-500 mt-1">
                                {lang === 'fr' ? 'Annulé par' : 'ألغاه'}: {order.cancelledByName}
                              </p>
                            )}
                          </td>
                          <td className="py-4">
                            {order.paymentMethod === 'cash' ? (
                              <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg">
                                {lang === 'fr' ? 'À la livraison' : 'عند التوصيل'}
                              </span>
                            ) : (
                              <span className={`text-xs font-bold ${isOverdue ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg' : 'text-slate-600'}`}>
                                {new Date(order.deadlineDate).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
                                {isOverdue && ' (' + getTranslation(lang, 'overdueBadge') + ')'}
                              </span>
                            )}
                          </td>
                          <td className="py-4 font-extrabold">{formatPrice(order.totalAfterDiscount)}</td>
                          <td className="py-4 text-emerald-600 font-bold">{formatPrice(order.paidAmount)}</td>
                          <td className="py-4 text-rose-600 font-black">{formatPrice(order.remainingBalance)}</td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details + Yalidine button */}
                              <button
                                onClick={() => setSelectedOrderForDetail(order)}
                                className="p-1.5 text-slate-400 hover:text-brand-cyan hover:bg-brand-cyan/10 rounded-lg transition-colors"
                                title={lang === 'fr' ? 'Détails & Yalidine' : 'التفاصيل ويالدين'}
                              >
                                <Truck size={14} />
                              </button>
                              <button
                                onClick={() => onPrintInvoice(order)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title={lang === 'fr' ? 'Imprimer Facture' : 'طباعة الفاتورة'}
                              >
                                <FileText size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedOrderForEditPayment(order);
                                  setEditOrderPaidAmount(order.paidAmount || 0);
                                }}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title={lang === 'fr' ? 'Modifier le montant payé' : 'تعديل المبلغ المدفوع'}
                              >
                                <Pencil size={14} />
                              </button>
                              {order.remainingBalance > 0 ? (
                                <button
                                  onClick={() => setSelectedOrderForPayment(order)}
                                  className="bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan hover:text-white font-bold text-xs py-1.5 px-3 rounded-lg transition-all"
                                >
                                  {getTranslation(lang, 'registerPayment')}
                                </button>
                              ) : (
                                <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2.5 py-1 rounded-lg">
                                  {lang === 'fr' ? 'Payé' : 'مسدد'}
                                </span>
                              )}
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
        );
      })()}

      {/* 3. Product Inventory & Stock levels */}
      {activeSubTab === 'inventory' && (
        <div className="space-y-6">
          {/* Alerts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Low stock indicators */}
            <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl">
              <h4 className="font-extrabold text-amber-800 text-sm flex items-center gap-1.5 mb-2">
                <AlertTriangle size={16} />
                {getTranslation(lang, 'lowStock')} ({lowStockProducts.length})
              </h4>
              <p className="text-xs text-amber-700 leading-relaxed">
                {lang === 'fr'
                  ? 'Ces produits ont atteint ou dépassé le seuil minimum de stock.'
                  : 'لقد قاربت هذه المواد على النفاد وهي تحت حد التنبيه.'}
              </p>
              {lowStockProducts.length > 0 && (
                <div className="mt-3 max-h-24 overflow-y-auto space-y-1 text-xs">
                  {lowStockProducts.map((p) => (
                    <div key={p.id} className="flex justify-between text-amber-900 bg-white/70 p-1.5 rounded-lg border border-amber-100/50">
                      <span className="font-bold truncate max-w-[200px]">{p.name}</span>
                      <span className="font-black">Stock: {p.stock}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expiry alerts */}
            <div className="bg-rose-50/50 border border-rose-100 p-5 rounded-2xl">
              <h4 className="font-extrabold text-rose-800 text-sm flex items-center gap-1.5 mb-2">
                <Calendar size={16} />
                {getTranslation(lang, 'expiryAlerts')} ({expiringProducts.length})
              </h4>
              <p className="text-xs text-rose-700 leading-relaxed">
                {lang === 'fr'
                  ? 'Consommables ou produits de désinfection arrivant à expiration sous 90 jours.'
                  : 'مستلزمات ومواد تعقيم تنتهي صلاحيتها في غضون الـ 90 يومًا القادمة.'}
              </p>
              {expiringProducts.length > 0 && (
                <div className="mt-3 max-h-24 overflow-y-auto space-y-1 text-xs">
                  {expiringProducts.map((p) => (
                    <div key={p.id} className="flex justify-between text-rose-900 bg-white/70 p-1.5 rounded-lg border border-rose-100/50">
                      <span className="font-bold truncate max-w-[200px]">{p.name}</span>
                      <span className="font-black text-rose-600">{p.expiryDate}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Expiry Date Scanner & Warnings Utility */}
          <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
            <ExpiryScanner
              lang={lang}
              productsList={productsList}
              onRefreshData={onRefreshData}
            />
          </Suspense>

          {showImportModal && (
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={32} /></div>}>
              <ExcelImporter
                lang={lang}
                existingProducts={productsList}
                onImportComplete={onRefreshData}
                onClose={() => setShowImportModal(false)}
              />
            </Suspense>
          )}

          {/* Standard product inventory listing */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-50 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Package size={20} className="text-brand-cyan" />
                  {getTranslation(lang, 'inventory')}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2.5 items-center">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={lang === 'fr' ? 'Rechercher...' : 'بحث...'}
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-cyan/20 focus:border-brand-cyan w-48 md:w-64"
                  />
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-xs border border-slate-200"
                >
                  <FileSpreadsheet size={14} className="text-teal-600" />
                  {lang === 'fr' ? 'Importer Produits (Excel)' : 'استيراد منتجات (إكسل)'}
                </button>
                {selectedProducts.size > 0 && (
                  <button
                    onClick={handleDeleteMultipleProducts}
                    disabled={loading}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {lang === 'fr' ? `Supprimer (${selectedProducts.size})` : `حذف (${selectedProducts.size})`}
                  </button>
                )}
                <button
                  onClick={() => handleOpenProductForm()}
                  className="bg-brand-cyan text-white font-bold text-xs py-2 px-3.5 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center gap-1.5 shadow-xs"
                >
                  <Plus size={14} />
                  {getTranslation(lang, 'addNewProduct')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left md:rtl:text-right border-collapse text-sm min-w-[650px]">
                <thead>
                  <tr className="text-xs font-extrabold text-slate-400 uppercase border-b border-slate-100 pb-3">
                    <th className="pb-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleAllProducts}
                        className="w-4 h-4 rounded border-slate-300 text-brand-cyan focus:ring-brand-cyan"
                      />
                    </th>
                    <th className="pb-3">{lang === 'fr' ? 'Produit' : 'المنتج'}</th>
                    <th className="pb-3">{getTranslation(lang, 'categories')}</th>
                    <th className="pb-3">{lang === 'fr' ? 'Prix Brut' : 'السعر الإجمالي'}</th>
                    <th className="pb-3">{lang === 'fr' ? 'Remise' : 'تخفيض'}</th>
                    <th className="pb-3">{lang === 'fr' ? 'Marge' : 'الفائدة'}</th>
                    <th className="pb-3">Stock</th>
                    <th className="pb-3">{getTranslation(lang, 'expiryDate')}</th>
                    <th className="pb-3 text-right">{getTranslation(lang, 'actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredProducts.map((p) => {
                    const isLow = p.stock <= (p.lowStockAlert || 5);
                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/50 transition-colors ${selectedProducts.has(p.id) ? 'bg-brand-cyan/5' : ''}`}>
                        <td className="py-3">
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(p.id)}
                            onChange={() => toggleProductSelection(p.id)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-cyan focus:ring-brand-cyan"
                          />
                        </td>
                        <td className="py-3 font-bold text-slate-800">{p.name}</td>
                        <td className="py-3 text-slate-500 text-xs font-bold">{p.category}</td>
                        <td className="py-3 font-extrabold">{p.price > 0 ? formatPrice(p.price) : '-'}</td>
                        <td className="py-3 text-rose-500 font-bold">
                          {p.discountPercent && p.discountPercent > 0 ? `-${p.discountPercent}%` : '-'}
                        </td>
                        <td className="py-3">
                          {(p as any).purchasePrice && (p as any).purchasePrice > 0 ? (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                              p.price > (p as any).purchasePrice
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-rose-600 bg-rose-50'
                            }`}>
                              {p.price > (p as any).purchasePrice
                                ? `+${Math.round(((p.price - (p as any).purchasePrice) / (p as any).purchasePrice) * 100)}%`
                                : `-${Math.round((((p as any).purchasePrice - p.price) / (p as any).purchasePrice) * 100)}%`}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickStockUpdate(p, -1)}
                              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-600 font-extrabold flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
                              title={lang === 'fr' ? 'Diminuer stock (-1)' : 'إنقاص المخزون (-1)'}
                            >
                              -
                            </button>
                            <span className={`font-black text-xs px-1 ${isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                              {p.stock}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQuickStockUpdate(p, 1)}
                              className="w-6 h-6 rounded-md bg-slate-100 hover:bg-emerald-100 hover:text-emerald-600 text-slate-600 font-extrabold flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
                              title={lang === 'fr' ? 'Augmenter stock (+1)' : 'زيادة المخزون (+1)'}
                            >
                              +
                            </button>
                            {p.isVariable && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.2 rounded-md">
                                {p.variants?.length || 0} variants
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-xs text-slate-500">{p.expiryDate || '-'}</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onPrintBarcode?.(p)}
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              title={lang === 'fr' ? 'Imprimer le code-barres' : 'طباعة الباركود'}
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              onClick={() => handleOpenProductForm(p)}
                              className="p-1.5 text-slate-400 hover:text-brand-cyan hover:bg-brand-cyan/5 rounded-lg transition-colors"
                              title={lang === 'fr' ? 'Modifier' : 'تعديل'}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p)}
                              disabled={loading}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                              title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Special doctor discounts */}
      {activeSubTab === 'discounts' && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
          <div className="border-b border-slate-50 pb-4">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Percent size={20} className="text-brand-cyan" />
              {getTranslation(lang, 'doctorDiscounts')}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {lang === 'fr'
                ? 'Attribuez des remises fidélité uniques applicables sur l\'ensemble des commandes de certains médecins.'
                : 'حدد نسب تخفيض دائمة لبعض الأطباء تطبق تلقائياً على فواتيرهم.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* List of Doctors with their discount settings */}
            <div className="space-y-4">
              <h4 className="font-extrabold text-slate-700 text-xs uppercase tracking-wider">
                {lang === 'fr' ? 'Remises par médecin' : 'نسب التخفيض المعتمدة للأطباء'}
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden max-h-96 overflow-y-auto bg-slate-50/35">
                {approvedDoctors.map((docProfile) => (
                  <div key={docProfile.uid} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{docProfile.name}</p>
                      <p className="text-xs text-slate-400">{docProfile.clinicName} • {docProfile.location}</p>
                      {docProfile.commercialName && (
                        <p className="text-xs text-brand-cyan font-bold mt-0.5">Commercial: {docProfile.commercialName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black bg-rose-50 text-rose-600 px-2 py-1 rounded-lg">
                        {docProfile.discountPercent ? `${docProfile.discountPercent}%` : '0%'}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedDoctorForDiscount(docProfile);
                          setDoctorDiscountPercent(docProfile.discountPercent || 0);
                          setDoctorCommercial(docProfile.commercialName || '');
                          setDoctorAllowCredit(docProfile.allowCreditPayment ?? true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-brand-cyan hover:bg-brand-cyan/5 rounded-lg transition-colors"
                      >
                        <Edit3 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Discount + Commercial Form Editor */}
            {selectedDoctorForDiscount && (
              <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 space-y-4">
                <h4 className="font-bold text-slate-900 text-base">
                  {lang === 'fr' ? 'Modifier' : 'تعديل'} – {selectedDoctorForDiscount.name}
                </h4>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Remise globale (%)' : 'نسبة التخفيض (%)'}</label>
                  <input
                    type="number" min="0" max="100"
                    value={doctorDiscountPercent}
                    onChange={(e) => setDoctorDiscountPercent(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Commercial assigné' : 'المندوب التجاري'}</label>
                  <input
                    type="text"
                    placeholder={lang === 'fr' ? 'Ex: Karim, Sofiane...' : 'مثال: كريم، صوفيان...'}
                    value={doctorCommercial}
                    onChange={(e) => setDoctorCommercial(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>

                {/* Credit Payment Toggle */}
                <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl">
                  <div>
                    <p className="text-sm font-bold text-slate-700">{lang === 'fr' ? 'Autoriser le crédit (15 jours)' : 'السماح بالدفع الآجل (15 يوم)'}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{lang === 'fr' ? 'Actif = paiement à crédit autorisé' : 'مفعل = يُسمح بالدفع الآجل'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDoctorAllowCredit(prev => !prev)}
                    className={`w-12 h-6 rounded-full transition-all relative shrink-0 ${
                      doctorAllowCredit ? 'bg-brand-cyan' : 'bg-slate-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${
                      doctorAllowCredit ? 'right-1' : 'left-1'
                    }`} />
                  </button>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleUpdateDoctorDiscount}
                    className="flex-1 bg-brand-cyan text-white font-bold text-xs py-3 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Check size={14} />
                    {getTranslation(lang, 'submit')}
                  </button>
                  <button
                    onClick={() => { setSelectedDoctorForDiscount(null); setDoctorDiscountPercent(0); setDoctorCommercial(''); setDoctorAllowCredit(true); }}
                    className="bg-white text-slate-500 border border-slate-200 text-xs font-bold py-3 px-4 rounded-xl hover:bg-slate-50 transition-all"
                  >
                    {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- DIALOGS & OVERLAYS --- */}

      {/* 5. Shop Settings Panel */}
      {activeSubTab === 'settings' && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
          <div className="border-b border-slate-50 pb-4">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Settings size={20} className="text-brand-cyan" />
              {lang === 'fr' ? 'Paramètres de la Boutique' : 'إعدادات المتجر والفاتورة'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {lang === 'fr' ? 'Ces informations apparaissent sur toutes vos factures imprimées.' : 'هذه المعلومات تظهر على جميع فواتيرك المطبوعة.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'companyName', label: lang === 'fr' ? 'Nom de la Société' : 'اسم الشركة', placeholder: 'JUST SMILE' },
              { key: 'activity', label: lang === 'fr' ? 'Activité / Secteur' : 'النشاط التجاري', placeholder: 'Vente de consommables et matériel dentaire' },
              { key: 'phone', label: lang === 'fr' ? 'Téléphone' : 'رقم الهاتف', placeholder: '0770821021 / 0780212989' },
              { key: 'email', label: 'Email', placeholder: 'justsmile0169@gmail.com' },
              { key: 'address', label: lang === 'fr' ? 'Adresse Complète' : 'العنوان الكامل', placeholder: 'Algeria, Djelfa' },
              { key: 'nrc', label: 'NRC (Registre du Commerce)', placeholder: '16/00-098544B' },
              { key: 'nif', label: 'NIF (Identifiant Fiscal)', placeholder: '001916019028835' },
              { key: 'nis', label: 'NIS (Numéro Identification Stat.)', placeholder: '00195614098835' },
              { key: 'logoUrl', label: lang === 'fr' ? 'URL du Logo (facultatif)' : 'رابط الشعار (اختياري)', placeholder: '/logo.png' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{label}</label>
                <input
                  type="text"
                  value={(shopForm as any)[key] ?? ''}
                  onChange={(e) => setShopForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800 placeholder:text-slate-300"
                />
              </div>
            ))}

            <div className="space-y-1">
              <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Taux TVA (%)' : 'نسبة الضريبة TVA (%)'}</label>
              <input
                type="number" min="0" max="100"
                value={shopForm.tvaRate ?? 19}
                onChange={(e) => setShopForm(prev => ({ ...prev, tvaRate: Number(e.target.value) }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800"
              />
            </div>
          </div>

          {/* Logo Preview */}
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <img src={getLogoUrl(shopForm.logoUrl)} alt="Logo preview" className="h-16 w-auto max-w-[120px] object-contain rounded-xl border border-slate-200 bg-white p-1" />
            <div>
              <p className="text-xs font-bold text-slate-700">{lang === 'fr' ? 'Aperçu du Logo' : 'معاينة الشعار'}</p>
              <p className="text-xs text-slate-400 mt-0.5">{lang === 'fr' ? 'Visible sur le site, le pied de page et les factures.' : 'يظهر في الموقع والفوتر والفواتير.'}</p>
            </div>
          </div>

          {/* Yalidine Express Integration */}
          <div className="border-t border-slate-100 pt-6 mt-6 space-y-6">
            <div>
              <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Truck size={18} className="text-brand-cyan" />
                {lang === 'fr' ? 'Intégration Yalidine Express' : 'ربط شركة التوصيل يالدين إكسبريس (Yalidine)'}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {lang === 'fr'
                  ? 'Connectez directement votre boutique à Yalidine Express pour générer automatiquement les colis, le suivi et imprimer les bordereaux.'
                  : 'اربط متجرك مباشرة بـ Yalidine لإنشاء الطرود تلقائياً وتتبع الشحنات وطباعة ملصقات الشحن.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    {lang === 'fr' ? 'Activer la connexion Yalidine' : 'تفعيل ربط شركة يالدين'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'fr' ? 'Activer la synchronisation automatique.' : 'تفعيل إرسال الطلبات لشركة الشحن.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setYalidineConfig((prev: any) => ({ ...prev, enabled: !prev.enabled }))}
                  className={`w-11 h-6 rounded-full transition-all relative ${yalidineConfig.enabled ? 'bg-brand-cyan' : 'bg-slate-200'
                    }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${yalidineConfig.enabled ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    {lang === 'fr' ? 'Mode Simulation / Sandbox' : 'وضع المحاكاة (Sandbox)'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {lang === 'fr' ? 'Simule les appels API sans envoyer de colis réels.' : 'محاكاة الطلبات والعمليات دون إرسال شحنات حقيقية.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setYalidineConfig((prev: any) => ({ ...prev, isSandbox: !prev.isSandbox }))}
                  className={`w-11 h-6 rounded-full transition-all relative ${yalidineConfig.isSandbox ? 'bg-amber-500' : 'bg-slate-200'
                    }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${yalidineConfig.isSandbox ? (isRtl ? 'left-1' : 'right-1') : (isRtl ? 'right-1' : 'left-1')
                      }`}
                  />
                </button>
              </div>
            </div>

            {yalidineConfig.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-100 p-4 rounded-2xl bg-slate-50/20">
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">API Key</label>
                  <input
                    type="text"
                    value={yalidineConfig.apiKey || ''}
                    onChange={(e) => setYalidineConfig((prev: any) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="Ex: 87192837198273928172"
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">API Token</label>
                  <input
                    type="password"
                    value={yalidineConfig.apiToken || ''}
                    onChange={(e) => setYalidineConfig((prev: any) => ({ ...prev, apiToken: e.target.value }))}
                    placeholder="••••••••••••••••"
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">
                    {lang === 'fr' ? 'Nom de l\'Expéditeur' : 'اسم المرسل'}
                  </label>
                  <input
                    type="text"
                    value={yalidineConfig.senderName || ''}
                    onChange={(e) => setYalidineConfig((prev: any) => ({ ...prev, senderName: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">
                    {lang === 'fr' ? 'Téléphone de l\'Expéditeur' : 'هاتف المرسل'}
                  </label>
                  <input
                    type="text"
                    value={yalidineConfig.senderPhone || ''}
                    onChange={(e) => setYalidineConfig((prev: any) => ({ ...prev, senderPhone: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-slate-500 font-bold text-xs">
                    {lang === 'fr' ? 'Adresse de l\'Expéditeur' : 'عنوان المرسل'}
                  </label>
                  <input
                    type="text"
                    value={yalidineConfig.senderAddress || ''}
                    onChange={(e) => setYalidineConfig((prev: any) => ({ ...prev, senderAddress: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-3 px-4 focus:outline-none focus:border-brand-cyan text-sm text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveShopInfo}
              disabled={shopSaving}
              className="flex items-center gap-2 bg-brand-cyan text-white font-bold px-6 py-3 rounded-xl hover:bg-brand-cyan/90 transition-all shadow-xs disabled:opacity-50"
            >
              {shopSaving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save size={16} />}
              {lang === 'fr' ? 'Sauvegarder les Paramètres' : 'حفظ الإعدادات'}
            </button>
          </div>
        </div>
      )}

      {/* Register Payment Modal Dialogue */}

      {selectedOrderForPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRegisterPayment}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="font-extrabold text-slate-800 text-base">
                {getTranslation(lang, 'registerPayment')}
              </span>
              <button
                type="button"
                onClick={() => setSelectedOrderForPayment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-1">
                <p><strong>Commande:</strong> #{selectedOrderForPayment.id ? selectedOrderForPayment.id.slice(-6).toUpperCase() : 'UNKNOWN'}</p>
                <p><strong>Médecin:</strong> {selectedOrderForPayment.doctorName}</p>
                <p><strong>Total Facture:</strong> {formatPrice(selectedOrderForPayment.totalAfterDiscount)}</p>
                <p><strong>Montant déjà payé:</strong> {formatPrice(selectedOrderForPayment.paidAmount)}</p>
                <p className="text-red-600 font-extrabold"><strong>Reste à régler:</strong> {formatPrice(selectedOrderForPayment.remainingBalance)}</p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Montant reçu (DA)' : 'المبلغ المقبوض (دج)'}</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedOrderForPayment.remainingBalance}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan font-extrabold text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Notes / Justificatif' : 'ملاحظات / رقم الإيصال'}</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Versement CCP / Cash au livreur..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand-cyan text-white font-bold text-xs py-3 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  getTranslation(lang, 'submit')
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Order Paid Amount Modal (Debts Monitor) */}
      {selectedOrderForEditPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveOrderPaymentFromDebts}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-fade-in"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-emerald-600" />
                <span className="font-extrabold text-slate-800 text-base">
                  {lang === 'fr' ? 'Modifier le montant payé' : 'تعديل المبلغ المدفوع للطلب'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForEditPayment(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'N° Commande :' : 'رقم الطلب :'}</span>
                  <span className="font-mono font-bold text-slate-800">
                    #{selectedOrderForEditPayment.id ? selectedOrderForEditPayment.id.slice(-6).toUpperCase() : 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Médecin :' : 'الطبيب :'}</span>
                  <span className="font-bold text-slate-800">{selectedOrderForEditPayment.doctorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Total Facture :' : 'إجمالي الفاتورة :'}</span>
                  <span className="font-extrabold text-slate-900">{formatPrice(selectedOrderForEditPayment.totalAfterDiscount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Payé actuellement :' : 'المدفوع حالياً :'}</span>
                  <span className="font-bold text-emerald-600">{formatPrice(selectedOrderForEditPayment.paidAmount)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-700 text-xs">
                  {lang === 'fr' ? 'Nouveau montant payé (DA) *' : 'المبلغ المدفوع الجديد (دج) *'}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={editOrderPaidAmount}
                  onChange={(e) => setEditOrderPaidAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-base font-extrabold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                💡 {lang === 'ar'
                  ? 'سيتم خصم هذا المبلغ من إجمالي الطلب، وإعادة حساب الدين المتبقي وتغيير حالة الفاتورة تلقائياً.'
                  : 'Le reste à payer et le statut de paiement seront automatiquement mis à jour.'}
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedOrderForEditPayment(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                type="submit"
                disabled={savingEditOrderPayment}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Pencil size={16} />
                {savingEditOrderPayment
                  ? (lang === 'fr' ? 'Enregistrement...' : 'جاري الحفظ...')
                  : (lang === 'fr' ? 'Valider la modification' : 'تأكيد الحفظ')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Order Edit Modal Overlay */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8 animate-fade-in">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Edit3 size={18} className="text-amber-600" />
                <span className="font-extrabold text-slate-800 text-base">
                  {lang === 'fr'
                    ? `Modifier Commande #${editingOrder.id ? editingOrder.id.slice(-6).toUpperCase() : 'UNKNOWN'}`
                    : `تعديل الطلب #${editingOrder.id ? editingOrder.id.slice(-6).toUpperCase() : 'UNKNOWN'}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs max-h-[70vh] overflow-y-auto">
              {/* Doctor info summary */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800 text-sm">{editingOrder.doctorName}</p>
                  <p className="text-slate-500 text-xs">{editingOrder.doctorClinic} • {editingOrder.doctorPhone}</p>
                </div>
                <span className="bg-slate-200 text-slate-700 font-extrabold text-[10px] px-2.5 py-1 rounded-lg">
                  #{editingOrder.id ? editingOrder.id.slice(-6).toUpperCase() : ''}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <label className="font-extrabold text-slate-700 text-xs uppercase block">
                  {lang === 'fr' ? 'Produits de la commande' : 'منتجات الطلب'}
                </label>
                <div className="space-y-2">
                  {editingOrderItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex-1">
                        <p className="font-bold text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.category}</p>
                      </div>
                      <div className="w-24">
                        <label className="text-[9px] font-bold text-slate-400 block">{lang === 'fr' ? 'Prix (DA)' : 'السعر (دج)'}</label>
                        <input
                          type="number"
                          min="0"
                          value={item.price}
                          onChange={(e) => handleItemPriceChange(idx, Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-800 text-xs"
                        />
                      </div>
                      <div className="w-16">
                        <label className="text-[9px] font-bold text-slate-400 block">{lang === 'fr' ? 'Qté' : 'الكمية'}</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemQuantityChange(idx, Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-800 text-xs text-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItemFromEdit(idx)}
                        className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg mt-3"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery cost & Payment Method & Paid Amount */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="font-extrabold text-slate-700 text-xs">
                    {lang === 'fr' ? 'Frais de livraison (DA)' : 'تكلفة التوصيل (دج)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingDeliveryCost}
                    onChange={(e) => setEditingDeliveryCost(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-extrabold text-slate-700 text-xs">
                    {lang === 'fr' ? 'Montant Payé (DA)' : 'المبلغ المدفوع (دج)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingOrderPaidAmount}
                    onChange={(e) => setEditingOrderPaidAmount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-extrabold text-emerald-600 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-extrabold text-slate-700 text-xs">
                    {lang === 'fr' ? 'Mode de paiement' : 'طريقة الدفع'}
                  </label>
                  <select
                    value={editingPaymentMethod}
                    onChange={(e) => setEditingPaymentMethod(e.target.value as 'cash' | 'credit')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                  >
                    <option value="credit">{lang === 'fr' ? 'Crédit (Dette 20j)' : 'آجل (دين 20 يوم)'}</option>
                    <option value="cash">{lang === 'fr' ? 'Comptant / Cash' : 'نقداً عند التسليم'}</option>
                  </select>
                </div>
              </div>

              {/* Totals Preview */}
              {(() => {
                const totals = calculateEditingTotals();
                return (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5 font-bold">
                    <div className="flex justify-between text-slate-600">
                      <span>{lang === 'fr' ? 'Sous-total :' : 'المجموع الفرعي :'}</span>
                      <span>{formatPrice(totals.totalBefore)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>{lang === 'fr' ? 'Livraison :' : 'التوصيل :'}</span>
                      <span>+{formatPrice(totals.delivery)}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-extrabold text-sm border-t border-slate-200 pt-1.5">
                      <span>{lang === 'fr' ? 'Nouveau Net :' : 'الصافي الجديد :'}</span>
                      <span>{formatPrice(totals.netTotal)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>{lang === 'fr' ? 'Montant payé :' : 'المبلغ المدفوع :'}</span>
                      <span>{formatPrice(totals.paid)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600 font-extrabold">
                      <span>{lang === 'fr' ? 'Reste à payer :' : 'المتبقي (الدين) :'}</span>
                      <span>{formatPrice(totals.remaining)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveOrderEdit}
                className="px-5 py-2 bg-brand-cyan hover:bg-brand-cyan/90 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Save size={16} />
                {loading
                  ? (lang === 'fr' ? 'Enregistrement...' : 'جاري الحفظ...')
                  : (lang === 'fr' ? 'Enregistrer les modifications' : 'حفظ التعديلات')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Details & Yalidine express Modal */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-slate-800 text-base">
                  {lang === 'fr' ? `Détails Commande #${selectedOrderForDetail.id ? selectedOrderForDetail.id.slice(-6).toUpperCase() : 'UNKNOWN'}` : `تفاصيل الطلب #${selectedOrderForDetail.id ? selectedOrderForDetail.id.slice(-6).toUpperCase() : 'UNKNOWN'}`}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg uppercase ${selectedOrderForDetail.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                    selectedOrderForDetail.status === 'cancelled' ? 'bg-rose-100 text-rose-800' :
                      selectedOrderForDetail.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                        selectedOrderForDetail.status === 'preparing' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-800'
                  }`}>
                  {selectedOrderForDetail.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left side: Items & Financial Summary */}
                <div className="lg:col-span-2 space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    {lang === 'fr' ? 'Articles commandés' : 'المنتجات المطلوبة'}
                  </h4>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-left md:rtl:text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 border-b border-slate-100">
                          <th className="p-3">{lang === 'fr' ? 'Désignation' : 'المنتج'}</th>
                          <th className="p-3 text-center">{lang === 'fr' ? 'Prix' : 'السعر'}</th>
                          <th className="p-3 text-center">{lang === 'fr' ? 'Qté' : 'الكمية'}</th>
                          <th className="p-3 text-right">{lang === 'fr' ? 'Total' : 'المجموع'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs">
                        {selectedOrderForDetail.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 font-semibold text-slate-800">{item.name}</td>
                            <td className="p-3 text-center text-slate-500">{formatPrice(item.price)}</td>
                            <td className="p-3 text-center font-bold text-slate-700">{item.quantity}</td>
                            <td className="p-3 text-right font-bold text-slate-800">{formatPrice(item.price * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial breakdown */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-2">
                    <div className="flex justify-between text-slate-600">
                      <span>{lang === 'fr' ? 'Sous-total brut' : 'المجموع الإجمالي'}</span>
                      <span className="font-semibold">{formatPrice(selectedOrderForDetail.totalBeforeDiscount)}</span>
                    </div>
                    {selectedOrderForDetail.discountAmount > 0 && (
                      <div className="flex justify-between text-rose-500 font-semibold">
                        <span>{lang === 'fr' ? 'Remises appliquées' : 'التخفيضات المطبقة'}</span>
                        <span>-{formatPrice(selectedOrderForDetail.discountAmount)}</span>
                      </div>
                    )}
                    {selectedOrderForDetail.deliveryCost !== undefined && (
                      <div className="flex justify-between text-slate-600 font-semibold">
                        <span>{lang === 'fr' ? 'Frais de livraison' : 'تكلفة التوصيل'}</span>
                        <span>+{formatPrice(selectedOrderForDetail.deliveryCost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200/60 pt-2 font-black text-slate-800 text-sm">
                      <span>{lang === 'fr' ? 'Net à payer' : 'الصافي المطلوب'}</span>
                      <span>{formatPrice(selectedOrderForDetail.totalAfterDiscount)}</span>
                    </div>
                  </div>
                </div>

                {/* Right side: Doctor, Delivery Address & Yalidine Action */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                      {lang === 'fr' ? 'Destinataire / Cabinet' : 'معلومات المستلم والعيادة'}
                    </h4>
                    <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 text-xs space-y-2">
                      <p className="text-slate-800"><strong className="text-slate-500">{lang === 'fr' ? 'Nom :' : 'الاسم:'}</strong> {selectedOrderForDetail.doctorName}</p>
                      <p className="text-slate-800"><strong className="text-slate-500">{lang === 'fr' ? 'Téléphone :' : 'الهاتف:'}</strong> {selectedOrderForDetail.doctorPhone}</p>
                      <p className="text-slate-800"><strong className="text-slate-500">{lang === 'fr' ? 'Clinique :' : 'العيادة:'}</strong> {selectedOrderForDetail.doctorClinic}</p>
                      {selectedOrderForDetail.doctorWilayaName && (
                        <p className="text-slate-800">
                          <strong className="text-slate-500">{lang === 'fr' ? 'Adresse :' : 'العنوان:'}</strong> {selectedOrderForDetail.doctorWilayaName} - {selectedOrderForDetail.doctorCommuneName}
                        </p>
                      )}
                      {selectedOrderForDetail.deliveryType && (
                        <p className="text-slate-800">
                          <strong className="text-slate-500">{lang === 'fr' ? 'Type Livraison :' : 'نوع التوصيل:'}</strong>{' '}
                          {selectedOrderForDetail.deliveryType === 'free' ? (lang === 'fr' ? 'Gratuit (Djelfa)' : 'مجاني (الجلفة)') :
                            selectedOrderForDetail.deliveryType === 'to_office' ? (lang === 'fr' ? 'Bureau de livraison' : 'مكتب شركة الشحن') :
                              (lang === 'fr' ? 'Clinique' : 'العيادة')}
                        </p>
                      )}
                      {selectedOrderForDetail.notes && (
                        <p className="text-slate-800 italic bg-amber-50/50 border border-amber-100 p-2 rounded-xl mt-1 text-[11px]">
                          <strong>Note:</strong> {selectedOrderForDetail.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Management */}
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                      {lang === 'fr' ? 'Statut du flux' : 'إدارة حالة الطلب'}
                    </h4>
                    <select
                      value={selectedOrderForDetail.status}
                      onChange={(e) => handleUpdateOrderStatus(selectedOrderForDetail.id, e.target.value as OrderStatus)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-cyan text-xs text-slate-800 font-bold"
                    >
                      <option value="pending">En attente / Pending</option>
                      <option value="confirmed">Confirmé / Confirmed</option>
                      <option value="preparing">En préparation / Preparing</option>
                      <option value="shipped">Expédié / Shipped</option>
                      <option value="delivered">Livré / Delivered</option>
                      <option value="cancelled">Annulé / Cancelled</option>
                    </select>
                  </div>

                  {/* Yalidine Integration */}
                  <div className="border-t border-slate-100 pt-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Truck size={14} className="text-brand-cyan" />
                      Yalidine Express
                    </h4>

                    {!yalidineConfig.enabled ? (
                      <p className="text-[10px] text-slate-400 italic">
                        {lang === 'fr' ? 'L\'intégration Yalidine est désactivée dans les réglages.' : 'ربط شركة يالدين معطل في الإعدادات.'}
                      </p>
                    ) : selectedOrderForDetail.yalidineTrackingNumber ? (
                      <div className="bg-emerald-50/50 border border-emerald-100 p-3.5 rounded-2xl text-xs space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-bold">{lang === 'fr' ? 'N° Suivi :' : 'رقم التتبع:'}</span>
                          <span className="font-mono font-black text-slate-800">{selectedOrderForDetail.yalidineTrackingNumber}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Statut Yalidine :' : 'حالة الطرد:'}</span>
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-semibold text-[10px]">{selectedOrderForDetail.yalidineStatus || 'created'}</span>
                        </div>
                        {selectedOrderForDetail.yalidineLabelUrl && (
                          <a
                            href={selectedOrderForDetail.yalidineLabelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center bg-brand-cyan text-white font-extrabold text-[10px] py-1.5 rounded-xl hover:bg-brand-cyan/95 transition-colors mt-2"
                          >
                            {lang === 'fr' ? 'Imprimer le bordereau' : 'طباعة ملصق الشحن'}
                          </a>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendToYalidine(selectedOrderForDetail)}
                        disabled={yalidineSubmitting}
                        className="w-full flex items-center justify-center gap-2 bg-brand-cyan text-white font-bold text-xs py-2.5 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all shadow-xs disabled:opacity-50"
                      >
                        {yalidineSubmitting ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        ) : (
                          <Truck size={14} />
                        )}
                        <span>
                          {yalidineConfig.isSandbox
                            ? (lang === 'fr' ? 'Simuler l\'envoi (Sandbox)' : 'محاكاة الشحن (تجريبي)')
                            : (lang === 'fr' ? 'Générer Colis Yalidine' : 'إرسال لشركة يالدين')}
                        </span>
                      </button>
                    )}
                  </div>

                </div>

              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => handleStartEditOrder(selectedOrderForDetail)}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                <Edit3 size={14} />
                {lang === 'fr' ? 'Modifier la commande' : 'تعديل الطلب'}
              </button>
              <button
                type="button"
                onClick={() => onPrintInvoice(selectedOrderForDetail)}
                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                <FileText size={14} />
                {lang === 'fr' ? 'Imprimer Facture (A4)' : 'طباعة الفاتورة (A4)'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                {lang === 'fr' ? 'Fermer' : 'إغلاق'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Add/Edit Overlay Modal */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col my-8"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="font-extrabold text-slate-800 text-base">
                {editingProduct ? getTranslation(lang, 'editProduct') : getTranslation(lang, 'addNewProduct')}
              </span>
              <button
                type="button"
                onClick={() => setShowProductForm(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-sm font-medium">
              {/* Product Type Toggle: Simple vs Variable */}
              <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-extrabold text-purple-900">
                      {lang === 'fr' ? 'Type de produit : Variable (Options)' : 'نظام المنتجات المتغيرة (Variable Product)'}
                    </p>
                    <p className="text-[11px] text-purple-700">
                      {lang === 'fr'
                        ? 'Permet d\'ajouter des variantes (Tailles, Couleurs) avec prix et stock par variante.'
                        : 'إضافة خيارات وأحجام وألوان متعددة للمنتج لكل منها سعر ومخزون خاص.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPIsVariable(prev => !prev)}
                    className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${pIsVariable ? 'bg-purple-600' : 'bg-slate-200'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${pIsVariable ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                {pIsVariable && (
                  <div className="space-y-4 pt-2 border-t border-purple-200">
                    {/* Add Attribute UI */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-purple-900 block">
                        {lang === 'fr' ? '1. Ajouter un attribut (ex: Couleur, Taille)' : '1. إضافة خاصية جديدة (مثال: اللون، الحجم)'}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder={lang === 'fr' ? 'Nom (ex: Couleur)' : 'اسم الخاصية (مثال: اللون)'}
                          value={newAttrName}
                          onChange={(e) => setNewAttrName(e.target.value)}
                          className="bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:border-purple-500"
                        />
                        <input
                          type="text"
                          placeholder={lang === 'fr' ? 'Options séparées par virgules (ex: A1, A2, A3)' : 'الخيارات تفصل بفاصلة (مثال: A1, A2, A3)'}
                          value={newAttrOptions}
                          onChange={(e) => setNewAttrOptions(e.target.value)}
                          className="bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:border-purple-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddAttribute}
                        className="w-full bg-purple-600 text-white font-bold text-xs py-2 rounded-xl hover:bg-purple-700 transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus size={14} />
                        {lang === 'fr' ? 'Ajouter cet attribut' : 'إضافة هذه الخاصية'}
                      </button>
                    </div>

                    {/* Attributes List */}
                    {pAttributes.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 block">
                          {lang === 'fr' ? 'Attributs créés :' : 'الخصائص المضافة:'}
                        </label>
                        <div className="space-y-1.5">
                          {pAttributes.map((attr, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-purple-200 text-xs">
                              <div>
                                <span className="font-extrabold text-purple-900">{attr.name}: </span>
                                <span className="text-slate-600 font-semibold">{attr.options.join(', ')}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveAttribute(idx)}
                                className="text-rose-500 hover:bg-rose-50 p-1 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleGenerateVariants}
                          className="w-full bg-emerald-600 text-white font-black text-xs py-2.5 rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 shadow-xs mt-2"
                        >
                          <RefreshCw size={14} />
                          {lang === 'fr' ? 'Générer les combinaisons de variants' : 'توليد كافة خيارات التشكيل (Variants)'}
                        </button>
                      </div>
                    )}

                    {/* Variants Matrix Table */}
                    {pVariants.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 block">
                          {lang === 'fr' ? `Variantes générées (${pVariants.length}) :` : `قائمة الخيارات والتعديل عليها (${pVariants.length}):`}
                        </label>
                        <div className="max-h-60 overflow-y-auto space-y-2 border border-purple-200 rounded-2xl p-2 bg-white">
                          {pVariants.map((v) => (
                            <div key={v.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-slate-800">{v.name}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVariant(v.id)}
                                  className="text-rose-500 hover:text-rose-700"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold block">{lang === 'fr' ? 'Prix (DA)' : 'السعر (د.ج)'}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={v.price ?? 0}
                                    onChange={(e) => handleUpdateVariant(v.id, 'price', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold font-mono text-purple-900"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold block">{lang === 'fr' ? 'Stock' : 'المخزون'}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={v.stock ?? 0}
                                    onChange={(e) => handleUpdateVariant(v.id, 'stock', e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] text-slate-400 font-bold block">{lang === 'fr' ? 'Image (Upload ou Lien)' : 'صورة الحجم (رفع أو رابط)'}</label>
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="https://..."
                                      value={v.image || ''}
                                      onChange={(e) => handleUpdateVariant(v.id, 'image', e.target.value)}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono"
                                    />
                                    <input
                                      type="file"
                                      id={`v-file-${v.id}`}
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const reader = new FileReader();
                                        reader.onload = (event) => {
                                          if (event.target?.result) {
                                            handleUpdateVariant(v.id, 'image', event.target.result as string);
                                          }
                                        };
                                        reader.readAsDataURL(file);
                                        e.target.value = '';
                                      }}
                                      className="hidden"
                                    />
                                    <label
                                      htmlFor={`v-file-${v.id}`}
                                      className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer text-xs font-bold shrink-0 flex items-center gap-1 shadow-xs"
                                      title={lang === 'fr' ? 'Téléverser depuis l\'appareil 📁' : 'رفع صورة من الجهاز 📁'}
                                    >
                                      <Upload size={12} />
                                    </label>
                                  </div>
                                  {v.image && (
                                    <img src={v.image} alt={v.name} className="w-8 h-8 rounded-lg object-cover border border-slate-200 mt-1 shadow-2xs" />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Nom du produit' : 'اسم المنتج'}</label>
                <input
                  type="text"
                  required
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs flex items-center justify-between">
                  <span>{lang === 'fr' ? 'Prix Brut (DA)' : 'السعر الأساسي (دج)'}</span>
                  {pIsVariable && (
                    <span className="text-[10px] text-purple-600 font-normal">
                      ({lang === 'fr' ? 'Optionnel: calculé depuis les variantes' : 'اختياري: سيُحسب من المتغيرات تلقائياً'})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  required={!pIsVariable}
                  min={pIsVariable ? "0" : "1"}
                  value={pPrice}
                  onChange={(e) => setPPrice(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs flex items-center gap-1">
                    <DollarSign size={11} className="text-emerald-500" />
                    {lang === 'fr' ? 'Prix d\'achat (DA)' : 'سعر الشراء (دج)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pPurchasePrice}
                    onChange={(e) => setPPurchasePrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-emerald-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-emerald-400"
                    placeholder="0"
                  />
                  {pPurchasePrice > 0 && pPrice > 0 && (
                    <p className={`text-[10px] font-bold mt-0.5 ${
                      pPrice > pPurchasePrice ? 'text-emerald-600' : 'text-rose-500'
                    }`}>
                      {pPrice > pPurchasePrice
                        ? `✓ فائدة: ${Math.round(((pPrice - pPurchasePrice) / pPurchasePrice) * 100)}% (+${(pPrice - pPurchasePrice).toLocaleString()} دج)`
                        : `✗ خسارة: ${Math.round(((pPurchasePrice - pPrice) / pPurchasePrice) * 100)}%`
                      }
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Remise (%)' : 'التخفيض (%)'}</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={pDiscount}
                    onChange={(e) => setPDiscount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">Stock</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={pStock}
                    onChange={(e) => setPStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'stockAlert')}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={pLowStock}
                    onChange={(e) => setPLowStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'categories')}</label>
                <div className="flex gap-2">
                  <select
                    value={pCategory}
                    onChange={(e) => setPCategory(e.target.value as any)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                  >
                    {customCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                      placeholder={lang === 'fr' ? 'Nouvelle catégorie...' : 'فئة جديدة...'}
                      className="w-36 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-hidden focus:border-brand-cyan"
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={savingCategory || !newCategoryInput.trim()}
                      className="bg-brand-cyan text-white font-bold text-xs px-3 rounded-xl hover:bg-brand-cyan/90 transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      {savingCategory ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      {lang === 'fr' ? 'Ajouter' : 'أضف'}
                    </button>
                  </div>
                </div>
                {customCategories.filter(c => !['Équipements','Consommables','Instruments','Orthodontie','Hygiène & Stérilisation','Prothèse dentaire'].includes(c)).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {customCategories.filter(c => !['Équipements','Consommables','Instruments','Orthodontie','Hygiène & Stérilisation','Prothèse dentaire'].includes(c)).map(cat => (
                      <span key={cat} className="flex items-center gap-1 bg-brand-cyan/10 text-brand-cyan text-[10px] font-bold px-2 py-0.5 rounded-md border border-brand-cyan/20">
                        {cat}
                        <button type="button" onClick={() => handleDeleteCategory(cat)} className="text-rose-400 hover:text-rose-600 ml-0.5"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'expiryDate')} (AAAA-MM-JJ)</label>
                <input
                  type="text"
                  placeholder="2027-12-31"
                  value={pExpiry}
                  onChange={(e) => setPExpiry(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs flex items-center gap-1">
                  <ImageIcon size={12} />{lang === 'fr' ? 'Image du produit' : 'صورة المنتج'}
                </label>
                <div className="flex items-center gap-3">
                  {pImage && (
                    <img src={pImage} alt="" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-cyan/10 file:text-brand-cyan file:font-bold" />
                </div>
                <input
                  type="url"
                  value={pImage && !pImage.startsWith('data:') ? pImage : ''}
                  onChange={(e) => setPImage(e.target.value)}
                  placeholder={lang === 'fr' ? 'Ou URL de l\'image' : 'أو رابط الصورة'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-hidden focus:border-brand-cyan mt-1"
                />
              </div>

              {/* Barcode Generator */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Code-barres (EAN)' : 'الباركود (EAN)'}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pBarcode}
                    onChange={(e) => setPBarcode(e.target.value)}
                    placeholder="6130987654321"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={generateBarcode}
                    title={lang === 'fr' ? 'Générer un code-barres automatique' : 'توليد باركود تلقائي'}
                    className="shrink-0 flex items-center gap-1.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30 font-bold text-xs px-3 py-2 rounded-xl transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" /></svg>
                    {lang === 'fr' ? 'Générer' : 'توليد'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onPrintBarcode?.({
                        id: editingProduct?.id || 'temp',
                        name: pName || (lang === 'fr' ? 'Nouveau produit' : 'منتج جديد'),
                        barcode: pBarcode.trim() || editingProduct?.id || 'temp',
                        price: pPrice,
                        stock: pStock,
                        category: pCategory,
                        description: pDesc,
                        isDeleted: false,
                        isRoutineClinic: pIsRoutineClinic
                      });
                    }}
                    title={lang === 'fr' ? 'Imprimer le code-barres' : 'طباعة الباركود'}
                    className="shrink-0 flex items-center gap-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 border border-emerald-600/30 font-bold text-xs px-3 py-2 rounded-xl transition-all"
                  >
                    <Printer size={14} />
                    {lang === 'fr' ? 'Imprimer' : 'طباعة'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  {lang === 'fr' ? 'Saisissez manuellement ou cliquez sur «Générer» pour un EAN-13 automatique.' : 'أدخل يدوياً أو اضغط «توليد» لإنشاء باركود EAN-13 تلقائي.'}
                </p>
              </div>

              {/* Routine Clinic Product Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-sm font-bold text-slate-700">
                    {lang === 'fr' ? 'Produit Clinique Routinier' : 'منتج عيادة روتيني'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {lang === 'fr'
                      ? 'Afficher ce produit dans la section "Clinique Routinière" de la boutique.'
                      : 'عرض هذا المنتج في قسم "منتجات العيادة الروتينية" في المتجر.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPIsRoutineClinic(prev => !prev)}
                  className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${pIsRoutineClinic ? 'bg-brand-cyan' : 'bg-slate-200'
                    }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm ${pIsRoutineClinic ? 'right-1' : 'left-1'
                      }`}
                  />
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{lang === 'fr' ? 'Description' : 'الوصف'}</label>
                <textarea
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">
                  {getTranslation(lang, 'technicalSheet')} ({lang === 'fr' ? 'Séparer par des points-virgules, ex: Marque: Dentsply; Matériau: Inox' : 'افصل بين الخصائص بفاصلة منقوطة'})
                </label>
                <input
                  type="text"
                  placeholder="Marque: Dentsply; Pays: Allemagne"
                  value={pTechSheet}
                  onChange={(e) => setPTechSheet(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand-cyan text-white font-bold text-xs py-3 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  getTranslation(lang, 'submit')
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Messages Section */}
      {activeSubTab === 'messages' && currentUser.role === 'admin' && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-xs space-y-6">
          <div className="border-b border-slate-50 pb-4">
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <MessageSquare size={20} className="text-brand-cyan" />
              {lang === 'fr' ? 'Messages des médecins' : 'رسائل الأطباء'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {lang === 'fr'
                ? `Total: ${adminMessagesList.length} messages`
                : `المجموع: ${adminMessagesList.length} رسالة`}
            </p>
          </div>

          {adminMessagesList.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare size={48} className="text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">
                {lang === 'fr' ? 'Aucun message' : 'لا توجد رسائل'}
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {adminMessagesList
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-2xl border transition-all ${!message.isRead
                        ? 'bg-brand-cyan/5 border-brand-cyan/20'
                        : 'bg-slate-50 border-slate-100'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-900">{message.doctorName}</h4>
                          {!message.isRead && (
                            <span className="bg-brand-cyan text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {lang === 'fr' ? 'Nouveau' : 'جديد'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {message.doctorClinic} • {message.doctorPhone}
                        </p>
                        <p className="text-xs text-slate-400">
                          {message.doctorEmail}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(message.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl mb-3">
                      <p className="text-sm text-slate-700 leading-relaxed">{message.message}</p>
                    </div>

                    {message.reply ? (
                      <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                        <p className="text-xs font-bold text-emerald-700 mb-1">
                          {lang === 'fr' ? 'Réponse:' : 'الرد:'}
                        </p>
                        <p className="text-sm text-emerald-800">{message.reply}</p>
                        <p className="text-xs text-emerald-600 mt-1">
                          {new Date(message.repliedAt!).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const replyText = prompt(lang === 'fr' ? 'Votre réponse:' : 'ردك:');
                            if (replyText) {
                              await updateDoc(doc(db, 'admin_messages', message.id), {
                                reply: replyText,
                                repliedAt: new Date().toISOString(),
                                isRead: true
                              });
                              onRefreshData();
                            }
                          }}
                          className="flex-1 bg-brand-cyan text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-brand-cyan/90 transition-colors"
                        >
                          {lang === 'fr' ? 'Répondre' : 'الرد'}
                        </button>
                        <button
                          onClick={async () => {
                            await updateDoc(doc(db, 'admin_messages', message.id), {
                              isRead: true
                            });
                            onRefreshData();
                          }}
                          className="px-4 py-2 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                          {lang === 'fr' ? 'Marquer comme lu' : 'تعيين كمقروء'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
