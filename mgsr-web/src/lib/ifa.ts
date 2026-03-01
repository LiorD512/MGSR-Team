/**
 * IFA (Israel Football Association) scraper — football.org.il
 *
 * Hebrew pages render server-side; English pages are blocked by a consent wall.
 * Strategy:
 *   - Search: SerpAPI Google search with site:football.org.il
 *   - Profile: fetch Hebrew player page and parse with cheerio
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
];

const FETCH_TIMEOUT_MS = 20000;

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
  const res = await fetch(url, {
    headers: {
      'User-Agent': getRandomUA(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`IFA HTTP ${res.status}`);
  return res.text();
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

  const seen = new Set<string>();
  const results: IFASearchResult[] = [];

  // Helper: run a single SerpAPI search and collect player results
  const runSearch = async (searchQuery: string, extraParams?: Record<string, string>) => {
    try {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('api_key', serpKey.trim());
      url.searchParams.set('num', '15');
      // Target Israeli results in Hebrew for better IFA coverage
      url.searchParams.set('gl', 'il');
      url.searchParams.set('hl', 'he');
      for (const [k, v] of Object.entries(extraParams ?? {})) {
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
          snippet?: string;
        }>;
      };

      for (const r of data.organic_results ?? []) {
        const link = r.link ?? '';
        // Only player pages
        if (!link.includes('player_id=') && !link.includes('/players/player/')) continue;

        const playerIdMatch = link.match(/player_id=(\d+)/);
        const playerId = playerIdMatch?.[1];
        if (!playerId || seen.has(playerId)) continue;
        seen.add(playerId);

        // Parse name from title — typically "שם השחקן | התאחדות לכדורגל"
        const title = r.title ?? '';
        const nameParts = title.split('|')[0]?.trim() ?? title;
        const hebrewName = nameParts
          .replace(/\s*-\s*football\.org\.il.*$/i, '')
          .replace(/\s*\|\s*התאחדות.*$/i, '')
          .replace(/\s*-\s*ההתאחדות.*$/i, '')
          .trim();

        // Try to extract English name from snippet or title
        const snippet = r.snippet ?? '';
        const englishNameMatch = snippet.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/) ??
          title.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);

        // Try to extract DOB from snippet (format: DD/MM/YYYY or DD.MM.YYYY)
        const dobSnippetMatch = snippet.match(/תאריך לידה[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})/) ??
          snippet.match(/(\d{1,2}[./]\d{1,2}[./]\d{4})/);
        const dateOfBirth = dobSnippetMatch?.[1];

        // Try to extract club from snippet
        const clubSnippetMatch = snippet.match(/קבוצה[:\s]*([^\n,.]+)/) ??
          snippet.match(/מועדון[:\s]*([^\n,.]+)/);
        const currentClub = clubSnippetMatch?.[1]?.trim();

        // Normalize IFA URL to include current season
        const ifaUrl = `${IFA_BASE}/players/player/?player_id=${playerId}&season_id=${CURRENT_SEASON_ID}`;

        results.push({
          fullName: englishNameMatch?.[0] ?? hebrewName,
          fullNameHe: /[\u0590-\u05FF]/.test(hebrewName) ? hebrewName : undefined,
          currentClub,
          dateOfBirth,
          ifaUrl,
          ifaPlayerId: playerId,
          source: 'ifa',
        });
      }
    } catch (err) {
      console.error('[IFA] Search error:', err);
    }
  };

  // Primary search: site-scoped with player keyword for better targeting
  const isHebrew = /[\u0590-\u05FF]/.test(q);
  await runSearch(`site:football.org.il/players/player ${q}`);

  // If few results, try broader search with Hebrew player keyword
  if (results.length < 3) {
    const fallbackQuery = isHebrew
      ? `site:football.org.il ${q} שחקן`
      : `site:football.org.il ${q} player`;
    await runSearch(fallbackQuery);
  }

  // If still few results and query is English, try without site restriction using IFA keywords
  if (results.length < 3 && !isHebrew) {
    await runSearch(`football.org.il player_id ${q}`);
  }

  return results.slice(0, 20);
}

/** ─── PROFILE PARSING ─── */
export async function fetchIFAProfile(url: string): Promise<IFAPlayerProfile> {
  const html = await fetchIfaHtml(url);
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
