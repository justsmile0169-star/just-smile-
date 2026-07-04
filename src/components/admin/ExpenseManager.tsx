import { useState } from 'react';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Expense, ExpenseCategory, Order, UserProfile } from '../../types';
import { Language, getTranslation } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { Wallet, Plus, Trash2 } from 'lucide-react';

interface ExpenseManagerProps {
  lang: Language;
  expenses: Expense[];
  ordersList: Order[];
  currentUser: UserProfile;
}

const CATEGORIES: { id: ExpenseCategory; fr: string; ar: string }[] = [
  { id: 'rent', fr: 'Loyer', ar: 'إيجار' },
  { id: 'electricity', fr: 'Électricité', ar: 'كهرباء' },
  { id: 'salaries', fr: 'Salaires', ar: 'رواتب' },
  { id: 'supplies', fr: 'Fournitures', ar: 'مستلزمات' },
  { id: 'other', fr: 'Autre', ar: 'أخرى' }
];

export default function ExpenseManager({ lang, expenses, ordersList, currentUser }: ExpenseManagerProps) {
  const { alert, confirm } = useAppDialog();
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'ar-DZ').format(n) + ' ' + getTranslation(lang, 'currency');

  const totalSales = ordersList
    .filter((o) => o.status !== 'cancelled')
    .reduce((s, o) => s + o.totalAfterDiscount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = totalSales - totalExpenses;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || !description.trim()) {
      alert(lang === 'fr' ? 'Montant ou description invalide.' : 'المبلغ أو الوصف غير صالح.', 'error');
      return;
    }
    setLoading(true);
    try {
      await addDoc(collection(db, 'expenses'), {
        category,
        description: description.trim(),
        amount,
        date,
        createdBy: currentUser.uid,
        createdByName: currentUser.name,
        createdAt: new Date().toISOString()
      });
      await logActivity(currentUser, 'add_expense', 'expense', `${category}: ${amount} DA`);
      alert(lang === 'fr' ? 'Dépense enregistrée.' : 'تم تسجيل المصروف.', 'success');
      setDescription('');
      setAmount(0);
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'خطأ.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (exp: Expense) => {
    if (!(await confirm(lang === 'fr' ? 'Supprimer cette dépense ?' : 'حذف هذا المصروف؟'))) return;
    await deleteDoc(doc(db, 'expenses', exp.id));
    await logActivity(currentUser, 'delete_expense', 'expense', exp.description, exp.id);
  };

  const catLabel = (id: ExpenseCategory) => CATEGORIES.find((c) => c.id === id)?.[lang] || id;

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <Wallet size={20} className="text-brand-cyan" />
          {lang === 'fr' ? 'Gestion des Dépenses' : 'إدارة المصروفات'}
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">{lang === 'fr' ? 'Ventes' : 'المبيعات'}</p>
          <p className="font-black text-emerald-800">{fmt(totalSales)}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-amber-600 uppercase">{lang === 'fr' ? 'Dépenses' : 'المصروفات'}</p>
          <p className="font-black text-amber-800">{fmt(totalExpenses)}</p>
        </div>
        <div className={`border rounded-2xl p-4 ${netProfit >= 0 ? 'bg-brand-cyan/5 border-brand-cyan/20' : 'bg-rose-50 border-rose-100'}`}>
          <p className="text-[10px] font-bold uppercase text-slate-500">{lang === 'fr' ? 'Profit net' : 'صافي الربح'}</p>
          <p className={`font-black ${netProfit >= 0 ? 'text-brand-cyan' : 'text-rose-600'}`}>{fmt(netProfit)}</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="border rounded-xl py-2 px-3 text-sm bg-white">
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c[lang]}</option>
          ))}
        </select>
        <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder={lang === 'fr' ? 'Description' : 'الوصف'} className="md:col-span-2 border rounded-xl py-2 px-3 text-sm bg-white" />
        <input type="number" required min={1} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} placeholder="DA" className="border rounded-xl py-2 px-3 text-sm bg-white" />
        <div className="flex gap-2">
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 border rounded-xl py-2 px-2 text-sm bg-white" />
          <button type="submit" disabled={loading} className="bg-brand-cyan text-white px-3 rounded-xl"><Plus size={16} /></button>
        </div>
      </form>

      <div className="overflow-x-auto border border-slate-100 rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-extrabold text-slate-400 uppercase bg-slate-50">
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Date' : 'التاريخ'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Catégorie' : 'الفئة'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Description' : 'الوصف'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Montant' : 'المبلغ'}</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {expenses.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400 text-xs">{lang === 'fr' ? 'Aucune dépense.' : 'لا مصروفات.'}</td></tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 text-xs">{exp.date}</td>
                  <td className="py-2 px-3 text-xs font-bold">{catLabel(exp.category)}</td>
                  <td className="py-2 px-3">{exp.description}</td>
                  <td className="py-2 px-3 font-bold text-rose-600">{fmt(exp.amount)}</td>
                  <td className="py-2 px-3">
                    <button type="button" onClick={() => handleDelete(exp)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
