/**
 * Recent-games source for Roster Intelligence.
 *
 * Primary: the `recentGames` field already enriched onto the player doc by the refresh job.
 * Fallback: fetch live from Transfermarkt's ceapi (same proxy) if the doc has none or it's stale —
 * so the weekly agent works even before a refresh cycle has populated the field.
 */
import { fetchRecentGamesResolved, type RecentGame } from '@/lib/transfermarkt';
import { GAMES_TTL_MS } from './config';

export type GamesSource = 'doc' | 'fetched' | 'none';
/** Why we ended up with no games — surfaced in the sweep log so gaps are explainable. */
export type GamesReason = 'ok' | 'no_tmprofile' | 'fetch_empty' | 'stale_relinked' | 'none';

export interface GamesResult {
  games: RecentGame[];
  source: GamesSource;
  reason: GamesReason;
  /** Numeric TM id the fetched games actually came from (differs from stored when re-looked-up by name). */
  resolvedTmId?: string | null;
  /** True when stored id was stale and a name-search found the live one — surfaced for a "re-link" flag. */
  staleTmId?: boolean;
}

export async function getRecentGames(
  p: { tmProfile?: string; fullName?: string; recentGames?: RecentGame[]; recentGamesAt?: number },
  now: number,
  opts: { force?: boolean; allowFetch?: boolean }
): Promise<GamesResult> {
  const fresh = !!p.recentGames?.length && !!p.recentGamesAt && now - p.recentGamesAt < GAMES_TTL_MS;
  if (!opts.force && fresh) return { games: p.recentGames!, source: 'doc', reason: 'ok' };

  if (opts.allowFetch !== false) {
    if (!p.tmProfile && !p.fullName) {
      // can't fetch — but maybe the doc has stale games to fall back on
      if (p.recentGames?.length) return { games: p.recentGames, source: 'doc', reason: 'ok' };
      return { games: [], source: 'none', reason: 'no_tmprofile' };
    }
    const { games, resolvedId, staleId } = await fetchRecentGamesResolved({ tmProfile: p.tmProfile, fullName: p.fullName });
    if (games.length) {
      return {
        games,
        source: 'fetched',
        reason: staleId ? 'stale_relinked' : 'ok',
        resolvedTmId: resolvedId,
        staleTmId: staleId,
      };
    }
    // fetch + name search both yielded nothing recent (no live TM record, or long inactive)
    if (p.recentGames?.length) return { games: p.recentGames, source: 'doc', reason: 'ok' };
    return { games: [], source: 'none', reason: p.tmProfile ? 'fetch_empty' : 'no_tmprofile' };
  }

  if (p.recentGames?.length) return { games: p.recentGames, source: 'doc', reason: 'ok' };
  return { games: [], source: 'none', reason: p.tmProfile ? 'none' : 'no_tmprofile' };
}
