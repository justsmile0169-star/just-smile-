import React, { useState, useEffect } from 'react';
import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, UserRole } from '../../types';
import { Language } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { getRoleLabel } from '../../utils/permissions';
import { hashPassword } from '../../utils/crypto';
import { ensureStaffFirebaseAuth, syncStaffDirectory } from '../../utils/staffAuth';
import { Shield, UserCog, Plus, X, Key, Trash2, CheckCircle2 } from 'lucide-react';

interface StaffManagerProps {
  lang: Language;
  usersList: UserProfile[];
  currentUser: UserProfile;
}

const STAFF_ROLES: UserRole[] = ['admin', 'manager', 'cashier', 'accountant', 'commercial'];

export default function StaffManager({ lang, usersList, currentUser }: StaffManagerProps) {
  const { alert, confirm } = useAppDialog();
  const [loading, setLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('cashier');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const staffUsers = usersList.filter((u) => !u.isDeleted && u.role !== 'doctor');

  // Auto-reconcile duplicate staff accounts and ensure every staff account has a dedicated Firebase Auth credential
  useEffect(() => {
    if (!usersList || usersList.length === 0) return;

    const reconcileAndProvisionStaffAccounts = async () => {
      const currentStaff = usersList.filter((u) => !u.isDeleted && u.role !== 'doctor');
      const currentDoctors = usersList.filter((u) => !u.isDeleted && u.role === 'doctor');
      let hasChanges = false;

      for (const staff of currentStaff) {
        if (!staff.email) continue;
        const emailLower = staff.email.trim().toLowerCase();

        // 1. Remove any duplicate doctor record with the exact same email
        const matchingDoctorDocs = currentDoctors.filter(
          (d) => d.email && d.email.trim().toLowerCase() === emailLower && d.uid !== staff.uid
        );

        for (const docRecord of matchingDoctorDocs) {
          try {
            await deleteDoc(doc(db, 'users', docRecord.uid));
            hasChanges = true;
          } catch (err) {
            console.warn('Could not remove duplicate doctor record for staff:', err);
          }
        }

        // 2. If an existing staff account (other than the currently logged-in admin) does not have
        //    a dedicated Firebase Auth credential (`authEmail`), provision one automatically!
        if (currentUser.role === 'admin' && staff.uid !== currentUser.uid && staff.password && !staff.authEmail) {
          try {
            const { uid: authUid, authEmail } = await ensureStaffFirebaseAuth(staff.password);
            const migratedStaff: UserProfile = {
              ...staff,
              uid: authUid,
              email: emailLower,
              authEmail,
              clinicName: 'Staff',
              location: 'Main Office',
              status: 'active',
              isProfileComplete: true
            };
            await setDoc(doc(db, 'users', authUid), migratedStaff);
            if (staff.uid !== authUid) {
              await deleteDoc(doc(db, 'users', staff.uid)).catch(() => {});
            }
            hasChanges = true;
          } catch (err) {
            console.warn('Could not auto-provision Firebase Auth for existing staff:', err);
          }
        }
      }

      if (!hasChanges && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
        await syncStaffDirectory(usersList);
      }
    };

    reconcileAndProvisionStaffAccounts();
  }, [usersList, currentUser.role, currentUser.uid]);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (uid === currentUser.uid && newRole !== 'admin') {
      alert(lang === 'fr' ? 'Vous ne pouvez pas rétrograder votre propre compte admin.' : 'لا يمكنك تخفيض صلاحيات حسابك.', 'error');
      return;
    }
    setLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        role: newRole,
        clinicName: 'Staff',
        status: 'active',
        isProfileComplete: true
      });
      const updatedList = usersList.map((u) =>
        u.uid === uid ? { ...u, role: newRole, clinicName: 'Staff', status: 'active' as const, isProfileComplete: true } : u
      );
      await syncStaffDirectory(updatedList);
      const target = usersList.find((u) => u.uid === uid);
      await logActivity(currentUser, 'update_staff_role', 'user', `${target?.name} → ${newRole}`, uid);
      alert(lang === 'fr' ? 'Rôle mis à jour.' : 'تم تحديث الصلاحية بنجاح.', 'success');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'خطأ أثناء تحديث الصلاحية.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim() || !newStaffPhone.trim() || !newStaffPassword.trim()) {
      alert(lang === 'fr' ? 'Veuillez remplir tous les champs.' : 'يرجى ملء جميع الحقول.', 'error');
      return;
    }

    if (newStaffPassword.trim().length < 6) {
      alert(
        lang === 'fr'
          ? 'Le mot de passe doit contenir au moins 6 caractères.'
          : 'يجب أن تتكون كلمة السر من 6 أحرف أو أرقام على الأقل ليتمكن الموظف من تسجيل الدخول.',
        'error'
      );
      return;
    }

    setLoading('add');
    try {
      const emailLower = newStaffEmail.trim().toLowerCase();
      const passwordTrimmed = newStaffPassword.trim();
      const hashedPassword = await hashPassword(passwordTrimmed);

      // 1. Create dedicated Firebase Authentication credential so the staff member can sign in without 400 errors
      const { uid: targetUid, authEmail } = await ensureStaffFirebaseAuth(hashedPassword);

      // 2. Check if there are any existing documents in Firestore with this email
      const existingDocsWithEmail = usersList.filter(
        (u) => u.email && u.email.trim().toLowerCase() === emailLower
      );
      const primaryExistingDoc = existingDocsWithEmail[0];

      const staffProfileData: UserProfile = {
        uid: targetUid,
        name: newStaffName.trim(),
        email: emailLower,
        authEmail,
        phone: newStaffPhone.trim(),
        password: hashedPassword,
        clinicName: 'Staff',
        location: 'Main Office',
        role: newStaffRole,
        status: 'active',
        isProfileComplete: true,
        createdAt: primaryExistingDoc?.createdAt || new Date().toISOString()
      };

      await setDoc(doc(db, 'users', targetUid), staffProfileData);

      // 3. Remove any duplicate documents with the same email but different UID
      for (const existingDoc of existingDocsWithEmail) {
        if (existingDoc.uid !== targetUid) {
          await deleteDoc(doc(db, 'users', existingDoc.uid)).catch(() => {});
        }
      }

      // 4. Sync staff directory immediately so login works right away
      const updatedUsersList = [
        ...usersList.filter((u) => (u.email || '').trim().toLowerCase() !== emailLower && u.uid !== targetUid),
        staffProfileData
      ];
      await syncStaffDirectory(updatedUsersList);

      await logActivity(currentUser, 'create_staff', 'user', `${newStaffName.trim()} as ${newStaffRole}`, targetUid);
      alert(
        lang === 'fr'
          ? 'Compte staff créé et activé avec succès !'
          : 'تم إنشاء وتفعيل حساب الموظف بنجاح! يمكنه الآن تسجيل الدخول مباشرة.',
        'success'
      );

      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPhone('');
      setNewStaffPassword('');
      setNewStaffRole('cashier');
      setShowAddForm(false);
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/invalid-email') {
        alert(lang === 'fr' ? 'Adresse e-mail invalide.' : 'البريد الإلكتروني غير صالح.', 'error');
      } else if (err?.code === 'auth/weak-password') {
        alert(lang === 'fr' ? 'Mot de passe trop faible (6 caractères min).' : 'كلمة السر ضعيفة (6 أحرف على الأقل).', 'error');
      } else {
        alert(lang === 'fr' ? 'Erreur lors de la création.' : 'حدث خطأ أثناء إنشاء الحساب.', 'error');
      }
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteStaff = async (user: UserProfile) => {
    if (!(await confirm(
      lang === 'fr'
        ? `Supprimer définitivement le compte staff de ${user.name} ?`
        : `هل أنت متأكد من حذف حساب الموظف ${user.name}؟`
    ))) return;

    setLoading(user.uid);
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      const updatedList = usersList.filter((u) => u.uid !== user.uid);
      await syncStaffDirectory(updatedList);
      await logActivity(currentUser, 'delete_staff', 'user', user.name, user.uid);
      alert(lang === 'fr' ? 'Compte staff supprimé.' : 'تم حذف حساب الموظف بنجاح.', 'success');
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression.' : 'حدث خطأ أثناء حذف الحساب.', 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPassword || !newPassword.trim()) {
      alert(lang === 'fr' ? 'Veuillez entrer un mot de passe.' : 'يرجى إدخال كلمة السر.', 'error');
      return;
    }

    if (newPassword.trim().length < 6) {
      alert(
        lang === 'fr'
          ? 'Le mot de passe doit contenir au moins 6 caractères.'
          : 'يجب أن تتكون كلمة السر من 6 أحرف أو أرقام على الأقل.',
        'error'
      );
      return;
    }

    setLoading(selectedUserForPassword.uid);
    try {
      const passwordTrimmed = newPassword.trim();
      const hashedPassword = await hashPassword(passwordTrimmed);
      const emailLower = (selectedUserForPassword.email || '').trim().toLowerCase();

      if (selectedUserForPassword.uid !== currentUser.uid) {
        const { uid: authUid, authEmail } = await ensureStaffFirebaseAuth(hashedPassword);
        const updatedStaff: UserProfile = {
          ...selectedUserForPassword,
          uid: authUid,
          email: emailLower,
          authEmail,
          password: hashedPassword,
          clinicName: 'Staff',
          status: 'active',
          isProfileComplete: true
        };
        await setDoc(doc(db, 'users', authUid), updatedStaff);
        if (authUid !== selectedUserForPassword.uid) {
          await deleteDoc(doc(db, 'users', selectedUserForPassword.uid)).catch(() => {});
        }
        const updatedList = [
          ...usersList.filter((u) => u.uid !== selectedUserForPassword.uid && u.uid !== authUid),
          updatedStaff
        ];
        await syncStaffDirectory(updatedList);
      } else {
        await updateDoc(doc(db, 'users', selectedUserForPassword.uid), {
          password: hashedPassword,
          status: 'active',
          isProfileComplete: true
        });
        const updatedList = usersList.map((u) =>
          u.uid === selectedUserForPassword.uid ? { ...u, password: hashedPassword, status: 'active' as const } : u
        );
        await syncStaffDirectory(updatedList);
      }

      await logActivity(currentUser, 'change_password', 'user', selectedUserForPassword.name, selectedUserForPassword.uid);
      alert(
        lang === 'fr'
          ? 'Mot de passe mis à jour et compte activé !'
          : 'تم تحديث كلمة السر وتفعيل تسجيل الدخول للحساب بنجاح!',
        'success'
      );
      setNewPassword('');
      setShowPasswordModal(false);
      setSelectedUserForPassword(null);
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur.' : 'حدث خطأ أثناء تحديث كلمة السر.', 'error');
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
                ? 'Commercial: ventes & médecins | Caissier: ventes | Manager: rapports | Comptable: factures | Admin: tout.'
                : 'مندوب مبيعات: طلبيات وأطباء وكتالوج | كاشير: بيع | مدير: تقارير | محاسب: فواتير | مدير عام: الكل.'}
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-brand-cyan text-white font-bold text-xs py-2 px-3.5 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            {lang === 'fr' ? 'Ajouter Staff' : 'إضافة موظف'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddStaff} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-sm">{lang === 'fr' ? 'Nouveau Staff' : 'إضافة موظف جديد'}</h4>
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
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold bg-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Email' : 'البريد الإلكتروني'}</label>
              <input
                type="email"
                value={newStaffEmail}
                onChange={(e) => setNewStaffEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold bg-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Téléphone' : 'الهاتف'}</label>
              <input
                type="tel"
                value={newStaffPhone}
                onChange={(e) => setNewStaffPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold bg-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">
                {lang === 'fr' ? 'Mot de passe (min 6 caractères)' : 'كلمة السر (6 أحرف على الأقل)'}
              </label>
              <input
                type="password"
                minLength={6}
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold bg-white"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">{lang === 'fr' ? 'Rôle' : 'الدور والصلاحية'}</label>
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
            className="w-full bg-brand-cyan text-white font-bold text-xs py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading === 'add' ? (lang === 'fr' ? 'Création...' : 'جاري الإنشاء والتفعيل...') : (lang === 'fr' ? 'Créer le compte' : 'إنشاء وتفعيل الحساب')}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {[
          { role: 'commercial', fr: 'Commercial — commandes, tous les médecins, carte, catalogue (vente), encaissements', ar: 'مندوب مبيعات — إنشاء طلبيات، رؤية جميع الأطباء وخريطتهم، الكتالوج (سعر البيع فقط)، وتحصيل الدفعات' },
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
                <UserCog size={18} className="text-brand-cyan" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-slate-800">{user.name}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 size={10} />
                      {getRoleLabel(user.role, lang)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{user.email} {user.phone ? `• ${user.phone}` : ''}</p>
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
                <button
                  onClick={() => {
                    setSelectedUserForPassword(user);
                    setShowPasswordModal(true);
                  }}
                  disabled={loading === user.uid}
                  className="p-1.5 text-slate-400 hover:text-brand-cyan hover:bg-brand-cyan/10 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  title={lang === 'fr' ? 'Changer mot de passe / Activer' : 'تغيير كلمة السر / تفعيل الدخول'}
                >
                  <Key size={14} />
                </button>
                {user.uid !== currentUser.uid && (
                  <button
                    onClick={() => handleDeleteStaff(user)}
                    disabled={loading === user.uid}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                    title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && selectedUserForPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm">
                {lang === 'fr'
                  ? `Changer le mot de passe pour ${selectedUserForPassword.name}`
                  : `تغيير كلمة السر وتفعيل الدخول لـ ${selectedUserForPassword.name}`}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setSelectedUserForPassword(null);
                  setNewPassword('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">
                  {lang === 'fr' ? 'Nouveau mot de passe (min 6 caractères)' : 'كلمة السر الجديدة (6 أحرف على الأقل)'}
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold"
                  placeholder={lang === 'fr' ? 'Entrez le nouveau mot de passe' : 'أدخل كلمة السر الجديدة'}
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setSelectedUserForPassword(null);
                    setNewPassword('');
                  }}
                  className="flex-1 bg-slate-100 text-slate-600 font-bold text-xs py-2.5 rounded-xl hover:bg-slate-200 transition-all"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  type="submit"
                  disabled={loading === selectedUserForPassword.uid}
                  className="flex-1 bg-brand-cyan text-white font-bold text-xs py-2.5 rounded-xl hover:bg-brand-cyan/90 transition-all disabled:opacity-50"
                >
                  {loading === selectedUserForPassword.uid
                    ? (lang === 'fr' ? 'Mise à jour...' : 'جاري التحديث...')
                    : (lang === 'fr' ? 'Mettre à jour' : 'تحديث وتفعيل')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
