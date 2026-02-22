import { NextRequest, NextResponse } from 'next/server';
import { handleReleases } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const min = parseInt(request.nextUrl.searchParams.get('min') || '0', 10);
    const max = parseInt(request.nextUrl.searchParams.get('max') || '5000000', 10);
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const data = await handleReleases(min, max, page);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Releases error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch releases' },
      { status: 500 }
    );
  }
}
