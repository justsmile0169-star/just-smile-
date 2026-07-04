import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, UserRole } from '../../types';
import { Language } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { getRoleLabel } from '../../utils/permissions';
import { Shield, UserCog } from 'lucide-react';

interface StaffManagerProps {
  lang: Language;
  usersList: UserProfile[];
  currentUser: UserProfile;
}

const STAFF_ROLES: UserRole[] = ['admin', 'manager', 'cashier', 'accountant'];

export default function StaffManager({ lang, usersList, currentUser }: StaffManagerProps) {
  const { alert } = useAppDialog();
  const [loading, setLoading] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
