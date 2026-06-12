import { NextRequest, NextResponse } from 'next/server';
import { handleReleases } from '@/lib/transfermarkt';
import { getCached, setCache, sanitizeKey, getCachedChunked, getCachedChunkedWithOptions } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const ALL_CACHE_KEY = 'releases-all';
const ALL_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days (matches local worker schedule)

export async function GET(request: NextRequest) {
  try {
    const min = parseInt(request.nextUrl.searchParams.get('min') || '0', 10);
    const max = parseInt(request.nextUrl.searchParams.get('max') || '5000000', 10);
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const all = request.nextUrl.searchParams.get('all') === 'true';

    // If requesting all releases, always serve from chunked cache.
    // refresh=true means "force latest persisted cache" (ignore TTL), not live scrape.
    if (all) {
      const cached = refresh
        ? await getCachedChunkedWithOptions<Record<string, unknown>>(ALL_CACHE_KEY, ALL_CACHE_TTL, { ignoreTtl: true })
        : await getCachedChunked<Record<string, unknown>>(ALL_CACHE_KEY, ALL_CACHE_TTL);

      if (cached && cached.length > 0) {
        return NextResponse.json(
          { players: cached, fromCache: true, forcedRefresh: refresh },
          {
            headers: {
              'X-Cache': 'HIT',
              'Cache-Control': refresh
                ? 'no-store'
                : 'public, s-maxage=3600, stale-while-revalidate=43200',
            },
          }
        );
      }

      return NextResponse.json(
        { players: [], fromCache: false, forcedRefresh: refresh },
        { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } }
      );
    }

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
