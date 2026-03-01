/**
 * GET /api/fminside/women-player
 * Fetches FMInside data for a women's player directly from FMInside.
 * Searches with gender=female, matches by name, position, nationality, age.
 * No database - direct fetch each time.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FMINSIDE_BASE = 'https://fminside.net';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
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

function ageMatch(ourAge: string, theirAge: string): number {
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

/**
 * FMInside search uses a 2-step AJAX flow (discovered via functions.js):
 * 1. POST to update_filter.php - stores filter in session (gender=2 for Female)
 * 2. GET generate-player-table.php?ajax_request=1 - returns HTML with filtered results
 * The /players?name=... URL returns generic HTML; search only works via this AJAX API.
 */
async function searchFmInsideWomen(
  name: string,
  positions: string[],
  nationality: string,
  age: string,
  club: string
): Promise<SearchHit | null> {
  const searchName = name.trim().split(/\s+/).slice(0, 3).join(' ');
  if (!searchName || searchName.length < 2) return null;

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const baseHeaders: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  /** Parse Set-Cookie header(s) into Cookie header value (name=value; name2=value2) */
  function toCookieHeader(setCookie: string | string[] | null): string {
    if (!setCookie) return '';
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    const pairs: string[] = [];
    for (const raw of list) {
      const s = typeof raw === 'string' ? raw : '';
      for (const part of s.split(/,\s*(?=[\w-]+=)/)) {
        const nameValue = part.split(';')[0].trim();
        if (nameValue) pairs.push(nameValue);
      }
    }
    return pairs.join('; ');
  }

  /** Merge cookie strings: later values override earlier for same name */
  function mergeCookies(...parts: string[]): string {
    const map = new Map<string, string>();
    for (const part of parts) {
      for (const pair of part.split(';').map((s) => s.trim())) {
        const eq = pair.indexOf('=');
        if (eq > 0 && !['path', 'domain', 'expires', 'max-age', 'secure', 'httponly', 'samesite'].includes(pair.slice(0, eq).toLowerCase())) {
          map.set(pair.slice(0, eq), pair.slice(eq + 1));
        }
      }
    }
    return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // Step 1: Get session cookie by visiting players page
  const initRes = await fetch(`${FMINSIDE_BASE}/players`, {
    headers: baseHeaders,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
  });
  if (!initRes.ok) return null;

  const initCookies = toCookieHeader(initRes.headers.get('set-cookie'));

  // Step 2: POST to update_filter.php - gender=2 is Female (form uses value="2")
  const filterBody = new URLSearchParams({
    page: 'players',
    database_version: '7',
    gender: '2',
    name: searchName,
  });
  const updateRes = await fetch(`${FMINSIDE_BASE}/resources/inc/ajax/update_filter.php`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      Cookie: initCookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${FMINSIDE_BASE}/players`,
    },
    body: filterBody.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  // Update response sets GENDER, PHPSESSID - we must use these for generate-player-table
  const headers = updateRes.headers as Headers & { getSetCookie?: () => string[] };
  const updateSetCookie = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : null;
  const updateCookies = updateSetCookie?.length
    ? toCookieHeader(updateSetCookie)
    : toCookieHeader(updateRes.headers.get('set-cookie'));
  const finalCookie = mergeCookies(initCookies, updateCookies);

  // Step 3: GET generate-player-table.php - returns filtered player list HTML
  const tableRes = await fetch(
    `${FMINSIDE_BASE}/beheer/modules/players/resources/inc/frontend/generate-player-table.php?ajax_request=1`,
    {
      headers: { ...baseHeaders, Cookie: finalCookie || initCookies },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!tableRes.ok) return null;
  const html = await tableRes.text();

  // Parse player links: href="/players/7-fm-26/2000351404-diana-bieliakova"
  const linkRe = /href="(\/players\/7-fm-26\/(\d+)-([^"]+))"/g;
  const slugToName = (slug: string) =>
    slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

  const hits: SearchHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const path = m[1];
    const id = m[2];
    const slug = m[3];
    const fullUrl = `${FMINSIDE_BASE}${path}`;
    const displayName = slugToName(slug);

    const nameScore = nameMatchScore(name, displayName);
    if (nameScore < 50) continue;

    // Extract context from row if possible
    const rowStart = html.indexOf(path);
    const rowHtml = rowStart >= 0 ? html.slice(Math.max(0, rowStart - 500), rowStart + 500) : '';
    const posMatch = rowHtml.match(/(?:MC|ST|GK|CB|LB|RB|DM|CM|AM|LW|RW|CF|SS|AML|AMR|ML|MR|DL|DR)(?:\s*,\s*(?:MC|ST|GK|CB|LB|RB|DM|CM|AM|LW|RW|CF|SS|AML|AMR|ML|MR|DL|DR))*/gi);
    const rowPositions = posMatch
      ? Array.from(new Set((posMatch[0] || '').split(',').map((p) => p.trim().toUpperCase().slice(0, 2)).filter(Boolean)))
      : [];
    const ageMatch2 = rowHtml.match(/>\s*(\d{1,2})\s*</);
    const rowAge = ageMatch2 ? ageMatch2[1] : '';
    const clubMatch = rowHtml.match(/\[([^\]]+)\]/);
    const rowClub = clubMatch ? clubMatch[1] : '';

    const posScore = positionOverlap(positions, rowPositions);
    const ageScore = age ? ageMatch(age, rowAge) : 50;
    const totalScore = nameScore * 0.5 + posScore * 0.25 + ageScore * 0.25;

    hits.push({
      url: fullUrl,
      name: displayName,
      positions: rowPositions,
      club: rowClub,
      age: rowAge,
      score: totalScore,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits[0] ?? null;
}

/**
 * Fallback: FMInside search is client-side (JS) and returns generic results.
 * Use DuckDuckGo to find indexed FMInside player pages.
 */
async function searchViaDuckDuckGo(name: string): Promise<SearchHit | null> {
  const query = encodeURIComponent(`site:fminside.net/players/7-fm-26 ${name}`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MGSR/1.0; +https://mgsr-team.vercel.app)',
        Accept: 'text/html',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Match link text like [fminside.net/players/7-fm-26/2000333886-diana-abramova]
    const linkRe = /\[(fminside\.net\/players\/7-fm-26\/(\d+)-([^\]]+))\]/gi;
    const hits: { url: string; id: string; slug: string; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const path = m[1];
      const id = m[2];
      const slug = m[3];
      const fullUrl = `https://${path.replace(/^fminside\.net/, 'fminside.net')}`;
      const displayName = slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (!hits.some((h) => h.id === id)) {
        hits.push({ url: fullUrl, id, slug, name: displayName });
      }
    }

    let best: SearchHit | null = null;
    let bestScore = 0;
    for (const h of hits) {
      const score = nameMatchScore(name, h.name);
      if (score >= 60 && score > bestScore) {
        bestScore = score;
        best = {
          url: h.url,
          name: h.name,
          positions: [],
          club: '',
          age: '',
          score,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Fallback: Serper.dev Google Search API (when SERPER_API_KEY is set).
 * Google indexes more FMInside pages than DuckDuckGo.
 */
async function searchViaSerper(name: string): Promise<SearchHit | null> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return null;

  const query = `site:fminside.net/players/7-fm-26 ${name}`;
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 10 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { organic?: Array<{ link?: string }> };
    const organic = data.organic ?? [];

    const linkRe = /fminside\.net\/players\/7-fm-26\/(\d+)-([a-z0-9-]+)/i;
    for (const item of organic) {
      const link = item.link ?? '';
      const m = link.match(linkRe);
      if (!m) continue;
      const id = m[1];
      const slug = m[2];
      const fullUrl = `https://fminside.net/players/7-fm-26/${id}-${slug}`;
      const displayName = slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      const score = nameMatchScore(name, displayName);
      if (score >= 60) {
        return {
          url: fullUrl,
          name: displayName,
          positions: [],
          club: '',
          age: '',
          score,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Broader search: "fminside players {name}" - sometimes finds player pages not in site: results
 */
async function searchViaDuckDuckGoBroad(name: string): Promise<SearchHit | null> {
  const query = encodeURIComponent(`fminside.net players ${name} FM26`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MGSR/1.0; +https://mgsr-team.vercel.app)',
        Accept: 'text/html',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const linkRe = /fminside\.net\/players\/7-fm-26\/(\d+)-([a-z0-9-]+)/gi;
    const hits: { url: string; id: string; slug: string; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const id = m[1];
      const slug = m[2];
      const fullUrl = `https://fminside.net/players/7-fm-26/${id}-${slug}`;
      const displayName = slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      if (!hits.some((h) => h.id === id)) {
        hits.push({ url: fullUrl, id, slug, name: displayName });
      }
    }

    let best: SearchHit | null = null;
    let bestScore = 0;
    for (const h of hits) {
      const score = nameMatchScore(name, h.name);
      if (score >= 70 && score > bestScore) {
        bestScore = score;
        best = {
          url: h.url,
          name: h.name,
          positions: [],
          club: '',
          age: '',
          score,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

function verifyPlayerNameOnPage(html: string, expectedName: string): boolean {
  const n = normalize(expectedName);
  if (!n) return true;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const text = [titleMatch?.[1], h1Match?.[1]].filter(Boolean).join(' ').toLowerCase();
  const textNorm = normalize(text);
  const words = n.split(/\s+/).filter(Boolean);
  const matchCount = words.filter((w) => textNorm.includes(w)).length;
  return matchCount >= Math.min(2, words.length) || (words.length === 1 && matchCount === 1);
}

async function fetchPlayerDetail(url: string, expectedName?: string): Promise<{
  ca: number;
  pa: number;
  attributes: { name: string; value: number }[];
  positionFit: Record<string, number>;
  bestPosition: string;
  heightCm: number;
  foot: { left: number; right: number };
  similarPlayers: { name: string; club?: string; age?: string; value?: string; fmInsideUrl: string }[];
} | null> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MGSR/1.0; +https://mgsr-team.vercel.app)',
      Accept: 'text/html',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const html = await res.text();

  if (expectedName && !verifyPlayerNameOnPage(html, expectedName)) {
    return null;
  }

  // CA and PA: FMInside displays on same 0-200 scale as FM. Parse from <div class="meta">:
  // <span class="card poor">48</span><span class="card poor">58</span> = CA 48, PA 58 (no conversion)
  const metaMatch = html.match(/class="meta"[^>]*>[\s\S]*?<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>/i);
  let ca = 0;
  let pa = 0;
  if (metaMatch) {
    const rawCa = parseInt(metaMatch[1], 10);
    const rawPa = parseInt(metaMatch[2], 10);
    // FMInside uses 0-200 (FM scale) for CA/PA — use as-is
    ca = rawCa >= 0 && rawCa <= 200 ? rawCa : 0;
    pa = rawPa >= 0 && rawPa <= 200 ? rawPa : 0;
  }
  if (ca === 0) {
    const ratingMatch =
      html.match(/<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*FM\s*26/i) ||
      html.match(/(\d{2,3})\s*FM\s*26/i);
    const raw = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;
    ca = raw >= 0 && raw <= 200 ? raw : 0;
  }

  // Attributes: HTML <td class="name">...Crossing...</td><td class="stat value_4">20</td> or markdown | Crossing | 70 |
  const attributes: { name: string; value: number }[] = [];
  const seen = new Set<string>();
  // HTML format: <td class="name"><acronym...>Crossing</acronym></td><td class="stat value_X">20</td>
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
  // Fallback: markdown-style tables
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

  // Position fit: Best in possession roles <span class="key">Channel Forward</span><span class="value">56.4</span>
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
      if (!positionFit[key] || fitVal > positionFit[key]) {
        positionFit[key] = Math.round(fitVal);
      }
    }
  }
  // Fallback: (AMC)84.7 format
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

  // Height: <span class="key">Height</span><span class="value">166 CM</span>
  const heightMatch = html.match(/<span class="key">Height<\/span><span class="value">(\d+)\s*CM<\/span>/i) ||
    html.match(/Height[^<]*<\/[^>]+>\s*<[^>]*>(\d+)\s*CM/i) ||
    html.match(/(\d{2,3})\s*CM/i);
  const heightCm = heightMatch ? parseInt(heightMatch[1] || heightMatch[2], 10) : 0;

  // Best position: <span position="st" title="Natural" class="position natural">ST</span>
  let bestPosition = '';
  const posAttrMatch = html.match(/position="([a-z]{2,3})"/i);
  if (posAttrMatch) bestPosition = posAttrMatch[1].toUpperCase().slice(0, 2);
  if (!bestPosition) {
    const posMatch = html.match(/Position\(s\)[^<]*<[^>]*>([A-Z]{2,3})/i);
    if (posMatch) bestPosition = posMatch[1].toUpperCase().slice(0, 2);
  }

  // Foot: <span class="key">Left foot</span><span class="value"><span class="card poor">55</span></span>
  // Right foot can be 100 (card superstar) — use \d{1,3}
  let footLeft = 50;
  let footRight = 50;
  const leftFootMatch = html.match(/<span class="key">Left foot<\/span><span class="value"><span[^>]*>(\d{1,3})<\/span>/i);
  const rightFootMatch = html.match(/<span class="key">Right foot<\/span><span class="value"><span[^>]*>(\d{1,3})<\/span>/i);
  if (leftFootMatch) footLeft = Math.min(100, parseInt(leftFootMatch[1], 10) || 50);
  if (rightFootMatch) footRight = Math.min(100, parseInt(rightFootMatch[1], 10) || 50);

  // Similar players: <ul class="player show"> blocks with <a href="/players/7-fm-26/ID-slug">Name</a>
  const similarPlayers: { name: string; club?: string; age?: string; value?: string; fmInsideUrl: string }[] = [];
  const similarBlock = html.match(/class="player_table similar_players"[\s\S]*?<div class="players">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  if (similarBlock) {
    const blockHtml = similarBlock[1];
    const ulChunks = blockHtml.split(/<ul class="player show">/i);
    for (let i = 1; i < ulChunks.length; i++) {
      const chunk = ulChunks[i];
      const linkMatch = chunk.match(/<a[^>]*href="(\/players\/7-fm-26\/\d+-[^"]+)"[^>]*>([^<]+)<\/a>/);
      if (!linkMatch) continue;
      const path = linkMatch[1];
      const name = (linkMatch[2] || '').trim();
      const clubMatch = chunk.match(/<a href="[^"]*clubs[^"]*"[^>]*>[\s\S]*?<\/a>/);
      const club = clubMatch ? clubMatch[0].replace(/<[^>]+>/g, '').trim() : undefined;
      const ageMatch = chunk.match(/<li class="age">(\d+)<\/li>/);
      const age = ageMatch ? ageMatch[1] : undefined;
      const valueMatch = chunk.match(/<li class="value"[^>]*>([\s\S]*?)<\/li>/);
      const valueRaw = valueMatch ? valueMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const valueDecoded = valueRaw
        .replace(/&euro;/gi, '€')
        .replace(/&pound;/gi, '£')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&');
      const value = valueDecoded && valueDecoded !== '0' ? valueDecoded : undefined;
      similarPlayers.push({ name, club, age, value, fmInsideUrl: `https://fminside.net${path}` });
    }
  }

  const sortedAttrs = [...attributes].sort((a, b) => b.value - a.value);
  const topAttrs = sortedAttrs.slice(0, 5);
  const weakAttrs = sortedAttrs.slice(-3).reverse();

  const fallbackCa = topAttrs.length
    ? Math.round(topAttrs.reduce((s, a) => s + a.value, 0) / topAttrs.length) * 2
    : 0;
  return {
    ca: ca || fallbackCa,
    pa: pa || ca,
    attributes: topAttrs.length ? attributes : [],
    positionFit: Object.keys(positionFit).length ? positionFit : (bestPosition ? { [bestPosition]: 80 } : {}),
    bestPosition: bestPosition || '—',
    heightCm,
    foot: { left: footLeft, right: footRight },
    similarPlayers,
  };
}

function classifyTier(ca: number): string {
  if (ca <= 0) return 'unknown';
  if (ca >= 180) return 'world_class';
  if (ca >= 160) return 'elite';
  if (ca >= 140) return 'top_league';
  if (ca >= 120) return 'solid_pro';
  if (ca >= 100) return 'lower_league';
  return 'prospect';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const name = searchParams.get('name')?.trim();
    const position = searchParams.get('position')?.trim();
    const positions = position ? [position] : (searchParams.get('positions')?.split(',').map((p) => p.trim()).filter(Boolean) ?? []);
    const nationality = searchParams.get('nationality')?.trim() ?? '';
    const age = searchParams.get('age')?.trim() ?? '';
    const club = searchParams.get('club')?.trim() ?? '';
    const fmInsideId = searchParams.get('fmInsideId')?.trim();
    const fmInsideUrl = searchParams.get('fmInsideUrl')?.trim();

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Name required (min 2 chars)' }, { status: 400 });
    }

    let hit: SearchHit | null = null;

    // Direct lookup if we have full FMInside URL (e.g. https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova)
    if (fmInsideUrl?.includes('fminside.net/players/7-fm-26/')) {
      const fullUrl = fmInsideUrl.startsWith('http') ? fmInsideUrl : `https://${fmInsideUrl}`;
      const cleanUrl = fullUrl.split('?')[0].split('#')[0];
      hit = {
        url: cleanUrl,
        name,
        positions,
        club,
        age,
        score: 100,
      };
    }
    // Direct lookup if we have fmInsideId only
    else if (fmInsideId && /^\d+$/.test(fmInsideId)) {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      hit = {
        url: `${FMINSIDE_BASE}/players/7-fm-26/${fmInsideId}-${slug}`,
        name,
        positions,
        club,
        age,
        score: 100,
      };
    }

    if (!hit) {
      hit = await searchFmInsideWomen(name, positions, nationality, age, club);
    }
    // FMInside search is client-side (JS) - returns generic results. Fallback to search engines.
    if (!hit) {
      hit = await searchViaDuckDuckGo(name);
    }
    if (!hit && process.env.SERPER_API_KEY) {
      hit = await searchViaSerper(name);
    }
    if (!hit) {
      hit = await searchViaDuckDuckGoBroad(name);
    }
    // Try last name only (e.g. "Bieliakova" for "Diana Bieliakova")
    if (!hit) {
      const lastName = name.trim().split(/\s+/).pop();
      if (lastName && lastName.length >= 3) {
        hit = await searchViaDuckDuckGo(lastName);
      }
    }
    if (!hit) {
      return NextResponse.json({
        found: false,
        message: 'No matching player found on FMInside (women\'s database).',
      });
    }

    const detail = await fetchPlayerDetail(hit.url, name);
    if (!detail) {
      return NextResponse.json({
        found: false,
        message: 'Found a possible match but could not load details.',
      });
    }

    const tier = classifyTier(detail.ca);
    const topAttributes = detail.attributes
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
      .map((a) => ({ name: a.name, value: a.value }));
    const weakAttributes = detail.attributes
      .sort((a, b) => a.value - b.value)
      .slice(0, 4)
      .map((a) => ({ name: a.name, value: a.value }));

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
    // CA is 0-200 (FM scale); overall dimension 0-100 for bar display
    dimensionScores.overall = detail.ca > 0 ? Math.min(100, Math.round(detail.ca)) : 50;

    const bestPos = Object.entries(detail.positionFit).sort(([, a], [, b]) => b - a)[0];
    const positionFit: Record<string, number> = {};
    for (const [k, v] of Object.entries(detail.positionFit)) {
      positionFit[k] = v;
    }
    if (Object.keys(positionFit).length === 0 && detail.bestPosition) {
      positionFit[detail.bestPosition] = 80;
    }

    return NextResponse.json({
      found: true,
      player_name: hit.name,
      ca: detail.ca,
      pa: detail.pa,
      potential_gap: Math.max(0, detail.pa - detail.ca),
      tier,
      dimension_scores: dimensionScores,
      top_attributes: topAttributes,
      weak_attributes: weakAttributes,
      all_attributes: Object.fromEntries(detail.attributes.map((a) => [a.name, a.value])),
      position_fit: positionFit,
      best_position: {
        position: detail.bestPosition || (bestPos?.[0] ?? '—'),
        fit: bestPos?.[1] ?? 80,
      },
      foot: detail.foot ?? { left: 50, right: 50 },
      height_cm: detail.heightCm,
      fminside_url: hit.url,
      similar_players: detail.similarPlayers ?? [],
    });
  } catch (err) {
    console.error('[FMInside women-player]', err);
    return NextResponse.json(
      {
        found: false,
        message: err instanceof Error ? err.message : 'Failed to fetch FMInside data.',
      },
      { status: 500 }
    );
  }
}
