/**
 * Proxy for football-scout-server /player_stats endpoint.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${getScoutBaseUrl()}/player_stats?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scout API failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
