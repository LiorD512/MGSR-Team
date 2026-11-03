import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { authenticate, readMeta, TIERS_COLLECTION } from '@/lib/tiering/server';
import type { PlayerTierDoc, TierListResponse } from '@/lib/tiering/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/tiering — read-only. Returns the finished analyses produced by the background worker.
 * Never triggers analysis: the dashboard just reads.
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
    // `inputs` is a server-side cache — not needed by the UI.
    const { inputs: _inputs, ...rest } = data;
    void _inputs;
    items.push({ playerId: d.id, ...rest });
  });
  const body: TierListResponse = { items, meta, generatedAt: Date.now() };
  return NextResponse.json(body);
}
