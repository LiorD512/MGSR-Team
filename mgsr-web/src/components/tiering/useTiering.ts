'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Focus, Level, PlayerTierDoc, TierListResponse } from '@/lib/tiering/types';

export interface RunProgress {
  done: number;
  total: number;
  running: boolean;
  error?: string;
}

/** Client access to /api/tiering/*. All calls carry the signed-in agent's ID token. */
export function useTiering(enabled = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<PlayerTierDoc[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RunProgress>({ done: 0, total: 0, running: false });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!user) throw new Error('Not signed in');
      const token = await user.getIdToken();
      const res = await fetch(path, {
        ...init,
        headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    [user]
  );

  const refresh = useCallback(async () => {
    if (!enabled || !user) return;
    try {
      const data = (await call('/api/tiering')) as TierListResponse;
      if (!mounted.current) return;
      setItems(data.items);
      setPending(data.pending);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(String((e as Error).message));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [call, enabled, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Analyse everyone who is stale, in small chunks, until done (or no progress). */
  const runAll = useCallback(
    async (totalHint: number) => {
      setProgress({ done: 0, total: totalHint, running: true });
      let done = 0;
      try {
        for (let i = 0; i < 60; i++) {
          const r = (await call('/api/tiering/run', { method: 'POST', body: JSON.stringify({ limit: 4 }) })) as {
            processed: number;
            remaining: number;
          };
          done += r.processed;
          if (mounted.current) setProgress({ done, total: Math.max(totalHint, done + r.remaining), running: true });
          if (r.remaining === 0 || r.processed === 0) break;
        }
        await refresh();
        if (mounted.current) setProgress((p) => ({ ...p, running: false }));
      } catch (e) {
        if (mounted.current) setProgress({ done, total: totalHint, running: false, error: String((e as Error).message) });
      }
    },
    [call, refresh]
  );

  const rerunOne = useCallback(
    async (playerId: string) => {
      await call('/api/tiering/run', { method: 'POST', body: JSON.stringify({ playerId }) });
      await refresh();
    },
    [call, refresh]
  );

  const setTags = useCallback(
    async (playerId: string, change: { level?: Level; focus?: Focus; note?: string; locked?: boolean }) => {
      const r = (await call('/api/tiering/set', { method: 'POST', body: JSON.stringify({ playerId, ...change }) })) as {
        item: PlayerTierDoc;
      };
      setItems((prev) => {
        const rest = prev.filter((x) => x.playerId !== playerId);
        return [...rest, r.item];
      });
      return r.item;
    },
    [call]
  );

  const accept = useCallback(
    async (opts: { playerIds?: string[]; minConfidence?: number }) => {
      const r = (await call('/api/tiering/accept', { method: 'POST', body: JSON.stringify(opts) })) as { accepted: number };
      await refresh();
      return r.accepted;
    },
    [call, refresh]
  );

  const dismiss = useCallback(
    async (ids: string[]) => {
      await call('/api/tiering/accept', { method: 'POST', body: JSON.stringify({ dismissIds: ids }) });
      await refresh();
    },
    [call, refresh]
  );

  return { items, pending, loading, error, progress, refresh, runAll, rerunOne, setTags, accept, dismiss };
}
