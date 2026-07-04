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
    console.log('[staffAuth] Attempting staff sign in with email:', email);
    
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('email', '==', email)
    );
    
    console.log('[staffAuth] Executing query...');
    const querySnapshot = await getDocs(q);
    console.log('[staffAuth] Query completed, found', querySnapshot.size, 'documents');
    
    if (querySnapshot.empty) {
      console.log('[staffAuth] No user found with matching email');
      return null;
    }
    
    // Check all users with matching email (should be only one)
    for (const userDoc of querySnapshot.docs) {
      const userData = userDoc.data() as UserProfile;
      console.log('[staffAuth] Checking user:', userData.name, 'role:', userData.role, 'status:', userData.status);
      
      // Check if user is staff (not doctor)
      if (userData.role === 'doctor') {
        console.log('[staffAuth] User is a doctor, skipping');
        continue;
      }
      
      // Check if user is approved
      if (userData.status !== 'approved') {
        console.log('[staffAuth] User status is not approved:', userData.status);
        continue;
      }
      
      // Compare password with hashed password
      console.log('[staffAuth] Comparing password...');
      if (userData.password && await comparePassword(password, userData.password)) {
        console.log('[staffAuth] Password match! User authenticated:', userData.name);
        return userData;
      } else {
        console.log('[staffAuth] Password does not match');
      }
    }
    
    console.log('[staffAuth] No matching staff user found');
    return null;
  } catch (error) {
    console.error('[staffAuth] Error signing in staff:', error);
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
