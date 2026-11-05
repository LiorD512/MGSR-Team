/**
 * Recent-games source for Roster Intelligence.
 *
 * Primary: the `recentGames` field already enriched onto the player doc by the refresh job.
 * Fallback: fetch live from Transfermarkt's ceapi (same proxy) if the doc has none or it's stale —
 * so the weekly agent works even before a refresh cycle has populated the field.
 */
import { fetchRecentGames, type RecentGame } from '@/lib/transfermarkt';
import { GAMES_TTL_MS } from './config';

export async function getRecentGames(
  p: { tmProfile?: string; recentGames?: RecentGame[]; recentGamesAt?: number },
  now: number,
  opts: { force?: boolean; allowFetch?: boolean }
): Promise<{ games: RecentGame[]; source: 'doc' | 'fetched' | 'none' }> {
  const fresh = !!p.recentGames?.length && !!p.recentGamesAt && now - p.recentGamesAt < GAMES_TTL_MS;
  if (!opts.force && fresh) return { games: p.recentGames!, source: 'doc' };

  if (opts.allowFetch !== false && p.tmProfile) {
    const games = await fetchRecentGames(p.tmProfile);
    if (games.length) return { games, source: 'fetched' };
  }
  // fall back to whatever the doc has, even if stale
  if (p.recentGames?.length) return { games: p.recentGames, source: 'doc' };
  return { games: [], source: 'none' };
}
