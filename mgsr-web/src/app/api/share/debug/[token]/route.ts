/**
 * Debug: returns share data + diagnostics. Remove or protect in production.
 * GET /api/share/debug/TOKEN
 */
import { NextRequest, NextResponse } from 'next/server';
import type { ShareData } from '@/app/p/[token]/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const diag: Record<string, unknown> = {};

  // 1. Try Firebase Admin
  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    diag.adminConfigured = !!app;
    if (app) {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore(app);
      const snap = await db.collection('SharedPlayers').doc(token).get();
      diag.adminDocExists = snap.exists;
      if (snap.exists) {
        const data = snap.data() as ShareData;
        return NextResponse.json({
          hasData: true,
          hasPlayer: !!data?.player,
          hasProfileImage: !!data?.player?.profileImage,
          playerKeys: data?.player ? Object.keys(data.player) : [],
          diag: { ...diag, source: 'admin' },
        });
      }
    }
  } catch (e) {
    diag.adminError = e instanceof Error ? e.message : String(e);
  }

  // 2. Try client SDK
  try {
    const { db } = await import('@/lib/firebase');
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'SharedPlayers', token));
    diag.clientDocExists = snap.exists();
    if (snap.exists()) {
      const data = snap.data() as ShareData;
      return NextResponse.json({
        hasData: true,
        hasPlayer: !!data?.player,
        hasProfileImage: !!data?.player?.profileImage,
        playerKeys: data?.player ? Object.keys(data.player) : [],
        diag: { ...diag, source: 'client' },
      });
    }
  } catch (e) {
    diag.clientError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    hasData: false,
    hasPlayer: false,
    hasProfileImage: false,
    playerKeys: [],
    diag,
  });
}
