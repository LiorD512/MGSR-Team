/**
 * Proxy for /find_next endpoint on football-scout-server.
 * "Find Me The Next..." — signature-based talent discovery.
 */
import { NextRequest, NextResponse } from 'next/server';

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${SCOUT_BASE}/find_next?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(120000), // 2 min
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: string })?.error || `Scout server returned ${res.status}`;
      return NextResponse.json({ error: msg, results: [] }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Find Next API failed';
    console.error('Find Next proxy error:', msg, err);
    return NextResponse.json({ error: msg, results: [] }, { status: 502 });
  }
}
