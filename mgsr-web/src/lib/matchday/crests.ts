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

    // Crests are roughly square. A strongly non-square image is almost never a
    // crest — it's a photo (e.g. a Wikipedia town article's church picture that
    // a loose search can match). Reject it so a wrong photo can't win on size.
    const ratio = Math.max(width, height) / Math.min(width, height);
    if (ratio > 1.6) return null;

    const bytes = await pipeline.png().toBuffer();
    return { bytes, width, height, source, url };
  } catch {
    return null;
  }
}

/**
 * Find a club's Transfermarkt crest by NAME (not by a URL we already hold).
 * This is how we get a proper crest for the opponent, whose Transfermarkt id we
 * never learn from the fixture feed. TM's quick-search returns the club's crest
 * image, whose numeric id we lift and rebuild at `original`/`big` resolution.
 * TM search is club-specific, so it is far less error-prone than a fuzzy
 * Wikipedia name search (which returned Viktoria Plzeň for "FC Ballkani").
 */
async function transfermarktSearchCrestUrls(clubName: string): Promise<string[]> {
  try {
    const url = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(clubName)}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, 'accept-language': 'en' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // The first club crest in the results carries the club id we need.
    const id = html.match(/\/wappen\/(?:head|normal|verysmall|small|medium|big)\/(\d+)\.png/)?.[1];
    if (!id) return [];
    return [
      `https://img.a.transfermarkt.technology/wappen/original/${id}.png`,
      `https://img.a.transfermarkt.technology/wappen/big/${id}.png`,
    ];
  } catch {
    return [];
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
    )}&gsrlimit=3&prop=info&format=json&redirects=1`;
    const found = await fetch(search, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!found.ok) return null;
    const payload = (await found.json()) as { query?: { pages?: Record<string, { title?: string }> } };
    const titles = Object.values(payload?.query?.pages ?? {})
      .map((p) => p?.title)
      .filter((t): t is string => Boolean(t));

    // Wikipedia ranks by relevance, NOT "is this the exact club" — searching
    // "FC Ballkani" returns "FC Viktoria Plzeň" first. So don't take the first
    // club-like title; pick the one that best MATCHES the requested club name.
    const isClubTitle = (t: string) => {
      if (/^list of/i.test(t) || /\bfootball in\b/i.test(t) || /\bseason\b/i.test(t)) return false;
      if (/,\s/.test(t)) return false; // place pages like "Acre, Israel"
      return /(\bF\.?C\.?\b|\bF\.?K\.?\b|\bC\.?F\.?\b|\bS\.?C\.?\b|\bA\.?C\.?\b|\bK\.?F\.?\b|football|soccer|\bunited\b|\bathletic\b|\bsporting\b)/i.test(
        t
      );
    };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const GENERIC = new Set(['fc', 'fk', 'cf', 'sc', 'ac', 'kf', 'football', 'club', 'the', 'united', 'city', 'sporting', 'athletic']);
    const keyTokens = norm(clubName).split(' ').filter((w) => w.length > 2 && !GENERIC.has(w));
    const scored = titles
      .filter(isClubTitle)
      .map((t) => ({ t, matched: keyTokens.filter((k) => norm(t).includes(k)).length }))
      .sort((a, b) => b.matched - a.matched);
    // Require a distinctive token to match; otherwise return nothing (and fall
    // back to the supplied crest) rather than hand back a different club.
    const title = scored.find((s) => s.matched > 0)?.t ?? (keyTokens.length === 0 ? scored[0]?.t : undefined);
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
    const resolved = absolute.replace(/&amp;/g, '&');

    // Final safety net: a crest's file is a logo/badge, not a photograph. Reject
    // obvious photo filenames (jpg photos, or names signalling a building/place
    // like a church, stadium, town hall) so a town article's lead image can
    // never masquerade as a crest.
    const fileName = decodeURIComponent(resolved.split('/').pop() ?? '').toLowerCase();
    const looksLikePhoto =
      /\.jpe?g($|\?)/.test(fileName) ||
      /(church|cathedral|trej|bažny|stadium|arena|town|hall|panorama|aerial|street|square|building|view)/.test(fileName);
    const looksLikeCrest = /(logo|crest|badge|emblem|wappen|fc|fk|\.svg)/.test(fileName);
    if (looksLikePhoto && !looksLikeCrest) return null;

    return resolved;
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
  // Cache key is VERSIONED: bumping `v2` invalidates every crest cached under
  // the old (buggy) resolution that could store a town photo (e.g. a church)
  // instead of a crest. Old entries are simply never read again.
  const cacheKey = `matchday-crest-v2-${sanitizeKey(clubName.toLowerCase())}`;
  const cachedUrl = await getCached<{ url: string; source: string }>(cacheKey, CACHE_TTL_MS);
  if (cachedUrl?.url) {
    const hit = await fetchImage(cachedUrl.url, cachedUrl.source);
    if (hit && Math.min(hit.width, hit.height) >= DECENT_MIN) return hit;
  }

  const attempts: Array<{ url: string; source: string }> = [];

  // 1) Transfermarkt variants of the URL we already hold (our own club — the
  //    stored clubLogo carries the TM id, so this is the biggest, cheapest win).
  if (logoUrl) {
    for (const url of transfermarktVariants(logoUrl)) {
      attempts.push({ url, source: 'transfermarkt-id' });
    }
  }

  // 2) Transfermarkt SEARCH BY NAME — the primary route for the opponent, whose
  //    TM id we never get from the fixture feed. Club-specific, so far more
  //    reliable than a fuzzy Wikipedia name search.
  for (const url of await transfermarktSearchCrestUrls(clubName)) {
    attempts.push({ url, source: 'transfermarkt-search' });
  }

  let best: ResolvedCrest | null = null;
  for (const attempt of attempts) {
    const hit = await fetchImage(attempt.url, attempt.source);
    if (!hit) continue;
    if (!best || Math.min(hit.width, hit.height) > Math.min(best.width, best.height)) best = hit;
    if (Math.min(hit.width, hit.height) >= DECENT_MIN) break;
  }

  // 3) Wikipedia infobox crest — last resort when Transfermarkt has nothing
  //    usable (name-scored so it can't hand back a different club).
  if (!best || Math.min(best.width, best.height) < DECENT_MIN) {
    const wikiUrl = await wikipediaCrestUrl(clubName);
    if (wikiUrl) {
      const hit = await fetchImage(wikiUrl, 'wikipedia');
      if (hit && (!best || Math.min(hit.width, hit.height) > Math.min(best.width, best.height))) {
        best = hit;
      }
    }
  }

  // 4) Fall back to the URL we were handed, however small.
  if (!best && logoUrl) best = await fetchImage(logoUrl, 'as-supplied');

  if (best) void setCache(cacheKey, { url: best.url, source: best.source });
  return best;
}
