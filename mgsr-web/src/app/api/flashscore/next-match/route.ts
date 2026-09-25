import { NextRequest, NextResponse } from 'next/server';
import { handleFlashscoreNextMatch } from '@/lib/flashscore';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || '';
    const clubName = request.nextUrl.searchParams.get('club') || undefined;
    const clubCountry = request.nextUrl.searchParams.get('country') || undefined;
    if ((!url || !/^https?:\/\/([\w-]+\.)*transfermarkt\.com\//i.test(url)) && !clubName?.trim()) {
      return NextResponse.json({ error: 'A Transfermarkt player URL or club name is required' }, { status: 400 });
    }
    return NextResponse.json(await handleFlashscoreNextMatch(url, { name: clubName, country: clubCountry }), {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('Flashscore next match error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load Flashscore next match' },
      { status: 502 }
    );
  }
}