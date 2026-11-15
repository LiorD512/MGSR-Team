/**
 * Transfermarkt "Advanced player search" (detailsuche/spielerdetail) scraper.
 *
 * Verified behaviour (Nov 2026):
 *  - The search is a stateless POST of `Detailsuche[...]` fields; pagination is the
 *    same POST sent to `...suche?page=N` (no cookie / session needed).
 *  - 25 rows per page, TM caps every search at 250 hits (10 pages).
 *  - Age fields MUST be sent, otherwise TM answers "0 Hits".
 *  - Height (minGroesse / maxGroesse, cm) is only applied when both bounds are sent.
 *  - Table columns vary with the filters (e.g. a "Contract" column, no "Club"
 *    column for free agents), so columns are resolved from the <th> headers.
 */
import * as cheerio from 'cheerio';
import { fetchHtmlWithRetry, makeAbsoluteUrl, convertPosition } from './transfermarkt';

const SEARCH_URL = 'https://www.transfermarkt.com/detailsuche/spielerdetail/suche';

export const TM_SEARCH_PAGE_SIZE = 25;
export const TM_SEARCH_MAX_HITS = 250;

/** Our position codes -> Transfermarkt `hauptposition_id` (advanced-search form ids). */
export const TM_SEARCH_POSITION_IDS: Record<string, number> = {
  GK: 1,
  CB: 3,
  LB: 4,
  RB: 5,
  DM: 6,
  CM: 7,
  RM: 8,
  LM: 9,
  AM: 10,
  LW: 11,
  RW: 12,
  SS: 13,
  CF: 14,
  ST: 14,
};

/** Confederation -> Transfermarkt `kontinent_id` (filters by the player's nationality). */
export const TM_SEARCH_CONFEDERATION_IDS: Record<string, number> = {
  AFC: 1,
  CAF: 2,
  CONCACAF: 3,
  CONMEBOL: 4,
  OFC: 5,
  UEFA: 6,
};

export const TM_SEARCH_FOOT_IDS: Record<string, number> = { left: 1, right: 2, both: 3 };

export interface TmSearchFilters {
  /** Position code, e.g. "CF" */
  position?: string;
  minAge?: number;
  maxAge?: number;
  /** Euros */
  minValue?: number;
  maxValue?: number;
  /** Centimetres. TM only applies height when BOTH bounds are sent, so a missing bound defaults to 150 / 250. A lower min (e.g. 140) makes TM include players with no height listed. */
  minHeight?: number;
  maxHeight?: number;
  confederation?: string;
  /** Transfermarkt country id (see tmCountries.ts) */
  countryId?: number;
  foot?: 'left' | 'right' | 'both';
  /** Contract expiring in this year */
  contractYear?: number;
  /** Players without a club */
  freeAgentsOnly?: boolean;
  /** Exclude loaned players */
  excludeLoans?: boolean;
  /** 1-based, max 10 */
  page?: number;
}

export interface TmSearchPlayer {
  playerUrl: string;
  playerName: string;
  playerImage: string;
  playerPosition: string;
  otherPositions: string[];
  playerAge: string;
  dateOfBirth: string;
  playerNationality: string;
  playerNationalities: string[];
  playerNationalityFlag: string;
  clubJoinedName: string | null;
  clubJoinedLogo: string | null;
  clubUrl: string | null;
  height: string;
  marketValue: string;
  contractExpires?: string;
}

export interface TmSearchResult {
  players: TmSearchPlayer[];
  /** Total hits reported by TM (already capped to 250 by TM). */
  totalHits: number;
  page: number;
  pageCount: number;
  hasMore: boolean;
  /** Players dropped from this page because TM lists no height for them (only when a height filter is set). */
  hiddenNoHeight?: number;
}

const clampInt = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = typeof n === 'number' ? n : parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(v)));
};

