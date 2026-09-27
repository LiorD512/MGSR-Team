import * as cheerio from 'cheerio';
import { handlePlayer } from '@/lib/transfermarkt';

const FLASHSCORE_BASE = 'https://www.flashscore.com';
const FLASHSCORE_SEARCH = 'https://s.livesport.services/api/v2/search/';
const FLASHSCORE_FEED = 'https://local-global.flashscore.ninja/2/x/feed';
const FLASHSCORE_FSIGN = 'SW9D1eZo';
const FLASHSCORE_TIME_ZONE = 'Asia/Jerusalem';

interface FlashscoreSearchResult {
  id: string;
  url: string;
  name: string;
  type?: { id?: number };
  sport?: { id?: number };
  gender?: { id?: number };
  defaultCountry?: { name?: string };
  country?: { name?: string };
}

export interface FlashscoreNextMatch {
  date: string;
  time: string;
  opponent: string;
  opponentLogo: string | null;
  venue: string | null;
  homeAway: 'home' | 'away';
  competition: string | null;
  round: string | null;
  sourceUrl: string;
  teamUrl: string;
}

function flashscoreHeaders(): HeadersInit {
  return {
    accept: 'application/json,text/plain,*/*',
    referer: `${FLASHSCORE_BASE}/`,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
  };
}

async function fetchFlashscore(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: flashscoreHeaders(),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Flashscore returned HTTP ${response.status}`);
  return response.text();
}

/* \u2500\u2500 Club-name matching \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Flashscore's team names diverge from Transfermarkt's in three ways that all
   have to be absorbed here: it abbreviates the least distinctive word
   ("Hapoel Be'er Sheva" \u2192 "H. Beer Sheva"), it transliterates differently
   ("Bnei Reineh" \u2192 "Bnei Raina", "Olympiacos" \u2192 "Olympiakos"), and it lists
   reserve/youth/women's sides under names that otherwise look identical to the
   senior club. Tokens are therefore compared phonetically and scored, never
   required to match verbatim \u2014 and non-senior sides are excluded by an explicit
   vocabulary rather than by dropping short tokens, which is what previously let
   "Panathinaikos B" pass as "Panathinaikos". */

/** Legal forms and society words that carry no identifying signal. */
const LEGAL_FORM_TOKENS = new Set([
  'fc', 'cf', 'sc', 'afc', 'ac', 'as', 'ss', 'ssc', 'sk', 'fk', 'nk', 'gnk', 'hnk', 'kv',
  'rsc', 'sv', 'tsv', 'vfb', 'vfl', 'cd', 'ud', 'ofk', 'pfc', 'tc', 'se', 'ec', 'if', 'ff',
  'bk', 'ik', 'aik', 'club', 'clube', 'calcio', 'and', 'the', 'de', 'do', 'da',
]);

/** Markers that identify a side as anything other than the senior men's team. */
const NON_SENIOR_TOKENS = new Set([
  'u15', 'u16', 'u17', 'u18', 'u19', 'u20', 'u21', 'u22', 'u23',
  'b', 'c', 'd', 'ii', 'iii', '2', '3', 'am',
  'w', 'women', 'feminine', 'femenino',
  '35', '45',
  'legends', 'allstars', 'stars', 'selection', 'xi', 'futsal', 'wpc', 'sfp',
  'reserves', 'reserve', 'youth', 'academy',
]);

const NON_SENIOR_SLUG = /-(inactive|legends|reserves|45|35|futsal)(?:-|$)/;

/** Hard aliases for clubs no algorithm can bridge from the Transfermarkt name. */
const CLUB_ALIASES = new Map<string, string>([
  ['red star belgrade', 'Crvena zvezda'],
  ['crvena zvezda belgrade', 'Crvena zvezda'],
]);

function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/** Apostrophes and periods are DELETED, not spaced: "Be'er"\u2192"beer", "H."\u2192"h". */
function normalizeName(value: string): string {
  return stripDiacritics(value)
    .replace(/[''`\u00b4.]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function nameTokens(value: string): string[] {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token && !LEGAL_FORM_TOKENS.has(token));
}

/** Collapse spelling variants so transliterations compare equal. */
function phoneticFold(token: string): string {
  return token
    .replace(/ph/g, 'f')
    .replace(/x/g, 'ks')
    .replace(/[cq]/g, 'k')
    .replace(/z/g, 's')
    .replace(/[yj]/g, 'i')
    .replace(/w/g, 'v')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1');
}

