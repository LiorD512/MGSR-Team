import { NextRequest, NextResponse } from 'next/server';
import { handleReturnees } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const leagueUrl = request.nextUrl.searchParams.get('leagueUrl') || '';
    if (!leagueUrl.trim()) {
      return NextResponse.json(
        { error: 'Missing leagueUrl parameter' },
        { status: 400 }
      );
    }
    const data = await handleReturnees(leagueUrl);
    return NextResponse.json(data);
  } catch (err) {
    console.error('Returnees error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch returnees' },
      { status: 500 }
    );
  }
}
