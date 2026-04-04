/**
 * GET /api/fminside/player
 * Fetches FMInside data for a men's player directly from FMInside.
 * Searches with gender=1 (men), matches by name, position, nationality, age.
 *
 * Returns the same JSON shape as the scout server's /fm_intelligence endpoint
 * so Android and web clients can use this as a drop-in replacement.
 *
 * Query params:
 *   - player_name (required) — or "name" for compat with women endpoint
 *   - club, age, position/positions, nationality (optional disambiguation)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FMINSIDE_BASE = 'https://fminside.net';
const FM_CACHE_COLLECTION = 'FmIntelligenceCache';
const FM_CACHE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/* ─── Helpers ────────────────────────────────────────────────────── */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function nameMatchScore(searchName: string, resultName: string): number {
  const s = normalize(searchName);
  const r = normalize(resultName);
  if (s === r) return 100;
  const sWords = s.split(/\s+/).filter(Boolean);
  const rWords = r.split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const w of sWords) {
    if (rWords.some((rw) => rw.includes(w) || w.includes(rw))) matches++;
  }
  return sWords.length > 0 ? (matches / sWords.length) * 100 : 0;
}

function positionOverlap(ourPositions: string[], theirPositions: string[]): number {
  if (!ourPositions.length || !theirPositions.length) return 50;
  const ours = ourPositions.map((p) => p.toUpperCase().slice(0, 2));
  const theirsSet = new Set(theirPositions.map((p) => p.toUpperCase().slice(0, 2)));
  let overlap = 0;
  for (let i = 0; i < ours.length; i++) {
    if (theirsSet.has(ours[i])) overlap++;
  }
  return (overlap / ours.length) * 100;
}

function ageMatchScore(ourAge: string, theirAge: string): number {
  const a = parseInt(ourAge, 10);
  const b = parseInt(theirAge, 10);
  if (isNaN(a) || isNaN(b)) return 50;
  const diff = Math.abs(a - b);
  if (diff === 0) return 100;
  if (diff <= 1) return 80;
  if (diff <= 2) return 60;
  if (diff <= 3) return 40;
  return 20;
}

interface SearchHit {
  url: string;
  name: string;
  positions: string[];
  club: string;
  age: string;
  score: number;
}

