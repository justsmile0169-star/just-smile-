import React, { useState, useMemo } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Supplier, PurchaseInvoice, PurchaseItem, SupplierPayment, Product, UserProfile, ShopInfo } from '../../types';
import { Language, getTranslation } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import {
  Truck, Plus, Search, DollarSign, FileText, Edit3, Trash2,
  Printer, CheckCircle2, AlertTriangle, Eye,
  Building2, Phone, MapPin, X, Save,
  TrendingUp, Package, Barcode, Check, Layers, ShoppingBag,
  Receipt, Sparkles, ChevronDown, PlusCircle
} from 'lucide-react';

interface SupplierManagerProps {
  lang: Language;
  suppliers: Supplier[];
  purchases: PurchaseInvoice[];
  supplierPayments: SupplierPayment[];
  productsList: Product[];
  currentUser: UserProfile;
  shopInfo?: ShopInfo;
}

export default function SupplierManager({
  lang,
  suppliers = [],
  purchases = [],
  supplierPayments = [],
  productsList = [],
  currentUser,
  shopInfo
}: SupplierManagerProps) {
  const { alert, confirm } = useAppDialog();
  const isRtl = lang === 'ar';

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(Math.round(n || 0)) + ' ' + getTranslation(lang, 'currency');

  // --- Search & Filters State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with_debt' | 'settled'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'debt_desc' | 'recent'>('debt_desc');

  // --- Modals State ---
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [, setSelectedSupplierForPurchase] = useState<Supplier | null>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [, setSelectedSupplierForPayment] = useState<Supplier | null>(null);

  const [dossierSupplier, setDossierSupplier] = useState<Supplier | null>(null);
  const [dossierTab, setDossierTab] = useState<'statement' | 'invoices' | 'payments'>('statement');

  const [viewingInvoice, setViewingInvoice] = useState<PurchaseInvoice | null>(null);

  // --- Supplier Form State ---
  const [supName, setSupName] = useState('');
  const [supCompanyName, setSupCompanyName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supPhone2, setSupPhone2] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supWilaya, setSupWilaya] = useState('');
  const [supInitialDebt, setSupInitialDebt] = useState<number>(0);
  const [supNotes, setSupNotes] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  // --- Purchase Invoice Form State & Product Search ---
  const [purSupplierId, setPurSupplierId] = useState('');
  const [purInvoiceNumber, setPurInvoiceNumber] = useState('');
  const [purDate, setPurDate] = useState(new Date().toISOString().slice(0, 10));
  const [purItems, setPurItems] = useState<PurchaseItem[]>([
    { productName: '', quantity: 1, purchasePrice: 0, totalPrice: 0 }
  ]);
  const [purPaidAmount, setPurPaidAmount] = useState<number>(0);
  const [purPaymentMethod, setPurPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | 'credit'>('cash');
  const [purCheckNumber, setPurCheckNumber] = useState('');
  const [purUpdateStock, setPurUpdateStock] = useState(true);
  const [purNotes, setPurNotes] = useState('');
  const [savingPurchase, setSavingPurchase] = useState(false);

  // Quick Product Search state for Purchase items
  const [purProductSearch, setPurProductSearch] = useState('');
  const [showPurSearchDropdown, setShowPurSearchDropdown] = useState(false);
  const [recentlyAddedProductId, setRecentlyAddedProductId] = useState<string | null>(null);

  // Filtered products matching the search query in purchase modal
  const filteredProductsForPurchase = useMemo(() => {
    const q = purProductSearch.trim().toLowerCase();
    if (!q) return [];
    return productsList.filter((p) => {
      return (
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        ((p as any).brand && (p as any).brand.toLowerCase().includes(q))
      );
    }).slice(0, 20);
  }, [productsList, purProductSearch]);

  // --- Supplier Payment Form State ---
  const [paySupplierId, setPaySupplierId] = useState('');
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<'cash' | 'check' | 'bank_transfer' | 'other'>('cash');
  const [payCheckNumber, setPayCheckNumber] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payPurchaseId, setPayPurchaseId] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // --- Edit Payment State ---
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // CALCULATIONS & FINANCIAL STATS PER SUPPLIER
  // ─────────────────────────────────────────────────────────────────────────────

  // Calculate detailed financial statement for each supplier
  const supplierStatsMap = useMemo(() => {
    const map = new Map<string, {
      totalPurchases: number;
      newPurchasesTotal: number;
      initialDebt: number;
      totalPayments: number;
      remainingDebt: number;
      invoicesCount: number;
      paymentsCount: number;
    }>();

    suppliers.forEach((s) => {
      const initial = Number(s.initialDebt || 0);
      const sInvoices = purchases.filter((p) => p.supplierId === s.id);
      const sPayments = supplierPayments.filter((p) => p.supplierId === s.id);

      const newPurchasesTotal = sInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
      const totalPurchases = initial + newPurchasesTotal;

      // Payments made directly as supplier payments
      const totalDirectPayments = sPayments.reduce((sum, pay) => sum + (Number(pay.amount) || 0), 0);

      // Total payments recorded
      const totalPayments = totalDirectPayments;

      const remainingDebt = Math.max(0, totalPurchases - totalPayments);

      map.set(s.id, {
        totalPurchases,
        newPurchasesTotal,
        initialDebt: initial,
        totalPayments,
        remainingDebt,
        invoicesCount: sInvoices.length,
        paymentsCount: sPayments.length
      });
    });

    return map;
  }, [suppliers, purchases, supplierPayments]);

  // Global KPIs across all suppliers
  const globalKPIs = useMemo(() => {
    let totalPurchasesSum = 0;
    let totalPaymentsSum = 0;
    let totalDebtSum = 0;
    let suppliersWithDebtCount = 0;

    suppliers.forEach((s) => {
      const stats = supplierStatsMap.get(s.id);
      if (stats) {
        totalPurchasesSum += stats.totalPurchases;
        totalPaymentsSum += stats.totalPayments;
        totalDebtSum += stats.remainingDebt;
        if (stats.remainingDebt > 0) {
          suppliersWithDebtCount++;
        }
      }
    });

    return {
      totalSuppliers: suppliers.length,
      totalPurchasesSum,
      totalPaymentsSum,
      totalDebtSum,
      suppliersWithDebtCount
    };
  }, [suppliers, supplierStatsMap]);

  // Filtered & Sorted Suppliers
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return suppliers
      .filter((s) => {
        const stats = supplierStatsMap.get(s.id);
        const matchesSearch =
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.companyName && s.companyName.toLowerCase().includes(q)) ||
          (s.phone && s.phone.includes(q)) ||
          (s.wilaya && s.wilaya.toLowerCase().includes(q)) ||
          (s.notes && s.notes.toLowerCase().includes(q));

        if (!matchesSearch) return false;

        if (filterType === 'with_debt') {
          return stats ? stats.remainingDebt > 0 : false;
        }
        if (filterType === 'settled') {
          return stats ? stats.remainingDebt <= 0 : true;
        }
        return true;
      })
      .sort((a, b) => {
        const statsA = supplierStatsMap.get(a.id);
        const statsB = supplierStatsMap.get(b.id);
        if (sortBy === 'debt_desc') {
          return (statsB?.remainingDebt || 0) - (statsA?.remainingDebt || 0);
        }
        if (sortBy === 'recent') {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        }
        return a.name.localeCompare(b.name);
      });
  }, [suppliers, searchQuery, filterType, sortBy, supplierStatsMap]);

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS: SUPPLIERS (ADD / EDIT / DELETE)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setSupName('');
    setSupCompanyName('');
    setSupPhone('');
    setSupPhone2('');
    setSupEmail('');
    setSupAddress('');
    setSupWilaya('');
    setSupInitialDebt(0);
    setSupNotes('');
    setShowSupplierModal(true);
  };

  const handleOpenEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupName(s.name || '');
    setSupCompanyName(s.companyName || '');
    setSupPhone(s.phone || '');
    setSupPhone2(s.phone2 || '');
    setSupEmail(s.email || '');
    setSupAddress(s.address || '');
    setSupWilaya(s.wilaya || '');
    setSupInitialDebt(Number(s.initialDebt || 0));
    setSupNotes(s.notes || '');
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim() || !supPhone.trim()) {
      alert(lang === 'fr' ? 'Veuillez saisir le nom et le numéro de téléphone.' : 'يرجى إدخال اسم المورد ورقم هاتفه.', 'error');
      return;
    }

    setSavingSupplier(true);
    try {
      const now = new Date().toISOString();
      const payload: Partial<Supplier> = {
        name: supName.trim(),
        companyName: supCompanyName.trim() || '',
        phone: supPhone.trim(),
        phone2: supPhone2.trim() || '',
        email: supEmail.trim() || '',
        address: supAddress.trim() || '',
        wilaya: supWilaya.trim() || '',
        initialDebt: Number(supInitialDebt) || 0,
        notes: supNotes.trim() || '',
        updatedAt: now
      };

      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), payload);
        await logActivity(currentUser, 'update_supplier', 'supplier', `Updated supplier ${payload.name}`, editingSupplier.id);
        alert(lang === 'fr' ? 'Fournisseur modifié avec succès !' : 'تم تعديل بيانات المورد بنجاح!', 'success');
      } else {
        const newDoc = await addDoc(collection(db, 'suppliers'), {
          ...payload,
          createdAt: now
        });
        await logActivity(currentUser, 'add_supplier', 'supplier', `Added new supplier ${payload.name} (Initial debt: ${payload.initialDebt} DA)`, newDoc.id);
        alert(lang === 'fr' ? 'Fournisseur ajouté avec succès !' : 'تمت إضافة المورد الجديد بنجاح!', 'success');
      }

      setShowSupplierModal(false);
    } catch (err: any) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de l\'enregistrement.' : 'حدث خطأ أثناء الحفظ.', 'error');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (s: Supplier) => {
    const ok = await confirm(
      lang === 'fr' ? `Supprimer le fournisseur "${s.name}" ?` : `هل أنت متأكد من حذف المورد "${s.name}"؟`,
      lang === 'fr'
        ? 'Cette action supprimera également le dossier du fournisseur. Les factures et paiements associés restent enregistrés.'
        : 'سيتم حذف المورد من القائمة. يرجى التأكد من تسوية الحسابات.'
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'suppliers', s.id));
      await logActivity(currentUser, 'delete_supplier', 'supplier', `Deleted supplier ${s.name}`, s.id);
      if (dossierSupplier?.id === s.id) {
        setDossierSupplier(null);
      }
      alert(lang === 'fr' ? 'Fournisseur supprimé.' : 'تم حذف المورد بنجاح.', 'success');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء الحذف.', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS: PURCHASE INVOICES (ADD / VIEW / DELETE)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleOpenAddPurchase = (preselectedSupplier?: Supplier | null) => {
    const targetSup = preselectedSupplier || (suppliers.length > 0 ? suppliers[0] : null);
    setSelectedSupplierForPurchase(targetSup);
    setPurSupplierId(targetSup ? targetSup.id : '');
    setPurInvoiceNumber(`FA-${Date.now().toString().slice(-6)}`);
    setPurDate(new Date().toISOString().slice(0, 10));
    setPurItems([{ productName: '', quantity: 1, purchasePrice: 0, totalPrice: 0 }]);
    setPurPaidAmount(0);
    setPurPaymentMethod('cash');
    setPurCheckNumber('');
    setPurUpdateStock(true);
    setPurNotes('');
    setPurProductSearch('');
    setShowPurSearchDropdown(false);
    setRecentlyAddedProductId(null);
    setShowPurchaseModal(true);
  };

  // Add product from quick search dropdown into the invoice line items
  const handleAddProductToPurItems = (product: Product) => {
    setPurItems((prev) => {
      // If the first row is empty (blank name and no productId), replace it
      if (prev.length === 1 && !prev[0].productName.trim() && !prev[0].productId) {
        return [{
          productId: product.id,
          productName: product.name,
          quantity: 1,
          purchasePrice: Number(product.purchasePrice || 0),
          salePrice: Number(product.price || 0),
          barcode: product.barcode || '',
          totalPrice: Number(product.purchasePrice || 0) * 1
        }];
      }

      // If product already exists in current list, increment its quantity
      const existingIdx = prev.findIndex((it) => it.productId === product.id);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const currentItem = updated[existingIdx];
        const newQty = (Number(currentItem.quantity) || 0) + 1;
        const pPrice = Number(currentItem.purchasePrice) || 0;
        updated[existingIdx] = {
          ...currentItem,
          quantity: newQty,
          totalPrice: newQty * pPrice
        };
        return updated;
      }

      // Otherwise append as a new row
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          purchasePrice: Number(product.purchasePrice || 0),
          salePrice: Number(product.price || 0),
          barcode: product.barcode || '',
          totalPrice: Number(product.purchasePrice || 0) * 1
        }
      ];
    });

    setRecentlyAddedProductId(product.id);
    setTimeout(() => setRecentlyAddedProductId(null), 1800);
    setPurProductSearch('');
    setShowPurSearchDropdown(false);
  };

  const handlePurItemChange = (index: number, field: keyof PurchaseItem, value: any) => {
    setPurItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      // If choosing an existing product from dropdown
      if (field === 'productId') {
        const matched = productsList.find((p) => p.id === value);
        if (matched) {
          item.productName = matched.name;
          item.purchasePrice = Number(matched.purchasePrice || 0);
          item.salePrice = Number(matched.price || 0);
          item.barcode = matched.barcode || '';
        }
      }

      // Recalculate line total
      const qty = Number(item.quantity) || 1;
      const price = Number(item.purchasePrice) || 0;
      item.totalPrice = qty * price;

      updated[index] = item;
      return updated;
    });
  };

  const handleAddPurItemRow = () => {
    setPurItems((prev) => [
      ...prev,
      { productName: '', quantity: 1, purchasePrice: 0, totalPrice: 0 }
    ]);
  };

  const handleRemovePurItemRow = (index: number) => {
    if (purItems.length === 1) return;
    setPurItems((prev) => prev.filter((_, i) => i !== index));
  };

  const totalInvoiceCalculated = useMemo(() => {
    return purItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
  }, [purItems]);

  const remainingInvoiceDebt = useMemo(() => {
    return Math.max(0, totalInvoiceCalculated - (Number(purPaidAmount) || 0));
  }, [totalInvoiceCalculated, purPaidAmount]);

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === purSupplierId);
    if (!sup) {
      alert(lang === 'fr' ? 'Veuillez sélectionner un fournisseur.' : 'يرجى اختيار المورد.', 'error');
      return;
    }

    const validItems = purItems.filter((it) => it.productName.trim() && it.quantity > 0);
    if (validItems.length === 0) {
      alert(lang === 'fr' ? 'Veuillez ajouter au moins un produit valide.' : 'يرجى إضافة مادة واحدة على الأقل بالكمية والسعر.', 'error');
      return;
    }

    setSavingPurchase(true);
    try {
      const now = new Date().toISOString();
      const totalAmount = totalInvoiceCalculated;
      const paid = Math.min(totalAmount, Math.max(0, Number(purPaidAmount) || 0));
      const remaining = Math.max(0, totalAmount - paid);
      const paymentStatus: PurchaseInvoice['paymentStatus'] = remaining === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

      const invoicePayload: Omit<PurchaseInvoice, 'id'> = {
        invoiceNumber: purInvoiceNumber.trim() || `FA-${Date.now().toString().slice(-6)}`,
        supplierId: sup.id,
        supplierName: sup.name,
        date: purDate,
        items: validItems,
        totalAmount,
        paidAmount: paid,
        remainingDebt: remaining,
        paymentStatus,
        paymentMethod: purPaymentMethod,
        checkNumber: purPaymentMethod === 'check' ? purCheckNumber.trim() : undefined,
        updateStock: purUpdateStock,
        notes: purNotes.trim() || undefined,
        createdBy: currentUser.uid,
        createdByName: currentUser.name,
        createdAt: now
      };

      const docRef = await addDoc(collection(db, 'purchases'), invoicePayload);

      // If immediate payment was made, also record it in supplier_payments
      if (paid > 0) {
        await addDoc(collection(db, 'supplier_payments'), {
          supplierId: sup.id,
          supplierName: sup.name,
          purchaseId: docRef.id,
          amount: paid,
          paymentDate: purDate,
          paymentMethod: purPaymentMethod === 'credit' ? 'cash' : purPaymentMethod,
          checkNumber: purPaymentMethod === 'check' ? purCheckNumber.trim() : undefined,
          notes: `${lang === 'fr' ? 'Paiement immédiat à l\'achat' : 'دفعة فورية عند الشراء'} (${invoicePayload.invoiceNumber})`,
          createdBy: currentUser.uid,
          createdByName: currentUser.name,
          createdAt: now
        });
      }

      // If auto-update stock is selected, increment inventory stock & update purchase price
      if (purUpdateStock) {
        for (const item of validItems) {
          if (item.productId) {
            const prodRef = doc(db, 'products', item.productId);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const currentProd = prodSnap.data() as Product;
              const newStock = (Number(currentProd.stock) || 0) + Number(item.quantity);
              const updateData: any = {
                stock: newStock,
                purchasePrice: Number(item.purchasePrice) || currentProd.purchasePrice || 0
              };
              if (item.salePrice && item.salePrice > 0) {
                updateData.price = item.salePrice;
              }
              await updateDoc(prodRef, updateData);
            }
          }
        }
      }

      await logActivity(
        currentUser,
        'add_purchase_invoice',
        'purchase',
        `Added purchase invoice ${invoicePayload.invoiceNumber} for ${sup.name} (${totalAmount} DA, paid: ${paid} DA)`,
        docRef.id
      );

      alert(lang === 'fr' ? 'Facture d\'achat enregistrée avec succès !' : 'تم تسجيل فاتورة الشراء بنجاح وتحديث الحسابات!', 'success');
      setShowPurchaseModal(false);
    } catch (err: any) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de l\'enregistrement.' : 'حدث خطأ أثناء حفظ الفاتورة.', 'error');
    } finally {
      setSavingPurchase(false);
    }
  };

  const handleDeletePurchase = async (invoice: PurchaseInvoice) => {
    const ok = await confirm(
      lang === 'fr' ? `Supprimer la facture "${invoice.invoiceNumber}" ?` : `هل أنت متأكد من حذف فاتورة الشراء "${invoice.invoiceNumber}"؟`,
      lang === 'fr'
        ? 'Cette action supprimera la facture de l\'historique du fournisseur.'
        : 'سيتم حذف الفاتورة وخصم قيمتها من إجمالي مشتريات المورد.'
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'purchases', invoice.id));
      await logActivity(currentUser, 'delete_purchase', 'purchase', `Deleted purchase invoice ${invoice.invoiceNumber}`, invoice.id);
      if (viewingInvoice?.id === invoice.id) {
        setViewingInvoice(null);
      }
      alert(lang === 'fr' ? 'Facture supprimée.' : 'تم حذف الفاتورة بنجاح.', 'success');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء الحذف.', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS: SUPPLIER PAYMENTS (ADD / EDIT / DELETE)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleOpenAddPayment = (preselectedSupplier?: Supplier | null) => {
    const targetSup = preselectedSupplier || (suppliers.length > 0 ? suppliers[0] : null);
    setSelectedSupplierForPayment(targetSup);
    setEditingPayment(null);
    setPaySupplierId(targetSup ? targetSup.id : '');
    setPayAmount(0);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('cash');
    setPayCheckNumber('');
    setPayNotes('');
    setPayPurchaseId('');
    setShowPaymentModal(true);
  };

  const handleOpenEditPayment = (pay: SupplierPayment) => {
    setEditingPayment(pay);
    setPaySupplierId(pay.supplierId);
    setPayAmount(pay.amount);
    setPayDate(pay.paymentDate || new Date().toISOString().slice(0, 10));
    setPayMethod(pay.paymentMethod || 'cash');
    setPayCheckNumber(pay.checkNumber || '');
    setPayNotes(pay.notes || '');
    setPayPurchaseId(pay.purchaseId || '');
    setShowPaymentModal(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === paySupplierId);
    if (!sup) {
      alert(lang === 'fr' ? 'Veuillez sélectionner un fournisseur.' : 'يرجى اختيار المورد.', 'error');
      return;
    }
    if (payAmount <= 0) {
      alert(lang === 'fr' ? 'Veuillez saisir un montant supérieur à 0.' : 'يرجى إدخال مبلغ صحيح أكبر من الصفر.', 'error');
      return;
    }

    setSavingPayment(true);
    try {
      const now = new Date().toISOString();
      const payload: Partial<SupplierPayment> = {
        supplierId: sup.id,
        supplierName: sup.name,
        amount: Number(payAmount),
        paymentDate: payDate,
        paymentMethod: payMethod,
        checkNumber: payMethod === 'check' ? payCheckNumber.trim() : undefined,
        notes: payNotes.trim() || undefined,
        purchaseId: payPurchaseId || undefined
      };

      if (editingPayment) {
        await updateDoc(doc(db, 'supplier_payments', editingPayment.id), payload);
        await logActivity(currentUser, 'update_supplier_payment', 'supplier_payment', `Updated payment of ${payAmount} DA for ${sup.name}`, editingPayment.id);
        alert(lang === 'fr' ? 'Paiement modifié avec succès !' : 'تم تعديل الدفعة بنجاح!', 'success');
      } else {
        const docRef = await addDoc(collection(db, 'supplier_payments'), {
          ...payload,
          createdBy: currentUser.uid,
          createdByName: currentUser.name,
          createdAt: now
        });
        await logActivity(currentUser, 'add_supplier_payment', 'supplier_payment', `Recorded payment of ${payAmount} DA to ${sup.name} (${payMethod})`, docRef.id);
        alert(lang === 'fr' ? 'Paiement enregistré avec succès !' : 'تم تسجيل الدفعة وتحديث رصيد المورد بنجاح!', 'success');
      }

      setShowPaymentModal(false);
    } catch (err: any) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de l\'enregistrement du paiement.' : 'حدث خطأ أثناء تسجيل الدفعة.', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (pay: SupplierPayment) => {
    const ok = await confirm(
      lang === 'fr' ? `Supprimer ce paiement de ${fmt(pay.amount)} ?` : `هل أنت متأكد من حذف هذه الدفعة بقيمة ${fmt(pay.amount)}؟`,
      lang === 'fr' ? 'Le solde restant du fournisseur sera automatiquement recalculé.' : 'سيتم إعادة احتساب رصيد المورد تلقائياً.'
    );
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'supplier_payments', pay.id));
      await logActivity(currentUser, 'delete_supplier_payment', 'supplier_payment', `Deleted payment of ${pay.amount} DA for ${pay.supplierName}`, pay.id);
      alert(lang === 'fr' ? 'Paiement supprimé.' : 'تم حذف الدفعة بنجاح.', 'success');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء الحذف.', 'error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // PRINTING: SUPPLIER STATEMENT (A4 STATEMENT) & PURCHASE INVOICE (BON DE RÉCEPTION)
  // ─────────────────────────────────────────────────────────────────────────────

  const handlePrintStatement = (supplier: Supplier) => {
    const stats = supplierStatsMap.get(supplier.id);
    const supInvoices = purchases.filter((p) => p.supplierId === supplier.id).sort((a, b) => a.date.localeCompare(b.date));
    const supPays = supplierPayments.filter((p) => p.supplierId === supplier.id).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

    // Combine into a chronological ledger
    const transactions: {
      date: string;
      type: 'initial' | 'purchase' | 'payment';
      ref: string;
      debit: number; // Purchases (increases debt)
      credit: number; // Payments (decreases debt)
      notes?: string;
    }[] = [];

    if (Number(supplier.initialDebt || 0) > 0) {
      transactions.push({
        date: supplier.createdAt ? supplier.createdAt.slice(0, 10) : '---',
        type: 'initial',
        ref: isRtl ? 'رصيد افتتاحي / مشتريات سابقة' : 'Solde Initial / Achats Antérieurs',
        debit: Number(supplier.initialDebt),
        credit: 0,
        notes: isRtl ? 'رصيد سابق مسجل' : 'Solde initial reporté'
      });
    }

    supInvoices.forEach((inv) => {
      transactions.push({
        date: inv.date,
        type: 'purchase',
        ref: `${isRtl ? 'فاتورة شراء' : 'Facture Achat'} #${inv.invoiceNumber}`,
        debit: Number(inv.totalAmount),
        credit: 0,
        notes: inv.notes || `${inv.items.length} ${isRtl ? 'مواد' : 'articles'}`
      });
    });

    supPays.forEach((pay) => {
      transactions.push({
        date: pay.paymentDate,
        type: 'payment',
        ref: `${isRtl ? 'دفعة مسددة' : 'Règlement'} (${pay.paymentMethod === 'cash' ? (isRtl ? 'نقداً' : 'Espèces') : pay.paymentMethod === 'check' ? (isRtl ? 'شيك' : 'Chèque') : pay.paymentMethod === 'bank_transfer' ? (isRtl ? 'تحويل' : 'Virement') : pay.paymentMethod})`,
        debit: 0,
        credit: Number(pay.amount),
        notes: pay.checkNumber ? `${isRtl ? 'شيك رقم' : 'Chèque N°'}: ${pay.checkNumber}` : pay.notes
      });
    });

    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Compute running balance
    let runningBalance = 0;
    const ledgerRows = transactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(
        lang === 'fr'
          ? 'Veuillez autoriser les fenêtres pop-up dans votre navigateur pour imprimer le relevé.'
          : 'يرجى السماح بالنوافذ المنبثقة (Popups) في المتصفح للتمكن من طباعة كشف الحساب.'
      );
      return;
    }

    const companyName = shopInfo?.companyName || 'JUST SMILE';
    const companyPhone = shopInfo?.phone || '0770821021 / 0780212989';
    const companyAddress = shopInfo?.address || 'Algeria, Djelfa';

    const html = `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${lang}">
<head>
  <meta charset="utf-8">
  <title>${isRtl ? 'كشف حساب مورد' : 'Relevé de Compte Fournisseur'} - ${supplier.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: ${isRtl ? "'Cairo', 'Segoe UI', Tahoma, sans-serif" : "'Inter', 'Segoe UI', sans-serif"};
      color: #0f172a;
      background: #f8fafc;
      margin: 0;
      padding: 20px;
      font-size: 12px;
      line-height: 1.4;
    }
    .no-print-bar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 12px 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
      z-index: 1000;
    }
    .no-print-bar button {
      cursor: pointer;
      font-family: inherit;
      font-weight: 700;
      font-size: 13px;
      padding: 8px 18px;
      border-radius: 8px;
      border: none;
      transition: all 0.2s;
    }
    .btn-print {
      background: #06b6d4;
      color: #ffffff;
    }
    .btn-print:hover {
      background: #0891b2;
    }
    .btn-close {
      background: #334155;
      color: #cbd5e1;
      margin-${isRtl ? 'right' : 'left'}: 8px;
    }
    .btn-close:hover {
      background: #475569;
      color: #ffffff;
    }
    .page-container {
      background: #ffffff;
      padding: 25px 30px;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0891b2;
      padding-bottom: 15px;
      margin-bottom: 18px;
    }
    .company-brand h1 {
      margin: 0 0 4px 0;
      color: #0891b2;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
    }
    .company-brand p {
      margin: 2px 0;
      color: #64748b;
      font-size: 11px;
    }
    .doc-meta {
      text-align: ${isRtl ? 'left' : 'right'};
    }
    .doc-meta h2 {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
    }
    .doc-meta p {
      margin: 2px 0;
      color: #64748b;
      font-size: 11px;
    }
    .supplier-card {
      display: flex;
      justify-content: space-between;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 18px;
    }
    .supplier-name {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .supplier-details {
      color: #334155;
      font-size: 11.5px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-bottom: 20px;
    }
    .kpi-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px;
      text-align: center;
    }
    .kpi-box .label {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .kpi-box .val {
      font-size: 13.5px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 4px;
    }
    .kpi-box.debt {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .kpi-box.debt .val {
      color: #dc2626;
    }
    .kpi-box.paid .val {
      color: #16a34a;
    }
    .table-title {
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 10px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #0891b2;
      color: #ffffff;
      font-weight: 700;
      font-size: 11px;
      text-align: ${isRtl ? 'right' : 'left'};
      padding: 8px 10px;
    }
    th:first-child {
      border-top-${isRtl ? 'right' : 'left'}-radius: 6px;
    }
    th:last-child {
      border-top-${isRtl ? 'left' : 'right'}-radius: 6px;
    }
    td {
      border-bottom: 1px solid #e2e8f0;
      padding: 8px 10px;
      font-size: 11.5px;
    }
    tr:nth-child(even) {
      background: #f8fafc;
    }
    .text-debit {
      color: #0f172a;
      font-weight: 700;
    }
    .text-credit {
      color: #16a34a;
      font-weight: 700;
    }
    .footer-signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 35px;
      padding-top: 15px;
      border-top: 1px dashed #cbd5e1;
    }
    .sig-box {
      width: 45%;
      text-align: center;
      padding: 10px;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      min-height: 80px;
    }
    .sig-box strong {
      font-size: 11px;
      color: #475569;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .no-print, .no-print-bar {
        display: none !important;
      }
      .page-container {
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <div>
      <span style="font-weight: 800; font-size: 14px;">🖨️ ${isRtl ? 'معاينة كشف حساب المورد للطباعة' : 'Aperçu du relevé fournisseur'}</span>
      <span style="font-size: 11px; color: #94a3b8; margin-${isRtl ? 'right' : 'left'}: 10px;">(A4 Portrait)</span>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">${isRtl ? 'طباعة الكشف 🖨️' : 'Imprimer le Relevé 🖨️'}</button>
      <button class="btn-close" onclick="window.close()">${isRtl ? 'إغلاق' : 'Fermer'}</button>
    </div>
  </div>

  <div class="page-container">
    <div class="header">
      <div class="company-brand">
        <h1>${companyName}</h1>
        <p>🦷 ${isRtl ? 'مستلزمات ومواد طب وجراحة الأسنان' : 'Fournitures & Matériel Dentaire'}</p>
        <p>📍 ${companyAddress} | 📞 ${companyPhone}</p>
      </div>
      <div class="doc-meta">
        <h2>${isRtl ? 'كشف حساب مورد' : 'RELEVÉ DE COMPTE FOURNISSEUR'}</h2>
        <p><strong>${isRtl ? 'تاريخ التقرير:' : 'Date du rapport :'}</strong> ${new Date().toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <p>${isRtl ? 'توقيت الاستخراج:' : 'Heure :'} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </div>

    <div class="supplier-card">
      <div>
        <div class="supplier-name">👤 ${supplier.name} ${supplier.companyName ? `(${supplier.companyName})` : ''}</div>
        <div class="supplier-details">
          <span>📞 ${isRtl ? 'الهاتف:' : 'Tél :'} ${supplier.phone} ${supplier.phone2 ? `/ ${supplier.phone2}` : ''}</span>
          ${supplier.wilaya ? ` &bull; 📍 ${supplier.wilaya}` : ''}
          ${supplier.address ? ` &bull; ${supplier.address}` : ''}
        </div>
      </div>
      <div style="text-align: ${isRtl ? 'left' : 'right'};">
        <span style="font-size: 11px; font-weight: 700; color: #64748b;">${isRtl ? 'الرصيد المتبقي للدفع:' : 'Solde restant dû :'}</span>
        <div style="font-size: 16px; font-weight: 900; color: ${(stats?.remainingDebt || 0) > 0 ? '#dc2626' : '#16a34a'};">
          ${fmt(stats?.remainingDebt || 0)}
        </div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="label">${isRtl ? 'رصيد سابق / افتتاحي' : 'Solde Initial'}</div>
        <div class="val">${fmt(stats?.initialDebt || 0)}</div>
      </div>
      <div class="kpi-box">
        <div class="label">${isRtl ? 'فواتير الشراء' : 'Factures Achats'}</div>
        <div class="val">${fmt(stats?.newPurchasesTotal || 0)}</div>
      </div>
      <div class="kpi-box">
        <div class="label">${isRtl ? 'إجمالي المشتريات' : 'Total Achats'}</div>
        <div class="val">${fmt(stats?.totalPurchases || 0)}</div>
      </div>
      <div class="kpi-box paid">
        <div class="label">${isRtl ? 'إجمالي المدفوعات' : 'Total Règlements'}</div>
        <div class="val" style="color: #16a34a;">${fmt(stats?.totalPayments || 0)}</div>
      </div>
      <div class="kpi-box debt">
        <div class="label">${isRtl ? 'صافي الدين المستحق' : 'Reste à Payer'}</div>
        <div class="val">${fmt(stats?.remainingDebt || 0)}</div>
      </div>
    </div>

    <div class="table-title">
      <span>📄</span> ${isRtl ? 'سجل العمليات والفواتير المحاسبي بالتفصيل :' : 'Historique Chronologique des Opérations :'}
    </div>

    <table>
      <thead>
        <tr>
          <th>${isRtl ? 'التاريخ' : 'Date'}</th>
          <th>${isRtl ? 'البيان / المرجع' : 'Libellé / Réf'}</th>
          <th>${isRtl ? 'ملاحظات وتفاصيل' : 'Détails / Notes'}</th>
          <th style="text-align: ${isRtl ? 'left' : 'right'};">${isRtl ? 'مشتريات (+ مدين)' : 'Débit (+ Achats)'}</th>
          <th style="text-align: ${isRtl ? 'left' : 'right'};">${isRtl ? 'مدفوعات (- دائن)' : 'Crédit (- Règlements)'}</th>
          <th style="text-align: ${isRtl ? 'left' : 'right'};">${isRtl ? 'الرصيد التراكمي' : 'Solde Cumulé'}</th>
        </tr>
      </thead>
      <tbody>
        ${ledgerRows.length === 0 ? `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 25px;">${isRtl ? 'لا توجد عمليات مسجلة لهذا المورد حتى الآن' : 'Aucune opération enregistrée.'}</td></tr>` : ''}
        ${ledgerRows.map((r) => `
          <tr>
            <td style="font-weight: 600;">${r.date}</td>
            <td><strong>${r.ref}</strong></td>
            <td style="color: #64748b;">${r.notes || '---'}</td>
            <td style="text-align: ${isRtl ? 'left' : 'right'};" class="text-debit">${r.debit > 0 ? fmt(r.debit) : '---'}</td>
            <td style="text-align: ${isRtl ? 'left' : 'right'};" class="text-credit">${r.credit > 0 ? fmt(r.credit) : '---'}</td>
            <td style="text-align: ${isRtl ? 'left' : 'right'}; font-weight: 800; color: ${r.balance > 0 ? '#dc2626' : '#16a34a'};">${fmt(r.balance)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer-signatures">
      <div class="sig-box">
        <strong>${isRtl ? 'ختم وتوقيع الإدارة (JUST SMILE)' : 'Cachet et signature de l\'administration'}</strong>
      </div>
      <div class="sig-box">
        <strong>${isRtl ? 'توقيع وختم المورد' : 'Visa et signature du fournisseur'}</strong>
      </div>
    </div>
  </div>

  <script>
    function triggerPrint() {
      window.focus();
      window.print();
    }
    if (document.readyState === 'complete') {
      setTimeout(triggerPrint, 350);
    } else {
      window.addEventListener('load', function() { setTimeout(triggerPrint, 350); });
      setTimeout(triggerPrint, 500);
    }
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (err) {
        console.error('Error triggering print', err);
      }
    }, 450);
  };

  const handlePrintPurchaseInvoice = (invoice: PurchaseInvoice) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert(
        lang === 'fr'
          ? 'Veuillez autoriser les fenêtres pop-up dans votre navigateur pour imprimer le bon de réception.'
          : 'يرجى السماح بالنوافذ المنبثقة (Popups) في المتصفح للتمكن من طباعة وصل استلام البضاعة.'
      );
      return;
    }

    const companyName = shopInfo?.companyName || 'JUST SMILE';
    const companyPhone = shopInfo?.phone || '0770821021 / 0780212989';
    const companyAddress = shopInfo?.address || 'Algeria, Djelfa';

    const html = `<!DOCTYPE html>
<html dir="${isRtl ? 'rtl' : 'ltr'}" lang="${lang}">
<head>
  <meta charset="utf-8">
  <title>${isRtl ? 'وصل استلام بضاعة / فاتورة شراء' : 'Bon de Réception / Facture Achat'} #${invoice.invoiceNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: ${isRtl ? "'Cairo', 'Segoe UI', Tahoma, sans-serif" : "'Inter', 'Segoe UI', sans-serif"}; color: #0f172a; background: #f8fafc; margin: 0; padding: 20px; font-size: 12px; }
    .no-print-bar { position: sticky; top: 0; background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.15); z-index: 1000; }
    .btn-print { background: #06b6d4; color: #ffffff; font-weight: 700; padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer; }
    .btn-close { background: #334155; color: #cbd5e1; font-weight: 700; padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer; margin-${isRtl ? 'right' : 'left'}: 8px; }
    .page-container { background: #ffffff; padding: 25px 30px; border-radius: 16px; max-width: 210mm; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0891b2; padding-bottom: 15px; margin-bottom: 18px; }
    .company-brand h1 { margin: 0 0 4px 0; color: #0891b2; font-size: 22px; font-weight: 900; }
    .company-brand p { margin: 2px 0; color: #64748b; font-size: 11px; }
    .doc-meta { text-align: ${isRtl ? 'left' : 'right'}; }
    .doc-meta h2 { margin: 0 0 4px 0; font-size: 18px; font-weight: 800; }
    .info-card { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #0891b2; color: #ffffff; font-weight: 700; font-size: 11px; text-align: ${isRtl ? 'right' : 'left'}; padding: 8px 10px; }
    td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; font-size: 11.5px; }
    tr:nth-child(even) { background: #f8fafc; }
    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-top: 15px; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .summary-row.total { font-size: 14px; font-weight: 900; color: #0891b2; border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 4px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 15px; border-top: 1px dashed #cbd5e1; }
    .sig-box { width: 45%; text-align: center; padding: 10px; border: 1px dashed #cbd5e1; border-radius: 8px; min-height: 70px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .no-print, .no-print-bar { display: none !important; }
      .page-container { box-shadow: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <div>
      <span style="font-weight: 800; font-size: 14px;">🖨️ ${isRtl ? 'معاينة وصل استلام البضاعة للطباعة' : 'Aperçu du bon de réception'}</span>
      <span style="font-size: 11px; color: #94a3b8; margin-${isRtl ? 'right' : 'left'}: 10px;">(A4 Portrait)</span>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">${isRtl ? 'طباعة الوصل 🖨️' : 'Imprimer 🖨️'}</button>
      <button class="btn-close" onclick="window.close()">${isRtl ? 'إغلاق' : 'Fermer'}</button>
    </div>
  </div>

  <div class="page-container">
    <div class="header">
      <div class="company-brand">
        <h1>${companyName}</h1>
        <p>🦷 ${isRtl ? 'مستلزمات ومواد طب وجراحة الأسنان' : 'Fournitures & Matériel Dentaire'}</p>
        <p>📍 ${companyAddress} | 📞 ${companyPhone}</p>
      </div>
      <div class="doc-meta">
        <h2>${isRtl ? 'وصل استلام بضاعة / فاتورة شراء' : 'BON DE RÉCEPTION / ACHAT'}</h2>
        <p><strong>${isRtl ? 'رقم الوصل:' : 'N° Bon :'}</strong> ${invoice.invoiceNumber}</p>
        <p><strong>${isRtl ? 'تاريخ الشراء:' : 'Date :'}</strong> ${invoice.date}</p>
      </div>
    </div>

    <div class="info-card">
      <div>
        <div style="font-size: 15px; font-weight: 800; color: #0f172a;">👤 ${isRtl ? 'المورد:' : 'Fournisseur :'} ${invoice.supplierName}</div>
        ${invoice.notes ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px;">📝 ${invoice.notes}</div>` : ''}
      </div>
      <div style="text-align: ${isRtl ? 'left' : 'right'};">
        <span style="font-size: 11px; color: #64748b;">${isRtl ? 'حالة السداد:' : 'Statut paiement :'}</span>
        <div style="font-weight: 800; color: ${invoice.paymentStatus === 'paid' ? '#16a34a' : invoice.paymentStatus === 'partial' ? '#d97706' : '#dc2626'};">
          ${invoice.paymentStatus === 'paid' ? (isRtl ? 'مسدد بالكامل' : 'Payé') : invoice.paymentStatus === 'partial' ? (isRtl ? 'مسدد جزئياً' : 'Partiel') : (isRtl ? 'غير مسدد (آجل)' : 'Non payé')}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">#</th>
          <th>${isRtl ? 'اسم المادة / المنتج' : 'Désignation Produit'}</th>
          <th style="text-align: center; width: 100px;">${isRtl ? 'الكمية المستلمة' : 'Qté Reçue'}</th>
          <th style="text-align: ${isRtl ? 'left' : 'right'}; width: 140px;">${isRtl ? 'سعر الشراء الفردي' : 'Prix Unitaire Achat'}</th>
          <th style="text-align: ${isRtl ? 'left' : 'right'}; width: 140px;">${isRtl ? 'المجموع' : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.items.map((item, idx) => `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td><strong>${item.productName}</strong> ${item.barcode ? `<span style="font-size: 10px; color: #64748b;">(${item.barcode})</span>` : ''}</td>
            <td style="text-align: center; font-weight: 800;">${item.quantity}</td>
            <td style="text-align: ${isRtl ? 'left' : 'right'}; font-weight: 600;">${fmt(item.purchasePrice)}</td>
            <td style="text-align: ${isRtl ? 'left' : 'right'}; font-weight: 800; color: #0891b2;">${fmt(item.totalPrice)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-row total">
        <span>${isRtl ? 'إجمالي مبلغ الفاتورة:' : 'Montant Total :'}</span>
        <span>${fmt(invoice.totalAmount)}</span>
      </div>
      <div class="summary-row" style="color: #16a34a; font-weight: 700;">
        <span>${isRtl ? 'المبلغ المدفوع فوراً:' : 'Montant Payé :'}</span>
        <span>${fmt(invoice.paidAmount)} ${invoice.paymentMethod ? `(${invoice.paymentMethod === 'cash' ? (isRtl ? 'نقداً' : 'Cash') : invoice.paymentMethod === 'check' ? (isRtl ? 'شيك' : 'Chèque') : invoice.paymentMethod})` : ''}</span>
      </div>
      <div class="summary-row" style="color: #dc2626; font-weight: 800;">
        <span>${isRtl ? 'المتبقي كدين على حساب المورد:' : 'Reste à Payer (Dette) :'}</span>
        <span>${fmt(invoice.remainingDebt)}</span>
      </div>
    </div>

    <div class="signatures">
      <div class="sig-box">
        <strong>${isRtl ? 'توقيع وخاتم المستلم (المخزن)' : 'Visa et signature du magasinier'}</strong>
      </div>
      <div class="sig-box">
        <strong>${isRtl ? 'توقيع وخاتم مندوب المورد' : 'Visa du livreur / fournisseur'}</strong>
      </div>
    </div>
  </div>

  <script>
    function triggerPrint() { window.focus(); window.print(); }
    if (document.readyState === 'complete') { setTimeout(triggerPrint, 350); }
    else { window.addEventListener('load', function() { setTimeout(triggerPrint, 350); }); setTimeout(triggerPrint, 500); }
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      try {
        printWindow.print();
      } catch (err) {
        console.error('Error triggering print', err);
      }
    }, 450);
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* HEADER & SUMMARY KPIS */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
            <span className="p-2.5 bg-brand-cyan/10 text-brand-cyan rounded-2xl">
              <Truck size={22} />
            </span>
            {getTranslation(lang, 'suppliersTitle')}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {lang === 'fr'
              ? 'Gérez vos fournisseurs, enregistrez les factures d\'achat, suivez les dettes et les paiements historiques.'
              : 'إدارة الموردين، فواتير الشراء التفصيلية، تسجيل الدفعات السابقة والجديدة، ومتابعة الديون المستحقة.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleOpenAddSupplier}
            className="bg-brand-cyan hover:bg-brand-cyan/90 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            {getTranslation(lang, 'newSupplier')}
          </button>
          <button
            type="button"
            onClick={() => handleOpenAddPurchase()}
            className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileText size={16} />
            {getTranslation(lang, 'newPurchaseInvoice')}
          </button>
          <button
            type="button"
            onClick={() => handleOpenAddPayment()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <DollarSign size={16} />
            {getTranslation(lang, 'newSupplierPayment')}
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase">{lang === 'fr' ? 'Fournisseurs' : 'الموردين المسجلين'}</span>
            <span className="p-2 bg-slate-100 text-slate-600 rounded-xl"><Building2 size={16} /></span>
          </div>
          <p className="text-xl font-black text-slate-900">{globalKPIs.totalSuppliers}</p>
          <p className="text-[10px] font-bold text-amber-600 mt-1">
            {globalKPIs.suppliersWithDebtCount} {lang === 'fr' ? 'avec solde dû' : 'عليهم ديون مستحقة'}
          </p>
        </div>

        <div className="bg-blue-50/50 border border-blue-100 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-blue-600 uppercase">{lang === 'fr' ? 'Total Achats' : 'إجمالي المشتريات'}</span>
            <span className="p-2 bg-blue-100 text-blue-700 rounded-xl"><TrendingUp size={16} /></span>
          </div>
          <p className="text-xl font-black text-blue-900">{fmt(globalKPIs.totalPurchasesSum)}</p>
          <p className="text-[10px] font-bold text-blue-500 mt-1">
            {purchases.length} {lang === 'fr' ? 'factures enregistrées' : 'فاتورة شراء مسجلة'}
          </p>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold text-emerald-600 uppercase">{lang === 'fr' ? 'Total Payé' : 'إجمالي المدفوعات'}</span>
            <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl"><CheckCircle2 size={16} /></span>
          </div>
          <p className="text-xl font-black text-emerald-900">{fmt(globalKPIs.totalPaymentsSum)}</p>
          <p className="text-[10px] font-bold text-emerald-600 mt-1">
            {supplierPayments.length} {lang === 'fr' ? 'paiements effectués' : 'دفعة مسددة'}
          </p>
        </div>

        <div className={`border rounded-3xl p-5 shadow-xs ${globalKPIs.totalDebtSum > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-extrabold uppercase ${globalKPIs.totalDebtSum > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
              {lang === 'fr' ? 'Dettes Restantes' : 'الديون المستحقة للموردين'}
            </span>
            <span className={`p-2 rounded-xl ${globalKPIs.totalDebtSum > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
              <AlertTriangle size={16} />
            </span>
          </div>
          <p className={`text-xl font-black ${globalKPIs.totalDebtSum > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
            {fmt(globalKPIs.totalDebtSum)}
          </p>
          <p className="text-[10px] font-bold text-slate-500 mt-1">
            {lang === 'fr' ? 'À régler aux fournisseurs' : 'مبالغ مستحقة الدفع للموردين'}
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* SEARCH, FILTER & SORT BAR */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search size={16} className={`absolute top-3 ${isRtl ? 'right-3.5' : 'left-3.5'} text-slate-400`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'fr' ? 'Rechercher fournisseur, tél, wilaya...' : 'بحث باسم المورد، الهاتف، الولاية...'}
            className={`w-full bg-slate-50 border border-slate-200 rounded-2xl py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20 ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Filter Chips */}
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {lang === 'fr' ? 'Tous' : 'الكل'} ({suppliers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('with_debt')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${filterType === 'with_debt' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {lang === 'fr' ? 'Avec dettes' : 'عليهم ديون'} ({globalKPIs.suppliersWithDebtCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('settled')}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${filterType === 'settled' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {lang === 'fr' ? 'Soldés' : 'مسددين بالكامل'}
            </button>
          </div>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-xs font-bold text-slate-700"
          >
            <option value="debt_desc">{lang === 'fr' ? 'Plus forte dette d\'abord' : 'الأعلى ديناً أولاً'}</option>
            <option value="name">{lang === 'fr' ? 'Nom alphabétique' : 'ترتيب أبجدي بالاسم'}</option>
            <option value="recent">{lang === 'fr' ? 'Plus récents' : 'الأحدث إضافة'}</option>
          </select>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* SUPPLIERS DIRECTORY TABLE / LIST */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xs overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Truck size={40} className="mx-auto mb-3 text-slate-300 stroke-1" />
            <p className="text-sm font-extrabold text-slate-600">
              {lang === 'fr' ? 'Aucun fournisseur trouvé' : 'لم يتم العثور على أي موردين'}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {lang === 'fr'
                ? 'Ajoutez vos fournisseurs pour enregistrer leurs coordonnées, leurs factures et vos paiements.'
                : 'يمكنك البدء بإضافة الموردين لتسجيل حساباتهم وفواتير الشراء والدفعات السابقة والجديدة.'}
            </p>
            <button
              type="button"
              onClick={handleOpenAddSupplier}
              className="mt-4 inline-flex items-center gap-2 bg-brand-cyan text-white text-xs font-extrabold px-4 py-2 rounded-xl cursor-pointer"
            >
              <Plus size={15} />
              {getTranslation(lang, 'newSupplier')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-700">
              <thead>
                <tr className="bg-slate-50/80 text-slate-400 font-black uppercase text-[10px] border-b border-slate-100">
                  <th className="py-3 px-4 text-start">{lang === 'fr' ? 'Fournisseur' : 'المورد / المؤسسة'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'fr' ? 'Contact' : 'الاتصال والعنوان'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'fr' ? 'Achats Antérieurs' : 'رصيد سابق / افتتاحي'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'fr' ? 'Total Achats' : 'إجمالي المشتريات'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'fr' ? 'Total Payé' : 'إجمالي المسدد'}</th>
                  <th className="py-3 px-4 text-start">{lang === 'fr' ? 'Solde Dû (Dette)' : 'الرصيد المتبقي (دين)'}</th>
                  <th className="py-3 px-4 text-center">{lang === 'fr' ? 'Actions' : 'إجراءات'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((sup) => {
                  const stats = supplierStatsMap.get(sup.id);
                  const hasDebt = stats && stats.remainingDebt > 0;

                  return (
                    <tr key={sup.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                          <span>{sup.name}</span>
                          {sup.companyName && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                              {sup.companyName}
                            </span>
                          )}
                        </div>
                        {sup.notes && (
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5 line-clamp-1">
                            {sup.notes}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <a
                          href={`tel:${sup.phone}`}
                          className="font-bold text-brand-cyan hover:underline flex items-center gap-1.5"
                        >
                          <Phone size={12} />
                          {sup.phone}
                        </a>
                        {(sup.address || sup.wilaya) && (
                          <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={10} />
                            {[sup.address, sup.wilaya].filter(Boolean).join(' - ')}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-600">
                        {fmt(stats?.initialDebt || 0)}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-blue-900">{fmt(stats?.totalPurchases || 0)}</span>
                        <span className="block text-[10px] text-slate-400 font-semibold">
                          {stats?.invoicesCount || 0} {lang === 'fr' ? 'factures' : 'فواتير'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-extrabold text-emerald-700">{fmt(stats?.totalPayments || 0)}</span>
                        <span className="block text-[10px] text-slate-400 font-semibold">
                          {stats?.paymentsCount || 0} {lang === 'fr' ? 'versements' : 'دفعات'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {hasDebt ? (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 font-black px-2.5 py-1 rounded-xl text-xs">
                            <AlertTriangle size={12} />
                            {fmt(stats?.remainingDebt || 0)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-xl text-xs">
                            <CheckCircle2 size={12} />
                            {lang === 'fr' ? 'Soldé (0 DA)' : 'مسدد بالكامل'}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Open Dossier / Statement */}
                          <button
                            type="button"
                            onClick={() => {
                              setDossierSupplier(sup);
                              setDossierTab('statement');
                            }}
                            title={lang === 'fr' ? 'Ouvrir la situation / كشف الحساب' : 'كشف حساب المورد والعمليات'}
                            className="bg-brand-cyan/10 hover:bg-brand-cyan text-brand-cyan hover:text-white p-2 rounded-xl transition-all cursor-pointer"
                          >
                            <FileText size={15} />
                          </button>

                          {/* Quick Add Purchase */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddPurchase(sup)}
                            title={lang === 'fr' ? 'Nouvelle facture d\'achat' : 'فاتورة شراء جديدة لهذا المورد'}
                            className="bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-white p-2 rounded-xl transition-all cursor-pointer"
                          >
                            <Plus size={15} />
                          </button>

                          {/* Quick Add Payment */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddPayment(sup)}
                            title={lang === 'fr' ? 'Enregistrer un paiement' : 'تسجيل دفعة لهذا المورد'}
                            className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white p-2 rounded-xl transition-all cursor-pointer"
                          >
                            <DollarSign size={15} />
                          </button>

                          {/* Print Statement */}
                          <button
                            type="button"
                            onClick={() => handlePrintStatement(sup)}
                            title={lang === 'fr' ? 'Imprimer le relevé' : 'طباعة كشف الحساب'}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-600 p-2 rounded-xl transition-all cursor-pointer"
                          >
                            <Printer size={15} />
                          </button>

                          {/* Edit Supplier */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditSupplier(sup)}
                            title={lang === 'fr' ? 'Modifier' : 'تعديل بيانات المورد'}
                            className="bg-slate-100 hover:bg-amber-500 text-slate-600 hover:text-white p-2 rounded-xl transition-all cursor-pointer"
                          >
                            <Edit3 size={15} />
                          </button>

                          {/* Delete Supplier */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSupplier(sup)}
                            title={lang === 'fr' ? 'Supprimer' : 'حذف المورد'}
                            className="bg-slate-100 hover:bg-rose-600 text-slate-400 hover:text-white p-2 rounded-xl transition-all cursor-pointer"
                          >
                            <Trash2 size={15} />
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

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: ADD / EDIT SUPPLIER */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Truck size={18} className="text-brand-cyan" />
                {editingSupplier
                  ? (lang === 'fr' ? 'Modifier le Fournisseur' : 'تعديل بيانات المورد')
                  : (lang === 'fr' ? 'Ajouter un Nouveau Fournisseur' : 'إضافة مورد جديد')}
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Nom du Fournisseur *' : 'اسم المورد / جهة التوريد *'}
                  </label>
                  <input
                    required
                    type="text"
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Ex: DentaProd' : 'مثال: شركة النور للمستلزمات'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Société / Établissement' : 'اسم الشركة / المعمل (اختياري)'}
                  </label>
                  <input
                    type="text"
                    value={supCompanyName}
                    onChange={(e) => setSupCompanyName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Ex: SARL Dental Impex' : 'مثال: شركة الاستيراد والتوزيع'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Téléphone principal *' : 'رقم الهاتف الأساسي *'}
                  </label>
                  <input
                    required
                    type="tel"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder="0770..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Téléphone secondaire' : 'رقم هاتف إضافي'}
                  </label>
                  <input
                    type="tel"
                    value={supPhone2}
                    onChange={(e) => setSupPhone2(e.target.value)}
                    placeholder="0550..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Wilaya / Ville' : 'الولاية / المدينة'}
                  </label>
                  <input
                    type="text"
                    value={supWilaya}
                    onChange={(e) => setSupWilaya(e.target.value)}
                    placeholder={lang === 'fr' ? 'Ex: Alger / Djelfa' : 'مثال: الجزائر / الجلفة'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Adresse' : 'العنوان التفصيلي'}
                  </label>
                  <input
                    type="text"
                    value={supAddress}
                    onChange={(e) => setSupAddress(e.target.value)}
                    placeholder={lang === 'fr' ? 'Rue, Zone industrielle...' : 'الشارع أو المنطقة'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                  />
                </div>
              </div>

              {/* Initial Debt / Previous Purchases Setting */}
              <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-2">
                <label className="block text-xs font-black text-amber-900">
                  {lang === 'fr'
                    ? 'Solde Initial / Achats Antérieurs (Dette Précédente) (DA) :'
                    : 'الرصيد الافتتاحي / إجمالي المشتريات السابقة (دين سابق) (دج):'}
                </label>
                <p className="text-[11px] text-amber-700 font-medium">
                  {lang === 'fr'
                    ? 'Si vous avez déjà acheté des produits auprès de ce fournisseur par le passé sans enregistrement détaillé, vous pouvez inscrire ici le montant initial pour l\'intégrer à sa situation.'
                    : 'إذا كانت لديك مشتريات أو ديون سابقة مع هذا المورد قبل بدء التسجيل التفصيلي، يمكنك إدخال المبلغ الإجمالي هنا وسيحسب في كشف حسابه تلقائياً.'}
                </p>
                <input
                  type="number"
                  min="0"
                  value={supInitialDebt || ''}
                  onChange={(e) => setSupInitialDebt(parseFloat(e.target.value) || 0)}
                  placeholder="0 DA"
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-sm font-black text-amber-900 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  {lang === 'fr' ? 'Notes / Remarques' : 'ملاحظات إضافية'}
                </label>
                <textarea
                  rows={2}
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  placeholder={lang === 'fr' ? 'Conditions de paiement, détails de contact...' : 'شروط الدفع، ملاحظات خاصة...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="bg-brand-cyan hover:bg-brand-cyan/90 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Save size={15} />
                  {savingSupplier ? (lang === 'fr' ? 'Enregistrement...' : 'جاري الحفظ...') : (lang === 'fr' ? 'Enregistrer' : 'حفظ المورد')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: ADD PURCHASE INVOICE (FACTURE D'ACHAT) */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-brand-cyan" />
                  {lang === 'fr' ? 'Nouvelle Facture d\'Achat (Bon de Réception)' : 'تسجيل فاتورة شراء جديدة (وصل استلام بضاعة)'}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {lang === 'fr' ? 'Enregistrez les produits achetés, mettez à jour le stock et la dette fournisseur.' : 'سجل تفاصيل المواد المشتراة وتحديث المخزون وحساب المورد تلقائياً.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-4">
              {/* Header Info: Supplier, Invoice #, Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Fournisseur *' : 'المورد *'}
                  </label>
                  <select
                    required
                    value={purSupplierId}
                    onChange={(e) => setPurSupplierId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="">{lang === 'fr' ? '-- Choisir un fournisseur --' : '-- اختر المورد --'}</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.companyName ? `(${s.companyName})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'N° Facture / Bon' : 'رقم الفاتورة / الوصل'}
                  </label>
                  <input
                    type="text"
                    value={purInvoiceNumber}
                    onChange={(e) => setPurInvoiceNumber(e.target.value)}
                    placeholder="FA-001"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Date d\'achat' : 'تاريخ الشراء'}
                  </label>
                  <input
                    type="date"
                    required
                    value={purDate}
                    onChange={(e) => setPurDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Line Items & Quick Product Search */}
              <div className="space-y-3 bg-slate-50/80 p-4 rounded-3xl border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                  <div>
                    <label className="text-xs font-black text-slate-900 flex items-center gap-2">
                      <ShoppingBag size={16} className="text-brand-cyan" />
                      {lang === 'fr' ? 'Articles & Produits Achetés :' : 'المواد والمنتجات المشتراة :'}
                    </label>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {lang === 'fr'
                        ? 'Recherchez un produit existant pour l\'ajouter rapidement ou saisissez une nouvelle désignation.'
                        : 'ابحث عن منتج من المخزن لإضافته فوراً أو أضف منتجاً جديداً يدوياً.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddPurItemRow}
                      className="text-xs font-extrabold text-brand-cyan hover:bg-brand-cyan/10 px-2.5 py-1.5 rounded-xl border border-brand-cyan/20 flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Plus size={14} />
                      {lang === 'fr' ? 'Ligne personnalisée' : 'إضافة سطر فارغ'}
                    </button>
                  </div>
                </div>

                {/* 🔍 Quick Product Search & Add Bar */}
                <div className="relative">
                  <div className="relative">
                    <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} size={16} />
                    <input
                      type="text"
                      value={purProductSearch}
                      onChange={(e) => {
                        setPurProductSearch(e.target.value);
                        setShowPurSearchDropdown(true);
                      }}
                      onFocus={() => setShowPurSearchDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && filteredProductsForPurchase.length > 0) {
                          e.preventDefault();
                          handleAddProductToPurItems(filteredProductsForPurchase[0]);
                        }
                      }}
                      placeholder={
                        lang === 'fr'
                          ? '🔍 Rechercher un produit par nom, catégorie ou code-barres pour l\'ajouter...'
                          : '🔍 ابحث عن المنتجات بالاسم، الفئة، أو الباركود لإضافتها مباشرة للفاتورة...'
                      }
                      className={`w-full bg-white border-2 border-brand-cyan/40 focus:border-brand-cyan rounded-2xl ${isRtl ? 'pr-9 pl-16' : 'pl-9 pr-16'} py-2.5 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-hidden shadow-xs transition-all`}
                    />
                    {purProductSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setPurProductSearch('');
                          setShowPurSearchDropdown(false);
                        }}
                        className={`absolute ${isRtl ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100`}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Dropdown with matching products */}
                  {showPurSearchDropdown && purProductSearch.trim() && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                      {filteredProductsForPurchase.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          <p className="font-bold text-slate-700">{lang === 'fr' ? 'Aucun produit trouvé' : 'لم يتم العثور على منتج مطابق'}</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {lang === 'fr'
                              ? 'Vous pouvez créer un produit personnalisé en cliquant sur "Ligne personnalisée".'
                              : 'يمكنك كتابة اسم المادة يدوياً في السطر أدناه لإضافتها كمنتج جديد.'}
                          </p>
                        </div>
                      ) : (
                        filteredProductsForPurchase.map((p) => {
                          const isAlreadyAdded = purItems.some((it) => it.productId === p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleAddProductToPurItems(p)}
                              className="w-full text-start p-2.5 hover:bg-cyan-50/70 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="p-2 bg-slate-100 group-hover:bg-brand-cyan/10 text-slate-600 group-hover:text-brand-cyan rounded-xl transition-all shrink-0">
                                  <Package size={16} />
                                </span>
                                <div className="min-w-0">
                                  <div className="font-black text-xs text-slate-900 truncate flex items-center gap-1.5">
                                    <span>{p.name}</span>
                                    {isAlreadyAdded && (
                                      <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-md shrink-0">
                                        {lang === 'fr' ? 'Déjà dans la facture (+1)' : 'مضاف بالفاتورة (+1)'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 mt-0.5 font-medium">
                                    {p.category && (
                                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-md font-semibold">{p.category}</span>
                                    )}
                                    {p.barcode && (
                                      <span className="text-slate-400 font-mono">🔖 {p.barcode}</span>
                                    )}
                                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded-md">
                                      {lang === 'fr' ? 'Stock actuel :' : 'المخزون الحالي:'} {p.stock || 0}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-end shrink-0 flex items-center gap-3">
                                <div>
                                  <div className="text-[10px] font-bold text-slate-400">
                                    {lang === 'fr' ? 'P. Achat :' : 'سعر الشراء:'}
                                  </div>
                                  <div className="text-xs font-black text-blue-900">
                                    {fmt(p.purchasePrice || 0)}
                                  </div>
                                </div>
                                <span className="bg-brand-cyan text-white text-[11px] font-black px-2.5 py-1 rounded-xl group-hover:scale-105 transition-all shadow-xs flex items-center gap-1">
                                  <Plus size={13} />
                                  {lang === 'fr' ? 'Ajouter' : 'إضافة'}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Items List Rows */}
                <div className="space-y-2.5 max-h-72 overflow-y-auto p-1">
                  {purItems.map((item, idx) => {
                    const matchedProduct = productsList.find((p) => p.id === item.productId);
                    const isRecentlyAdded = item.productId && item.productId === recentlyAddedProductId;

                    return (
                      <div
                        key={idx}
                        className={`bg-white p-3 rounded-2xl border transition-all space-y-2.5 ${
                          isRecentlyAdded
                            ? 'border-brand-cyan ring-2 ring-brand-cyan/20 bg-cyan-50/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="grid grid-cols-12 gap-2 items-center text-xs">
                          {/* Product Selection / Name */}
                          <div className="col-span-12 sm:col-span-5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="block text-[10px] font-extrabold text-slate-500 uppercase">
                                {lang === 'fr' ? `Article #${idx + 1}` : `المادة #${idx + 1}`}
                              </label>
                              {matchedProduct && (
                                <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/60">
                                  📦 {lang === 'fr' ? 'Stock actuel :' : 'المخزون:'} {matchedProduct.stock || 0}
                                </span>
                              )}
                            </div>

                            <div className="space-y-1">
                              {/* Quick selector dropdown from catalog */}
                              <select
                                value={item.productId || ''}
                                onChange={(e) => handlePurItemChange(idx, 'productId', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-brand-cyan"
                              >
                                <option value="">{lang === 'fr' ? '-- Choisir depuis le stock (ou saisir nom) --' : '-- اختر من المنتجات المسجلة (أو اكتب يدوياً) --'}</option>
                                {productsList.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} (Stock: {p.stock}) - {p.category || ''}
                                  </option>
                                ))}
                              </select>

                              {/* Free-form Product Name */}
                              <input
                                type="text"
                                required
                                value={item.productName}
                                onChange={(e) => handlePurItemChange(idx, 'productName', e.target.value)}
                                placeholder={lang === 'fr' ? 'Désignation du produit...' : 'اسم أو وصف المنتج...'}
                                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                              />
                            </div>
                          </div>

                          {/* Quantity */}
                          <div className="col-span-4 sm:col-span-2">
                            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                              {lang === 'fr' ? 'Qté' : 'الكمية'}
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                required
                                value={item.quantity || ''}
                                onChange={(e) => handlePurItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-black text-slate-900 text-center focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                              />
                            </div>
                          </div>

                          {/* Unit Purchase Price */}
                          <div className="col-span-4 sm:col-span-2">
                            <label className="block text-[10px] font-extrabold text-slate-500 uppercase mb-1">
                              {lang === 'fr' ? 'P. Achat (DA)' : 'سعر الشراء (دج)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              required
                              value={item.purchasePrice || ''}
                              onChange={(e) => handlePurItemChange(idx, 'purchasePrice', parseFloat(e.target.value) || 0)}
                              placeholder="0 DA"
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-black text-slate-900 text-center focus:outline-hidden focus:ring-2 focus:ring-brand-cyan/20"
                            />
                          </div>

                          {/* Subtotal & Delete */}
                          <div className="col-span-4 sm:col-span-3 flex items-center justify-between gap-1 pt-3 sm:pt-0">
                            <div>
                              <label className="block text-[10px] font-extrabold text-slate-400 uppercase">
                                {lang === 'fr' ? 'Total ligne' : 'المجموع'}
                              </label>
                              <span className="font-black text-brand-cyan text-xs">
                                {fmt(item.totalPrice)}
                              </span>
                            </div>
                            {purItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemovePurItemRow(idx)}
                                title={lang === 'fr' ? 'Supprimer cet article' : 'حذف هذا السطر'}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Items Footer Summary Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-xs font-bold text-slate-600">
                  <div className="flex items-center gap-3">
                    <span>
                      {lang === 'fr' ? 'Total articles :' : 'عدد المواد:'}{' '}
                      <strong className="text-slate-900">{purItems.filter((i) => i.productName.trim()).length}</strong>
                    </span>
                    <span>
                      {lang === 'fr' ? 'Total unités :' : 'إجمالي القطع:'}{' '}
                      <strong className="text-slate-900">{purItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">{lang === 'fr' ? 'Total HT/TTC :' : 'إجمالي البضاعة:'}</span>
                    <span className="text-sm font-black text-brand-cyan">{fmt(totalInvoiceCalculated)}</span>
                  </div>
                </div>
              </div>

              {/* Stock update checkbox */}
              <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl flex items-center gap-3">
                <input
                  type="checkbox"
                  id="purStockCheck"
                  checked={purUpdateStock}
                  onChange={(e) => setPurUpdateStock(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded-md focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="purStockCheck" className="text-xs font-black text-emerald-900 cursor-pointer">
                  {lang === 'fr'
                    ? 'Mettre à jour automatiquement le stock des produits dans le magasin (+ ajouter les quantités reçues et actualiser le prix d\'achat)'
                    : 'تحديث المخزون تلقائياً في المستودع (إضافة الكميات المشتراة للمخزون وتحديث سعر الشراء المسجل)'}
                </label>
              </div>

              {/* Payment details at purchase */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-3xl text-white space-y-3 shadow-md">
                <div className="flex justify-between items-center text-sm border-b border-white/10 pb-2">
                  <span className="font-extrabold text-slate-300">{lang === 'fr' ? 'Montant Total Facture :' : 'إجمالي مبلغ الفاتورة:'}</span>
                  <span className="text-lg font-black text-brand-cyan">{fmt(totalInvoiceCalculated)}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-300 mb-1">
                      {lang === 'fr' ? 'Montant payé immédiatement (DA) :' : 'المبلغ المدفوع فوراً عند الشراء (دج):'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={totalInvoiceCalculated}
                      value={purPaidAmount || ''}
                      onChange={(e) => setPurPaidAmount(parseFloat(e.target.value) || 0)}
                      placeholder="0 DA"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-black text-white focus:outline-hidden focus:ring-2 focus:ring-brand-cyan"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-300 mb-1">
                      {lang === 'fr' ? 'Mode de paiement du versement :' : 'طريقة دفع المبلغ المسدد:'}
                    </label>
                    <select
                      value={purPaymentMethod}
                      onChange={(e) => setPurPaymentMethod(e.target.value as any)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white"
                    >
                      <option value="cash" className="text-slate-900">{lang === 'fr' ? 'Espèces (Cash)' : 'نقداً (كاش)'}</option>
                      <option value="check" className="text-slate-900">{lang === 'fr' ? 'Chèque Bancaire' : 'شيك بنكي'}</option>
                      <option value="bank_transfer" className="text-slate-900">{lang === 'fr' ? 'Virement Bancaire' : 'تحويل بنكي'}</option>
                      <option value="credit" className="text-slate-900">{lang === 'fr' ? 'Dette / À crédit' : 'دين / آجل'}</option>
                    </select>
                  </div>
                </div>

                {purPaymentMethod === 'check' && (
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-300 mb-1">
                      {lang === 'fr' ? 'N° de Chèque :' : 'رقم الشيك البنكي:'}
                    </label>
                    <input
                      type="text"
                      value={purCheckNumber}
                      onChange={(e) => setPurCheckNumber(e.target.value)}
                      placeholder="1234567"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center text-xs font-bold text-amber-300 border-t border-white/10 pt-2">
                  <span>{lang === 'fr' ? 'Reste à payer (Dette à inscrire sur le fournisseur) :' : 'المتبقي كدين يسجل في حساب المورد:'}</span>
                  <span className="text-sm font-black">{fmt(remainingInvoiceDebt)}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  {lang === 'fr' ? 'Remarques sur la facture' : 'ملاحظات على الفاتورة أو وصل الاستلام'}
                </label>
                <input
                  type="text"
                  value={purNotes}
                  onChange={(e) => setPurNotes(e.target.value)}
                  placeholder={lang === 'fr' ? 'Facultatif...' : 'اختياري...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={savingPurchase}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Save size={15} />
                  {savingPurchase ? (lang === 'fr' ? 'Enregistrement...' : 'جاري الحفظ...') : (lang === 'fr' ? 'Enregistrer la facture' : 'حفظ فاتورة الشراء')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 3: RECORD SUPPLIER PAYMENT (ENREGISTRER UN RÈGLEMENT) */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-600" />
                {editingPayment
                  ? (lang === 'fr' ? 'Modifier le Paiement' : 'تعديل الدفعة')
                  : (lang === 'fr' ? 'Enregistrer un Paiement Fournisseur' : 'تسجيل دفعة / تسديد لمورد')}
              </h3>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  {lang === 'fr' ? 'Fournisseur *' : 'المورد *'}
                </label>
                <select
                  required
                  value={paySupplierId}
                  onChange={(e) => setPaySupplierId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                >
                  <option value="">{lang === 'fr' ? '-- Choisir un fournisseur --' : '-- اختر المورد --'}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} {s.companyName ? `(${s.companyName})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Montant payé (DA) *' : 'المبلغ المدفوع (دج) *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={payAmount || ''}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    placeholder="DA"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Date du paiement' : 'تاريخ الدفعة'}
                  </label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    {lang === 'fr' ? 'Mode de paiement' : 'طريقة الدفع'}
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="cash">{lang === 'fr' ? 'Espèces (Cash)' : 'نقداً (كاش)'}</option>
                    <option value="check">{lang === 'fr' ? 'Chèque' : 'شيك بنكي'}</option>
                    <option value="bank_transfer">{lang === 'fr' ? 'Virement' : 'تحويل بنكي'}</option>
                    <option value="other">{lang === 'fr' ? 'Autre' : 'أخرى'}</option>
                  </select>
                </div>

                {payMethod === 'check' && (
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                      {lang === 'fr' ? 'N° de Chèque' : 'رقم الشيك'}
                    </label>
                    <input
                      type="text"
                      value={payCheckNumber}
                      onChange={(e) => setPayCheckNumber(e.target.value)}
                      placeholder="123456..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                  {lang === 'fr' ? 'Notes / Justification' : 'ملاحظات على الدفعة (مثال: دفعة سابقة، وصل رقم...)'}
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder={lang === 'fr' ? 'Ex: Paiement sur ancien compte...' : 'مثال: تسديد جزء من الحساب القديم...'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Save size={15} />
                  {savingPayment ? (lang === 'fr' ? 'Enregistrement...' : 'جاري الحفظ...') : (lang === 'fr' ? 'Enregistrer le paiement' : 'تسجيل الدفعة')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 4: SUPPLIER FINANCIAL DOSSIER (SITUATION FOURNISSEUR) */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {dossierSupplier && (() => {
        const stats = supplierStatsMap.get(dossierSupplier.id);
        const sInvoices = purchases.filter((p) => p.supplierId === dossierSupplier.id).sort((a, b) => b.date.localeCompare(a.date));
        const sPayments = supplierPayments.filter((p) => p.supplierId === dossierSupplier.id).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

        // Combined ledger
        const transactions: {
          id: string;
          date: string;
          type: 'initial' | 'purchase' | 'payment';
          ref: string;
          debit: number;
          credit: number;
          notes?: string;
          rawObj?: any;
        }[] = [];

        if (Number(dossierSupplier.initialDebt || 0) > 0) {
          transactions.push({
            id: 'init',
            date: dossierSupplier.createdAt ? dossierSupplier.createdAt.slice(0, 10) : '---',
            type: 'initial',
            ref: isRtl ? 'رصيد افتتاحي / مشتريات سابقة' : 'Solde Initial / Achats Antérieurs',
            debit: Number(dossierSupplier.initialDebt),
            credit: 0,
            notes: isRtl ? 'مشتريات مسجلة سابقة' : 'Solde reporté'
          });
        }

        sInvoices.forEach((inv) => {
          transactions.push({
            id: inv.id,
            date: inv.date,
            type: 'purchase',
            ref: `${isRtl ? 'فاتورة شراء' : 'Facture Achat'} #${inv.invoiceNumber}`,
            debit: Number(inv.totalAmount),
            credit: 0,
            notes: inv.notes || `${inv.items.length} ${isRtl ? 'مواد' : 'articles'}`,
            rawObj: inv
          });
        });

        sPayments.forEach((pay) => {
          transactions.push({
            id: pay.id,
            date: pay.paymentDate,
            type: 'payment',
            ref: `${isRtl ? 'دفعة مسددة' : 'Paiement'} (${pay.paymentMethod})`,
            debit: 0,
            credit: Number(pay.amount),
            notes: pay.checkNumber ? `${isRtl ? 'شيك رقم' : 'Chèque N°'}: ${pay.checkNumber}` : pay.notes,
            rawObj: pay
          });
        });

        transactions.sort((a, b) => b.date.localeCompare(a.date));

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[92vh] overflow-y-auto">
              {/* Dossier Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">{dossierSupplier.name}</h3>
                    {dossierSupplier.companyName && (
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-xl">
                        {dossierSupplier.companyName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-3">
                    <span>📞 {dossierSupplier.phone}</span>
                    {dossierSupplier.wilaya && <span>📍 {dossierSupplier.wilaya}</span>}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAddPurchase(dossierSupplier)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} />
                    {lang === 'fr' ? 'Nouvelle Facture' : 'فاتورة شراء'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAddPayment(dossierSupplier)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <DollarSign size={14} />
                    {lang === 'fr' ? 'Nouveau Paiement' : 'تسجيل دفعة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintStatement(dossierSupplier)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={14} />
                    {lang === 'fr' ? 'Imprimer' : 'طباعة الكشف'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDossierSupplier(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Dossier Financial Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">{lang === 'fr' ? 'Achats Antérieurs' : 'رصيد سابق / افتتاحي'}</span>
                  <p className="font-black text-slate-800 text-sm mt-1">{fmt(stats?.initialDebt || 0)}</p>
                </div>
                <div className="bg-blue-50 p-3.5 rounded-2xl border border-blue-100">
                  <span className="text-[10px] font-extrabold text-blue-600 uppercase">{lang === 'fr' ? 'Total Achats' : 'إجمالي المشتريات'}</span>
                  <p className="font-black text-blue-900 text-sm mt-1">{fmt(stats?.totalPurchases || 0)}</p>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-extrabold text-emerald-600 uppercase">{lang === 'fr' ? 'Total Payé' : 'إجمالي المدفوع'}</span>
                  <p className="font-black text-emerald-900 text-sm mt-1">{fmt(stats?.totalPayments || 0)}</p>
                </div>
                <div className={`p-3.5 rounded-2xl border ${stats && stats.remainingDebt > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-100/50 border-emerald-300'}`}>
                  <span className={`text-[10px] font-extrabold uppercase ${stats && stats.remainingDebt > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {lang === 'fr' ? 'Solde Dû (Reste)' : 'صافي الدين المستحق'}
                  </span>
                  <p className={`font-black text-sm mt-1 ${stats && stats.remainingDebt > 0 ? 'text-rose-700' : 'text-emerald-900'}`}>
                    {fmt(stats?.remainingDebt || 0)}
                  </p>
                </div>
              </div>

              {/* Dossier Tabs */}
              <div className="flex border-b border-slate-100 gap-2">
                <button
                  type="button"
                  onClick={() => setDossierTab('statement')}
                  className={`pb-2.5 px-3 text-xs font-black transition-all border-b-2 cursor-pointer ${dossierTab === 'statement' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
                >
                  {lang === 'fr' ? '📄 Relevé Chronologique' : '📄 كشف الحساب والعمليات'} ({transactions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDossierTab('invoices')}
                  className={`pb-2.5 px-3 text-xs font-black transition-all border-b-2 cursor-pointer ${dossierTab === 'invoices' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
                >
                  {lang === 'fr' ? '📦 Factures d\'Achat' : '📦 فواتير الشراء'} ({sInvoices.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDossierTab('payments')}
                  className={`pb-2.5 px-3 text-xs font-black transition-all border-b-2 cursor-pointer ${dossierTab === 'payments' ? 'border-brand-cyan text-brand-cyan' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
                >
                  {lang === 'fr' ? '💳 Paiements' : '💳 سجل الدفعات'} ({sPayments.length})
                </button>
              </div>

              {/* Tab 1: Combined Chronological Statement */}
              {dossierTab === 'statement' && (
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Date' : 'التاريخ'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Opération / Réf' : 'العملية / المرجع'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Détails' : 'تفاصيل'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Débit (+ Achats)' : 'مشتريات (+ مدين)'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Crédit (- Paiements)' : 'دفعات (- دائن)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-xs">{lang === 'fr' ? 'Aucune opération.' : 'لا توجد حركات.'}</td></tr>
                      ) : (
                        transactions.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-600">{t.date}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{t.ref}</td>
                            <td className="py-2.5 px-3 text-slate-500">{t.notes || '---'}</td>
                            <td className="py-2.5 px-3 font-black text-blue-900">{t.debit > 0 ? fmt(t.debit) : '---'}</td>
                            <td className="py-2.5 px-3 font-black text-emerald-700">{t.credit > 0 ? fmt(t.credit) : '---'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 2: Purchase Invoices List */}
              {dossierTab === 'invoices' && (
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Date' : 'التاريخ'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'N° Facture' : 'رقم الفاتورة'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Articles' : 'المواد'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Total' : 'المجموع'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Payé' : 'المدفوع'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Reste' : 'المتبقي'}</th>
                        <th className="py-2.5 px-3 text-center">{lang === 'fr' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sInvoices.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs">{lang === 'fr' ? 'Aucune facture.' : 'لا توجد فواتير مسجلة.'}</td></tr>
                      ) : (
                        sInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-600">{inv.date}</td>
                            <td className="py-2.5 px-3 font-black text-slate-900">{inv.invoiceNumber}</td>
                            <td className="py-2.5 px-3 text-slate-600">{inv.items.length} {lang === 'fr' ? 'articles' : 'مواد'}</td>
                            <td className="py-2.5 px-3 font-black text-blue-900">{fmt(inv.totalAmount)}</td>
                            <td className="py-2.5 px-3 font-black text-emerald-700">{fmt(inv.paidAmount)}</td>
                            <td className="py-2.5 px-3 font-black text-rose-600">{fmt(inv.remainingDebt)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setViewingInvoice(inv)}
                                  title={lang === 'fr' ? 'Voir détails' : 'معاينة الفاتورة'}
                                  className="text-brand-cyan hover:bg-brand-cyan/10 p-1.5 rounded-lg cursor-pointer"
                                >
                                  <Eye size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintPurchaseInvoice(inv)}
                                  title={lang === 'fr' ? 'Imprimer le bon de réception' : 'طباعة وصل استلام البضاعة'}
                                  className="text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg cursor-pointer"
                                >
                                  <Printer size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePurchase(inv)}
                                  title={lang === 'fr' ? 'Supprimer' : 'حذف الفاتورة'}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg cursor-pointer"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Tab 3: Payments List */}
              {dossierTab === 'payments' && (
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Date' : 'التاريخ'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Montant' : 'المبلغ'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Mode' : 'طريقة الدفع'}</th>
                        <th className="py-2.5 px-3 text-start">{lang === 'fr' ? 'Notes' : 'ملاحظات'}</th>
                        <th className="py-2.5 px-3 text-center">{lang === 'fr' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sPayments.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-xs">{lang === 'fr' ? 'Aucun paiement.' : 'لا توجد دفعات مسجلة.'}</td></tr>
                      ) : (
                        sPayments.map((pay) => (
                          <tr key={pay.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-semibold text-slate-600">{pay.paymentDate}</td>
                            <td className="py-2.5 px-3 font-black text-emerald-700 text-sm">{fmt(pay.amount)}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              {pay.paymentMethod === 'cash' ? (lang === 'fr' ? 'Espèces' : 'نقداً') :
                                pay.paymentMethod === 'check' ? `${lang === 'fr' ? 'Chèque' : 'شيك'} (${pay.checkNumber || '---'})` :
                                  pay.paymentMethod === 'bank_transfer' ? (lang === 'fr' ? 'Virement' : 'تحويل بنكي') : pay.paymentMethod}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{pay.notes || '---'}</td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPayment(pay)}
                                  title={lang === 'fr' ? 'Modifier' : 'تعديل الدفعة'}
                                  className="text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg cursor-pointer"
                                >
                                  <Edit3 size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayment(pay)}
                                  title={lang === 'fr' ? 'Supprimer' : 'حذف الدفعة'}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg cursor-pointer"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 5: VIEW PURCHASE INVOICE DETAILS */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {viewingInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-brand-cyan" />
                  {lang === 'fr' ? 'Facture d\'Achat' : 'تفاصيل فاتورة الشراء'} #{viewingInvoice.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {viewingInvoice.supplierName} • {viewingInvoice.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Items Breakdown */}
            <div className="space-y-2">
              <span className="text-xs font-black text-slate-700">{lang === 'fr' ? 'Articles de la facture :' : 'تفاصيل المواد:'}</span>
              <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                      <th className="py-2 px-3 text-start">{lang === 'fr' ? 'Produit' : 'المنتج'}</th>
                      <th className="py-2 px-3 text-center">{lang === 'fr' ? 'Qté' : 'الكمية'}</th>
                      <th className="py-2 px-3 text-end">{lang === 'fr' ? 'P.U' : 'سعر الوحدة'}</th>
                      <th className="py-2 px-3 text-end">{lang === 'fr' ? 'Total' : 'المجموع'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingInvoice.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-bold text-slate-900">{item.productName}</td>
                        <td className="py-2 px-3 text-center font-black">{item.quantity}</td>
                        <td className="py-2 px-3 text-end font-semibold">{fmt(item.purchasePrice)}</td>
                        <td className="py-2 px-3 text-end font-black text-blue-900">{fmt(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 p-4 rounded-2xl space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{lang === 'fr' ? 'Total Facture :' : 'إجمالي الفاتورة:'}</span>
                <span className="font-black text-slate-900 text-sm">{fmt(viewingInvoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>{lang === 'fr' ? 'Montant Payé :' : 'المبلغ المدفوع:'}</span>
                <span className="font-black">{fmt(viewingInvoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1.5">
                <span>{lang === 'fr' ? 'Reste à Payer (Dette) :' : 'المتبقي كدين:'}</span>
                <span className="font-black">{fmt(viewingInvoice.remainingDebt)}</span>
              </div>
            </div>

            {viewingInvoice.notes && (
              <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-xl">
                📝 {viewingInvoice.notes}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handlePrintPurchaseInvoice(viewingInvoice)}
                className="bg-brand-cyan hover:bg-brand-cyan/90 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <Printer size={14} />
                {lang === 'fr' ? 'Imprimer le bon' : 'طباعة وصل الاستلام'}
              </button>
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                {lang === 'fr' ? 'Fermer' : 'إغلاق'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
