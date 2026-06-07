import { buildQueryFingerprint } from '@/lib/discoveryDiversity';

interface StoredQueryMemory {
  updatedAt: number;
  keys: string[];
}

interface StoredScopeMemory {
  [queryFingerprint: string]: StoredQueryMemory;
}

function getStorageKey(scope: string): string {
  return `mgsr:novelty:${scope}`;
}

function readScope(scope: string): StoredScopeMemory {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getStorageKey(scope));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredScopeMemory;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeScope(scope: string, value: StoredScopeMemory): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(scope), JSON.stringify(value));
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

export function getSeenKeys(scope: string, query: string, ttlMs = 14 * 24 * 60 * 60 * 1000): string[] {
  const fingerprint = buildQueryFingerprint(query);
  if (!fingerprint) return [];
  const scopeData = readScope(scope);
  const entry = scopeData[fingerprint];
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > ttlMs) return [];
  return entry.keys ?? [];
}

export function appendSeenKeys(
  scope: string,
  query: string,
  keys: string[],
  maxKeys = 600,
): string[] {
  const fingerprint = buildQueryFingerprint(query);
  if (!fingerprint || keys.length === 0) return [];
  const scopeData = readScope(scope);
  const current = scopeData[fingerprint]?.keys ?? [];
  const merged = [...current];
  for (const key of keys) {
    if (key && !merged.includes(key)) merged.push(key);
  }
  const trimmed = merged.slice(-maxKeys);
  scopeData[fingerprint] = {
    keys: trimmed,
    updatedAt: Date.now(),
  };
  writeScope(scope, scopeData);
  return trimmed;
}

export function resetSeenKeys(scope: string, query: string): void {
  const fingerprint = buildQueryFingerprint(query);
  if (!fingerprint) return;
  const scopeData = readScope(scope);
  delete scopeData[fingerprint];
  writeScope(scope, scopeData);
}
