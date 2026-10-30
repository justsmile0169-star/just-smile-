import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth, firebaseConfig } from '../firebase';
import { UserProfile } from '../types';
import { comparePassword } from './crypto';

export interface StaffDirectoryEntry extends UserProfile {
  authEmail?: string;
}

const STAFF_DIRECTORY_DOC = 'staff_directory';

/**
 * Generates a deterministic Firebase Auth password from the stored staff password hash.
 * This allows existing staff accounts (which only store a bcrypt hash in Firestore)
 * to be automatically provisioned in Firebase Auth and signed in once their bcrypt hash is verified.
 */
export function getStaffAuthSecret(storedPassword: string): string {
  const clean = (storedPassword || '').replace(/[^a-zA-Z0-9]/g, '');
  return `JS_Staff_${clean.slice(-24) || 'DefaultSecret2026'}`;
}

/**
 * Creates a dedicated Firebase Authentication account for a staff member using an isolated
 * secondary Firebase App instance so the currently logged-in Admin session is never interrupted.
 * Uses a unique `@justsmile.local` authEmail alias so it never collides with existing accounts
 * or triggers `400 (EMAIL_EXISTS / INVALID_LOGIN_CREDENTIALS)` console errors.
 */
export async function ensureStaffFirebaseAuth(
  storedPassword: string
): Promise<{ uid: string; authEmail: string }> {
  const appName = `StaffAuthHelper_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  const authEmail = `staff.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@justsmile.local`;
  const authSecret = getStaffAuthSecret(storedPassword);

  try {
    const userCred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, authSecret);
    const uid = userCred.user.uid;
    await signOut(secondaryAuth).catch(() => {});
    return { uid, authEmail };
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

/**
 * Syncs all active staff accounts to `settings/staff_directory` so the login page
 * can verify staff credentials and resolve their Firebase Auth alias before sign-in.
 */
export async function syncStaffDirectory(usersList: UserProfile[]): Promise<void> {
  try {
    const staffAccounts: StaffDirectoryEntry[] = usersList
      .filter(
        (u) =>
          !u.isDeleted &&
          ['admin', 'manager', 'cashier', 'accountant'].includes(u.role) &&
          u.status !== 'rejected'
      )
      .map((u) => ({
        uid: u.uid,
        name: u.name || '',
        email: (u.email || '').trim().toLowerCase(),
        authEmail: u.authEmail || '',
        phone: u.phone || '',
        password: u.password || '',
        clinicName: u.clinicName || 'Staff',
        location: u.location || 'Main Office',
        role: u.role,
        status: 'active',
        isProfileComplete: true,
        createdAt: u.createdAt || new Date().toISOString()
      }));

    await setDoc(doc(db, 'settings', STAFF_DIRECTORY_DOC), {
      accounts: staffAccounts,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Could not sync staff directory:', err);
  }
}

/**
 * Helper to verify plaintext password against stored bcrypt hash or plaintext
 */
async function verifyStaffPassword(plainPassword: string, storedPassword?: string): Promise<boolean> {
  if (!storedPassword) return false;
  const isBcryptHash = storedPassword.startsWith('$2') && storedPassword.length > 50;
  if (isBcryptHash) {
    return comparePassword(plainPassword, storedPassword);
  }
  return storedPassword === plainPassword;
}

/**
 * Checks whether an email belongs to a registered staff member in `settings/staff_directory`.
 */
export async function checkStaffDirectoryEmail(
  email: string
): Promise<{ isStaff: boolean; hasDedicatedAuth: boolean }> {
  const emailLower = email.trim().toLowerCase();
  try {
    const dirSnap = await getDoc(doc(db, 'settings', STAFF_DIRECTORY_DOC)).catch(() => null);
    if (dirSnap && dirSnap.exists()) {
      const data = dirSnap.data();
      const accounts: StaffDirectoryEntry[] = Array.isArray(data?.accounts) ? data.accounts : [];
      const match = accounts.find(
        (acc) => acc.email && acc.email.trim().toLowerCase() === emailLower && acc.role !== 'doctor'
      );
      if (match) {
        return {
          isStaff: true,
          hasDedicatedAuth: Boolean(match.authEmail && match.password)
        };
      }
    }
  } catch {}
  return { isStaff: false, hasDedicatedAuth: false };
}

/**
 * Sign in staff member using email and password.
 * Checks `settings/staff_directory` first (readable prior to Firebase Auth login),
 * verifies password against the bcrypt hash, and signs into Firebase Auth using the
 * staff member's `authEmail` and deterministic `authSecret` so Firestore security rules
 * (`isStaff()`) are satisfied without any 400 errors.
 */
export async function signInStaff(email: string, password: string): Promise<UserProfile | null> {
  const emailLower = email.trim().toLowerCase();
  const passwordTrimmed = password.trim();

  try {
    // 1. Check `settings/staff_directory` (accessible before authentication)
    const dirSnap = await getDoc(doc(db, 'settings', STAFF_DIRECTORY_DOC)).catch(() => null);
    if (dirSnap && dirSnap.exists()) {
      const data = dirSnap.data();
      const accounts: StaffDirectoryEntry[] = Array.isArray(data?.accounts) ? data.accounts : [];
      const matchedStaff = accounts.find(
        (acc) => acc.email && acc.email.trim().toLowerCase() === emailLower && acc.role !== 'doctor'
      );

      if (matchedStaff) {
        let isValid = await verifyStaffPassword(passwordTrimmed, matchedStaff.password);
        if (!isValid && password !== passwordTrimmed) {
          isValid = await verifyStaffPassword(password, matchedStaff.password);
        }
        if (!isValid) {
          return null;
        }

        // Authenticate with Firebase Auth so request.auth.uid == matchedStaff.uid for Firestore rules
        if (matchedStaff.authEmail && matchedStaff.password) {
          const authSecret = getStaffAuthSecret(matchedStaff.password);
          await signInWithEmailAndPassword(auth, matchedStaff.authEmail, authSecret).catch(() => {});
        } else if (matchedStaff.email) {
          await signInWithEmailAndPassword(auth, matchedStaff.email, passwordTrimmed).catch(() => {});
        }

        return matchedStaff;
      }
    }

    // 2. Fallback: query `users` collection if accessible
    const usersRef = collection(db, 'users');
    let querySnapshot = await getDocs(query(usersRef, where('email', '==', email))).catch(() => null);
    if ((!querySnapshot || querySnapshot.empty) && email !== emailLower) {
      querySnapshot = await getDocs(query(usersRef, where('email', '==', emailLower))).catch(() => null);
    }

    if (!querySnapshot || querySnapshot.empty) {
      return null;
    }

    for (const userDoc of querySnapshot.docs) {
      const userData = userDoc.data() as UserProfile;
      if (userData.role === 'doctor') continue;
      if (userData.status && userData.status !== 'approved' && userData.status !== 'active') continue;

      const passwordMatches = await verifyStaffPassword(passwordTrimmed, userData.password);
      if (passwordMatches) {
        if (userData.authEmail && userData.password) {
          const authSecret = getStaffAuthSecret(userData.password);
          await signInWithEmailAndPassword(auth, userData.authEmail, authSecret).catch(() => {});
        }
        return userData;
      }
    }

    return null;
  } catch {
    return null;
  }
}

const STAFF_SESSION_KEY = 'just_smile_staff_session';

/**
 * Persist staff session in localStorage
 */
export function saveStaffSession(user: UserProfile): void {
  try {
    const safeUser = { ...user };
    delete (safeUser as any).password;
    localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(safeUser));
  } catch (err) {
    console.warn('Could not save staff session to localStorage:', err);
  }
}

/**
 * Retrieve active staff session from localStorage
 */
export function getStaffSession(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as UserProfile;
    if (data && data.uid && isStaffUser(data)) {
      return data;
    }
  } catch (err) {
    console.warn('Could not parse staff session from localStorage:', err);
  }
  return null;
}

/**
 * Clear staff session from localStorage
 */
export function clearStaffSession(): void {
  try {
    localStorage.removeItem(STAFF_SESSION_KEY);
  } catch (err) {
    console.warn('Could not clear staff session:', err);
  }
}

/**
 * Check if a user is a staff member
 */
export function isStaffUser(user: UserProfile | null): boolean {
  if (!user) return false;
  return ['admin', 'manager', 'cashier', 'accountant'].includes(user.role);
}
