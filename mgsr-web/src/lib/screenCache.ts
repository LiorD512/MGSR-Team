/**
 * In-memory cache for screen data. Persists across navigation so returning
 * to a screen shows cached data immediately while fresh data loads.
 */

const cache = new Map<string, unknown>();

function cacheKey(screen: string, userId?: string | null): string {
  return userId ? `${screen}_${userId}` : screen;
}

export function getScreenCache<T>(screen: string, userId?: string | null): T | undefined {
  return cache.get(cacheKey(screen, userId)) as T | undefined;
}

export function setScreenCache<T>(screen: string, data: T, userId?: string | null): void {
  cache.set(cacheKey(screen, userId), data);
}

export function clearScreenCache(screen: string, userId?: string | null): void {
  cache.delete(cacheKey(screen, userId));
}
