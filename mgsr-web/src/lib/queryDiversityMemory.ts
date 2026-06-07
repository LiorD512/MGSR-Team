import { buildQueryFingerprint } from '@/lib/discoveryDiversity';

interface QueryMemoryEntry {
  updatedAt: number;
  servedKeys: string[];
}

const QUERY_MEMORY = new Map<string, QueryMemoryEntry>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_QUERIES = 300;
const MAX_KEYS_PER_QUERY = 1200;

function cleanup(now: number): void {
  QUERY_MEMORY.forEach((entry, fingerprint) => {
    if (now - entry.updatedAt > TTL_MS) {
      QUERY_MEMORY.delete(fingerprint);
    }
  });

  if (QUERY_MEMORY.size <= MAX_QUERIES) return;
  const sorted = Array.from(QUERY_MEMORY.entries()).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const overflow = QUERY_MEMORY.size - MAX_QUERIES;
  for (let i = 0; i < overflow; i += 1) {
    const key = sorted[i]?.[0];
    if (key) QUERY_MEMORY.delete(key);
  }
}

export function getRecentServedKeysForQuery(query: string, maxRecentKeys = 180): string[] {
  const now = Date.now();
  cleanup(now);
  const fingerprint = buildQueryFingerprint(query);
  if (!fingerprint) return [];
  const entry = QUERY_MEMORY.get(fingerprint);
  if (!entry) return [];
  if (now - entry.updatedAt > TTL_MS) {
    QUERY_MEMORY.delete(fingerprint);
    return [];
  }
  if (maxRecentKeys <= 0) return [];
  return entry.servedKeys.slice(-maxRecentKeys);
}

export function recordServedKeysForQuery(query: string, keys: string[]): void {
  const now = Date.now();
  cleanup(now);
  const fingerprint = buildQueryFingerprint(query);
  if (!fingerprint || keys.length === 0) return;

  const existing = QUERY_MEMORY.get(fingerprint);
  const merged = existing ? [...existing.servedKeys, ...keys.filter(Boolean)] : keys.filter(Boolean);
  const trimmed = merged.slice(-MAX_KEYS_PER_QUERY);

  QUERY_MEMORY.set(fingerprint, {
    updatedAt: now,
    servedKeys: trimmed,
  });
}
