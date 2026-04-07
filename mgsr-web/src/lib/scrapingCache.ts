/**
 * Shared Firestore-based scraping cache for Vercel API routes.
 * Uses `ScrapingCache` collection with TTL-based expiry.
 * Reduces Vercel CPU usage by avoiding redundant scraping.
 */
import { adminDb, getFirebaseAdmin } from './firebaseAdmin';

function getDb() {
  if (!getFirebaseAdmin()) return null;
  return adminDb();
}

export async function getCached<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const db = getDb();
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
    const db = getDb();
    if (!db) return;
    await db.collection('ScrapingCache').doc(key).set({ payload, cachedAt: Date.now() });
  } catch {
    // silently ignore cache write failures
  }
}

export function sanitizeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}
