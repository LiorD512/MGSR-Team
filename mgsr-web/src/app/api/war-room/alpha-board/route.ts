/**
 * Proxy for the scout server's /alpha_board endpoint.
 * The browser never calls Render directly (CORS); this server route forwards
 * limit / position / trigger / lang query params and returns the ranked board.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${getScoutBaseUrl()}/alpha_board?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(120000), // 2 min: tolerate Render cold start
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: string })?.error || `Scout server returned ${res.status}`;
      return NextResponse.json({ error: msg, board: [] }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Alpha Board API failed';
    console.error('Alpha Board proxy error:', msg, err);
    return NextResponse.json({ error: msg, board: [] }, { status: 502 });
  }
}
