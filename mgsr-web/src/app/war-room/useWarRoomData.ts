'use client';

/**
 * useWarRoomData — the single data/behaviour layer shared by all four War Room
 * routes (discovery / agent-network / ai-scout / find-next).
 *
 * This is a straight extraction of the state, Firestore listeners and handlers
 * that previously lived inside the monolithic /war-room page. The backend/data
 * layer (API routes, callables, scout libs) is untouched — this hook only
 * centralises the client logic so each route page stays thin.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { doc, onSnapshot, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import { callShortlistAdd, callScoutProfileFeedbackSet } from '@/lib/callables';
import { extractPlayerIdFromUrl, getPlayerDetails, getTeammates } from '@/lib/api';
import { type AgentId } from '@/lib/scoutAgentConfig';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';
import { aiScoutSearch, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import { buildPlayerKey, type DiversityMode } from '@/lib/discoveryDiversity';
import { appendSeenKeys, appendStoredKeys, getSeenKeys, getStoredKeys } from '@/lib/searchNoveltyMemory';
import {
  samePlayer,
  type DiscoveryCandidate,
  type ReportCache,
  type RosterPlayer,
  type RosterTeammateMatch,
} from './_shared';

const WAR_ROOM_SCOUT_MEMORY_SCOPE = 'war-room-ai-scout';
const WAR_ROOM_SCOUT_FRESHNESS_SCOPE = 'war-room-ai-scout:freshness';

export function useWarRoomData() {
  const { user } = useAuth();
  const { lang } = useLanguage();

  // Discovery
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetchIdRef = useRef(0);

  // Report cache (shared by discovery + ai-scout)
  const [reportCache, setReportCache] = useState<ReportCache>({});
  const [loadingReport, setLoadingReport] = useState<string | null>(null);

  // Shortlist / roster status
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterTmProfiles, setRosterTmProfiles] = useState<Set<string>>(new Set());
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  // Teammates (played with)
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);

  // Agent network
  const [scoutProfiles, setScoutProfiles] = useState<ScoutProfileResponse[]>([]);
  const [loadingScoutProfiles, setLoadingScoutProfiles] = useState(false);
  const [scoutLastRunAt, setScoutLastRunAt] = useState<number | null>(null);
  const [scoutAgentFilter, setScoutAgentFilter] = useState<AgentId | 'all'>('all');
  const [scoutPositionFilter, setScoutPositionFilter] = useState<string>('all');
  const [scoutFeedback, setScoutFeedback] = useState<Record<string, 'up' | 'down'>>({});

  // AI Scout search
  const [scoutQuery, setScoutQuery] = useState('');
  const [scoutResults, setScoutResults] = useState<ScoutPlayerSuggestion[]>([]);
  const [scoutInterpretation, setScoutInterpretation] = useState<string | null>(null);
  const [scoutSearching, setScoutSearching] = useState(false);
  const [scoutError, setScoutError] = useState<string | null>(null);
  const [scoutExpandedUrl, setScoutExpandedUrl] = useState<string | null>(null);
  const [addingScoutUrl, setAddingScoutUrl] = useState<string | null>(null);
  const [scoutSeenUrls, setScoutSeenUrls] = useState<string[]>([]);
  const [scoutSearchingOther, setScoutSearchingOther] = useState(false);
  const [scoutDiversityMode, setScoutDiversityMode] = useState<DiversityMode>('balanced');

  // ── Firestore listeners: shortlist + roster ──
  useEffect(() => {
    if (!user) return;
    const shortlistUnsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    });
    const rosterUnsub = onSnapshot(collection(db, 'Players'), (snap) => {
      const players = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer));
      setRosterPlayers(players);
      const urls = players.map((p) => p.tmProfile?.trim()).filter((u): u is string => !!u);
      setRosterTmProfiles(new Set(urls));
    });
    return () => {
      shortlistUnsub();
      rosterUnsub();
    };
  }, [user]);

  // ── Scout feedback listener (thumbs up/down) ──
  useEffect(() => {
    if (!user) return;
    const feedbackRef = doc(db, 'ScoutProfileFeedback', user.uid);
    const unsub = onSnapshot(feedbackRef, (snap) => {
      const data = snap.data();
      const fb = (data?.feedback as Record<string, 'up' | 'down' | { feedback: 'up' | 'down'; agentId: string }>) || {};
      const flat: Record<string, 'up' | 'down'> = {};
      for (const [k, v] of Object.entries(fb)) {
        flat[k] = typeof v === 'object' && v?.feedback ? v.feedback : (v as 'up' | 'down');
      }
      setScoutFeedback(flat);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (addError) {
      const id = setTimeout(() => setAddError(null), 4000);
      return () => clearTimeout(id);
    }
  }, [addError]);

  const setProfileFeedback = useCallback(
    async (profileId: string, feedback: 'up' | 'down', agentId: string) => {
      if (!user) return;
      await callScoutProfileFeedbackSet({ uid: user.uid, profileId, feedback, agentId });
      setScoutFeedback((prev) => ({ ...prev, [profileId]: feedback }));
    },
    [user]
  );

  // ── Discovery ──
  const fetchDiscovery = useCallback(async () => {
    const thisFetchId = ++fetchIdRef.current;
    setLoadingDiscovery(true);
    setError(null);
    try {
      const res = await fetch('/api/war-room/discovery', { signal: AbortSignal.timeout(120000) });
      const data = await res.json();
      if (thisFetchId !== fetchIdRef.current) return;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCandidates(data.candidates ?? []);
      setUpdatedAt(data.updatedAt ?? Date.now());
    } catch (err) {
      if (thisFetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Discovery failed');
      setCandidates([]);
    } finally {
      if (thisFetchId === fetchIdRef.current) setLoadingDiscovery(false);
    }
  }, []);

  // ── Agent network ──
  const fetchScoutProfiles = useCallback(async () => {
    setLoadingScoutProfiles(true);
    try {
      const params = new URLSearchParams();
      if (scoutAgentFilter !== 'all') params.set('agentId', scoutAgentFilter);
      const res = await fetch(`/api/war-room/scout-profiles?${params.toString()}`, { signal: AbortSignal.timeout(30000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setScoutProfiles(data.profiles ?? []);
      setScoutLastRunAt(data.lastRunAt ?? null);
    } catch {
      setScoutProfiles([]);
      setScoutLastRunAt(null);
    } finally {
      setLoadingScoutProfiles(false);
    }
  }, [scoutAgentFilter]);

  // ── Report ──
  const fetchReport = useCallback(
    async (playerUrl: string) => {
      if (reportCache[playerUrl]) return;
      setLoadingReport(playerUrl);
      try {
        const res = await fetch('/api/war-room/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_url: playerUrl, lang }),
          signal: AbortSignal.timeout(60000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Report failed');
        setReportCache((prev) => ({ ...prev, [playerUrl]: data }));
      } catch (err) {
        setReportCache((prev) => ({ ...prev, [playerUrl]: { error: err instanceof Error ? err.message : 'Failed' } }));
      } finally {
        setLoadingReport(null);
      }
    },
    [lang, reportCache]
  );

  // ── Teammates ──
  const fetchTeammates = useCallback(
    async (playerUrl: string) => {
      setLoadingTeammatesUrl(playerUrl);
      try {
        const teammates = await getTeammates(playerUrl);
        const rosterIds = new Set(rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean));
        const matches: RosterTeammateMatch[] = teammates
          .filter((tm) => rosterIds.has(extractPlayerIdFromUrl(tm.tmProfileUrl) ?? ''))
          .map((tm) => {
            const id = extractPlayerIdFromUrl(tm.tmProfileUrl);
            const rosterPlayer = rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === id);
            return rosterPlayer ? { player: rosterPlayer, matchesPlayedTogether: tm.matchesPlayedTogether } : null;
          })
          .filter((m): m is RosterTeammateMatch => m != null)
          .sort((a, b) => b.matchesPlayedTogether - a.matchesPlayedTogether);
        setTeammatesCache((prev) => ({ ...prev, [playerUrl]: matches }));
      } catch {
        setTeammatesCache((prev) => ({ ...prev, [playerUrl]: [] }));
      } finally {
        setLoadingTeammatesUrl(null);
      }
    },
    [rosterPlayers]
  );

  const toggleTeammates = useCallback((url: string) => {
    setExpandedTeammatesUrl((prev) => (prev === url ? null : url));
  }, []);

  const handleTeammatesClick = useCallback(
    (e: React.MouseEvent, playerUrl: string) => {
      e.stopPropagation();
      if (!playerUrl) return;
      toggleTeammates(playerUrl);
      if (!(playerUrl in teammatesCache) && !loadingTeammatesUrl) fetchTeammates(playerUrl);
    },
    [toggleTeammates, fetchTeammates, teammatesCache, loadingTeammatesUrl]
  );

  // ── Shortlist add (discovery candidate) ──
  const addToShortlist = useCallback(
    async (c: DiscoveryCandidate) => {
      if (!user || !c.transfermarktUrl) return;
      const url = c.transfermarktUrl;
      if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) {
        setAddError(lang === 'he' ? 'השחקן כבר במאגר' : 'Player already in roster');
        return;
      }
      setAddingUrl(url);
      setAddError(null);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const result = await callShortlistAdd({
          platform: 'men',
          tmProfileUrl: url,
          playerImage: c.profileImage ?? null,
          playerName: c.name ?? null,
          playerPosition: c.position ?? null,
          playerAge: c.age ?? null,
          playerNationality: c.nationality ?? null,
          clubJoinedName: c.club ?? null,
          marketValue: c.marketValue ?? null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
          ...(c.sourceAgentId && { sourceAgentId: c.sourceAgentId }),
          ...(c.sourceProfileId && { sourceProfileId: c.sourceProfileId }),
        });
        if (result.status === 'added') enrichShortlistInstagram(url);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setAddingUrl(null);
      }
    },
    [user, rosterTmProfiles, lang]
  );

  const addToShortlistFromProfile = useCallback(
    async (p: ScoutProfileResponse) => {
      const c: DiscoveryCandidate = {
        name: p.playerName,
        position: p.position,
        age: String(p.age),
        marketValue: p.marketValue,
        transfermarktUrl: p.tmProfileUrl,
        club: p.club,
        nationality: p.nationality ?? undefined,
        profileImage: p.profileImage ?? undefined,
        source: 'general',
        sourceLabel: 'AI Scout',
        sourceAgentId: p.agentId,
        sourceProfileId: p.id,
      };
      return addToShortlist(c);
    },
    [addToShortlist]
  );

  // ── Shortlist add (AI scout suggestion) ──
  const addScoutResultToShortlist = useCallback(
    async (s: ScoutPlayerSuggestion) => {
      const url = s.transfermarktUrl;
      if (!user || !url) return;
      if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) {
        setAddError(lang === 'he' ? 'השחקן כבר במאגר' : 'Player already in roster');
        return;
      }
      setAddingScoutUrl(url);
      setAddError(null);
      try {
        const account = await getCurrentAccountForShortlist(user);
        let entryFields: Record<string, unknown> = {
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        try {
          const details = await getPlayerDetails(url);
          entryFields = {
            ...entryFields,
            playerImage: details.profileImage ?? null,
            playerName: details.fullName ?? null,
            playerPosition: details.positions?.[0] ?? null,
            playerAge: details.age ?? null,
            playerNationality: details.nationality ?? null,
            playerNationalityFlag: details.nationalityFlag ?? null,
            clubJoinedName: details.currentClub?.clubName ?? null,
            marketValue: details.marketValue ?? null,
            instagramHandle: details.instagramHandle ?? null,
            instagramUrl: details.instagramUrl ?? null,
          };
        } catch {
          entryFields = {
            ...entryFields,
            playerName: s.name ?? null,
            playerPosition: s.position ?? null,
            playerAge: s.age ?? null,
            playerNationality: s.nationality ?? null,
            clubJoinedName: s.club ?? null,
            marketValue: s.marketValue ?? null,
          };
        }
        await callShortlistAdd({ platform: 'men', tmProfileUrl: url, ...entryFields });
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setAddingScoutUrl(null);
      }
    },
    [user, rosterTmProfiles, lang]
  );

  // ── AI Scout search ──
  const handleScoutExpand = useCallback(
    (url: string) => {
      if (scoutExpandedUrl === url) {
        setScoutExpandedUrl(null);
        return;
      }
      setScoutExpandedUrl(url);
      fetchReport(url);
    },
    [scoutExpandedUrl, fetchReport]
  );

  const handleScoutSearch = useCallback(async () => {
    const q = scoutQuery.trim();
    if (!q) return;
    const freshnessScope = user?.uid ? `${WAR_ROOM_SCOUT_FRESHNESS_SCOPE}:${user.uid}` : WAR_ROOM_SCOUT_FRESHNESS_SCOPE;
    const priorSeenKeys = Array.from(new Set([...getSeenKeys(WAR_ROOM_SCOUT_MEMORY_SCOPE, q), ...getStoredKeys(freshnessScope)]));
    const seed = `${new Date().toISOString().slice(0, 10)}-${user?.uid ?? 'anon'}-${q}`;
    setScoutSearching(true);
    setScoutError(null);
    setScoutResults([]);
    setScoutInterpretation(null);
    setScoutSeenUrls([]);
    try {
      const data = await aiScoutSearch(q, lang as 'en' | 'he', true, false, [], scoutDiversityMode, seed, priorSeenKeys, user?.uid);
      setScoutResults(data.players);
      setScoutInterpretation(data.interpretation ?? null);
      const urls = data.players.map((p) => p.transfermarktUrl).filter((u): u is string => !!u);
      setScoutSeenUrls(urls);
      const keys = data.players.map((p) => buildPlayerKey(p.transfermarktUrl, p.name)).filter(Boolean);
      appendSeenKeys(WAR_ROOM_SCOUT_MEMORY_SCOPE, q, keys);
      appendStoredKeys(freshnessScope, keys);
    } catch (err) {
      setScoutError(err instanceof Error ? err.message : String(err));
      setScoutResults([]);
    } finally {
      setScoutSearching(false);
    }
  }, [scoutQuery, lang, scoutDiversityMode, user?.uid]);

  const handleScoutSearchOther = useCallback(async () => {
    const q = scoutQuery.trim();
    if (!q || scoutSearchingOther) return;
    const freshnessScope = user?.uid ? `${WAR_ROOM_SCOUT_FRESHNESS_SCOPE}:${user.uid}` : WAR_ROOM_SCOUT_FRESHNESS_SCOPE;
    const memoryKeys = Array.from(new Set([...getSeenKeys(WAR_ROOM_SCOUT_MEMORY_SCOPE, q), ...getStoredKeys(freshnessScope)]));
    const currentKeys = scoutResults.map((p) => buildPlayerKey(p.transfermarktUrl, p.name)).filter(Boolean);
    const seed = `${new Date().toISOString().slice(0, 10)}-${user?.uid ?? 'anon'}-${q}`;
    setScoutSearchingOther(true);
    setScoutError(null);
    try {
      const data = await aiScoutSearch(q, lang as 'en' | 'he', false, false, scoutSeenUrls, scoutDiversityMode, seed, [...memoryKeys, ...currentKeys], user?.uid);
      setScoutResults(data.players);
      setScoutInterpretation(data.interpretation ?? null);
      const newUrls = data.players.map((p) => p.transfermarktUrl).filter((u): u is string => !!u);
      setScoutSeenUrls((prev) => [...prev, ...newUrls.filter((u) => !prev.includes(u))]);
      const newKeys = data.players.map((p) => buildPlayerKey(p.transfermarktUrl, p.name)).filter(Boolean);
      appendSeenKeys(WAR_ROOM_SCOUT_MEMORY_SCOPE, q, newKeys);
      appendStoredKeys(freshnessScope, newKeys);
    } catch (err) {
      setScoutError(err instanceof Error ? err.message : String(err));
    } finally {
      setScoutSearchingOther(false);
    }
  }, [scoutQuery, lang, scoutSearchingOther, scoutSeenUrls, scoutDiversityMode, scoutResults, user?.uid]);

  // ── Derived data ──
  const filteredCandidates = useMemo(
    () =>
      candidates.filter((c) => {
        const url = c.transfermarktUrl;
        if (!url) return true;
        if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
        if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
        return true;
      }),
    [candidates, rosterTmProfiles, shortlistUrls]
  );

  const scoutProfilesExcludingRosterAndShortlist = useMemo(
    () =>
      scoutProfiles.filter((p) => {
        const url = p.tmProfileUrl;
        if (!url) return true;
        if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
        if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
        return true;
      }),
    [scoutProfiles, rosterTmProfiles, shortlistUrls]
  );

  const avgScoutMatch = scoutResults.length
    ? Math.round(scoutResults.reduce((sum, p) => sum + (p.matchPercent ?? 0), 0) / scoutResults.length)
    : null;

  return {
    user,
    lang,
    // discovery
    candidates,
    filteredCandidates,
    loadingDiscovery,
    error,
    updatedAt,
    fetchDiscovery,
    // report
    reportCache,
    loadingReport,
    fetchReport,
    // shortlist/roster
    shortlistUrls,
    rosterTmProfiles,
    rosterPlayers,
    addingUrl,
    addError,
    setAddError,
    addToShortlist,
    addToShortlistFromProfile,
    addScoutResultToShortlist,
    addingScoutUrl,
    // teammates
    teammatesCache,
    loadingTeammatesUrl,
    expandedTeammatesUrl,
    handleTeammatesClick,
    // agent network
    scoutProfiles,
    scoutProfilesExcludingRosterAndShortlist,
    loadingScoutProfiles,
    scoutLastRunAt,
    scoutAgentFilter,
    setScoutAgentFilter,
    scoutPositionFilter,
    setScoutPositionFilter,
    scoutFeedback,
    setProfileFeedback,
    fetchScoutProfiles,
    // ai scout
    scoutQuery,
    setScoutQuery,
    scoutResults,
    scoutInterpretation,
    scoutSearching,
    scoutError,
    setScoutError,
    scoutExpandedUrl,
    handleScoutExpand,
    scoutSeenUrls,
    scoutSearchingOther,
    scoutDiversityMode,
    setScoutDiversityMode,
    handleScoutSearch,
    handleScoutSearchOther,
    avgScoutMatch,
  };
}
