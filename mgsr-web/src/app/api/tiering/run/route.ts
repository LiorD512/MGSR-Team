import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { alertNewPushRecommendation, analyzePlayer, authenticateOrSecret, isStale, loadContext } from '@/lib/tiering/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/tiering/run
 *   { limit?: number (default 4, max 8), playerId?: string }
 * Analyses the stalest roster players (or one specific player). Call repeatedly until `remaining` is 0.
 * Auth: a signed-in agent (Bearer token) or the scheduled job (x-tiering-secret header).
 */
export async function POST(req: NextRequest) {
  const actor = await authenticateOrSecret(req);
  if (actor instanceof NextResponse) return actor;
  let body: { limit?: number; playerId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const db = adminDb();
  const ctx = await loadContext(db);
  const origin = req.nextUrl.origin;

  let queue = ctx.players.filter((p) => isStale(ctx.tiers.get(p.id), ctx.now));
  if (body.playerId) queue = ctx.players.filter((p) => p.id === body.playerId);
  // never-analysed first, then oldest
  queue.sort((a, b) => (ctx.tiers.get(a.id)?.ai?.computedAt ?? 0) - (ctx.tiers.get(b.id)?.ai?.computedAt ?? 0));
  const limit = Math.max(1, Math.min(8, Number(body.limit) || 4));
  const batch = queue.slice(0, limit);

  const errors: { playerId: string; error: string }[] = [];
  let processed = 0;
  // small concurrency (2) keeps external scrapers and Gemini rate limits happy
  for (let i = 0; i < batch.length; i += 2) {
    await Promise.all(
      batch.slice(i, i + 2).map(async (p) => {
        try {
          const doc = await analyzePlayer(db, ctx, p, origin);
          await alertNewPushRecommendation(db, doc);
          processed++;
        } catch (e) {
          errors.push({ playerId: p.id, error: String((e as Error)?.message ?? e) });
        }
      })
    );
  }
  const remaining = body.playerId ? 0 : Math.max(0, queue.length - processed);
  return NextResponse.json({ processed, remaining, total: ctx.players.length, errors });
}
