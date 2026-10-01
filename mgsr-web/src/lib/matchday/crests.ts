/**
 * Club crest resolution for MATCHDAY.
 *
 * The crests we hold are far too small to draw at poster scale: Transfermarkt's
 * stored `head` variant is 139×181, and the opponent crest that comes back on
 * the Flashscore fixture feed is **30×30**. Drawing those into a 132px slot
 * upscaled them ~3.7×, which is the pixelation.
 *
 * So rather than enlarging what we have, this module goes and finds a bigger
 * original:
 *   1. Transfermarkt `original` variant — a path substitution on the stored
 *      URL, typically ~600px (one line, biggest win). Falls back to `big`
 *      (180×180, universally present) when `original` is missing or small.
 *   2. The club's Wikipedia infobox crest, which is usually SVG-backed and
 *      served up to 500px. This is the only option for the opponent, whose
 *      Transfermarkt id we never learn.
 *   3. Whatever URL we were given, used as-is.
 *
 * Resolution is cached by club because crests effectively never change, and
 * because Wikipedia rate-limits aggressively.
 */

import sharp from 'sharp';
import { getCached, setCache, sanitizeKey } from '@/lib/scrapingCache';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 20_000;
/** Below this we keep looking; a crest this small cannot be drawn at poster scale. */
const DECENT_MIN = 180;

const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
  accept: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,*/*',
};

export interface ResolvedCrest {
  /** PNG bytes, at the source's own resolution — never upscaled. */
  bytes: Buffer;
  width: number;
  height: number;
  /** Where it came from, for the quality checks. */
  source: string;
  url: string;
}

async function fetchImage(url: string, source: string): Promise<ResolvedCrest | null> {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) return null;
    const raw = Buffer.from(await response.arrayBuffer());
    if (raw.byteLength < 256) return null;

    // SVG sources are rasterised at high density so they are sharp at any draw
    // size; librsvg otherwise renders them at 72dpi.
    const isSvg = raw.slice(0, 512).toString('utf8').includes('<svg');
    const pipeline = isSvg ? sharp(raw, { density: 600 }) : sharp(raw);

    const meta = await pipeline.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return null;

    const bytes = await pipeline.png().toBuffer();
    return { bytes, width, height, source, url };
  } catch {
    return null;
  }
}

/** Transfermarkt serves the same crest at many sizes via the path segment. */
function transfermarktVariants(url: string): string[] {
  const id = url.match(/\/wappen\/[^/]+\/(\d+)\.png/)?.[1];
  if (!id) return [];
  // `original` 404s on the akamaized host, so always ask the primary one.
  return [
    `https://img.a.transfermarkt.technology/wappen/original/${id}.png`,
    `https://img.a.transfermarkt.technology/wappen/big/${id}.png`,
  ];
}

/**
 * The club's crest from its Wikipedia infobox. Club crests are non-free, so the
 * thumbnail API omits them and large thumbs are refused — but the infobox
 * `srcset` carries a 2× (500px) variant, which is plenty for poster scale.
 */
async function wikipediaCrestUrl(clubName: string): Promise<string | null> {
  try {
    const search = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      `${clubName} football club`
    )}&gsrlimit=1&prop=info&format=json&redirects=1`;
    const found = await fetch(search, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!found.ok) return null;
    const payload = (await found.json()) as { query?: { pages?: Record<string, { title?: string }> } };
    const title = Object.values(payload?.query?.pages ?? {})[0]?.title;
    if (!title) return null;

    const page = await fetch(`https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!page.ok) return null;
    const html = await page.text();

    const infobox = html.match(/<table[^>]*class="[^"]*infobox[^"]*"[\s\S]*?<\/table>/i)?.[0];
    if (!infobox) return null;
    const img = infobox.match(/<img[^>]*>/i)?.[0];
    if (!img) return null;

    // Prefer the largest srcset candidate, else the plain src bumped to 500px.
    const srcset = img.match(/srcset="([^"]+)"/i)?.[1];
    const candidates = srcset
      ? srcset
          .split(',')
          .map((part) => part.trim().split(/\s+/)[0])
          .filter(Boolean)
      : [];
    const src = img.match(/\ssrc="([^"]+)"/i)?.[1];
    const best = candidates[candidates.length - 1] ?? src?.replace(/\/\d+px-/, '/500px-');
    if (!best) return null;

    const absolute = best.startsWith('//') ? `https:${best}` : best;
    return absolute.replace(/&amp;/g, '&');
  } catch {
    return null;
  }
}

/**
 * Best available crest for a club. `logoUrl` is whatever the fixture source or
 * the DB gave us — it is the last resort, not the first choice.
 */
export async function resolveCrest(
  clubName: string,
  logoUrl: string | null | undefined
): Promise<ResolvedCrest | null> {
  const cacheKey = `matchday-crest-${sanitizeKey(clubName.toLowerCase())}`;
  const cachedUrl = await getCached<{ url: string; source: string }>(cacheKey, CACHE_TTL_MS);
  if (cachedUrl?.url) {
    const hit = await fetchImage(cachedUrl.url, cachedUrl.source);
    if (hit && Math.min(hit.width, hit.height) >= DECENT_MIN) return hit;
  }

  const attempts: Array<{ url: string; source: string }> = [];
  if (logoUrl) {
    for (const url of transfermarktVariants(logoUrl)) {
      attempts.push({ url, source: 'transfermarkt-original' });
    }
  }

  let best: ResolvedCrest | null = null;
  for (const attempt of attempts) {
    const hit = await fetchImage(attempt.url, attempt.source);
    if (!hit) continue;
    if (!best || Math.min(hit.width, hit.height) > Math.min(best.width, best.height)) best = hit;
    if (Math.min(hit.width, hit.height) >= DECENT_MIN) break;
  }

  // Wikipedia is the only route to a usable opponent crest, since the fixture
  // feed only ever gives us a 30×30 badge.
  if (!best || Math.min(best.width, best.height) < DECENT_MIN) {
    const wikiUrl = await wikipediaCrestUrl(clubName);
    if (wikiUrl) {
      const hit = await fetchImage(wikiUrl, 'wikipedia');
      if (hit && (!best || Math.min(hit.width, hit.height) > Math.min(best.width, best.height))) {
        best = hit;
      }
    }
  }

  // Fall back to the URL we were handed, however small.
  if (!best && logoUrl) best = await fetchImage(logoUrl, 'as-supplied');

  if (best) void setCache(cacheKey, { url: best.url, source: best.source });
  return best;
}
