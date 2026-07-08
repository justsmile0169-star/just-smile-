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
      
      // Check if user is approved (or has no status field)
      if (userData.status && userData.status !== 'approved') {
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

/**
 * Check if a user is a staff member
 */
export function isStaffUser(user: UserProfile | null): boolean {
  if (!user) return false;
  return ['admin', 'manager', 'cashier', 'accountant'].includes(user.role);
}
