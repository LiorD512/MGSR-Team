/**
 * Club Intelligence API — on-demand club analysis from Transfermarkt.
 *
 * GET /api/club-intel?clubTmProfile=https://www.transfermarkt.com/...
 *
 * Returns squad stats, nationality breakdown, transfer behavior, etc.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateClubIntelligence } from '@/lib/clubIntel';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const clubTmProfile = request.nextUrl.searchParams.get('clubTmProfile');

  if (!clubTmProfile?.trim()) {
    return NextResponse.json(
      { error: 'clubTmProfile parameter required' },
      { status: 400 }
    );
  }

  // Validate the URL looks like a Transfermarkt club URL
  if (!clubTmProfile.includes('transfermarkt') || !clubTmProfile.includes('verein/')) {
    return NextResponse.json(
      { error: 'Invalid Transfermarkt club URL' },
      { status: 400 }
    );
  }

  try {
    const intel = await generateClubIntelligence(clubTmProfile);
    return NextResponse.json(intel, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[club-intel] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate club intelligence' },
      { status: 500 }
    );
  }
}
