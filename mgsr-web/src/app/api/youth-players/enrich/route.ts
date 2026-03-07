/**
 * Lightweight enrichment endpoint — fetches real IFA profile data for a single player.
 * Used by the Android app to progressively enrich search results after the fast snippet-based search.
 * Uses allorigins proxy with a short timeout to avoid blocking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchIFAProfileViaProxy, type IFAPlayerProfile } from '@/lib/ifa';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const IFA_BASE = 'https://www.football.org.il';

export async function GET(request: NextRequest) {
  const playerId = (request.nextUrl.searchParams.get('player_id') || '').trim();
  if (!playerId || !/^\d+$/.test(playerId)) {
    return NextResponse.json({ error: 'Missing or invalid player_id' }, { status: 400 });
  }

  const ifaUrl = `${IFA_BASE}/players/player/?player_id=${playerId}&season_id=`;

  try {
    const profile: IFAPlayerProfile = await fetchIFAProfileViaProxy(ifaUrl);
    return NextResponse.json({
      fullName: profile.fullName || undefined,
      fullNameHe: profile.fullNameHe || undefined,
      currentClub: profile.currentClub || undefined,
      dateOfBirth: profile.dateOfBirth || undefined,
      nationality: profile.nationality || undefined,
      profileImage: profile.profileImage || undefined,
      ifaPlayerId: playerId,
    });
  } catch {
    // Proxy failed — return empty so client keeps snippet data
    return NextResponse.json({ ifaPlayerId: playerId });
  }
}
