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
    const q = query(
      usersRef,
      where('email', '==', email)
    );
    
    const querySnapshot = await getDocs(q);
    
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
      
      // Check if user is approved
      if (userData.status !== 'approved') {
        continue;
      }
      
      // Compare password with hashed password
      if (userData.password && await comparePassword(password, userData.password)) {
        return userData;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error signing in staff:', error);
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
