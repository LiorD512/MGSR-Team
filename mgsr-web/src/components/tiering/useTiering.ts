'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { PlayerTierDoc, TierListResponse, TierMeta } from '@/lib/tiering/types';

/** Read-only client for /api/tiering. The weekly background agent produces the data. */
export function useTiering(enabled = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<PlayerTierDoc[]>([]);
  const [meta, setMeta] = useState<TierMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/tiering', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as TierListResponse;
      if (!mounted.current) return;
      setItems(data.items);
      setMeta(data.meta);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(String((e as Error).message));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled, user]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { items, meta, loading, error, refresh };
}
