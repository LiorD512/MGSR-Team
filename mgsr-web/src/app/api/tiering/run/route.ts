import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { alertIfNewlyUrgent, authenticateOrSecret, loadContext, processPlayer } from '@/lib/tiering/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/tiering/run  { playerId: string }
 * Forces a fresh full analysis of ONE player (all sources + AI analyst). Used by "Re-analyse" in the drawer
 * and by the worker's real-time listener when it runs on a platform without direct Firestore access.
 * The whole roster is analysed by the background worker (_tiering_worker.ts), never from the browser.
 */
export async function POST(req: NextRequest) {
  const actor = await authenticateOrSecret(req);
  if (actor instanceof NextResponse) return actor;
  let body: { playerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  if (!body.playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  const db = adminDb();
  const ctx = await loadContext(db);
  const p = ctx.players.find((x) => x.id === body.playerId);
  if (!p) return NextResponse.json({ error: 'Player not found on roster' }, { status: 404 });
  const r = await processPlayer(db, ctx, p, { appOrigin: req.nextUrl.origin, force: true });
  await alertIfNewlyUrgent(db, r.doc);
  const { inputs: _i, ...item } = r.doc;
  void _i;
  return NextResponse.json({ item, analystRan: r.analystRan, refreshed: r.refreshed });
}
