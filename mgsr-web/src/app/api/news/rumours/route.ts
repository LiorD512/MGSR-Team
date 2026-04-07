import { NextRequest, NextResponse } from 'next/server';
import { handleRumours } from '@/lib/transfermarkt';
import { getCached, setCache } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'rumours';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

export async function GET(request: NextRequest) {
  try {
    const pages = parseInt(request.nextUrl.searchParams.get('pages') || '5', 10);
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

    // L2: Firestore cache (survives cold starts — in-memory L1 is inside handleRumours)
    if (!refresh) {
      const cached = await getCached<unknown[]>(CACHE_KEY, CACHE_TTL);
      if (cached?.length) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
        });
      }
    }

    const data = await handleRumours(pages);
    if (data.length) await setCache(CACHE_KEY, data);
    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error('Rumours error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch rumours' },
      { status: 500 }
    );
  }
}
