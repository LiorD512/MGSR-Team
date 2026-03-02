import { NextRequest, NextResponse } from 'next/server';
import { searchIFAClubs } from '@/lib/ifa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') || '';
    const clubs = await searchIFAClubs(q);
    return NextResponse.json({ clubs });
  } catch (err) {
    console.error('IFA club search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'IFA club search failed' },
      { status: 500 }
    );
  }
}
