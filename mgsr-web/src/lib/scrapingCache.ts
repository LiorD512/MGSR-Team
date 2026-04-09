/**
 * Shared Firestore-based scraping cache for Vercel API routes.
 * Uses `ScrapingCache` collection with TTL-based expiry.
 * Reduces Vercel CPU usage by avoiding redundant scraping.
 *
 * NOTE: firebase-admin is loaded dynamically to avoid pulling Node.js-only
 * modules (fs, http2) into client-side webpack bundles.
 */

async function getDb() {
  try {
    const { adminDb, getFirebaseAdmin } = await import('./firebaseAdmin');
    if (!getFirebaseAdmin()) return null;
    return adminDb();
  } catch {
    return null;
  }
}

export async function getCached<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const snap = await db.collection('ScrapingCache').doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || Date.now() - (data.cachedAt as number) > ttlMs) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

export async function setCache(key: string, payload: unknown): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.collection('ScrapingCache').doc(key).set({ payload, cachedAt: Date.now() });
  } catch {
    // silently ignore cache write failures
  }
}

export function sanitizeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

const CHUNK_SIZE = 2000;

/**
 * Get cached data stored across multiple Firestore documents (chunked).
 * Reads `key-chunk-0`, `key-chunk-1`, ... and merges all payload arrays.
 */
export async function getCachedChunked<T>(key: string, ttlMs: number): Promise<T[] | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const col = db.collection('ScrapingCache');
    const snap = await col.doc(`${key}-chunk-0`).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || Date.now() - (data.cachedAt as number) > ttlMs) return null;

    const all: T[] = [...(data.payload as T[])];
    const totalChunks = (data.totalChunks as number) || 1;
    if (totalChunks > 1) {
      const promises = [];
      for (let i = 1; i < totalChunks; i++) {
        promises.push(col.doc(`${key}-chunk-${i}`).get());
      }
      const snaps = await Promise.all(promises);
      for (const s of snaps) {
        if (s.exists) all.push(...((s.data()?.payload as T[]) || []));
      }
    }
    return all;
  } catch {
    return null;
  }
}

/**
 * Write an array to Firestore split across multiple documents.
 * Each chunk stores up to CHUNK_SIZE items. Chunk-0 also stores totalChunks.
 */
export async function setCacheChunked(key: string, items: unknown[]): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const col = db.collection('ScrapingCache');
    const totalChunks = Math.ceil(items.length / CHUNK_SIZE);
    const now = Date.now();
    const batch = db.batch();
    for (let i = 0; i < totalChunks; i++) {
      const chunk = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const doc = col.doc(`${key}-chunk-${i}`);
      batch.set(doc, {
        payload: chunk,
        cachedAt: now,
        ...(i === 0 ? { totalChunks } : {}),
      });
    }
    await batch.commit();
  } catch {
    // silently ignore cache write failures
  }
}
