import type { RecentGame } from '@/lib/transfermarkt';

/** Client helper: fetch a player's recent games via the server route (which uses the TM proxy). */
export async function fetchRecentGamesForPlayer(tmProfile: string): Promise<RecentGame[]> {
  try {
    const res = await fetch(`/api/transfermarkt/recent-games?url=${encodeURIComponent(tmProfile)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const j = (await res.json()) as { games?: RecentGame[] };
    return Array.isArray(j.games) ? j.games : [];
  } catch {
    return [];
  }
}
