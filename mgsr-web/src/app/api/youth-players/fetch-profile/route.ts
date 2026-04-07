/**
 * Fetch and parse an IFA (football.org.il) player profile by URL.
 * Accepts POST with { url: "https://www.football.org.il/players/player/?player_id=..." }
 *
 * Strategy (in order):
 *   1. Firebase Cloud Function `ifaFetchProfile` (cheerio + proxy fallbacks, runs on Google Cloud)
 *   2. Direct fetch from Vercel (may 403 on datacenter IPs)
 *   3. AllOrigins proxy fallback
 *   4. Serper.dev image search (returns only photo)
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
export const maxDuration = 60;

/** Call the Firebase callable `ifaFetchProfile` via its REST endpoint. */
async function callIfaCloudFunction(url: string): Promise<IFAPlayerProfile | null> {
  // Firebase callable v2 REST URL:
  // https://us-central1-<project>.cloudfunctions.net/ifaFetchProfile
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'mgsr-64e4b';
  const cfUrl = `https://us-central1-${projectId}.cloudfunctions.net/ifaFetchProfile`;
  try {
    const res = await fetch(cfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { url } }),
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) {
      console.warn(`[youth-fetch-profile] Cloud Function HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { result?: IFAPlayerProfile };
    return json.result ?? null;
  } catch (err) {
    console.warn('[youth-fetch-profile] Cloud Function failed:', err);
    return null;
  }
}

/** Use Serper.dev image search as a last resort to find IFA player photo + basic data */
async function serperImageFallback(playerName: string, playerId: string): Promise<{ profileImage?: string } | null> {
  const serperKey = process.env.SERPER_API_KEY?.trim();
  if (!serperKey) return null;
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `site:football.org.il player_id=${playerId}`, gl: 'il', hl: 'he', num: 5 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { images?: Array<{ imageUrl?: string; link?: string }> };
    const match = data.images?.find((img) => img.link?.includes(`player_id=${playerId}`));
    if (match?.imageUrl) return { profileImage: match.imageUrl };
    const ifaImg = data.images?.find((img) => img.imageUrl?.includes('football.org.il'));
    if (ifaImg?.imageUrl) return { profileImage: ifaImg.imageUrl };
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let requestUrl = '';
  try {
    const body = (await request.json()) as { url?: string };
    const url = (body?.url || '').trim();
    requestUrl = url;

    if (!url || !isValidIfaUrl(url)) {
      return NextResponse.json(
        { error: 'Invalid IFA profile URL. Expected: https://www.football.org.il/players/player/?player_id=...' },
        { status: 400 }
      );
    }

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

    // ── Strategy 1: Firebase Cloud Function (Google Cloud IPs + proxy fallbacks) ──
    const cfResult = await callIfaCloudFunction(normalizedUrl);
    if (cfResult && (cfResult.fullName || cfResult.fullNameHe)) {
      return toResponse(cfResult);
    }

    // ── Strategy 2: Direct fetch from Vercel ──
    try {
      const profile = await fetchIFAProfile(normalizedUrl);
      return toResponse(profile);
    } catch (directErr) {
      const msg = directErr instanceof Error ? directErr.message : '';
      if (!msg.includes('403')) throw directErr;
    }

    // ── Strategy 3: AllOrigins proxy ──
    try {
      const profile = await fetchIFAProfileViaProxy(normalizedUrl);
      return toResponse(profile);
    } catch (proxyErr) {
      console.warn('[youth-fetch-profile] Proxy fallback failed:', proxyErr);
    }

    // ── Strategy 4: Serper.dev image search (photo only) ──
    const pidMatch = normalizedUrl.match(/player_id=(\d+)/);
    if (pidMatch) {
      const imgResult = await serperImageFallback('', pidMatch[1]);
      if (imgResult?.profileImage) {
        return NextResponse.json({ ifaUrl: normalizedUrl, ifaPlayerId: pidMatch[1], profileImage: imgResult.profileImage });
      }
    }

    return NextResponse.json(
      { error: 'Could not load profile from football.org.il. Enter details manually or try again later.' },
      { status: 500 }
    );
  } catch (err) {
    console.error('[youth-fetch-profile]', err);
    const msg = err instanceof Error ? err.message : 'Failed to fetch profile';
    const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout');
    const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND');

    const pidMatch = requestUrl.match(/player_id=(\d+)/);
    if (pidMatch) {
      const imgResult = await serperImageFallback('', pidMatch[1]);
      if (imgResult?.profileImage) {
        return NextResponse.json({ ifaUrl: requestUrl, ifaPlayerId: pidMatch[1], profileImage: imgResult.profileImage });
      }
    }

    const userMsg = isTimeout
      ? 'Request timed out. IFA site may be slow — try again.'
      : isNetwork
        ? 'Could not reach football.org.il. Check your connection and try again.'
        : msg;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