/* ─── FMInside AJAX search (men, gender=-1 Both) ─────────────────── */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function searchFmInsideMen(
  name: string,
  positions: string[],
  nationality: string,
  age: string,
  club: string
): Promise<SearchHit | null> {
  const searchName = name.trim().split(/\s+/).slice(0, 3).join(' ');
  if (!searchName || searchName.length < 2) return null;

  // Step 1: Get session cookie
  const initRes = await fetch(`${FMINSIDE_BASE}/players`, {
    headers: BASE_HEADERS,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
  });
  if (!initRes.ok) return null;

  // Cookie handling: parse Set-Cookie into a single header.
  // Must use getSetCookie() when available (Node 20+/Vercel) to handle
  // multiple Set-Cookie headers that get merged into one by .get().
  function parseCookies(res: Response): string {
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const raw = typeof h.getSetCookie === 'function'
      ? h.getSetCookie()
      : [res.headers.get('set-cookie') || ''];
    const pairs: string[] = [];
    for (const s of raw) {
      if (!s) continue;
      for (const part of s.split(/,\s*(?=[A-Za-z_\-]+=)/)) {
        const nv = part.split(';')[0].trim();
        if (nv && nv.includes('=')) pairs.push(nv);
      }
    }
    return pairs.join('; ');
  }
  function merge(...parts: string[]): string {
    const map = new Map<string, string>();
    for (const part of parts) {
      for (const pair of part.split(';').map((s) => s.trim()).filter(Boolean)) {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          const key = pair.slice(0, eq).toLowerCase();
          if (!['path', 'domain', 'expires', 'max-age', 'secure', 'httponly', 'samesite'].includes(key)) {
            map.set(pair.slice(0, eq), pair.slice(eq + 1));
          }
        }
      }
    }
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  const initCookies = parseCookies(initRes);

  // Step 2: POST search filter — use gender=-1 (Both) which is the FMInside default.
  // This ensures men's players are included regardless of server-side filter state.
  const filterBody = new URLSearchParams({
    page: 'players',
    database_version: '7',
    gender: '-1',
    name: searchName,
  });
  const updateRes = await fetch(`${FMINSIDE_BASE}/resources/inc/ajax/update_filter.php`, {
    method: 'POST',
    headers: {
      ...BASE_HEADERS,
      Cookie: initCookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${FMINSIDE_BASE}/players`,
    },
    body: filterBody.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  const updateCookies = parseCookies(updateRes);
  const finalCookie = merge(initCookies, updateCookies);

  // Step 3: GET filtered results
  const tableRes = await fetch(
    `${FMINSIDE_BASE}/beheer/modules/players/resources/inc/frontend/generate-player-table.php?ajax_request=1`,
    {
      headers: { ...BASE_HEADERS, Cookie: finalCookie || initCookies },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!tableRes.ok) return null;
  const html = await tableRes.text();

  // Parse player links
  const linkRe = /href="(\/players\/7-fm-26\/(\d+)-([^"]+))"/g;
  const slugToName = (slug: string) =>
    slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  const hits: SearchHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1];
    const slug = m[3];
    const fullUrl = `${FMINSIDE_BASE}${path}`;
    const displayName = slugToName(slug);

    const nameScore = nameMatchScore(name, displayName);
    if (nameScore < 50) continue;

    const rowStart = html.indexOf(path);
    const rowHtml = rowStart >= 0 ? html.slice(Math.max(0, rowStart - 500), rowStart + 500) : '';
    const posMatch = rowHtml.match(/(?:MC|ST|GK|CB|LB|RB|DM|CM|AM|LW|RW|CF|SS|AML|AMR|ML|MR|DL|DR)(?:\s*,\s*(?:MC|ST|GK|CB|LB|RB|DM|CM|AM|LW|RW|CF|SS|AML|AMR|ML|MR|DL|DR))*/gi);
    const rowPositions = posMatch
      ? Array.from(new Set((posMatch[0] || '').split(',').map((p) => p.trim().toUpperCase().slice(0, 2)).filter(Boolean)))
      : [];
    const ageMatch2 = rowHtml.match(/>\s*(\d{1,2})\s*</);
    const rowAge = ageMatch2 ? ageMatch2[1] : '';
    const clubMatch2 = rowHtml.match(/\[([^\]]+)\]/);
    const rowClub = clubMatch2 ? clubMatch2[1] : '';

    const posScore = positionOverlap(positions, rowPositions);
    const ageScore = age ? ageMatchScore(age, rowAge) : 50;
    const totalScore = nameScore * 0.5 + posScore * 0.25 + ageScore * 0.25;

    hits.push({ url: fullUrl, name: displayName, positions: rowPositions, club: rowClub, age: rowAge, score: totalScore });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits[0] ?? null;
}

/* ─── Search fallbacks ───────────────────────────────────────────── */

/**
 * Fast AJAX search — most reliable method.
 * Calls search.php directly (no session/cookies needed).
 */
async function searchViaAjax(
  name: string,
  age: string,
): Promise<SearchHit | null> {
  const searchName = name.trim().split(/\s+/).slice(0, 3).join(' ');
  if (!searchName || searchName.length < 2) return null;
  try {
    const body = new URLSearchParams({ search_phrase: searchName, database_id: '7' });
    const res = await fetch(`${FMINSIDE_BASE}/resources/inc/ajax/search.php`, {
      method: 'POST',
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Parse: <a title="Name" href="/players/7-fm-26/ID-slug">
    const linkRe = /<a\s+title="([^"]+)"\s+href="(\/players\/7-fm-26\/\d+-[^"]+)"/gi;
    const hits: SearchHit[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const displayName = m[1].trim();
      const path = m[2];
      const nScore = nameMatchScore(name, displayName);
      if (nScore < 50) continue;
      // Extract age from <li class="age">24</li> near this match
      const block = html.slice(Math.max(0, m.index - 200), m.index + 500);
      const ageM = block.match(/<li class="age">(\d+)<\/li>/i);
      const rowAge = ageM ? ageM[1] : '';
      let ageBonus = 0;
      if (age && rowAge) {
        const diff = Math.abs(parseInt(age, 10) - parseInt(rowAge, 10));
        if (diff === 0) ageBonus = 20;
        else if (diff <= 1) ageBonus = 10;
        else if (diff > 3) ageBonus = -20;
      }
      hits.push({
        url: `${FMINSIDE_BASE}${path}`,
        name: displayName,
        positions: [],
        club: '',
        age: rowAge,
        score: nScore + ageBonus,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits[0] ?? null;
  } catch {
    return null;
  }
}

async function searchViaDuckDuckGo(name: string): Promise<SearchHit | null> {
  const query = encodeURIComponent(`site:fminside.net/players/7-fm-26 ${name}`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const linkRe = /\[(fminside\.net\/players\/7-fm-26\/(\d+)-([^\]]+))\]/gi;
    const hits: { url: string; id: string; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const id = m[2];
      const slug = m[3];
      const displayName = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      if (!hits.some((h) => h.id === id)) {
        hits.push({ url: `https://fminside.net/players/7-fm-26/${id}-${slug}`, id, name: displayName });
      }
    }

    let best: SearchHit | null = null;
    let bestScore = 0;
    for (const h of hits) {
      const score = nameMatchScore(name, h.name);
      if (score >= 60 && score > bestScore) {
        bestScore = score;
        best = { url: h.url, name: h.name, positions: [], club: '', age: '', score };
      }
    }
    return best;
  } catch {
    return null;
  }
}

