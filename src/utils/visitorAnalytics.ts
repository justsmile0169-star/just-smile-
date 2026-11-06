import { doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, UserProfile, VisitorSession, VisitorViewedProduct } from '../types';

const VISITOR_ID_STORAGE_KEY = 'justsmile_visitor_id';
const SESSION_CACHE_KEY = 'justsmile_visitor_session_cache';

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getOrCreateVisitorId(): string {
  try {
    let vid = localStorage.getItem(VISITOR_ID_STORAGE_KEY);
    if (!vid) {
      vid = 'anon_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem(VISITOR_ID_STORAGE_KEY, vid);
    }
    return vid;
  } catch {
    return 'anon_fallback';
  }
}

function detectDeviceType(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || window.innerWidth < 768) {
    return 'mobile';
  }
  return 'desktop';
}

interface LocalSessionState {
  docId: string;
  dateKey: string;
  visitorId: string;
  firstVisitAt: string;
  hourOfDay: number;
  pageViews: number;
  viewedProducts: VisitorViewedProduct[];
  cartItemsCount: number;
  lastSyncedAt: number;
}

function getLocalSessionState(docId: string, dateKey: string, visitorId: string): LocalSessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalSessionState;
      if (parsed.docId === docId && parsed.dateKey === dateKey) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }

  const now = new Date();
  return {
    docId,
    dateKey,
    visitorId,
    firstVisitAt: now.toISOString(),
    hourOfDay: now.getHours(),
    pageViews: 0,
    viewedProducts: [],
    cartItemsCount: 0,
    lastSyncedAt: 0
  };
}

function saveLocalSessionState(state: LocalSessionState): void {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

/**
 * Records or updates the current visitor's daily session in Firestore.
 * Skips staff members (admin, manager, cashier, accountant, commercial) so staff activity does not skew visitor stats.
 */
export async function trackVisitorHeartbeat(
  currentUser: UserProfile | null,
  options?: { incrementPageView?: boolean; cartItemsCount?: number; forceSync?: boolean }
): Promise<void> {
  try {
    // Do not count staff members as store visitors
    if (currentUser && currentUser.role !== 'doctor') {
      return;
    }

    const now = new Date();
    const dateKey = getLocalDateKey(now);
    const isDoctor = !!(currentUser && currentUser.role === 'doctor');
    const visitorId = isDoctor && currentUser?.uid ? `doc_${currentUser.uid}` : getOrCreateVisitorId();
    const docId = `${dateKey}_${visitorId}`;

    const localState = getLocalSessionState(docId, dateKey, visitorId);

    if (options?.incrementPageView) {
      localState.pageViews = (localState.pageViews || 0) + 1;
    } else if (localState.pageViews === 0) {
      localState.pageViews = 1;
    }

    if (typeof options?.cartItemsCount === 'number') {
      localState.cartItemsCount = options.cartItemsCount;
    }

    // Throttle writes to at most once every 90 seconds unless forced or first sync
    const elapsedMs = Date.now() - (localState.lastSyncedAt || 0);
    if (!options?.forceSync && localState.lastSyncedAt > 0 && elapsedMs < 90_000) {
      saveLocalSessionState(localState);
      return;
    }

    localState.lastSyncedAt = Date.now();
    saveLocalSessionState(localState);

    const sessionRef = doc(db, 'visitor_sessions', docId);

    const payload: Record<string, any> = {
      id: docId,
      dateKey,
      visitorId,
      isDoctor,
      firstVisitAt: localState.firstVisitAt,
      lastActiveAt: now.toISOString(),
      hourOfDay: localState.hourOfDay,
      pageViews: localState.pageViews,
      viewedProducts: localState.viewedProducts || [],
      cartItemsCount: localState.cartItemsCount || 0,
      deviceType: detectDeviceType()
    };

    if (isDoctor && currentUser) {
      payload.doctorId = currentUser.uid;
      payload.doctorName = currentUser.name || '';
      payload.doctorClinic = currentUser.clinicName || '';
      payload.doctorPhone = currentUser.phone || '';
      payload.wilayaName = currentUser.wilayaName || currentUser.location || '';
    }

    await setDoc(sessionRef, payload, { merge: true });
  } catch (err) {
    // Fail silently so visitor tracking never interrupts user experience
    console.warn('[VisitorAnalytics] Heartbeat error:', err);
  }
}

/**
 * Records that the current visitor or doctor viewed a specific product.
 */
export async function trackVisitorProductView(
  product: Product,
  currentUser: UserProfile | null,
  cartItemsCount?: number
): Promise<void> {
  try {
    if (currentUser && currentUser.role !== 'doctor') {
      return;
    }

    const now = new Date();
    const dateKey = getLocalDateKey(now);
    const isDoctor = !!(currentUser && currentUser.role === 'doctor');
    const visitorId = isDoctor && currentUser?.uid ? `doc_${currentUser.uid}` : getOrCreateVisitorId();
    const docId = `${dateKey}_${visitorId}`;

    const localState = getLocalSessionState(docId, dateKey, visitorId);

    // If local viewedProducts is empty, try hydrating once from Firestore if existing doc has viewedProducts
    if (localState.viewedProducts.length === 0 && localState.lastSyncedAt === 0) {
      try {
        const snap = await getDoc(doc(db, 'visitor_sessions', docId));
        if (snap.exists()) {
          const existing = snap.data() as VisitorSession;
          if (Array.isArray(existing.viewedProducts)) {
            localState.viewedProducts = existing.viewedProducts;
          }
          if (typeof existing.pageViews === 'number' && existing.pageViews > localState.pageViews) {
            localState.pageViews = existing.pageViews;
          }
          if (existing.firstVisitAt) {
            localState.firstVisitAt = existing.firstVisitAt;
          }
        }
      } catch {
        // ignore
      }
    }

    const viewedEntry: VisitorViewedProduct = {
      productId: product.id,
      productName: product.name,
      category: product.category || '',
      viewedAt: now.toISOString()
    };

    // Keep unique products viewed in this session (up to 20 most recent)
    const filtered = (localState.viewedProducts || []).filter((vp) => vp.productId !== product.id);
    localState.viewedProducts = [viewedEntry, ...filtered].slice(0, 20);
    localState.pageViews = (localState.pageViews || 0) + 1;
    if (typeof cartItemsCount === 'number') {
      localState.cartItemsCount = cartItemsCount;
    }
    localState.lastSyncedAt = Date.now();
    saveLocalSessionState(localState);

    await trackVisitorHeartbeat(currentUser, { forceSync: true, cartItemsCount });
  } catch (err) {
    console.warn('[VisitorAnalytics] Product view error:', err);
  }
}

/**
 * Real-time subscription for Admin & Sales Rep to monitor visitor sessions.
 */
export function subscribeToVisitorSessions(
  onUpdate: (sessions: VisitorSession[]) => void,
  maxDocs: number = 400
): () => void {
  const q = query(
    collection(db, 'visitor_sessions'),
    orderBy('lastActiveAt', 'desc'),
    limit(maxDocs)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: VisitorSession[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as VisitorSession), id: docSnap.id });
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('[VisitorAnalytics] Snapshot listener error:', err);
    }
  );
}

