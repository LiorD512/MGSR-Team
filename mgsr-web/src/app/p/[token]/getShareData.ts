/**
 * Server-side fetch of share data for metadata (OG tags) and SSR.
 * Uses Firebase Admin when configured.
 */
import type { ShareData } from './types';

export async function getShareData(token: string): Promise<ShareData | null> {
  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    if (!app) return null;

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);
    const snap = await db.collection('SharedPlayers').doc(token).get();
    if (!snap.exists) return null;
    return snap.data() as ShareData;
  } catch {
    return null;
  }
}
