import { NextRequest, NextResponse } from 'next/server';
import { fetchRecentGames } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** GET /api/transfermarkt/recent-games?url=<tmProfile> — last ~10 games from TM ceapi (server-side, via proxy). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url') || '';
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  try {
    const games = await fetchRecentGames(url);
    return NextResponse.json({ games });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
