import { NextRequest, NextResponse } from 'next/server';
import { generatePreviews, type PreviewInput } from '@/lib/matchday/v2/preview';
import { MatchdayError } from '@/lib/matchday/pipeline';

export const dynamic = 'force-dynamic';
// First call may include one Gemini cutout; later calls hit the cutout cache.
export const maxDuration = 300;

/** Real-player thumbnails of every MATCHDAY style (see lib/matchday/v2/preview.ts). */
export async function POST(request: NextRequest) {
  let body: PreviewInput;
  try {
    body = (await request.json()) as PreviewInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body?.playerName || !body?.club) {
    return NextResponse.json({ error: 'playerName and club are required' }, { status: 400 });
  }

  try {
    const previews = await generatePreviews(body);
    return NextResponse.json({ previews });
  } catch (err) {
    if (err instanceof MatchdayError) {
      const status = err.code === 'NO_MATCH' ? 404 : err.code === 'NO_PLAYER_PHOTO' ? 422 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error('[matchday preview] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview generation failed' },
      { status: 500 }
    );
  }
}
