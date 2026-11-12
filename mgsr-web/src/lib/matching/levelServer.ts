/**
 * Club-level data store + builders (server / worker only, Firebase Admin SDK).
 *
 *   MatchingClubLevels/{vereinId}   ClubLevel of every requesting club (squad + 3 seasons of real signings)
 *   MatchingData/clubStrength       { clubs: { [vereinId]: ClubStrength } } — any club we judged (one doc, cheap to read)
 *   MatchingData/leagues            { leagues: { [code]: { avg, uefaRank, at } } }
 *   MatchingData/playerLevels       { players: { [playerId]: PlayerLevelInfo } }
 *
 * Clients never read these collections directly — `/api/matching/data` serves them — so no Firestore rule change is needed.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { CLUB_LEVEL_VERSION, type ClubLevel, type ClubStrength, type PlayerLevelInfo } from './level';
import { currentSeasonId, scrapeArrivals, scrapeLeague, scrapeSquad, type LeagueData } from './levelScrape';

export const CLUB_LEVELS = 'MatchingClubLevels';
export const DATA = 'MatchingData';
export const STRENGTH_TTL_MS = 30 * 86_400_000;
export const CLUB_LEVEL_TTL_MS = 7 * 86_400_000;
const LEAGUE_TTL_MS = 30 * 86_400_000;

export interface LevelStore {
  strength: Record<string, ClubStrength>;
  leagues: Record<string, LeagueData & { at: number }>;
  players: Record<string, PlayerLevelInfo>;
}

export async function loadStore(db: Firestore): Promise<LevelStore> {
  const [s, l, p] = await Promise.all([
    db.collection(DATA).doc('clubStrength').get(),
    db.collection(DATA).doc('leagues').get(),
    db.collection(DATA).doc('playerLevels').get(),
  ]);
  return {
    strength: (s.data()?.clubs as LevelStore['strength']) ?? {},
    leagues: (l.data()?.leagues as LevelStore['leagues']) ?? {},
    players: (p.data()?.players as LevelStore['players']) ?? {},
  };
}

export async function saveStore(db: Firestore, store: LevelStore, parts: ('strength' | 'leagues' | 'players')[] = ['strength', 'leagues', 'players']) {
  const now = Date.now();
  await Promise.all([
    parts.includes('strength') && db.collection(DATA).doc('clubStrength').set({ clubs: store.strength, updatedAt: now }),
    parts.includes('leagues') && db.collection(DATA).doc('leagues').set({ leagues: store.leagues, updatedAt: now }),
    parts.includes('players') && db.collection(DATA).doc('playerLevels').set({ players: store.players, updatedAt: now }),
  ]);
}

/** Merge newly scraped strengths into the stored doc without overwriting newer entries (on-demand route vs worker). */
export async function mergeStrength(db: Firestore, fresh: Record<string, ClubStrength>) {
  if (!Object.keys(fresh).length) return;
  const ref = db.collection(DATA).doc('clubStrength');
  await db.runTransaction(async (tx) => {
    const cur = ((await tx.get(ref)).data()?.clubs as Record<string, ClubStrength>) ?? {};
    for (const [id, v] of Object.entries(fresh)) if (!cur[id] || cur[id]!.at < v.at) cur[id] = v;
    tx.set(ref, { clubs: cur, updatedAt: Date.now() });
  });
}

export interface Budget {
  /** Max Transfermarkt page fetches left. */
  fetches: number;
  /** Stop starting new fetches after this time (ms epoch). */
  deadline: number;
  log?: (m: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function canFetch(b: Budget) { return b.fetches > 0 && Date.now() < b.deadline; }
async function spend<T>(b: Budget, fn: () => Promise<T>): Promise<T | null> {
  if (!canFetch(b)) return null;
  b.fetches--;
  await sleep(500); // be gentle with Transfermarkt
  try { return await fn(); } catch (e) { b.log?.(`  fetch failed: ${e instanceof Error ? e.message : e}`); return null; }
}

/** Club strength (median squad value), from the store when fresh, else scraped. */
export async function ensureStrength(id: string, store: LevelStore, b: Budget, fresh?: Record<string, ClubStrength>): Promise<ClubStrength | null> {
  const cur = store.strength[id];
  if (cur && Date.now() - cur.at < STRENGTH_TTL_MS) return cur;
  const sq = await spend(b, () => scrapeSquad(id));
  if (!sq) return cur ?? null;
  const v: ClubStrength = { m: sq.median, n: sq.name, l: sq.league, at: Date.now() };
  store.strength[id] = v;
  if (fresh) fresh[id] = v;
  return v;
}

/** League average value + country, from the store when fresh (or when only the country is needed and known), else scraped. */
export async function ensureLeague(code: string, store: LevelStore, b: Budget): Promise<(LeagueData & { at: number }) | null> {
  const cur = store.leagues[code];
  if (cur && cur.country !== undefined && Date.now() - cur.at < LEAGUE_TTL_MS) return cur;
  const lg = await spend(b, () => scrapeLeague(code));
  if (!lg) return cur ?? null;
  store.leagues[code] = { ...lg, at: Date.now() };
  return store.leagues[code]!;
}

/** Full ClubLevel of a requesting club: squad, league average, and the last 3 seasons of real signings. */
export async function buildClubLevel(id: string, store: LevelStore, b: Budget, fresh?: Record<string, ClubStrength>): Promise<ClubLevel | null> {
  const sq = await spend(b, () => scrapeSquad(id));
  if (!sq) return null;
  const strength: ClubStrength = { m: sq.median, n: sq.name, l: sq.league, at: Date.now() };
  store.strength[id] = strength;
  if (fresh) fresh[id] = strength;

  const leagueAvg = sq.league ? (await ensureLeague(sq.league, store, b))?.avg ?? null : null;

  const cur = currentSeasonId();
  const seasons = [cur - 2, cur - 1, cur];
  const arrivals = (await Promise.all(seasons.map((s) => spend(b, () => scrapeArrivals(id, s))))).flatMap((a) => a ?? []);
  if (!arrivals.length) b.log?.(`  ${sq.name}: no arrivals parsed`);

  const signings = [];
  for (const a of arrivals) {
    let src: number | null = null;
    if (a.fromId) src = (await ensureStrength(a.fromId, store, b, fresh))?.m ?? null;
    signings.push({ mv: a.mv, src, pos: a.pos, age: a.age, season: a.season, league: a.fromLeague, country: a.fromCountry });
  }
  return {
    id, name: sq.name, league: sq.league, leagueAvg, squadMedian: sq.median, squadSize: sq.size,
    positionMedian: sq.positionMedian, signings, updatedAt: Date.now(), v: CLUB_LEVEL_VERSION,
  };
}
