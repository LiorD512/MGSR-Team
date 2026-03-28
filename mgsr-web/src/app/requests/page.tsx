'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callRequestsDelete, callShortlistAdd } from '@/lib/callables';
import AppLayout from '@/components/AppLayout';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { getPositionDisplayName } from '@/lib/appConfig';
import { matchRequestToPlayers, type RosterPlayer } from '@/lib/requestMatcher';
import { findPlayersForRequest, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import { getPlayerDetails } from '@/lib/api';
import { getCurrentAccountForShortlist, getAllAccounts } from '@/lib/accounts';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { CLUB_REQUESTS_COLLECTIONS, PLAYERS_COLLECTIONS, SHORTLISTS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, PLAYER_DOCUMENTS_COLLECTIONS } from '@/lib/platformCollections';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import { useEuCountries } from '@/hooks/useEuCountries';
import ClubIntelPanel from '@/components/ClubIntelPanel';
import { type ClubIntelligence } from '@/lib/clubIntel';
import AddRequestSheet from './AddRequestSheet';

interface Request {
  id: string;
  clubTmProfile?: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  contactId?: string;
  contactName?: string;
  contactPhoneNumber?: string;
  position?: string;
  quantity?: number;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  createdAt?: number;
  status?: string;
  euOnly?: boolean;
  createdByAgent?: string;
  createdByAgentHebrew?: string;
}


/** Normalize ST → CF so both map to the same position group */
function normalizePosition(pos: string | undefined): string {
  const p = pos?.trim().toUpperCase();
  if (p === 'ST') return 'CF';
  return pos?.trim() || '';
}

/** Split scout analysis text into readable bullet points (by sentence) */
function parseScoutAnalysisBullets(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith('.') ? s : s + '.'));
}

/** Shorten scout position (e.g. "Attack - Centre-Forward" → "CF") for compact display */
function shortenScoutPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const p = pos.trim();
  if (p.includes('Centre-Forward') || p.includes('Center-Forward')) return 'CF';
  if (p.includes('Second Striker')) return 'SS';
  if (p.includes('Centre-Back') || p.includes('Center-Back')) return 'CB';
  if (p.includes('Left-Back')) return 'LB';
  if (p.includes('Right-Back')) return 'RB';
  if (p.includes('Defensive Midfield')) return 'DM';
  if (p.includes('Central Midfield')) return 'CM';
  if (p.includes('Attacking Midfield')) return 'AM';
  if (p.includes('Left Wing') || p.includes('Left Winger')) return 'LW';
  if (p.includes('Right Wing') || p.includes('Right Winger')) return 'RW';
  if (p.includes('Goalkeeper')) return 'GK';
  return p.split(' - ').pop() || p;
}

function footLabel(foot?: string, t: (k: string) => string = (k) => k): string {
  if (!foot) return '';
  if (foot === 'left') return t('player_info_foot_left');
  if (foot === 'right') return t('player_info_foot_right');
  return t('player_info_foot_both');
}

function ageRange(r: Request): string | null {
  if (r.ageDoesntMatter !== false && !r.minAge && !r.maxAge) return null;
  if (r.minAge && r.maxAge) return `${r.minAge}–${r.maxAge}`;
  if (r.minAge) return `${r.minAge}+`;
  if (r.maxAge) return `≤${r.maxAge}`;
  return null;
}

/** Renders clubCountryFlag: if it's a URL, show as img; otherwise skip (never show raw URL as text). */
function FlagImage({ url, country, className }: { url?: string; country?: string; className?: string }) {
  if (!url?.trim()) return null;
  if (!url.startsWith('http')) return null;
  return (
    <img
      src={url}
      alt={country || ''}
      className={className ?? 'w-6 h-6 rounded-full object-cover'}
    />
  );
}

interface RequestsCache {
  requests: Request[];
  players: RosterPlayer[];
  shortlistUrls: string[];
}

/** Map WomanPlayer to RosterPlayer for request matching (same logic, compatible fields). */
function womanToRosterPlayer(w: WomanPlayer): RosterPlayer {
  return {
    id: w.id,
    fullName: w.fullName,
    age: w.age,
    positions: w.positions ?? [],
    foot: w.foot,
    profileImage: w.profileImage,
    marketValue: w.marketValue,
    currentClub: w.currentClub,
    tmProfile: w.fmInsideUrl ?? w.soccerDonnaUrl ?? undefined,
  };
}

