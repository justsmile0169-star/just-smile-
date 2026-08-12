import React, { useMemo, useState } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, Payment, ProductReturn, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { useAppDialog } from '../context/AppDialogContext';
import { exportFinancialStatement } from '../utils/exportFinancialStatement';
import { logActivity } from '../utils/activityLogger';
import {
  Search, User, ShoppingBag, CreditCard, RotateCcw, FileText, Plus, X, Printer, Pencil, Trash2, Edit3
} from 'lucide-react';

interface ClientSituationViewProps {
  lang: Language;
  usersList: UserProfile[];
  ordersList: Order[];
  paymentsList: Payment[];
  returnsList: ProductReturn[];
  onPrintInvoice?: (order: Order) => void;
  currentUser?: UserProfile | null;
}

export default function ClientSituationView({
  lang,
  usersList,
  ordersList,
  paymentsList,
  returnsList,
  onPrintInvoice,
  currentUser
}: ClientSituationViewProps) {
  const { alert } = useAppDialog();
  const isRtl = lang === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnOrderId, setReturnOrderId] = useState('');
  const [returnAmount, setReturnAmount] = useState(0);
  const [returnReason, setReturnReason] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);

  const [showGeneralPaymentForm, setShowGeneralPaymentForm] = useState(false);
  const [generalPaymentAmount, setGeneralPaymentAmount] = useState(0);
  const [generalPaymentNotes, setGeneralPaymentNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // --- Edit & Delete Payment State ---
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState<number>(0);
  const [editPaymentNotes, setEditPaymentNotes] = useState<string>('');
  const [savingEditPayment, setSavingEditPayment] = useState(false);

  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);
  const [deletingPaymentLoading, setDeletingPaymentLoading] = useState(false);

  // --- Edit Order Paid Amount State ---
  const [editingOrderPayment, setEditingOrderPayment] = useState<Order | null>(null);
  const [editOrderPaidAmount, setEditOrderPaidAmount] = useState<number>(0);
  const [savingEditOrderPayment, setSavingEditOrderPayment] = useState(false);

  const handleOpenEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setEditPaymentAmount(payment.amount);
    setEditPaymentNotes(payment.notes || '');
  };

  const handleSaveEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || editPaymentAmount < 0) {
      alert(lang === 'fr' ? 'Montant invalide.' : 'قيمة غير صالحة.', 'error');
      return;
    }

    setSavingEditPayment(true);
    try {
      const isSynthetic = editingPayment.id.startsWith('synth-');

      if (isSynthetic) {
        const targetOrderId = editingPayment.orderId || editingPayment.id.replace('synth-', '');
        const targetOrder = ordersList.find((o) => o.id === targetOrderId);
        if (targetOrder) {
          const newPaid = editPaymentAmount;
          const newRemaining = Math.max(0, targetOrder.totalAfterDiscount - newPaid);
          const newPaymentStatus = newRemaining <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

          await updateDoc(doc(db, 'orders', targetOrder.id), {
            paidAmount: newPaid,
            remainingBalance: newRemaining,
            paymentStatus: newPaymentStatus
          });

          if (currentUser) {
            await logActivity(
              currentUser,
              'payment_edit',
              'order',
              `Modifié le paiement direct de la commande #${targetOrder.id.slice(-6).toUpperCase()} : ${targetOrder.paidAmount} DA -> ${newPaid} DA`,
              targetOrder.id
            );
          }
        }
      } else {
        const delta = editPaymentAmount - editingPayment.amount;

        await updateDoc(doc(db, 'payments', editingPayment.id), {
          amount: editPaymentAmount,
          notes: editPaymentNotes.trim() || undefined
        });

        if (editingPayment.orderId) {
          const targetOrder = ordersList.find((o) => o.id === editingPayment.orderId);
          if (targetOrder) {
            const currentPaid = targetOrder.paidAmount || 0;
            const updatedPaid = Math.max(0, currentPaid + delta);
            const updatedRemaining = Math.max(0, targetOrder.totalAfterDiscount - updatedPaid);
            const updatedStatus = updatedRemaining <= 0 ? 'paid' : updatedPaid > 0 ? 'partial' : 'unpaid';

            await updateDoc(doc(db, 'orders', targetOrder.id), {
              paidAmount: updatedPaid,
              remainingBalance: updatedRemaining,
              paymentStatus: updatedStatus
            });
          }
        }

        if (currentUser) {
          await logActivity(
            currentUser,
            'payment_edit',
            'payment',
            `Modifié le versement #${editingPayment.id.slice(-6).toUpperCase()} : ${editingPayment.amount} DA -> ${editPaymentAmount} DA`,
            editingPayment.id
          );
        }
      }

      alert(lang === 'fr' ? 'Paiement modifié avec succès !' : 'تم تعديل الدفعة بنجاح!', 'success');
      setEditingPayment(null);
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la modification.' : 'حدث خطأ أثناء تعديل الدفعة.', 'error');
    } finally {
      setSavingEditPayment(false);
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!deletingPayment) return;

    setDeletingPaymentLoading(true);
    try {
      const isSynthetic = deletingPayment.id.startsWith('synth-');

      if (isSynthetic) {
        const targetOrderId = deletingPayment.orderId || deletingPayment.id.replace('synth-', '');
        const targetOrder = ordersList.find((o) => o.id === targetOrderId);
        if (targetOrder) {
          await updateDoc(doc(db, 'orders', targetOrder.id), {
            paidAmount: 0,
            remainingBalance: targetOrder.totalAfterDiscount,
            paymentStatus: 'unpaid'
          });

          if (currentUser) {
            await logActivity(
              currentUser,
              'payment_delete',
              'order',
              `Réinitialisé le paiement direct de la commande #${targetOrder.id.slice(-6).toUpperCase()} (${deletingPayment.amount} DA)`,
              targetOrder.id
            );
          }
        }
      } else {
        await deleteDoc(doc(db, 'payments', deletingPayment.id));

        if (deletingPayment.orderId) {
          const targetOrder = ordersList.find((o) => o.id === deletingPayment.orderId);
          if (targetOrder) {
            const currentPaid = targetOrder.paidAmount || 0;
            const updatedPaid = Math.max(0, currentPaid - deletingPayment.amount);
            const updatedRemaining = Math.max(0, targetOrder.totalAfterDiscount - updatedPaid);
            const updatedStatus = updatedRemaining <= 0 ? 'paid' : updatedPaid > 0 ? 'partial' : 'unpaid';

            await updateDoc(doc(db, 'orders', targetOrder.id), {
              paidAmount: updatedPaid,
              remainingBalance: updatedRemaining,
              paymentStatus: updatedStatus
            });
          }
        }

        if (currentUser) {
          await logActivity(
            currentUser,
            'payment_delete',
            'payment',
            `Supprimé le versement de ${deletingPayment.amount} DA`,
            deletingPayment.id
          );
        }
      }

      alert(lang === 'fr' ? 'Paiement supprimé avec succès !' : 'تم حذف الدفعة بنجاح!', 'success');
      setDeletingPayment(null);
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء حذف الدفعة.', 'error');
    } finally {
      setDeletingPaymentLoading(false);
    }
  };

  const handleOpenEditOrderPayment = (order: Order) => {
    setEditingOrderPayment(order);
    setEditOrderPaidAmount(order.paidAmount || 0);
  };

  const handleSaveEditOrderPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrderPayment || editOrderPaidAmount < 0) {
      alert(lang === 'fr' ? 'Montant invalide.' : 'المبلغ غير صالح.', 'error');
      return;
    }

    setSavingEditOrderPayment(true);
    try {
      const newPaid = editOrderPaidAmount;
      const newRemaining = Math.max(0, editingOrderPayment.totalAfterDiscount - newPaid);
      const newPaymentStatus = newRemaining <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      await updateDoc(doc(db, 'orders', editingOrderPayment.id), {
        paidAmount: newPaid,
        remainingBalance: newRemaining,
        paymentStatus: newPaymentStatus
      });

      if (currentUser) {
        await logActivity(
          currentUser,
          'order_payment_edit',
          'order',
          `Modifié le montant payé pour la commande #${editingOrderPayment.id.slice(-6).toUpperCase()} : ${editingOrderPayment.paidAmount} DA -> ${newPaid} DA`,
          editingOrderPayment.id
        );
      }

      alert(lang === 'fr' ? 'Montant payé mis à jour avec succès !' : 'تم تحديث المبلغ المدفوع للطلب بنجاح!', 'success');
      setEditingOrderPayment(null);
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la modification.' : 'حدث خطأ أثناء التعديل.', 'error');
    } finally {
      setSavingEditOrderPayment(false);
    }
  };

  const doctors = useMemo(
    () => usersList.filter((u) => u.role === 'doctor'),
    [usersList]
  );

  const matchedDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.uid.toLowerCase().includes(q) ||
        d.clinicName.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        d.phone.includes(q)
    );
  }, [doctors, searchQuery]);

  const clientOrders = useMemo(
    () =>
      selectedClient
        ? ordersList
            .filter((o) => o.userId === selectedClient.uid)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [ordersList, selectedClient]
  );

  const cancelledOrders = useMemo(() => clientOrders.filter((o) => o.status === 'cancelled'), [clientOrders]);
  const activeOrders = useMemo(() => clientOrders.filter((o) => o.status !== 'cancelled'), [clientOrders]);

  const clientPayments = useMemo(() => {
    if (!selectedClient) return [];
    const explicit = paymentsList.filter((p) => p.userId === selectedClient.uid);
    const result: Payment[] = [...explicit];

    let unallocatedExplicit = explicit
      .filter((p) => !p.orderId || p.orderId.trim() === '')
      .reduce((sum, p) => sum + p.amount, 0);

    activeOrders.forEach((o) => {
      const paidOnOrder = o.paidAmount || 0;
      if (paidOnOrder > 0) {
        const explicitForOrder = explicit
          .filter((p) => p.orderId === o.id)
          .reduce((sum, p) => sum + p.amount, 0);

        let uncoveredOnOrder = Math.max(0, paidOnOrder - explicitForOrder);

        if (uncoveredOnOrder > 0 && unallocatedExplicit > 0) {
          const coveredByGeneral = Math.min(uncoveredOnOrder, unallocatedExplicit);
          uncoveredOnOrder -= coveredByGeneral;
          unallocatedExplicit -= coveredByGeneral;
        }

        if (uncoveredOnOrder > 0) {
          result.push({
            id: `synth-${o.id}`,
            orderId: o.id,
            userId: o.userId,
            amount: uncoveredOnOrder,
            paymentDate: o.createdAt,
            notes: isRtl ? 'دفعة عند الطلب / مباشرة' : 'Paiement à la commande / Direct'
          });
        }
      }
    });

    return result.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [paymentsList, selectedClient, activeOrders, isRtl]);

  const clientReturns = useMemo(
    () =>
      selectedClient
        ? returnsList
            .filter((r) => r.userId === selectedClient.uid)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [returnsList, selectedClient]
  );

  const summary = useMemo(() => {
    const totalPurchases = activeOrders.reduce((s, o) => s + o.totalAfterDiscount, 0);
    const totalReturns =
      clientReturns.reduce((s, r) => s + r.totalAmount, 0) +
      cancelledOrders.reduce((s, o) => s + o.totalAfterDiscount, 0);
    const totalPaid = clientPayments.reduce((s, p) => s + p.amount, 0);
    const totalDebt = activeOrders.reduce((s, o) => s + o.remainingBalance, 0);
    return { totalPurchases, totalReturns, totalPaid, totalDebt };
  }, [activeOrders, clientReturns, cancelledOrders, clientPayments]);

  const formatPrice = (num: number) => {
    if (num === 0 || num === undefined || num === null) return '-';
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(num) + ' ' + getTranslation(lang, 'currency');
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ');

  const statusLabel = (status: string) => getTranslation(lang, `status_${status}` as any) || status;

  const handleRegisterGeneralPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || generalPaymentAmount <= 0) {
      alert(lang === 'fr' ? 'Montant de paiement invalide.' : 'قيمة الدفعة غير صالحة.', 'error');
      return;
    }

    setSavingPayment(true);
    try {
      let remainingToDistribute = generalPaymentAmount;

      const unpaidOrders = activeOrders
        .filter((o) => o.remainingBalance > 0)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      for (const order of unpaidOrders) {
        if (remainingToDistribute <= 0) break;

        const payForThisOrder = Math.min(order.remainingBalance, remainingToDistribute);
        const newPaid = (order.paidAmount || 0) + payForThisOrder;
        const newRemaining = Math.max(0, order.remainingBalance - payForThisOrder);
        const newPaymentStatus = newRemaining <= 0 ? 'paid' : 'partial';

        await updateDoc(doc(db, 'orders', order.id), {
          paidAmount: newPaid,
          remainingBalance: newRemaining,
          paymentStatus: newPaymentStatus
        });

        remainingToDistribute -= payForThisOrder;
      }

      await addDoc(collection(db, 'payments'), {
        userId: selectedClient.uid,
        amount: generalPaymentAmount,
        paymentDate: new Date().toISOString(),
        notes: generalPaymentNotes.trim() || (isRtl ? 'دفعة مالية على الحساب (تسديد دين عام)' : 'Versement sur compte (Paiement général)')
      });

      await addDoc(collection(db, 'notifications'), {
        userId: selectedClient.uid,
        titleFr: 'Paiement enregistré !',
        titleAr: 'تم تسجيل دفعة مالية!',
        messageFr: `Un versement de ${formatPrice(generalPaymentAmount)} a été enregistré sur votre compte.`,
        messageAr: `تم تسجيل دفعة بقيمة ${formatPrice(generalPaymentAmount)} لحسابكم وتخفيض رصيد الدين.`,
        type: 'payment_reminder',
        isRead: false,
        createdAt: new Date().toISOString()
      });

      alert(
        isRtl
          ? `تم تسجيل الدفعة بقيمة ${new Intl.NumberFormat('ar-DZ').format(generalPaymentAmount)} دج بنجاح وتخفيض الدين!`
          : `Versement de ${new Intl.NumberFormat('fr-FR').format(generalPaymentAmount)} DA enregistré avec succès !`,
        'success'
      );

      setShowGeneralPaymentForm(false);
      setGeneralPaymentAmount(0);
      setGeneralPaymentNotes('');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de l\'enregistrement.' : 'حدث خطأ أثناء تسجيل الدفعة.', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleRegisterReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || returnAmount <= 0) {
      alert(lang === 'fr' ? 'Montant invalide.' : 'المبلغ غير صالح.', 'error');
      return;
    }

    setSavingReturn(true);
    try {
      await addDoc(collection(db, 'returns'), {
        userId: selectedClient.uid,
        doctorName: selectedClient.name,
        orderId: returnOrderId || undefined,
        totalAmount: returnAmount,
        reason: returnReason.trim() || undefined,
        createdAt: new Date().toISOString()
      });
      alert(lang === 'fr' ? 'Retour enregistré.' : 'تم تسجيل المرتجع.', 'success');
      setShowReturnForm(false);
      setReturnOrderId('');
      setReturnAmount(0);
      setReturnReason('');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de l\'enregistrement.' : 'حدث خطأ أثناء التسجيل.', 'error');
    } finally {
      setSavingReturn(false);
    }
  };

  const handleExportFinancialStatement = () => {
    if (!selectedClient) return;
    exportFinancialStatement({
      client: selectedClient,
      orders: clientOrders,
      payments: clientPayments,
      returns: clientReturns,
      lang
    });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <FileText size={20} className="text-brand-cyan" />
          {getTranslation(lang, 'clientSituation')}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {lang === 'fr'
            ? 'Consultez le relevé de compte d\'un client : achats, retours et paiements.'
            : 'اطلع على كشف حساب الزبون: المشتريات، المرتجعات، والمدفوعات.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search
              size={16}
              className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-3' : 'left-3'}`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'fr' ? 'Rechercher un client...' : 'البحث عن طبيب...'
              }
              className={`w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl py-2.5 ${
                isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
              } focus:outline-hidden focus:border-brand-cyan`}
            />
          </div>

          <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-1">
            {matchedDoctors.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                {lang === 'fr' ? 'Aucun client trouvé.' : 'لم يتم العثور على أطباء.'}
              </p>
            ) : (
              matchedDoctors.map((doc) => {
                const isSelected = selectedClient?.uid === doc.uid;
                return (
                  <button
                    key={doc.uid}
                    type="button"
                    onClick={() => setSelectedClient(doc)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-cyan text-white border-brand-cyan shadow-sm'
                        : 'bg-white text-slate-800 border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs truncate">{doc.name}</span>
                      {doc.role === 'doctor' && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {doc.clinicName || 'عيادة'}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[10px] mt-0.5 ${
                        isSelected ? 'text-white/80' : 'text-slate-400'
                      }`}
                    >
                      {doc.phone} • {doc.wilayaName || ''}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          {!selectedClient ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <User className="mx-auto text-slate-300 mb-3" size={40} />
              <p className="text-sm font-bold text-slate-500">
                {lang === 'fr'
                  ? 'Sélectionnez un client pour afficher son relevé.'
                  : 'اختر زبوناً لعرض كشف حسابه.'}
              </p>
            </div>
          ) : (
            <>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="font-extrabold text-slate-900">{selectedClient.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedClient.clinicName} • {selectedClient.phone} • {selectedClient.email}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">UID: {selectedClient.uid}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setShowGeneralPaymentForm(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CreditCard size={16} />
                    {lang === 'fr' ? 'Enregistrer un versement' : 'تسجيل دفعة على الحساب 💳'}
                  </button>
                  <button
                    onClick={handleExportFinancialStatement}
                    className="px-4 py-2 bg-brand-cyan hover:bg-brand-dark text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <FileText size={16} />
                    {lang === 'fr' ? 'Imprimer Relevé' : 'تصدير / طباعة كشف الحساب المالي 📑'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: lang === 'fr' ? 'Achats' : 'المشتريات',
                    value: summary.totalPurchases,
                    icon: ShoppingBag,
                    color: 'text-brand-cyan'
                  },
                  {
                    label: lang === 'fr' ? 'Retours' : 'المرتجعات',
                    value: summary.totalReturns,
                    icon: RotateCcw,
                    color: 'text-amber-600'
                  },
                  {
                    label: lang === 'fr' ? 'Payé' : 'المدفوعات',
                    value: summary.totalPaid,
                    icon: CreditCard,
                    color: 'text-emerald-600'
                  },
                  {
                    label: lang === 'fr' ? 'Reste dû' : 'المتبقي',
                    value: summary.totalDebt,
                    icon: FileText,
                    color: 'text-rose-600'
                  }
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-white border border-slate-100 rounded-2xl p-3 shadow-xs">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={14} className={color} />
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
                    </div>
                    <p className="font-black text-slate-900 text-sm">{formatPrice(value)}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowReturnForm(true)}
                  className="bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1.5 border border-amber-100"
                >
                  <Plus size={14} />
                  {lang === 'fr' ? 'Enregistrer un retour' : 'تسجيل مرتجع'}
                </button>
              </div>

              {/* Purchases */}
              <section className="space-y-2">
                <h5 className="text-xs font-extrabold text-slate-500 uppercase flex items-center gap-1.5">
                  <ShoppingBag size={14} />
                  {lang === 'fr' ? 'Achats (Commandes)' : 'المشتريات (الطلبات)'}
                </h5>
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] font-extrabold text-slate-400 uppercase bg-slate-50">
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderId')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderDate')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'total')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'status')}</th>
                        <th className="py-2 px-3 text-right">{getTranslation(lang, 'actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {clientOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                            {lang === 'fr' ? 'Aucune commande.' : 'لا توجد طلبات.'}
                          </td>
                        </tr>
                      ) : (
                        clientOrders.map((order) => (
                          <tr key={order.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono text-xs font-bold">
                              #{order.id ? order.id.slice(-6).toUpperCase() : 'UNKNOWN'}
                            </td>
                            <td className="py-2 px-3 text-xs text-slate-500">{formatDate(order.createdAt)}</td>
                            <td className="py-2 px-3 font-bold">{formatPrice(order.totalAfterDiscount)}</td>
                            <td className="py-2 px-3">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                {statusLabel(order.status)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditOrderPayment(order)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold cursor-pointer"
                                  title={lang === 'fr' ? 'Modifier le montant payé' : 'تعديل المبلغ المدفوع'}
                                >
                                  <Pencil size={14} />
                                  <span className="hidden sm:inline">{lang === 'fr' ? 'Payé' : 'تعديل الدفع'}</span>
                                </button>
                                {onPrintInvoice && (
                                  <button
                                    type="button"
                                    onClick={() => onPrintInvoice(order)}
                                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-bold cursor-pointer"
                                    title={lang === 'fr' ? 'Imprimer Facture' : 'طباعة الفاتورة'}
                                  >
                                    <Printer size={14} />
                                    <span className="hidden sm:inline">{lang === 'fr' ? 'Facture' : 'فاتورة'}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Returns */}
              <section className="space-y-2">
                <h5 className="text-xs font-extrabold text-slate-500 uppercase flex items-center gap-1.5">
                  <RotateCcw size={14} />
                  {lang === 'fr' ? 'Retours' : 'المرتجعات'}
                </h5>
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] font-extrabold text-slate-400 uppercase bg-slate-50">
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderDate')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderId')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'total')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Motif' : 'السبب'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {clientReturns.length === 0 && cancelledOrders.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                            {lang === 'fr' ? 'Aucun retour.' : 'لا توجد مرتجعات.'}
                          </td>
                        </tr>
                      ) : (
                        <>
                          {clientReturns.map((ret) => (
                            <tr key={ret.id} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-xs text-slate-500">{formatDate(ret.createdAt)}</td>
                              <td className="py-2 px-3 font-mono text-xs">
                                {ret.orderId ? `#${ret.orderId.slice(-6).toUpperCase()}` : '-'}
                              </td>
                              <td className="py-2 px-3 font-bold text-amber-600">{formatPrice(ret.totalAmount)}</td>
                              <td className="py-2 px-3 text-xs text-slate-500">{ret.reason || '-'}</td>
                            </tr>
                          ))}
                          {cancelledOrders.map((order) => (
                            <tr key={`cancel-${order.id}`} className="hover:bg-slate-50/50 bg-rose-50/30">
                              <td className="py-2 px-3 text-xs text-slate-500">{formatDate(order.createdAt)}</td>
                              <td className="py-2 px-3 font-mono text-xs">
                                #{order.id ? order.id.slice(-6).toUpperCase() : 'UNKNOWN'}
                              </td>
                              <td className="py-2 px-3 font-bold text-amber-600">
                                {formatPrice(order.totalAfterDiscount)}
                              </td>
                              <td className="py-2 px-3 text-xs text-rose-500 font-bold">
                                {lang === 'fr' ? 'Commande annulée' : 'طلب ملغى'}
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Payments */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-extrabold text-slate-500 uppercase flex items-center gap-1.5">
                    <CreditCard size={14} />
                    {lang === 'fr' ? 'Paiements reçus' : 'المدفوعات المستلمة'}
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowGeneralPaymentForm(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} />
                    {lang === 'fr' ? 'Nouveau versement' : 'تسجيل دفعة جديدة 💳'}
                  </button>
                </div>
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] font-extrabold text-slate-400 uppercase bg-slate-50">
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderDate')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderId')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Montant' : 'المبلغ'}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Notes' : 'ملاحظات'}</th>
                        <th className="py-2 px-3 text-right">{getTranslation(lang, 'actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {clientPayments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                            {lang === 'fr' ? 'Aucun paiement enregistré.' : 'لا توجد مدفوعات مسجلة.'}
                          </td>
                        </tr>
                      ) : (
                        clientPayments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-xs text-slate-500">{formatDate(payment.paymentDate)}</td>
                            <td className="py-2 px-3 font-mono text-xs">
                              {payment.orderId ? `#${payment.orderId.slice(-6).toUpperCase()}` : (isRtl ? 'دفعة عامة' : 'Versement général')}
                            </td>
                            <td className="py-2 px-3 font-bold text-emerald-600">{formatPrice(payment.amount)}</td>
                            <td className="py-2 px-3 text-xs text-slate-500">{payment.notes || '-'}</td>
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPayment(payment)}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                                  title={lang === 'fr' ? 'Modifier ce paiement' : 'تعديل هذه الدفعة'}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingPayment(payment)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title={lang === 'fr' ? 'Supprimer ce paiement' : 'حذف هذه الدفعة'}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Register General Payment modal */}
      {showGeneralPaymentForm && selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRegisterGeneralPayment}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-emerald-600" />
                <span className="font-extrabold text-slate-800 text-base">
                  {lang === 'fr' ? 'Versement sur compte' : 'تسجيل دفعة مالية على الحساب'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowGeneralPaymentForm(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-1">
                <p className="text-slate-700 font-bold text-sm">{selectedClient.name}</p>
                <p className="text-slate-500 text-xs">{selectedClient.clinicName || ''}</p>
                <div className="flex justify-between items-center pt-2 border-t border-emerald-200/60 mt-2">
                  <span className="text-slate-600 font-bold">
                    {lang === 'fr' ? 'Solde débiteur actuel :' : 'إجمالي الدين الحالي :'}
                  </span>
                  <span className="text-rose-600 font-extrabold text-sm">
                    {formatPrice(summary.totalDebt)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-700 text-xs flex items-center gap-1">
                  {lang === 'fr' ? 'Montant du versement (DA) *' : 'مبلغ الدفعة المقبوضة (دج) *'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="1"
                  value={generalPaymentAmount || ''}
                  onChange={(e) => setGeneralPaymentAmount(Number(e.target.value))}
                  placeholder="ex: 16000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-base font-extrabold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-700 text-xs">
                  {lang === 'fr' ? 'Notes / Mode de paiement' : 'ملاحظات / طريقة الدفع'}
                </label>
                <input
                  type="text"
                  value={generalPaymentNotes}
                  onChange={(e) => setGeneralPaymentNotes(e.target.value)}
                  placeholder={
                    lang === 'fr'
                      ? 'ex: Espèces, Virement CCP, Chèque...'
                      : 'مثال: نقداً، تحويل CCP، إيصال تسديد...'
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                💡 {isRtl
                  ? 'سيتم خصم مبلغ الدفعة تلقائياً من إجمالي دين الطبيب وتطبيقه على الفواتير المتبقية بدءاً من الفاتورة الأقدم.'
                  : 'Ce versement réduira le solde débiteur global et sera automatiquement affecté aux factures en souffrance de la plus ancienne à la plus récente.'}
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowGeneralPaymentForm(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                type="submit"
                disabled={savingPayment || generalPaymentAmount <= 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <CreditCard size={16} />
                {savingPayment
                  ? (lang === 'fr' ? 'Enregistrement...' : 'جاري التسجيل...')
                  : (lang === 'fr' ? 'Valider le versement' : 'تأكيد تسجيل الدفعة')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Register return modal */}
      {showReturnForm && selectedClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRegisterReturn}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="font-extrabold text-slate-800 text-base">
                {lang === 'fr' ? 'Enregistrer un retour' : 'تسجيل مرتجع'}
              </span>
              <button
                type="button"
                onClick={() => setShowReturnForm(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">
                  {lang === 'fr' ? 'Commande liée (optionnel)' : 'الطلب المرتبط (اختياري)'}
                </label>
                <select
                  value={returnOrderId}
                  onChange={(e) => setReturnOrderId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:outline-hidden focus:border-brand-cyan"
                >
                  <option value="">—</option>
                  {activeOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.id ? o.id.slice(-6).toUpperCase() : 'UNKNOWN'} — {formatPrice(o.totalAfterDiscount)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">
                  {lang === 'fr' ? 'Montant du retour (DA)' : 'مبلغ المرتجع (دج)'}
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={returnAmount || ''}
                  onChange={(e) => setReturnAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:outline-hidden focus:border-brand-cyan font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">
                  {lang === 'fr' ? 'Motif' : 'السبب'}
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="submit"
                disabled={savingReturn}
                className="w-full bg-brand-cyan text-white font-bold text-sm py-3 rounded-xl hover:bg-brand-cyan/90 disabled:opacity-50"
              >
                {savingReturn
                  ? lang === 'fr'
                    ? 'Enregistrement...'
                    : 'جاري التسجيل...'
                  : getTranslation(lang, 'submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditPayment}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-fade-in"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-amber-600" />
                <span className="font-extrabold text-slate-800 text-base">
                  {lang === 'fr' ? 'Modifier le paiement' : 'تعديل الدفعة المالية'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-extrabold text-slate-700 text-xs">
                  {lang === 'fr' ? 'Montant payé (DA) *' : 'المبلغ المدفوع (دج) *'}
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={editPaymentAmount}
                  onChange={(e) => setEditPaymentAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-base font-extrabold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                />
              </div>

              {!editingPayment.id.startsWith('synth-') && (
                <div className="space-y-1.5">
                  <label className="font-extrabold text-slate-700 text-xs">
                    {lang === 'fr' ? 'Notes' : 'ملاحظات'}
                  </label>
                  <input
                    type="text"
                    value={editPaymentNotes}
                    onChange={(e) => setEditPaymentNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-brand-cyan"
                  />
                </div>
              )}

              <p className="text-[11px] text-slate-400 leading-relaxed bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                ⚠️ {isRtl
                  ? 'سيتم تحديث المبلغ المدفوع وتعديل رصيد الدين المتبقي للطلب أو الحساب تلقائياً.'
                  : 'Le solde restant de la commande ou du compte sera automatiquement recalculé.'}
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                type="submit"
                disabled={savingEditPayment}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Pencil size={16} />
                {savingEditPayment
                  ? (lang === 'fr' ? 'Enregistrement...' : 'جاري الحفظ...')
                  : (lang === 'fr' ? 'Enregistrer les modifications' : 'حفظ التعديلات')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Payment Confirm Modal */}
      {deletingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-fade-in p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">
                  {lang === 'fr' ? 'Supprimer ce paiement ?' : 'تأكيد حذف هذه الدفعة ؟'}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {lang === 'fr' ? 'Cette action est irréversible.' : 'لا يمكن التراجع عن هذا الإجراء.'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Montant :' : 'المبلغ :'}</span>
                <span className="font-extrabold text-rose-600">{formatPrice(deletingPayment.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Date :' : 'التاريخ :'}</span>
                <span className="font-semibold text-slate-700">{formatDate(deletingPayment.paymentDate)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPayment(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                type="button"
                disabled={deletingPaymentLoading}
                onClick={handleConfirmDeletePayment}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Trash2 size={16} />
                {deletingPaymentLoading
                  ? (lang === 'fr' ? 'Suppression...' : 'جاري الحذف...')
                  : (lang === 'fr' ? 'Confirmer la suppression' : 'تأكيد الحذف')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Order Paid Amount Modal */}
      {editingOrderPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditOrderPayment}
            className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-fade-in"
          >
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-emerald-600" />
                <span className="font-extrabold text-slate-800 text-base">
                  {lang === 'fr' ? 'Modifier le paiement du commande' : 'تعديل المبلغ المدفوع للطلب'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrderPayment(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'N° Commande :' : 'رقم الطلب :'}</span>
                  <span className="font-mono font-bold text-slate-800">
                    #{editingOrderPayment.id ? editingOrderPayment.id.slice(-6).toUpperCase() : 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Montant Total :' : 'الإجمالي :'}</span>
                  <span className="font-extrabold text-slate-900">{formatPrice(editingOrderPayment.totalAfterDiscount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">{lang === 'fr' ? 'Payé actuellement :' : 'المدفوع حالياً :'}</span>
                  <span className="font-bold text-emerald-600">{formatPrice(editingOrderPayment.paidAmount)}</span>
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
                💡 {isRtl
                  ? 'سيتم خصم هذا المبلغ من إجمالي الطلب، وإعادة حساب الدين المتبقي وتغيير حالة الفاتورة تلقائياً.'
                  : 'Le reste à payer et le statut de paiement seront automatiquement mis à jour.'}
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingOrderPayment(null)}
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
    </div>
  );
}
