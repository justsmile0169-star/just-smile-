import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { comparePassword } from './crypto';

/**
 * Sign in staff member using email and password from Firestore
 * This is a custom auth system for staff accounts (admin, manager, cashier, accountant)
 */
export async function signInStaff(email: string, password: string): Promise<UserProfile | null> {
  try {
    const usersRef = collection(db, 'users');
    // Try the email as-is first, then lowercase as fallback
    let querySnapshot = await getDocs(query(usersRef, where('email', '==', email)));
    if (querySnapshot.empty && email !== email.toLowerCase()) {
      querySnapshot = await getDocs(query(usersRef, where('email', '==', email.toLowerCase())));
    }
    
    if (querySnapshot.empty) {
      return null;
    }
    
    // Check all users with matching email (should be only one)
    for (const userDoc of querySnapshot.docs) {
      const userData = userDoc.data() as UserProfile;
      
      // Check if user is staff (not doctor)
      if (userData.role === 'doctor') {
        continue;
      }
      
      // Check if user is active/approved (or has no status field)
      // Staff accounts use 'active' as their normal status, not 'approved'
      if (userData.status && userData.status !== 'approved' && userData.status !== 'active') {
        continue;
      }
      
      // Compare password with hashed password
      let passwordMatches = false;

      if (userData.password) {
        // Try bcrypt first (modern accounts)
        const isBcryptHash = userData.password.startsWith('$2') && userData.password.length > 50;
        if (isBcryptHash) {
          passwordMatches = await comparePassword(password, userData.password);
        }

        // Fallback: plaintext comparison for legacy accounts
        if (!passwordMatches && !isBcryptHash) {
          passwordMatches = (userData.password === password);
        }

        // If plaintext matched → auto-upgrade to bcrypt hash
        if (passwordMatches && !isBcryptHash) {
          try {
            const { hashPassword } = await import('./crypto');
            const newHash = await hashPassword(password);
            const { doc, updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'users', userDoc.id), { password: newHash });
          } catch (upgradeError) {
            // Silent fail on upgrade
          }
        }
      }

      if (passwordMatches) {
        return userData;
      }
    }
    
    return null;
  } catch (error) {
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
