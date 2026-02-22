import { NextRequest, NextResponse } from 'next/server';
import { handleClubSearch } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';
    const data = await handleClubSearch(q);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Club search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Club search failed' },
      { status: 500 }
    );
  }
}
