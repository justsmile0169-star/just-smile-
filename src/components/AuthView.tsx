import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Language, getTranslation } from '../translations';
import { UserProfile } from '../types';
import { signInStaff } from '../utils/staffAuth';
import { User, Phone, Mail, Lock, Building, MapPin, AlertCircle, CheckCircle, Shield } from 'lucide-react';

interface AuthViewProps {
  lang: Language;
  onAuthSuccess: (profile: UserProfile) => void;
}

export default function AuthView({ lang, onAuthSuccess }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [location, setLocation] = useState('');

  // States
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isRtl = lang === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isLogin) {
        // --- LOGIN FLOW ---

        console.log('[AuthView] Attempting login with email:', email.trim());

        // First, check if user exists in Firestore to determine auth method
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', email.trim()));
        const userSnapshot = await getDocs(q);

        console.log('[AuthView] User snapshot size:', userSnapshot.size);

        if (userSnapshot.empty) {
          // User not found
          console.log('[AuthView] User not found in Firestore');
          setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
          setLoading(false);
          return;
        }

        const userData = userSnapshot.docs[0].data() as UserProfile;
        console.log('[AuthView] User found:', userData.name, 'role:', userData.role, 'status:', userData.status);

        // Check if user is staff (admin, manager, cashier, accountant)
        if (userData.role !== 'doctor') {
          console.log('[AuthView] User is staff, attempting staff login');
          // Use staff login (Firestore-based)
          const staffProfile = await signInStaff(email.trim(), password);
          console.log('[AuthView] Staff login result:', staffProfile ? 'SUCCESS' : 'FAILED');
          if (staffProfile) {
            // Update last login time
            await updateDoc(doc(db, 'users', staffProfile.uid), {
              lastLoginAt: new Date().toISOString()
            });
            onAuthSuccess(staffProfile);
            setLoading(false);
            return;
          } else {
            // Staff login failed - wrong password
            console.log('[AuthView] Staff login failed - setting error message');
            setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            setLoading(false);
            return;
          }
        }

        // User is doctor - use Firebase Auth
        console.log('[AuthView] User is doctor, attempting Firebase Auth');
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
          const userDocRef = doc(db, 'users', userCredential.user.uid);
          const userDoc = await getDoc(userDocRef);

          if (!userDoc.exists()) {
            setErrorMsg(lang === 'fr' ? 'Profil utilisateur introuvable.' : 'موقع الطبيب غير موجود.');
            await signOut(auth);
            setLoading(false);
            return;
          }

          const profile = userDoc.data() as UserProfile;

          // Doctor validation status check
          if (profile.status === 'pending') {
            setErrorMsg(lang === 'fr' ? 'Votre compte est en attente de validation' : 'حسابك في انتظار تفعيل المدير. يرجى الانتظار.');
            await signOut(auth);
            setLoading(false);
            return;
          }

          if (profile.status === 'rejected') {
            setErrorMsg(lang === 'fr' ? 'Votre compte a été refusé. Veuillez contacter le support.' : 'تم رفض حسابك. يرجى الاتصال بالدعم الفني.');
            await signOut(auth);
            setLoading(false);
            return;
          }

          onAuthSuccess(profile);
        } catch (err: any) {
          console.error('Firebase Auth error:', err);
          if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
            setErrorMsg(lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
          } else {
            setErrorMsg(lang === 'fr' ? 'Erreur de connexion.' : 'خطأ في تسجيل الدخول.');
          }
          setLoading(false);
          return;
        }
      } else {
        // --- REGISTER FLOW ---
        if (!name || !phone || !email || !password || !clinicName || !location) {
          setErrorMsg(lang === 'fr' ? 'Tous les champs sont requis.' : 'جميع الحقول مطلوبة.');
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = userCredential.user.uid;

        const newProfile: UserProfile = {
          uid,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          clinicName: clinicName.trim(),
          location: location.trim(),
          role: 'doctor',
          status: 'pending',
          createdAt: new Date().toISOString()
        };

        // Save to Firestore
        await setDoc(doc(db, 'users', uid), newProfile);

        // Notify user and log out so they can't browse approved content yet
        setSuccessMsg(lang === 'fr' ? 'Votre inscription a été enregistrée avec succès. Votre compte est en attente de validation.' : 'تم تسجيل طلب انضمامك بنجاح. حسابك الآن في انتظار التفعيل من قبل الإدارة.');
        await signOut(auth);
        
        // Reset form
        setName('');
        setPhone('');
        setEmail('');
        setPassword('');
        setClinicName('');
        setLocation('');
        setIsLogin(true);
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message;
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = lang === 'fr' ? 'E-mail ou mot de passe incorrect.' : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      } else if (err.code === 'auth/email-already-in-use') {
        msg = lang === 'fr' ? 'Cet e-mail est déjà utilisé.' : 'هذا البريد الإلكتروني مستخدم بالفعل.';
      } else if (err.code === 'auth/weak-password') {
        msg = lang === 'fr' ? 'Le mot de passe est trop faible (6 caractères minimum).' : 'كلمة المرور ضعيفة جدًا (6 أحرف على الأقل).';
      } else if (err.code === 'auth/invalid-email') {
        msg = lang === 'fr' ? 'Adresse e-mail invalide.' : 'البريد الإلكتروني غير صالح.';
      } else if (err.code === 'auth/operation-not-allowed') {
        msg = lang === 'fr'
          ? "L'authentification par e-mail/mot de passe n'est pas activée dans votre console Firebase. Veuillez vous rendre sur la console Firebase, puis aller dans Build > Authentication > Sign-in method pour l'activer."
          : "تسجيل الدخول بالبريد الإلكتروني وكلمة المرور غير مفعّل في لوحة تحكم Firebase. يرجى تفعيله بالذهاب إلى لوحة تحكم Firebase ثم قسم Build > Authentication > Sign-in method.";
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

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
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Dr. Ahmed Benali' : 'د. أحمد بن علي'}
                    className={`w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors ${
                      isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                    }`}
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'phone')}</label>
                <div className="relative">
                  <Phone size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0550 12 34 56"
                    className={`w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors ${
                      isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                    }`}
                  />
                </div>
              </div>

              {/* Clinic Name */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'clinicName')}</label>
                <div className="relative">
                  <Building size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text"
                    required
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder={lang === 'fr' ? 'Cabinet Dentaire El-Yasmine' : 'عيادة الياسمين لطب الأسنان'}
                    className={`w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors ${
                      isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                    }`}
                  />
                </div>
              </div>

              {/* Location */}
              <div className="space-y-1">
                <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'location')}</label>
                <div className="relative">
                  <MapPin size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={lang === 'fr' ? 'Alger Centre, Alger' : 'الجزائر الوسطى، الجزائر'}
                    className={`w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors ${
                      isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                    }`}
                  />
                </div>
              </div>
            </>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'email')}</label>
            <div className="relative">
              <Mail size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dentiste@domain.com"
                className={`w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors ${
                  isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                }`}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'password')}</label>
            <div className="relative">
              <Lock size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-10 focus:outline-hidden focus:border-brand-cyan transition-colors ${
                  isRtl ? 'pr-10 pl-4' : 'pl-10 pr-4'
                }`}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-cyan text-white font-bold py-3.5 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs focus:ring-2 focus:ring-brand-cyan/20"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : isLogin ? (
              getTranslation(lang, 'login')
            ) : (
              getTranslation(lang, 'register')
            )}
          </button>
        </form>

        {/* Toggle between login / registration */}
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
