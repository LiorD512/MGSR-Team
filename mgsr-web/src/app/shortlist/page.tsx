'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { doc, onSnapshot, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, where, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { getTeammates, extractPlayerIdFromUrl, getPlayerDetails, getPlayerPerformanceStats, getCurrentSeasonLabel } from '@/lib/api';
import { SHORTLISTS_COLLECTIONS, PLAYERS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import { matchingRequestsForPlayer, type ClubRequest } from '@/lib/requestMatcher';
import {
  computeContactScore,
  computeValueChangePercent,
  isFreeAgent,
  monthsUntilContractExpiry,
  daysSince,
} from '@/lib/shortlistIntelligence';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';

interface ShortlistNote {
  text: string;
  createdBy?: string;
  createdByHebrewName?: string;
  createdById?: string;
  createdAt?: number;
}

interface ShortlistEntry {
  tmProfileUrl: string;
  addedAt?: number;
  playerImage?: string;
  playerName?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalities?: string[];
  clubJoinedName?: string;
  transferDate?: string;
  marketValue?: string;
  addedByAgentId?: string;
  addedByAgentName?: string;
  addedByAgentHebrewName?: string;
  notes?: ShortlistNote[];
  lastRefreshedAt?: number;
  marketValueHistory?: { value?: string; date?: number }[];
  contractExpires?: string;
  positions?: string[];
  foot?: string;
  salaryRange?: string;
  transferFee?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
}

interface RosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
  age?: string;
  tmProfile?: string;
}

interface RosterTeammateMatch {
  player: RosterPlayer;
  matchesPlayedTogether: number;
}

function womanToRosterPlayer(w: WomanPlayer): RosterPlayer {
  return {
    id: w.id,
    fullName: w.fullName,
    profileImage: w.profileImage,
    positions: w.positions ?? [],
    marketValue: w.marketValue,
    currentClub: w.currentClub,
    age: w.age,
    tmProfile: w.fmInsideUrl ?? w.soccerDonnaUrl ?? undefined,
  };
}

function youthToRosterPlayer(y: YouthPlayer): RosterPlayer {
  return {
    id: y.id,
    fullName: y.fullName,
    profileImage: y.profileImage,
    positions: y.positions ?? [],
    marketValue: y.marketValue,
    currentClub: y.currentClub,
    age: y.age,
    tmProfile: y.ifaUrl ?? undefined,
  };
}

