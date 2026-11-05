import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { authenticate, readMeta, TIERS_COLLECTION } from '@/lib/tiering/server';
import type { IntelListResponse, PlayerIntelDoc } from '@/lib/tiering/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/tiering — read-only. Returns the intel the weekly agent produced per roster player.
 * The dashboard ranks and shows the flagged ones. It never triggers analysis.
 */
export async function GET(req: NextRequest) {
  const actor = await authenticate(req);
  if (actor instanceof NextResponse) return actor;
  const db = adminDb();
  const [docsSnap, playersSnap, meta] = await Promise.all([
    db.collection(TIERS_COLLECTION).get(),
    db.collection('Players').select().get(),
    readMeta(db),
  ]);
  const rosterIds = new Set(playersSnap.docs.map((d) => d.id));
  const items: PlayerIntelDoc[] = [];
  docsSnap.docs.forEach((d) => {
    if (!rosterIds.has(d.id)) return;
    const data = d.data() as Omit<PlayerIntelDoc, 'playerId'>;
    const { history: _history, ...rest } = data; // history = server-side snapshots, keep the payload small
    void _history;
    items.push({ playerId: d.id, ...rest });
  });
  return NextResponse.json({ items, meta, generatedAt: Date.now() } satisfies IntelListResponse);
}
