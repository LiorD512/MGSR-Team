/**
 * Player Intelligence — Multi-source free football data aggregator.
 *
 * Sources (all free, publicly accessible):
 *  1. API-Football (api-football.com)        — StatsBomb xG/xA, advanced per-90, scouting percentiles
 *  2. FotMob (fotmob.com)      — Match ratings, season stats, career data
 *  3. Sofascore (sofascore.com) — Player ratings, recent form
 *  4. Capology (capology.com)   — Salary/wage data
 *  5. Wikipedia API             — Career summary, biographical context
 *  6. TM Injuries (transfermarkt) — Injury history, durability assessment
 *  7. ClubElo (clubelo.com)     — Club/league strength via Elo ratings
 *
 * Architecture:
 *  - Each source runs independently with its own error handling
 *  - All sources queried in parallel (Promise.allSettled)
 *  - Individual failures never block other sources
 *  - Consensus builder merges best available data into unified assessment
 *
 * Usage:
 *  - Sport Director: enriched Gemini evaluations with real analytics
 *  - Scout Search: progressive enrichment of results
 *  - Player Detail: on-demand full intelligence dossier
 */
import * as cheerio from 'cheerio';
import { fetchHtmlWithRetry, extractPlayerIdFromUrl } from './transfermarkt';

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════
const INTEL_TIMEOUT = 12_000; // 12s per source max
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ApiStatsIntel {
  url?: string;
  season?: string;
  xG?: number;
  xA?: number;
  npxG?: number;
  npxGPerShot?: number;
  sca?: number; // Shot-creating actions
  gca?: number; // Goal-creating actions
  progressivePasses?: number;
  progressiveCarries?: number;
  progressiveReceives?: number;
  passCompletion?: number; // %
  tacklesWon?: number;
  interceptions?: number;
  blocks?: number;
  clearances?: number;
  aerialWon?: number;
  aerialWonPct?: number;
  minutes90s?: number;
  scoutReport?: Record<string, number>; // metric → percentile 0-99
}

export interface FotMobIntel {
  id?: number;
  rating?: number;
  goals?: number;
  assists?: number;
  chancesCreated?: number;
  saves?: number;
  cleanSheets?: number;
  tackles?: number;
  interceptions?: number;
  minutesPlayed?: number;
  matchesPlayed?: number;
  topStats?: Record<string, string | number>;
}

export interface SofascoreIntel {
  id?: number;
  rating?: number;
  goals?: number;
  assists?: number;
  minutesPlayed?: number;
  recentRatings?: number[];
}

export interface CapologyIntel {
  weeklyWageEur?: number;
  annualSalaryEur?: number;
}

export interface WikipediaIntel {
  summary?: string;
  description?: string;
  image?: string;
}

export interface InjuryRecord {
  injury: string;
  from?: string;
  to?: string;
  daysMissed?: number;
  gamesMissed?: number;
}

export interface InjuryIntel {
  injuries: InjuryRecord[];
  totalDaysMissed: number;
  totalGamesMissed: number;
  injuryProne: boolean; // 3+ injuries in last 2 seasons
}

export interface ClubEloIntel {
  clubName?: string;
  elo?: number;
  rank?: number;
  country?: string;
  level?: string; // 1=elite, 2=strong, 3=mid, 4=low
}

export interface TheSportsDBIntel {
  id?: string;
  name?: string;
  team?: string;
  nationality?: string;
  position?: string;
  height?: string;
  weight?: string;
  dateBorn?: string;
  wage?: string;           // e.g. "£20,800,000"
  signingFee?: string;     // e.g. "€42.00m"
  agent?: string;
  description?: string;    // bio excerpt
  preferredFoot?: string;
  number?: string;
  honours?: string[];      // e.g. ["2019-2020 English Premier League", ...]
  formerTeams?: string[];  // e.g. ["Chelsea", "Roma", ...]
  image?: string;
  crossIds?: {
    transfermarkt?: string;
    espn?: string;
    apiFootball?: string;
    wikidata?: string;
  };
}

export interface IntelConsensus {
  xG?: number;
  xA?: number;
  rating?: number;
  progressiveActions?: number;
  defensiveActions?: number;
  passAccuracy?: number;
  estimatedWage?: string;
  injuryRisk?: 'low' | 'medium' | 'high';
  formTrend?: 'rising' | 'stable' | 'declining';
  clubStrength?: string;
  topPercentiles?: Record<string, number>;
  position?: string;
  height?: string;
  weight?: string;
  preferredFoot?: string;
  honourCount?: number;
  bio?: string;
}

export interface PlayerIntelDossier {
  playerName: string;
  queriedAt: string;
  sources: string[];
  stats?: ApiStatsIntel;
  fotmob?: FotMobIntel;
  sofascore?: SofascoreIntel;
  capology?: CapologyIntel;
  wikipedia?: WikipediaIntel;
  injuries?: InjuryIntel;
  clubElo?: ClubEloIntel;
  thesportsdb?: TheSportsDBIntel;
  consensus: IntelConsensus;
}

