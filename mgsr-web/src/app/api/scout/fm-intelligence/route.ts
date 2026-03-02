/**
 * Proxy for football-scout-server /fm_intelligence endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${getScoutBaseUrl()}/fm_intelligence?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: string })?.error || `Scout server returned ${res.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FM Intelligence API failed';
    console.error('FM Intelligence proxy error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
