import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { authenticate, readMeta, TIERS_COLLECTION } from '@/lib/tiering/server';
import type { PlayerTierDoc, TierListResponse } from '@/lib/tiering/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/tiering — read-only. Returns the analyses produced by the weekly background agent.
 * The dashboard ranks and shows the top N from this; it never triggers analysis.
 */
export async function GET(req: NextRequest) {
  const actor = await authenticate(req);
  if (actor instanceof NextResponse) return actor;
  const db = adminDb();
  const [tiersSnap, playersSnap, meta] = await Promise.all([
    db.collection(TIERS_COLLECTION).get(),
    db.collection('Players').select().get(),
    readMeta(db),
  ]);
  const rosterIds = new Set(playersSnap.docs.map((d) => d.id));
  const items: PlayerTierDoc[] = [];
  tiersSnap.docs.forEach((d) => {
    if (!rosterIds.has(d.id)) return;
    const data = d.data() as Omit<PlayerTierDoc, 'playerId'>;
    const { inputs: _inputs, ...rest } = data; // inputs = server cache, not for the UI
    void _inputs;
    items.push({ playerId: d.id, ...rest });
  });
  return NextResponse.json({ items, meta, generatedAt: Date.now() } satisfies TierListResponse);
}
