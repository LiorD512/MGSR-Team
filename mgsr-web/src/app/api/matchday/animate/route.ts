import { NextRequest, NextResponse } from 'next/server';
import { animatePoster } from '@/lib/matchday/v2/motion';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Motion prototype: turns a finished MATCHDAY poster (base64 data URL) into a
 * short seamless-loop animated WebP. Pure image maths — no AI, no extra cost.
 */
export async function POST(request: NextRequest) {
  let body: { imageDataUrl?: string };
  try {
    body = (await request.json()) as { imageDataUrl?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const m = body?.imageDataUrl?.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/);
  if (!m) {
    return NextResponse.json({ error: 'imageDataUrl must be a base64 PNG/JPEG/WebP data URL' }, { status: 400 });
  }
  try {
    const r = await animatePoster(Buffer.from(m[1], 'base64'));
    return NextResponse.json({
      imageDataUrl: `data:image/webp;base64,${r.bytes.toString('base64')}`,
      frames: r.frames,
      bytes: r.bytes.length,
    });
  } catch (err) {
    console.error('[matchday animate] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Animation failed' }, { status: 500 });
  }
}
