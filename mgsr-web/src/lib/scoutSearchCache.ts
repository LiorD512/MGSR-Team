/**
 * In-memory cache for scout recruitment results.
 * TTL: 5 minutes. Reduces latency for repeated/similar queries.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: { results: Record<string, unknown>[] };
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(params: Record<string, string | number | undefined>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ''}`)
    .join('&');
  return sorted;
}

export function getCached(
  params: Record<string, string | number | undefined>
): { results: Record<string, unknown>[] } | null {
  const key = cacheKey(params);
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(
  params: Record<string, string | number | undefined>,
  data: { results: Record<string, unknown>[] }
): void {
  const key = cacheKey(params);
  cache.set(key, {
    data,
    expiresAt: Date.now() + TTL_MS,
  });
  // Limit cache size (e.g. 100 entries)
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}
