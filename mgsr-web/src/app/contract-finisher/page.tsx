'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTeammates, extractPlayerIdFromUrl, type ContractFinisherPlayer } from '@/lib/api';
import { subscribe, loadContractFinishers, getContractFinisherState } from '@/lib/contractFinisherStore';
import { parseMarketValue } from '@/lib/releases';
import { getConfederation } from '@/lib/nationToConfederation';
import type { Confederation } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { getCurrentAccountForShortlist, useShortlistDocId, SHARED_SHORTLIST_DOC_ID } from '@/lib/accounts';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';

const VALUE_FILTERS = [
  { min: null as number | null, max: null as number | null, key: 'all' },
  { min: 150000, max: 500000, key: '150k_500k' },
  { min: 500000, max: 1000000, key: '500k_1m' },
  { min: 1000000, max: 2000000, key: '1m_2m' },
  { min: 2000000, max: 3000000, key: '2m_3m' },
] as const;

const AGE_FILTERS = [
  { min: null, max: null, key: 'all' },
  { min: 18, max: 21, key: '18_21' },
  { min: 22, max: 25, key: '22_25' },
  { min: 26, max: 29, key: '26_29' },
  { min: 30, max: null, key: '30_plus' },
] as const;

const REGION_OPTIONS: { value: Confederation; key: string }[] = [
  { value: 'UEFA', key: 'transfer_windows_group_uefa' },
  { value: 'CONMEBOL', key: 'transfer_windows_group_conmebol' },
  { value: 'CONCACAF', key: 'transfer_windows_group_concacaf' },
  { value: 'AFC', key: 'transfer_windows_group_afc' },
  { value: 'CAF', key: 'transfer_windows_group_caf' },
  { value: 'OFC', key: 'transfer_windows_group_ofc' },
];

const POSITION_ORDER = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const POSITION_EXCLUDED = new Set(['LM', 'RM']);
const POSITION_HEBREW: Record<string, string> = { SS: 'חלוץ שני' };

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

interface ContractFinisherCache {
  players: ContractFinisherPlayer[];
  windowLabel: string;
  valueFilter: string;
  positionFilter: string | null;
  ageFilter: string;
  regionFilter: Confederation | null;
  rosterPlayers: RosterPlayer[];
  shortlistUrls: string[];
}