export default function RequestsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const { platform } = usePlatform();
  const router = useRouter();
  const euCountries = useEuCountries();
  const clubRequestsCollection = CLUB_REQUESTS_COLLECTIONS[platform];
  const playersCollection = PLAYERS_COLLECTIONS[platform];
  const shortlistsCollection = SHORTLISTS_COLLECTIONS[platform];
  const requestsCacheKey = user ? `requests_${platform}_${user.uid}` : undefined;
  const cached = requestsCacheKey ? getScreenCache<RequestsCache>(requestsCacheKey) : undefined;
  const [requests, setRequests] = useState<Request[]>(cached?.requests ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Request | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Request | null>(null);
  const [players, setPlayers] = useState<RosterPlayer[]>(cached?.players ?? []);
  const [expandedMatchingPlayers, setExpandedMatchingPlayers] = useState<Set<string>>(new Set());
  const [scoutLoadingRequestId, setScoutLoadingRequestId] = useState<string | null>(null);
  const [scoutResultsByRequestId, setScoutResultsByRequestId] = useState<Record<string, ScoutPlayerSuggestion[]>>({});
  const [scoutExpandedRequestId, setScoutExpandedRequestId] = useState<string | null>(null);
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(
    () => new Set(cached?.shortlistUrls ?? [])
  );
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [scoutErrorByRequestId, setScoutErrorByRequestId] = useState<Record<string, string>>({});
  const [clubIntelByClub, setClubIntelByClub] = useState<Record<string, ClubIntelligence>>({});
  const [clubIntelLoading, setClubIntelLoading] = useState<string | null>(null);
  const [clubIntelExpandedRequestId, setClubIntelExpandedRequestId] = useState<string | null>(null);
  const [clubIntelError, setClubIntelError] = useState<Record<string, string>>({});
  const [agentHebrewMap, setAgentHebrewMap] = useState<Record<string, string>>({});

  /** playerTmProfile → aggregated validLeagues from all active mandate docs */
  const [mandateLeaguesByPlayer, setMandateLeaguesByPlayer] = useState<Record<string, string[]>>({});

  const isHebrew = lang === 'he';
  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';
  const feedEventsCollection = FEED_EVENTS_COLLECTIONS[platform];
  const playerDocumentsCollection = PLAYER_DOCUMENTS_COLLECTIONS[platform];

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Load agent English→Hebrew name map from Accounts
  useEffect(() => {
    getAllAccounts().then((accounts) => {
      const map: Record<string, string> = {};
      for (const a of accounts) {
        if (a.name && a.hebrewName) map[a.name] = a.hebrewName;
      }
      setAgentHebrewMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, shortlistsCollection);
    const unsub = onSnapshot(
      colRef,
      (snap) => {
        setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
      },
      () => {}
    );
    return () => unsub();
  }, [user, shortlistsCollection]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, clubRequestsCollection),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Request));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setRequests(list);
        setLoadingList(false);
      },
      (err) => {
        console.error('Requests snapshot error:', err);
        setLoadingList(false);
      }
    );
    return () => unsub();
  }, [clubRequestsCollection]);

  useEffect(() => {
    if (platform === 'women') {
      const unsub = subscribePlayersWomen((list) => {
        setPlayers(list.map(womanToRosterPlayer));
      });
      return unsub;
    }
    const q = query(collection(db, playersCollection), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer));
      setPlayers(list);
    });
    return () => unsub();
  }, [platform, playersCollection]);

  // Load all active mandate documents to match players with mandates to clubs
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, playerDocumentsCollection),
      where('type', '==', 'MANDATE')
    );
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      const byPlayer: Record<string, string[]> = {};
      for (const d of snap.docs) {
        const data = d.data();
        const profile = data.playerTmProfile as string | undefined;
        if (!profile) continue;
        if (data.expired === true) continue;
        const expiresAt = data.expiresAt as number | undefined;
        if (!expiresAt || expiresAt < now) continue;
        const leagues = (data.validLeagues as string[] | undefined) ?? [];
        if (!byPlayer[profile]) byPlayer[profile] = [];
        byPlayer[profile].push(...leagues);
      }
      // Deduplicate leagues per player
      for (const key of Object.keys(byPlayer)) {
        byPlayer[key] = Array.from(new Set(byPlayer[key]));
      }
      console.log('[Mandate] Loaded', Object.keys(byPlayer).length, 'players with active mandates');
      setMandateLeaguesByPlayer(byPlayer);
    }, (err) => {
      console.error('[Mandate] Error loading mandate documents:', err);
    });
    return () => unsub();
  }, [user, playerDocumentsCollection]);

  useEffect(() => {
    if (requestsCacheKey) {
      setScreenCache<RequestsCache>(requestsCacheKey, {
        requests,
        players,
        shortlistUrls: Array.from(shortlistUrls),
      });
    }
  }, [requests, players, shortlistUrls, requestsCacheKey]);

  const byPositionCountry = useMemo(() => {
    const pending = requests.filter((r) => (r.status || 'pending') === 'pending');
    const byPos: Record<string, Record<string, Request[]>> = {};
    const posOrder = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LM', 'RM', 'LW', 'RW', 'CF', 'SS'];
    for (const r of pending) {
      const pos = normalizePosition(r.position) || 'Other';
      if (!byPos[pos]) byPos[pos] = {};
      const country = r.clubCountry?.trim() || 'Other';
      if (!byPos[pos][country]) byPos[pos][country] = [];
      byPos[pos][country].push(r);
    }
    const sorted: Record<string, Record<string, Request[]>> = {};
    const orderedPos = Object.keys(byPos).sort((a, b) => {
      const ia = posOrder.indexOf(a);
      const ib = posOrder.indexOf(b);
      return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
    });
    for (const pos of orderedPos) {
      if (!byPos[pos]) continue;
      const countries = Object.keys(byPos[pos]).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });
      sorted[pos] = {};
      for (const c of countries) sorted[pos][c] = byPos[pos][c];
    }
    return sorted;
  }, [requests]);

  const totalCount = requests.length;
  const positionsCount = Object.keys(byPositionCountry).length;

  const matchingPlayersByRequestId = useMemo(() => {
    const byId: Record<string, RosterPlayer[]> = {};
    for (const r of requests) {
      if (!r.id) continue;
      byId[r.id] = matchRequestToPlayers(r, players, euCountries);
    }
    return byId;
  }, [requests, players, euCountries]);

  /** Normalize text for fuzzy club name matching: strip diacritics, punctuation, collapse whitespace */
  const normalizeClub = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .replace(/[.,'\-]/g, ' ')                         // punctuation → space
      .replace(/\s+/g, ' ')                              // collapse whitespace
      .trim().toLowerCase();

  /** Check if two club names match (exact or one contains the other) */
  const clubNamesMatch = (a: string, b: string) =>
    a === b || a.includes(b) || b.includes(a);

  /** Players with active mandates matching each request's club */
  const mandatePlayersByRequestId = useMemo(() => {
    const byId: Record<string, RosterPlayer[]> = {};
    if (Object.keys(mandateLeaguesByPlayer).length === 0) return byId;
    const playersWithMandate = players.filter((p) => {
      const profile = p.tmProfile || p.id;
      return profile && mandateLeaguesByPlayer[profile];
    });
    if (playersWithMandate.length === 0) return byId;
    for (const r of requests) {
      if (!r.id || !r.position) continue;
      const clubName = r.clubName?.trim();
      const clubCountry = r.clubCountry?.trim();
      const clubNameNorm = clubName ? normalizeClub(clubName) : undefined;
      const clubCountryNorm = clubCountry ? normalizeClub(clubCountry) : undefined;
      const reqPos = normalizePosition(r.position).toUpperCase();
      const matched = playersWithMandate.filter((p) => {
        // Position check
        const playerPositions = (p.positions ?? [])
          .filter((pos): pos is string => !!pos)
          .map((pos) => normalizePosition(pos).toUpperCase());
        if (!playerPositions.includes(reqPos)) return false;
        // Mandate check
        const profile = p.tmProfile || p.id;
        const leagues = mandateLeaguesByPlayer[profile] ?? [];
        const leaguesNorm = leagues.map(normalizeClub);
        if (leaguesNorm.some((l) => l === 'worldwide')) return true;
        if (clubCountryNorm && leaguesNorm.some((l) => l === clubCountryNorm)) return true;
        if (clubNameNorm && clubCountryNorm) {
          const clubEntry = `${clubNameNorm} - ${clubCountryNorm}`;
          if (leaguesNorm.some((l) => l === clubEntry)) return true;
        }
        // Fuzzy club-name match: covers partial names, abbreviations, spelling differences
        if (clubNameNorm) {
          for (const l of leaguesNorm) {
            const clubPart = l.includes(' - ') ? l.split(' - ')[0] : l;
            if (clubNamesMatch(clubNameNorm, clubPart)) return true;
          }
        }
        return false;
      });
      if (matched.length > 0) byId[r.id] = matched;
    }
    return byId;
  }, [requests, players, mandateLeaguesByPlayer]);

  /** Flat list of pending requests for table view */
  const pendingRequests = useMemo(() => {
    return requests.filter((r) => (r.status || 'pending') === 'pending');
  }, [requests]);

  /** All unique positions present in pending requests */
  const activePositions = useMemo(() => {
    const posOrder = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'CF', 'SS'];
    const posSet = new Set(pendingRequests.map((r) => normalizePosition(r.position) || 'Other'));
    return posOrder.filter((p) => posSet.has(p)).concat(posSet.has('Other') ? ['Other'] : []);
  }, [pendingRequests]);

  /** Filtered requests based on search, position, and match status */
  const filteredRequests = useMemo(() => {
    let list = pendingRequests;
    if (positionFilter !== 'all') {
      list = list.filter((r) => (normalizePosition(r.position) || 'Other') === positionFilter);
    }
    if (matchStatusFilter === 'matched') {
      list = list.filter((r) => (matchingPlayersByRequestId[r.id] ?? []).length > 0);
    } else if (matchStatusFilter === 'unmatched') {
      list = list.filter((r) => (matchingPlayersByRequestId[r.id] ?? []).length === 0);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) =>
        (r.clubName || '').toLowerCase().includes(q) ||
        (r.clubCountry || '').toLowerCase().includes(q) ||
        (r.contactName || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q) ||
        (r.position || '').toLowerCase().includes(q) ||
        (r.createdByAgent || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [pendingRequests, positionFilter, matchStatusFilter, searchQuery, matchingPlayersByRequestId]);

  /** Stats for summary strip */
  const matchStats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    for (const r of pendingRequests) {
      if ((matchingPlayersByRequestId[r.id] ?? []).length > 0) matched++;
      else unmatched++;
    }
    const countriesSet = new Set(pendingRequests.map((r) => r.clubCountry?.trim()).filter(Boolean));
    const oneDayAgo = Date.now() - 86400000;
    const newToday = pendingRequests.filter((r) => r.createdAt && r.createdAt > oneDayAgo).length;
    return { matched, unmatched, countries: countriesSet.size, newToday };
  }, [pendingRequests, matchingPlayersByRequestId]);

  /** Position color class helper */
  const positionColor = (pos?: string): string => {
    if (!pos) return 'bg-gray-500/20 text-gray-400';
    const p = pos.trim().toUpperCase();
    if (p === 'GK') return 'bg-amber-500/20 text-amber-400';
    if (['CB', 'LB', 'RB'].includes(p)) return 'bg-blue-500/20 text-blue-400';
    if (['DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW'].includes(p)) return 'bg-emerald-500/20 text-emerald-400';
    if (['CF', 'SS'].includes(p)) return 'bg-red-500/20 text-red-400';
    return 'bg-gray-500/20 text-gray-400';
  };

  const toggleMatchingPlayers = (requestId: string) => {
    setExpandedMatchingPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  };

  const fetchClubIntel = async (clubTmProfile: string, requestId: string) => {
    if (!clubTmProfile) return;
    // Toggle if already expanded
    if (clubIntelExpandedRequestId === requestId) {
      setClubIntelExpandedRequestId(null);
      return;
    }
    setClubIntelLoading(requestId);
    setClubIntelExpandedRequestId(requestId);
    setClubIntelError((prev) => ({ ...prev, [clubTmProfile]: '' }));
    try {
      const res = await fetch(`/api/club-intel?clubTmProfile=${encodeURIComponent(clubTmProfile)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClubIntelByClub((prev) => ({ ...prev, [clubTmProfile]: data }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setClubIntelError((prev) => ({ ...prev, [clubTmProfile]: msg }));
    } finally {
      setClubIntelLoading(null);
    }
  };

  const fetchScoutPlayers = async (r: Request) => {
    if (!r.id) return;
    setScoutLoadingRequestId(r.id);
    setScoutExpandedRequestId(r.id);
    setScoutErrorByRequestId((prev) => ({ ...prev, [r.id!]: '' }));
    try {
      const results = await findPlayersForRequest({
        position: r.position || undefined,
        ageMin: r.minAge || undefined,
        ageMax: r.maxAge || undefined,
        foot: r.dominateFoot && r.dominateFoot !== 'any' ? r.dominateFoot : undefined,
        notes: r.notes || undefined,
        transferFee: r.transferFee || undefined,
        salaryRange: r.salaryRange || undefined,
        requestId: r.id || undefined,
        lang: lang === 'he' ? 'he' : 'en',
        clubUrl: r.clubTmProfile || undefined,
        clubName: r.clubName || undefined,
        clubCountry: r.clubCountry || undefined,
      });
      setScoutResultsByRequestId((prev) => ({ ...prev, [r.id!]: results }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Scout API error:', err);
      setScoutErrorByRequestId((prev) => ({ ...prev, [r.id!]: msg }));
      setScoutResultsByRequestId((prev) => ({ ...prev, [r.id!]: [] }));
    } finally {
      setScoutLoadingRequestId(null);
    }
  };

  const addScoutPlayerToShortlist = useCallback(
    async (s: ScoutPlayerSuggestion, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = s.transfermarktUrl;
      if (!user || !url) return;
      setShortlistError(null);
      setAddingToShortlistUrl(url);
      try {
        const rosterExists = players.some((p) => p.tmProfile === url);
        if (rosterExists) {
          setShortlistError(t('shortlist_player_in_roster'));
          return;
        }
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
        await callShortlistAdd({
          platform,
          tmProfileUrl: url,
          ...entryFields,
        });
      } catch (err) {
        console.error('Add to shortlist error:', err);
        setShortlistError(err instanceof Error ? err.message : 'Failed to add');
      } finally {
        setAddingToShortlistUrl(null);
      }
    },
    [user, players, t, platform]
  );

  const handleDelete = async (r: Request) => {
    if (!r.id) return;
    setDeleting(true);
    try {
      const agentName = user ? (await getCurrentAccountForShortlist(user)).name ?? null : null;
      await callRequestsDelete({ platform, requestId: r.id, agentName: agentName ?? undefined });
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete request failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const togglePosition = (pos: string) => {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  const toggleCountry = (key: string) => {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {isYouth ? t('requests_title_youth') : isWomen ? t('requests_title_women') : t('requests_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">{isYouth ? t('requests_subtitle_youth') : isWomen ? t('requests_subtitle_women') : t('requests_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            className={`shrink-0 px-5 py-2.5 rounded-xl font-semibold transition ${
              isYouth
                ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.3)] hover:opacity-90'
                : isWomen
                ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
            }`}
          >
            {t('requests_add')}
          </button>
        </div>

        {/* Summary strip with match stats */}
        <div className={`flex flex-wrap gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-5 p-3 sm:p-4 rounded-2xl bg-mgsr-card border border-mgsr-border ${isYouth ? 'shadow-[0_0_30px_rgba(0,212,255,0.06)]' : isWomen ? 'shadow-[0_0_30px_rgba(232,160,191,0.06)]' : ''}`}>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${isYouth ? 'bg-[var(--youth-cyan)]' : isWomen ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal'}`} />
            <span className="text-mgsr-text font-semibold">{pendingRequests.length}</span>
            <span className="text-mgsr-muted text-sm">{t('requests_stat_total')}</span>
          </div>
          <div className="w-px bg-mgsr-border" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-mgsr-text font-semibold">{positionsCount}</span>
            <span className="text-mgsr-muted text-sm">{t('requests_stat_positions')}</span>
          </div>
          <div className="w-px bg-mgsr-border" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-emerald-400 font-semibold">{matchStats.matched}</span>
            <span className="text-mgsr-muted text-sm">{isHebrew ? 'עם התאמות' : 'Matched'}</span>
          </div>
          <div className="w-px bg-mgsr-border" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span className="text-orange-400 font-semibold">{matchStats.unmatched}</span>
            <span className="text-mgsr-muted text-sm">{isHebrew ? 'ללא התאמות' : 'Unmatched'}</span>
          </div>
          {matchStats.countries > 0 && (
            <>
              <div className="w-px bg-mgsr-border hidden sm:block" />
              <div className="flex items-center gap-2 hidden sm:flex">
                <span className="text-mgsr-text font-semibold">{matchStats.countries}</span>
                <span className="text-mgsr-muted text-sm">{isHebrew ? 'מדינות' : 'Countries'}</span>
              </div>
            </>
          )}
          {matchStats.newToday > 0 && (
            <>
              <div className="w-px bg-mgsr-border hidden sm:block" />
              <div className="flex items-center gap-2 hidden sm:flex">
                <span className="text-emerald-400 font-semibold">{matchStats.newToday}</span>
                <span className="text-mgsr-muted text-sm">{isHebrew ? 'חדשות היום' : 'New today'}</span>
              </div>
            </>
          )}
        </div>

        {/* Search + Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-mgsr-card border border-mgsr-border flex-1 sm:max-w-sm">
            <svg className="w-4 h-4 text-mgsr-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isHebrew ? 'חיפוש מועדון, מדינה, איש קשר...' : 'Search club, country, contact...'}
              className="bg-transparent text-mgsr-text text-sm outline-none w-full placeholder:text-mgsr-muted/50"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="text-mgsr-muted hover:text-mgsr-text">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          {/* Position filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setPositionFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                positionFilter === 'all'
                  ? 'border-mgsr-teal text-mgsr-teal bg-mgsr-teal/10'
                  : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80'
              }`}
            >
              {isHebrew ? 'הכל' : 'All'}
            </button>
            {activePositions.map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setPositionFilter(positionFilter === pos ? 'all' : pos)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                  positionFilter === pos
                    ? 'border-mgsr-teal text-mgsr-teal bg-mgsr-teal/10'
                    : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80'
                }`}
              >
                {getPositionDisplayName(pos, isHebrew)}
              </button>
            ))}
            <div className="w-px h-5 bg-mgsr-border shrink-0 mx-1" />
            <button
              type="button"
              onClick={() => setMatchStatusFilter(matchStatusFilter === 'matched' ? 'all' : 'matched')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition border whitespace-nowrap ${
                matchStatusFilter === 'matched'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                  : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {isHebrew ? 'עם התאמות' : 'Has Matches'}
            </button>
            <button
              type="button"
              onClick={() => setMatchStatusFilter(matchStatusFilter === 'unmatched' ? 'all' : 'unmatched')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition border whitespace-nowrap ${
                matchStatusFilter === 'unmatched'
                  ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                  : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {isHebrew ? 'ללא התאמות' : 'No Matches'}
            </button>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className={`flex items-center gap-3 ${isYouth ? 'text-[var(--youth-cyan)]/70' : isWomen ? 'text-[var(--women-rose)]/70' : 'text-mgsr-muted'}`}>
              <div className={`w-3 h-3 rounded-full animate-pulse ${isYouth ? 'bg-[var(--youth-cyan)]/50' : isWomen ? 'bg-[var(--women-rose)]/50' : 'bg-mgsr-teal/50'}`} />
              {isYouth ? t('requests_loading_youth') : isWomen ? t('requests_loading_women') : t('requests_loading')}
            </div>
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className={`relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center ${isYouth ? 'shadow-[0_0_30px_rgba(0,212,255,0.06)]' : isWomen ? 'shadow-[0_0_30px_rgba(232,160,191,0.06)]' : ''}`}>
            <div className={`absolute inset-0 ${isYouth ? 'bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.08)_0%,transparent_70%)]' : isWomen ? 'bg-[radial-gradient(ellipse_at_center,rgba(232,160,191,0.08)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]'}`} />
            <p className="text-mgsr-muted text-lg relative">{isYouth ? t('requests_empty_youth') : isWomen ? t('requests_empty_women') : t('requests_empty')}</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <p className="text-mgsr-muted">{isHebrew ? 'אין תוצאות עם הסינון הנוכחי' : 'No results with current filters'}</p>
            <button type="button" onClick={() => { setSearchQuery(''); setPositionFilter('all'); setMatchStatusFilter('all'); }} className="text-mgsr-teal text-sm mt-2 hover:underline">
              {isHebrew ? 'נקה סינונים' : 'Clear filters'}
            </button>
          </div>
        ) : (
          /* ── TABLE VIEW ── */
          <div className="rounded-2xl border border-mgsr-border overflow-hidden bg-mgsr-card">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-mgsr-dark/40">
                    <th className="text-start px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted">{isHebrew ? 'מועדון' : 'Club'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted">{isHebrew ? 'עמדה' : 'Pos'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted hidden sm:table-cell">{isHebrew ? 'שכר' : 'Salary'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted hidden sm:table-cell">{isHebrew ? 'דמי העברה' : 'Fee'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted hidden sm:table-cell">{isHebrew ? 'גיל' : 'Age'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted">{isHebrew ? 'התאמות' : 'Matches'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted">{isHebrew ? 'מנדט' : 'Mandate'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted hidden md:table-cell">{isHebrew ? 'איש קשר' : 'Contact'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted hidden lg:table-cell">{isHebrew ? 'הערות' : 'Notes'}</th>
                    <th className="text-start px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-mgsr-muted hidden sm:table-cell">{isHebrew ? 'תגיות' : 'Tags'}</th>
                    <th className="px-3 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => {
                    const matchingPlayers = (r.id ? matchingPlayersByRequestId[r.id] : []) ?? [];
                    const mandatePlayers = (r.id ? mandatePlayersByRequestId[r.id] : []) ?? [];
                    const matchCount = matchingPlayers.length;
                    const mandateCount = mandatePlayers.length;
                    const ageStr = ageRange(r);
                    const footStr = r.dominateFoot && r.dominateFoot !== 'any' ? footLabel(r.dominateFoot, t) : null;
                    const isRowExpanded = expandedRowId === r.id;
                    const isNew = r.createdAt && (Date.now() - r.createdAt < 86400000);

                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          className={`border-t border-mgsr-border/50 transition cursor-pointer ${isRowExpanded ? 'bg-mgsr-dark/30' : 'hover:bg-mgsr-dark/20'}`}
                          onClick={() => setExpandedRowId(isRowExpanded ? null : r.id)}
                        >
                          {/* Club */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {r.clubLogo && r.clubLogo.startsWith('http') ? (
                                <img src={r.clubLogo} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-mgsr-border flex items-center justify-center shrink-0">
                                  <span className="text-mgsr-muted text-[10px] font-bold">{(r.clubName || '?').slice(0, 2).toUpperCase()}</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-mgsr-text text-sm truncate">
                                  {r.clubTmProfile ? (
                                    <a href={r.clubTmProfile} target="_blank" rel="noopener noreferrer" className="hover:text-mgsr-teal transition-colors" onClick={(e) => e.stopPropagation()}>
                                      {r.clubName || '—'}
                                    </a>
                                  ) : (r.clubName || '—')}
                                </p>
                                <p className="text-[11px] text-mgsr-muted truncate">
                                  {r.clubCountryFlag && r.clubCountryFlag.startsWith('http') && (
                                    <img src={r.clubCountryFlag} alt="" className="w-3.5 h-3.5 rounded-full inline-block mr-1 align-text-bottom" />
                                  )}
                                  {getCountryDisplayName(r.clubCountry || '', isHebrew)}
                                  {r.createdAt && (
                                    <span className="ml-1.5 text-mgsr-muted/60">
                                      · {new Date(r.createdAt).toLocaleDateString(isHebrew ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })}
                                    </span>
                                  )}
                                </p>
                                {r.createdByAgent && (
                                  <p className="text-[10px] text-mgsr-muted/50 truncate">
                                    {isHebrew ? 'נפתח ע"י' : 'Opened by'} {isHebrew ? (r.createdByAgentHebrew || agentHebrewMap[r.createdByAgent] || r.createdByAgent) : r.createdByAgent}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Position */}
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${positionColor(r.position)}`}>
                              {getPositionDisplayName(r.position, isHebrew) || '—'}
                            </span>
                          </td>

                          {/* Salary */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            {r.salaryRange && r.salaryRange !== 'N/A' ? (
                              <span className="text-emerald-400 text-xs font-medium">€{r.salaryRange}{isHebrew ? '' : 'K /mo'}</span>
                            ) : (
                              <span className="text-mgsr-muted/30 text-xs">—</span>
                            )}
                          </td>

                          {/* Fee */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            {r.transferFee && r.transferFee !== 'N/A' ? (
                              <span className="text-xs text-mgsr-muted">{r.transferFee === 'Free/Free loan' ? (isHebrew ? 'חינם' : 'Free') : r.transferFee}</span>
                            ) : (
                              <span className="text-mgsr-muted/30 text-xs">—</span>
                            )}
                          </td>

                          {/* Age */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <span className="text-xs text-mgsr-muted font-mono">{ageStr || '—'}</span>
                          </td>

                          {/* Matches */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${matchCount >= 3 ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : matchCount >= 1 ? 'bg-orange-400' : 'bg-mgsr-muted/40'}`} />
                              <span className={`text-sm font-semibold ${matchCount > 0 ? 'text-mgsr-text' : 'text-mgsr-muted'}`}>{matchCount}</span>
                              <span className="text-[11px] text-mgsr-muted hidden sm:inline">{matchCount === 1 ? (isHebrew ? 'התאמה' : 'match') : (isHebrew ? 'התאמות' : 'matches')}</span>
                            </div>
                          </td>

                          {/* Mandate */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              {mandateCount > 0 ? (
                                <>
                                  <span className="text-sm">✍️</span>
                                  <span className="text-sm font-semibold text-emerald-400">{mandateCount}</span>
                                </>
                              ) : (
                                <span className="text-mgsr-muted/40 text-xs">—</span>
                              )}
                            </div>
                          </td>

                          {/* Contact */}
                          <td className="px-3 py-3 hidden md:table-cell">
                            {r.contactName ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-purple-500/15 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {r.contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-xs text-mgsr-muted">{r.contactName}</span>
                                {r.contactPhoneNumber && (
                                  <a
                                    href={toWhatsAppUrl(r.contactPhoneNumber) ?? `tel:${r.contactPhoneNumber}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-5 h-5 rounded-full bg-green-500/15 flex items-center justify-center shrink-0 hover:bg-green-500/25"
                                    onClick={(e) => e.stopPropagation()}
                                    title="WhatsApp"
                                  >
                                    <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-mgsr-muted/50">{isHebrew ? 'ישיר' : 'Direct'}</span>
                            )}
                          </td>

                          {/* Notes */}
                          <td className="px-3 py-3 hidden lg:table-cell">
                            {r.notes ? (
                              <span className="text-xs text-mgsr-muted block max-w-[280px] whitespace-pre-wrap" dir={isHebrew ? 'rtl' : 'ltr'}>
                                {r.notes}
                              </span>
                            ) : (
                              <span className="text-mgsr-muted/30 text-xs">—</span>
                            )}
                          </td>

                          {/* Tags */}
                          <td className="px-3 py-3 hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {r.euOnly && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">🇪🇺 EU</span>
                              )}
                              {footStr && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">{footStr}</span>
                              )}
                              {isNew && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{isHebrew ? 'חדש' : 'NEW'}</span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition" style={{ opacity: isRowExpanded ? 1 : undefined }}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setEditingRequest(r); setShowAddSheet(true); }}
                                className="w-7 h-7 rounded-md border border-mgsr-border flex items-center justify-center text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition text-xs"
                                title={t('requests_edit')}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(r); }}
                                className="w-7 h-7 rounded-md border border-mgsr-border flex items-center justify-center text-mgsr-muted hover:text-red-400 hover:border-red-400/50 transition text-xs"
                                title={t('requests_delete')}
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded inline detail panel ── */}
                        {isRowExpanded && (
                          <tr className="bg-mgsr-dark/20">
                            <td colSpan={11} className="p-0">
                              <div className="p-4 sm:p-5">
                                {/* Mobile-only: show budget/age/contact/notes that are hidden on small screens */}
                                <div className="sm:hidden space-y-2 mb-4 p-3 rounded-xl bg-mgsr-card border border-mgsr-border">
                                  <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="bg-mgsr-dark/40 rounded-lg p-2">
                                      <p className="text-[10px] text-mgsr-muted uppercase">{isHebrew ? 'שכר' : 'Salary'}</p>
                                      <p className="text-sm font-semibold text-emerald-400">{r.salaryRange && r.salaryRange !== 'N/A' ? `€${r.salaryRange}` : '—'}</p>
                                    </div>
                                    <div className="bg-mgsr-dark/40 rounded-lg p-2">
                                      <p className="text-[10px] text-mgsr-muted uppercase">{isHebrew ? 'דמי העברה' : 'Fee'}</p>
                                      <p className="text-sm font-semibold text-mgsr-text">{r.transferFee && r.transferFee !== 'N/A' ? (r.transferFee === 'Free/Free loan' ? (isHebrew ? 'חינם' : 'Free') : r.transferFee) : '—'}</p>
                                    </div>
                                    <div className="bg-mgsr-dark/40 rounded-lg p-2">
                                      <p className="text-[10px] text-mgsr-muted uppercase">{isHebrew ? 'גיל' : 'Age'}</p>
                                      <p className="text-sm font-semibold text-mgsr-text">{ageStr || '—'}</p>
                                    </div>
                                  </div>
                                  {r.notes && (
                                    <p className="text-xs text-mgsr-muted italic border-s-2 border-purple-500/40 ps-2" dir={isHebrew ? 'rtl' : 'ltr'}>{r.notes}</p>
                                  )}
                                  {r.contactName && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-mgsr-muted">{r.contactName}</span>
                                      {r.contactPhoneNumber && (
                                        <a href={toWhatsAppUrl(r.contactPhoneNumber) ?? `tel:${r.contactPhoneNumber}`} target="_blank" rel="noopener noreferrer" className="text-green-400 text-xs hover:underline" onClick={(e) => e.stopPropagation()}><svg className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>WhatsApp</a>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className={`grid grid-cols-1 ${mandateCount > 0 && !isWomen && !isYouth ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                                  {/* Left: Roster Matches */}
                                  <div className="rounded-xl bg-mgsr-card border border-mgsr-border p-4">
                                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-mgsr-muted mb-3 flex items-center gap-1.5">
                                      👥 {isHebrew ? 'התאמות מהמאגר' : 'Roster Matches'} ({matchCount})
                                    </h4>
                                    {matchCount === 0 ? (
                                      <p className="text-sm text-mgsr-muted py-4 text-center">{t('requests_no_match')}</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                                        {matchingPlayers.map((player) => (
                                          <Link
                                            key={player.id}
                                            href={`/players/${player.id}?from=/requests`}
                                            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-mgsr-teal/10 transition"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <img
                                              src={player.profileImage || 'https://via.placeholder.com/40?text=?'}
                                              alt=""
                                              className="w-8 h-8 rounded-full object-cover shrink-0 bg-mgsr-border"
                                              onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40?text=?'; }}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium text-mgsr-text text-sm truncate">{player.fullName || '—'}</p>
                                              <p className="text-[11px] text-mgsr-muted truncate">
                                                {player.positions?.filter(Boolean).join(', ') || '—'} · {player.age || '—'} · {player.marketValue || '—'}
                                              </p>
                                            </div>
                                            {player.currentClub?.clubLogo && (
                                              <img src={player.currentClub.clubLogo} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                            )}
                                          </Link>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Mandate Players */}
                                  <div className="rounded-xl bg-mgsr-card border border-mgsr-border p-4">
                                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-mgsr-muted mb-3 flex items-center gap-1.5">
                                      ✍️ {isHebrew ? 'שחקנים עם מנדט' : 'Players with Mandate'} ({mandateCount})
                                    </h4>
                                    {mandateCount === 0 ? (
                                      <p className="text-sm text-mgsr-muted py-4 text-center">{isHebrew ? 'אין שחקנים עם מנדט תואם' : 'No players with a matching mandate'}</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                                        {mandatePlayers.map((player) => (
                                          <Link
                                            key={player.id}
                                            href={`/players/${player.id}?from=/requests`}
                                            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-emerald-500/10 transition"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <img
                                              src={player.profileImage || 'https://via.placeholder.com/40?text=?'}
                                              alt=""
                                              className="w-8 h-8 rounded-full object-cover shrink-0 bg-mgsr-border"
                                              onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40?text=?'; }}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <p className="font-medium text-mgsr-text text-sm truncate">{player.fullName || '—'}</p>
                                              <p className="text-[11px] text-mgsr-muted truncate">
                                                {player.positions?.filter(Boolean).join(', ') || '—'} · {player.age || '—'} · {player.marketValue || '—'}
                                              </p>
                                            </div>
                                            {player.currentClub?.clubLogo && (
                                              <img src={player.currentClub.clubLogo} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                                            )}
                                          </Link>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: AI Scout (men only) */}
                                  {!isWomen && !isYouth && (
                                    <div className="rounded-xl bg-mgsr-card border border-mgsr-border p-4">
                                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-mgsr-muted mb-3 flex items-center gap-1.5">
                                        🤖 {isHebrew ? 'שחקנים מ-AI Scout' : 'AI Scout Suggestions'}
                                      </h4>
                                      {scoutLoadingRequestId === r.id ? (
                                        <div className="flex items-center justify-center gap-2 py-6">
                                          <span className="w-4 h-4 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
                                          <span className="text-sm text-mgsr-muted">{isHebrew ? 'מחפש שחקנים...' : 'Finding players...'}</span>
                                        </div>
                                      ) : scoutResultsByRequestId[r.id!]?.length ? (
                                        <div className="space-y-1.5">
                                          {scoutResultsByRequestId[r.id!]!.filter(s => s.transfermarktUrl).slice(0, 5).map((s) => {
                                            const url = s.transfermarktUrl!;
                                            const isInShortlist = shortlistUrls.has(url);
                                            const isAdding = addingToShortlistUrl === url;
                                            return (
                                              <div key={url} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-mgsr-teal/10 transition">
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                                                  s.matchPercent != null && s.matchPercent >= 75 ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' :
                                                  s.matchPercent != null && s.matchPercent >= 55 ? 'bg-mgsr-teal/15 text-mgsr-teal ring-1 ring-mgsr-teal/30' :
                                                  'bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/30'
                                                }`}>
                                                  {s.matchPercent ?? '?'}%
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-mgsr-text text-sm truncate block hover:text-mgsr-teal" onClick={(e) => e.stopPropagation()}>
                                                    {s.name || '—'}
                                                  </a>
                                                  <p className="text-[11px] text-mgsr-muted truncate">
                                                    {shortenScoutPosition(s.position)} · {s.age || '—'} · {s.marketValue || '—'}
                                                    {s.league && <span> · {s.league}</span>}
                                                  </p>
                                                </div>
                                                {isInShortlist ? (
                                                  <span className="text-[10px] text-amber-400 font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 shrink-0">{t('releases_saved')}</span>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => addScoutPlayerToShortlist(s, e)}
                                                    disabled={!!addingToShortlistUrl}
                                                    className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-mgsr-border text-mgsr-muted hover:text-emerald-400 hover:border-emerald-500/40 shrink-0 disabled:opacity-50"
                                                  >
                                                    {isAdding ? '...' : (isHebrew ? '+ שורטליסט' : '+ Shortlist')}
                                                  </button>
                                                )}
                                              </div>
                                            );
                                          })}
                                          {shortlistError && <p className="text-xs text-red-400 mt-1">{shortlistError}</p>}
                                        </div>
                                      ) : scoutExpandedRequestId === r.id && scoutErrorByRequestId[r.id!] ? (
                                        <p className="text-sm text-red-400 py-2">{scoutErrorByRequestId[r.id!]}</p>
                                      ) : scoutExpandedRequestId === r.id ? (
                                        <p className="text-sm text-mgsr-muted py-4 text-center">{t('requests_online_players_empty')}</p>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); fetchScoutPlayers(r); }}
                                          disabled={!!scoutLoadingRequestId}
                                          className="w-full py-4 text-center text-sm text-mgsr-teal hover:bg-mgsr-teal/5 rounded-lg transition disabled:opacity-50"
                                        >
                                          {t('requests_find_players_online')} →
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Club Intelligence — men only, needs clubTmProfile */}
                                {!isWomen && !isYouth && r.clubTmProfile && (() => {
                                  const clubUrl = r.clubTmProfile!;
                                  const reqId = r.id!;
                                  const isLoading = clubIntelLoading === reqId;
                                  const isExpanded = clubIntelExpandedRequestId === reqId;
                                  const intel = clubIntelByClub[clubUrl];
                                  const error = clubIntelError[clubUrl];
                                  return (
                                    <div className="mt-4 rounded-xl border border-mgsr-border overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); fetchClubIntel(clubUrl, reqId); }}
                                        disabled={!!clubIntelLoading}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-start hover:bg-mgsr-dark/30 transition disabled:opacity-60"
                                      >
                                        <span className="text-sm text-purple-400">{isHebrew ? 'מודיעין על המועדון' : 'Club Intelligence'}</span>
                                        {isLoading && <span className="shrink-0 w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />}
                                        {intel && !isLoading && <span className="text-xs text-mgsr-muted">{isExpanded ? '▲' : '▼'}</span>}
                                      </button>
                                      {isExpanded && !isLoading && (
                                        <div className="border-t border-mgsr-border">
                                          {error && <p className="text-sm text-red-400 px-3 py-2">{error}</p>}
                                          {intel && <ClubIntelPanel data={intel} isHebrew={isHebrew} />}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete confirmation dialog */}
        <AddRequestSheet
          open={showAddSheet}
          onClose={() => { setShowAddSheet(false); setEditingRequest(null); }}
          onSaved={() => { setEditingRequest(null); }}
          isWomen={isWomen}
          isYouth={isYouth}
          editRequest={editingRequest}
        />

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !deleting && setDeleteConfirm(null)}>
            <div
              className="bg-mgsr-card border border-mgsr-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-mgsr-text font-medium mb-4">
                {t('requests_delete_confirm')
                  .replace('{club}', deleteConfirm.clubName || '')
                  .replace('{position}', deleteConfirm.position || '')}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-dark/50"
                >
                  {t('tasks_cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  {deleting ? '…' : t('requests_delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
