import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSeasonYear } from '@/lib/api';
import { getPlayerPerformanceStats } from '@/lib/transfermarkt';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || '';
    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : getCurrentSeasonYear();
    if (!url.trim()) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }
    const stats = await getPlayerPerformanceStats(url, season);
    return NextResponse.json(stats);
  } catch (err) {
    console.error('Performance stats error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch performance' },
      { status: 500 }
    );
  }
}
