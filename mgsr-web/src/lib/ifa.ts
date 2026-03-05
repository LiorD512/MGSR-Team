/**
 * IFA (Israel Football Association) scraper — football.org.il
 *
 * Hebrew pages render server-side; English pages are blocked by a consent wall.
 * Strategy:
 *   - Search: SerpAPI Google search with site:football.org.il (IFA has no public search API)
 *   - Profile: fetch Hebrew player page and parse with cheerio
 *   - Image search: SerpAPI is also used for player headshots (separate endpoint)
 *
 * Why SerpAPI for player search: football.org.il does not expose a search API.
 * We use Google (via SerpAPI) to find player pages, then scrape profiles for details.
 *
 * Player URL format:
 *   https://www.football.org.il/players/player/?player_id={INT}&season_id={INT}
 *   season_id 27 = 2024/25 season (increment for newer seasons)
 */

import * as cheerio from 'cheerio';

const IFA_BASE = 'https://www.football.org.il';
const CURRENT_SEASON_ID = '27';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const FETCH_TIMEOUT_MS = 20000;

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Browser-like headers to reduce 403 from football.org.il (blocks datacenter IPs) */
function getIfaFetchHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: `${IFA_BASE}/`,
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
  };
}

/** ─── TYPES ─── */
export interface IFASearchResult {
  fullName: string;
  fullNameHe?: string;
  currentClub?: string;
  dateOfBirth?: string;
  ifaUrl?: string;
  ifaPlayerId?: string;
  source: 'ifa';
}

export interface IFAPlayerProfile {
  fullName: string;
  fullNameHe?: string;
  dateOfBirth?: string;
  age?: string;
  nationality?: string;
  currentClub?: string;
  academy?: string;
  positions?: string[];
  ifaUrl: string;
  ifaPlayerId?: string;
  profileImage?: string;
  foot?: string;
  height?: string;
  stats?: {
    season?: string;
    matches?: number;
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
  };
}

