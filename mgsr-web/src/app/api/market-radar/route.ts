import { NextRequest, NextResponse } from 'next/server';
import { getMarketRadarFeed, type MarketRegion, type MarketSignalType } from '@/lib/marketRadar';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const regionParam = (request.nextUrl.searchParams.get('region') || 'all') as MarketRegion;
    const signalParam = (request.nextUrl.searchParams.get('signal') || 'all') as MarketSignalType | 'all';
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

    const items = await getMarketRadarFeed({
      region: regionParam,
      signal: signalParam,
      refresh,
    });

    return NextResponse.json(items, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    });
  } catch (err) {
    console.error('Market Radar API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch market radar feed' },
      { status: 500 }
    );
  }
}
