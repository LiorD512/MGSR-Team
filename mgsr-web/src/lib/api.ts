const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

async function fetchBackend(url: string, options?: RequestInit) {
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
        'Cannot reach backend. Make sure it is running: cd mgsr-backend && npm run dev'
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
  const res = await fetchBackend(`${BACKEND_URL}/api/transfermarkt/transfer-windows`);
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
    `${BACKEND_URL}/api/transfermarkt/club-search?q=${encodeURIComponent(query)}`
  );
  const data = await res.json();
  return data.clubs || [];
}

export async function searchPlayers(query: string): Promise<SearchPlayer[]> {
  const res = await fetchBackend(
    `${BACKEND_URL}/api/transfermarkt/search?q=${encodeURIComponent(query)}`
  );
  const data = await res.json();
  return data.players || [];
}

export async function getPlayerDetails(url: string): Promise<PlayerDetails> {
  const res = await fetchBackend(
    `${BACKEND_URL}/api/transfermarkt/player?url=${encodeURIComponent(url)}`
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
    `${BACKEND_URL}/api/transfermarkt/teammates?url=${encodeURIComponent(playerProfileUrl)}`
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
    `${BACKEND_URL}/api/transfermarkt/releases?min=${min}&max=${max}&page=${page}`
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