/** ─── HTML FETCHING ─── */
async function fetchIfaHtml(url: string): Promise<string> {
  const ua = getRandomUA();
  const res = await fetch(url, {
    headers: getIfaFetchHeaders(ua),
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (res.ok) return res.text();

  // Retry once with different UA on 403 (football.org.il blocks datacenter IPs in production)
  if (res.status === 403) {
    const retryRes = await fetch(url, {
      headers: getIfaFetchHeaders(USER_AGENTS.find((a) => a !== ua) ?? ua),
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (retryRes.ok) return retryRes.text();

    // Free proxy fallback — AllOrigins uses different IPs, may bypass block
    try {
      const proxyRes = await fetch(
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      );
      if (proxyRes.ok) {
        const text = await proxyRes.text();
        if (text.includes('player_id') || text.includes('football.org.il')) return text;
      }
    } catch {
      /* ignore */
    }
  }

  throw new Error(`IFA HTTP ${res.status}`);
}

/** Israeli club name prefixes — fallback when profile fetch fails */
const CLUB_PREFIXES = /^(Hapoel|Maccabi|Beitar|Bnei|הפועל|מכבי|בני)\s+/i;

const PROFILE_FETCH_CONCURRENCY = 5;

/** Extract club from SerpAPI snippet (e.g. "קבוצה: מכבי פ\"ת" or "Maccabi PT") */
function extractClubFromSnippet(snippet: string | undefined): string | undefined {
  if (!snippet?.trim()) return undefined;
  const s = snippet.trim();
  const clubMatch =
    s.match(/קבוצה[:\s]*([^\n·|]+)/) ||
    s.match(/(?:מכבי|הפועל|בני|ביתר|עירוני|הכח|מ\.ס\.|הפ')\s+[^\n·|]{2,30}/) ||
    s.match(/(?:Maccabi|Hapoel|Beitar|Bnei)\s+[A-Za-z\s]{2,40}/);
  const raw = clubMatch ? clubMatch[1]?.trim() || clubMatch[0]?.trim() : undefined;
  return cleanClubSnippet(raw);
}

/** Remove IFA site noise from club snippet text */
function cleanClubSnippet(club: string | undefined): string | undefined {
  if (!club?.trim()) return undefined;
  let c = club.trim();
  // Strip "עונה שינוי יביא לרענון" and everything after it (IFA season-change banner text)
  c = c.replace(/\.?\s*עונה?\s*שינוי.*$/, '').trim();
  // Strip season page listings like "עמוד: 2024/2025, ..."
  c = c.replace(/\.?\s*עמוד\s*:.*$/, '').trim();
  // Strip trailing season years like "2024/2025, 2023/2024 ..."
  c = c.replace(/\.?\s*\d{4}\/\d{4}[\d\s,/]*\.{0,3}\s*$/, '').trim();
  // Strip trailing "שערים. מסגרת." and similar stat noise
  c = c.replace(/\.?\s*(?:שערים|מסגרת|כרטיסים)[\s.]*$/, '').trim();
  // Take only the first club (before comma-separated second club)
  const commaIdx = c.indexOf('),');
  if (commaIdx > 0) c = c.substring(0, commaIdx + 1).trim();
  // Remove trailing periods
  c = c.replace(/\.\s*$/, '').trim();
  // If nothing meaningful remains, return undefined
  if (!c || c.length < 2) return undefined;
  // If it starts with noise text, return undefined
  if (/^עונה/.test(c)) return undefined;
  return c;
}

/** Extract player_id from link if it's a valid IFA player page */
function extractPlayerIdFromLink(link: string): string | null {
  if (!link.includes('/players/player/') || !link.includes('player_id=')) return null;
  const m = link.match(/player_id=(\d+)/);
  return m?.[1] ?? null;
}

/** Fallback: extract player name from title when profile fetch fails */
function fallbackNameFromTitle(title: string): string {
  const trimmed = title
    .split('|')[0]
    ?.replace(/\s*-\s*football\.org\.il.*$/i, '')
    .replace(/\s*\|\s*התאחדות.*$/i, '')
    .replace(/\s*-\s*ההתאחדות.*$/i, '')
    .trim() ?? title;
  if (!trimmed) return trimmed;
  if (trimmed.includes(' - ')) {
    const parts = trimmed.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 1] : trimmed;
  }
  if (CLUB_PREFIXES.test(trimmed)) {
    const rest = trimmed.replace(CLUB_PREFIXES, '');
    const words = rest.split(/\s+/).filter(Boolean);
    if (words.length > 2) return words.slice(2).join(' ');
    if (words.length > 1) return words.slice(1).join(' ');
  }
  return trimmed;
}

/** Fetch profiles in batches to limit concurrency */
async function fetchProfilesWithLimit(
  urls: string[],
  concurrency: number
): Promise<Map<string, IFAPlayerProfile | null>> {
  const map = new Map<string, IFAPlayerProfile | null>();
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const profiles = await Promise.all(
      batch.map(async (url) => {
        try {
          return await fetchIFAProfile(url);
        } catch {
          return null;
        }
      })
    );
    batch.forEach((url, j) => map.set(url, profiles[j]));
  }
  return map;
}

/** Collect player IDs from SerpAPI response (main results + sitelinks) */
function collectPlayerUrlsFromSerpData(data: {
  organic_results?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    sitelinks?: {
      inline?: Array<{ title?: string; link?: string }>;
      expanded?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
  }>;
}): Map<string, { title?: string; snippet?: string }> {
  const map = new Map<string, { title?: string; snippet?: string }>();
  const add = (link: string, title?: string, snippet?: string) => {
    const pid = extractPlayerIdFromLink(link);
    if (!pid) return;
    const ifaUrl = `${IFA_BASE}/players/player/?player_id=${pid}&season_id=${CURRENT_SEASON_ID}`;
    if (map.has(ifaUrl)) return;
    map.set(ifaUrl, { title, snippet });
  };

  for (const r of data.organic_results ?? []) {
    const link = r.link ?? '';
    add(link, r.title, r.snippet);
    for (const sl of r.sitelinks?.inline ?? []) {
      add(sl.link ?? '', sl.title);
    }
    for (const sl of r.sitelinks?.expanded ?? []) {
      add(sl.link ?? '', sl.title, sl.snippet);
    }
  }
  return map;
}

/** ─── SEARCH (via SerpAPI) ─── */
export async function searchIFA(query: string): Promise<IFASearchResult[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey?.trim()) {
    console.warn('[IFA] No SERPAPI_KEY — cannot search IFA');
    return [];
  }

  const isHebrew = /[\u0590-\u05FF]/.test(q);
  const playerUrlMap = new Map<string, { title?: string; snippet?: string }>();

  const runSearch = async (searchQuery: string, extraParams?: Record<string, string>) => {
    try {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('api_key', serpKey.trim());
      url.searchParams.set('num', '15');
      url.searchParams.set('gl', 'il');
      url.searchParams.set('hl', extraParams?.hl ?? (isHebrew ? 'he' : 'en'));
      for (const [k, v] of Object.entries(extraParams ?? {})) {
        if (k === 'hl') continue;
        url.searchParams.set(k, v);
      }

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'MGSR/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as Parameters<typeof collectPlayerUrlsFromSerpData>[0];
      const collected = collectPlayerUrlsFromSerpData(data);
      collected.forEach((meta, ifaUrl) => {
        if (!playerUrlMap.has(ifaUrl)) playerUrlMap.set(ifaUrl, meta);
      });
    } catch (err) {
      console.error('[IFA] Search error:', err);
    }
  };

  // Primary search
  await runSearch(`site:football.org.il inurl:player_id ${q}`);

  // Fallbacks only when few results (max 2 extra calls for speed)
  if (playerUrlMap.size < 5) {
    const keyword = isHebrew ? 'שחקן' : 'player';
    await runSearch(`site:football.org.il inurl:player_id ${q} ${keyword}`);
  }
  if (playerUrlMap.size < 5 && !isHebrew) {
    await runSearch(`site:football.org.il inurl:player_id ${q} שחקן`, { hl: 'he' });
  }

  const urls = Array.from(playerUrlMap.keys()).slice(0, 20);
  if (urls.length === 0) return [];

  // Fast path: use SerpAPI title/snippet only — no profile fetch (saves 40–120s)
  // Profile is fetched on select via fetch-profile API
  const results: IFASearchResult[] = [];
  for (const ifaUrl of urls) {
    const meta = playerUrlMap.get(ifaUrl);
    const pid = extractPlayerIdFromLink(ifaUrl);
    if (!pid) continue;

    const fullName = fallbackNameFromTitle(meta?.title ?? '') || 'Unknown';
    const fullNameHe = /[\u0590-\u05FF]/.test(fullName) ? fullName : undefined;
    const currentClub = extractClubFromSnippet(meta?.snippet);

    results.push({
      fullName,
      fullNameHe,
      currentClub,
      dateOfBirth: undefined,
      ifaUrl,
      ifaPlayerId: pid,
      source: 'ifa',
    });
  }

  return results;
}

/** IFA club search result — compatible with ClubSearchResult for AddRequestSheet */
export interface IFAClubSearchResult {
  clubName: string;
  clubCountry: string;
  clubTmProfile?: string;
  clubLogo?: string;
  clubCountryFlag?: string;
}

/** Extract team_id from IFA team-details URL. Returns null for team_id=0 (generic). */
function extractTeamIdFromLink(link: string): string | null {
  if (!link.includes('team-details') || !link.includes('team_id=')) return null;
  const m = link.match(/team_id=(\d+)/);
  const id = m?.[1];
  if (!id || id === '0') return null;
  return id;
}

/** Extract display name from SerpAPI title (remove football.org.il, etc.) */
function extractClubNameFromTitle(title: string): string {
  const trimmed = title
    .split('|')[0]
    ?.replace(/\s*-\s*football\.org\.il.*$/i, '')
    .replace(/\s*\|\s*התאחדות.*$/i, '')
    .replace(/\s*-\s*ההתאחדות.*$/i, '')
    .trim() ?? title;
  return trimmed || title;
}

/** IFA generic pages (org/section pages) — not actual club teams. Exclude these. */
function isIFAGenericPage(clubName: string): boolean {
  if (!clubName?.trim()) return true;
  const t = clubName.trim();
  // Hebrew: IFA org without a club name
  if (t.includes('ההתאחדות לכדורגל בישראל') && !t.match(/מכבי|הפועל|בני|ביתר|חרות|סקציה|הכח|עירוני|פתח|תקווה|חיפה|תל אביב|ירושלים|באר שבע|נתניה|אשדוד|ראשון|פתח תקווה/i)) {
    return true;
  }
  if (/^ההתאחדות לכדורגל בישראל\s*[-–]\s*(פרטי קבוצה|מועדונים)\s*$/i.test(t)) return true;
  if (/^פרטי קבוצה\s*$/i.test(t) || /^מועדונים\s*$/i.test(t)) return true;
  // English: IFA org pages
  if (/^Israel Football Association\s*[-–]\s*(Team Details|Clubs)\s*$/i.test(t)) return true;
  if (/^Israel Football Association\s*$/i.test(t)) return true;
  if (/^Team Details\s*$/i.test(t) || /^Clubs\s*$/i.test(t)) return true;
  return false;
}

/** Check if title contains at least one significant word from the query (relevance filter). */
function titleMatchesQuery(clubName: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length === 0) return true;
  const lower = clubName.toLowerCase();
  const hebrewQuery = query.replace(/[a-z]/gi, '').trim();
  for (const w of words) {
    if (lower.includes(w)) return true;
  }
  if (hebrewQuery && clubName.includes(hebrewQuery)) return true;
  return false;
}

/** Fetch IFA team-details page and extract full title (includes age group). Format: "Under 17 2025/2026 Maccabi Petah Tikva" */
async function fetchTeamFullTitle(teamId: string): Promise<string | null> {
  try {
    const url = `${IFA_BASE}/team-details/?team_id=${teamId}&season_id=${CURRENT_SEASON_ID}`;
    const html = await fetchIfaHtml(url);
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim();
    if (!title) return null;
    return extractClubNameFromTitle(title);
  } catch {
    return null;
  }
}

/** Search IFA clubs via SerpAPI. Enriches with full team title (age group) from IFA page when SerpAPI title is generic. */
export async function searchIFAClubs(query: string): Promise<IFAClubSearchResult[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey?.trim()) {
    console.warn('[IFA] No SERPAPI_KEY — cannot search IFA clubs');
    return [];
  }

  const isHebrew = /[\u0590-\u05FF]/.test(q);
  const clubMap = new Map<string, { clubName: string; fromSerp: boolean }>();

  const runSearch = async (searchQuery: string, extraParams?: Record<string, string>) => {
    try {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('api_key', serpKey.trim());
      url.searchParams.set('num', '15');
      url.searchParams.set('gl', 'il');
      url.searchParams.set('hl', extraParams?.hl ?? (isHebrew ? 'he' : 'en'));
      for (const [k, v] of Object.entries(extraParams ?? {})) {
        if (k === 'hl') continue;
        url.searchParams.set(k, v);
      }

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'MGSR/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json()) as {
        organic_results?: Array<{
          title?: string;
          link?: string;
          sitelinks?: { inline?: Array<{ title?: string; link?: string }>; expanded?: Array<{ title?: string; link?: string }> };
        }>;
      };

      const processLink = (link: string, title?: string) => {
        const teamId = extractTeamIdFromLink(link);
        if (!teamId) return;
        const clubName = extractClubNameFromTitle(title ?? '');
        if (!clubName || clubName.length < 2) return;
        if (isIFAGenericPage(clubName)) return;
        if (!titleMatchesQuery(clubName, q)) return;
        if (!clubMap.has(teamId)) {
          const hasAgeGroup = /under\s*\d+|עד\s*גיל|גיל\s*\d+|u\d+|u-\d+/i.test(clubName);
          clubMap.set(teamId, { clubName, fromSerp: !hasAgeGroup });
        }
      };

      for (const r of data.organic_results ?? []) {
        processLink(r.link ?? '', r.title);
        for (const sl of r.sitelinks?.inline ?? []) {
          processLink(sl.link ?? '', sl.title ?? r.title);
        }
        for (const sl of r.sitelinks?.expanded ?? []) {
          processLink(sl.link ?? '', sl.title ?? r.title);
        }
      }
    } catch (err) {
      console.error('[IFA] Club search error:', err);
    }
  };

  // Require inurl:team_id to get only team-details pages with specific team (excludes generic IFA pages)
  // Use quoted phrase for exact club name match
  const quotedQ = q.includes(' ') ? `"${q}"` : q;
  await runSearch(`site:football.org.il inurl:team_id ${quotedQ}`);
  if (clubMap.size < 5 && !isHebrew) {
    await runSearch(`site:football.org.il inurl:team_id ${quotedQ} קבוצה`, { hl: 'he' });
  }
  if (clubMap.size < 5 && isHebrew) {
    await runSearch(`site:football.org.il inurl:team_id ${quotedQ} team`);
  }
  if (clubMap.size < 5) {
    await runSearch(`site:football.org.il team-details ${quotedQ}`);
  }

  const teamIdsToEnrich = Array.from(clubMap.entries())
    .filter(([, v]) => v.fromSerp)
    .map(([teamId]) => teamId)
    .slice(0, 12);

  if (teamIdsToEnrich.length > 0) {
    const enriched = await Promise.all(
      teamIdsToEnrich.map(async (teamId) => {
        const full = await fetchTeamFullTitle(teamId);
        return { teamId, full };
      })
    );
    for (const { teamId, full } of enriched) {
      if (full && !isIFAGenericPage(full) && titleMatchesQuery(full, q)) {
        const entry = clubMap.get(teamId);
        if (entry) clubMap.set(teamId, { clubName: full, fromSerp: false });
      }
    }
  }

  const finalClubs = Array.from(clubMap.entries())
    .filter(([, { clubName }]) => !isIFAGenericPage(clubName) && titleMatchesQuery(clubName, q))
    .map(([teamId, { clubName }]) => ({
    clubName,
    clubCountry: 'Israel',
    clubTmProfile: `${IFA_BASE}/team-details/?team_id=${teamId}&season_id=${CURRENT_SEASON_ID}`,
  }));

  return finalClubs;
}

