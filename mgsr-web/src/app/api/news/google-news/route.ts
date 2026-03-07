import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleNews } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const leaguesParam = request.nextUrl.searchParams.get('leagues') || '';
    const langParam = request.nextUrl.searchParams.get('lang') || 'en';
    const leagueCodes = leaguesParam ? leaguesParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const targetLang = langParam === 'he' ? 'he' : 'en';
    const data = await handleGoogleNews(leagueCodes, targetLang);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Google News error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch Google News' },
      { status: 500 }
    );
  }
}
