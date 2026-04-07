import { NextRequest, NextResponse } from 'next/server';
import { handleReleases } from '@/lib/transfermarkt';
import { getCached, setCache, sanitizeKey } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: NextRequest) {
  try {
    const min = parseInt(request.nextUrl.searchParams.get('min') || '0', 10);
    const max = parseInt(request.nextUrl.searchParams.get('max') || '5000000', 10);
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const cacheKey = `releases-${sanitizeKey(`${min}-${max}-${page}`)}`;
    if (!refresh) {
      const cached = await getCached<unknown>(cacheKey, CACHE_TTL);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=43200' },
        });
      }
    }
    const data = await handleReleases(min, max, page);
    await setCache(cacheKey, data);
    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=43200' },
    });
  } catch (err) {
    console.error('Releases error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch releases' },
      { status: 500 }
    );
  }
}
