'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, onSnapshot, addDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getReleasesAllPages,
  getReleasesAllRanges,
  getTeammates,
  extractPlayerIdFromUrl,
  ReleasePlayer,
} from '@/lib/api';
import {
  sortByMarketValue,
  sortReleases,
  getUniquePositions,
  filterByAge,
  type AgeFilter,
  type SortBy,
} from '@/lib/releases';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';

const VALUE_PRESETS = [
  { min: 0, max: 50000000, label: 'All', labelHe: 'הכל', isAll: true },
  { min: 0, max: 500000, label: '0-500K', labelHe: '0-500K', isAll: false },
  { min: 500000, max: 1000000, label: '500K-1M', labelHe: '500K-1M', isAll: false },
  { min: 1000000, max: 5000000, label: '1M-5M', labelHe: '1M-5M', isAll: false },
  { min: 5000000, max: 50000000, label: '5M+', labelHe: '5M+', isAll: false },
];

/** Session cache: do not refetch unless user presses Reload */
const sessionCache: Record<number, ReleasePlayer[]> = {};

const POSITION_ORDER = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const POSITION_EXCLUDED = new Set(['LM', 'RM']);
const POSITION_HEBREW: Record<string, string> = { SS: 'חלוץ שני' };

const AGE_FILTERS: { value: AgeFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'releases_age_all' },
  { value: 'u23', labelKey: 'releases_age_u23' },
  { value: '23-30', labelKey: 'releases_age_23_30' },
  { value: '30+', labelKey: 'releases_age_30plus' },
];

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

