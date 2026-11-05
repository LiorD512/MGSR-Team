/**
 * Stats fetch for Roster Intelligence — our own scout server only. No external scrapers.
 */
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export async function fetchPlayerStats(tmProfile: string, ms = 15000): Promise<Record<string, unknown> | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${getScoutBaseUrl()}/player_stats?${new URLSearchParams({ url: tmProfile })}`, {
      signal: ctl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return data && data.api_matched ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
