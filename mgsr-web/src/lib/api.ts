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
  nationalityFlag?: string;
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
 * Stops when a page returns 0 players (past last page). Max 15 pages.
 * Note: Backend filters to "without club" only, so each page may have few items.
 */
export async function getReleasesAllPages(
  min: number,
  max: number,
  onProgress?: (page: number, total: number) => void
): Promise<ReleasePlayer[]> {
  const seen = new Set<string>();
  const all: ReleasePlayer[] = [];
  const maxPages = 15;

  for (let page = 1; page <= maxPages; page++) {
    const list = await getReleases(min, max, page);
    for (const p of list) {
      if (p.playerUrl && !seen.has(p.playerUrl)) {
        seen.add(p.playerUrl);
        all.push(p);
      }
    }
    onProgress?.(page, all.length);

    if (list.length === 0) break;
    if (page < maxPages) await delay(300);
  }

  return all;
}

export type ReleasesProgress = { range: number; totalRanges: number; total: number };

/**
 * Fetches releases from all narrow value ranges (same strategy as the app).
 * Yields more complete results than a single broad 0–50M range.
 */
export async function getReleasesAllRanges(
  onProgress?: (progress: ReleasesProgress) => void
): Promise<ReleasePlayer[]> {
  const seen = new Set<string>();
  const all: ReleasePlayer[] = [];
  const totalRanges = RELEASE_RANGES.length;

  for (let i = 0; i < totalRanges; i++) {
    const { min, max } = RELEASE_RANGES[i];
    const list = await getReleasesAllPages(min, max);
    for (const p of list) {
      if (p.playerUrl && !seen.has(p.playerUrl)) {
        seen.add(p.playerUrl);
        all.push(p);
      }
    }
    onProgress?.({ range: i + 1, totalRanges, total: all.length });
    if (i < totalRanges - 1) await delay(500);
  }

  return all;
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
