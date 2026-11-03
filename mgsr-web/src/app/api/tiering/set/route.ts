import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { applyTags, authenticate } from '@/lib/tiering/server';
import type { Focus, Level } from '@/lib/tiering/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const isLevel = (v: unknown): v is Level => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5;
const isFocus = (v: unknown): v is Focus => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4;

/** POST /api/tiering/set — any signed-in agent may set Level / Focus / lock. Note is optional. */
export async function POST(req: NextRequest) {
  const actor = await authenticate(req);
  if (actor instanceof NextResponse) return actor;
  let body: { playerId?: string; level?: unknown; focus?: unknown; note?: string; locked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  if (body.level != null && !isLevel(body.level)) return NextResponse.json({ error: 'level must be 1-5' }, { status: 400 });
  if (body.focus != null && !isFocus(body.focus)) return NextResponse.json({ error: 'focus must be 1-4' }, { status: 400 });
  const doc = await applyTags(
    adminDb(),
    body.playerId,
    {
      level: body.level as Level | undefined,
      focus: body.focus as Focus | undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
      locked: typeof body.locked === 'boolean' ? body.locked : undefined,
    },
    actor,
    'manual'
  );
  return NextResponse.json({ item: doc });
}
