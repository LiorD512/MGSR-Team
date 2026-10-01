import { NextRequest, NextResponse } from 'next/server';
import { generateMatchday, MatchdayError } from '@/lib/matchday/pipeline';
import type { MatchdayGenerateInput } from '@/lib/matchday/types';

export const dynamic = 'force-dynamic';
// Fixture scraping plus crest resolution can take a while; give it room.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let body: MatchdayGenerateInput;
  try {
    body = (await request.json()) as MatchdayGenerateInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.playerName || !body?.club) {
    return NextResponse.json({ error: 'playerName and club are required' }, { status: 400 });
  }

  try {
    const result = await generateMatchday(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MatchdayError) {
      // A missing curated photo is a precondition the operator can fix, not a
      // server fault — 422 so the UI can prompt for an upload.
      const status =
        err.code === 'NO_MATCH' ? 404 : err.code === 'NO_PLAYER_PHOTO' ? 422 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error('[matchday] generate error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'MATCHDAY generation failed' },
      { status: 500 }
    );
  }
}
