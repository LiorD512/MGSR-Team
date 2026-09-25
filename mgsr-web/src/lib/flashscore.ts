import * as cheerio from 'cheerio';
import { handlePlayer } from '@/lib/transfermarkt';

const FLASHSCORE_BASE = 'https://www.flashscore.com';
const FLASHSCORE_SEARCH = 'https://s.livesport.services/api/v2/search/';
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

function normalizeTeamName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bdinamo\b/gi, 'din')
    .replace(/q/gi, 'k')
    .replace(/\b(fc|cf|sc|afc)\b/gi, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function teamNameTokens(value: string): string[] {
  return normalizeTeamName(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !['and', 'the'].includes(token));
}

function teamNameMatches(sourceName: string, requestedName: string): boolean {
  const source = teamNameTokens(sourceName);
  const requested = teamNameTokens(requestedName);
  const requestedYouthLevel = requested.find((token) => /^u\d+$/.test(token));
  const sourceYouthLevel = source.find((token) => /^u\d+$/.test(token));
  if (requestedYouthLevel !== sourceYouthLevel) return false;
  const sharedTokens = source.filter((token) => requested.includes(token) && !/^u\d+$/.test(token));
  return sharedTokens.length > 0 && source.every((token) => requested.includes(token));
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

function extractVenue(html: string): string | null {
  const $ = cheerio.load(html);
  const text = $.root().text().replace(/\s+/g, ' ');
  const match = text.match(/Stadium:\s*(.+?)\s+Capacity:/i);
  return match?.[1]?.trim() || null;
}

function selectTeam(
  results: FlashscoreSearchResult[],
  clubName: string,
  clubCountry?: string
): FlashscoreSearchResult | null {
  const teams = results.filter((result) => result.type?.id === 2 && result.sport?.id === 1);
  const exactNameTeams = teams.filter(
    (result) => result.gender?.id === 1 && teamNameMatches(result.name, clubName)
  );
  if (!clubCountry) return null;

  const normalizedCountry = normalizeTeamName(clubCountry);
  const countryMatches = exactNameTeams.filter(
    (result) => normalizeTeamName(result.defaultCountry?.name || result.country?.name || '') === normalizedCountry
  );
  return countryMatches.length === 1 ? countryMatches[0] : null;
}

function extractTeamPageIdentity(html: string): { name: string; country: string } | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const identity = title.match(/^(.+?) live scores, results, fixtures(?:,.*?)? \| Football, (.+)$/i);
  return identity ? { name: identity[1], country: identity[2] } : null;
}

function verifyTeamPage(html: string, clubName: string, clubCountry?: string): boolean {
  const identity = extractTeamPageIdentity(html);
  if (!identity) return false;
  return (
    teamNameMatches(identity.name, clubName) &&
    (!clubCountry || normalizeTeamName(identity.country) === normalizeTeamName(clubCountry))
  );
}

function searchQueriesForClub(clubName: string): string[] {
  const simplified = clubName
    .replace(/\b(?:u\d+|ac|fc|cf|sc|afc)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(new Set([clubName, simplified].filter(Boolean)));
}

function extractRound(html: string): string | null {
  const description = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
  const descriptionMatch = description.match(/\bROUND\s+(\d+)\b/i);
  if (descriptionMatch?.[1]) return descriptionMatch[1];

  const text = cheerio.load(html).root().text().replace(/\s+/g, ' ');
  const numericMatch = text.match(/\bROUND\s+(\d+)\b/i);
  if (numericMatch?.[1]) return numericMatch[1];
  const namedMatch = text.match(/\bROUND\s+([A-Z][A-Z0-9-]*)\b/i);
  return namedMatch?.[1] || null;
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
  if (!clubName || !clubCountry) return { match: null };

  const searchResultsById = new Map<string, FlashscoreSearchResult>();
  for (const query of searchQueriesForClub(clubName)) {
    const searchUrl = `${FLASHSCORE_SEARCH}?q=${encodeURIComponent(query)}&lang-id=1&type-ids=1,2,3,4&project-id=2&project-type-id=1`;
    const results = JSON.parse(await fetchFlashscore(searchUrl)) as FlashscoreSearchResult[];
    for (const result of results) searchResultsById.set(result.id, result);
  }
  const searchResults = Array.from(searchResultsById.values());
  let team = selectTeam(searchResults, clubName, clubCountry);
  if (!team) {
    return { match: null };
  }

  const teamUrl = `${FLASHSCORE_BASE}/team/${team.url}/${team.id}/`;
  const teamHtml = await fetchFlashscore(teamUrl);
  if (!verifyTeamPage(teamHtml, clubName, clubCountry)) return { match: null };
  const fixtureFeed = extractSummaryFixtures(teamHtml);
  if (!fixtureFeed) return { match: null };

  const today = Math.floor(Date.now() / 1000);
  let competition: string | null = null;
  const candidates: Array<FlashscoreNextMatch & { timestamp: number; homeTeamUrl: string }> = [];

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
      homeTeamUrl: `${FLASHSCORE_BASE}/team/${homeSlug}/${homeId}/`,
    });
  }

  candidates.sort((a, b) => a.timestamp - b.timestamp);
  const next = candidates[0];
  if (!next) return { match: null };
  const matchHtml = await fetchFlashscore(next.sourceUrl);
  const homeTeamHtml = await fetchFlashscore(next.homeTeamUrl);
  next.venue = extractVenue(homeTeamHtml);
  next.round = extractRound(matchHtml);
  const { timestamp: _timestamp, homeTeamUrl: _homeTeamUrl, ...match } = next;
  return { match };
}