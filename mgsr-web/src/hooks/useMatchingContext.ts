'use client';

/**
 * Loads everything the request-matching engine needs besides players and requests (men platform):
 * active mandates, offers already made, Roster Intelligence form signals, requesting clubs' level profiles,
 * agents' match feedback, EU countries and the tunable weights (`Config/matchingWeights`).
 *
 * Slow / static inputs (club profiles, PlayerTiers, feedback, weights) are cached for the browser session so moving
 * between the board, a request page and a player page doesn't reload them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useEuCountries } from '@/hooks/useEuCountries';
import {
  resolveWeights, tmClubId, tmPlayerId,
  type FeedbackVerdict, type MatchContext, type MatchWeights, type OfferLite, type RecentGameLite,
} from '@/lib/matching/engine';
import type { ClubLevel, ClubStrength, PlayerLevelInfo } from '@/lib/matching/level';

// ── session caches ──
const clubLevelCache: Record<string, ClubLevel | null> = {};
const clubInFlight = new Set<string>();
let levelData: { clubStrength: Record<string, ClubStrength>; playerLevels: Record<string, PlayerLevelInfo>; leagues: Record<string, { country?: string | null }> } | null = null;
let levelPromise: Promise<void> | null = null;
let tiersCache: { signals: Record<string, string[]>; games: Record<string, RecentGameLite[]> } | null = null;
let tiersPromise: Promise<void> | null = null;
let weightsCache: MatchWeights | null = null;
let feedbackCache: Record<string, FeedbackVerdict> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function toMs(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return null;
}

export interface MatchingContextState {
  ctx: MatchContext;
  /** True while some requesting clubs' level profiles are still being fetched. */
  levelsLoading: boolean;
  setFeedback: (requestId: string, playerId: string, verdict: FeedbackVerdict | null, reason?: string) => Promise<void>;
}