/** Optional: crawl IFA pages for player links matching query. Uses known team-details URLs when SerpAPI returns few results. */
async function crawlIFARosterForQuery(query: string): Promise<string[]> {
  const q = query.toLowerCase().trim();
  if (!q || q.length < 2) return [];

  const teamIds = [6861, 5, 18];
  const results: string[] = [];
  const seen = new Set<string>();

  try {
    for (const teamId of teamIds) {
      const url = `https://www.football.org.il/team-details/?season_id=${CURRENT_SEASON_ID}&team_id=${teamId}`;
      const html = await fetchIfaHtml(url);
      const $ = cheerio.load(html);
      $('a[href*="player_id="]').each(function (this: cheerio.Element) {
        const href = $(this).attr('href') ?? '';
        const text = $(this).text().trim();
        if (!href.includes('/players/player/') || !href.includes('player_id=')) return;
        const pid = extractPlayerIdFromLink(href);
        if (!pid || seen.has(pid)) return;
        const nameMatch =
          text.toLowerCase().includes(q) || q.split(/\s+/).some((w) => w.length >= 2 && text.toLowerCase().includes(w));
        if (nameMatch) {
          seen.add(pid);
          results.push(`${IFA_BASE}/players/player/?player_id=${pid}&season_id=${CURRENT_SEASON_ID}`);
        }
      });
      if (results.length >= 5) break;
    }
    return results.slice(0, 10);
  } catch {
    return [];
  }
}

