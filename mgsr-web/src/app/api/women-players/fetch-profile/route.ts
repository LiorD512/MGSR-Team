/**
 * Fetch and parse a SoccerDonna player profile by URL.
 * Use when search doesn't return a player (e.g. Alexa Goldberg).
 */

import { NextRequest, NextResponse } from 'next/server';

const SD_PROFILE_RE = /^https?:\/\/(www\.)?soccerdonna\.de\/en\/[^/]+\/profil\/spieler_\d+\.html$/i;

function parseProfile(html: string, url: string): Record<string, string> {
  const out: Record<string, string> = { soccerDonnaUrl: url };

  const m = url.match(/\/en\/([^/]+)\/profil\/spieler_(\d+)\.html/i);
  if (m) {
    out.fullName = m[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const h1 = html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
  if (h1) out.fullName = h1[1].trim();

  const clubMatch = html.match(/<a href="[^"]*verein[^"]*"[^>]*title="([^"]+)"[^>]*>([^<]+)<\/a>/i)
    || html.match(/<td[^>]*><a href="[^"]*verein[^"]*"[^>]*>([^<]+)<\/a><\/td>/i)
    || html.match(/alt="([^"]+)"[^>]*\/>[\s\S]*?<a href="[^"]*verein[^"]*"[^>]*>([^<]+)<\/a>/i);
  if (clubMatch) {
    const raw = (clubMatch[2] || clubMatch[1] || '').trim();
    out.currentClub = raw.toLowerCase() === 'vereinslos' ? 'Without Club' : raw;
  }

  const ageMatch = html.match(/<td[^>]*>Age:<\/td>\s*<td[^>]*>(\d+)<\/td>/i);
  if (ageMatch) out.age = ageMatch[1];

  const natTitle = html.match(/Nationality:<\/td>\s*<td[^>]*>[\s\S]*?title="([^"]+)"[^>]*>/i);
  if (natTitle) out.nationality = natTitle[1].trim();
  else {
    const natBlock = html.match(/Nationality:<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (natBlock) out.nationality = natBlock[1].replace(/<[^>]+>/g, '').trim();
  }

  const posMatch = html.match(/<td[^>]*>Position:<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  if (posMatch) out.position = posMatch[1].trim();

  const mvMatch = html.match(/<td[^>]*>Market value:<\/td>\s*<td[^>]*>([^<]+)<\/td>/i);
  if (mvMatch && mvMatch[1].trim().toLowerCase() !== 'unknown') out.marketValue = mvMatch[1].trim();

  const imgMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]*spielerfotos\/[^"]+\.(?:jpg|png|webp))"[^>]*alt="[^"]*"[^>]*>/i)
    || html.match(/src="(\/static\/bilder_sd\/spielerfotos\/[^"]+\.(?:jpg|png|webp))"/i);
  if (imgMatch) {
    out.profileImage = imgMatch[1].startsWith('http') ? imgMatch[1] : `https://www.soccerdonna.de${imgMatch[1]}`;
    if (out.profileImage?.includes('somebody.jpg')) delete out.profileImage;
  }

  return out;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    let url = (body?.url || '').trim();
    url = url.split('?')[0].split('#')[0];
    if (!url || !SD_PROFILE_RE.test(url)) {
      return NextResponse.json({ error: 'Invalid SoccerDonna profile URL' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 502 });

    const html = await res.text();
    const data = parseProfile(html, url);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[fetch-profile]', err);
    const msg = err instanceof Error ? err.message : 'Failed to fetch profile';
    const isTimeout = msg.includes('abort') || msg.includes('timeout') || msg.includes('Timeout');
    const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND');
    const userMsg = isTimeout
      ? 'Request timed out. SoccerDonna may be slow. Try again.'
      : isNetwork
        ? 'Could not reach SoccerDonna. Check your connection and try again.'
        : msg;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
