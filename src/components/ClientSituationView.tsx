import React, { useMemo, useState } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, Payment, ProductReturn, ShopInfo, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { useAppDialog } from '../context/AppDialogContext';
import { exportFinancialStatement } from '../utils/exportFinancialStatement';
import { exportAllDebtsPDF } from '../utils/exportAllDebtsPDF';
import { computeAllClientsFinancials, ClientFinancialSummary } from '../utils/clientFinancials';
import { logActivity } from '../utils/activityLogger';
import { cleanFirestoreData } from '../utils/firestoreHelpers';
import {
  Search, User, ShoppingBag, CreditCard, RotateCcw, FileText, Plus, X,
  Printer, Pencil, Trash2, Edit3, FileDown, Users, ArrowLeft, ArrowRight,
  CheckCircle2, AlertCircle, Eye, RefreshCw, Filter
} from 'lucide-react';

interface ClientSituationViewProps {
  lang: Language;
  usersList: UserProfile[];
  ordersList: Order[];
  paymentsList: Payment[];
  returnsList: ProductReturn[];
  onPrintInvoice?: (order: Order) => void;
  currentUser?: UserProfile | null;
  shopInfo?: ShopInfo;
}

export default function ClientSituationView({
  lang,
  usersList,
  ordersList,
  paymentsList,
  returnsList,
  onPrintInvoice,
  currentUser,
  shopInfo
}: ClientSituationViewProps) {
  const { alert } = useAppDialog();
  const isRtl = lang === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);
  const [clientFilterTab, setClientFilterTab] = useState<'all' | 'debtors' | 'settled'>('all');
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

        await updateDoc(doc(db, 'payments', editingPayment.id), cleanFirestoreData({
          amount: editPaymentAmount,
          notes: editPaymentNotes.trim() || ''
        }));

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

  const allDoctorFinancials = useMemo(() => {
    return computeAllClientsFinancials(doctors, ordersList, paymentsList, returnsList);
  }, [doctors, ordersList, paymentsList, returnsList]);

  const doctorFinancialsMap = useMemo(() => {
    const map = new Map<string, ClientFinancialSummary>();
    allDoctorFinancials.forEach((s) => map.set(s.client.uid, s));
    return map;
  }, [allDoctorFinancials]);

  const totalDebtorsCount = useMemo(
    () => allDoctorFinancials.filter((s) => s.debt > 0).length,
    [allDoctorFinancials]
  );
  const totalSettledCount = useMemo(
    () => allDoctorFinancials.filter((s) => s.debt === 0).length,
    [allDoctorFinancials]
  );
  const globalTotalDebt = useMemo(
    () => allDoctorFinancials.reduce((sum, s) => sum + s.debt, 0),
    [allDoctorFinancials]
  );
  const globalTotalPurchases = useMemo(
    () => allDoctorFinancials.reduce((sum, s) => sum + s.totalPurchases, 0),
    [allDoctorFinancials]
  );
  const globalTotalPaid = useMemo(
    () => allDoctorFinancials.reduce((sum, s) => sum + s.totalPaid, 0),
    [allDoctorFinancials]
  );

  const matchedDoctors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = [...doctors];

    if (clientFilterTab === 'debtors') {
      list = list.filter((d) => (doctorFinancialsMap.get(d.uid)?.debt || 0) > 0);
      list.sort((a, b) => (doctorFinancialsMap.get(b.uid)?.debt || 0) - (doctorFinancialsMap.get(a.uid)?.debt || 0));
    } else if (clientFilterTab === 'settled') {
      list = list.filter((d) => (doctorFinancialsMap.get(d.uid)?.debt || 0) === 0);
    }

    if (!q) return list;
    return list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.uid.toLowerCase().includes(q) ||
        (d.clinicName && d.clinicName.toLowerCase().includes(q)) ||
        (d.email && d.email.toLowerCase().includes(q)) ||
        (d.phone && d.phone.includes(q)) ||
        (d.wilayaName && d.wilayaName.toLowerCase().includes(q))
    );
  }, [doctors, searchQuery, clientFilterTab, doctorFinancialsMap]);

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
    const netBalance = (totalPurchases - totalReturns) - totalPaid;
    const isCredit = netBalance < 0;
    const totalDebt = Math.max(0, netBalance);
    const clientCreditBalance = Math.max(0, -netBalance);
    return { totalPurchases, totalReturns, totalPaid, totalDebt, netBalance, isCredit, clientCreditBalance };
  }, [activeOrders, clientReturns, cancelledOrders, clientPayments]);

  const formatPrice = (num: number) => {
    if (num === 0 || num === undefined || num === null) return '0 ' + getTranslation(lang, 'currency');
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
      await addDoc(collection(db, 'returns'), cleanFirestoreData({
        userId: selectedClient.uid,
        doctorName: selectedClient.name,
        orderId: returnOrderId || undefined,
        totalAmount: returnAmount,
        reason: returnReason.trim() || undefined,
        createdAt: new Date().toISOString()
      }));
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
      shopInfo,
      lang
    });
  };

  const handleExportAllDebts = () => {
    exportAllDebtsPDF({
      doctors,
      orders: ordersList,
      payments: paymentsList,
      returns: returnsList,
      shopInfo,
      lang,
      includeAllClients: false
    });
  };

  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <FileText size={22} className="text-brand-cyan" />
            {lang === 'fr' ? 'Relevé de Compte & État des Dettes Clients' : 'كشف حساب ومتابعة ديون الزبائن والأطباء'}
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-1">
            {lang === 'fr'
              ? 'Consultez les soldes débiteurs, fiches détaillées, paiements et téléchargez le rapport global des créances.'
              : 'متابعة تفصيلية لحسابات وديون جميع الأطباء والزبائن، تسجيل الدفعات والمرتجعات، وتحميل كشوف الحسابات.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleExportAllDebts}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            title={lang === 'fr' ? 'Télécharger l\'état global de toutes les dettes en PDF' : 'تحميل كشف كامل الديون لجميع الزبائن بصيغة PDF'}
          >
            <FileDown size={16} />
            <span>{lang === 'fr' ? 'Exporter Toutes les Dettes (PDF)' : 'تحميل كشف جميع الديون PDF 📄'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Sidebar: Doctors list with Filter tabs & Debt Badges ── */}
        <div className="lg:col-span-1 space-y-3">
          {/* Search bar */}
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
                lang === 'fr' ? 'Rechercher un client / docteur...' : 'البحث عن طبيب أو عيادة...'
              }
              className={`w-full text-xs font-bold bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 ${
                isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
              } focus:outline-hidden focus:border-brand-cyan`}
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setClientFilterTab('all')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                clientFilterTab === 'all'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'fr' ? `Tous (${doctors.length})` : `الكل (${doctors.length})`}
            </button>
            <button
              type="button"
              onClick={() => setClientFilterTab('debtors')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                clientFilterTab === 'debtors'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
              }`}
            >
              <span>{lang === 'fr' ? 'Débiteurs' : 'المدينون'}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${clientFilterTab === 'debtors' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'}`}>
                {totalDebtorsCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setClientFilterTab('settled')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                clientFilterTab === 'settled'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              {lang === 'fr' ? `À jour (${totalSettledCount})` : `مسدد (${totalSettledCount})`}
            </button>
          </div>

          {/* Quick All Debts Overview Button */}
          {selectedClient && (
            <button
              type="button"
              onClick={() => setSelectedClient(null)}
              className="w-full py-2 px-3 bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan font-black text-xs rounded-xl border border-brand-cyan/30 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Users size={14} />
              <span>{lang === 'fr' ? '← Voir tableau de tous les clients' : '← عرض جدول ديون جميع الزبائن'}</span>
            </button>
          )}

          {/* Doctors List */}
          <div className="max-h-[500px] overflow-y-auto space-y-1.5 pr-1">
            {matchedDoctors.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                {lang === 'fr' ? 'Aucun client trouvé.' : 'لم يتم العثور على أطباء.'}
              </p>
            ) : (
              matchedDoctors.map((doc) => {
                const isSelected = selectedClient?.uid === doc.uid;
                const fin = doctorFinancialsMap.get(doc.uid);
                const hasDebt = fin && fin.debt > 0;
                const hasCredit = fin && fin.credit > 0;

                return (
                  <button
                    key={doc.uid}
                    type="button"
                    onClick={() => setSelectedClient(doc)}
                    className={`w-full text-left rtl:text-right p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-cyan text-white border-brand-cyan shadow-sm'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-extrabold text-xs truncate">{doc.name}</span>
                      {hasDebt ? (
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-md font-black shrink-0 ${
                            isSelected
                              ? 'bg-rose-500 text-white'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {lang === 'fr' ? 'Dette' : 'دين'}: {formatPrice(fin.debt)}
                        </span>
                      ) : hasCredit ? (
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-md font-black shrink-0 ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          {lang === 'fr' ? 'Crédit' : 'دائن'}: {formatPrice(fin.credit)}
                        </span>
                      ) : (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                            isSelected
                              ? 'bg-emerald-500 text-white'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {lang === 'fr' ? 'À jour' : 'مسدد'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] mt-0.5">
                      <span className={`${isSelected ? 'text-white/80' : 'text-slate-400'} truncate`}>
                        {doc.clinicName || 'عيادة'} • {doc.wilayaName || ''}
                      </span>
                      <span className={`font-mono ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                        {doc.phone}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Main Content Area (Right 2 cols) ───────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {!selectedClient ? (
            /* ── ⭐ ALL CUSTOMER DEBTS OVERVIEW & TABLE (كشف ديون جميع الزبائن) ── */
            <div className="space-y-5">
              {/* Global Debts KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-rose-600 dark:text-rose-400">
                    <CreditCard size={16} />
                    <span className="text-[10px] font-black uppercase tracking-tight">
                      {lang === 'fr' ? 'Total Dettes Restantes' : 'إجمالي الديون المعلقة'}
                    </span>
                  </div>
                  <p className="font-black text-rose-700 dark:text-rose-300 text-lg sm:text-xl">
                    {formatPrice(globalTotalDebt)}
                  </p>
                  <p className="text-[10px] text-rose-500 font-bold mt-0.5">
                    {totalDebtorsCount} {lang === 'fr' ? 'clients avec dettes' : 'زبون عليهم ديون'}
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-slate-600 dark:text-slate-400">
                    <Users size={16} />
                    <span className="text-[10px] font-black uppercase tracking-tight">
                      {lang === 'fr' ? 'Nombre Débiteurs' : 'الزبائن المدينون'}
                    </span>
                  </div>
                  <p className="font-black text-slate-900 dark:text-white text-lg sm:text-xl">
                    {totalDebtorsCount} / {doctors.length}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    {totalSettledCount} {lang === 'fr' ? 'clients à jour' : 'حسابات مسددة'}
                  </p>
                </div>

                <div className="bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/50 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-cyan-700 dark:text-cyan-400">
                    <ShoppingBag size={16} />
                    <span className="text-[10px] font-black uppercase tracking-tight">
                      {lang === 'fr' ? 'Total Achats' : 'إجمالي المبيعات'}
                    </span>
                  </div>
                  <p className="font-black text-cyan-900 dark:text-cyan-200 text-lg sm:text-xl">
                    {formatPrice(globalTotalPurchases)}
                  </p>
                  <p className="text-[10px] text-cyan-600 font-bold mt-0.5">
                    {ordersList.filter((o) => o.status !== 'cancelled').length} {lang === 'fr' ? 'commandes' : 'طلبية مؤكدة'}
                  </p>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={16} />
                    <span className="text-[10px] font-black uppercase tracking-tight">
                      {lang === 'fr' ? 'Total Payé' : 'إجمالي المحصل'}
                    </span>
                  </div>
                  <p className="font-black text-emerald-800 dark:text-emerald-200 text-lg sm:text-xl">
                    {formatPrice(globalTotalPaid)}
                  </p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                    {lang === 'fr' ? 'Versements reçus' : 'المدفوعات المستلمة'}
                  </p>
                </div>
              </div>

              {/* All Debtors Table Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h4 className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-2">
                      <Users size={18} className="text-brand-cyan" />
                      {lang === 'fr' ? 'Tableau Récapitulatif des Dettes par Client' : 'جدول تفاصيل ديون جميع الزبائن والأطباء'}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {lang === 'fr'
                        ? 'Cliquez sur un client pour ouvrir son relevé complet, voir ses articles ou enregistrer un versement.'
                        : 'انقر على أي زبون لفتح كشف حسابه التفصيلي، الاطلاع على مشترياته أو تسجيل دفعة.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportAllDebts}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <FileDown size={14} />
                    <span>{lang === 'fr' ? 'Imprimer / Exporter PDF' : 'تصدير الكشف PDF 📄'}</span>
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <table className="w-full text-xs min-w-[650px]">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                        <th className="py-2.5 px-3 text-left rtl:text-right">#</th>
                        <th className="py-2.5 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Médecin / Client' : 'الطبيب / الزبون'}</th>
                        <th className="py-2.5 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Cabinet' : 'العيادة'}</th>
                        <th className="py-2.5 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Téléphone' : 'الهاتف'}</th>
                        <th className="py-2.5 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Achats' : 'المشتريات'}</th>
                        <th className="py-2.5 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Payé' : 'المسدد'}</th>
                        <th className="py-2.5 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Dette' : 'الدين المتبقي'}</th>
                        <th className="py-2.5 px-3 text-right rtl:text-left">{lang === 'fr' ? 'Action' : 'إجراء'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {allDoctorFinancials.filter((s) => s.debt > 0).length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center">
                            <CheckCircle2 className="mx-auto text-emerald-500 mb-2" size={36} />
                            <p className="font-extrabold text-slate-700 dark:text-slate-300 text-sm">
                              {lang === 'fr' ? 'Aucune dette en cours !' : 'لا توجد أي ديون معلقة حالياً! 🎉'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {lang === 'fr' ? 'Tous les comptes clients sont à jour.' : 'جميع حسابات الزبائن مسددة بالكامل.'}
                            </p>
                          </td>
                        </tr>
                      ) : (
                        allDoctorFinancials
                          .filter((s) => s.debt > 0)
                          .sort((a, b) => b.debt - a.debt)
                          .map((item, idx) => (
                            <tr
                              key={item.client.uid}
                              onClick={() => setSelectedClient(item.client)}
                              className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20 transition-colors cursor-pointer group"
                            >
                              <td className="py-3 px-3 font-bold text-slate-400 text-[11px]">{idx + 1}</td>
                              <td className="py-3 px-3">
                                <span className="font-extrabold text-slate-900 dark:text-white group-hover:text-brand-cyan transition-colors block">
                                  {item.client.name}
                                </span>
                                <span className="text-[10px] text-slate-400">{item.client.wilayaName || ''}</span>
                              </td>
                              <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-medium">{item.client.clinicName || '-'}</td>
                              <td className="py-3 px-3 font-mono text-[11px] text-slate-500">{item.client.phone || '-'}</td>
                              <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">{formatPrice(item.totalPurchases)}</td>
                              <td className="py-3 px-3 font-bold text-emerald-600 dark:text-emerald-400">{formatPrice(item.totalPaid)}</td>
                              <td className="py-3 px-3">
                                <span className="font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2.5 py-1 rounded-lg text-xs inline-block">
                                  {formatPrice(item.debt)}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right rtl:text-left">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedClient(item.client);
                                  }}
                                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-brand-cyan hover:text-white dark:hover:bg-brand-cyan text-slate-700 dark:text-slate-300 font-extrabold text-[11px] rounded-lg transition-all inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye size={13} />
                                  <span>{lang === 'fr' ? 'Détails' : 'عرض الكشف'}</span>
                                </button>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ── ⭐ SELECTED CLIENT DETAILED STATEMENT VIEW ── */
            <>
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedClient(null)}
                    className="p-2 bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-600 transition-colors cursor-pointer"
                    title={lang === 'fr' ? 'Retour au tableau de tous les clients' : 'العودة لجدول جميع الزبائن والديون'}
                  >
                    {isRtl ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-base">{selectedClient.name}</h4>
                      {summary.totalDebt > 0 ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          {lang === 'fr' ? 'Débiteur' : 'عليه دين'}: {formatPrice(summary.totalDebt)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {lang === 'fr' ? 'À jour' : 'حساب مسدد'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {selectedClient.clinicName} • {selectedClient.phone} • {selectedClient.email}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {selectedClient.uid}</p>
                  </div>
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
                    {lang === 'fr' ? 'Imprimer Relevé Client' : 'كشف حساب الزبون (PDF) 📑'}
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
                    label: summary.isCredit
                      ? (lang === 'fr' ? 'Solde créditeur' : 'رصيد دائن (مسبق)')
                      : (lang === 'fr' ? 'Reste dû' : 'المتبقي (الدين)'),
                    value: summary.isCredit ? summary.clientCreditBalance : summary.totalDebt,
                    icon: FileText,
                    color: summary.isCredit ? 'text-emerald-600' : 'text-rose-600'
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
                    {summary.isCredit
                      ? (lang === 'fr' ? 'Solde créditeur (Avance) :' : 'الرصيد الدائن المسبق :')
                      : (lang === 'fr' ? 'Solde débiteur actuel :' : 'إجمالي الدين الحالي :')}
                  </span>
                  <span className={`${summary.isCredit ? 'text-emerald-600' : 'text-rose-600'} font-extrabold text-sm`}>
                    {summary.isCredit ? `+${formatPrice(summary.clientCreditBalance)}` : formatPrice(summary.totalDebt)}
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
