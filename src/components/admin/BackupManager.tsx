import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, BackupMeta } from '../../types';
import { Language } from '../../translations';
import { useAppDialog } from '../../context/AppDialogContext';
import { logActivity } from '../../utils/activityLogger';
import { exportDatabaseBackup, downloadJsonFile } from '../../utils/backupExport';
import { CloudDownload, Clock, Database } from 'lucide-react';

interface BackupManagerProps {
  lang: Language;
  currentUser: UserProfile;
}

export default function BackupManager({ lang, currentUser }: BackupManagerProps) {
  const { alert } = useAppDialog();
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<BackupMeta>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'backup_meta'), (snap) => {
      if (snap.exists()) setMeta(snap.data() as BackupMeta);
    });
    return () => unsub();
  }, []);

  const handleExport = async () => {
    setLoading(true);
    try {
      const { json, counts } = await exportDatabaseBackup();
      const filename = `justsmile-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJsonFile(json, filename);
      await logActivity(currentUser, 'backup_export', 'backup', filename);
      localStorage.setItem('justsmile_last_backup', new Date().toISOString());
      alert(
        lang === 'fr'
          ? `Sauvegarde exportée (${Object.values(counts).reduce((a, b) => a + b, 0)} documents).`
          : `تم تصدير النسخة الاحتياطية (${Object.values(counts).reduce((a, b) => a + b, 0)} مستند).`,
        'success'
      );
    } catch (err) {
      console.error(err);
      alert(lang === 'fr' ? 'Erreur export.' : 'خطأ في التصدير.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const lastLocal = localStorage.getItem('justsmile_last_backup');

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <Database size={20} className="text-brand-cyan" />
          {lang === 'fr' ? 'Sauvegarde Cloud' : 'النسخ الاحتياطي'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {lang === 'fr'
            ? 'Exportez toutes les collections Firestore vers un fichier JSON sécurisé.'
            : 'صدّر كل بيانات Firestore إلى ملف JSON.'}
        </p>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-4">
        {meta.lastBackupAt && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock size={16} />
            {lang === 'fr' ? 'Dernière sauvegarde cloud:' : 'آخر نسخة على السحابة:'}{' '}
            <strong>{new Date(meta.lastBackupAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}</strong>
          </div>
        )}
        {lastLocal && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {lang === 'fr' ? 'Dernier export local:' : 'آخر تصدير محلي:'}{' '}
            {new Date(lastLocal).toLocaleString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}
          </div>
        )}
        {meta.collectionCounts && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(meta.collectionCounts).map(([k, v]) => (
              <span key={k} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-lg font-bold text-slate-600">
                {k}: {v}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="flex items-center gap-2 bg-brand-cyan text-white font-bold px-6 py-3 rounded-xl hover:bg-brand-cyan/90 disabled:opacity-50"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <CloudDownload size={18} />
          )}
          {lang === 'fr' ? 'Exporter la base de données' : 'تصدير قاعدة البيانات'}
        </button>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {lang === 'fr'
            ? 'Pour une sauvegarde automatique planifiée, configurez Firebase Scheduled Exports ou Cloud Functions.'
            : 'للجدولة التلقائية، استخدم Firebase Scheduled Exports أو Cloud Functions.'}
        </p>
      </div>
    </div>
  );
}
