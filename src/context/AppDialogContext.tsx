import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Language } from '../translations';

export type AlertType = 'info' | 'success' | 'error';

interface AlertState {
  message: string;
  type: AlertType;
}

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

interface Toast {
  id: number;
  message: string;
  type: AlertType;
}

interface AppDialogContextValue {
  alert: (message: string, type?: AlertType) => void;
  toast: (message: string, type?: AlertType) => void;
  confirm: (message: string) => Promise<boolean>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

let dialogApi: AppDialogContextValue | null = null;

export function showAlert(message: string, type: AlertType = 'info') {
  dialogApi?.alert(message, type);
}

export function showToast(message: string, type: AlertType = 'success') {
  dialogApi?.toast(message, type);
}

export function showConfirm(message: string): Promise<boolean> {
  return dialogApi?.confirm(message) ?? Promise.resolve(false);
}

export function useAppDialog() {
  const ctx = useContext(AppDialogContext);
  if (!ctx) throw new Error('useAppDialog must be used within AppDialogProvider');
  return ctx;
}

const typeStyles: Record<AlertType, { icon: typeof Info; iconClass: string; btnClass: string }> = {
  info: { icon: Info, iconClass: 'text-brand-cyan bg-brand-cyan/10', btnClass: 'bg-brand-cyan hover:bg-brand-cyan/90' },
  success: { icon: CheckCircle, iconClass: 'text-emerald-600 bg-emerald-50', btnClass: 'bg-emerald-600 hover:bg-emerald-700' },
  error: { icon: AlertCircle, iconClass: 'text-rose-600 bg-rose-50', btnClass: 'bg-rose-600 hover:bg-rose-700' },
};

export function AppDialogProvider({ lang, children }: { lang: Language; children: React.ReactNode }) {
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const alert = useCallback((message: string, type: AlertType = 'info') => {
    setAlertState({ message, type });
  }, []);

  const toast = useCallback((message: string, type: AlertType = 'success') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);

  const api = useRef({ alert, toast, confirm });
  api.current = { alert, toast, confirm };

  useEffect(() => {
    dialogApi = api.current;
    return () => {
      dialogApi = null;
    };
  }, [alert, toast, confirm]);

  const closeConfirm = (result: boolean) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  const okLabel = lang === 'fr' ? 'OK' : 'حسناً';
  const cancelLabel = lang === 'fr' ? 'Annuler' : 'إلغاء';
  const confirmLabel = lang === 'fr' ? 'Confirmer' : 'تأكيد';

  return (
    <AppDialogContext.Provider value={api.current}>
      {children}

      {/* Toast notifications */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((t) => {
          const style = typeStyles[t.type];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className="pointer-events-auto bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-lg px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <div className={`p-1.5 rounded-xl shrink-0 ${style.iconClass}`}>
                <Icon size={16} />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed flex-1 whitespace-pre-line">
                {t.message}
              </p>
            </div>
          );
        })}
      </div>

      {/* Alert modal */}
      {alertState && (() => {
        const style = typeStyles[alertState.type];
        const Icon = style.icon;
        return (
          <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${style.iconClass}`}>
                    <Icon size={20} />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line pt-1">
                    {alertState.message}
                  </p>
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAlertState(null)}
                  className={`w-full text-white font-bold text-sm py-3 rounded-xl transition-all ${style.btnClass}`}
                >
                  {okLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl shrink-0 text-amber-600 bg-amber-50">
                  <AlertCircle size={20} />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line pt-1">
                  {confirmState.message}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className="flex-1 bg-rose-600 text-white font-bold text-sm py-3 rounded-xl hover:bg-rose-700 transition-all"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  );
}
