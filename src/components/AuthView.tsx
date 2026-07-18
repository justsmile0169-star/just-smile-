import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, linkWithCredential } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocFromServer, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
  currentUser?: UserProfile | null;
  onAuthSuccess: (profile: UserProfile) => void;
}

export default function AuthView({ lang, currentUser, onAuthSuccess }: AuthViewProps) {
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
  const [isPendingAccount, setIsPendingAccount] = useState(false);

  // Google Auth Profile Completion
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);

  // Google Auth Linking states
  const [pendingLinkCredential, setPendingLinkCredential] = useState<any>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');

  const isRtl = lang === 'ar';

  // Listen to Auth State to handle profile completion for Google users.
  // Also handles the redirect result when the browser returns from Google's
  // sign-in page (fallback for popup-blocked environments).
  useEffect(() => {
    // ── Handle redirect result (fires once on page load after redirect) ──────
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          setLoading(true);
          await processGoogleUser(result.user);
        }
      })
      .catch((err) => {
        if (err?.code !== 'auth/no-auth-event' && err?.code !== 'auth/null-user') {
          handleGoogleAuthError(err);
        }
      });

    // ── Ongoing auth state listener ──────────────────────────────────────────
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docSnap = await getDoc(doc(db, 'users', user.uid));
          if (!docSnap.exists()) {
            setGoogleUser(user);
            setIsCompletingProfile(true);
            setName(user.displayName || '');
            setEmail(user.email || '');
          } else {
            const data = docSnap.data() as UserProfile;
            if (data.isProfileComplete === false) {
              setGoogleUser(user);
              setIsCompletingProfile(true);
              setName(data.name || user.displayName || '');
              setEmail(data.email || user.email || '');
            } else {
              setIsCompletingProfile(false);
              setGoogleUser(null);
            }
          }
        } catch (err) {
          console.error('Error fetching user doc on auth change:', err);
        }
      } else {
        setGoogleUser(null);
        setIsCompletingProfile(false);
      }
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load wilayas lazily when registration or profile completion form is shown
  useEffect(() => {
    if ((!isLogin || isCompletingProfile) && wilayas.length === 0) {
      setLoadingWilayas(true);
      getWilayas()
        .then(setWilayas)
        .finally(() => setLoadingWilayas(false));
    }
  }, [isLogin, isCompletingProfile, wilayas.length]);

  // Restore pending/rejected flags from sessionStorage (since AuthView gets unmounted during auth state change)
  useEffect(() => {
    if (sessionStorage.getItem('pending_doctor_login') === 'true') {
      setIsPendingAccount(true);
      sessionStorage.removeItem('pending_doctor_login');
    }
    if (sessionStorage.getItem('rejected_doctor_login') === 'true') {
      setErrorMsg(lang === 'fr' ? 'Votre compte a été refusé.' : 'تم رفض حسابك. يرجى الاتصال بالدعم الفني.');
      sessionStorage.removeItem('rejected_doctor_login');
    }
  }, [lang]);

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
    setIsPendingAccount(false);

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
          // Always read from SERVER (not cache) to get the latest approval status
          let userDocSnap;
          try {
            userDocSnap = await getDocFromServer(doc(db, 'users', userCredential.user.uid));
          } catch {
            userDocSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
          }

          if (userDocSnap.exists()) {
            firebaseAuthProfile = userDocSnap.data() as UserProfile;
          }
        } catch (err: any) {
          authError = err;
        }

        // If authenticated via Firebase Auth successfully
        if (firebaseAuthProfile) {
          if (firebaseAuthProfile.status === 'pending') {
            setIsPendingAccount(true);
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
          status:  'active',
          createdAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'users', uid), newProfile);

        // Auto-activate: sign in immediately without waiting for admin approval
        onAuthSuccess(newProfile);

        // Reset form
        setName(''); setPhone(''); setEmail(''); setPassword(''); setClinicName('');
        setSelectedWilaya(null); setSelectedCommune(null); setCommunes([]);
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

  // ── Google Auth Error Helper ──────────────────────────────────────────────
  const handleGoogleAuthError = (err: any) => {
    console.error('Google Auth Error:', err);
    if (err.code === 'auth/account-exists-with-different-credential') {
      const pendingCred = GoogleAuthProvider.credentialFromError(err);
      const email = err.customData?.email || '';
      setPendingLinkCredential(pendingCred);
      setLinkEmail(email);
      setErrorMsg(
        lang === 'fr'
          ? `Cet e-mail (${email}) est déjà enregistré. Veuillez entrer votre mot de passe pour lier votre compte Google.`
          : `هذا البريد الإلكتروني (${email}) مسجل بالفعل. يرجى إدخال كلمة المرور لربط حساب جوجل الخاص بك.`
      );
    } else if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/popup-closed-by-user' ||
      err.code === 'auth/cancelled-popup-request'
    ) {
      // User cancelled or browser blocked popup, wait for redirect or another try
    } else {
      setErrorMsg(
        lang === 'fr'
          ? 'Erreur de connexion avec Google.'
          : 'حدث خطأ أثناء تسجيل الدخول باستخدام جوجل.'
      );
    }
    setLoading(false);
  };

  // ── Google Sign-in flow ───────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setIsPendingAccount(false);

    const provider = new GoogleAuthProvider();

    try {
      // Attempt popup first — faster UX, works in most desktop browsers
      const result = await signInWithPopup(auth, provider);
      await processGoogleUser(result.user);
    } catch (err: any) {
      if (
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) {
        try {
          // signInWithRedirect navigates the page; result is handled in the
          // onAuthStateChanged listener when the page reloads after redirect.
          await signInWithRedirect(auth, provider);
          // (nothing after this line runs — browser navigates away)
        } catch (redirectErr: any) {
          handleGoogleAuthError(redirectErr);
        }
      } else {
        handleGoogleAuthError(err);
      }
    }
  };

  // ── Shared helper: process a signed-in Google user ────────────────────────
  const processGoogleUser = async (user: any) => {
    const userDocRef = doc(db, 'users', user.uid);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      const profile = docSnap.data() as UserProfile;
      
      // Auto-activate if they were pending
      if (profile.status === 'pending') {
        profile.status = 'active';
        await updateDoc(userDocRef, { status: 'active' }).catch(console.error);
      }

      if (profile.isProfileComplete === false) {
        setSuccessMsg(lang === 'fr' ? 'Veuillez compléter votre profil.' : 'يرجى إكمال معلومات ملفك الشخصي.');
        setGoogleUser(user);
        setIsCompletingProfile(true);
      } else if (profile.status === 'rejected') {
        setErrorMsg(lang === 'fr' ? 'Votre compte a été refusé.' : 'تم رفض حسابك. يرجى الاتصال بالدعم الفني.');
        await signOut(auth);
      } else {
        onAuthSuccess(profile);
      }
    } else {
      // First check if there is an existing user document with the same email under a different UID
      const emailLower = user.email.toLowerCase();
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', emailLower));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Match found! Copy/migrate profile details to the new Google UID
        const oldProfile = querySnapshot.docs[0].data() as UserProfile;
        const newProfile: UserProfile = {
          ...oldProfile,
          uid: user.uid,
          status: 'active', // Auto-activate
          isProfileComplete: oldProfile.isProfileComplete ?? true,
          lastLoginAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newProfile);

        if (newProfile.isProfileComplete === false) {
          setSuccessMsg(lang === 'fr' ? 'Veuillez compléter votre profil.' : 'يرجى إكمال معلومات ملفك الشخصي.');
          setGoogleUser(user);
          setIsCompletingProfile(true);
        } else if (newProfile.status === 'rejected') {
          setErrorMsg(lang === 'fr' ? 'Votre compte a été refusé.' : 'تم رفض حسابك. يرجى الاتصال بالدعم الفني.');
          await signOut(auth);
        } else {
          onAuthSuccess(newProfile);
        }
      } else {
        // First-time Google sign-in → create stub and ask for clinic info
        const newStub: UserProfile = {
          uid: user.uid,
          name: user.displayName || '',
          email: user.email || '',
          phone: '',
          clinicName: '',
          location: '',
          role: 'doctor',
          status: 'active',
          isProfileComplete: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newStub);
        setGoogleUser(user);
        setIsCompletingProfile(true);
        setSuccessMsg(lang === 'fr' ? 'Veuillez compléter votre profil.' : 'يرجى إكمال معلومات ملفك الشخصي.');
      }
    }
    setLoading(false);
  };

  // ── Complete Profile Submission ───────────────────────────────────────────
  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingLinkCredential) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Sign in with email and password
      const userCredential = await signInWithEmailAndPassword(auth, linkEmail, linkPassword);
      
      // 2. Link the google credential to the signed-in user
      await linkWithCredential(userCredential.user, pendingLinkCredential);

      // 3. Retrieve their profile from Firestore
      const userDocSnap = await getDoc(doc(db, 'users', userCredential.user.uid));
      if (userDocSnap.exists()) {
        const profile = userDocSnap.data() as UserProfile;
        
        // Auto-activate if status is pending
        if (profile.status === 'pending') {
          profile.status = 'active';
          await updateDoc(doc(db, 'users', userCredential.user.uid), { status: 'active' }).catch(console.error);
        }

        setSuccessMsg(lang === 'fr' ? 'Compte lié avec succès !' : 'تم ربط الحساب بنجاح!');
        onAuthSuccess(profile);
      } else {
        // Create active profile stub
        const newProfile: UserProfile = {
          uid: userCredential.user.uid,
          name: userCredential.user.displayName || '',
          email: userCredential.user.email || linkEmail,
          phone: '',
          clinicName: '',
          location: '',
          role: 'doctor',
          status: 'active',
          isProfileComplete: false,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', userCredential.user.uid), newProfile);
        setGoogleUser(userCredential.user);
        setIsCompletingProfile(true);
      }

      setPendingLinkCredential(null);
      setLinkEmail('');
      setLinkPassword('');
    } catch (err: any) {
      console.error('Error linking credential:', err);
      let msg = err.message;
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = lang === 'fr' ? 'Mot de passe incorrect.' : 'كلمة المرور غير صحيحة.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Complete Profile Submission ───────────────────────────────────────────
  const handleCompleteProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleUser) return;
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (!name || !phone || !clinicName || !selectedWilaya || !selectedCommune) {
        setErrorMsg(lang === 'fr' ? 'Tous les champs sont requis.' : 'جميع الحقول مطلوبة.');
        setLoading(false);
        return;
      }

      const wilayaName  = lang === 'ar' ? selectedWilaya.nameAr : selectedWilaya.nameAscii;
      const communeName = lang === 'ar' ? selectedCommune.nameAr : selectedCommune.nameAscii;
      const locationStr = `${wilayaName}، ${communeName}`;

      const updatedProfile: UserProfile = {
        uid: googleUser.uid,
        name: name.trim(),
        phone: phone.trim(),
        email: googleUser.email.toLowerCase(),
        clinicName: clinicName.trim(),
        location: locationStr,
        wilayaCode: selectedWilaya.code,
        wilayaName: selectedWilaya.nameAr,
        communeName: selectedCommune.nameAr,
        communeNameAscii: selectedCommune.nameAscii,
        role: 'doctor',
        status: 'active',
        isProfileComplete: true,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', googleUser.uid), updatedProfile);

      // Auto-activate: sign in immediately after completing profile
      setIsCompletingProfile(false);
      setGoogleUser(null);
      onAuthSuccess(updatedProfile);

      // Clear form
      setName(''); setPhone(''); setEmail(''); setPassword(''); setClinicName('');
      setSelectedWilaya(null); setSelectedCommune(null); setCommunes([]);
    } catch (err: any) {
      console.error('Complete Profile Error:', err);
      setErrorMsg(err.message);
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
        {!pendingLinkCredential && (
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-brand-dark tracking-tight">
              {isCompletingProfile 
                ? (lang === 'fr' ? 'Compléter le Profil' : 'إكمال الملف الشخصي')
                : isLogin ? getTranslation(lang, 'login') : getTranslation(lang, 'register')}
            </h2>
            <p className="text-xs text-slate-400">
              {isCompletingProfile
                ? (lang === 'fr' ? 'Saisissez vos informations professionnelles de praticien' : 'أدخل معلوماتك المهنية كطبيب لتفعيل حسابك')
                : isLogin
                  ? (lang === 'fr' ? 'Accédez à vos commandes et votre crédit' : 'الوصول إلى سجل طلباتك والائتمان')
                  : (lang === 'fr' ? 'Créez votre dossier praticien pour commander' : 'أنشئ ملفك الطبي للطلب والاستفادة من الخدمات')}
            </p>
          </div>
        )}

        {/* Messaging banners */}
        {isPendingAccount && (
          <div className="flex flex-col items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold p-5 rounded-2xl text-center" dir="rtl">
            <div className="text-3xl">⏳</div>
            <p className="font-black text-amber-900 text-base leading-snug">
              حسابك قيد المراجعة
            </p>
            <p className="text-amber-700 text-xs font-medium leading-relaxed">
              ستتمكن من تسجيل الدخول فور تفعيله من طرف الإدارة، شكرا على تفهمك 😊
            </p>
          </div>
        )}

        {errorMsg && !isPendingAccount && (
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

        {/* Form Display */}
        {pendingLinkCredential ? (
          <form onSubmit={handleLinkSubmit} className="space-y-4 text-sm font-medium">
            <div className="text-center space-y-2 pb-2">
              <h2 className="text-2xl font-black text-brand-dark tracking-tight">
                {lang === 'fr' ? 'Lier avec Google' : 'الربط بحساب جوجل'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'fr' 
                  ? `L'adresse ${linkEmail} est déjà enregistrée. Saisissez votre mot de passe pour y lier votre compte Google.`
                  : `البريد الإلكتروني ${linkEmail} مسجل بالفعل بموقعنا. الرجاء إدخال كلمة المرور لربط حساب جوجل الخاص بك.`}
              </p>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="text-slate-500 font-bold text-xs">{getTranslation(lang, 'password')}</label>
              <div className="relative">
                <Lock size={16} className="absolute top-1/2 -translate-y-1/2 text-slate-400 left-3 rtl:right-3 rtl:left-auto" />
                <input
                  type="password" required value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputCls()}
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-cyan text-white font-bold py-3.5 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs focus:ring-2 focus:ring-brand-cyan/20 cursor-pointer"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                lang === 'fr' ? 'Lier et se connecter' : 'ربط الحساب وتسجيل الدخول'
              )}
            </button>

            {/* Cancel Button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingLinkCredential(null);
                  setLinkEmail('');
                  setLinkPassword('');
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-xs text-rose-500 hover:text-rose-600 font-bold transition-colors cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
            </div>
          </form>
        ) : isCompletingProfile ? (
          <form onSubmit={handleCompleteProfileSubmit} className="space-y-4 text-sm font-medium">
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

            {/* Wilaya dropdown */}
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

            {/* Commune dropdown */}
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

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-cyan text-white font-bold py-3.5 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs focus:ring-2 focus:ring-brand-cyan/20 cursor-pointer"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              ) : (
                lang === 'fr' ? 'Enregistrer le profil' : 'حفظ وإرسال'
              )}
            </button>

            {/* Cancel Button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={async () => {
                  await signOut(auth);
                  setIsCompletingProfile(false);
                  setGoogleUser(null);
                  setIsLogin(true);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-xs text-rose-500 hover:text-rose-600 font-bold transition-colors cursor-pointer"
              >
                {lang === 'fr' ? 'Annuler et changer de compte' : 'إلغاء وتغيير الحساب'}
              </button>
            </div>
          </form>
        ) : (
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
              className="w-full bg-brand-cyan text-white font-bold py-3.5 px-4 rounded-xl hover:bg-brand-cyan/90 transition-all flex items-center justify-center shadow-xs focus:ring-2 focus:ring-brand-cyan/20 cursor-pointer"
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
        )}

        {/* Toggle login / register */}
        {!isCompletingProfile && !pendingLinkCredential && (
          <div className="text-center pt-2">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className="text-xs text-slate-500 hover:text-brand-cyan font-bold transition-colors cursor-pointer"
            >
              {isLogin ? getTranslation(lang, 'noAccount') : getTranslation(lang, 'alreadyHaveAccount')}
            </button>
          </div>
        )}

        {/* Google Sign-in Option */}
        {!isCompletingProfile && !pendingLinkCredential && (
          <>
            <div className="relative flex py-2 items-center text-slate-400 text-xs font-bold uppercase">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4">{lang === 'fr' ? 'Ou continuer avec' : 'أو تواصل باستخدام'}</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all shadow-xs text-sm cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              <span>{lang === 'fr' ? 'Google' : 'حساب جوجل'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
