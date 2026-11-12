/**
 * POST /api/matching/club-profiles  { urls: string[] }  →  { clubLevels: { [vereinId]: ClubLevel | null } }
 *
 * On-demand level data for requesting clubs the weekly worker hasn't processed yet (e.g. a request created today).
 * Builds the club's ClubLevel (squad + 3 seasons of signings) within a time / fetch budget and saves it to
 * `MatchingClubLevels/{id}`; strengths of origin clubs not scraped in time stay unknown until the weekly run.
 * Failures are remembered for a day so a broken page isn't re-scraped on every visit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { tmClubId } from '@/lib/matching/engine';
import type { ClubLevel, ClubStrength } from '@/lib/matching/level';
import { buildClubLevel, CLUB_LEVELS, CLUB_LEVEL_TTL_MS, loadStore, mergeStrength } from '@/lib/matching/levelServer';
import { getCached, setCache } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_CLUBS = 3;
const FAIL_TTL_MS = 86_400_000;

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!getFirebaseAdmin()) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  try {
    await adminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { urls?: unknown };
  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string') : [];
  const ids = Array.from(new Set(urls.map(tmClubId).filter((x): x is string => !!x))).slice(0, MAX_CLUBS);

  const db = adminDb();
  const store = await loadStore(db);
  const fresh: Record<string, ClubStrength> = {};
  const out: Record<string, ClubLevel | null> = {};
  const deadline = Date.now() + 45_000;

  for (const id of ids) {
    const doc = await db.collection(CLUB_LEVELS).doc(id).get();
    const cur = doc.exists ? (doc.data() as ClubLevel) : null;
    if (cur && Date.now() - cur.updatedAt < CLUB_LEVEL_TTL_MS) { out[id] = cur; continue; }
    if (await getCached<boolean>(`matchLevelFail_${id}`, FAIL_TTL_MS)) { out[id] = cur; continue; }
    const remaining = Math.max(0, deadline - Date.now());
    const lvl = await buildClubLevel(id, store, { fetches: 25, deadline: Date.now() + remaining / Math.max(1, ids.length - Object.keys(out).length) }, fresh);
    if (lvl && lvl.signings.length) {
      await db.collection(CLUB_LEVELS).doc(id).set(lvl);
      out[id] = lvl;
    } else {
      await setCache(`matchLevelFail_${id}`, true);
      out[id] = cur;
    }
  }
  await mergeStrength(db, fresh).catch(() => undefined);
  return NextResponse.json({ clubLevels: out });
}
