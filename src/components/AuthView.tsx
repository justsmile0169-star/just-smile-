import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Language, getTranslation } from '../translations';
import { UserProfile } from '../types';
import { signInStaff } from '../utils/staffAuth';
import {
  getWilayas, getCommunesByWilaya, isFreeDelivery,
  WilayaOption, CommuneOption,
} from '../utils/algeriaData';
import {
  User, Phone, Mail, Lock, Building, MapPin,
  AlertCircle, CheckCircle, Shield, Truck, ChevronDown,
} from 'lucide-react';

interface AuthViewProps {
  lang: Language;
  onAuthSuccess: (profile: UserProfile) => void;
}

export default function AuthView({ lang, onAuthSuccess }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);

  // ── Form fields ──────────────────────────────────────────────────────────────
  const [name, setName]             = useState('');
  const [phone, setPhone]           = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [clinicName, setClinicName] = useState('');

  // ── Location (structured) ────────────────────────────────────────────────────
  const [wilayas, setWilayas]               = useState<WilayaOption[]>([]);
  const [communes, setCommunes]             = useState<CommuneOption[]>([]);
  const [selectedWilaya, setSelectedWilaya] = useState<WilayaOption | null>(null);
  const [selectedCommune, setSelectedCommune] = useState<CommuneOption | null>(null);
  const [loadingWilayas, setLoadingWilayas] = useState(false);

  // ── UI States ────────────────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(false);
  const [errorMsg, setErrorMsg]     = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isRtl = lang === 'ar';

  // Load wilayas lazily when registration form is shown
  useEffect(() => {
    if (!isLogin && wilayas.length === 0) {
      setLoadingWilayas(true);
      getWilayas()
        .then(setWilayas)
        .finally(() => setLoadingWilayas(false));
    }
  }, [isLogin, wilayas.length]);

  // When wilaya changes → reload communes
  const handleWilayaChange = async (code: string) => {
    const w = wilayas.find((w) => w.code === code) ?? null;
    setSelectedWilaya(w);
    setSelectedCommune(null);
    setCommunes([]);
    if (w) {
      const list = await getCommunesByWilaya(w.code);
      setCommunes(list);
    }
  };

  // Determine free delivery badge for registration form
  const freeDelivery =
    selectedWilaya && selectedCommune
      ? isFreeDelivery(selectedWilaya.code, selectedCommune.nameAscii)
      : false;

  // ── Form submission ──────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isLogin) {
        // ── LOGIN FLOW ─────────────────────────────────────────────────────────
        const emailTrimmed = email.trim();
        const emailLower   = emailTrimmed.toLowerCase();

        const usersRef = collection(db, 'users');
        let userSnapshot = await getDocs(query(usersRef, where('email', '==', emailLower)));
        if (userSnapshot.empty && emailTrimmed !== emailLower) {
          userSnapshot = await getDocs(query(usersRef, where('email', '==', emailTrimmed)));
        }

        if (userSnapshot.empty) {
          setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
          setLoading(false);
          return;
        }

        const userData = userSnapshot.docs[0].data() as UserProfile;
        const storedEmail = userData.email || emailLower;

        // 1. For staff accounts (non-doctor), first verify via custom Firestore auth,
        // then silently create/sign-in a Firebase Auth account so Firestore rules
        // (request.auth != null) are satisfied — fixing all "Missing permissions" errors.
        if (userData.role !== 'doctor' && userData.password) {
          const staffProfile = await signInStaff(storedEmail, password);
          if (!staffProfile) {
            setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            setLoading(false);
            return;
          }

          // Password correct — now link to Firebase Auth so Firestore rules see request.auth
          try {
            // Try signing in first (account may already exist in Firebase Auth)
            await signInWithEmailAndPassword(auth, storedEmail, password);
          } catch (firebaseErr: any) {
            if (
              firebaseErr.code === 'auth/user-not-found' ||
              firebaseErr.code === 'auth/invalid-credential' ||
              firebaseErr.code === 'auth/wrong-password'
            ) {
              // Account doesn't exist in Firebase Auth yet — create it silently
              try {
                const { user: newFirebaseUser } = await createUserWithEmailAndPassword(auth, storedEmail, password);
                // Update Firestore doc UID to match new Firebase Auth UID if different
                if (newFirebaseUser.uid !== staffProfile.uid) {
                  // Create new doc with Firebase UID and copy data
                  await setDoc(doc(db, 'users', newFirebaseUser.uid), {
                    ...staffProfile,
                    uid: newFirebaseUser.uid,
                    lastLoginAt: new Date().toISOString()
                  });
                }
              } catch (createErr: any) {
                // If creation also fails (e.g. email already taken by different password),
                // we still allow login since custom auth already confirmed credentials.
                console.warn('Firebase Auth link warning:', createErr.code);
              }
            }
            // For other errors (network, etc.) we silently continue — custom auth passed
          }

          await updateDoc(doc(db, 'users', staffProfile.uid), { lastLoginAt: new Date().toISOString() }).catch(() => {});
          onAuthSuccess(staffProfile);
          setLoading(false);
          return;
        }

        // 2. For doctors and legacy staff with no Firestore password: use Firebase Auth
        let firebaseAuthProfile: UserProfile | null = null;
        let authError: any = null;

        try {
          const userCredential = await signInWithEmailAndPassword(auth, storedEmail, password);
          const userDocRef     = doc(db, 'users', userCredential.user.uid);
          const userDoc        = await getDoc(userDocRef);

          if (userDoc.exists()) {
            firebaseAuthProfile = userDoc.data() as UserProfile;
          }
        } catch (err: any) {
          authError = err;
        }

        // If authenticated via Firebase Auth successfully
        if (firebaseAuthProfile) {
          if (firebaseAuthProfile.status === 'pending') {
            setErrorMsg(getTranslation(lang, 'pendingApproval'));
            await signOut(auth);
            setLoading(false);
            return;
          }

          if (firebaseAuthProfile.status === 'rejected') {
            setErrorMsg(lang === 'fr' ? 'Votre compte a été refusé.' : 'تم رفض حسابك. يرجى الاتصال بالدعم الفني.');
            await signOut(auth);
            setLoading(false);
            return;
          }

          // Auto-upgrade: save hashed password for staff without one
          if (firebaseAuthProfile.role !== 'doctor' && !firebaseAuthProfile.password) {
            try {
              const { hashPassword } = await import('../utils/crypto');
              const hashedPassword = await hashPassword(password.trim());
              await updateDoc(doc(db, 'users', firebaseAuthProfile.uid), {
                password: hashedPassword,
                lastLoginAt: new Date().toISOString()
              });
            } catch {
              await updateDoc(doc(db, 'users', firebaseAuthProfile.uid), { lastLoginAt: new Date().toISOString() }).catch(() => {});
            }
          } else {
            await updateDoc(doc(db, 'users', firebaseAuthProfile.uid), { lastLoginAt: new Date().toISOString() }).catch(() => {});
          }

          onAuthSuccess(firebaseAuthProfile);
          setLoading(false);
          return;
        }

        // 3. Last fallback: legacy staff with no password field at all
        if (userData.role !== 'doctor') {
          const staffProfile = await signInStaff(storedEmail, password);
          if (staffProfile) {
            await updateDoc(doc(db, 'users', staffProfile.uid), { lastLoginAt: new Date().toISOString() }).catch(() => {});
            onAuthSuccess(staffProfile);
            setLoading(false);
            return;
          }
        }

        // 4. All methods failed — show error
        if (authError) {
          if (
            authError.code === 'auth/wrong-password' ||
            authError.code === 'auth/user-not-found' ||
            authError.code === 'auth/invalid-credential'
          ) {
            setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
          } else {
            setErrorMsg(lang === 'fr' ? 'Erreur de connexion.' : 'خطأ في تسجيل الدخول.');
          }
        } else {
          setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        }
        setLoading(false);
        return;

      } else {
        // ── REGISTER FLOW ──────────────────────────────────────────────────────
        if (!name || !phone || !email || !password || !clinicName || !selectedWilaya || !selectedCommune) {
          setErrorMsg(lang === 'fr' ? 'Tous les champs sont requis.' : 'جميع الحقول مطلوبة.');
          setLoading(false);
          return;
        }

        const wilayaName  = lang === 'ar' ? selectedWilaya.nameAr : selectedWilaya.nameAscii;
        const communeName = lang === 'ar' ? selectedCommune.nameAr : selectedCommune.nameAscii;
        const locationStr = `${wilayaName}، ${communeName}`;

        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid            = userCredential.user.uid;

        const newProfile: UserProfile = {
          uid,
          name:      name.trim(),
          phone:     phone.trim(),
          email:     email.trim().toLowerCase(),
          clinicName: clinicName.trim(),
          location:  locationStr,
          // structured location
          wilayaCode:       selectedWilaya.code,
          wilayaName:       selectedWilaya.nameAr,
          communeName:      selectedCommune.nameAr,
          communeNameAscii: selectedCommune.nameAscii,
          role:    'doctor',
          status:  'pending',
          createdAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'users', uid), newProfile);

        setSuccessMsg(
          lang === 'fr'
            ? 'Votre inscription a été enregistrée avec succès. Votre compte est en attente de validation.'
            : 'تم تسجيل طلب انضمامك بنجاح. حسابك الآن في انتظار التفعيل من قبل الإدارة.'
        );
        await signOut(auth);

        // Reset form
        setName(''); setPhone(''); setEmail(''); setPassword(''); setClinicName('');
        setSelectedWilaya(null); setSelectedCommune(null); setCommunes([]);
        setIsLogin(true);
      }
    } catch (err: any) {
      let msg = err.message;
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = lang === 'fr' ? 'Cet e-mail est déjà utilisé.' : 'هذا البريد الإلكتروني مستخدم بالفعل.';
      } else if (err.code === 'auth/weak-password') {
        msg = lang === 'fr' ? 'Le mot de passe est trop faible (6 caractères minimum).' : 'كلمة المرور ضعيفة جدًا (6 أحرف على الأقل).';
      } else if (err.code === 'auth/invalid-email') {
        msg = lang === 'fr' ? 'Adresse e-mail invalide.' : 'البريد الإلكتروني غير صالح.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = lang === 'fr'
          ? "L'authentification par e-mail/mot de passe n'est pas activée dans Firebase."
          : 'تسجيل الدخول بالبريد الإلكتروني غير مفعّل في Firebase.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Shared input class ───────────────────────────────────────────────────────
  const inputCls = (extra = '') =>
    `w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors text-sm ${isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'} ${extra}`;

  const selectCls = () =>
    `w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 focus:outline-hidden focus:border-brand-cyan transition-colors text-sm appearance-none cursor-pointer`;

  return (
    <div className="flex items-center justify-center min-h-[70vh] py-12 px-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-3xl border border-slate-100 p-8 w-full max-w-md shadow-lg space-y-6">

        {/* Form Title */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-brand-dark tracking-tight">
            {isLogin ? getTranslation(lang, 'login') : getTranslation(lang, 'register')}
          </h2>
          <p className="text-xs text-slate-400">
            {isLogin
              ? (lang === 'fr' ? 'Accédez à vos commandes et votre crédit' : 'الوصول إلى سجل طلباتك والائتمان')
              : (lang === 'fr' ? 'Créez votre dossier praticien pour commander' : 'أنشئ ملفك الطبي للطلب والاستفادة من الخدمات')}
          </p>
        </div>

        {/* Messaging banners */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold p-3.5 rounded-xl">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold p-3.5 rounded-xl animate-pulse">
            <CheckCircle size={16} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-sm font-medium">

          {!isLogin && (
            <>
              {/* Name */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'name')}</label>
                <div className="relative">
                  <User size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text" required value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Dr. Ahmed Benali' : 'د. أحمد بن علي'}
                    className={inputCls()}
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'phone')}</label>
                <div className="relative">
                  <Phone size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="tel" required value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0550 12 34 56"
                    className={inputCls()}
                  />
                </div>
              </div>

              {/* Clinic Name */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'clinicName')}</label>
                <div className="relative">
                  <Building size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text" required value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Cabinet Dentaire El-Yasmine' : 'عيادة الياسمين لطب الأسنان'}
                    className={inputCls()}
                  />
                </div>
              </div>

              {/* ── Wilaya dropdown ─────────────────────────────────────────────── */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs flex items-center gap-1.5">
                  <MapPin size={13} />
                  {lang === 'fr' ? 'Wilaya (Département)' : 'الولاية'}
                </label>
                <div className="relative">
                  <select
                    required
                    disabled={loadingWilayas}
                    value={selectedWilaya?.code ?? ''}
                    onChange={(e) => handleWilayaChange(e.target.value)}
                    className={selectCls()}
                  >
                    <option value="">
                      {loadingWilayas
                        ? (lang === 'fr' ? 'Chargement…' : 'جارٍ التحميل…')
                        : (lang === 'fr' ? '— Choisir une wilaya —' : '— اختر الولاية —')}
                    </option>
                    {wilayas.map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.code} – {lang === 'ar' ? w.nameAr : w.nameAscii}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute top-1/2 -translate-y-1/2 text-slate-400 right-3 rtl:left-3 rtl:right-auto pointer-events-none" />
                </div>
              </div>

              {/* ── Commune dropdown ────────────────────────────────────────────── */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs flex items-center gap-1.5">
                  <MapPin size={13} />
                  {lang === 'fr' ? 'Commune (Ville)' : 'البلدية'}
                </label>
                <div className="relative">
                  <select
                    required
                    disabled={!selectedWilaya || communes.length === 0}
                    value={selectedCommune?.id ?? ''}
                    onChange={(e) => {
                      const c = communes.find((c) => String(c.id) === e.target.value) ?? null;
                      setSelectedCommune(c);
                    }}
                    className={selectCls()}
                  >
                    <option value="">
                      {!selectedWilaya
                        ? (lang === 'fr' ? '— Choisir d\'abord la wilaya —' : '— اختر الولاية أولاً —')
                        : (lang === 'fr' ? '— Choisir une commune —' : '— اختر البلدية —')}
                    </option>
                    {communes.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {lang === 'ar' ? c.nameAr : c.nameAscii}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute top-1/2 -translate-y-1/2 text-slate-400 right-3 rtl:left-3 rtl:right-auto pointer-events-none" />
                </div>

                {/* Delivery badge */}
                {selectedCommune && (
                  <div
                    className={`mt-2 flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border ${
                      freeDelivery
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}
                  >
                    <Truck size={14} className="shrink-0" />
                    {freeDelivery
                      ? (lang === 'fr'
                          ? '🎉 Livraison GRATUITE — Vous êtes dans la commune de Djelfa !'
                          : '🎉 التوصيل مجاني — أنت مسجل في بلدية الجلفة!')
                      : (lang === 'fr'
                          ? '📦 Des frais de livraison s\'appliqueront selon votre localisation.'
                          : '📦 سيتم احتساب تكلفة التوصيل حسب موقع عيادتك.')}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'email')}</label>
            <div className="relative">
              <Mail size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dentiste@domain.com"
                className={inputCls()}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'password')}</label>
            <div className="relative">
              <Lock size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
              <input
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls()}
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-cyan text-white font-bold py-3.5 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs focus:ring-2 focus:ring-brand-cyan/20"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : isLogin ? (
              getTranslation(lang, 'login')
            ) : (
              getTranslation(lang, 'register')
            )}
          </button>
        </form>

        {/* Toggle login / register */}
        <div className="text-center pt-2">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="text-xs text-slate-500 hover:text-brand-cyan font-bold transition-colors"
          >
            {isLogin ? getTranslation(lang, 'noAccount') : getTranslation(lang, 'alreadyHaveAccount')}
          </button>
        </div>

      </div>
    </div>
  );
}