/** Levenshtein distance, abandoned once it exceeds `limit`. */
function withinEditDistance(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      rowBest = Math.min(rowBest, current[j]!);
    }
    if (rowBest > limit) return false;
    previous = current;
  }
  return previous[b.length]! <= limit;
}

function tokensEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  const foldedA = phoneticFold(a);
  const foldedB = phoneticFold(b);
  if (foldedA === foldedB) return true;
  const shorter = foldedA.length <= foldedB.length ? foldedA : foldedB;
  const longer = foldedA.length <= foldedB.length ? foldedB : foldedA;
  // Abbreviations: "h" for "hapoel", "din" for "dinamo".
  if (shorter.length <= 3 && longer.startsWith(shorter)) return true;
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  return shorter.length >= 4 && withinEditDistance(foldedA, foldedB, 1);
}

/** Dice coefficient over phonetically-compared tokens. */
function nameSimilarity(sourceName: string, requestedName: string): number {
  const source = nameTokens(sourceName);
  const requested = nameTokens(requestedName);
  if (source.length === 0 || requested.length === 0) return 0;

  const unclaimed = [...requested];
  let shared = 0;
  for (const token of source) {
    const hit = unclaimed.findIndex((candidate) => tokensEquivalent(token, candidate));
    if (hit !== -1) {
      shared++;
      unclaimed.splice(hit, 1);
    }
  }
  return (2 * shared) / (source.length + requested.length);
}

function isNonSeniorTeam(result: FlashscoreSearchResult): boolean {
  if (NON_SENIOR_SLUG.test(result.url || '')) return true;
  return nameTokens(result.name).some((token) => NON_SENIOR_TOKENS.has(token));
}

/* \u2500\u2500 Country matching \u2500\u2500 */

/** Transfermarkt \u2192 Flashscore country names that genuinely diverge. */
const COUNTRY_ALIASES = new Map<string, string>([
  ['turkiye', 'turkey'],
  ['korea south', 'south korea'],
  ['united states', 'usa'],
  ['hongkong', 'hong kong'],
  ['czechia', 'czech republic'],
  ['bosnia', 'bosnia and herzegovina'],
  ['n ireland', 'northern ireland'],
  ['uae', 'united arab emirates'],
  ['trinidad', 'trinidad and tobago'],
  ['dominican rep', 'dominican republic'],
  ['equat guinea', 'equatorial guinea'],
  ['central africa', 'central african republic'],
  ['congo', 'republic of the congo'],
  ['the gambia', 'gambia'],
  ['cote divoire', 'ivory coast'],
  ['republic of ireland', 'ireland'],
  ['chinese taipei', 'taiwan'],
  ['swaziland', 'eswatini'],
  ['macau', 'macao'],
  ['cabo verde', 'cape verde'],
]);

function normalizeCountry(value: string): string {
  const normalized = normalizeName(value);
  return COUNTRY_ALIASES.get(normalized) || normalized;
}

function countriesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return normalizeCountry(a) === normalizeCountry(b);
}

/** Query cascade \u2014 tried in order until one yields a usable candidate. */
function searchQueriesForClub(clubName: string): string[] {
  const alias = CLUB_ALIASES.get(normalizeName(clubName));
  const tokens = nameTokens(clubName);
  const queries = [
    alias,
    clubName,
    tokens.join(' '),
    clubName.replace(/k/gi, 'c'),
    clubName.replace(/c/gi, 'k'),
    tokens.slice(0, 2).join(' '),
    tokens.slice(-2).join(' '),
    [...tokens].sort((a, b) => b.length - a.length)[0],
  ];
  return Array.from(
    new Set(queries.filter((query): query is string => Boolean(query && query.trim().length >= 3)))
  );
}

function field(chunk: string, key: string): string {
  const match = chunk.match(new RegExp(`(?:^|¬)${key}÷([^¬~]*)`));
  return match?.[1]?.trim() || '';
}

