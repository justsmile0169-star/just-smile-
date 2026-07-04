import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const COLLECTIONS = [
  'products', 'orders', 'payments', 'returns', 'users',
  'promotions', 'expenses', 'activity_logs', 'notifications', 'favorites'
] as const;

export async function exportDatabaseBackup(): Promise<{ json: string; counts: Record<string, number> }> {
  const backup: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    backup[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    counts[name] = snap.docs.length;
  }

  const settingsSnap = await getDocs(collection(db, 'settings'));
  backup.settings = settingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  counts.settings = settingsSnap.docs.length;

  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'JUST SMILE',
    version: '1.0',
    data: backup
  };

  await setDoc(doc(db, 'settings', 'backup_meta'), {
    lastBackupAt: payload.exportedAt,
    collectionCounts: counts
  });

  return { json: JSON.stringify(payload, null, 2), counts };
}

export function downloadJsonFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
