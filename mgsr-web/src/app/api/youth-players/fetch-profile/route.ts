/**
 * Fetch and parse an IFA (football.org.il) player profile by URL.
 * Accepts POST with { url: "https://www.football.org.il/players/player/?player_id=..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchIFAProfile, isValidIfaUrl, normalizeIfaUrl, type IFAPlayerProfile } from '@/lib/ifa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Scout server cold start can take 60–90s

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

    const toResponse = (data: IFAPlayerProfile) =>
      NextResponse.json({
        fullName: data.fullName,
        fullNameHe: data.fullNameHe,
        dateOfBirth: data.dateOfBirth,
        age: data.age,
        nationality: data.nationality,
        currentClub: data.currentClub,
        academy: data.academy,
        positions: data.positions,
        ifaUrl: data.ifaUrl,
        ifaPlayerId: data.ifaPlayerId,
        profileImage: data.profileImage,
        foot: data.foot,
        height: data.height,
        stats: data.stats,
      });

    // Prefer scout server when configured — Playwright bypasses 403, more reliable
    const scoutBase = (process.env.SCOUT_SERVER_URL || '').trim();
    if (scoutBase) {
      try {
        const base = scoutBase.replace(/\/$/, '');
        const res = await fetch(`${base}/ifa/fetch-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: normalizedUrl }),
          signal: AbortSignal.timeout(60000), // 60s — Render cold start can take 60–90s
        });
        if (res.ok) {
          const data = (await res.json()) as IFAPlayerProfile;
          return toResponse(data);
        }
      } catch (scoutErr) {
        console.warn('[youth-fetch-profile] Scout server failed, trying direct:', scoutErr);
      }
    }

    // Direct fetch (or fallback when scout fails)
    let profile: IFAPlayerProfile;
    try {
      profile = await fetchIFAProfile(normalizedUrl);
    } catch (directErr) {
      const msg = directErr instanceof Error ? directErr.message : '';
      if (msg.includes('403')) {
        return NextResponse.json(
          { error: 'football.org.il blocked our server. Basic info from search was used — you can edit details manually.' },
          { status: 500 }
        );
      }
      throw directErr;
    }

    return toResponse(profile);
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
