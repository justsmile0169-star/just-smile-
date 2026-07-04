import { UserProfile, UserRole } from '../types';

export type Permission =
  | 'view_analytics'
  | 'manage_inventory'
  | 'manage_promotions'
  | 'manage_expenses'
  | 'view_expenses'
  | 'manage_payments'
  | 'edit_invoices'
  | 'view_reports'
  | 'manage_staff'
  | 'view_activity_logs'
  | 'manage_backup'
  | 'sell'
  | 'view_client_situation';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'view_analytics', 'manage_inventory', 'manage_promotions', 'manage_expenses',
    'view_expenses', 'manage_payments', 'edit_invoices', 'view_reports', 'manage_staff',
    'view_activity_logs', 'manage_backup', 'sell', 'view_client_situation'
  ],
  manager: [
    'view_analytics', 'manage_inventory', 'manage_promotions', 'manage_expenses',
    'view_expenses', 'manage_payments', 'view_reports', 'view_activity_logs', 'sell', 'view_client_situation'
  ],
  accountant: [
    'view_expenses', 'manage_expenses', 'manage_payments', 'edit_invoices',
    'view_reports', 'view_activity_logs', 'view_client_situation'
  ],
  cashier: ['sell', 'manage_payments'],
  doctor: ['sell']
};

export function hasPermission(user: UserProfile | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === 'doctor') return permission === 'sell' && user.status === 'approved';
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

export function isStaffUser(user: UserProfile | null): boolean {
  return !!user && user.role !== 'doctor';
}

export function canAccessAdmin(user: UserProfile | null): boolean {
  return isStaffUser(user);
}

export function getRoleLabel(role: UserRole, lang: 'fr' | 'ar'): string {
  const labels: Record<UserRole, { fr: string; ar: string }> = {
    admin: { fr: 'Administrateur', ar: 'مدير' },
    manager: { fr: 'Manager', ar: 'مدير فرع' },
    cashier: { fr: 'Caissier', ar: 'كاشير' },
    accountant: { fr: 'Comptable', ar: 'محاسب' },
    doctor: { fr: 'Praticien', ar: 'طبيب' }
  };
  return labels[role][lang];
}
