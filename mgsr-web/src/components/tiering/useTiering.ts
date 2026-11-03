'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { PlayerTierDoc, TierListResponse, TierMeta } from '@/lib/tiering/types';

export type BoardAction = 'mark' | 'unmark' | 'handled' | 'reopen';

/**
 * Client access to /api/tiering/*. Read-only by default — analysis happens in the background worker.
 * Results auto-refresh every 2 minutes.
 */
export function useTiering(enabled = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<PlayerTierDoc[]>([]);
  const [meta, setMeta] = useState<TierMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Player ids with a background re-analysis in flight (after marking). */
  const [analysing, setAnalysing] = useState<Set<string>>(new Set());
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

  const upsert = useCallback((item: PlayerTierDoc) => {
    setItems((prev) => [...prev.filter((x) => x.playerId !== item.playerId), item]);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !user) return;
    try {
      const data = (await call('/api/tiering')) as TierListResponse;
      if (!mounted.current) return;
      setItems(data.items);
      setMeta(data.meta);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(String((e as Error).message));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [call, enabled, user]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 2 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const rerunOne = useCallback(
    async (playerId: string) => {
      setAnalysing((s) => new Set(s).add(playerId));
      try {
        const r = (await call('/api/tiering/run', { method: 'POST', body: JSON.stringify({ playerId }) })) as { item: PlayerTierDoc };
        if (mounted.current) upsert(r.item);
      } finally {
        if (mounted.current)
          setAnalysing((s) => {
            const n = new Set(s);
            n.delete(playerId);
            return n;
          });
      }
    },
    [call, upsert]
  );

  const act = useCallback(
    async (playerId: string, action: BoardAction, note?: string) => {
      const r = (await call('/api/tiering/action', { method: 'POST', body: JSON.stringify({ playerId, action, note }) })) as {
        item: PlayerTierDoc;
      };
      upsert(r.item);
      // A new window target gets a fresh plan built around the window, in the background.
      if (action === 'mark') rerunOne(playerId).catch(() => {});
      return r.item;
    },
    [call, upsert, rerunOne]
  );

  return { items, meta, loading, error, analysing, refresh, rerunOne, act };
}
