import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

/**
 * Sign in staff member using email and password from Firestore
 * This is a custom auth system for staff accounts (admin, manager, cashier, accountant)
 */
export async function signInStaff(email: string, password: string): Promise<UserProfile | null> {
  try {
    console.log('Attempting staff sign in with email:', email);
    
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('email', '==', email),
      where('password', '==', password)
    );
    
    console.log('Executing query...');
    const querySnapshot = await getDocs(q);
    console.log('Query completed, found', querySnapshot.size, 'documents');
    
    if (querySnapshot.empty) {
      console.log('No user found with matching email and password');
      return null;
    }
    
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data() as UserProfile;
    console.log('Found user:', userData.name, 'with role:', userData.role, 'status:', userData.status);
    
    // Check if user is staff (not doctor)
    if (userData.role === 'doctor') {
      console.log('User is a doctor, not staff');
      return null;
    }
    
    // Check if user is approved
    if (userData.status !== 'approved') {
      console.log('User status is not approved:', userData.status);
      return null;
    }
    
    console.log('Staff sign in successful for:', userData.name);
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
