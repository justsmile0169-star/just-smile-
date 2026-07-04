import { useState } from 'react';
import { collection, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Promotion, Product, UserProfile } from '../../types';
import { Language } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { cleanFirestoreData } from '../../utils/firestoreHelpers';
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface PromotionManagerProps {
  lang: Language;
  promotions: Promotion[];
  productsList: Product[];
  currentUser: UserProfile;
}

export default function PromotionManager({ lang, promotions, productsList, currentUser }: PromotionManagerProps) {
  const { alert, confirm } = useAppDialog();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'percentage' | 'buy_x_get_y'>('percentage');
  const [discountPercent, setDiscountPercent] = useState(10);
  const [buyQuantity, setBuyQuantity] = useState(2);
  const [freeQuantity, setFreeQuantity] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !endDate) {
      alert(lang === 'fr' ? 'Champs requis manquants.' : 'حقول مطلوبة ناقصة.', 'error');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'promotions'), cleanFirestoreData({
        name: name.trim(),
        type,
        discountPercent: type === 'percentage' ? discountPercent : undefined,
        buyQuantity: type === 'buy_x_get_y' ? buyQuantity : undefined,
        freeQuantity: type === 'buy_x_get_y' ? freeQuantity : undefined,
        category: category || undefined,
        startDate,
        endDate,
        isActive: true,
        createdAt: new Date().toISOString()
      }));
      await logActivity(currentUser, 'create_promotion', 'promotion', name);
      alert(lang === 'fr' ? 'Promotion créée !' : 'تم إنشاء العرض!', 'success');
      setShowForm(false);
      setName('');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'خطأ.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (promo: Promotion) => {
    await updateDoc(doc(db, 'promotions', promo.id), { isActive: !promo.isActive });
    await logActivity(currentUser, promo.isActive ? 'deactivate_promotion' : 'activate_promotion', 'promotion', promo.name, promo.id);
  };

  const handleDelete = async (promo: Promotion) => {
    if (!(await confirm(lang === 'fr' ? 'Supprimer cette promotion ?' : 'حذف هذا العرض؟'))) return;
    await deleteDoc(doc(db, 'promotions', promo.id));
    await logActivity(currentUser, 'delete_promotion', 'promotion', promo.name, promo.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-slate-50 pb-4">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Tag size={20} className="text-brand-cyan" />
            {lang === 'fr' ? 'Moteur Promotions' : 'محرك العروض الترويجية'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {lang === 'fr'
              ? 'Remises % ou "Achetez X, recevez Y gratuit" avec dates de validité.'
              : 'خصم نسبة مئوية أو "اشتري X واحصل على Y مجاناً" لفترة محددة.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-brand-cyan text-white font-bold text-xs py-2 px-3 rounded-xl flex items-center gap-1"
        >
          <Plus size={14} />
          {lang === 'fr' ? 'Nouvelle promo' : 'عرض جديد'}
        </button>
      </div>

      {promotions.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{lang === 'fr' ? 'Aucune promotion.' : 'لا توجد عروض.'}</p>
      ) : (
        <div className="space-y-2">
          {promotions.map((promo) => {
            const active = promo.isActive && new Date() <= new Date(promo.endDate + 'T23:59:59');
            return (
              <div key={promo.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl hover:bg-slate-50/50">
                <div>
                  <p className="font-bold text-slate-800">{promo.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {promo.type === 'percentage'
                      ? `-${promo.discountPercent}%`
                      : lang === 'fr'
                        ? `Achetez ${promo.buyQuantity} → ${promo.freeQuantity} gratuit`
                        : `اشتري ${promo.buyQuantity} → ${promo.freeQuantity} مجاناً`}
                    {' • '}{promo.startDate} → {promo.endDate}
                    {promo.category && ` • ${promo.category}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(promo)} className="text-slate-400 hover:text-brand-cyan">
                    {active ? <ToggleRight size={22} className="text-emerald-500" /> : <ToggleLeft size={22} />}
                  </button>
                  <button type="button" onClick={() => handleDelete(promo)} className="text-slate-400 hover:text-rose-600 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h4 className="font-extrabold text-slate-900">{lang === 'fr' ? 'Nouvelle promotion' : 'عرض جديد'}</h4>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === 'fr' ? 'Nom' : 'الاسم'} className="w-full border rounded-xl py-2 px-3 text-sm" />
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full border rounded-xl py-2 px-3 text-sm">
              <option value="percentage">{lang === 'fr' ? 'Remise %' : 'خصم %'}</option>
              <option value="buy_x_get_y">{lang === 'fr' ? 'Achetez X, Y gratuit' : 'اشتري X واحصل Y'}</option>
            </select>
            {type === 'percentage' ? (
              <input type="number" min={1} max={99} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} className="w-full border rounded-xl py-2 px-3 text-sm" placeholder="%" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={2} value={buyQuantity} onChange={(e) => setBuyQuantity(Number(e.target.value))} className="border rounded-xl py-2 px-3 text-sm" placeholder="X" />
                <input type="number" min={1} value={freeQuantity} onChange={(e) => setFreeQuantity(Number(e.target.value))} className="border rounded-xl py-2 px-3 text-sm" placeholder="Y" />
              </div>
            )}
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-xl py-2 px-3 text-sm">
              <option value="">{lang === 'fr' ? 'Toutes catégories' : 'كل الفئات'}</option>
              {[...new Set(productsList.map((p) => p.category))].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-xl py-2 px-3 text-sm" />
              <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-xl py-2 px-3 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl bg-slate-100 text-sm font-bold">{lang === 'fr' ? 'Annuler' : 'إلغاء'}</button>
              <button type="submit" disabled={loading} className="flex-1 py-2 rounded-xl bg-brand-cyan text-white text-sm font-bold">{lang === 'fr' ? 'Créer' : 'إنشاء'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
