import { checkAndTriggerWeeklyStatementScheduler } from './weeklyStatementService';

let isInitialized = false;
let checkInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize automatic background scheduler for weekly statement dispatch
 */
export function initWeeklyStatementScheduler(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. Initial check shortly after app bootstrap
  setTimeout(() => {
    checkAndTriggerWeeklyStatementScheduler().catch((err) => {
      console.warn('[WeeklyStatementScheduler] Initial check error:', err);
    });
  }, 15000);

  // 2. Periodic check every 15 minutes
  checkInterval = setInterval(() => {
    checkAndTriggerWeeklyStatementScheduler().catch((err) => {
      console.warn('[WeeklyStatementScheduler] Periodic check error:', err);
    });
  }, 15 * 60 * 1000);

  // 3. Tab visibility check (when admin returns to the tab)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAndTriggerWeeklyStatementScheduler().catch(() => {});
    }
  });

  console.log('[WeeklyStatementScheduler] Background listener active (Thursday midnight check).');
}
