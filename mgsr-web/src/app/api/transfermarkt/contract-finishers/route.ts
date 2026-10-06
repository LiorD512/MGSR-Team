import { NextRequest, NextResponse } from 'next/server';
import { handleContractFinishers } from '@/lib/transfermarkt';
import { getCachedChunked, setCacheChunked } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Bumped to -v3: the v2 cache still contained ~12K players including the wrong
// year (2027 summer contracts). The year-query fix now queries only the current
// year, producing a correct winter-only list.
const CACHE_KEY = 'contract-finishers-v3';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    if (!refresh) {
      const cached = await getCachedChunked<Record<string, unknown>>(CACHE_KEY, CACHE_TTL);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
        });
      }
    }
    const data = await handleContractFinishers();
    await setCacheChunked(CACHE_KEY, Array.isArray(data) ? data : (data as any).players || []);
    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('Contract finishers error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch contract finishers' },
      { status: 500 }
    );
  }
}
