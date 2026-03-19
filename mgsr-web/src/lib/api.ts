import { parseMarketValue } from '@/lib/releases';

// When empty, use same-origin API routes (Vercel). When set, use external backend (local dev).
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

async function fetchBackend(path: string, options?: RequestInit) {
  const url = BACKEND_URL ? `${BACKEND_URL}${path}` : path;
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res;
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error(
        BACKEND_URL
          ? 'Cannot reach backend. Run: cd mgsr-backend && npm run dev'
          : 'Cannot reach API. Try refreshing, or remove NEXT_PUBLIC_BACKEND_URL from .env.local to use built-in routes.'
      );
    }
    throw err;
  }
}

export interface SearchPlayer {
  tmProfile: string;
  playerImage?: string;
  playerName?: string;
  playerPosition?: string;
  playerAge?: string;
  playerValue?: string;
  nationality?: string;
  nationalityFlag?: string;
  currentClub?: string;
  currentClubLogo?: string;
}

export interface PlayerDetails {
  tmProfile: string;
  fullName?: string;
  height?: string;
  age?: string;
  positions?: string[];
  profileImage?: string;
  nationality?: string;
  nationalities?: string[];
  nationalityFlag?: string;
  nationalityFlags?: string[];
  contractExpires?: string;
  marketValue?: string;
  currentClub?: {
    clubName?: string;
    clubLogo?: string;
    clubTmProfile?: string;
    clubCountry?: string;
  };
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  foot?: string;
  instagramHandle?: string;
  instagramUrl?: string;
}

export type Confederation = 'PRIORITY' | 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'AFC' | 'CAF' | 'OFC';

export interface TransferWindow {
  countryName: string;
  countryCode: string;
  flagUrl?: string;
  confederation: Confederation;
  daysLeft: number | null;
}

export async function getTransferWindows(): Promise<TransferWindow[]> {
  const res = await fetchBackend('/api/transfermarkt/transfer-windows', {
    cache: 'no-store',
  });
  const data = await res.json();
  return data.windows || [];
}

export interface ClubSearchResult {
  clubName?: string;
  clubLogo?: string;
  clubTmProfile?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
}

export async function searchClubs(query: string): Promise<ClubSearchResult[]> {
  const res = await fetchBackend(
    `/api/transfermarkt/club-search?q=${encodeURIComponent(query)}`
  );
  const data = await res.json();
  return data.clubs || [];
}

/** Search IFA (football.org.il) clubs for youth requests. Returns clubs with clubCountry = Israel.
 * Uses same-origin fetch (Next.js API route) so it works regardless of BACKEND_URL.
 * The backend may not have SERPAPI_KEY; Next.js .env.local does. */
