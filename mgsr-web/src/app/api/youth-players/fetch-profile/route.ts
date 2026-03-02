/**
 * Fetch and parse an IFA (football.org.il) player profile by URL.
 * Accepts POST with { url: "https://www.football.org.il/players/player/?player_id=..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchIFAProfile, isValidIfaUrl, normalizeIfaUrl, type IFAPlayerProfile } from '@/lib/ifa';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = (body?.url || '').trim();

    if (!url || !isValidIfaUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid IFA profile URL. Expected: https://www.football.org.il/players/player/?player_id=...' },
        { status: 400 }
      );
    }

    // Normalize to Hebrew URL for reliable scraping (strip /en/ prefix)
    const normalizedUrl = normalizeIfaUrl(url);

    const profile: IFAPlayerProfile = await fetchIFAProfile(normalizedUrl);

    return NextResponse.json({
      fullName: profile.fullName,
      fullNameHe: profile.fullNameHe,
      dateOfBirth: profile.dateOfBirth,
      age: profile.age,
      nationality: profile.nationality,
      currentClub: profile.currentClub,
      academy: profile.academy,
      positions: profile.positions,
      ifaUrl: profile.ifaUrl,
      ifaPlayerId: profile.ifaPlayerId,
      profileImage: profile.profileImage,
      foot: profile.foot,
      height: profile.height,
      stats: profile.stats,
    });
  } catch (err) {
    console.error('[youth-fetch-profile]', err);
    const msg = err instanceof Error ? err.message : 'Failed to fetch profile';
    const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout');
    const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND');
    const is403 = msg.includes('403') || msg.includes('Forbidden');
    const userMsg = is403
      ? 'football.org.il blocked our server. Basic info from search was used — you can edit details manually.'
      : isTimeout
        ? 'Request timed out. IFA site may be slow — try again.'
        : isNetwork
          ? 'Could not reach football.org.il. Check your connection and try again.'
          : msg;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
