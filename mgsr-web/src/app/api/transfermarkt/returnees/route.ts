import { NextRequest, NextResponse } from 'next/server';
import { handleReturnees } from '@/lib/transfermarkt';
import { getCached, setCache, sanitizeKey } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  try {
    const leagueUrl = request.nextUrl.searchParams.get('leagueUrl') || '';
    if (!leagueUrl.trim()) {
      return NextResponse.json(
        { error: 'Missing leagueUrl parameter' },
        { status: 400 }
      );
    }
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const cacheKey = `returnees-${sanitizeKey(leagueUrl)}`;
    if (!refresh) {
      const cached = await getCached<{ players: Record<string, unknown>[] }>(cacheKey, CACHE_TTL);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        });
      }
    }
    const data = await handleReturnees(leagueUrl);
    await setCache(cacheKey, data);
    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('Returnees error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch returnees' },
      { status: 500 }
    );
  }
}
