/**
 * Auto-Updater for JUST SMILE SPA & PWA
 *
 * Ensures that when a new version is deployed to production:
 * 1. Mobile & desktop background tabs immediately detect updates upon returning/focusing.
 * 2. Background polling checks for new builds every 60 seconds.
 * 3. Service worker skipWaiting & clientsClaim immediately trigger clean page reload.
 * 4. Missing chunk/module preload errors (stale hashes) automatically recover via reload.
 */

let isReloading = false;
let lastReloadTime = 0;

function safeReload(reason: string) {
  const now = Date.now();
  // Prevent reload loops within 8 seconds
  if (isReloading || now - lastReloadTime < 8000) {
    return;
  }
  isReloading = true;
  lastReloadTime = now;
  console.log(`[AutoUpdater] Reloading application: ${reason}`);

  try {
    sessionStorage.setItem('justsmile_last_auto_reload', String(now));
  } catch {
    // Ignore storage restrictions
  }

  // Force a hard reload from server
  window.location.reload();
}

/**
 * Checks if the remote index.html contains a newer asset/script bundle hash
 */
async function checkForHtmlUpdates() {
  if (!navigator.onLine) return;

  try {
    // Find current main script or style bundle in document
    const currentScript = document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src') ||
                          document.querySelector('script[src*="/assets/"]')?.getAttribute('src');

    const res = await fetch(`/?__update_check=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!res.ok) return;

    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const remoteScript = doc.querySelector('script[src*="/assets/index-"]')?.getAttribute('src') ||
                         doc.querySelector('script[src*="/assets/"]')?.getAttribute('src');

    if (currentScript && remoteScript && currentScript !== remoteScript) {
      console.log(`[AutoUpdater] New build detected! Current: ${currentScript} -> Remote: ${remoteScript}`);
      safeReload('New build deployed on server');
    }
  } catch (err) {
    // Silent fail if offline or network error
  }
}

/**
 * Initializes full auto-updater system
 */
export function initAutoUpdater() {
  // 1. Recover from Vite dynamic import / chunk load failures (common when new deploy deletes old chunks)
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    safeReload('Vite preload error (stale chunk detected)');
  });

  window.addEventListener('error', (event) => {
    const message = event?.message || '';
    if (
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('error loading dynamically imported module') ||
      message.includes('Loading chunk') ||
      message.includes('Importing a module script failed')
    ) {
      safeReload('Dynamic import chunk error');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = String(event?.reason?.message || event?.reason || '');
    if (
      reason.includes('Failed to fetch dynamically imported module') ||
      reason.includes('error loading dynamically imported module') ||
      reason.includes('Loading chunk')
    ) {
      safeReload('Unhandled chunk rejection');
    }
  });

  // 2. Service Worker Setup & Auto-Reload on Update
  if ('serviceWorker' in navigator) {
    let swRegistration: ServiceWorkerRegistration | null = null;

    // Listen for controllerchange: when new SW activates and claims clients, reload immediately
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      safeReload('Service Worker controller changed (new version activated)');
    });

    // Register Service Worker in production
    if (import.meta.env.PROD) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            swRegistration = registration;
            console.log('[AutoUpdater] Service Worker active');

            // Handle when a new worker is found
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (!installingWorker) return;

              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New update is ready, tell it to take over
                  console.log('[AutoUpdater] New worker installed, sending SKIP_WAITING...');
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              };
            };
          })
          .catch((err) => {
            console.warn('[AutoUpdater] Service Worker registration failed:', err);
          });
      });
    }

    // 3. User Resume / Tab Focus Listener (Crucial for mobile phones!)
    const triggerUpdateCheck = () => {
      if (swRegistration) {
        swRegistration.update().catch(() => {});
      }
      checkForHtmlUpdates();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        triggerUpdateCheck();
      }
    });

    window.addEventListener('focus', () => {
      triggerUpdateCheck();
    });

    window.addEventListener('online', () => {
      triggerUpdateCheck();
    });

    // 4. Background Periodic Interval (every 60 seconds)
    setInterval(() => {
      triggerUpdateCheck();
    }, 60000);
  } else {
    // Fallback if Service Worker is not available: check HTML bundle hashes on focus / interval
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForHtmlUpdates();
      }
    });
    window.addEventListener('focus', () => {
      checkForHtmlUpdates();
    });
    setInterval(checkForHtmlUpdates, 60000);
  }
}