export async function searchIFAClubs(query: string): Promise<ClubSearchResult[]> {
  const res = await fetch(
    `/api/ifa/club-search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `IFA club search failed`);
  }
  const data = await res.json();
  return data.clubs || [];
}

export async function searchPlayers(query: string): Promise<SearchPlayer[]> {
  const res = await fetchBackend(
    `/api/transfermarkt/search?q=${encodeURIComponent(query)}`
  );
  const data = await res.json();
  return data.players || [];
}

export async function getPlayerDetails(url: string): Promise<PlayerDetails> {
  const res = await fetchBackend(
    `/api/transfermarkt/player?url=${encodeURIComponent(url)}`
  );
  return res.json();
}

export interface ReleasePlayer {
  playerImage?: string;
  playerName?: string;
  playerUrl?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  transferDate?: string;
  marketValue?: string;
}

export interface TeammateInfo {
  tmProfileUrl: string;
  playerName?: string | null;
  position?: string | null;
  matchesPlayedTogether: number;
  minutesTogether?: number | null;
}

export async function getTeammates(playerProfileUrl: string): Promise<TeammateInfo[]> {
  const res = await fetchBackend(
    `/api/transfermarkt/teammates?url=${encodeURIComponent(playerProfileUrl)}`
  );
  const data = await res.json();
  return data.teammates || [];
}

export interface PlayerPerformanceStats {
  season: string;
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
  club?: string;
}

/** Current European season start year (e.g. March 2025 → 2024 for 24/25, Aug 2025 → 2025 for 25/26). */
export function getCurrentSeasonYear(): number {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1–12
  return month >= 8 ? year : year - 1;
}

/** Current season label (e.g. "24/25", "25/26"). */
export function getCurrentSeasonLabel(): string {
  const y = getCurrentSeasonYear();
  return `${y}/${String(y + 1).slice(-2)}`;
}

export async function getPlayerPerformanceStats(
  profileUrl: string,
  seasonYear = getCurrentSeasonYear()
): Promise<PlayerPerformanceStats | null> {
  const res = await fetchBackend(
    `/api/transfermarkt/performance?url=${encodeURIComponent(profileUrl)}&season=${seasonYear}`
  );
  const data = await res.json();
  if (!data || (data.appearances === 0 && data.goals === 0 && data.assists === 0)) return null;
  return data;
}

/** Extract Transfermarkt player ID from profile URL for matching. */
export function extractPlayerIdFromUrl(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const parts = url.trim().split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]?.toLowerCase();
    if (p === 'spieler' || p === 'player') {
      const id = parts[i + 1];
      return id && /^\d+$/.test(id) ? id : null;
    }
  }
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

export async function getReleases(min = 0, max = 5000000, page = 1): Promise<ReleasePlayer[]> {
  const res = await fetchBackend(
    `/api/transfermarkt/releases?min=${min}&max=${max}&page=${page}`
  );
  const data = await res.json();
  return data.players || [];
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Value ranges used by the app for releases. Narrow ranges yield more complete
 * results from Transfermarkt than a single broad range.
 */
export const RELEASE_RANGES: { min: number; max: number }[] = [
  { min: 125000, max: 250000 },
  { min: 250001, max: 400000 },
  { min: 400001, max: 600000 },
  { min: 600001, max: 800000 },
  { min: 800001, max: 1000000 },
  { min: 1000001, max: 1200000 },
  { min: 1200001, max: 1400000 },
  { min: 1400001, max: 1600000 },
  { min: 1600001, max: 1800000 },
  { min: 1800000, max: 2000000 },
  { min: 2000000, max: 2200000 },
];

/**
 * Fetches all pages for a value range.
 * vertragslosespieler returns 50 players/page; filter by value client-side.
 * Stops when a page returns 0 raw players (past last page). Max 25 pages.
 */
export async function getReleasesAllPages(
  min: number,
  max: number,
  onProgress?: (page: number, total: number) => void
): Promise<ReleasePlayer[]> {
  const seen = new Set<string>();
  const all: ReleasePlayer[] = [];
  const maxPages = 25;

  for (let page = 1; page <= maxPages; page++) {
    const raw = await getReleases(min, max, page);
    for (const p of raw) {
      const v = parseMarketValue(p.marketValue);
      if (v >= min && v <= max && p.playerUrl && !seen.has(p.playerUrl)) {
        seen.add(p.playerUrl);
        all.push(p);
      }
    }
    onProgress?.(page, all.length);

    if (raw.length === 0) break;
    if (page < maxPages) await delay(300);
  }

  return all;
}

export type ReleasesProgress = { range: number; totalRanges: number; total: number };

/**
 * Fetches all free agents (for "All" preset).
 * Single pass over pages - much faster than 11 separate ranges.
 */
export async function getReleasesAllRanges(
  onProgress?: (progress: ReleasesProgress) => void
): Promise<ReleasePlayer[]> {
  return getReleasesAllPages(0, 50000000, (page, total) => {
    onProgress?.({ range: page, totalRanges: 25, total });
  });
}

// ─── Contract Finishers (contracts expiring in next transfer window) ─────────────
export interface ContractFinisherPlayer extends ReleasePlayer {
  clubJoinedLogo?: string;
  clubJoinedName?: string;
}

export interface ContractFinishersResponse {
  players: ContractFinisherPlayer[];
  windowLabel: 'Summer' | 'Winter';
}

export async function getContractFinishers(): Promise<ContractFinishersResponse> {
  const res = await fetchBackend('/api/transfermarkt/contract-finishers');
  const data = await res.json();
  return {
    players: data.players || [],
    windowLabel: data.windowLabel || 'Summer',
  };
}

export type ContractFinisherStreamEvent = {
  players: ContractFinisherPlayer[];
  windowLabel?: string;
  isLoading?: boolean;
  error?: string;
};

/**
 * Stream contract finishers via SSE – results appear as they load (like the app).
 * Calls onBatch with accumulated players after each batch; onDone when finished.
 */
// ─── Returnees (players returning from loan) ──────────────────────────────────
export interface ReturneePlayer extends ReleasePlayer {
  clubJoinedLogo?: string;
  clubJoinedName?: string;
}

const RETURNEE_LEAGUES: { leagueName: string; leagueUrl: string; flagUrl: string }[] = [
  { leagueName: 'Belgium - Jupiler Pro League', leagueUrl: 'https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1', flagUrl: 'https://flagcdn.com/w40/be.png' },
  { leagueName: 'Netherlands - Eredivisie', leagueUrl: 'https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1', flagUrl: 'https://flagcdn.com/w40/nl.png' },
  { leagueName: 'Portugal - Liga Portugal', leagueUrl: 'https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1', flagUrl: 'https://flagcdn.com/w40/pt.png' },
  { leagueName: 'Serbia - Super Liga Srbije', leagueUrl: 'https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1', flagUrl: 'https://flagcdn.com/w40/rs.png' },
  { leagueName: 'Greece - Super League 1', leagueUrl: 'https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1', flagUrl: 'https://flagcdn.com/w40/gr.png' },
  { leagueName: 'Sweden - Allsvenskan', leagueUrl: 'https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1', flagUrl: 'https://flagcdn.com/w40/se.png' },
  { leagueName: 'Poland - Ekstraklasa', leagueUrl: 'https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1', flagUrl: 'https://flagcdn.com/w40/pl.png' },
  { leagueName: 'Ukraine - Ukrainian Premier League', leagueUrl: 'https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1', flagUrl: 'https://flagcdn.com/w40/ua.png' },
  { leagueName: 'Portugal - Liga Portugal 2', leagueUrl: 'https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2', flagUrl: 'https://flagcdn.com/w40/pt.png' },
  { leagueName: 'Turkey - SuperLig', leagueUrl: 'https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1', flagUrl: 'https://flagcdn.com/w40/tr.png' },
  { leagueName: 'Switzerland - Super League', leagueUrl: 'https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1', flagUrl: 'https://flagcdn.com/w40/ch.png' },
  { leagueName: 'Austria - Bundesliga', leagueUrl: 'https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1', flagUrl: 'https://flagcdn.com/w40/at.png' },
  { leagueName: 'Czech Republic - Chance Liga', leagueUrl: 'https://www.transfermarkt.com/chance-liga/startseite/wettbewerb/TS1', flagUrl: 'https://flagcdn.com/w40/cz.png' },
  { leagueName: 'Romania - SuperLiga', leagueUrl: 'https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1', flagUrl: 'https://flagcdn.com/w40/ro.png' },
  { leagueName: 'Bulgaria - Efbet Liga', leagueUrl: 'https://www.transfermarkt.com/efbet-liga/startseite/wettbewerb/BU1', flagUrl: 'https://flagcdn.com/w40/bg.png' },
  { leagueName: 'Hungary - Top Division', leagueUrl: 'https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1', flagUrl: 'https://flagcdn.com/w40/hu.png' },
  { leagueName: 'Cyprus - Cyprus League', leagueUrl: 'https://www.transfermarkt.com/cyprus-league/startseite/wettbewerb/ZYP1', flagUrl: 'https://flagcdn.com/w40/cy.png' },
  { leagueName: 'Slovakia - Nike Liga', leagueUrl: 'https://www.transfermarkt.com/nike-liga/startseite/wettbewerb/SLO1', flagUrl: 'https://flagcdn.com/w40/sk.png' },
  { leagueName: 'Azerbaijan - Premyer Liqa', leagueUrl: 'https://www.transfermarkt.com/premyer-liqa/startseite/wettbewerb/AZ1', flagUrl: 'https://flagcdn.com/w40/az.png' },
  { leagueName: 'England - Championship', leagueUrl: 'https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2', flagUrl: 'https://flagcdn.com/w40/gb-eng.png' },
  { leagueName: 'Italy - Serie A', leagueUrl: 'https://www.transfermarkt.com/serie-a/startseite/wettbewerb/IT1', flagUrl: 'https://flagcdn.com/w40/it.png' },
  { leagueName: 'Italy - Serie B', leagueUrl: 'https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2', flagUrl: 'https://flagcdn.com/w40/it.png' },
  { leagueName: 'Germany - Bundesliga 2', leagueUrl: 'https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2', flagUrl: 'https://flagcdn.com/w40/de.png' },
  { leagueName: 'Spain - LaLiga', leagueUrl: 'https://www.transfermarkt.com/laliga/startseite/wettbewerb/ES1', flagUrl: 'https://flagcdn.com/w40/es.png' },
  { leagueName: 'Spain - LaLiga2', leagueUrl: 'https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2', flagUrl: 'https://flagcdn.com/w40/es.png' },
  { leagueName: 'France - Ligue 2', leagueUrl: 'https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2', flagUrl: 'https://flagcdn.com/w40/fr.png' },
  { leagueName: 'Turkey - 1.Lig', leagueUrl: 'https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2', flagUrl: 'https://flagcdn.com/w40/tr.png' },
];

export { RETURNEE_LEAGUES };

export type ReturneeStreamEvent = {
  players: ReturneePlayer[];
  loadedLeagues: number;
  totalLeagues: number;
  isLoading: boolean;
  error?: string;
};

export function streamReturnees(
  onBatch: (event: ReturneeStreamEvent) => void,
  onError?: (err: Error) => void
): () => void {
  const url = BACKEND_URL
    ? `${BACKEND_URL}/api/transfermarkt/returnees/stream`
    : '/api/transfermarkt/returnees/stream';
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as ReturneeStreamEvent;
      onBatch(data);
      if (data.isLoading === false) es.close();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      es.close();
    }
  };

  es.onerror = () => {
    es.close();
    onError?.(new Error('Stream connection failed'));
  };

  return () => es.close();
}

export function streamContractFinishers(
  onBatch: (event: ContractFinisherStreamEvent) => void,
  onError?: (err: Error) => void
): () => void {
  const url = BACKEND_URL
    ? `${BACKEND_URL}/api/transfermarkt/contract-finishers/stream`
    : '/api/transfermarkt/contract-finishers/stream';
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as ContractFinisherStreamEvent;
      onBatch(data);
      if (data.isLoading === false) es.close();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      es.close();
    }
  };

  es.onerror = () => {
    es.close();
    onError?.(new Error('Stream connection failed'));
  };

  return () => es.close();
}

/* ═══════════════════════════════════════════════════════════════════════
   NEWS & RUMORS client API helpers
   ═══════════════════════════════════════════════════════════════════════ */

export interface RumourItem {
  playerName: string;
  playerUrl: string;
  playerImage: string;
  position: string;
  age: number;
  nationality: string[];
  currentClub: string;
  currentClubUrl: string;
  currentClubImage: string;
  interestedClub: string;
  interestedClubUrl: string;
  interestedClubImage: string;
  interestedClubLeague: string;
  probability: number | null;
  marketValue: string;
  rumouredDate: string;
  source: 'rumour';
}

export interface LeagueNewsItem {
  headline: string;
  url: string;
  excerpt: string;
  imageUrl: string | null;
  date: string;
  leagueCode: string;
  leagueName: string;
  country: string;
  countryFlag: string;
  source: 'tm-news';
}

export interface GoogleNewsItem {
  headline: string;
  originalHeadline?: string;
  url: string;
  sourceName: string;
  date: string;
  leagueCode: string;
  leagueName: string;
  country: string;
  countryFlag: string;
  source: 'google-news';
}

export type NewsFeedItem = RumourItem | LeagueNewsItem | GoogleNewsItem;

export async function getRumours(pages = 15): Promise<RumourItem[]> {
  const res = await fetch(`/api/news/rumours?pages=${pages}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getLeagueNews(leagues?: string[]): Promise<LeagueNewsItem[]> {
  const q = leagues?.length ? `?leagues=${leagues.join(',')}` : '';
  const res = await fetch(`/api/news/league-news${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getGoogleNews(leagues?: string[], lang?: string): Promise<GoogleNewsItem[]> {
  const params = new URLSearchParams();
  if (leagues?.length) params.set('leagues', leagues.join(','));
  if (lang) params.set('lang', lang);
  const q = params.toString() ? `?${params}` : '';
  const res = await fetch(`/api/news/google-news${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Ligat Ha'al Foreign Arrivals Analysis ──────────────────────────────────

export interface LigatHaalTransferPlayer {
  playerName: string | null;
  playerAge: number | null;
  playerNationality: string | null;
  playerNationalityCode: string | null;
  playerNationalityFlag: string | null;
  marketValue: number;
  marketValueFormatted: string | null;
  playerPosition: string | null;
  clubJoinedName: string | null;
  clubJoinedLogo: string | null;
  previousClub: string | null;
  previousLeague: string | null;
  transferDate: string | null;
  transferFee: string | null;
  transferFeeValue: number;
  playerImage: string | null;
  tmProfile: string | null;
  source: 'transfer_arrival' | 'free_agent';
}

export interface LigatHaalAnalysisStats {
  totalCount: number;
  totalMarketValue: number;
  avgMarketValue: number;
  totalSpend: number;
  avgSpend: number;
  medianAge: number;
  countByCountry: Record<string, number>;
  countByPreviousLeague: Record<string, number>;
  valueByCountry: Record<string, number>;
}

export interface LigatHaalAnalysisResult {
  window: 'SUMMER_2025' | 'WINTER_2025_2026';
  players: LigatHaalTransferPlayer[];
  stats: LigatHaalAnalysisStats;
  cachedAt: string;
}

export async function getLigatHaalAnalysis(
  window: 'SUMMER_2025' | 'WINTER_2025_2026' = 'SUMMER_2025'
): Promise<LigatHaalAnalysisResult> {
  const res = await fetch(`/api/transfers/ligat-haal-analysis?window=${window}&useCache=false&_ts=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch Ligat Ha'al analysis: ${error}`);
  }
  return res.json();
}