function extractSummaryFixtures(html: string): string | null {
  const feedMatch = html.match(
    /initialFeeds\[\s*["']summary-fixtures["']\s*\]\s*=\s*\{\s*data\s*:\s*`([\s\S]*?)`/
  );
  if (feedMatch?.[1]) return feedMatch[1];

  const quotedFeedMatch = html.match(
    /initialFeeds\[\s*["']summary-fixtures["']\s*\]\s*=\s*\{\s*data\s*:\s*"((?:\\.|[^"\\])*)"/
  );
  return quotedFeedMatch?.[1]?.replace(/\\(["\\])/g, '$1') || null;
}

function formatFlashscoreDate(timestamp: number): { date: string; time: string } {
  const instant = new Date(timestamp * 1000);
  return {
    date: new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: FLASHSCORE_TIME_ZONE,
    }).format(instant),
    time: new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: FLASHSCORE_TIME_ZONE,
    }).format(instant),
  };
}

/** The home club's default stadium — a fallback only; it is wrong for neutral
    venues, so the per-match feed is consulted first. */
function extractDefaultVenue(html: string): string | null {
  const $ = cheerio.load(html);
  const text = $.root().text().replace(/\s+/g, ' ');
  const match = text.match(/Stadium:\s*(.+?)\s+Capacity:/i);
  return match?.[1]?.trim() || null;
}

function parseVenueFeed(payload: string): string | null {
  const info = new Map<string, string>();
  let key = '';
  for (const part of payload.split('¬')) {
    const separator = part.indexOf('÷');
    if (separator === -1) continue;
    const tag = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (tag === 'MIT') key = value;
    else if (tag === 'MIV' && key) {
      info.set(key, value);
      key = '';
    }
  }
  const stadium = info.get('VEN')?.trim();
  const town = info.get('TWN')?.trim();
  if (!stadium) return null;
  return town && !stadium.includes(town) ? `${stadium}, ${town}` : stadium;
}

/** Per-match venue — correct for away and neutral fixtures. */
async function fetchMatchVenue(matchId: string): Promise<string | null> {
  try {
    const response = await fetch(`${FLASHSCORE_FEED}/df_sui_1_${matchId}`, {
      headers: { ...flashscoreHeaders(), 'x-fsign': FLASHSCORE_FSIGN },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return parseVenueFeed(await response.text());
  } catch {
    return null;
  }
}

interface ScoredTeam {
  result: FlashscoreSearchResult;
  order: number;
  score: number;
}

/** Senior men's sides that plausibly are the requested club, in API order.
    Flashscore orders search results by prominence, so the first survivor is the
    senior first team — ranking by score instead would pick "Beer Sheva SC" over
    "H. Beer Sheva" and "Maccabi HaSharon Netanya" over "Netanya". */
function rankTeams(
  results: FlashscoreSearchResult[],
  clubName: string,
  clubCountry?: string
): ScoredTeam[] {
  const requestedName = CLUB_ALIASES.get(normalizeName(clubName)) || clubName;
  return results
    .map((result, order) => ({ result, order, score: 0 }))
    .filter(({ result }) => result.type?.id === 2 && result.sport?.id === 1)
    .filter(({ result }) => result.gender?.id === 1)
    .filter(({ result }) => !isNonSeniorTeam(result))
    .filter(({ result }) => {
      if (!clubCountry?.trim()) return true;
      const country = result.defaultCountry?.name || result.country?.name;
      return countriesMatch(country, clubCountry);
    })
    .map((candidate) => {
      const bySlug = nameSimilarity(candidate.result.url.replace(/-/g, ' '), requestedName);
      const byName = nameSimilarity(candidate.result.name, requestedName);
      return { ...candidate, score: Math.max(byName, bySlug) };
    })
    .filter(({ score }) => score >= 0.5)
    .sort((a, b) => a.order - b.order);
}

/** Competition stage, e.g. "Round 6" or "1/8-finals". */
function extractStage(html: string): string | null {
  const raw = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
  )?.[1];
  if (!raw) return null;
  const decoded = raw
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const split = decoded.lastIndexOf(' - ');
  if (split === -1) return null;
  return decoded.slice(split + 3).trim() || null;
}

export async function handleFlashscoreNextMatch(
  playerUrl: string | undefined,
  clubIdentity?: { name?: string; country?: string }
): Promise<{ match: FlashscoreNextMatch | null }> {
  let playerClub: { clubName?: string; clubCountry?: string } | undefined;
  if (playerUrl) {
    try {
      const player = await handlePlayer(playerUrl);
      playerClub = player.currentClub;
    } catch (error) {
      if (!clubIdentity?.name?.trim()) throw error;
    }
  }

  const clubName = clubIdentity?.name?.trim() || playerClub?.clubName?.trim();
  const clubCountry = clubIdentity?.country?.trim() || playerClub?.clubCountry?.trim();
  if (!clubName) return { match: null };

  // Walk the query cascade, stopping as soon as one surfaces a viable team.
  let team: FlashscoreSearchResult | null = null;
  for (const query of searchQueriesForClub(clubName)) {
    const searchUrl = `${FLASHSCORE_SEARCH}?q=${encodeURIComponent(query)}&lang-id=1&type-ids=2&sport-ids=1&project-id=2&project-type-id=1`;
    let results: FlashscoreSearchResult[];
    try {
      results = JSON.parse(await fetchFlashscore(searchUrl)) as FlashscoreSearchResult[];
    } catch {
      continue;
    }
    const ranked = rankTeams(results, clubName, clubCountry);
    if (ranked.length > 0) {
      team = ranked[0]!.result;
      break;
    }
  }
  if (!team) return { match: null };

  const teamUrl = `${FLASHSCORE_BASE}/team/${team.url}/${team.id}/`;
  const teamHtml = await fetchFlashscore(teamUrl);
  const fixtureFeed = extractSummaryFixtures(teamHtml);
  if (!fixtureFeed) return { match: null };

  const today = Math.floor(Date.now() / 1000);
  let competition: string | null = null;
  const candidates: Array<
    FlashscoreNextMatch & { timestamp: number; matchId: string; homeTeamUrl: string }
  > = [];

  for (const chunk of fixtureFeed.split('¬~')) {
    const competitionValue = field(chunk, 'ZA');
    if (competitionValue) competition = competitionValue;
    if (!field(chunk, 'AA')) continue;

    const timestamp = Number(field(chunk, 'AD'));
    const homeId = field(chunk, 'PX');
    const awayId = field(chunk, 'PY');
    const homeName = field(chunk, 'CX');
    const awayName = field(chunk, 'AF');
    if (!timestamp || timestamp < today || !homeId || !awayId || !homeName || !awayName) continue;

    const isHome = homeId === team.id;
    const isAway = awayId === team.id;
    if (!isHome && !isAway) continue;

    const { date, time } = formatFlashscoreDate(timestamp);
    const homeSlug = field(chunk, 'WU');
    const awaySlug = field(chunk, 'WV');
    const matchId = field(chunk, 'AA');
    const matchUrl = `${FLASHSCORE_BASE}/match/football/${homeSlug}-${homeId}/${awaySlug}-${awayId}/?mid=${matchId}`;
    const homeLogoCode = field(chunk, 'OA');
    const awayLogoCode = field(chunk, 'OB');
    const opponentLogoCode = isHome ? awayLogoCode : homeLogoCode;
    const opponentLogo = opponentLogoCode
      ? `https://static.flashscore.com/res/image/data/${opponentLogoCode}`
      : null;
    candidates.push({
      timestamp,
      date,
      time,
      opponent: isHome ? awayName : homeName,
      opponentLogo,
      venue: null,
      homeAway: isHome ? 'home' : 'away',
      competition,
      round: null,
      sourceUrl: matchUrl,
      teamUrl,
      matchId,
      homeTeamUrl: `${FLASHSCORE_BASE}/team/${homeSlug}/${homeId}/`,
    });
  }

  candidates.sort((a, b) => a.timestamp - b.timestamp);
  const next = candidates[0];
  if (!next) return { match: null };

  // Venue comes from the per-match feed so away and neutral games are right;
  // the home club's default stadium is only a fallback.
  const [feedVenue, matchHtml] = await Promise.all([
    fetchMatchVenue(next.matchId),
    fetchFlashscore(next.sourceUrl).catch(() => ''),
  ]);
  next.round = matchHtml ? extractStage(matchHtml) : null;
  next.venue = feedVenue;
  if (!next.venue) {
    const homeTeamHtml = await fetchFlashscore(next.homeTeamUrl).catch(() => '');
    next.venue = homeTeamHtml ? extractDefaultVenue(homeTeamHtml) : null;
  }

  const { timestamp: _timestamp, matchId: _matchId, homeTeamUrl: _homeTeamUrl, ...match } = next;
  return { match };
}