export function useMatchingContext(clubUrls: (string | undefined)[]): MatchingContextState {
  const { user } = useAuth();
  const euCountries = useEuCountries();
  // bumped whenever a session cache (club profiles, tiers, weights, feedback) changes
  const [version, force] = useState(0);
  const [mandates, setMandates] = useState<Map<string, string[][]>>(new Map());
  const [offers, setOffers] = useState<OfferLite[]>([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  // Active mandates (live)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'PlayerDocuments'), where('type', '==', 'MANDATE')), (snap) => {
      const t = Date.now();
      const map = new Map<string, string[][]>();
      for (const d of snap.docs) {
        const data = d.data();
        if (data.expired === true) continue;
        const exp = toMs(data.expiresAt);
        if (exp != null && exp < t) continue;
        const leagues = ((data.validLeagues as string[] | undefined) ?? []).filter((x) => typeof x === 'string' && x.trim());
        const id = tmPlayerId(data.playerTmProfile as string | undefined);
        if (!id || !leagues.length) continue;
        map.set(id, [...(map.get(id) ?? []), leagues]);
      }
      setMandates(map);
    }, () => undefined);
  }, [user]);

  // Offers already made (live)
  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'PlayerOffers'), (snap) => {
      setOffers(snap.docs.map((d) => {
        const o = d.data();
        return { playerTmProfile: o.playerTmProfile, requestId: o.requestId, clubTmProfile: o.clubTmProfile, clubName: o.clubName } as OfferLite;
      }));
    }, () => undefined);
  }, [user]);

  // Roster Intelligence (form signals + recent games), weights, feedback — once per session
  useEffect(() => {
    if (!user) return;
    if (!tiersCache && !tiersPromise) {
      tiersPromise = getDocs(collection(db, 'PlayerTiers')).then((snap) => {
        const signals: Record<string, string[]> = {};
        const games: Record<string, RecentGameLite[]> = {};
        for (const d of snap.docs) {
          const data = d.data();
          const kinds = ((data.intel?.signals ?? []) as { kind?: string }[]).map((s) => s.kind).filter((k): k is string => !!k);
          if (kinds.length) signals[d.id] = kinds;
          if (Array.isArray(data.recentGames) && data.recentGames.length) games[d.id] = data.recentGames as RecentGameLite[];
        }
        tiersCache = { signals, games };
        notify();
      }).catch(() => { tiersCache = { signals: {}, games: {} }; notify(); });
    }
    if (!weightsCache) {
      getDoc(doc(db, 'Config', 'matchingWeights'))
        .then((s) => { weightsCache = resolveWeights(s.exists() ? (s.data() as Record<string, unknown>) : null); notify(); })
        .catch(() => { weightsCache = resolveWeights(null); notify(); });
    }
    if (!feedbackCache) {
      user.getIdToken()
        .then((token) => fetch('/api/matching/feedback', { headers: { Authorization: `Bearer ${token}` } }))
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((j: { items?: { requestId: string; playerId: string; verdict: FeedbackVerdict }[] }) => {
          const map: Record<string, FeedbackVerdict> = {};
          for (const it of j.items ?? []) map[`${it.requestId}_${it.playerId}`] = it.verdict;
          feedbackCache = map;
          notify();
        })
        .catch(() => { feedbackCache = {}; notify(); });
    }
  }, [user]);

  // Level data (weekly worker output) — once per session
  useEffect(() => {
    if (!user || levelData || levelPromise) return;
    levelPromise = user.getIdToken()
      .then((token) => fetch('/api/matching/data', { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { clubLevels?: Record<string, ClubLevel>; clubStrength?: Record<string, ClubStrength>; playerLevels?: Record<string, PlayerLevelInfo>; leagues?: Record<string, { country?: string | null }> } | null) => {
        for (const [id, lvl] of Object.entries(j?.clubLevels ?? {})) clubLevelCache[id] = lvl;
        levelData = { clubStrength: j?.clubStrength ?? {}, playerLevels: j?.playerLevels ?? {}, leagues: j?.leagues ?? {} };
        notify();
      })
      .catch(() => { levelData = { clubStrength: {}, playerLevels: {}, leagues: {} }; notify(); });
  }, [user]);

  // Requesting clubs the weekly worker hasn't processed yet → build on demand (small batches, cached)
  const urlKey = clubUrls.filter(Boolean).join('|');
  useEffect(() => {
    if (!user || !levelData) return;
    const missing = new Map<string, string>();
    for (const u of urlKey.split('|')) {
      const id = tmClubId(u);
      if (id && !(id in clubLevelCache) && !clubInFlight.has(id)) missing.set(id, u);
    }
    if (!missing.size) return;
    missing.forEach((_, id) => clubInFlight.add(id));
    const entries = Array.from(missing.entries());
    (async () => {
      const token = await user.getIdToken().catch(() => null);
      for (let i = 0; i < entries.length; i += 3) {
        const chunk = entries.slice(i, i + 3);
        try {
          if (!token) throw new Error('no token');
          const res = await fetch('/api/matching/club-profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ urls: chunk.map(([, u]) => u) }),
          });
          const j = res.ok ? ((await res.json()) as { clubLevels?: Record<string, ClubLevel | null> }) : {};
          for (const [id] of chunk) clubLevelCache[id] = j.clubLevels?.[id] ?? null;
        } catch {
          for (const [id] of chunk) clubLevelCache[id] = null;
        } finally {
          chunk.forEach(([id]) => clubInFlight.delete(id));
          notify();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` re-runs this once levelData has loaded
  }, [user, urlKey, version]);

  const setFeedback = useCallback(async (requestId: string, playerId: string, verdict: FeedbackVerdict | null, reason?: string) => {
    if (!user) return;
    const key = `${requestId}_${playerId}`;
    const prev = feedbackCache?.[key] ?? null;
    feedbackCache = { ...(feedbackCache ?? {}) };
    if (verdict) feedbackCache[key] = verdict; else delete feedbackCache[key];
    notify();
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/matching/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, playerId, verdict, reason }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      feedbackCache = { ...(feedbackCache ?? {}) };
      if (prev) feedbackCache[key] = prev; else delete feedbackCache[key];
      notify();
    }
  }, [user]);

  const levelsLoading = !levelData || urlKey.split('|').some((u) => { const id = tmClubId(u); return !!id && !(id in clubLevelCache); });

  const ctx = useMemo<MatchContext>(() => ({
    euCountries,
    mandatesByTmId: mandates,
    offers,
    clubLevels: { ...clubLevelCache },
    clubStrength: levelData?.clubStrength ?? {},
    playerLevels: levelData?.playerLevels ?? {},
    leagues: levelData?.leagues ?? {},
    signalsByPlayerId: tiersCache?.signals ?? {},
    gamesByPlayerId: tiersCache?.games ?? {},
    feedback: { ...(feedbackCache ?? {}) },
    weights: weightsCache ?? resolveWeights(null),
    now,
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks the module-level session caches
  [euCountries, mandates, offers, now, version]);

  return { ctx, levelsLoading, setFeedback };
}
