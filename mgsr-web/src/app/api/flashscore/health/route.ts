import { NextResponse } from 'next/server';
import { probeSign } from '@/lib/flashscoreSign';
import { findProbeMatchId } from '@/lib/flashscore';

export const dynamic = 'force-dynamic';

/**
 * Reports whether the Flashscore feed signature we hold is still accepted.
 *
 * Nothing polls this — the `[flashscore:fsign]` console.error contract is the
 * actual alert surface. This is for checking on demand and for the regression
 * script to aim at.
 */
export async function GET() {
  try {
    const matchId = await findProbeMatchId();
    const probe = await probeSign(matchId);
    return NextResponse.json(
      { ...probe, probeMatchId: matchId },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not probe Flashscore signature' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
