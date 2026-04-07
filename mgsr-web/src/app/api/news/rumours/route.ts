import { NextRequest, NextResponse } from 'next/server';
import { handleRumours } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const pages = parseInt(request.nextUrl.searchParams.get('pages') || '5', 10);
    const data = await handleRumours(pages);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error('Rumours error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch rumours' },
      { status: 500 }
    );
  }
}
