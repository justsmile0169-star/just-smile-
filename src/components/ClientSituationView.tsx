import React, { useMemo, useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Order, Payment, ProductReturn, UserProfile } from '../types';
import { Language, getTranslation } from '../translations';
import { useAppDialog } from '../context/AppDialogContext';
import {
  Search, User, ShoppingBag, CreditCard, RotateCcw, FileText, Plus, X
} from 'lucide-react';

interface ClientSituationViewProps {
  lang: Language;
  usersList: UserProfile[];
  ordersList: Order[];
  paymentsList: Payment[];
  returnsList: ProductReturn[];
}

export default function ClientSituationView({
  lang,
  usersList,
  ordersList,
  paymentsList,
  returnsList
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

  const clientPayments = useMemo(
    () =>
      selectedClient
        ? paymentsList
            .filter((p) => p.userId === selectedClient.uid)
            .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
        : [],
    [paymentsList, selectedClient]
  );

  const clientReturns = useMemo(
    () =>
      selectedClient
        ? returnsList
            .filter((r) => r.userId === selectedClient.uid)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [returnsList, selectedClient]
  );

  const cancelledOrders = clientOrders.filter((o) => o.status === 'cancelled');
  const activeOrders = clientOrders.filter((o) => o.status !== 'cancelled');

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
        {/* Search & client list */}
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
              placeholder={getTranslation(lang, 'clientSearchPlaceholder')}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 text-sm focus:outline-hidden focus:border-brand-cyan font-medium text-slate-800 ${isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'}`}
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-2 border border-slate-100 rounded-2xl p-2">
            {matchedDoctors.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8 font-semibold">
                {lang === 'fr' ? 'Aucun client trouvé.' : 'لم يتم العثور على زبون.'}
              </p>
            ) : (
              matchedDoctors.map((doc) => (
                <button
                  key={doc.uid}
                  type="button"
                  onClick={() => setSelectedClient(doc)}
                  className={`w-full text-left rtl:text-right p-3 rounded-xl border transition-all ${
                    selectedClient?.uid === doc.uid
                      ? 'border-brand-cyan bg-brand-cyan/5'
                      : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="font-extrabold text-slate-800 text-sm">{doc.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{doc.clinicName}</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1 truncate">ID: {doc.uid}</p>
                  <span
                    className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      doc.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-600'
                        : doc.status === 'pending'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {getTranslation(lang, `status_${doc.status}` as any)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Account statement */}
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
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <h4 className="font-extrabold text-slate-900">{selectedClient.name}</h4>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedClient.clinicName} • {selectedClient.phone} • {selectedClient.email}
                </p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">UID: {selectedClient.uid}</p>
              </div>

              {/* Summary cards */}
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {clientOrders.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
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
                <h5 className="text-xs font-extrabold text-slate-500 uppercase flex items-center gap-1.5">
                  <CreditCard size={14} />
                  {lang === 'fr' ? 'Paiements reçus' : 'المدفوعات المستلمة'}
                </h5>
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="text-[10px] font-extrabold text-slate-400 uppercase bg-slate-50">
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderDate')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{getTranslation(lang, 'orderId')}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Montant' : 'المبلغ'}</th>
                        <th className="py-2 px-3 text-left rtl:text-right">{lang === 'fr' ? 'Notes' : 'ملاحظات'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {clientPayments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-xs text-slate-400">
                            {lang === 'fr' ? 'Aucun paiement enregistré.' : 'لا توجد مدفوعات مسجلة.'}
                          </td>
                        </tr>
                      ) : (
                        clientPayments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-xs text-slate-500">{formatDate(payment.paymentDate)}</td>
                            <td className="py-2 px-3 font-mono text-xs">
                              #{payment.orderId.slice(-6).toUpperCase()}
                            </td>
                            <td className="py-2 px-3 font-bold text-emerald-600">{formatPrice(payment.amount)}</td>
                            <td className="py-2 px-3 text-xs text-slate-500">{payment.notes || '-'}</td>
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
    </div>
  );
}
