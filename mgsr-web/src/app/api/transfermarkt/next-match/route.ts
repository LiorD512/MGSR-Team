import { NextRequest, NextResponse } from 'next/server';
import { handleNextMatch } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || '';
    if (!url || !/^https?:\/\/([\w-]+\.)*transfermarkt\.com\//i.test(url)) {
      return NextResponse.json({ error: 'A Transfermarkt player URL is required' }, { status: 400 });
    }
    return NextResponse.json(await handleNextMatch(url), {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    console.error('Next match error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not load next match' },
      { status: 502 }
    );
  }
}