/** ─── PROFILE PARSING ─── */
export async function fetchIFAProfile(url: string): Promise<IFAPlayerProfile> {
  const html = await fetchIfaHtml(url);
  return parseIFAProfile(html, url);
}

/** Fetch IFA profile via AllOrigins proxy (bypasses 403 when direct fetch blocked) */
export async function fetchIFAProfileViaProxy(url: string): Promise<IFAPlayerProfile> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
  const html = await res.text();
  if (!html.includes('player_id') && !html.includes('football.org.il')) {
    throw new Error('Proxy returned invalid page');
  }
  return parseIFAProfile(html, url);
}

function parseIFAProfile(html: string, url: string): IFAPlayerProfile {
  const $ = cheerio.load(html);
  const profile: IFAPlayerProfile = { fullName: '', ifaUrl: url };

  // Extract player_id from URL
  const pidMatch = url.match(/player_id=(\d+)/);
  if (pidMatch) profile.ifaPlayerId = pidMatch[1];

  // ── Name: .new-player-card_title (IFA structure) or <h1> fallback ──
  const cardTitle = $('.new-player-card_title').first().text().trim();
  const h1 = cardTitle || $('h1').first().text().trim();
  if (h1) {
    profile.fullNameHe = h1;
    // If h1 has both Hebrew and English (some pages do), split
    const parts = h1.split(/\s*[-–]\s*/);
    const hePart = parts.find((p) => /[\u0590-\u05FF]/.test(p));
    const enPart = parts.find((p) => /^[A-Za-z\s]+$/.test(p.trim()));
    if (hePart) profile.fullNameHe = hePart.trim();
    if (enPart) profile.fullName = enPart.trim();
    else profile.fullName = h1;
  }

  // Fallback: .player-name or .player-header-name
  if (!profile.fullName || profile.fullName === '') {
    const nameEl = $('.player-name, .player-header-name').first().text().trim();
    if (nameEl) {
      profile.fullName = nameEl;
      if (/[\u0590-\u05FF]/.test(nameEl)) profile.fullNameHe = nameEl;
    }
  }

  // ── Profile image: .new-player-card_img-container img (IFA structure) ──
  const imgSrc =
    $('.new-player-card_img-container img').first().attr('src') ||
    $('.player-image img, .player-photo img, .player-header img').first().attr('src');
  if (imgSrc && imgSrc.trim()) {
    profile.profileImage = imgSrc.startsWith('http') ? imgSrc : `${IFA_BASE}${imgSrc}`;
  }

  // ── Player info: structured from .new-player-card_data-list <li> items ──
  // IFA format: <li><strong>Label: </strong>Value</li>
  const dataListItems = $('.new-player-card_data-list li');
  dataListItems.each(function (this: cheerio.Element) {
    const text = $(this).text().trim();

    // Date of birth — IFA uses MM/YYYY or DD/MM/YYYY
    const dobStructured = text.match(/תאריך לידה[:\s]*(\d{1,2}\/\d{4}|\d{1,2}[./]\d{1,2}[./]\d{4})/);
    if (dobStructured) {
      profile.dateOfBirth = dobStructured[1];
      const dateStr = dobStructured[1];
      const slashParts = dateStr.split('/');
      if (slashParts.length === 2) {
        // MM/YYYY format
        const year = parseInt(slashParts[1], 10);
        profile.age = String(new Date().getFullYear() - year);
      } else if (slashParts.length === 3) {
        // DD/MM/YYYY format
        const year = parseInt(slashParts[2], 10);
        profile.age = String(new Date().getFullYear() - year);
      }
    }

    // Nationality
    const natStructured = text.match(/אזרחות[:\s]*(.+)/);
    if (natStructured) profile.nationality = natStructured[1].trim();
  });

  // ── Fallback: regex on body text for DOB, nationality, club ──
  const infoText = $('body').text();

  if (!profile.dateOfBirth) {
    // Try full date first, then MM/YYYY
    const dobMatch =
      infoText.match(/תאריך לידה[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})/) ||
      infoText.match(/תאריך לידה[:\s]*(\d{1,2}\/\d{4})/);
    if (dobMatch) {
      profile.dateOfBirth = dobMatch[1];
      const parts = dobMatch[1].split(/[./]/);
      if (parts.length >= 2) {
        const year = parseInt(parts[parts.length - 1], 10);
        profile.age = String(new Date().getFullYear() - year);
      }
    }
  }

  if (!profile.nationality) {
    const natMatch = infoText.match(/אזרחות[:\s]*([^\n,]+)/);
    if (natMatch) profile.nationality = natMatch[1].trim();
  }

  // Club — try structured "נתוני השחקן בקבוצה:" section span first
  const teamSpan = $('.new-player-data_title .js-container-title span, .new-player-data_title span').first().text().trim();
  if (teamSpan) {
    profile.currentClub = teamSpan;
  }
  if (!profile.currentClub) {
    const clubMatch = infoText.match(/קבוצה[:\s]*([^\n,]+)/);
    if (clubMatch) profile.currentClub = clubMatch[1].trim();
  }

  // Division / Academy
  const divMatch = infoText.match(/מחלקה[:\s]*([^\n,]+)/) || infoText.match(/מסגרת[:\s]*([^\n,]+)/);
  if (divMatch) profile.academy = divMatch[1].trim();

  // Position
  const posMatch = infoText.match(/תפקיד[:\s]*([^\n,]+)/) || infoText.match(/עמדה[:\s]*([^\n,]+)/);
  if (posMatch) {
    const raw = posMatch[1].trim();
    profile.positions = mapHebrewPosition(raw);
  }

  // Foot
  const footMatch = infoText.match(/רגל[:\s]*(ימין|שמאל|שתיים)/);
  if (footMatch) {
    const map: Record<string, string> = { ימין: 'Right', שמאל: 'Left', שתיים: 'Both' };
    profile.foot = map[footMatch[1]] ?? footMatch[1];
  }

  // Height
  const heightMatch = infoText.match(/גובה[:\s]*(\d{2,3})/);
  if (heightMatch) profile.height = `${heightMatch[1]} cm`;

  // ── Stats table ──
  // Look for season stats: matches, goals, assists, cards
  const stats: IFAPlayerProfile['stats'] = { season: CURRENT_SEASON_ID };
  const statsTable = $('table').filter(function (this: cheerio.Element) {
    return $(this).text().includes('משחקים') || $(this).text().includes('שערים');
  }).first();

  if (statsTable.length) {
    const rows = statsTable.find('tr');
    // Usually first data row after header
    const dataRow = rows.eq(1);
    const cells = dataRow.find('td');
    if (cells.length >= 3) {
      stats.matches = parseInt(cells.eq(0).text().trim(), 10) || 0;
      stats.goals = parseInt(cells.eq(1).text().trim(), 10) || 0;
      stats.assists = parseInt(cells.eq(2).text().trim(), 10) || 0;
      if (cells.length >= 4) stats.yellowCards = parseInt(cells.eq(3).text().trim(), 10) || 0;
      if (cells.length >= 5) stats.redCards = parseInt(cells.eq(4).text().trim(), 10) || 0;
    }
  }

  // Fallback: regex-based stats parsing
  if (!stats.matches) {
    const matchesMatch = infoText.match(/משחקים[:\s]*(\d+)/);
    const goalsMatch = infoText.match(/שערים[:\s]*(\d+)/);
    const assistsMatch = infoText.match(/בישולים[:\s]*(\d+)/) || infoText.match(/מסירות מכריעות[:\s]*(\d+)/);
    if (matchesMatch) stats.matches = parseInt(matchesMatch[1], 10);
    if (goalsMatch) stats.goals = parseInt(goalsMatch[1], 10);
    if (assistsMatch) stats.assists = parseInt(assistsMatch[1], 10);
  }

  if (stats.matches || stats.goals) {
    profile.stats = stats;
  }

  return profile;
}

