/**
 * Stats fetch for Roster Intelligence — our own scout server only. No external scrapers.
 *
 * The scout server is a free Render instance that can cold-start / 502 under load, so we retry
 * transient failures with backoff and distinguish "server was down" from "player genuinely not in the DB".
 */
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export interface StatsResult {
  /** The stats object when the player was found; null when not found or unavailable. */
  data: Record<string, unknown> | null;
  /** 'ok' = matched, 'not_found' = server answered but no such player, 'unavailable' = server error/timeout. */
  status: 'ok' | 'not_found' | 'unavailable';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchPlayerStats(tmProfile: string, perTryMs = 20000, tries = 3): Promise<StatsResult> {
  const url = `${getScoutBaseUrl()}/player_stats?${new URLSearchParams({ url: tmProfile })}`;
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), perTryMs);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      const ct = res.headers.get('content-type') ?? '';
      // Cold-start / proxy error pages (502/503/504) come back as HTML — treat as transient.
      if (res.status >= 500 || !ct.includes('application/json')) {
        if (attempt < tries - 1) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        return { data: null, status: 'unavailable' };
      }
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (data && data.api_matched) return { data, status: 'ok' };
      return { data: null, status: 'not_found' }; // server answered, player simply not in the stats DB
    } catch {
      if (attempt < tries - 1) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return { data: null, status: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }
  return { data: null, status: 'unavailable' };
}

/** Wake the scout server once before a big sweep so the first calls don't all hit a cold start. */
export async function warmScoutServer(ms = 30000): Promise<void> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    await fetch(`${getScoutBaseUrl()}/health`, { signal: ctl.signal, cache: 'no-store' });
  } catch {
    /* ignore */
  } finally {
    clearTimeout(timer);
  }
}