async function searchViaSerper(name: string): Promise<SearchHit | null> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `site:fminside.net/players/7-fm-26 ${name}`, num: 10 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { organic?: Array<{ link?: string }> };
    const linkRe = /fminside\.net\/players\/7-fm-26\/(\d+)-([a-z0-9-]+)/i;
    for (const item of data.organic ?? []) {
      const link = item.link ?? '';
      const m = link.match(linkRe);
      if (!m) continue;
      const slug = m[2];
      const fullUrl = `https://fminside.net/players/7-fm-26/${m[1]}-${slug}`;
      const displayName = slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      if (nameMatchScore(name, displayName) >= 60) {
        return { url: fullUrl, name: displayName, positions: [], club: '', age: '', score: 80 };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ─── Player detail scraping ─────────────────────────────────────── */

function verifyPlayerNameOnPage(html: string, expectedName: string): boolean {
  const n = normalize(expectedName);
  if (!n) return true;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const textNorm = normalize([titleMatch?.[1], h1Match?.[1]].filter(Boolean).join(' '));
  const words = n.split(/\s+/).filter(Boolean);
  const matchCount = words.filter((w) => textNorm.includes(w)).length;
  return matchCount >= Math.min(2, words.length) || (words.length === 1 && matchCount === 1);
}

async function fetchPlayerDetail(url: string, expectedName?: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  if (expectedName && !verifyPlayerNameOnPage(html, expectedName)) return null;

  // CA and PA from <div class="meta">
  // Normal: <span class="card superstar">92</span><span class="card superstar">98</span>
  // Dynamic PA: <span class="card excellent">83</span><span class="card superstar dynamic" data-title="Potential between 85 and 100 (-10)">
  const metaMatch = html.match(
    /class="meta"[^>]*>[\s\S]*?<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>/i
  );
  let ca = 0, pa = 0;
  if (metaMatch) {
    const rawCa = parseInt(metaMatch[1], 10);
    const rawPa = parseInt(metaMatch[2], 10);
    ca = rawCa >= 0 && rawCa <= 200 ? rawCa : 0;
    pa = rawPa >= 0 && rawPa <= 200 ? rawPa : 0;
  }
  // Handle dynamic PA (range): data-title="Potential between 85 and 100 (-10)"
  if (pa === 0) {
    const dynamicPaMatch = html.match(/class="meta"[^>]*>[\s\S]*?<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*<span[^>]*data-title="Potential between (\d+) and (\d+)/i);
    if (dynamicPaMatch) {
      if (ca === 0) ca = parseInt(dynamicPaMatch[1], 10) || 0;
      const paLow = parseInt(dynamicPaMatch[2], 10) || 0;
      const paHigh = parseInt(dynamicPaMatch[3], 10) || 0;
      pa = paHigh > 0 ? Math.round((paLow + paHigh) / 2) : paLow;
    }
  }
  if (ca === 0) {
    const ratingMatch =
      html.match(/<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*FM\s*26/i) ||
      html.match(/(\d{2,3})\s*FM\s*26/i);
    const raw = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;
    ca = raw >= 0 && raw <= 200 ? raw : 0;
  }

  // Attributes
  const attributes: { name: string; value: number }[] = [];
  const seen = new Set<string>();
  const htmlAttrRe = /<td\s+class="name"[^>]*>(?:<acronym[^>]*>)?([^<]+)<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d{1,3})<\/td>/gi;
  let am: RegExpExecArray | null;
  while ((am = htmlAttrRe.exec(html)) !== null) {
    const raw = (am[1] || '').trim();
    if (raw === '---' || raw.length < 2) continue;
    const attrName = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const val = parseInt(am[2], 10);
    if (attrName.length >= 2 && !seen.has(attrName) && !isNaN(val) && val >= 0 && val <= 100) {
      seen.add(attrName);
      attributes.push({ name: attrName, value: val });
    }
  }
  if (attributes.length === 0) {
    const mdAttrRe = /\|\s*([A-Za-z][A-Za-z\s]*?)\s*\|\s*(\d{1,2})\s*\|/g;
    while ((am = mdAttrRe.exec(html)) !== null) {
      const raw = (am[1] || '').trim();
      if (raw === '---' || raw.length < 2) continue;
      const attrName = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const val = parseInt(am[2], 10);
      if (attrName.length >= 2 && !seen.has(attrName) && !isNaN(val) && val >= 0 && val <= 100) {
        seen.add(attrName);
        attributes.push({ name: attrName, value: val });
      }
    }
  }

  // Position fit
  const positionFit: Record<string, number> = {};
  const roleToPos: Record<string, string> = {
    'Centre Forward': 'ST', 'Channel Forward': 'ST', 'Poacher': 'ST', 'Target Forward': 'ST',
    'False Nine': 'ST', 'Deep-Lying Forward': 'ST', 'Advanced Forward': 'ST',
    'Splitting Outlet Centre Forward': 'ST', 'Central Outlet Centre Forward': 'ST', 'Tracking Centre Forward': 'ST',
    'Attacking Midfielder': 'AM', 'Advanced Playmaker': 'AM', 'Shadow Striker': 'ST',
    'Central Midfielder': 'CM', 'Box to Box': 'CM', 'Defensive Midfielder': 'DM',
    'Winger': 'AM', 'Inside Forward': 'AM', 'Full Back': 'RB', 'Wing Back': 'RB',
    'Centre Back': 'CB', 'Sweeper': 'CB', 'Goalkeeper': 'GK',
  };
  const validPositions = new Set(['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'ST', 'LW', 'RW']);
  const roleKeyRe = /<span class="key">([^<]+)<\/span><span class="value">(\d+(?:\.\d)?)<\/span>/gi;
  const skipKeys = new Set(['value', 'age', 'name', 'wage', 'contract', 'likes', 'rating']);
  let rm: RegExpExecArray | null;
  while ((rm = roleKeyRe.exec(html)) !== null) {
    const roleName = (rm[1] || '').trim();
    if (skipKeys.has(roleName.toLowerCase())) continue;
    const fitVal = parseFloat(rm[2] || '0');
    const key = roleToPos[roleName] || (roleName.length >= 2 ? roleName.slice(0, 2).toUpperCase() : 'ST');
    if (!isNaN(fitVal) && fitVal > 0 && fitVal <= 100 && validPositions.has(key)) {
      if (!positionFit[key] || fitVal > positionFit[key]) positionFit[key] = Math.round(fitVal);
    }
  }
  const abbrevRe = /\(([A-Z]{2,3})\)\s*(\d{2}(?:\.\d)?)/g;
  const posMap: Record<string, string> = { AMC: 'AM', AMR: 'AM', AML: 'AM', MCR: 'CM', MCL: 'CM', DMC: 'DM', DC: 'CB', DL: 'LB', DR: 'RB', ST: 'ST', CF: 'ST' };
  while ((rm = abbrevRe.exec(html)) !== null) {
    const abbrev = rm[1].toUpperCase();
    const fitVal = parseFloat(rm[2]);
    const key = posMap[abbrev] || abbrev.slice(0, 2);
    if (!isNaN(fitVal) && fitVal > 0 && fitVal <= 100 && (!positionFit[key] || fitVal > positionFit[key])) {
      positionFit[key] = Math.round(fitVal);
    }
  }

  // Height
  const heightMatch = html.match(/<span class="key">Height<\/span><span class="value">(\d+)\s*CM<\/span>/i) ||
    html.match(/Height[^<]*<\/[^>]+>\s*<[^>]*>(\d+)\s*CM/i);
  const heightCm = heightMatch ? parseInt(heightMatch[1], 10) : 0;

  // Best position
  let bestPosition = '';
  const posAttrMatch = html.match(/position="([a-z]{2,3})"/i);
  if (posAttrMatch) bestPosition = posAttrMatch[1].toUpperCase().slice(0, 2);
  if (!bestPosition) {
    const posMatch2 = html.match(/Position\(s\)[^<]*<[^>]*>([A-Z]{2,3})/i);
    if (posMatch2) bestPosition = posMatch2[1].toUpperCase().slice(0, 2);
  }

  // Foot
  let footLeft = 50, footRight = 50;
  const leftFootMatch = html.match(/<span class="key">Left foot<\/span><span class="value"><span[^>]*>(\d{1,3})<\/span>/i);
  const rightFootMatch = html.match(/<span class="key">Right foot<\/span><span class="value"><span[^>]*>(\d{1,3})<\/span>/i);
  if (leftFootMatch) footLeft = Math.min(100, parseInt(leftFootMatch[1], 10) || 50);
  if (rightFootMatch) footRight = Math.min(100, parseInt(rightFootMatch[1], 10) || 50);

  const sortedAttrs = [...attributes].sort((a, b) => b.value - a.value);
  const topAttrs = sortedAttrs.slice(0, 5);
  const fallbackCa = topAttrs.length
    ? Math.round(topAttrs.reduce((s, a) => s + a.value, 0) / topAttrs.length) * 2
    : 0;

  return {
    ca: ca || fallbackCa,
    pa: pa || ca,
    attributes,
    positionFit: Object.keys(positionFit).length ? positionFit : (bestPosition ? { [bestPosition]: 80 } : {}),
    bestPosition: bestPosition || '—',
    heightCm,
    foot: { left: footLeft, right: footRight },
  };
}

/* ─── Tier classification ────────────────────────────────────────── */

function classifyTier(ca: number): string {
  if (ca <= 0) return 'unknown';
  if (ca >= 90) return 'world_class';
  if (ca >= 80) return 'elite';
  if (ca >= 70) return 'top_league';
  if (ca >= 60) return 'solid_pro';
  if (ca >= 50) return 'lower_league';
  return 'prospect';
}

/* ─── GET handler ────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    // Accept both "player_name" (scout server compat) and "name" (women endpoint compat)
    const name = (searchParams.get('player_name') || searchParams.get('name'))?.trim();
    const club = searchParams.get('club')?.trim() ?? '';
    const age = searchParams.get('age')?.trim() ?? '';
    const position = searchParams.get('position')?.trim();
    const positions = position ? [position] : (searchParams.get('positions')?.split(',').map((p) => p.trim()).filter(Boolean) ?? []);
    const nationality = searchParams.get('nationality')?.trim() ?? '';

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'player_name required (min 2 chars)' }, { status: 400 });
    }

    // ─── Check Firestore cache first (populated by local crawl script) ───
    try {
      const admin = getFirebaseAdmin();
      if (admin) {
        const db = getFirestore(admin);
        const cacheKey = normalize(name).replace(/\s+/g, '_');
        const cacheDoc = await db.collection(FM_CACHE_COLLECTION).doc(cacheKey).get();
        if (cacheDoc.exists) {
          const cached = cacheDoc.data()!;
          const age_ms = Date.now() - (cached.cached_at || 0);
          if (age_ms < FM_CACHE_MAX_AGE_MS && cached.ca > 0) {
            console.log(`[FMInside player] Cache HIT for "${name}" (age=${Math.round(age_ms / 86400000)}d)`);
            return NextResponse.json({
              player_name: cached.player_name ?? name,
              ca: cached.ca,
              pa: cached.pa,
              potential_gap: cached.potential_gap ?? Math.max(0, (cached.pa || 0) - (cached.ca || 0)),
              tier: cached.tier,
              dimension_scores: cached.dimension_scores ?? {},
              top_attributes: cached.top_attributes ?? [],
              weak_attributes: cached.weak_attributes ?? [],
              all_attributes: cached.all_attributes ?? {},
              position_fit: cached.position_fit ?? {},
              best_position: cached.best_position ?? { position: '—', fit: 80 },
              foot: cached.foot ?? { left: 50, right: 50 },
              height_cm: cached.height_cm ?? 0,
              fminside_url: cached.fminside_url ?? '',
              fmi_matched: true,
            }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
          }
        }
        // Also try matching by original_query_name variations
        const altSnap = await db.collection(FM_CACHE_COLLECTION)
          .where('original_query_name', '==', name)
          .limit(1)
          .get();
        if (!altSnap.empty) {
          const cached = altSnap.docs[0].data();
          const age_ms = Date.now() - (cached.cached_at || 0);
          if (age_ms < FM_CACHE_MAX_AGE_MS && cached.ca > 0) {
            console.log(`[FMInside player] Cache HIT (alt) for "${name}"`);
            return NextResponse.json({
              player_name: cached.player_name ?? name,
              ca: cached.ca,
              pa: cached.pa,
              potential_gap: cached.potential_gap ?? Math.max(0, (cached.pa || 0) - (cached.ca || 0)),
              tier: cached.tier,
              dimension_scores: cached.dimension_scores ?? {},
              top_attributes: cached.top_attributes ?? [],
              weak_attributes: cached.weak_attributes ?? [],
              all_attributes: cached.all_attributes ?? {},
              position_fit: cached.position_fit ?? {},
              best_position: cached.best_position ?? { position: '—', fit: 80 },
              foot: cached.foot ?? { left: 50, right: 50 },
              height_cm: cached.height_cm ?? 0,
              fminside_url: cached.fminside_url ?? '',
              fmi_matched: true,
            }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
          }
        }
        console.log(`[FMInside player] Cache MISS for "${name}"`);
      }
    } catch (cacheErr) {
      console.warn('[FMInside player] Cache lookup failed:', cacheErr);
    }

    // ─── Fallback: live scrape (may fail from cloud IPs) ───
    // Search FMInside (primary: AJAX search, then filter table, then web search)
    let hit = await searchViaAjax(name, age);
    if (!hit) hit = await searchFmInsideMen(name, positions, nationality, age, club);
    if (!hit) hit = await searchViaDuckDuckGo(name);
    if (!hit && process.env.SERPER_API_KEY) hit = await searchViaSerper(name);
    // Last resort: last name only
    if (!hit) {
      const lastName = name.trim().split(/\s+/).pop();
      if (lastName && lastName.length >= 3) hit = await searchViaAjax(lastName, age);
      if (!hit && lastName && lastName.length >= 3) hit = await searchViaDuckDuckGo(lastName);
    }

    if (!hit) {
      return NextResponse.json({
        error: 'No FM data available',
        player_name: name,
        fmi_matched: false,
      });
    }

    const detail = await fetchPlayerDetail(hit.url, name);
    if (!detail) {
      return NextResponse.json({
        error: 'No FM data available',
        player_name: name,
        fmi_matched: false,
      });
    }

    const tier = classifyTier(detail.ca);
    const topAttributes = [...detail.attributes].sort((a, b) => b.value - a.value).slice(0, 6);
    const weakAttributes = [...detail.attributes].sort((a, b) => a.value - b.value).slice(0, 4);

    // Dimension scores
    const dimensionScores: Record<string, number> = {};
    const tech = detail.attributes.filter((a) =>
      ['dribbling', 'passing', 'first_touch', 'technique', 'finishing', 'crossing'].includes(a.name)
    );
    const mental = detail.attributes.filter((a) =>
      ['decisions', 'composure', 'vision', 'anticipation', 'off_the_ball', 'work_rate'].includes(a.name)
    );
    const physical = detail.attributes.filter((a) =>
      ['pace', 'acceleration', 'stamina', 'strength', 'agility', 'balance'].includes(a.name)
    );
    if (tech.length) dimensionScores.technical = Math.round(tech.reduce((s, a) => s + a.value, 0) / tech.length);
    if (mental.length) dimensionScores.mental = Math.round(mental.reduce((s, a) => s + a.value, 0) / mental.length);
    if (physical.length) dimensionScores.physical = Math.round(physical.reduce((s, a) => s + a.value, 0) / physical.length);
    dimensionScores.overall = detail.ca > 0 ? Math.min(100, Math.round(detail.ca)) : 50;

    const bestPos = Object.entries(detail.positionFit).sort(([, a], [, b]) => b - a)[0];

    return NextResponse.json({
      player_name: hit.name,
      ca: detail.ca,
      pa: detail.pa,
      potential_gap: Math.max(0, detail.pa - detail.ca),
      tier,
      dimension_scores: dimensionScores,
      top_attributes: topAttributes,
      weak_attributes: weakAttributes,
      all_attributes: Object.fromEntries(detail.attributes.map((a) => [a.name, a.value])),
      position_fit: detail.positionFit,
      best_position: {
        position: detail.bestPosition || (bestPos?.[0] ?? '—'),
        fit: bestPos?.[1] ?? 80,
      },
      foot: detail.foot,
      height_cm: detail.heightCm,
      fminside_url: hit.url,
      fmi_matched: true,
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
  } catch (err) {
    console.error('[FMInside player]', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to fetch FMInside data',
      player_name: '',
      fmi_matched: false,
    }, { status: 500 });
  }
}
