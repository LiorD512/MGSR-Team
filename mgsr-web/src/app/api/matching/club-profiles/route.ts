/**
 * POST /api/matching/club-profiles  { urls: string[] }  →  { profiles: { [vereinId]: ClubProfile | null } }
 *
 * Level data for the request-matching engine: the requesting club's current squad market values (overall median and
 * per position), scraped from Transfermarkt and cached in `ScrapingCache/matchClub_{vereinId}` for 14 days
 * (failures are remembered for 1 day so a broken page isn't re-scraped on every visit).
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { getCached, setCache } from '@/lib/scrapingCache';
import { scrapeClubSquad } from '@/lib/transfermarkt';
import { buildClubProfile, tmClubId, type ClubProfile } from '@/lib/matching/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 14 * 86_400_000;
const FAIL_TTL_MS = 86_400_000;
const MAX_URLS = 12;

type Cached = { profile: ClubProfile | null; failed?: boolean };

async function profileFor(url: string, id: string): Promise<ClubProfile | null> {
  const key = `matchClub_${id}`;
  const hit = await getCached<Cached>(key, TTL_MS);
  if (hit && !hit.failed) return hit.profile;
  if (hit?.failed && (await getCached<Cached>(key, FAIL_TTL_MS))) return null;
  try {
    const squad = await scrapeClubSquad(url);
    if (!squad.length) throw new Error('empty squad');
    const profile = buildClubProfile(squad.map((s) => ({ position: s.position, marketValue: s.marketValue })));
    await setCache(key, { profile } satisfies Cached);
    return profile;
  } catch {
    await setCache(key, { profile: null, failed: true } satisfies Cached);
    return null;
  }
}

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
  const byId = new Map<string, string>();
  for (const u of urls) { const id = tmClubId(u); if (id && !byId.has(id)) byId.set(id, u); }
  const entries = Array.from(byId.entries()).slice(0, MAX_URLS);

  const profiles: Record<string, ClubProfile | null> = {};
  // small concurrency: Transfermarkt goes through the shared proxy
  for (let i = 0; i < entries.length; i += 3) {
    const chunk = entries.slice(i, i + 3);
    const res = await Promise.all(chunk.map(([id, url]) => profileFor(url, id)));
    chunk.forEach(([id], j) => { profiles[id] = res[j] ?? null; });
  }
  return NextResponse.json({ profiles });
}