/** Build the form body TM expects. Exported for unit-style checks. */
export function buildSearchBody(f: TmSearchFilters): string {
  const p = new URLSearchParams();
  p.set('Detailsuche[genaue_suche]', '0');
  p.set('Detailsuche[jahrgang]', '1850');
  // Age is mandatory for TM to return results.
  p.set('Detailsuche[minAlter]', String(clampInt(f.minAge, 14, 50, 14)));
  p.set('Detailsuche[maxAlter]', String(clampInt(f.maxAge, 14, 50, 50)));
  p.set('Detailsuche[minMarktwert]', String(clampInt(f.minValue, 0, 200_000_000, 0)));
  p.set('Detailsuche[maxMarktwert]', String(clampInt(f.maxValue, 0, 200_000_000, 200_000_000)));

  if (f.minHeight || f.maxHeight) {
    p.set('Detailsuche[minGroesse]', String(clampInt(f.minHeight, 0, 250, 150)));
    p.set('Detailsuche[maxGroesse]', String(clampInt(f.maxHeight, 0, 250, 250)));
  }

  const posId = f.position ? TM_SEARCH_POSITION_IDS[f.position.trim().toUpperCase()] : undefined;
  if (posId) p.set('Detailsuche[hauptposition_id]', String(posId));

  if (f.countryId && f.countryId > 0) {
    p.set('Detailsuche[land_id]', String(Math.trunc(f.countryId)));
  } else {
    const confId = f.confederation ? TM_SEARCH_CONFEDERATION_IDS[f.confederation.toUpperCase()] : undefined;
    if (confId) p.set('Detailsuche[kontinent_id]', String(confId));
  }

  const footId = f.foot ? TM_SEARCH_FOOT_IDS[f.foot] : undefined;
  if (footId) p.set('Detailsuche[fuss_id]', String(footId));

  if (f.contractYear) p.append('Detailsuche[vertrag][]', String(clampInt(f.contractYear, 2000, 2100, new Date().getFullYear())));
  if (f.freeAgentsOnly) p.set('Detailsuche[vereinslos]', '1');
  if (f.excludeLoans) p.set('Detailsuche[leihen]', '1');
  return p.toString();
}

const HEADER_KEYS: Array<[RegExp, string]> = [
  [/^player$/i, 'player'],
  [/birth|age/i, 'dob'],
  [/^nat/i, 'nat'],
  [/^club$/i, 'club'],
  [/other position/i, 'otherPos'],
  [/height/i, 'height'],
  [/contract/i, 'contract'],
  [/market value/i, 'value'],
];

function parseTotalHits(html: string): number {
  const m = html.match(/Search results for players[\s\S]{0,40}?([\d.,]+)\s*Hits/i) || html.match(/([\d.,]+)\s*Hits/i);
  if (!m) return 0;
  return parseInt(m[1].replace(/[.,]/g, ''), 10) || 0;
}

