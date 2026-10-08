import { NextRequest, NextResponse } from 'next/server';
import { generateMatchdayV2 } from '@/lib/matchday/v2/pipeline';
import { MatchdayError } from '@/lib/matchday/pipeline';
import type { MatchdayV2Input } from '@/lib/matchday/v2/types';

export const dynamic = 'force-dynamic';
// AI cutout + kit swap + pose + sky can each take time; allow headroom.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: MatchdayV2Input;
  try {
    body = (await request.json()) as MatchdayV2Input;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.playerName || !body?.club) {
    return NextResponse.json({ error: 'playerName and club are required' }, { status: 400 });
  }
  if (!body?.design) {
    return NextResponse.json({ error: 'design is required' }, { status: 400 });
  }

  try {
    const result = await generateMatchdayV2(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MatchdayError) {
      const status = err.code === 'NO_MATCH' ? 404 : err.code === 'NO_PLAYER_PHOTO' ? 422 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error('[matchday v2] generate error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'MATCHDAY generation failed' },
      { status: 500 }
    );
  }
}