export type IntelSource =
  | 'stats'
  | 'fotmob'
  | 'sofascore'
  | 'capology'
  | 'wikipedia'
  | 'injuries'
  | 'clubelo'
  | 'thesportsdb';

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // Check if all parts of shorter name appear in longer name
  const partsA = na.split(/\s+/);
  const partsB = nb.split(/\s+/);
  const [shorter, longer] =
    partsA.length <= partsB.length ? [partsA, nb] : [partsB, na];
  return shorter.length >= 2 && shorter.every((p) => longer.includes(p));
}

async function intelFetch(
  url: string,
  opts: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      'User-Agent': UA,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(opts.headers as Record<string, string>),
    },
    signal: AbortSignal.timeout(INTEL_TIMEOUT),
  });
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 1: API-Football Stats
// Stats are populated via the scout server enrichment pipeline (API-Football v3 Pro).
// Direct web scraping is no longer used — all stats flow through the scout server.
// ═══════════════════════════════════════════════════════════════

export async function fetchApiStatsIntel(
  _playerName: string,
  _club?: string
): Promise<ApiStatsIntel | null> {
  // Stats are now populated by the scout server via API-Football v3 Pro.
  // This function is kept as a no-op for interface compatibility.
  return null;
}

// parseApiStatsResponse is no longer needed — stats come from scout server.
// Kept as a no-op stub for type compatibility.
function parseApiStatsResponse(
  _rawHtml: string,
  url: string
): ApiStatsIntel {
  return { url };
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 2: FotMob (match ratings + season stats)
// ═══════════════════════════════════════════════════════════════

export async function fetchFotMobIntel(
  playerName: string
): Promise<FotMobIntel | null> {
  try {
    // FotMob search/suggest API (works from server-side)
    const searchUrl = `https://www.fotmob.com/api/search/suggest?term=${encodeURIComponent(playerName)}&lang=en`;
    const searchRes = await intelFetch(searchUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!searchRes.ok) return null;

    const suggestData = await searchRes.json();

    // Response shape: [{ title: {key,value}, suggestions: [{type,id,name,teamName,...}] }]
    let playerId: number | null = null;
    let matchedName = '';

    for (const group of Array.isArray(suggestData)
      ? suggestData
      : []) {
      const suggestions = group?.suggestions || [];
      for (const s of Array.isArray(suggestions)
        ? suggestions
        : []) {
        if (s.type !== 'player') continue;
        const id = parseInt(s.id);
        if (isNaN(id)) continue;
        if (namesMatch(s.name || '', playerName)) {
          playerId = id;
          matchedName = s.name;
          break;
        }
        if (!playerId) {
          playerId = id;
          matchedName = s.name;
        }
      }
      if (playerId) break;
    }

    if (!playerId) return null;

    const intel: FotMobIntel = { id: playerId };

    // Try fetching full player data (may be blocked by Turnstile)
    try {
      const playerUrl = `https://www.fotmob.com/api/playerData?id=${playerId}`;
      const playerRes = await intelFetch(playerUrl, {
        headers: { Accept: 'application/json' },
      });

      if (playerRes.ok) {
        const pd = await playerRes.json();

        // Check for Turnstile block
        if (pd?.error || pd?.code) {
          console.log(
            `[Intel:FotMob] Player data blocked (${pd.code || pd.error}), using search data only`
          );
        } else {
          intel.rating =
            pd?.mainLeague?.stats?.rating?.value ??
            pd?.mainLeague?.stats?.rating ??
            pd?.primaryTeam?.seasonRating;

          // Parse stat sections
          const topStats: Record<string, string | number> = {};

          const parseStatsArray = (arr: unknown[]) => {
            for (const section of arr) {
              const items =
                (section as Record<string, unknown>)?.items ||
                (section as Record<string, unknown>)?.stats ||
                [];
              for (const item of Array.isArray(items)
                ? items
                : []) {
                const key = (
                  item.localizedTitleId ||
                  item.key ||
                  item.title ||
                  ''
                )
                  .toString()
                  .toLowerCase();
                const val =
                  item.statValue ?? item.value ?? item.per90;
                if (!key || val == null) continue;
                topStats[key] = val;

                if (
                  key.includes('goal') &&
                  !key.includes('assist') &&
                  !key.includes('expected') &&
                  !key.includes('against')
                )
                  intel.goals =
                    parseInt(String(val)) || intel.goals;
                if (key.includes('assist'))
                  intel.assists =
                    parseInt(String(val)) || intel.assists;
                if (key.includes('rating') && !intel.rating)
                  intel.rating =
                    parseFloat(String(val)) || undefined;
                if (
                  key.includes('chance') ||
                  key.includes('created')
                )
                  intel.chancesCreated =
                    parseInt(String(val)) ||
                    intel.chancesCreated;
                if (key.includes('tackle'))
                  intel.tackles =
                    parseInt(String(val)) || intel.tackles;
                if (key.includes('intercept'))
                  intel.interceptions =
                    parseInt(String(val)) ||
                    intel.interceptions;
                if (key.includes('save'))
                  intel.saves =
                    parseInt(String(val)) || intel.saves;
                if (key.includes('clean'))
                  intel.cleanSheets =
                    parseInt(String(val)) ||
                    intel.cleanSheets;
                if (
                  key.includes('appearance') ||
                  key.includes('match')
                )
                  intel.matchesPlayed =
                    parseInt(String(val)) ||
                    intel.matchesPlayed;
                if (key.includes('minute'))
                  intel.minutesPlayed =
                    parseInt(String(val)) ||
                    intel.minutesPlayed;
              }
            }
          };

          if (
            Array.isArray(pd?.statSeasons) &&
            pd.statSeasons.length > 0
          ) {
            const latest = pd.statSeasons[0];
            const groups =
              latest?.statsSection ||
              latest?.items ||
              latest?.groups ||
              [];
            if (Array.isArray(groups)) parseStatsArray(groups);
          }

          if (pd?.mainLeague?.stats) {
            const s = pd.mainLeague.stats;
            if (s.goals != null) intel.goals = s.goals;
            if (s.assists != null) intel.assists = s.assists;
            if (s.minutesPlayed != null)
              intel.minutesPlayed = s.minutesPlayed;
          }

          if (Object.keys(topStats).length > 0)
            intel.topStats = topStats;
        }
      }
    } catch {
      /* player data fetch failed — continue with search data */
    }

    return intel;
  } catch (err) {
    console.warn(
      '[Intel:FotMob]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 3: Sofascore (player rating + recent form)
// ═══════════════════════════════════════════════════════════════

export async function fetchSofascoreIntel(
  playerName: string,
  club?: string
): Promise<SofascoreIntel | null> {
  try {
    const searchUrl = `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(playerName)}&page=0`;
    const res = await intelFetch(searchUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const results = (data?.results || []).filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.type === 'player'
    );
    if (!results.length) return null;

    // Best match
    let best = results[0];
    for (const r of results) {
      if (namesMatch(r.entity?.name || '', playerName)) {
        if (
          club &&
          (r.entity?.team?.name || '')
            .toLowerCase()
            .includes(club.toLowerCase())
        ) {
          best = r;
          break;
        }
        best = r;
      }
    }

    const pid = best.entity?.id;
    if (!pid) return null;

    const intel: SofascoreIntel = { id: pid };

    // Get season statistics
    const statsUrl = `https://api.sofascore.com/api/v1/player/${pid}/statistics/seasons`;
    const statsRes = await intelFetch(statsUrl, {
      headers: { Accept: 'application/json' },
    });

    if (statsRes.ok) {
      const sd = await statsRes.json();
      const first = sd?.uniqueTournamentSeasons?.[0];
      if (first) {
        const tId = first.uniqueTournament?.id;
        const sId = first.seasons?.[0]?.id;
        if (tId && sId) {
          const detailUrl = `https://api.sofascore.com/api/v1/player/${pid}/unique-tournament/${tId}/season/${sId}/statistics/overall`;
          const dr = await intelFetch(detailUrl, {
            headers: { Accept: 'application/json' },
          });
          if (dr.ok) {
            const dd = await dr.json();
            const s = dd?.statistics;
            if (s) {
              intel.rating = s.rating;
              intel.goals = s.goals;
              intel.assists = s.assists;
              intel.minutesPlayed = s.minutesPlayed;
            }
          }
        }
      }
    }

    // Recent match ratings
    try {
      const eventsUrl = `https://api.sofascore.com/api/v1/player/${pid}/events/last/0`;
      const eventsRes = await intelFetch(eventsUrl, {
        headers: { Accept: 'application/json' },
      });
      if (eventsRes.ok) {
        const ed = await eventsRes.json();
        const events = ed?.events || [];
        // Sofascore embeds playerStatistics per event when available
        const ratings = events
          .slice(0, 5)
          .map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (e: any) =>
              e?.playerStatistics?.rating ?? e?.rating
          )
          .filter(
            (r: unknown) => typeof r === 'number' && r > 0
          ) as number[];
        if (ratings.length > 0) intel.recentRatings = ratings;
      }
    } catch {
      /* non-fatal */
    }

    return intel;
  } catch (err) {
    console.warn(
      '[Intel:Sofascore]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 4: Capology (salary/wage data)
// ═══════════════════════════════════════════════════════════════

export async function fetchCapologyIntel(
  playerName: string
): Promise<CapologyIntel | null> {
  try {
    // Try direct slug URL
    const slug = normalizeName(playerName).replace(/\s+/g, '-');
    const directUrl = `https://www.capology.com/player/${slug}/`;
    const directRes = await intelFetch(directUrl);

    let html: string;
    if (directRes.ok) {
      html = await directRes.text();
    } else {
      // Fallback: search page
      const searchRes = await intelFetch(
        `https://www.capology.com/search/?q=${encodeURIComponent(playerName)}`
      );
      if (!searchRes.ok) return null;
      const searchHtml = await searchRes.text();
      const $s = cheerio.load(searchHtml);
      const firstLink = $s('a[href*="/player/"]').first().attr('href');
      if (!firstLink) return null;
      const fullLink = firstLink.startsWith('http')
        ? firstLink
        : `https://www.capology.com${firstLink}`;
      const pageRes = await intelFetch(fullLink);
      if (!pageRes.ok) return null;
      html = await pageRes.text();
    }

    return parseCapologyPage(html);
  } catch (err) {
    console.warn(
      '[Intel:Capology]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

function parseCapologyPage(html: string): CapologyIntel | null {
  const $ = cheerio.load(html);
  const intel: CapologyIntel = {};

  // Look for salary data in the page
  // Capology shows "Gross Weekly" and "Gross Annual" in various table cells
  $('table tr, .player-salary, div[class*="salary"]').each(
    (_, el) => {
      const text = $(el).text();
      const moneyMatches = text.match(
        /[€£$][\d,]+(?:\.\d+)?(?:\s*[kmKM])?/g
      );
      if (!moneyMatches) return;

      const lc = text.toLowerCase();
      if (lc.includes('week') || lc.includes('weekly')) {
        const parsed = parseMoneyValue(moneyMatches[0]);
        if (parsed > 0) intel.weeklyWageEur = parsed;
      } else if (
        lc.includes('annual') ||
        lc.includes('year')
      ) {
        const parsed = parseMoneyValue(moneyMatches[0]);
        if (parsed > 0) intel.annualSalaryEur = parsed;
      }
    }
  );

  return intel.weeklyWageEur || intel.annualSalaryEur
    ? intel
    : null;
}

function parseMoneyValue(val: string): number {
  const s = val
    .replace(/[^0-9.,kmKM]/g, '')
    .toLowerCase();
  const n = parseFloat(s.replace(/,/g, ''));
  if (isNaN(n)) return 0;
  if (s.includes('m')) return n * 1_000_000;
  if (s.includes('k')) return n * 1_000;
  return n;
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 5: Wikipedia (career context)
// ═══════════════════════════════════════════════════════════════

export async function fetchWikipediaIntel(
  playerName: string
): Promise<WikipediaIntel | null> {
  try {
    const title = playerName.trim().replace(/\s+/g, '_');
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await intelFetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MGSRScout/1.0 (football scouting tool)',
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.type === 'disambiguation') return null;

    const extract = (data.extract || '') as string;
    // Verify it's about a footballer
    if (
      !extract.match(
        /football|soccer|midfielder|forward|defender|goalkeeper|striker|winger/i
      )
    ) {
      return null;
    }

    return {
      summary: extract.slice(0, 500),
      description: data.description,
      image: data.thumbnail?.source,
    };
  } catch (err) {
    console.warn(
      '[Intel:Wikipedia]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 6: TM Injuries (durability assessment)
// Uses existing TM scraping infrastructure
// ═══════════════════════════════════════════════════════════════

export async function fetchInjuryIntel(
  tmUrl: string
): Promise<InjuryIntel | null> {
  try {
    if (!tmUrl) return null;

    // Convert profile URL to injury URL:
    // /player-name/profil/spieler/12345 → /player-name/verletzungen/spieler/12345
    let injuryPath = tmUrl;
    if (injuryPath.includes('/profil/'))
      injuryPath = injuryPath.replace('/profil/', '/verletzungen/');
    else if (injuryPath.includes('/leistungsdaten/'))
      injuryPath = injuryPath.replace(
        '/leistungsdaten/',
        '/verletzungen/'
      );
    else {
      // Try to construct from player ID
      const id = extractPlayerIdFromUrl(tmUrl);
      if (!id) return null;
      const slug = tmUrl.split('/').filter(Boolean)[0] || 'player';
      injuryPath = `/${slug}/verletzungen/spieler/${id}`;
    }

    const fullUrl = injuryPath.startsWith('http')
      ? injuryPath
      : `https://www.transfermarkt.com${injuryPath}`;

    const html = await fetchHtmlWithRetry(fullUrl);
    const $ = cheerio.load(html);

    const injuries: InjuryRecord[] = [];
    let totalDays = 0;
    let totalGames = 0;

    // TM injury table: Season | Injury | From | To | Days | Games missed
    $('table.items tbody tr, div.responsive-table tbody tr').each(
      (_, row) => {
        const cols = $(row).find('td');
        if (cols.length < 4) return;

        const injury = cols.eq(1).text().trim();
        const from = cols.eq(2).text().trim();
        const to = cols.eq(3).text().trim();
        const days = parseInt(cols.eq(4).text().trim()) || 0;
        const games = parseInt(cols.eq(5).text().trim()) || 0;

        if (injury) {
          injuries.push({
            injury,
            from: from || undefined,
            to: to || undefined,
            daysMissed: days,
            gamesMissed: games,
          });
          totalDays += days;
          totalGames += games;
        }
      }
    );

    // Count injuries in last ~2 seasons (700 days)
    const now = Date.now();
    const recentInjuries = injuries.filter((i) => {
      if (!i.from) return false;
      const parts = i.from.split(/[/.]/);
      const d = new Date(
        parts.length === 3
          ? `${parts[2]}-${parts[1]}-${parts[0]}`
          : i.from
      );
      return (
        !isNaN(d.getTime()) && now - d.getTime() < 700 * 86400000
      );
    });

    return {
      injuries: injuries.slice(0, 20),
      totalDaysMissed: totalDays,
      totalGamesMissed: totalGames,
      injuryProne: recentInjuries.length >= 3,
    };
  } catch (err) {
    console.warn(
      '[Intel:TM-Injuries]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 7: ClubElo (club/league strength context)
// Free API: http://api.clubelo.com/
// ═══════════════════════════════════════════════════════════════

export async function fetchClubEloIntel(
  clubName: string
): Promise<ClubEloIntel | null> {
  try {
    if (!clubName) return null;

    // ClubElo API uses exact club names. Try common normalizations.
    const attempts = [
      clubName.trim(),
      clubName.trim().replace(/^FC\s+/i, ''),
      clubName.trim().replace(/\s+FC$/i, ''),
    ];

    for (const name of attempts) {
      const url = `http://api.clubelo.com/${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const text = await res.text();
      // ClubElo returns CSV: Rank, Club, Country, Level, Elo, From, To
      const lines = text.trim().split('\n');
      if (lines.length < 2) continue;

      // Get the most recent entry (last line)
      const lastLine = lines[lines.length - 1];
      const parts = lastLine.split(',');
      if (parts.length < 5) continue;

      const elo = parseFloat(parts[4]);
      if (isNaN(elo)) continue;

      // Classify club strength by Elo
      let level: string;
      if (elo >= 1800) level = 'elite';
      else if (elo >= 1600) level = 'strong';
      else if (elo >= 1400) level = 'mid';
      else level = 'low';

      return {
        clubName: parts[1] || name,
        elo: Math.round(elo),
        rank: parseInt(parts[0]) || undefined,
        country: parts[2] || undefined,
        level,
      };
    }

    return null;
  } catch (err) {
    console.warn(
      '[Intel:ClubElo]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SOURCE 8: TheSportsDB (free open database — bio, physical,
//   wage, honours, career history, cross-reference IDs)
// API docs: https://www.thesportsdb.com/api.php
// ═══════════════════════════════════════════════════════════════

export async function fetchTheSportsDBIntel(
  playerName: string
): Promise<TheSportsDBIntel | null> {
  try {
    // Step 1: Search for player
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(playerName)}`;
    const searchRes = await intelFetch(searchUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const players = searchData?.player;
    if (!Array.isArray(players) || players.length === 0) return null;

    // Match best player (soccer only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let best: any = null;
    for (const p of players) {
      if (p.strSport !== 'Soccer') continue;
      if (namesMatch(p.strPlayer || '', playerName)) {
        best = p;
        break;
      }
      if (!best) best = p;
    }
    if (!best) return null;

    const playerId = best.idPlayer;

    // Step 2: Full player lookup (more fields than search)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fullPlayer: any = best;
    try {
      const lookupUrl = `https://www.thesportsdb.com/api/v1/json/3/lookupplayer.php?id=${playerId}`;
      const lookupRes = await intelFetch(lookupUrl, {
        headers: { Accept: 'application/json' },
      });
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json();
        if (lookupData?.players?.[0]) fullPlayer = lookupData.players[0];
      }
    } catch { /* use search data */ }

    const intel: TheSportsDBIntel = {
      id: playerId,
      name: fullPlayer.strPlayer,
      team: fullPlayer.strTeam,
      nationality: fullPlayer.strNationality,
      position: fullPlayer.strPosition,
      height: fullPlayer.strHeight || undefined,
      weight: fullPlayer.strWeight || undefined,
      dateBorn: fullPlayer.dateBorn || undefined,
      wage: fullPlayer.strWage || undefined,
      signingFee: fullPlayer.strSigning || undefined,
      agent: fullPlayer.strAgent || undefined,
      preferredFoot: fullPlayer.strSide || undefined,
      number: fullPlayer.strNumber || undefined,
      image: fullPlayer.strCutout || fullPlayer.strThumb || undefined,
    };

    // Bio: first 400 chars of English description
    if (fullPlayer.strDescriptionEN) {
      intel.description = fullPlayer.strDescriptionEN.slice(0, 400);
    }

    // Cross-reference IDs
    const crossIds: TheSportsDBIntel['crossIds'] = {};
    if (fullPlayer.idTransferMkt) crossIds.transfermarkt = String(fullPlayer.idTransferMkt);
    if (fullPlayer.idESPN) crossIds.espn = String(fullPlayer.idESPN);
    if (fullPlayer.idAPIfootball) crossIds.apiFootball = String(fullPlayer.idAPIfootball);
    if (fullPlayer.idWikidata) crossIds.wikidata = String(fullPlayer.idWikidata);
    if (Object.keys(crossIds).length > 0) intel.crossIds = crossIds;

    // Step 3: Honours (parallel with former teams)
    const [honoursResult, formerResult] = await Promise.allSettled([
      // Honours
      intelFetch(
        `https://www.thesportsdb.com/api/v1/json/3/lookuphonours.php?id=${playerId}`,
        { headers: { Accept: 'application/json' } }
      ).then(async (r) => {
        if (!r.ok) return [];
        const d = await r.json();
        return (d?.honours || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (h: any) => `${h.strSeason || ''} ${h.strHonour || ''}`.trim()
        );
      }),
      // Former teams
      intelFetch(
        `https://www.thesportsdb.com/api/v1/json/3/lookupformerteams.php?id=${playerId}`,
        { headers: { Accept: 'application/json' } }
      ).then(async (r) => {
        if (!r.ok) return [];
        const d = await r.json();
        return (d?.formerteams || []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (t: any) => t.strFormerTeam || ''
        ).filter(Boolean);
      }),
    ]);

    if (honoursResult.status === 'fulfilled' && honoursResult.value.length > 0) {
      intel.honours = honoursResult.value;
    }
    if (formerResult.status === 'fulfilled' && formerResult.value.length > 0) {
      intel.formerTeams = formerResult.value;
    }

    return intel;
  } catch (err) {
    console.warn(
      '[Intel:TheSportsDB]',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// CONSENSUS BUILDER — merge all sources into unified assessment
// ═══════════════════════════════════════════════════════════════

function buildConsensus(dossier: PlayerIntelDossier): IntelConsensus {
  const c: IntelConsensus = {};

  // xG/xA: API-Football is authoritative (StatsBomb data)
  c.xG = dossier.stats?.xG;
  c.xA = dossier.stats?.xA;

  // Rating: prefer Sofascore (more precise), fallback FotMob
  c.rating = dossier.sofascore?.rating || dossier.fotmob?.rating;

  // Progressive actions: API-Football
  if (
    dossier.stats?.progressivePasses != null ||
    dossier.stats?.progressiveCarries != null
  ) {
    c.progressiveActions =
      (dossier.stats.progressivePasses || 0) +
      (dossier.stats.progressiveCarries || 0);
  }

  // Defensive actions: API-Football
  if (
    dossier.stats?.tacklesWon != null ||
    dossier.stats?.interceptions != null ||
    dossier.stats?.blocks != null
  ) {
    c.defensiveActions =
      (dossier.stats.tacklesWon || 0) +
      (dossier.stats.interceptions || 0) +
      (dossier.stats.blocks || 0);
  }

  // Pass accuracy: API-Football
  c.passAccuracy = dossier.stats?.passCompletion;

  // Wage: TheSportsDB first (reliable), fallback Capology
  c.estimatedWage = dossier.thesportsdb?.wage || (dossier.capology?.weeklyWageEur ? `€${dossier.capology.weeklyWageEur.toLocaleString()}/wk` : undefined);

  // Injury risk: TM injuries
  if (dossier.injuries) {
    c.injuryRisk = dossier.injuries.injuryProne
      ? 'high'
      : dossier.injuries.totalDaysMissed > 200
        ? 'medium'
        : 'low';
  }

  // Form trend from Sofascore recent ratings
  if (
    dossier.sofascore?.recentRatings &&
    dossier.sofascore.recentRatings.length >= 3
  ) {
    const ratings = dossier.sofascore.recentRatings;
    // Recent ratings come first in array (newest → oldest)
    const recentAvg =
      ratings.slice(0, Math.ceil(ratings.length / 2)).reduce((a, b) => a + b, 0) /
      Math.ceil(ratings.length / 2);
    const olderAvg =
      ratings.slice(Math.ceil(ratings.length / 2)).reduce((a, b) => a + b, 0) /
      (ratings.length - Math.ceil(ratings.length / 2));
    c.formTrend =
      recentAvg > olderAvg + 0.3
        ? 'rising'
        : recentAvg < olderAvg - 0.3
          ? 'declining'
          : 'stable';
  }

  // Club strength: ClubElo
  if (dossier.clubElo?.level) {
    c.clubStrength = `${dossier.clubElo.level} (Elo ${dossier.clubElo.elo})`;
  }

  // Top percentiles from API-Football scouting report
  if (dossier.stats?.scoutReport) {
    c.topPercentiles = Object.fromEntries(
      Object.entries(dossier.stats.scoutReport)
        .filter(([, v]) => v >= 60)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    );
  }

  // TheSportsDB enrichment
  if (dossier.thesportsdb) {
    const tsdb = dossier.thesportsdb;
    c.position = tsdb.position;
    c.height = tsdb.height;
    c.weight = tsdb.weight;
    c.preferredFoot = tsdb.preferredFoot;
    c.honourCount = tsdb.honours?.length;
    c.bio = tsdb.description?.slice(0, 200) || dossier.wikipedia?.description;
  } else if (dossier.wikipedia?.description) {
    c.bio = dossier.wikipedia.description;
  }

  return c;
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY: Gather complete intelligence dossier
// ═══════════════════════════════════════════════════════════════

/**
 * Gather a full intelligence dossier on a player from all free sources.
 * All sources run in parallel; individual failures don't block others.
 *
 * @param playerName - Player's full name
 * @param opts.club  - Current club name (improves search accuracy)
 * @param opts.tmUrl - Transfermarkt profile URL (for injury data)
 * @param opts.sources - Specific sources to query (default: all)
 */
export async function gatherPlayerIntel(
  playerName: string,
  opts?: {
    club?: string;
    tmUrl?: string;
    sources?: IntelSource[];
  }
): Promise<PlayerIntelDossier> {
  const club = opts?.club;
  const tmUrl = opts?.tmUrl;
  const active: Set<IntelSource> = new Set<IntelSource>(
    opts?.sources || ([
      'thesportsdb',
      'wikipedia',
      'clubelo',
      'fotmob',
      'injuries',
      'stats',
      'sofascore',
      'capology',
    ] as IntelSource[])
  );

  const dossier: PlayerIntelDossier = {
    playerName,
    queriedAt: new Date().toISOString(),
    sources: [],
    consensus: {},
  };

  const tasks: Promise<void>[] = [];

  if (active.has('stats')) {
    tasks.push(
      fetchApiStatsIntel(playerName, club).then((r) => {
        if (r) {
          dossier.stats = r;
          dossier.sources.push('stats');
        }
      })
    );
  }

  if (active.has('fotmob')) {
    tasks.push(
      fetchFotMobIntel(playerName).then((r) => {
        if (r) {
          dossier.fotmob = r;
          dossier.sources.push('fotmob');
        }
      })
    );
  }

  if (active.has('sofascore')) {
    tasks.push(
      fetchSofascoreIntel(playerName, club).then((r) => {
        if (r) {
          dossier.sofascore = r;
          dossier.sources.push('sofascore');
        }
      })
    );
  }

  if (active.has('capology')) {
    tasks.push(
      fetchCapologyIntel(playerName).then((r) => {
        if (r) {
          dossier.capology = r;
          dossier.sources.push('capology');
        }
      })
    );
  }

  if (active.has('wikipedia')) {
    tasks.push(
      fetchWikipediaIntel(playerName).then((r) => {
        if (r) {
          dossier.wikipedia = r;
          dossier.sources.push('wikipedia');
        }
      })
    );
  }

  if (active.has('injuries') && tmUrl) {
    tasks.push(
      fetchInjuryIntel(tmUrl).then((r) => {
        if (r) {
          dossier.injuries = r;
          dossier.sources.push('injuries');
        }
      })
    );
  }

  if (active.has('clubelo') && club) {
    tasks.push(
      fetchClubEloIntel(club).then((r) => {
        if (r) {
          dossier.clubElo = r;
          dossier.sources.push('clubelo');
        }
      })
    );
  }

  if (active.has('thesportsdb')) {
    tasks.push(
      fetchTheSportsDBIntel(playerName).then((r) => {
        if (r) {
          dossier.thesportsdb = r;
          dossier.sources.push('thesportsdb');
        }
      })
    );
  }

  await Promise.allSettled(tasks);

  dossier.consensus = buildConsensus(dossier);

  console.log(
    `[PlayerIntel] ${playerName}: ${dossier.sources.length}/${active.size} sources (${dossier.sources.join(', ')})`
  );

  return dossier;
}

// ═══════════════════════════════════════════════════════════════
// BATCH: Gather dossiers for multiple players (rate-limited)
// ═══════════════════════════════════════════════════════════════

/**
 * Gather intel for multiple players with rate limiting.
 * Processes in batches of 3 to avoid overwhelming external sources.
 */
export async function gatherBatchIntel(
  players: {
    name: string;
    club?: string;
    tmUrl?: string;
  }[],
  opts?: { sources?: IntelSource[]; batchSize?: number }
): Promise<Map<string, PlayerIntelDossier>> {
  const batchSize = opts?.batchSize || 3;
  const results = new Map<string, PlayerIntelDossier>();

  for (let i = 0; i < players.length; i += batchSize) {
    const batch = players.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((p) =>
        gatherPlayerIntel(p.name, {
          club: p.club,
          tmUrl: p.tmUrl,
          sources: opts?.sources,
        })
      )
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.set(batch[j].name, result.value);
      }
    }

    // Rate limit between batches
    if (i + batchSize < players.length) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════
// FORMAT: Create human-readable intel summary for Gemini prompts
// ═══════════════════════════════════════════════════════════════

/**
 * Format a dossier into a compact text summary for AI prompts.
 */
export function formatIntelForPrompt(
  dossier: PlayerIntelDossier
): string {
  const lines: string[] = [];

  // API-Football analytics
  if (dossier.stats) {
    const f = dossier.stats;
    const parts: string[] = [];
    if (f.xG != null) parts.push(`xG ${f.xG.toFixed(2)}`);
    if (f.xA != null) parts.push(`xA ${f.xA.toFixed(2)}`);
    if (f.npxG != null) parts.push(`npxG ${f.npxG.toFixed(2)}`);
    if (f.sca != null) parts.push(`SCA ${f.sca}`);
    if (f.gca != null) parts.push(`GCA ${f.gca}`);
    if (f.progressivePasses != null)
      parts.push(`ProgPass ${f.progressivePasses}`);
    if (f.progressiveCarries != null)
      parts.push(`ProgCarry ${f.progressiveCarries}`);
    if (f.passCompletion != null)
      parts.push(`Pass% ${f.passCompletion}%`);
    if (f.tacklesWon != null)
      parts.push(`TklW ${f.tacklesWon}`);
    if (f.interceptions != null)
      parts.push(`Int ${f.interceptions}`);
    if (f.blocks != null) parts.push(`Blk ${f.blocks}`);
    if (f.aerialWonPct != null)
      parts.push(`Aerial% ${f.aerialWonPct}%`);
    if (parts.length > 0) {
      lines.push(`API-Football: ${parts.join(' | ')}`);
    }

    // Scouting percentiles
    if (f.scoutReport && Object.keys(f.scoutReport).length > 0) {
      const top = Object.entries(f.scoutReport)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => `${k} ${v}th%`)
        .join(', ');
      lines.push(`Scouting: ${top}`);
    }
  }

  // FotMob / Sofascore ratings
  const rating =
    dossier.sofascore?.rating || dossier.fotmob?.rating;
  if (rating) {
    lines.push(`Rating: ${typeof rating === 'number' ? rating.toFixed(2) : rating}`);
  }

  // Form
  if (dossier.consensus.formTrend) {
    lines.push(`Form: ${dossier.consensus.formTrend}`);
  }

  // Salary
  if (dossier.thesportsdb?.wage) {
    lines.push(`Salary: ${dossier.thesportsdb.wage}`);
  } else if (dossier.capology?.weeklyWageEur) {
    lines.push(
      `Salary: €${Math.round(dossier.capology.weeklyWageEur).toLocaleString()}/week`
    );
  }

  // TheSportsDB profile
  if (dossier.thesportsdb) {
    const t = dossier.thesportsdb;
    const profileParts: string[] = [];
    if (t.position) profileParts.push(t.position);
    if (t.height) profileParts.push(t.height);
    if (t.weight) profileParts.push(t.weight);
    if (t.preferredFoot) profileParts.push(`Foot: ${t.preferredFoot}`);
    if (t.dateBorn) profileParts.push(`Born: ${t.dateBorn}`);
    if (t.nationality) profileParts.push(t.nationality);
    if (profileParts.length > 0) {
      lines.push(`Profile: ${profileParts.join(' | ')}`);
    }
    if (t.signingFee) lines.push(`Signing Fee: ${t.signingFee}`);
    if (t.agent) lines.push(`Agent: ${t.agent}`);
    if (t.honours && t.honours.length > 0) {
      lines.push(`Honours (${t.honours.length}): ${t.honours.slice(0, 5).join(', ')}`);
    }
    if (t.formerTeams && t.formerTeams.length > 0) {
      lines.push(`Career: ${t.formerTeams.join(' → ')} → ${t.team || '?'}`);
    }
  }

  // Injuries
  if (dossier.injuries) {
    const i = dossier.injuries;
    lines.push(
      `Injuries: ${i.injuries.length} total, ${i.totalDaysMissed}d missed${i.injuryProne ? ' INJURY PRONE' : ''}`
    );
  }

  // Club strength
  if (dossier.clubElo) {
    lines.push(
      `Club: ${dossier.clubElo.clubName} Elo ${dossier.clubElo.elo} (${dossier.clubElo.level})`
    );
  }

  // Bio context (Wikipedia fallback if no TheSportsDB)
  if (dossier.thesportsdb?.description) {
    lines.push(`Bio: ${dossier.thesportsdb.description.slice(0, 200)}`);
  } else if (dossier.wikipedia?.description) {
    lines.push(`Bio: ${dossier.wikipedia.description}`);
  }

  return lines.length > 0
    ? `--- INTEL DOSSIER (${dossier.sources.join('+')}) ---\n${lines.join('\n')}`
    : '';
}
