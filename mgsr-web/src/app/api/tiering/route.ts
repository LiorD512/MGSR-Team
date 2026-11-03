import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { authenticate, isStale, TIERS_COLLECTION } from '@/lib/tiering/server';
import type { PlayerTierDoc, TierListResponse } from '@/lib/tiering/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/tiering — all roster tier docs + how many roster players still need analysis. */
export async function GET(req: NextRequest) {
  const actor = await authenticate(req);
  if (actor instanceof NextResponse) return actor;
  const db = adminDb();
  const [tiersSnap, playersSnap] = await Promise.all([
    db.collection(TIERS_COLLECTION).get(),
    db.collection('Players').select().get(),
  ]);
  const tiers = new Map<string, PlayerTierDoc>();
  tiersSnap.docs.forEach((d) => tiers.set(d.id, { playerId: d.id, ...(d.data() as Omit<PlayerTierDoc, 'playerId'>) }));
  const now = Date.now();
  const rosterIds = new Set(playersSnap.docs.map((d) => d.id));
  // Only return docs for players still on the roster.
  const items = Array.from(tiers.values()).filter((t) => rosterIds.has(t.playerId));
  const pending = Array.from(rosterIds).filter((id) => isStale(tiers.get(id), now)).length;
  const body: TierListResponse = { items, pending, generatedAt: now };
  return NextResponse.json(body);
}
