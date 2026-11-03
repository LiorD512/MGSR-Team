import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { applyTags, authenticate, dismissSuggestion, TIERS_COLLECTION } from '@/lib/tiering/server';
import { suggestionOf } from '@/lib/tiering/shared';
import type { PlayerTierDoc } from '@/lib/tiering/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/tiering/accept
 *  { playerIds?: string[], minConfidence?: number }  -> accept AI suggestions (all, or the given ids; optional confidence floor)
 *  { dismissIds: string[] }                          -> dismiss suggestions
 */
export async function POST(req: NextRequest) {
  const actor = await authenticate(req);
  if (actor instanceof NextResponse) return actor;
  let body: { playerIds?: string[]; minConfidence?: number; dismissIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const db = adminDb();

  if (Array.isArray(body.dismissIds)) {
    for (const id of body.dismissIds) await dismissSuggestion(db, String(id));
    return NextResponse.json({ dismissed: body.dismissIds.length });
  }

  const snap = await db.collection(TIERS_COLLECTION).get();
  const only = Array.isArray(body.playerIds) ? new Set(body.playerIds.map(String)) : null;
  const floor = typeof body.minConfidence === 'number' ? body.minConfidence : 0;
  let accepted = 0;
  for (const d of snap.docs) {
    if (only && !only.has(d.id)) continue;
    const doc = { playerId: d.id, ...(d.data() as Omit<PlayerTierDoc, 'playerId'>) } as PlayerTierDoc;
    const s = suggestionOf(doc);
    if (!s || !doc.ai || doc.ai.confidence < floor) continue;
    await applyTags(db, d.id, { level: s.level, focus: s.focus }, actor, 'ai-accepted');
    accepted++;
  }
  return NextResponse.json({ accepted });
}
