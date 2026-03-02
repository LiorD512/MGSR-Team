/**
 * Fetch and parse an IFA (football.org.il) player profile by URL.
 * Accepts POST with { url: "https://www.football.org.il/players/player/?player_id=..." }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchIFAProfile,
  fetchIFAProfileViaProxy,
  isValidIfaUrl,
  normalizeIfaUrl,
  type IFAPlayerProfile,
} from '@/lib/ifa';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Scout cold start + retry can take ~2 min

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

    // Scout server (Playwright) bypasses 403 — use same default as other scout routes
    const scoutBase = (process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com').trim();
    const base = scoutBase.replace(/\/$/, '');
    const scoutFetch = () =>
      fetch(`${base}/ifa/fetch-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: AbortSignal.timeout(90000), // 90s — Render cold start can take 60–90s
      });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await scoutFetch();
        if (res.ok) {
          const data = (await res.json()) as IFAPlayerProfile;
          return toResponse(data);
        }
        if (res.status !== 502 && res.status !== 503) break;
      } catch (scoutErr) {
        if (attempt === 0) console.warn('[youth-fetch-profile] Scout attempt 1 failed, retrying:', scoutErr);
        else console.warn('[youth-fetch-profile] Scout server failed:', scoutErr);
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }

    // Direct fetch (or fallback when scout fails)
    let profile: IFAPlayerProfile;
    try {
      profile = await fetchIFAProfile(normalizedUrl);
    } catch (directErr) {
      const msg = directErr instanceof Error ? directErr.message : '';
      if (msg.includes('403')) {
        // Try AllOrigins proxy — free, no config
        try {
          profile = await fetchIFAProfileViaProxy(normalizedUrl);
          return toResponse(profile);
        } catch (proxyErr) {
          console.warn('[youth-fetch-profile] Proxy fallback failed:', proxyErr);
        }
        return NextResponse.json(
          { error: 'Could not load profile from football.org.il. Enter details manually or try again later.' },
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
      ? 'Could not load profile from football.org.il. Enter details manually or try again later.'
      : isTimeout
        ? 'Request timed out. IFA site may be slow — try again.'
        : isNetwork
          ? 'Could not reach football.org.il. Check your connection and try again.'
          : msg;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
