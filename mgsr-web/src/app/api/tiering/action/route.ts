import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { applyAction, authenticate, type BoardAction } from '@/lib/tiering/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ACTIONS: BoardAction[] = ['mark', 'unmark', 'handled', 'reopen'];

/**
 * POST /api/tiering/action  { playerId, action: 'mark'|'unmark'|'handled'|'reopen', note? }
 * Any signed-in agent. mark/unmark = window target; handled = "done" on Push now (until a new trigger).
 */
export async function POST(req: NextRequest) {
  const actor = await authenticate(req);
  if (actor instanceof NextResponse) return actor;
  let body: { playerId?: string; action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  if (!ACTIONS.includes(body.action as BoardAction)) return NextResponse.json({ error: `action must be one of ${ACTIONS.join(', ')}` }, { status: 400 });
  try {
    const doc = await applyAction(adminDb(), body.playerId, body.action as BoardAction, actor, typeof body.note === 'string' ? body.note : undefined);
    const { inputs: _i, ...item } = doc;
    void _i;
    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 404 });
  }
}
