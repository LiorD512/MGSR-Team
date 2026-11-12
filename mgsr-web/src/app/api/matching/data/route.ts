/**
 * GET /api/matching/data → level data for the request-matching engine (men platform):
 *   { clubLevels: { [vereinId]: ClubLevel }, clubStrength: { [vereinId]: ClubStrength }, playerLevels: { [playerId]: PlayerLevelInfo } }
 * Built by `_matching_worker.ts` (weekly) and `/api/matching/club-profiles` (on demand for new requesting clubs).
 * ~3 + N(requesting clubs) Firestore reads per call; the client caches the answer for the session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { CLUB_LEVELS, loadStore } from '@/lib/matching/levelServer';
import type { ClubLevel } from '@/lib/matching/level';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!getFirebaseAdmin()) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  try {
    await adminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = adminDb();
  const [store, levels] = await Promise.all([loadStore(db), db.collection(CLUB_LEVELS).get()]);
  const clubLevels: Record<string, ClubLevel> = {};
  for (const d of levels.docs) clubLevels[d.id] = d.data() as ClubLevel;
  return NextResponse.json({ clubLevels, clubStrength: store.strength, playerLevels: store.players });
}
