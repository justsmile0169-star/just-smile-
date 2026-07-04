import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

export type ActivityEntity =
  | 'product'
  | 'order'
  | 'payment'
  | 'expense'
  | 'promotion'
  | 'user'
  | 'backup'
  | 'invoice';

export async function logActivity(
  user: UserProfile | null,
  action: string,
  entityType: ActivityEntity,
  details?: string,
  entityId?: string
) {
  if (!user) return;
  try {
    await addDoc(collection(db, 'activity_logs'), {
      userId: user.uid,
      userName: user.name,
      userRole: user.role,
      action,
      entityType,
      entityId: entityId || null,
      details: details || null,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Activity log failed:', err);
  }
}