export function parseSearchResults(html: string, page: number): TmSearchResult {
  const $ = cheerio.load(html);
  const totalHits = parseTotalHits(html);

  const table = $('table.items').first();
  const colIndex: Record<string, number> = {};
  table.find('thead th').each((i, th) => {
    const text = $(th).text().replace(/\s+/g, ' ').trim();
    for (const [re, key] of HEADER_KEYS) {
      if (re.test(text) && colIndex[key] === undefined) {
        colIndex[key] = i;
        break;
      }
    }
  });
  // Safe defaults for the standard layout (#, Player, DOB, Nat, Club, Other pos, Height, Value).
  const idx = (key: string, fallback: number) => (colIndex[key] !== undefined ? colIndex[key] : fallback);

  const players: TmSearchPlayer[] = [];
  table.find('tbody > tr').each((_, row) => {
    const tds = $(row).children('td');
    if (tds.length < 4) return;

    const inline = $(row).find('table.inline-table').first();
    const link = inline.find('a[href*="/profil/spieler/"]').first();
    const href = link.attr('href');
    if (!href) return;

    const img = inline.find('img').first();
    const rawImg = img.attr('data-src') || img.attr('src') || '';
    const playerName = (link.attr('title') || link.text() || img.attr('title') || '').trim();
    const posText = inline.find('tr').eq(1).text().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

    const dobText = tds.eq(idx('dob', 2)).text().replace(/\s+/g, ' ').trim();
    const ageMatch = dobText.match(/\((\d{1,2})\)/);

    const natCell = tds.eq(idx('nat', 3));
    const natImgs = natCell.find('img');
    const natNames: string[] = [];
    natImgs.each((_i, el) => {
      const n = ($(el).attr('title') || $(el).attr('alt') || '').trim();
      if (n) natNames.push(n);
    });
    const firstFlag = natImgs.first();
    const flagSrc = (firstFlag.attr('data-src') || firstFlag.attr('src') || '').replace('verysmall', 'head').replace('tiny', 'head');

    let clubName: string | null = null;
    let clubLogo: string | null = null;
    let clubUrl: string | null = null;
    if (colIndex.club !== undefined) {
      const a = tds.eq(colIndex.club).find('a[href*="/verein/"]').first();
      if (a.length) {
        clubName = (a.attr('title') || a.find('img').attr('title') || '').trim() || null;
        const cImg = a.find('img').first();
        const src = cImg.attr('data-src') || cImg.attr('src') || '';
        clubLogo = src ? makeAbsoluteUrl(src.replace('verysmall', 'tiny')) : null;
        const ch = a.attr('href');
        clubUrl = ch ? makeAbsoluteUrl(ch) : null;
      }
    }

    const otherPositions: string[] = [];
    if (colIndex.otherPos !== undefined) {
      tds.eq(colIndex.otherPos).find('span').each((_i, el) => {
        const t = $(el).text().trim();
        if (t) otherPositions.push(t);
      });
    }

    const contractText = colIndex.contract !== undefined ? tds.eq(colIndex.contract).text().replace(/\s+/g, ' ').trim() : '';
    const valueText = tds.eq(idx('value', tds.length - 1)).text().replace(/\s+/g, ' ').trim();

    players.push({
      playerUrl: makeAbsoluteUrl(href),
      playerName,
      // Upgrade the thumbnail to a larger portrait, same as the other screens.
      playerImage: makeAbsoluteUrl(rawImg.replace('/portrait/small/', '/portrait/big/')),
      playerPosition: convertPosition(posText) || posText,
      otherPositions,
      playerAge: ageMatch ? ageMatch[1] : '',
      dateOfBirth: dobText.replace(/\s*\(\d+\)\s*$/, ''),
      playerNationality: natNames[0] || '',
      playerNationalities: natNames,
      playerNationalityFlag: makeAbsoluteUrl(flagSrc),
      clubJoinedName: clubName,
      clubJoinedLogo: clubLogo,
      clubUrl,
      height: tds.eq(idx('height', 6)).text().replace(/\s+/g, ' ').trim(),
      marketValue: valueText,
      ...(contractText ? { contractExpires: contractText } : {}),
    });
  });

  const pageCount = Math.max(1, Math.min(10, Math.ceil(Math.min(totalHits, TM_SEARCH_MAX_HITS) / TM_SEARCH_PAGE_SIZE)));
  return { players, totalHits, page, pageCount, hasMore: page < pageCount };
}

export async function searchPlayersAdvanced(filters: TmSearchFilters): Promise<TmSearchResult> {
  const page = clampInt(filters.page, 1, 10, 1);
  const url = page > 1 ? `${SEARCH_URL}?page=${page}` : SEARCH_URL;
  const html = await fetchHtmlWithRetry(url, 2, { postBody: buildSearchBody(filters) });
  const result = parseSearchResults(html, page);
  // TM keeps players with an unknown height ("-") when a height range is applied. For a height
  // search they are noise, so drop them and report how many were hidden.
  if (filters.minHeight || filters.maxHeight) {
    const known = result.players.filter((p) => /\d/.test(p.height));
    result.hiddenNoHeight = result.players.length - known.length;
    result.players = known;
  }
  return result;
}