function ReleaseCard({
  player,
  onAddToShortlist,
  isAdding,
  isInShortlist,
  t,
  isRtl,
  rosterPlayers,
  teammatesCache,
  loadingTeammatesUrl,
  onToggleTeammates,
  onFetchTeammates,
  isTeammatesExpanded,
}: {
  player: ReleasePlayer;
  onAddToShortlist: (p: ReleasePlayer) => void;
  isAdding: boolean;
  isInShortlist: boolean;
  t: (k: string) => string;
  isRtl: boolean;
  rosterPlayers: RosterPlayer[];
  teammatesCache: Record<string, RosterTeammateMatch[]>;
  loadingTeammatesUrl: string | null;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;
  isTeammatesExpanded: string | null;
}) {
  const playerUrl = player.playerUrl || '';
  const rosterTeammates = playerUrl ? teammatesCache[playerUrl] : undefined;
  const isLoadingTeammates = loadingTeammatesUrl === playerUrl;
  const isExpanded = isTeammatesExpanded === playerUrl;

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a') || target.closest('button') || target.closest('[data-no-propagate]')) return;
      if (playerUrl) window.open(playerUrl, '_blank', 'noopener,noreferrer');
    },
    [playerUrl]
  );

  const handleTeammatesClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!playerUrl) return;
      onToggleTeammates(playerUrl);
      if (!(playerUrl in teammatesCache) && !loadingTeammatesUrl) {
        onFetchTeammates(playerUrl);
      }
    },
    [playerUrl, onToggleTeammates, onFetchTeammates, teammatesCache, loadingTeammatesUrl]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as unknown as React.MouseEvent);
        }
      }}
      className="group relative overflow-hidden rounded-2xl bg-mgsr-card border border-mgsr-border hover:border-mgsr-teal/40 transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50 focus:ring-offset-2 focus:ring-offset-mgsr-dark"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-mgsr-teal/5 via-transparent to-mgsr-dark/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-mgsr-teal/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
      <div className="relative p-5">
        <span className="absolute top-4 left-4 rtl:left-auto rtl:right-4 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {t('releases_free_agent')}
        </span>
        <div className="flex gap-4 mt-6">
          <div className="relative shrink-0">
            <img
              src={player.playerImage || 'https://via.placeholder.com/72'}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-mgsr-teal/50 transition-all duration-300 group-hover:scale-105"
            />
            {player.playerNationalityFlag && (
              <img
                src={player.playerNationalityFlag}
                alt=""
                className="absolute -bottom-1 -right-1 w-6 h-4 rounded object-cover border border-mgsr-dark shadow"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-lg text-mgsr-text truncate group-hover:text-mgsr-teal transition-colors">
              {player.playerName || 'Unknown'}
            </p>
            <p className="text-sm text-mgsr-muted mt-0.5">{player.playerPosition || '—'}</p>
            <div className="flex items-center gap-2 mt-2">
              {player.playerAge && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-mgsr-card border border-mgsr-border text-mgsr-muted">
                  {t('players_age_display').replace('{age}', player.playerAge)}
                </span>
              )}
              {player.playerNationality && (
                <span className="text-xs text-mgsr-muted truncate">{player.playerNationality}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-mgsr-border/80">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-display font-bold text-mgsr-teal">
              {player.marketValue || '—'}
            </span>
            {player.transferDate && (
              <span className="text-xs text-mgsr-muted truncate max-w-[100px]">
                {player.transferDate}
              </span>
            )}
          </div>
          <div data-no-propagate className="flex items-center gap-2">
            {isInShortlist ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                </svg>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                  {t('releases_saved')}
                </span>
                <Link
                  href="/shortlist"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-medium text-amber-400/90 hover:text-amber-300 underline underline-offset-2 decoration-amber-400/50 hover:decoration-amber-300 transition-colors"
                >
                  {t('releases_view_shortlist')} {isRtl ? '←' : '→'}
                </Link>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToShortlist(player);
                }}
                disabled={isAdding}
                className="group/bookmark flex items-center gap-2 px-3 py-1.5 rounded-full border border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-amber-500/40 hover:text-amber-400/90 hover:bg-amber-500/5 disabled:opacity-60 transition-all duration-200"
              >
                {isAdding ? (
                  <span className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />
                ) : (
                  <svg className="w-4 h-4 shrink-0 opacity-70 group-hover/bookmark:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                )}
                <span className="text-xs font-medium">
                  {isAdding ? t('shortlist_adding') : t('releases_bookmark')}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Roster teammates section */}
        <div className="mt-4" data-no-propagate>
          <button
            type="button"
            onClick={handleTeammatesClick}
            className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border hover:border-mgsr-teal/30 transition-all text-left rtl:text-right"
          >
            <svg className="w-4 h-4 text-mgsr-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm text-mgsr-text flex-1">
              {isLoadingTeammates
                ? t('releases_roster_teammates_loading')
                : rosterTeammates != null
                  ? t('releases_roster_teammates').replace('{count}', String(rosterTeammates.length))
                  : t('releases_roster_teammates_tap')}
            </span>
            <svg
              className={`w-4 h-4 text-mgsr-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-2">
              {isLoadingTeammates ? (
                <div className="py-6 flex justify-center">
                  <div className="w-5 h-5 border-2 border-mgsr-teal/40 border-t-mgsr-teal rounded-full animate-spin" />
                </div>
              ) : rosterTeammates?.length === 0 ? (
                <p className="text-xs text-mgsr-muted py-3 px-3 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/60">
                  {t('releases_no_roster_teammates')}
                </p>
              ) : (
                rosterTeammates?.map((match) => (
                  <Link
                    key={match.player.id}
                    href={`/players/${match.player.id}?from=/releases`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/80 hover:border-mgsr-teal/40 hover:bg-mgsr-dark/70 transition-all"
                  >
                    <img
                      src={match.player.profileImage || 'https://via.placeholder.com/40'}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover bg-mgsr-card ring-1 ring-mgsr-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-mgsr-text truncate">
                        {match.player.fullName || 'Unknown'}
                      </p>
                      <p className="text-xs text-mgsr-muted truncate">
                        {match.player.positions?.filter(Boolean).join(', ') || '—'} • {(match.player.age ? t('players_age_display').replace('{age}', match.player.age) : '—')} • {match.player.marketValue || '—'}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-mgsr-teal shrink-0 px-2 py-0.5 rounded-md bg-mgsr-teal/15">
                      {t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SORT_OPTIONS: { value: SortBy; labelKey: string }[] = [
  { value: 'value', labelKey: 'releases_sort_value' },
  { value: 'date', labelKey: 'releases_sort_date' },
  { value: 'age', labelKey: 'releases_sort_age' },
];

interface ReleasesCache {
  players: ReleasePlayer[];
  preset: number;
  search: string;
  positionFilter: string | null;
  ageFilter: AgeFilter;
  sortBy: SortBy;
  rosterPlayers: RosterPlayer[];
  shortlistUrls: string[];
}

export default function ReleasesPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const cached = user ? getScreenCache<ReleasesCache>('releases', user.uid) : undefined;
  const [players, setPlayers] = useState<ReleasePlayer[]>(cached?.players ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState(cached?.preset ?? 0);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>(cached?.ageFilter ?? 'all');
  const [sortBy, setSortBy] = useState<SortBy>(cached?.sortBy ?? 'value');
  const [firestorePositions, setFirestorePositions] = useState<{ name?: string; hebrewName?: string }[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>(cached?.rosterPlayers ?? []);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(
    () => new Set(cached?.shortlistUrls ?? [])
  );
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    getDocs(collection(db, 'Positions'))
      .then((snap) =>
        setFirestorePositions(
          snap.docs.map((d) => d.data()).sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'Players'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRosterPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const loadReleases = useCallback(async () => {
    setError('');
    setLoadingList(true);
    const currentPreset = preset;
    const uid = user?.uid;
    try {
      const p = VALUE_PRESETS[preset];
      const list = p.isAll
        ? await getReleasesAllRanges()
        : await getReleasesAllPages(p.min, p.max);
      const sorted = sortByMarketValue(list);
      sessionCache[currentPreset] = sorted;
      if (isMountedRef.current) {
        setPlayers(sorted);
      } else if (uid) {
        setScreenCache<ReleasesCache>(
          'releases',
          {
            players: sorted,
            preset: currentPreset,
            search,
            positionFilter,
            ageFilter,
            sortBy,
            rosterPlayers,
            shortlistUrls: Array.from(shortlistUrls),
          },
          uid
        );
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : t('releases_empty'));
        setPlayers([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoadingList(false);
      }
    }
  }, [preset, t, user?.uid, search, positionFilter, ageFilter, sortBy, rosterPlayers, shortlistUrls]);

  useEffect(() => {
    const sessionCached = sessionCache[preset];
    if (sessionCached) {
      setPlayers(sessionCached);
      setLoadingList(false);
    } else {
      loadReleases();
    }
  }, [preset, loadReleases]);

  useEffect(() => {
    setScreenCache<ReleasesCache>(
      'releases',
      {
        players,
        preset,
        search,
        positionFilter,
        ageFilter,
        sortBy,
        rosterPlayers,
        shortlistUrls: Array.from(shortlistUrls),
      },
      user?.uid ?? undefined
    );
  }, [players, preset, search, positionFilter, ageFilter, sortBy, rosterPlayers, shortlistUrls, user?.uid]);

  const addToShortlist = useCallback(
    async (player: ReleasePlayer) => {
      if (!user || !player.playerUrl) return;
      setAddingUrl(player.playerUrl);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const colRef = collection(db, 'Shortlists');
        const rosterExists = rosterPlayers.some((p) => p.tmProfile === player.playerUrl);
        if (rosterExists) {
          setError(t('shortlist_player_in_roster'));
          return;
        }
        const entry: Record<string, unknown> = {
          tmProfileUrl: player.playerUrl,
          addedAt: Date.now(),
          playerImage: player.playerImage ?? null,
          playerName: player.playerName ?? null,
          playerPosition: player.playerPosition ?? null,
          playerAge: player.playerAge ?? null,
          playerNationality: player.playerNationality ?? null,
          playerNationalityFlag: player.playerNationalityFlag ?? null,
          clubJoinedName: null,
          transferDate: player.transferDate ?? null,
          marketValue: player.marketValue ?? null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        const q = query(colRef, where('tmProfileUrl', '==', player.playerUrl));
        const existsSnap = await getDocs(q);
        if (existsSnap.empty) {
          await addDoc(colRef, entry);
          const feedEvent: Record<string, unknown> = {
            type: 'SHORTLIST_ADDED',
            playerName: entry.playerName ?? null,
            playerImage: entry.playerImage ?? null,
            playerTmProfile: player.playerUrl,
            timestamp: Date.now(),
            agentName: account.name ?? null,
          };
          await addDoc(collection(db, 'FeedEvents'), feedEvent);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add');
      } finally {
        setAddingUrl(null);
      }
    },
    [user, rosterPlayers, t]
  );

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

  const positions = useMemo(() => {
    const fromData = getUniquePositions(players);
    const fromFirestore = firestorePositions.map((p) => p.name).filter(Boolean) as string[];
    const merged = new Set([...fromFirestore, ...fromData]);
    return Array.from(merged)
      .filter((p) => !POSITION_EXCLUDED.has(p.toUpperCase()))
      .sort((a, b) => {
        const ia = POSITION_ORDER.indexOf(a.toUpperCase());
        const ib = POSITION_ORDER.indexOf(b.toUpperCase());
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      });
  }, [players, firestorePositions]);

  const filteredPlayers = useMemo(() => {
    let result = players;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.playerName?.toLowerCase().includes(q) ||
          p.playerPosition?.toLowerCase().includes(q) ||
          p.playerNationality?.toLowerCase().includes(q)
      );
    }
    if (positionFilter) {
      result = result.filter(
        (p) => p.playerPosition?.toLowerCase() === positionFilter.toLowerCase()
      );
    }
    result = filterByAge(result, ageFilter);
    return result;
  }, [players, search, positionFilter, ageFilter]);

  const sortedPlayers = useMemo(
    () => sortReleases(filteredPlayers, sortBy),
    [filteredPlayers, sortBy]
  );

  const hasActiveFilters = search.trim() || positionFilter || ageFilter !== 'all';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {t('releases_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">{t('releases_value_filter')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(!loadingList || players.length > 0 || error) && (
              <button
                onClick={() => loadReleases()}
                disabled={loadingList}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-teal hover:bg-mgsr-teal/20 hover:border-mgsr-teal/40 disabled:opacity-50 transition"
              >
                {t('releases_reload')}
              </button>
            )}
            {VALUE_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPreset(i)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                  preset === i
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30'
                }`}
              >
                {p.isAll ? t('releases_all') : isRtl ? p.labelHe : p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-mgsr-red/20 border border-mgsr-red/30 text-mgsr-red">
            {error}
          </div>
        )}

        {loadingList ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t('releases_loading')}</div>
          </div>
        ) : players.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-2 relative">{t('releases_empty')}</p>
            <p className="text-mgsr-muted/80 text-sm relative">{t('releases_try_filter')}</p>
          </div>
        ) : (
          <>
            {/* Stats strip */}
            <div className="flex flex-wrap items-center gap-4 mb-4 py-3 px-4 rounded-xl bg-mgsr-card/50 border border-mgsr-border">
              <span className="text-sm text-mgsr-muted">
                {t('releases_stats_total')}: <strong className="text-mgsr-text">{players.length}</strong>
              </span>
              <span className="text-sm text-mgsr-muted">
                {t('releases_stats_showing')}: <strong className="text-mgsr-teal">{filteredPlayers.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-mgsr-muted">{t('releases_sort')}:</span>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      sortBy === opt.value
                        ? 'bg-mgsr-teal text-mgsr-dark'
                        : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Search + filters */}
            <div className="flex flex-col gap-4 mb-6">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('releases_search')}
                className="w-full max-w-md px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60"
              />
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-mgsr-muted self-center">{t('releases_position')}:</span>
                <button
                  onClick={() => setPositionFilter(null)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    !positionFilter
                      ? 'bg-mgsr-teal text-mgsr-dark'
                      : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                  }`}
                >
                  {t('releases_all')}
                </button>
                {positions.map((pos) => {
                  const fp = firestorePositions.find((p) => p.name?.toLowerCase() === pos.toLowerCase());
                  const label = isRtl ? (fp?.hebrewName || POSITION_HEBREW[pos] || pos) : pos;
                  return (
                    <button
                      key={pos}
                      onClick={() => setPositionFilter(positionFilter === pos ? null : pos)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        positionFilter === pos
                          ? 'bg-mgsr-teal text-mgsr-dark'
                          : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-mgsr-muted self-center">{t('releases_age')}:</span>
                {AGE_FILTERS.map(({ value, labelKey }) => (
                  <button
                    key={value}
                    onClick={() => setAgeFilter(ageFilter === value ? 'all' : value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      ageFilter === value
                        ? 'bg-mgsr-teal text-mgsr-dark'
                        : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {sortedPlayers.length === 0 ? (
              <div className="p-12 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted">
                {hasActiveFilters ? t('search_no_results') : t('releases_empty')}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {sortedPlayers.map((p) => (
                  <ReleaseCard
                    key={p.playerUrl}
                    player={p}
                    onAddToShortlist={addToShortlist}
                    isAdding={addingUrl === p.playerUrl}
                    isInShortlist={!!p.playerUrl && shortlistUrls.has(p.playerUrl)}
                    t={t}
                    isRtl={isRtl}
                    rosterPlayers={rosterPlayers}
                    teammatesCache={teammatesCache}
                    loadingTeammatesUrl={loadingTeammatesUrl}
                    onToggleTeammates={toggleTeammates}
                    onFetchTeammates={fetchTeammates}
                    isTeammatesExpanded={expandedTeammatesUrl}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
