import { NextRequest, NextResponse } from 'next/server';
import { handleLeagueNews } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const leaguesParam = request.nextUrl.searchParams.get('leagues') || '';
    const leagueCodes = leaguesParam ? leaguesParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const data = await handleLeagueNews(leagueCodes);
    return NextResponse.json(data);
  } catch (err) {
    console.error('League news error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch league news' },
      { status: 500 }
    );
  }
}