export default function ShortlistPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const { platform } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shortlistsCollection = SHORTLISTS_COLLECTIONS[platform];
  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';
  const euCountries = useEuCountries();
  const shortlistCacheKey = user ? `shortlist_${platform}_${user.uid}` : undefined;
  const cached = shortlistCacheKey ? getScreenCache<ShortlistEntry[]>(shortlistCacheKey) : undefined;
  const [entries, setEntries] = useState<ShortlistEntry[]>(cached ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [highlightedUrl, setHighlightedUrl] = useState<string | null>(null);
  const [scoreHoverUrl, setScoreHoverUrl] = useState<string | null>(null);
  const [scoreTooltipData, setScoreTooltipData] = useState<{
    contactScore: number;
    matchCount: number;
    freeAgent: boolean;
    contractMonths: number | null;
    valueChangePct: number | null;
    hasMinutesBonus?: boolean;
    hasProductiveBonus?: boolean;
  } | null>(null);
  const scoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [scoreTooltipRect, setScoreTooltipRect] = useState<{ top: number; left: number } | null>(null);

  // Update tooltip position when open — keep fully in viewport
  useEffect(() => {
    if (!scoreHoverUrl || !scoreButtonRef.current) {
      setScoreTooltipRect(null);
      return;
    }
    const updatePos = () => {
      const btn = scoreButtonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const tw = 280;
      const th = 120;
      const pad = 8;
      let left = rect.left + (rect.width / 2) - (tw / 2);
      left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
      let top = rect.bottom + 8;
      if (top + th > window.innerHeight - pad) top = rect.top - th - 8;
      setScoreTooltipRect({ top, left });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [scoreHoverUrl]);

  // Close score tooltip when clicking outside
  useEffect(() => {
    if (!scoreHoverUrl) return;
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-score-explanation]')) {
        setScoreHoverUrl(null);
        setScoreTooltipData(null);
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [scoreHoverUrl]);

  // ── Intelligence state ──
  const [clubRequests, setClubRequests] = useState<(ClubRequest & { clubName?: string; clubLogo?: string })[]>([]);
  const [performanceCache, setPerformanceCache] = useState<Record<string, { appearances: number; goals: number; assists: number; minutes: number; season: string }>>({});
  const [loadingPerformanceUrl, setLoadingPerformanceUrl] = useState<string | null>(null);
  const [refreshingUrl, setRefreshingUrl] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'contact_score' | 'added' | 'market_value' | 'matches'>('contact_score');
  const [filterBy, setFilterBy] = useState<'all' | 'action_today' | 'has_matches' | 'contract_expiring' | 'free_agent' | 'my_players'>('all');
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);

  // ── Notes state ──
  const [noteModalEntry, setNoteModalEntry] = useState<ShortlistEntry | null>(null);
  const [noteModalMode, setNoteModalMode] = useState<'add' | 'edit'>('add');
  const [noteModalText, setNoteModalText] = useState('');
  const [noteModalEditIndex, setNoteModalEditIndex] = useState(-1);
  const [savingNote, setSavingNote] = useState(false);
  const [expandedNotesUrl, setExpandedNotesUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Fetch current account ID for "my players" filter
  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => {
      setCurrentAccountId(acc.id);
    });
  }, [user]);

  // Handle ?highlight=url — scroll to and animate the matching shortlist entry
  const highlightParam = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightParam || entries.length === 0) return;
    const decoded = decodeURIComponent(highlightParam);
    const sorted = [...entries].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const idx = sorted.findIndex((e) => e.tmProfileUrl === decoded || e.tmProfileUrl === highlightParam);
    if (idx < 0) return;
    setHighlightedUrl(decoded);
    const el = document.getElementById(`shortlist-entry-${idx}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    // Clear highlight from URL and animation after a delay
    const t1 = setTimeout(() => {
      router.replace('/shortlist', { scroll: false });
    }, 500);
    const t2 = setTimeout(() => setHighlightedUrl(null), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [highlightParam, entries.length, router]);

  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, shortlistsCollection);

    // One-time migration from legacy "team" document to per-player documents
    const migrateFromLegacy = async () => {
      try {
        const teamRef = doc(db, shortlistsCollection, 'team');
        const teamSnap = await getDoc(teamRef);
        if (!teamSnap.exists()) return;
        const teamEntries = (teamSnap.data()?.entries as Record<string, unknown>[]) || [];

        // Check which URLs already exist as individual docs (handles re-runs / races)
        const existingSnap = await getDocs(colRef);
        const existingUrls = new Set<string>();
        const duplicateDocIds: string[] = [];
        for (const d of existingSnap.docs) {
          if (d.id === 'team') continue;
          const url = d.data().tmProfileUrl as string;
          if (!url) continue;
          if (existingUrls.has(url)) {
            duplicateDocIds.push(d.id);
          } else {
            existingUrls.add(url);
          }
        }

        const batch = writeBatch(db);
        const sanitize = (x: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === undefined ? null : v]));
        let count = 0;
        for (const e of teamEntries) {
          const url = e.tmProfileUrl as string;
          if (!url || existingUrls.has(url)) continue;
          existingUrls.add(url);
          batch.set(doc(colRef), sanitize(e));
          count++;
        }
        // Delete duplicate docs found
        for (const id of duplicateDocIds) {
          batch.delete(doc(db, shortlistsCollection, id));
        }
        // Delete team doc in the same atomic batch
        batch.delete(teamRef);
        await batch.commit();
        console.log(`[Shortlist] Migrated ${count} new entries, removed ${duplicateDocIds.length} duplicates`);
      } catch (err) {
        console.warn('[Shortlist] Migration skipped:', err);
      }
    };

    migrateFromLegacy();

    const unsub = onSnapshot(
      colRef,
      (snap) => {
        const seen = new Set<string>();
        const mapped = snap.docs
          .map((d) => {
            const e = d.data();
            const url = (e.tmProfileUrl as string) ?? '';
            if (!url) return null; // skip docs without tmProfileUrl (legacy/team doc)
            if (seen.has(url)) return null; // skip duplicates
            seen.add(url);
            const clubRaw = e.clubJoinedName ?? (e.currentClub && typeof e.currentClub === 'object' ? (e.currentClub as { clubName?: string }).clubName : null) ?? (e.currentClub as string);
            const nameVal = e.playerName ?? e.fullName;
            const playerName = typeof nameVal === 'string' ? nameVal : undefined;
            const currentClub = e.currentClub && typeof e.currentClub === 'object' ? (e.currentClub as { clubName?: string; clubLogo?: string }) : undefined;
            return {
              tmProfileUrl: url,
            addedAt: e.addedAt as number,
            playerImage: (e.playerImage as string) ?? undefined,
            playerName,
            playerPosition: (e.playerPosition as string) ?? undefined,
            playerAge: (e.playerAge as string) ?? undefined,
            playerNationality: (e.playerNationality as string) ?? undefined,
            playerNationalities: Array.isArray(e.playerNationalities) ? (e.playerNationalities as string[]) : undefined,
            clubJoinedName: typeof clubRaw === 'string' ? clubRaw : (currentClub?.clubName ?? undefined),
            transferDate: (e.transferDate as string) ?? undefined,
            marketValue: (e.marketValue as string) ?? undefined,
            addedByAgentId: (e.addedByAgentId as string) ?? undefined,
            addedByAgentName: (e.addedByAgentName as string) ?? undefined,
            addedByAgentHebrewName: (e.addedByAgentHebrewName as string) ?? undefined,
            notes: Array.isArray(e.notes)
              ? (e.notes as Record<string, unknown>[]).map((n) => ({
                  text: (n.text as string) ?? '',
                  createdBy: (n.createdBy as string) ?? undefined,
                  createdByHebrewName: (n.createdByHebrewName as string) ?? undefined,
                  createdById: (n.createdById as string) ?? undefined,
                  createdAt: (n.createdAt as number) ?? undefined,
                }))
              : [],
            lastRefreshedAt: (e.lastRefreshedAt as number) ?? undefined,
            marketValueHistory: Array.isArray(e.marketValueHistory) ? (e.marketValueHistory as { value?: string; date?: number }[]) : undefined,
            contractExpires: (e.contractExpires as string) ?? undefined,
            positions: Array.isArray(e.positions) ? (e.positions as string[]) : (e.playerPosition ? [e.playerPosition as string] : undefined),
            foot: (e.foot as string) ?? undefined,
            salaryRange: (e.salaryRange as string) ?? undefined,
            transferFee: (e.transferFee as string) ?? undefined,
            currentClub,
          };
        }).filter((x): x is NonNullable<typeof x> => x !== null);
        setEntries(mapped);
        setLoadingList(false);
        if (shortlistCacheKey) setScreenCache(shortlistCacheKey, mapped);
      },
      (err) => {
        console.error('Shortlist snapshot error:', err);
        setLoadingList(false);
      }
    );
    return () => unsub();
  }, [user, shortlistsCollection, platform]);

  // Load ClubRequests for matching (men only)
  useEffect(() => {
    if (platform !== 'men') return;
    const reqCol = CLUB_REQUESTS_COLLECTIONS[platform];
    const q = query(collection(db, reqCol), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubRequest & { clubName?: string; clubLogo?: string }));
      setClubRequests(reqs.filter((r) => (r as { status?: string }).status !== 'closed'));
    });
    return () => unsub();
  }, [platform]);

  // Load roster players for teammates matching
  useEffect(() => {
    if (platform === 'youth') {
      const unsub = subscribePlayersYouth((list) => {
        setRosterPlayers(list.map(youthToRosterPlayer));
      });
      return unsub;
    }
    if (platform === 'women') {
      const unsub = subscribePlayersWomen((list) => {
        setRosterPlayers(list.map(womanToRosterPlayer));
      });
      return unsub;
    }
    const q = query(collection(db, PLAYERS_COLLECTIONS[platform]), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRosterPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer)));
    });
    return () => unsub();
  }, [platform]);

  const fetchTeammates = useCallback(async (playerUrl: string) => {
    setLoadingTeammatesUrl(playerUrl);
    try {
      const teammates = await getTeammates(playerUrl);
      const rosterIds = new Set(rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean));
      const matches: RosterTeammateMatch[] = teammates
        .filter((t) => rosterIds.has(extractPlayerIdFromUrl(t.tmProfileUrl) ?? ''))
        .map((t) => {
          const id = extractPlayerIdFromUrl(t.tmProfileUrl);
          const rosterPlayer = rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === id);
          return rosterPlayer ? { player: rosterPlayer, matchesPlayedTogether: t.matchesPlayedTogether } : null;
        })
        .filter((m): m is RosterTeammateMatch => m != null)
        .sort((a, b) => b.matchesPlayedTogether - a.matchesPlayedTogether);
      setTeammatesCache((prev) => ({ ...prev, [playerUrl]: matches }));
    } catch {
      setTeammatesCache((prev) => ({ ...prev, [playerUrl]: [] }));
    } finally {
      setLoadingTeammatesUrl(null);
    }
  }, [rosterPlayers]);

  const toggleTeammates = useCallback((url: string) => {
    setExpandedTeammatesUrl((prev) => (prev === url ? null : url));
  }, []);

  const sanitizeForFirestore = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) {
        out[k] = null;
      } else if (Array.isArray(v)) {
        out[k] = v.map((item) =>
          typeof item === 'object' && item !== null
            ? sanitizeForFirestore(item as Record<string, unknown>)
            : item === undefined ? null : item
        );
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  // ── Notes CRUD ──
  const findDocByUrl = useCallback(async (url: string) => {
    const q = query(collection(db, shortlistsCollection), where('tmProfileUrl', '==', url));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0];
  }, [shortlistsCollection]);

  const addNoteToEntry = useCallback(async (entry: ShortlistEntry, noteText: string) => {
    if (!user) return;
    setSavingNote(true);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const found = await findDocByUrl(entry.tmProfileUrl);
      if (!found) return;
      const existingNotes = Array.isArray(found.data().notes) ? [...(found.data().notes as Record<string, unknown>[])] : [];
      existingNotes.push({
        text: noteText,
        createdBy: account.name ?? 'Unknown',
        createdByHebrewName: account.hebrewName ?? null,
        createdById: account.id,
        createdAt: Date.now(),
      });
      await updateDoc(found.ref, { notes: existingNotes });
    } finally {
      setSavingNote(false);
    }
  }, [user, shortlistsCollection, findDocByUrl]);

  const updateNoteInEntry = useCallback(async (entry: ShortlistEntry, noteIndex: number, newText: string) => {
    if (!user) return;
    setSavingNote(true);
    try {
      const found = await findDocByUrl(entry.tmProfileUrl);
      if (!found) return;
      const existingNotes = Array.isArray(found.data().notes) ? [...(found.data().notes as Record<string, unknown>[])] : [];
      if (noteIndex < 0 || noteIndex >= existingNotes.length) return;
      existingNotes[noteIndex] = { ...existingNotes[noteIndex], text: newText, updatedAt: Date.now() };
      await updateDoc(found.ref, { notes: existingNotes });
    } finally {
      setSavingNote(false);
    }
  }, [user, findDocByUrl]);

  const deleteNoteFromEntry = useCallback(async (entry: ShortlistEntry, noteIndex: number) => {
    if (!user) return;
    try {
      const found = await findDocByUrl(entry.tmProfileUrl);
      if (!found) return;
      const existingNotes = Array.isArray(found.data().notes) ? [...(found.data().notes as Record<string, unknown>[])] : [];
      existingNotes.splice(noteIndex, 1);
      await updateDoc(found.ref, { notes: existingNotes });
    } catch (err) {
      console.error('Delete note error:', err);
    }
  }, [user, findDocByUrl]);

  const handleSaveNote = useCallback(async () => {
    if (!noteModalEntry || !noteModalText.trim()) return;
    if (noteModalMode === 'edit' && noteModalEditIndex >= 0) {
      await updateNoteInEntry(noteModalEntry, noteModalEditIndex, noteModalText.trim());
    } else {
      await addNoteToEntry(noteModalEntry, noteModalText.trim());
    }
    setNoteModalEntry(null);
    setNoteModalText('');
    setNoteModalEditIndex(-1);
  }, [noteModalEntry, noteModalText, noteModalMode, noteModalEditIndex, addNoteToEntry, updateNoteInEntry]);

  const formatNoteDate = useCallback((timestamp?: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days < 1) return t('shortlist_date_today');
    if (days === 1) return t('shortlist_date_yesterday');
    if (days < 7) return t('shortlist_notes_days_ago').replace('{n}', String(days));
    return new Date(timestamp).toLocaleDateString();
  }, [t]);

  const getNoteAuthor = useCallback((note: ShortlistNote) =>
    isRtl
      ? note.createdByHebrewName || note.createdBy || '—'
      : note.createdBy || note.createdByHebrewName || '—',
  [isRtl]);

  const removeFromShortlist = async (entry: ShortlistEntry) => {
    if (!user) return;
    setRemovingUrl(entry.tmProfileUrl);
    try {
      const found = await findDocByUrl(entry.tmProfileUrl);
      if (found) await deleteDoc(found.ref);
      const account = await getCurrentAccountForShortlist(user);
      const feedEvent: Record<string, unknown> = {
        type: 'SHORTLIST_REMOVED',
        playerName: entry.playerName ?? null,
        playerImage: entry.playerImage ?? null,
        playerTmProfile: entry.tmProfileUrl,
        timestamp: Date.now(),
        agentName: account.name ?? null,
      };
      await addDoc(collection(db, FEED_EVENTS_COLLECTIONS[platform]), feedEvent);
    } finally {
      setRemovingUrl(null);
    }
  };

  // Refresh entry from Transfermarkt (men only, TM URLs)
  const refreshEntry = useCallback(
    async (entry: ShortlistEntry) => {
      if (!user || !entry.tmProfileUrl?.includes('transfermarkt')) return;
      setRefreshingUrl(entry.tmProfileUrl);
      try {
        const details = await getPlayerDetails(entry.tmProfileUrl);
        const found = await findDocByUrl(entry.tmProfileUrl);
        if (!found) return;
        const prev = found.data() as Record<string, unknown>;
        const prevValue = prev.marketValue as string | undefined;
        const history = Array.isArray(prev.marketValueHistory) ? [...(prev.marketValueHistory as { value?: string; date?: number }[])] : [];
        if (prevValue && details.marketValue && prevValue !== details.marketValue) {
          history.unshift({ value: details.marketValue, date: Date.now() });
          if (history.length > 5) history.pop();
        }
        await updateDoc(found.ref, sanitizeForFirestore({
          playerImage: details.profileImage ?? prev.playerImage,
          playerName: details.fullName ?? prev.playerName,
          playerPosition: details.positions?.[0] ?? prev.playerPosition,
          playerAge: details.age ?? prev.playerAge,
          playerNationality: details.nationality ?? prev.playerNationality,
          playerNationalities: details.nationalities ?? prev.playerNationalities,
          marketValue: details.marketValue ?? prev.marketValue,
          clubJoinedName: details.currentClub?.clubName ?? prev.clubJoinedName,
          currentClub: details.currentClub ?? prev.currentClub,
          contractExpires: details.contractExpires ?? prev.contractExpires,
          positions: details.positions ?? prev.positions,
          foot: details.foot ?? prev.foot,
          lastRefreshedAt: Date.now(),
          marketValueHistory: history.length ? history : prev.marketValueHistory,
        }));
      } catch (err) {
        console.error('Refresh failed:', err);
      } finally {
        setRefreshingUrl(null);
      }
    },
    [user, shortlistsCollection, findDocByUrl]
  );

  // Refresh on load: first 3 entries that are stale (>7 days) and TM URLs (men only) — run once when entries load
  const hasRunInitialRefresh = useRef(false);
  useEffect(() => {
    if (platform !== 'men' || entries.length === 0 || hasRunInitialRefresh.current) return;
    hasRunInitialRefresh.current = true;
    const toRefresh = entries
      .filter((e) => e.tmProfileUrl?.includes('transfermarkt'))
      .filter((e) => !e.lastRefreshedAt || (daysSince(e.lastRefreshedAt) ?? 999) > 7)
      .slice(0, 3);
    toRefresh.forEach((e) => void refreshEntry(e));
  }, [platform, entries.length, refreshEntry]);

  const fetchPerformance = useCallback(async (url: string) => {
    if (!url?.includes('transfermarkt')) return;
    setLoadingPerformanceUrl(url);
    try {
      const stats = await getPlayerPerformanceStats(url);
      setPerformanceCache((prev) => ({
        ...prev,
        [url]: stats
          ? { appearances: stats.appearances, goals: stats.goals, assists: stats.assists, minutes: stats.minutes, season: stats.season }
          : { appearances: 0, goals: 0, assists: 0, minutes: 0, season: '' },
      }));
    } finally {
      setLoadingPerformanceUrl(null);
    }
  }, []);

  // Auto-fetch performance for all TM entries when entering the shortlist
  const performanceFetchStarted = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (platform !== 'men' || entries.length === 0) return;
    const toFetch = entries
      .filter((e) => e.tmProfileUrl?.includes('transfermarkt'))
      .filter((e) => e.tmProfileUrl && !(e.tmProfileUrl in performanceCache) && !performanceFetchStarted.current.has(e.tmProfileUrl))
      .map((e) => e.tmProfileUrl!);
    toFetch.forEach((url) => performanceFetchStarted.current.add(url));
    toFetch.forEach((url, i) => {
      setTimeout(() => void fetchPerformance(url), i * 400);
    });
  }, [platform, entries, performanceCache, fetchPerformance]);

  // Compute matching requests and contact score per entry (men only)
  const entryIntelligence = useMemo(() => {
    if (platform !== 'men') return new Map<string, { matchCount: number; contactScore: number; matchingRequests: (ClubRequest & { clubName?: string; clubLogo?: string })[] }>();
    const map = new Map<string, { matchCount: number; contactScore: number; matchingRequests: (ClubRequest & { clubName?: string; clubLogo?: string })[] }>();
    for (const entry of entries) {
      const playerForMatch = {
        id: entry.tmProfileUrl,
        fullName: entry.playerName,
        age: entry.playerAge,
        positions: entry.positions ?? (entry.playerPosition ? [entry.playerPosition] : []),
        foot: entry.foot,
        salaryRange: entry.salaryRange,
        transferFee: entry.transferFee,
        marketValue: entry.marketValue,
      };
      const matching = matchingRequestsForPlayer(playerForMatch, clubRequests);
      const clubName = entry.currentClub?.clubName ?? entry.clubJoinedName;
      const freeAgent = isFreeAgent(clubName);
      const contractMonths = monthsUntilContractExpiry(entry.contractExpires);
      const hist = entry.marketValueHistory;
      const prevVal = hist && hist.length >= 2 ? hist[1]?.value : undefined;
      const valueChange = computeValueChangePercent(prevVal ?? undefined, entry.marketValue);
      const perf = entry.tmProfileUrl ? performanceCache[entry.tmProfileUrl] : undefined;
      const score = computeContactScore({
        requestMatchCount: matching.length,
        isFreeAgent: freeAgent,
        contractMonthsLeft: contractMonths,
        valueChangePercent: valueChange,
        minutes: perf?.minutes,
        goals: perf?.goals,
        assists: perf?.assists,
      });
      map.set(entry.tmProfileUrl, { matchCount: matching.length, contactScore: score, matchingRequests: matching });
    }
    return map;
  }, [platform, entries, clubRequests, performanceCache]);

  const formatRefreshedAgo = useCallback(
    (ts?: number) => {
      if (!ts) return '';
      const days = daysSince(ts);
      if (days == null) return '';
      if (days < 1) return t('shortlist_refreshed_ago').replace('{n}', isRtl ? 'היום' : 'today');
      if (days === 1) return t('shortlist_refreshed_ago').replace('{n}', isRtl ? 'אתמול' : 'yesterday');
      if (days < 7) return t('shortlist_refreshed_ago').replace('{n}', t('shortlist_date_days_ago').replace('{n}', String(days)));
      return t('shortlist_refreshed_ago').replace('{n}', `${days} ${isRtl ? 'ימים' : 'days'}`);
    },
    [t, isRtl]
  );

  const sorted = useMemo(() => {
    let list = [...entries];
    if (filterBy === 'action_today') list = list.filter((e) => (entryIntelligence.get(e.tmProfileUrl)?.contactScore ?? 0) >= 7);
    if (filterBy === 'has_matches') list = list.filter((e) => (entryIntelligence.get(e.tmProfileUrl)?.matchCount ?? 0) >= 1);
    if (filterBy === 'contract_expiring')
      list = list.filter((e) => {
        const m = monthsUntilContractExpiry(e.contractExpires);
        return m != null && m <= 6 && m > 0;
      });
    if (filterBy === 'free_agent') list = list.filter((e) => isFreeAgent(e.currentClub?.clubName ?? e.clubJoinedName));
    if (filterBy === 'my_players' && currentAccountId) list = list.filter((e) => e.addedByAgentId === currentAccountId);
    if (sortBy === 'contact_score') list.sort((a, b) => (entryIntelligence.get(b.tmProfileUrl)?.contactScore ?? 0) - (entryIntelligence.get(a.tmProfileUrl)?.contactScore ?? 0));
    else if (sortBy === 'added') list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    else if (sortBy === 'matches') list.sort((a, b) => (entryIntelligence.get(b.tmProfileUrl)?.matchCount ?? 0) - (entryIntelligence.get(a.tmProfileUrl)?.matchCount ?? 0));
    else if (sortBy === 'market_value') {
      const toNum = (v: string | undefined) => (v?.includes('m') ? parseFloat(v) * 1000 : parseFloat(v || '0') || 0);
      list.sort((a, b) => toNum(b.marketValue) - toNum(a.marketValue));
    } else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }, [entries, filterBy, sortBy, entryIntelligence, currentAccountId]);

  const formatAddedDate = (addedAt?: number) => {
    if (!addedAt) return '';
    const now = Date.now();
    const diff = now - addedAt;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(days / 7);
    if (days < 1) return t('shortlist_added_today');
    if (days === 1) return t('shortlist_added_yesterday');
    if (days < 7) return t('shortlist_added_days_ago').replace('{n}', String(days));
    if (weeks === 1) return t('shortlist_added_week_ago');
    if (weeks < 4) return t('shortlist_added_weeks_ago').replace('{n}', String(weeks));
    return t('shortlist_added_months_ago').replace('{n}', String(Math.floor(days / 30)));
  };

  const formatAddedDateShort = (addedAt?: number) => {
    if (!addedAt) return '';
    const now = Date.now();
    const diff = now - addedAt;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(days / 7);
    if (days < 1) return t('shortlist_date_today');
    if (days === 1) return t('shortlist_date_yesterday');
    if (days < 7) return t('shortlist_date_days_ago').replace('{n}', String(days));
    if (weeks === 1) return t('shortlist_date_week_ago');
    if (weeks < 4) return t('shortlist_date_weeks_ago').replace('{n}', String(weeks));
    return t('shortlist_date_months_ago').replace('{n}', String(Math.floor(days / 30)));
  };

  const sanitizeMarketValue = (val: string | undefined) => {
    if (!val?.trim()) return '—';
    return val
      .replace(/&euro;/gi, '€')
      .replace(/&#8364;/g, '€')
      .replace(/euro&/gi, '€')
      .replace(/;&euro;?/gi, '€')
      .replace(/;euro&/gi, '€')
      .replace(/&euro/gi, '€')
      .trim();
  };

  const getAgentDisplayName = (entry: ShortlistEntry) =>
    isRtl
      ? entry.addedByAgentHebrewName || entry.addedByAgentName || '—'
      : entry.addedByAgentName || entry.addedByAgentHebrewName || '—';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>{t('loading')}</div>
      </div>
    );
  }

  const showingCount = sorted.length;
  const totalCount = entries.length;
  const isFiltered = platform === 'men' && filterBy !== 'all' && showingCount < totalCount;

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto px-4 sm:px-0">
        {/* Header — clean, informative */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {isWomen ? t('shortlist_title_women') : t('shortlist_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {isFiltered
                ? t('shortlist_showing_filtered').replace('{showing}', String(showingCount)).replace('{total}', String(totalCount))
                : `${totalCount} ${isWomen ? t('players_women') : t('players')}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {platform === 'men' && (
              <>
                <Link
                  href="/releases"
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text font-medium hover:border-mgsr-teal/50 hover:text-mgsr-teal transition"
                >
                  {t('shortlist_browse_releases')}
                </Link>
                <Link
                  href="/returnees"
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text font-medium hover:border-purple-500/50 hover:text-purple-400 transition"
                >
                  {t('shortlist_browse_returnees')}
                </Link>
              </>
            )}
            <Link
              href="/players/add?shortlist=1"
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] ${
                isYouth
                  ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.2)] hover:opacity-90'
                  : isWomen
                    ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                    : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
              }`}
            >
              <span>+</span>
              {isYouth ? t('shortlist_add_youth_player') : t(isWomen ? 'shortlist_add_from_soccerdonna' : 'shortlist_add_from_tm')}
            </Link>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className={`flex items-center gap-3 ${isYouth ? 'text-[var(--youth-cyan)]/70' : isWomen ? 'text-[var(--women-rose)]/70' : 'text-mgsr-muted'}`}>
              <div className={`w-3 h-3 rounded-full animate-pulse ${isYouth ? 'bg-[var(--youth-cyan)]/50' : isWomen ? 'bg-[var(--women-rose)]/50' : 'bg-mgsr-teal/50'}`} />
              {isWomen ? t('shortlist_loading_women') : t('shortlist_loading')}
            </div>
          </div>
        ) : (
          <>
            {/* Sort & Filter bar — men only, always visible when we have entries */}
            {platform === 'men' && entries.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-6 p-4 rounded-2xl bg-mgsr-card/80 border border-mgsr-border">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted shrink-0">
                    {isRtl ? 'מיון' : 'Sort'}
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50 hover:border-mgsr-teal/50 transition"
                  >
                    <option value="contact_score">{t('shortlist_sort_contact_score')}</option>
                    <option value="added">{t('shortlist_sort_added')}</option>
                    <option value="market_value">{t('shortlist_sort_market_value')}</option>
                    <option value="matches">{t('shortlist_sort_matches')}</option>
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted shrink-0 w-full sm:w-auto">
                    {isRtl ? 'סינון' : 'Filter'}
                  </span>
                  {(['all', 'my_players', 'action_today', 'has_matches', 'contract_expiring', 'free_agent'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilterBy(f)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        filterBy === f
                          ? 'bg-mgsr-teal text-mgsr-dark shadow-lg shadow-mgsr-teal/20'
                          : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
                      }`}
                    >
                      {t(`shortlist_filter_${f}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sorted.length === 0 ? (
              entries.length > 0 && platform === 'men' && filterBy !== 'all' ? (
            <div className="py-20 px-6 rounded-2xl bg-mgsr-card/50 border border-mgsr-border text-center">
              <p className="text-mgsr-text text-lg font-medium mb-2">{t('shortlist_filter_empty')}</p>
              <p className="text-mgsr-muted text-sm mb-6 max-w-sm mx-auto">{t('shortlist_filter_empty_hint').replace('{n}', String(entries.length))}</p>
              <button
                type="button"
                onClick={() => setFilterBy('all')}
                className="px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition shadow-lg shadow-mgsr-teal/20"
              >
                {t('shortlist_filter_clear')}
              </button>
            </div>
          ) : (
            /* Truly empty shortlist */
                <div className={`py-20 px-6 rounded-2xl bg-mgsr-card/50 border border-mgsr-border text-center`}>
              <p className="text-mgsr-text text-xl font-semibold mb-2">{isWomen ? t('shortlist_empty_women') : t('shortlist_empty')}</p>
              <p className="text-mgsr-muted text-sm mb-8">{isYouth ? t('shortlist_empty_hint_youth') : isWomen ? t('shortlist_empty_hint_women') : t('shortlist_empty_hint')}</p>
              <div className="flex flex-wrap justify-center gap-3 relative">
                {platform === 'men' && (
                  <>
                    <Link
                      href="/releases"
                      className="inline-block px-5 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition"
                    >
                      {t('shortlist_browse_releases')}
                    </Link>
                    <Link
                      href="/returnees"
                      className="inline-block px-5 py-2.5 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-600 transition"
                    >
                      {t('shortlist_browse_returnees')}
                    </Link>
                    <span className="text-mgsr-muted self-center">{t('common_or')}</span>
                  </>
                )}
                <Link
                  href="/players/add?shortlist=1"
                  className={`inline-block px-5 py-2.5 rounded-xl font-semibold transition ${
                    isYouth
                      ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white hover:opacity-90'
                      : isWomen
                        ? 'bg-[var(--women-gradient)] text-white hover:opacity-90'
                        : 'border border-mgsr-teal text-mgsr-teal hover:bg-mgsr-teal/10'
                  }`}
                >
                  {isYouth ? t('shortlist_add_youth_player') : t(isWomen ? 'shortlist_add_from_soccerdonna' : 'shortlist_add_from_tm')}
                </Link>
              </div>
            </div>
              )
            ) : (
            <div className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 ${isWomen ? 'gap-6' : ''}`}>
            {sorted.map((entry, i) => {
              const playerUrl = entry.tmProfileUrl;
              const intel = platform === 'men' ? entryIntelligence.get(playerUrl) : null;
              const contactScore = intel?.contactScore ?? 0;
              const matchCount = intel?.matchCount ?? 0;
              const matchingReqs = intel?.matchingRequests ?? [];
              const freeAgent = isFreeAgent(entry.currentClub?.clubName ?? entry.clubJoinedName);
              const contractMonths = monthsUntilContractExpiry(entry.contractExpires);
              const hist = entry.marketValueHistory;
              const prevVal = hist && hist.length >= 2 ? hist[1]?.value : undefined;
              const valueChangePct = computeValueChangePercent(prevVal, entry.marketValue);
              const daysStale = daysSince(entry.lastRefreshedAt);
              const perf = playerUrl ? performanceCache[playerUrl] : undefined;
              const isHot = contactScore >= 7 || matchCount >= 2;
              const rosterTeammates = playerUrl ? teammatesCache[playerUrl] : undefined;
              const isLoadingTeammates = loadingTeammatesUrl === playerUrl;
              const isExpanded = expandedTeammatesUrl === playerUrl;
              const clubDisplay = (() => {
                const c = entry.clubJoinedName?.trim();
                if (!c) return '—';
                if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
                return c;
              })();
              const ageDisplay = entry.playerAge
                ? t(isWomen ? 'players_age_display_women' : 'players_age_display').replace('{age}', entry.playerAge)
                : null;
              const infoParts = [entry.playerPosition, clubDisplay, entry.playerNationality, ageDisplay].filter(Boolean);
              const isSoccerDonnaUrl = playerUrl?.includes('soccerdonna');
              const isFmInsideUrl = playerUrl?.includes('fminside');

              const isEu = platform === 'men' && isEuNational(entry.playerNationality, euCountries, entry.playerNationalities);
              const isHighlighted = highlightedUrl === entry.tmProfileUrl;
              const isNotesExpanded = expandedNotesUrl === entry.tmProfileUrl;
              const notes = entry.notes ?? [];
              return (
              <div
                key={entry.tmProfileUrl}
                id={`shortlist-entry-${i}`}
                className={`group overflow-hidden transition-all duration-300 animate-fade-in ${
                  isHighlighted ? 'shortlist-entry-highlight' : ''
                } ${
                  isYouth
                    ? 'rounded-2xl border border-[var(--youth-cyan)]/25 bg-mgsr-card shadow-[0_0_30px_rgba(0,212,255,0.06)] hover:border-[var(--youth-cyan)]/40 hover:shadow-[0_0_30px_rgba(0,212,255,0.12)]'
                    : isWomen
                      ? 'rounded-2xl border border-[var(--women-rose)]/25 bg-mgsr-card shadow-[0_0_30px_rgba(232,160,191,0.06)] hover:border-[var(--women-rose)]/40 hover:shadow-[0_0_30px_rgba(232,160,191,0.12)]'
                      : `rounded-2xl border bg-mgsr-card transition-all ${
                          isHot ? 'border-amber-500/40 shadow-lg shadow-amber-500/5' : 'border-mgsr-border hover:border-mgsr-teal/30'
                        }`
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {isYouth && (
                  <div className="h-1 bg-gradient-to-r from-[var(--youth-cyan)] via-[var(--youth-violet)] to-[var(--youth-cyan)]/60" />
                )}
                {isWomen && (
                  <div className="h-1 bg-gradient-to-r from-[var(--women-rose)] via-[var(--women-blush)] to-[var(--women-rose)]/60" />
                )}
                {isYouth ? (
                  /* Youth: glassmorphism card — cyan/violet accent */
                  <div className="p-4 space-y-4">
                    <Link
                      href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist${entry.playerName ? `&name=${encodeURIComponent(entry.playerName)}` : ''}${entry.playerPosition ? `&position=${encodeURIComponent(entry.playerPosition)}` : ''}${entry.playerNationality ? `&nationality=${encodeURIComponent(entry.playerNationality)}` : ''}${entry.clubJoinedName ? `&club=${encodeURIComponent(entry.clubJoinedName)}` : ''}${entry.playerImage ? `&image=${encodeURIComponent(entry.playerImage)}` : ''}${entry.playerAge ? `&age=${encodeURIComponent(entry.playerAge)}` : ''}${entry.marketValue ? `&value=${encodeURIComponent(entry.marketValue)}` : ''}`}
                      className="block group/link"
                    >
                      <div className="flex gap-4">
                        <img
                          src={entry.playerImage || 'https://placehold.co/64x64/1A2736/00D4FF?text=?'}
                          alt=""
                          className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-[var(--youth-cyan)]/20 group-hover/link:ring-[var(--youth-cyan)]/50 transition shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/1A2736/00D4FF?text=?';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-mgsr-text truncate group-hover/link:text-[var(--youth-cyan)] transition">
                            {entry.playerName || t('shortlist_unknown_player')}
                          </h3>
                          <p className="text-sm text-mgsr-muted mt-0.5 line-clamp-2">
                            {infoParts.length > 0 ? infoParts.join(' • ') : t('shortlist_no_info')}
                          </p>
                          <p className="text-xs text-mgsr-muted/80 mt-2">
                            {entry.addedAt
                              ? t('shortlist_added_by_date')
                                .replace('{agent}', getAgentDisplayName(entry))
                                .replace('{date}', formatAddedDateShort(entry.addedAt))
                              : `${t('shortlist_added_by')} ${getAgentDisplayName(entry)}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--youth-cyan)]/10">
                      <span />
                      <button
                        onClick={() => removeFromShortlist(entry)}
                        disabled={removingUrl === entry.tmProfileUrl}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-mgsr-red hover:bg-mgsr-red/15 disabled:opacity-50 transition"
                      >
                        {removingUrl === entry.tmProfileUrl ? '...' : t('shortlist_remove')}
                      </button>
                    </div>
                  </div>
                ) : isWomen ? (
                  /* Women: editorial card — clear hierarchy, no cramping */
                  <div className="p-4 space-y-4">
                    <Link
                      href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist`}
                      className="block group/link"
                    >
                      <div className="flex gap-4">
                        <img
                          src={entry.playerImage || 'https://placehold.co/64x64/1A2736/E8A0BF?text=?'}
                          alt=""
                          className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-[var(--women-rose)]/20 group-hover/link:ring-[var(--women-rose)]/50 transition shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/1A2736/E8A0BF?text=?';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-mgsr-text truncate group-hover/link:text-[var(--women-rose)] transition">
                            {entry.playerName || t('shortlist_unknown_player')}
                          </h3>
                          <p className="text-sm text-mgsr-muted mt-0.5 line-clamp-2">
                            {infoParts.length > 0 ? infoParts.join(' • ') : t('shortlist_no_info')}
                          </p>
                          <p className="text-xs text-mgsr-muted/80 mt-2">
                            {entry.addedAt
                              ? t('shortlist_added_by_date')
                                .replace('{agent}', getAgentDisplayName(entry))
                                .replace('{date}', formatAddedDateShort(entry.addedAt))
                              : `${t('shortlist_added_by')} ${getAgentDisplayName(entry)}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--women-rose)]/10">
                      {isSoccerDonnaUrl || isFmInsideUrl ? (
                        <a
                          href={playerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-[var(--women-rose)]/15 text-[var(--women-rose)] text-sm font-medium hover:bg-[var(--women-rose)]/25 transition"
                        >
                          {isSoccerDonnaUrl ? t('similar_players_view_soccerdonna') : t('similar_players_view_fminside')}
                        </a>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={() => removeFromShortlist(entry)}
                        disabled={removingUrl === entry.tmProfileUrl}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-mgsr-red hover:bg-mgsr-red/15 disabled:opacity-50 transition"
                      >
                        {removingUrl === entry.tmProfileUrl ? '...' : t('shortlist_remove')}
                      </button>
                    </div>
                  </div>
                ) : (
                /* Men: clean card design */
                <div className="flex flex-col">
                  {/* Main row: avatar, info, score, value, actions */}
                  <div className="p-5 flex gap-4 items-start">
                    <Link
                      href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist`}
                      className="flex gap-4 flex-1 min-w-0"
                    >
                      <img
                        src={entry.playerImage || 'https://via.placeholder.com/64'}
                        alt=""
                        className={`w-16 h-16 rounded-2xl object-cover bg-mgsr-dark shrink-0 ring-2 transition-all ${isHot ? 'ring-amber-500/50' : 'ring-mgsr-border group-hover:ring-mgsr-teal/40'}`}
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64'; }}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-mgsr-text truncate group-hover:text-mgsr-teal transition">
                          {entry.playerName || 'Unknown'}
                        </h3>
                        <p className="text-sm text-mgsr-muted mt-0.5">
                          {entry.playerPosition || '—'} · {clubDisplay}
                          {entry.playerAge ? ` · ${entry.playerAge}` : ''}
                        </p>
                        <p className="text-xs text-mgsr-muted/80 mt-2">
                          {entry.addedAt
                            ? t('shortlist_added_by_date')
                              .replace('{agent}', getAgentDisplayName(entry))
                              .replace('{date}', formatAddedDateShort(entry.addedAt))
                            : `${t('shortlist_added_by')} ${getAgentDisplayName(entry)}`}
                        </p>
                      </div>
                    </Link>
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      {(() => {
                        const isScoreReady = !entry.tmProfileUrl?.includes('transfermarkt') || (entry.tmProfileUrl && entry.tmProfileUrl in performanceCache);
                        if (!isScoreReady) {
                          return (
                            <div className="w-12 h-12 rounded-xl bg-mgsr-dark/40 overflow-hidden skeleton-shimmer flex items-center justify-center">
                              <div className="w-6 h-5 rounded bg-mgsr-border/40 skeleton-shimmer" />
                            </div>
                          );
                        }
                        if (contactScore <= 0) return null;
                        return (
                        <div
                          data-score-explanation
                          className="relative"
                          onMouseEnter={() => {
                            setScoreHoverUrl(entry.tmProfileUrl);
                            setScoreTooltipData({
                              contactScore,
                              matchCount,
                              freeAgent,
                              contractMonths,
                              valueChangePct,
                              hasMinutesBonus: (perf?.minutes ?? 0) >= 1500,
                              hasProductiveBonus: ((perf?.goals ?? 0) + (perf?.assists ?? 0)) >= 5,
                            });
                          }}
                          onMouseLeave={() => {
                            setScoreHoverUrl(null);
                            setScoreTooltipData(null);
                          }}
                        >
                          <button
                            ref={(el) => {
                              if (el && scoreHoverUrl === entry.tmProfileUrl) scoreButtonRef.current = el;
                              else if (!scoreHoverUrl) scoreButtonRef.current = null;
                            }}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              if (scoreHoverUrl === entry.tmProfileUrl) {
                                setScoreHoverUrl(null);
                                setScoreTooltipData(null);
                              } else {
                                setScoreHoverUrl(entry.tmProfileUrl);
                                setScoreTooltipData({
                                  contactScore,
                                  matchCount,
                                  freeAgent,
                                  contractMonths,
                                  valueChangePct,
                                  hasMinutesBonus: (perf?.minutes ?? 0) >= 1500,
                                  hasProductiveBonus: ((perf?.goals ?? 0) + (perf?.assists ?? 0)) >= 5,
                                });
                              }
                            }}
                            className={`relative w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50 ${
                              contactScore >= 8 ? 'bg-green-500/20 text-green-400' :
                              contactScore >= 5 ? 'bg-amber-500/20 text-amber-400' :
                              'bg-mgsr-teal/15 text-mgsr-teal'
                            }`}
                            title={t('shortlist_score_why').replace('{n}', String(contactScore))}
                          >
                            <span>{contactScore}</span>
                            <span className="absolute bottom-0.5 right-1 w-3.5 h-3.5 rounded-full bg-mgsr-teal/90 text-mgsr-dark text-[10px] font-bold flex items-center justify-center leading-none">
                              ?
                            </span>
                          </button>
                        </div>
                        );
                      })()}
                      <div className="text-right">
                        <p className={`text-lg font-bold ${valueChangePct != null && valueChangePct < -10 ? 'text-red-400' : 'text-mgsr-teal'}`}>
                          {sanitizeMarketValue(entry.marketValue)}
                        </p>
                        {valueChangePct != null && valueChangePct !== 0 && (
                          <p className={`text-xs font-medium ${valueChangePct < 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {valueChangePct < 0 ? '↓' : '↑'} {Math.abs(valueChangePct)}%
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        {entry.tmProfileUrl?.includes('transfermarkt') && (
                          <a
                            href={entry.tmProfileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-9 h-9 rounded-lg flex items-center justify-center bg-mgsr-dark/40 border border-mgsr-border text-mgsr-teal hover:bg-mgsr-teal/15 hover:border-mgsr-teal/40 transition"
                            title={t('shortlist_open_transfermarkt')}
                          >
                            <span className="text-xs font-bold">TM</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); removeFromShortlist(entry); }}
                          disabled={removingUrl === entry.tmProfileUrl}
                          className="w-9 h-9 rounded-lg flex items-center justify-center bg-mgsr-dark/40 border border-mgsr-border text-mgsr-red/80 hover:bg-mgsr-red/15 hover:border-mgsr-red/30 disabled:opacity-50 transition"
                          title={t('shortlist_remove')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Badges — compact */}
                  {(isEu || matchCount > 0 || freeAgent || contractMonths != null || valueChangePct != null || (daysStale != null && daysStale > 14)) && (
                    <div className="px-5 pb-4 flex flex-wrap gap-2">
                      {isEu && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                          🇪🇺 {t('eu_nat_tag')}
                        </span>
                      )}
                      {matchCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          {t('shortlist_matches_requests').replace('{n}', String(matchCount))}
                        </span>
                      )}
                      {freeAgent && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
                          {t('shortlist_free_agent')}
                        </span>
                      )}
                      {contractMonths != null && contractMonths <= 6 && contractMonths > 0 && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          {t('shortlist_contract_expiring').replace('{n}', String(contractMonths))}
                        </span>
                      )}
                      {valueChangePct != null && valueChangePct < -10 && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
                          {t('shortlist_value_dropped').replace('{n}', String(Math.abs(valueChangePct)))}
                        </span>
                      )}
                      {daysStale != null && daysStale > 14 && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium text-mgsr-muted bg-mgsr-border/30">
                          {t('shortlist_data_stale').replace('{n}', String(daysStale))}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Collapsible sections */}
                  <div className="border-t border-mgsr-border/60 divide-y divide-mgsr-border/60">
                    {/* Matching requests */}
                    {matchingReqs.length > 0 && (
                      <div className="px-5 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted mb-2">
                          {t('shortlist_matches_requests').replace('{n}', String(matchingReqs.length))}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {matchingReqs.slice(0, 4).map((req) => (
                            <span key={req.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mgsr-dark/50 text-sm text-mgsr-text">
                              {req.clubLogo && <img src={req.clubLogo} alt="" className="w-5 h-5 rounded object-cover" />}
                              {req.clubName ?? '—'} · {req.position}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Performance — always visible, auto-fetched on load */}
                    {entry.tmProfileUrl?.includes('transfermarkt') && (
                      <div className="px-5 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted mb-3">
                          {t('shortlist_performance').replace('{season}', perf?.season ?? getCurrentSeasonLabel())}
                        </p>
                        {perf ? (
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              [t('shortlist_appearances'), perf.appearances],
                              [t('shortlist_goals'), perf.goals],
                              [t('shortlist_assists'), perf.assists],
                              [t('shortlist_minutes'), perf.minutes.toLocaleString()],
                            ].map(([label, val]) => (
                              <div key={String(label)} className="p-3 rounded-xl bg-mgsr-dark/40 text-center">
                                <p className="text-[10px] uppercase tracking-wider text-mgsr-muted">{label}</p>
                                <p className="text-base font-bold text-mgsr-text mt-0.5">{val}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            {[1, 2, 3, 4].map((i) => (
                              <div key={i} className="p-3 rounded-xl bg-mgsr-dark/40 overflow-hidden">
                                <div className="h-3 w-12 rounded mb-2 bg-mgsr-border/40 skeleton-shimmer" />
                                <div className="h-5 w-8 rounded mt-2 bg-mgsr-border/40 skeleton-shimmer" style={{ animationDelay: `${i * 0.15}s` }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Notes — all platforms */}
                <div className="border-t border-mgsr-border/60 px-5 py-3">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedNotesUrl(isNotesExpanded ? null : entry.tmProfileUrl); }}
                    className="w-full flex items-center justify-between text-left rtl:text-right"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted">
                      {notes.length === 0 ? t('shortlist_notes_tap_to_add') : t('shortlist_notes_count').replace('{n}', String(notes.length))}
                    </span>
                    <svg className={`w-4 h-4 text-mgsr-muted transition-transform ${isNotesExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {(isNotesExpanded || notes.length === 0) && (
                    <div className="mt-3 space-y-2">
                      {notes.map((note, ni) => (
                        <div key={ni} className="p-3 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/60">
                          <p className="text-sm text-mgsr-text whitespace-pre-wrap">{note.text}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-mgsr-muted">{getNoteAuthor(note)} · {formatNoteDate(note.createdAt)}</span>
                            <div className="flex gap-2">
                              <button type="button" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setNoteModalEntry(entry); setNoteModalMode('edit'); setNoteModalText(note.text); setNoteModalEditIndex(ni); }} className="text-xs text-mgsr-muted hover:text-mgsr-text">{t('shortlist_notes_edit')}</button>
                              <button type="button" onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); deleteNoteFromEntry(entry, ni); }} className="text-xs text-mgsr-red/70 hover:text-mgsr-red">{t('shortlist_notes_delete')}</button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setNoteModalEntry(entry); setNoteModalMode('add'); setNoteModalText(''); setNoteModalEditIndex(-1); }}
                        className="w-full py-2.5 rounded-xl text-sm font-medium text-mgsr-teal bg-mgsr-teal/10 hover:bg-mgsr-teal/15 border border-mgsr-teal/30 transition"
                      >
                        {t('shortlist_notes_add')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Teammates — men only */}
                {platform === 'men' && (
                <div className="border-t border-mgsr-border/60 px-5 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!playerUrl) return;
                      toggleTeammates(playerUrl);
                      if (!(playerUrl in teammatesCache) && !loadingTeammatesUrl) void fetchTeammates(playerUrl);
                    }}
                    className="w-full flex items-center justify-between text-left rtl:text-right"
                  >
                    <span className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted">
                      {isLoadingTeammates ? t('releases_roster_teammates_loading') : rosterTeammates != null ? t('releases_roster_teammates').replace('{count}', String(rosterTeammates.length)) : t('releases_roster_teammates_tap')}
                    </span>
                    <svg className={`w-4 h-4 text-mgsr-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {isLoadingTeammates ? (
                        <div className="py-8 flex justify-center"><span className="w-5 h-5 border-2 border-mgsr-teal/40 border-t-mgsr-teal rounded-full animate-spin" /></div>
                      ) : rosterTeammates?.length === 0 ? (
                        <p className="text-sm text-mgsr-muted py-4 text-center">{t('releases_no_roster_teammates')}</p>
                      ) : (
                        rosterTeammates?.map((match) => (
                          <Link key={match.player.id} href={`/players/${match.player.id}?from=/shortlist`} className="flex items-center gap-3 p-3 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/60 hover:border-mgsr-teal/40 transition">
                            <img src={match.player.profileImage || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-mgsr-border" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-mgsr-text truncate">{match.player.fullName || 'Unknown'}</p>
                              <p className="text-xs text-mgsr-muted truncate">{match.player.positions?.filter(Boolean).join(', ') || '—'} · {match.player.age ? t('players_age_display').replace('{age}', match.player.age) : '—'}</p>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg text-mgsr-teal bg-mgsr-teal/15">{t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}</span>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
              );
            })}
          </div>
            )}
          </>
        )}
      </div>

      {/* ── Note Add/Edit Modal ── */}
      {noteModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { setNoteModalEntry(null); setNoteModalText(''); setNoteModalEditIndex(-1); }}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isYouth
                ? 'bg-mgsr-card border-[var(--youth-cyan)]/30'
                : isWomen
                  ? 'bg-mgsr-card border-[var(--women-rose)]/30'
                  : 'bg-mgsr-card border-mgsr-border'
            }`}
          >
            {/* Title */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-mgsr-text">
                {noteModalMode === 'edit' ? t('shortlist_notes_edit_title') : t('shortlist_notes_add_title')}
              </h3>
              <button onClick={() => { setNoteModalEntry(null); setNoteModalText(''); setNoteModalEditIndex(-1); }} className="text-mgsr-muted hover:text-mgsr-text transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Player context */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/60">
              <img
                src={noteModalEntry.playerImage || 'https://via.placeholder.com/40'}
                alt=""
                className="w-10 h-10 rounded-full object-cover bg-mgsr-dark"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-mgsr-text truncate">
                  {noteModalEntry.playerName || t('shortlist_unknown_player')}
                </p>
                <p className="text-xs text-mgsr-muted truncate">
                  {[noteModalEntry.playerPosition, noteModalEntry.clubJoinedName].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {/* Text input */}
            <textarea
              value={noteModalText}
              onChange={(e) => setNoteModalText(e.target.value)}
              placeholder={t('shortlist_notes_placeholder')}
              rows={4}
              autoFocus
              className={`w-full rounded-xl border p-3 text-sm text-mgsr-text bg-mgsr-dark/60 placeholder:text-mgsr-muted/60 resize-none focus:outline-none transition ${
                isYouth
                  ? 'border-[var(--youth-cyan)]/30 focus:border-[var(--youth-cyan)]/60'
                  : isWomen
                    ? 'border-[var(--women-rose)]/30 focus:border-[var(--women-rose)]/60'
                    : 'border-mgsr-border focus:border-orange-400/60'
              }`}
              dir="auto"
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setNoteModalEntry(null); setNoteModalText(''); setNoteModalEditIndex(-1); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-mgsr-muted border border-mgsr-border hover:text-mgsr-text transition"
              >
                {t('common_cancel')}
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!noteModalText.trim() || savingNote}
                className={`px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition ${
                  isYouth
                    ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)]'
                    : isWomen
                      ? 'bg-[var(--women-rose)]'
                      : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {savingNote ? '...' : t('shortlist_notes_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score explanation tooltip — portal to avoid overflow clipping */}
      {typeof document !== 'undefined' &&
        scoreHoverUrl &&
        scoreTooltipData &&
        scoreTooltipRect &&
        createPortal(
          <div
            className={`fixed z-[9999] px-3 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border shadow-xl min-w-[200px] max-w-[280px] ${isRtl ? 'text-right' : 'text-left'}`}
            style={{ top: scoreTooltipRect.top, left: scoreTooltipRect.left }}
          >
            <p className="text-xs font-semibold text-mgsr-teal mb-2">
              {t('shortlist_score_why').replace('{n}', String(scoreTooltipData.contactScore))}
            </p>
            <ul className="space-y-1 text-xs text-mgsr-text">
              <li>{t('shortlist_score_base')}</li>
              {scoreTooltipData.matchCount >= 3 && (
                <li>{t('shortlist_score_matches').replace('{points}', '3').replace('{n}', String(scoreTooltipData.matchCount))}</li>
              )}
              {scoreTooltipData.matchCount === 2 && (
                <li>{t('shortlist_score_matches').replace('{points}', '2').replace('{n}', String(scoreTooltipData.matchCount))}</li>
              )}
              {scoreTooltipData.matchCount === 1 && <li>{t('shortlist_score_matches_one')}</li>}
              {scoreTooltipData.freeAgent && <li>{t('shortlist_score_free_agent')}</li>}
              {scoreTooltipData.contractMonths != null &&
                scoreTooltipData.contractMonths <= 6 &&
                scoreTooltipData.contractMonths > 0 && (
                  <li>{t('shortlist_score_contract').replace('{n}', String(scoreTooltipData.contractMonths))}</li>
                )}
              {scoreTooltipData.valueChangePct != null && scoreTooltipData.valueChangePct < -10 && (
                <li>{t('shortlist_score_value_drop').replace('{n}', String(Math.abs(scoreTooltipData.valueChangePct)))}</li>
              )}
              {scoreTooltipData.hasMinutesBonus && <li>{t('shortlist_score_minutes')}</li>}
              {scoreTooltipData.hasProductiveBonus && <li>{t('shortlist_score_productive')}</li>}
            </ul>
          </div>,
          document.body
        )}
    </AppLayout>
  );
}
