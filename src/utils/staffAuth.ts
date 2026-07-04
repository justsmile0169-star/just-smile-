import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

/**
 * Sign in staff member using email and password from Firestore
 * This is a custom auth system for staff accounts (admin, manager, cashier, accountant)
 */
export async function signInStaff(email: string, password: string): Promise<UserProfile | null> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('email', '==', email),
      where('password', '==', password)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data() as UserProfile;
    
    // Check if user is staff (not doctor)
    if (userData.role === 'doctor') {
      return null;
    }
    
    // Check if user is approved
    if (userData.status !== 'approved') {
      return null;
    }
    
    return userData;
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
