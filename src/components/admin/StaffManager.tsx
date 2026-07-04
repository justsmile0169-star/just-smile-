import React, { useState } from 'react';
import { doc, updateDoc, addDoc, collection, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, UserRole } from '../../types';
import { Language } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { getRoleLabel } from '../../utils/permissions';
import { Shield, UserCog, Plus, X } from 'lucide-react';

interface StaffManagerProps {
  lang: Language;
  usersList: UserProfile[];
  currentUser: UserProfile;
}

const STAFF_ROLES: UserRole[] = ['admin', 'manager', 'cashier', 'accountant'];

export default function StaffManager({ lang, usersList, currentUser }: StaffManagerProps) {
  const { alert, confirm } = useAppDialog();
  const [loading, setLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('cashier');

  const staffUsers = usersList.filter((u) => u.role !== 'doctor');

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (uid === currentUser.uid && newRole !== 'admin') {
      alert(lang === 'fr' ? 'Vous ne pouvez pas rétrograder votre propre compte admin.' : 'لا يمكنك تخفيض صلاحيات حسابك.', 'error');
      return;
    }
    setLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      const target = usersList.find((u) => u.uid === uid);
      await logActivity(currentUser, 'update_staff_role', 'user', `${target?.name} → ${newRole}`, uid);
      alert(lang === 'fr' ? 'Rôle mis à jour.' : 'تم تحديث الصلاحية.', 'success');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'خطأ.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffEmail || !newStaffPhone) {
      alert(lang === 'fr' ? 'Veuillez remplir tous les champs.' : 'يرجى ملء جميع الحقول.', 'error');
      return;
    }

    setLoading('add');
    try {
      const newRef = doc(collection(db, 'users'));
      await setDoc(newRef, {
        uid: newRef.id,
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        phone: newStaffPhone.trim(),
        clinicName: 'Staff',
        location: 'Main Office',
        role: newStaffRole,
        status: 'approved',
        createdAt: new Date().toISOString()
      });
      
      await logActivity(currentUser, 'create_staff', 'user', `${newStaffName} as ${newStaffRole}`, newRef.id);
      alert(lang === 'fr' ? 'Compte créé avec succès !' : 'تم إنشاء الحساب بنجاح!', 'success');
      
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      setNewStaffRole('cashier');
      setShowAddForm(false);
      
      // Trigger refresh by calling parent's onRefreshData if available
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la création.' : 'حدث خطأ أثناء الإنشاء.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteStaff = async (user: UserProfile) => {
    if (!(await confirm(
      lang === 'fr' 
        ? `Supprimer le compte de ${user.name} ?` 
        : `حذف حساب ${user.name}؟`
    ))) return;

    setLoading(user.uid);
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        status: 'rejected',
        role: 'doctor' // Change role to disable staff access
      });
      await logActivity(currentUser, 'delete_staff', 'user', user.name, user.uid);
      alert(lang === 'fr' ? 'Compte supprimé.' : 'تم حذف الحساب.', 'success');
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'خطأ.', 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <Shield size={20} className="text-brand-cyan" />
              {lang === 'fr' ? 'Rôles & Permissions' : 'الصلاحيات والأدوار'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {lang === 'fr'
                ? 'Caissier: ventes | Manager: rapports | Comptable: factures | Admin: tout.'
                : 'كاشير: بيع | مدير: تقارير | محاسب: فواتير | مدير عام: الكل.'}
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-brand-cyan text-white font-bold text-xs py-2 px-3.5 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Plus size={14} />
            {lang === 'fr' ? 'Ajouter Staff' : 'إضافة موظف'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddStaff} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-sm">{lang === 'fr' ? 'Nouveau Staff' : 'موظف جديد'}</h4>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Nom' : 'الاسم'}</label>
              <input
                type="text"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Email' : 'البريد الإلكتروني'}</label>
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Téléphone' : 'الهاتف'}</label>
              <input
                type="tel"
                value={newStaffPhone}
                onChange={(e) => setNewStaffPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Rôle' : 'الدور'}</label>
              <select
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold bg-white"
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{getRoleLabel(r, lang)}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading === 'add'}
            className="w-full bg-brand-cyan text-white font-bold text-xs py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-all disabled:opacity-50"
          >
            {loading === 'add' ? (lang === 'fr' ? 'Création...' : 'جاري الإنشاء...') : (lang === 'fr' ? 'Créer le compte' : 'إنشاء الحساب')}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {[
          { role: 'cashier', fr: 'Caissier — ventes et paiements uniquement', ar: 'كاشير — البيع والدفع فقط' },
          { role: 'accountant', fr: 'Comptable — factures, dépenses, paiements', ar: 'محاسب — فواتير ومصروفات' },
          { role: 'manager', fr: 'Manager — stocks, promos, analytics', ar: 'مدير — مخزون وعروض وتقارير' },
          { role: 'admin', fr: 'Admin — accès complet', ar: 'مدير عام — وصول كامل' }
        ].map(({ role, fr, ar }) => (
          <div key={role} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="font-bold text-slate-700">{getRoleLabel(role as UserRole, lang)}</span>
            <p className="text-slate-500 mt-0.5">{lang === 'fr' ? fr : ar}</p>
          </div>
        ))}
      </div>

      {staffUsers.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{lang === 'fr' ? 'Aucun personnel staff.' : 'لا موظفين.'}</p>
      ) : (
        <div className="space-y-2">
          {staffUsers.map((user) => (
            <div key={user.uid} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl">
              <div className="flex items-center gap-3">
                <UserCog size={18} className="text-slate-400" />
                <div>
                  <p className="font-bold text-slate-800">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={user.role}
                  disabled={loading === user.uid}
                  onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                  className="border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold bg-white"
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{getRoleLabel(r, lang)}</option>
                  ))}
                </select>
                {user.uid !== currentUser.uid && (
                  <button
                    onClick={() => handleDeleteStaff(user)}
                    disabled={loading === user.uid}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                    title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