/** Map Hebrew position names to standard codes */
function mapHebrewPosition(raw: string): string[] {
  const posMap: Record<string, string> = {
    שוער: 'GK',
    'בלם מרכזי': 'CB',
    'מגן ימני': 'RB',
    'מגן שמאלי': 'LB',
    'קשר הגנתי': 'DM',
    'קשר מרכזי': 'CM',
    'קשר התקפי': 'AM',
    'כנף ימני': 'RW',
    'כנף שמאלי': 'LW',
    'חלוץ מרכזי': 'CF',
    חלוץ: 'ST',
    'חלוץ משני': 'SS',
    בלם: 'CB',
    מגן: 'CB',
    קשר: 'CM',
    כנף: 'RW',
  };

  const positions: string[] = [];
  const lower = raw.trim();

  // Try exact match first
  if (posMap[lower]) return [posMap[lower]];

  // Try partial matches
  for (const [he, code] of Object.entries(posMap)) {
    if (lower.includes(he) && !positions.includes(code)) {
      positions.push(code);
    }
  }

  return positions.length > 0 ? positions : [raw];
}

/** Extract player_id from an IFA URL */
export function extractIfaPlayerId(url: string): string | null {
  const m = url.match(/player_id=(\d+)/);
  return m?.[1] ?? null;
}

/** Validate an IFA player URL — accepts Hebrew (/players/...) or English (/en/players/...) paths */
export function isValidIfaUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?football\.org\.il\/(en\/)?players\/player\/\?player_id=\d+/.test(url);
}

/** Normalize an IFA URL to the Hebrew version (strip /en/) for reliable scraping */
export function normalizeIfaUrl(url: string): string {
  return url.replace(/football\.org\.il\/en\/players\//, 'football.org.il/players/');
}

/** Build an IFA player URL from player_id */
export function buildIfaUrl(playerId: string, seasonId: string = CURRENT_SEASON_ID): string {
  return `${IFA_BASE}/players/player/?player_id=${playerId}&season_id=${seasonId}`;
}