function ContractFinisherCard({
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
  badgeText,
}: {
  player: ContractFinisherPlayer;
  onAddToShortlist: (p: ContractFinisherPlayer) => void;
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
  badgeText: string;
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
          {badgeText}
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
            {player.clubJoinedName && (
              <span className="text-xs text-mgsr-muted truncate max-w-[100px]">
                {player.clubJoinedName}
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
                    href={`/players/${match.player.id}?from=/contract-finisher`}
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

export default function ContractFinisherPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const cached = user ? getScreenCache<ContractFinisherCache>('contract-finisher', user.uid) : undefined;
  const storeState = getContractFinisherState();
  const [players, setPlayers] = useState<ContractFinisherPlayer[]>(storeState.players);
  const [windowLabel, setWindowLabel] = useState(storeState.windowLabel);
  const [loadingList, setLoadingList] = useState(storeState.isLoading);
  const [error, setError] = useState(storeState.error ?? '');
  const [valueFilter, setValueFilter] = useState(cached?.valueFilter ?? 'all');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [ageFilter, setAgeFilter] = useState(cached?.ageFilter ?? 'all');
  const [regionFilter, setRegionFilter] = useState<Confederation | null>(cached?.regionFilter ?? null);
  const [showFilters, setShowFilters] = useState(false);
  const [firestorePositions, setFirestorePositions] = useState<{ name?: string; hebrewName?: string }[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>(cached?.rosterPlayers ?? []);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(
    () => new Set(cached?.shortlistUrls ?? [])
  );

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

  const shortlistDocId = useShortlistDocId(user ?? null);
  useEffect(() => {
    if (!user || !shortlistDocId) return;
    const docRef = doc(db, 'Shortlists', shortlistDocId);
    const unsub = onSnapshot(docRef, (snap) => {
      const entries = (snap.data()?.entries as { tmProfileUrl?: string }[]) || [];
      setShortlistUrls(new Set(entries.map((e) => e.tmProfileUrl).filter((u): u is string => !!u)));
    });
    return () => unsub();
  }, [user, shortlistDocId]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const startLoad = useCallback(() => {
    loadContractFinishers();
  }, []);

  useEffect(() => {
    const unsub = subscribe((s) => {
      setPlayers(s.players);
      setWindowLabel(s.windowLabel);
      setLoadingList(s.isLoading);
      setError(s.error ?? '');
    });
    const st = getContractFinisherState();
    if (!st.isLoading && st.players.length === 0 && !st.error) {
      startLoad();
    }
    return () => unsub();
  }, [startLoad]);

  useEffect(() => {
    setScreenCache<ContractFinisherCache>(
      'contract-finisher',
      {
        players,
        windowLabel,
        valueFilter,
        positionFilter,
        ageFilter,
        regionFilter,
        rosterPlayers,
        shortlistUrls: Array.from(shortlistUrls),
      },
      user?.uid ?? undefined
    );
  }, [players, windowLabel, valueFilter, positionFilter, ageFilter, regionFilter, rosterPlayers, shortlistUrls, user?.uid]);

  const addToShortlist = useCallback(
    async (player: ContractFinisherPlayer) => {
      if (!user || !player.playerUrl) return;
      setAddingUrl(player.playerUrl);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const docRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);
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
          clubJoinedName: player.clubJoinedName ?? null,
          transferDate: player.transferDate ?? null,
          marketValue: player.marketValue ?? null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        const snap = await getDoc(docRef);
        const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
        const exists = current.some((e) => e.tmProfileUrl === player.playerUrl);
        if (!exists) {
          await setDoc(docRef, { entries: [...current, entry] }, { merge: true });
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
    const fromData = new Set(players.map((p) => p.playerPosition).filter(Boolean) as string[]);
    const fromFirestore = firestorePositions.map((p) => p.name).filter(Boolean) as string[];
    const merged = new Set([...fromFirestore, ...Array.from(fromData)]);
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
    if (positionFilter) {
      result = result.filter(
        (p) => p.playerPosition?.toLowerCase() === positionFilter.toLowerCase()
      );
    }
    const ageF = AGE_FILTERS.find((a) => a.key === ageFilter);
    if (ageF && (ageF.min != null || ageF.max != null)) {
      result = result.filter((p) => {
        const age = parseInt(p.playerAge || '', 10);
        if (Number.isNaN(age)) return false;
        if (ageF.min != null && age < ageF.min) return false;
        if (ageF.max != null && age > ageF.max) return false;
        return true;
      });
    }
    if (regionFilter) {
      result = result.filter((p) => {
        const conf = getConfederation(p.playerNationality);
        return conf === regionFilter;
      });
    }
    const valueF = VALUE_FILTERS.find((v) => v.key === valueFilter);
    if (valueF && (valueF.min != null || valueF.max != null)) {
      result = result.filter((p) => {
        const val = parseMarketValue(p.marketValue);
        if (val <= 0) return false;
        if (valueF.min != null && val < valueF.min) return false;
        if (valueF.max != null && val > valueF.max) return false;
        return true;
      });
    }
    return result;
  }, [players, positionFilter, ageFilter, regionFilter, valueFilter]);

  const shortlistedCount = useMemo(
    () => filteredPlayers.filter((p) => p.playerUrl && shortlistUrls.has(p.playerUrl)).length,
    [filteredPlayers, shortlistUrls]
  );

  const activeFilterCount = [
    positionFilter,
    ageFilter !== 'all',
    regionFilter,
    valueFilter !== 'all',
  ].filter(Boolean).length;

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
              {t('contract_finisher_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {windowLabel === 'Summer'
                ? t('contract_finisher_subtitle_summer')
                : t('contract_finisher_subtitle_winter')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(players.length > 0 || error) && (
              <button
                onClick={() => startLoad()}
                disabled={loadingList}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-teal hover:bg-mgsr-teal/20 hover:border-mgsr-teal/40 disabled:opacity-50 transition"
              >
                {t('contract_finisher_retry')}
              </button>
            )}
            <button
              onClick={() => setShowFilters(true)}
              className="relative px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30 transition"
            >
              {t('contract_finisher_filters')}
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 rtl:right-auto rtl:-left-1 w-5 h-5 rounded-full bg-mgsr-teal text-mgsr-dark text-xs font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-mgsr-red/20 border border-mgsr-red/30 text-mgsr-red">
            {error}
          </div>
        )}

        {loadingList && players.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t('contract_finisher_loading')}</div>
          </div>
        ) : players.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-2 relative">{t('contract_finisher_no_found')}</p>
            <p className="text-mgsr-muted/80 text-sm relative">{t('contract_finisher_retry')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4 mb-4 py-3 px-4 rounded-xl bg-mgsr-card/50 border border-mgsr-border">
              {loadingList && (
                <span className="text-sm text-mgsr-teal animate-pulse">{t('contract_finisher_loading_more')}</span>
              )}
              <span className="text-sm text-mgsr-muted">
                {t('contract_finisher_stats_total')}: <strong className="text-mgsr-text">{players.length}</strong>
              </span>
              <span className="text-sm text-mgsr-muted">
                {t('contract_finisher_stats_shortlisted')}: <strong className="text-amber-400">{shortlistedCount}</strong>
              </span>
              <span className="text-sm text-mgsr-muted">
                {t('contract_finisher_stats_visible')}: <strong className="text-mgsr-teal">{filteredPlayers.length}</strong>
              </span>
            </div>

            {filteredPlayers.length === 0 ? (
              <div className="p-12 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted">
                {activeFilterCount > 0 ? t('contract_finisher_no_match_filters') : t('contract_finisher_no_found')}
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredPlayers.map((p) => (
                  <ContractFinisherCard
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
                    badgeText={`${t('contract_finisher_badge')} – ${p.transferDate || ''}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {showFilters && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
          onClick={() => setShowFilters(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-mgsr-card border-t sm:border border-mgsr-border rounded-t-2xl sm:rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-mgsr-text mb-4 font-display">
              {t('contract_finisher_filters')}
            </h3>
            <div className="space-y-6">
              <div>
                <p className="text-xs text-mgsr-muted mb-2">{t('contract_finisher_filter_label_value')}</p>
                <div className="flex flex-wrap gap-2">
                  {VALUE_FILTERS.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setValueFilter(v.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        valueFilter === v.key
                          ? 'bg-mgsr-teal text-mgsr-dark'
                          : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                      }`}
                    >
                      {t(`contract_finisher_filter_value_${v.key}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-mgsr-muted mb-2">{t('contract_finisher_filter_label_position')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPositionFilter(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      !positionFilter
                        ? 'bg-mgsr-teal text-mgsr-dark'
                        : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    {t('contract_finisher_filter_age_all')}
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
                            : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-mgsr-muted mb-2">{t('contract_finisher_filter_label_age')}</p>
                <div className="flex flex-wrap gap-2">
                  {AGE_FILTERS.map((a) => (
                    <button
                      key={a.key}
                      onClick={() => setAgeFilter(a.key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        ageFilter === a.key
                          ? 'bg-mgsr-teal text-mgsr-dark'
                          : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                      }`}
                    >
                      {t(`contract_finisher_filter_age_${a.key}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-mgsr-muted mb-2">{t('contract_finisher_filter_label_region')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setRegionFilter(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      !regionFilter
                        ? 'bg-mgsr-teal text-mgsr-dark'
                        : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    {t('contract_finisher_filter_age_all')}
                  </button>
                  {REGION_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setRegionFilter(regionFilter === r.value ? null : r.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        regionFilter === r.value
                          ? 'bg-mgsr-teal text-mgsr-dark'
                          : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                      }`}
                    >
                      {t(r.key)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setPositionFilter(null);
                  setAgeFilter('all');
                  setRegionFilter(null);
                  setValueFilter('all');
                }}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-mgsr-border text-mgsr-muted hover:text-mgsr-text"
              >
                {t('contract_finisher_clear_filters')}
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-teal text-mgsr-dark"
              >
                {t('contract_finisher_apply_filters')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
