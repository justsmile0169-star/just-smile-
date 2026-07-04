import { ActivityLog } from '../../types';
import { Language } from '../../translations';
import { getRoleLabel } from '../../utils/permissions';
import { History } from 'lucide-react';

interface ActivityLogViewProps {
  lang: Language;
  logs: ActivityLog[];
}

export default function ActivityLogView({ lang, logs }: ActivityLogViewProps) {
  const formatDate = (d: string) =>
    new Date(d).toLocaleString(lang === 'fr' ? 'fr-FR' : 'ar-DZ');

  const actionLabel = (action: string) => {
    const map: Record<string, { fr: string; ar: string }> = {
      create_promotion: { fr: 'Création promotion', ar: 'إنشاء عرض' },
      delete_promotion: { fr: 'Suppression promotion', ar: 'حذف عرض' },
      activate_promotion: { fr: 'Activation promotion', ar: 'تفعيل عرض' },
      deactivate_promotion: { fr: 'Désactivation promotion', ar: 'تعطيل عرض' },
      add_expense: { fr: 'Ajout dépense', ar: 'إضافة مصروف' },
      delete_expense: { fr: 'Suppression dépense', ar: 'حذف مصروف' },
      delete_product: { fr: 'Suppression produit', ar: 'حذف منتج' },
      create_product: { fr: 'Création produit', ar: 'إنشاء منتج' },
      update_product: { fr: 'Modification produit', ar: 'تعديل منتج' },
      backup_export: { fr: 'Export sauvegarde', ar: 'تصدير نسخة احتياطية' },
      update_staff_role: { fr: 'Changement rôle', ar: 'تغيير صلاحية' }
    };
    return map[action]?.[lang] || action;
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-50 pb-4">
        <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
          <History size={20} className="text-brand-cyan" />
          {lang === 'fr' ? 'Journal d\'Activité' : 'سجل الأحداث'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {lang === 'fr' ? 'Qui a fait quoi et quand.' : 'من فعل ماذا ومتى.'}
        </p>
      </div>

      <div className="overflow-x-auto border border-slate-100 rounded-2xl max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-xs font-extrabold text-slate-400 uppercase">
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Date' : 'التاريخ'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Utilisateur' : 'المستخدم'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Rôle' : 'الدور'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Action' : 'الإجراء'}</th>
              <th className="py-2 px-3 text-left">{lang === 'fr' ? 'Détails' : 'التفاصيل'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400 text-xs">{lang === 'fr' ? 'Aucune activité.' : 'لا أحداث.'}</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                  <td className="py-2 px-3 font-bold text-slate-800">{log.userName}</td>
                  <td className="py-2 px-3 text-xs">{getRoleLabel(log.userRole, lang)}</td>
                  <td className="py-2 px-3 text-xs font-semibold text-brand-cyan">{actionLabel(log.action)}</td>
                  <td className="py-2 px-3 text-xs text-slate-500 max-w-[200px] truncate">{log.details || log.entityId || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
