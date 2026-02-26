/**
 * Server-side fetch of share data for metadata (OG tags) and SSR.
 * Tries Firebase Admin first, falls back to client SDK (works with public read rules).
 */
import type { ShareData } from './types';

export async function getShareData(token: string): Promise<ShareData | null> {
  // 1. Try Firebase Admin (when configured on Vercel)
  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    if (app) {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore(app);
      const snap = await db.collection('SharedPlayers').doc(token).get();
      if (snap.exists) return snap.data() as ShareData;
    }
  } catch {
    // Fall through to client SDK
  }

  // 2. Fallback: client Firebase SDK (works with public SharedPlayers read rules)
  try {
    const { db } = await import('@/lib/firebase');
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'SharedPlayers', token));
    if (snap.exists()) return snap.data() as ShareData;
  } catch {
    // Ignore
  }

  return null;
}
