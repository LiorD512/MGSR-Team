/**
 * Proxy for FM Intelligence — tries scout server first, falls back to direct
 * FMInside scraping via /api/fminside/player when the scout server has no data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // 1. Try scout server first (has cached DB — fast when available)
  try {
    const url = `${getScoutBaseUrl()}/fm_intelligence?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      // Scout server returns { error: ... } when it has no FM data — fall through
      if (data && !data.error && data.ca > 0) {
        return NextResponse.json(data, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
        });
      }
    }
  } catch {
    // Scout server down or timed out — fall through to direct scraping
  }

  // 2. Fallback: direct FMInside scraping via our own endpoint
  try {
    const origin = request.nextUrl.origin;
    const fallbackUrl = `${origin}/api/fminside/player?${searchParams.toString()}`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    const data = await fallbackRes.json().catch(() => ({}));
    if (fallbackRes.ok && data && !data.error) {
      return NextResponse.json(data, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
    }
    // Return whatever the fallback returned (including error)
    return NextResponse.json(data, { status: fallbackRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'FM Intelligence API failed';
    console.error('FM Intelligence error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
