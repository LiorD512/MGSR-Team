'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, getDoc, setDoc, collection, query, orderBy, onSnapshot, addDoc, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getTeammates, extractPlayerIdFromUrl, type ReturneePlayer } from '@/lib/api';
import { parseMarketValue } from '@/lib/releases';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import {
  subscribeReturnees,
  getReturneesState,
  loadReturnees,
} from '@/lib/returneesStore';

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

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;

const MARKET_VALUE_FILTERS = [
  { min: null as number | null, max: null as number | null, key: 'all' },
  { min: 150000, max: 500000, key: '150k_500k' },
  { min: 500000, max: 1000000, key: '500k_1m' },
  { min: 1000000, max: 2000000, key: '1m_2m' },
  { min: 2000000, max: 3000000, key: '2m_3m' },
] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK']),
  DEF: new Set(['CB', 'RB', 'LB']),
  MID: new Set(['CM', 'DM', 'AM']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS', 'AM']),
};

function getPositionGroup(pos: string | undefined): string | null {
  if (!pos) return null;
  const upper = pos.toUpperCase();
  for (const [group, codes] of Object.entries(POSITION_CODES)) {
    if (codes.has(upper)) return group;
  }
  return null;
}

function ReturneeCard({
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
  player: ReturneePlayer;
  onAddToShortlist: (p: ReturneePlayer) => void;
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
      className="group relative overflow-hidden rounded-2xl bg-mgsr-card border border-mgsr-border hover:border-purple-500/40 transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-mgsr-dark"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 via-transparent to-mgsr-dark/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
      <div className="relative p-5">
        <span className="absolute top-4 left-4 rtl:left-auto rtl:right-4 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30">
          {player.transferDate ? t('returnee_badge_returned_on').replace('{date}', player.transferDate) : t('returnee_badge_loan_return')}
        </span>
        {/* Critical info strip - always visible */}
        <div className="mt-6 flex flex-wrap items-center gap-3 py-3 px-4 rounded-xl bg-mgsr-dark/60 border border-mgsr-border/80">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-mgsr-muted">{t('returnee_market_value')}</span>
            <span className={`font-display font-bold tabular-nums ${player.marketValue ? 'text-emerald-400' : 'text-mgsr-muted'}`}>
              {player.marketValue || '—'}
            </span>
          </div>
          <span className="text-mgsr-border/50">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-mgsr-muted">{t('returnee_returned')}</span>
            <span className={`font-medium tabular-nums ${player.transferDate ? 'text-purple-400' : 'text-mgsr-muted'}`}>
              {player.transferDate || '—'}
            </span>
          </div>
        </div>
        <div className="flex gap-4 mt-4">
          <div className="relative shrink-0">
            <img
              src={player.playerImage || 'https://via.placeholder.com/72'}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-purple-500/50 transition-all duration-300 group-hover:scale-105"
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
            <p className="font-display font-semibold text-lg text-mgsr-text truncate group-hover:text-purple-400 transition-colors">
              {player.playerName || 'Unknown'}
            </p>
            <p className="text-sm text-mgsr-muted mt-0.5">{player.playerPosition || '—'}</p>
            {(player.clubJoinedName || player.clubJoinedLogo) && (
              <div className="flex items-center gap-2 mt-2" title={t('returnee_current_club')}>
                {player.clubJoinedLogo && (
                  <img src={player.clubJoinedLogo} alt="" className="w-4 h-4 rounded object-cover" />
                )}
                <span className="text-xs text-mgsr-muted truncate">{player.clubJoinedName}</span>
              </div>
            )}
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
            className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border hover:border-purple-500/30 transition-all text-left rtl:text-right"
          >
            <svg className="w-4 h-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <div className="w-5 h-5 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
                </div>
              ) : rosterTeammates?.length === 0 ? (
                <p className="text-xs text-mgsr-muted py-3 px-3 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/60">
                  {t('releases_no_roster_teammates')}
                </p>
              ) : (
                rosterTeammates?.map((match) => (
                  <Link
                    key={match.player.id}
                    href={`/players/${match.player.id}?from=/returnees`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/80 hover:border-purple-500/40 hover:bg-mgsr-dark/70 transition-all"
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
                    <span className="text-xs font-medium text-purple-400 shrink-0 px-2 py-0.5 rounded-md bg-purple-500/15">
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

export default function ReturneesPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const st = getReturneesState();
  const [players, setPlayers] = useState<ReturneePlayer[]>(st.players);
  const [loadedLeagues, setLoadedLeagues] = useState(st.loadedLeagues);
  const [totalLeagues, setTotalLeagues] = useState(st.totalLeagues);
  const [loadingList, setLoadingList] = useState(st.isLoading);
  const [error, setError] = useState<string | null>(st.error);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [valueFilter, setValueFilter] = useState<string>('all');
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());

  const startLoad = useCallback(() => {
    loadReturnees();
  }, []);

  useEffect(() => {
    const unsub = subscribeReturnees((s) => {
      setPlayers(s.players);
      setLoadedLeagues(s.loadedLeagues);
      setTotalLeagues(s.totalLeagues);
      setLoadingList(s.isLoading);
      setError(s.error);
    });
    const state = getReturneesState();
    if (!state.isLoading && state.players.length === 0 && !state.error) {
      startLoad();
    }
    return () => unsub();
  }, [startLoad]);

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

  const addToShortlist = useCallback(
    async (player: ReturneePlayer) => {
      if (!user || !player.playerUrl) return;
      setAddingUrl(player.playerUrl);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const colRef = collection(db, 'Shortlists');
        const rosterExists = rosterPlayers.some((p) => p.tmProfile === player.playerUrl);
        if (rosterExists) {
          setAddError(t('shortlist_player_in_roster'));
          setAddingUrl(null);
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
        const q = query(colRef, where('tmProfileUrl', '==', player.playerUrl));
        const existsSnap = await getDocs(q);
        if (existsSnap.empty) {
          const docRef = await addDoc(colRef, entry);
          enrichShortlistInstagram(player.playerUrl, docRef);
          await addDoc(collection(db, 'FeedEvents'), {
            type: 'SHORTLIST_ADDED',
            playerName: entry.playerName ?? null,
            playerImage: entry.playerImage ?? null,
            playerTmProfile: player.playerUrl,
            timestamp: Date.now(),
            agentName: account.name ?? null,
          });
        }
      } finally {
        setAddingUrl(null);
      }
    },
    [user, rosterPlayers, t]
  );

  useEffect(() => {
    if (addError) {
      const id = setTimeout(() => setAddError(null), 4000);
      return () => clearTimeout(id);
    }
  }, [addError]);

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

  const filteredPlayers = useMemo(() => {
    let result = players;
    if (positionFilter) {
      result = result.filter((p) => getPositionGroup(p.playerPosition) === positionFilter);
    }
    const valueF = MARKET_VALUE_FILTERS.find((v) => v.key === valueFilter);
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
  }, [players, positionFilter, valueFilter]);

  const shortlistedCount = useMemo(
    () => players.filter((p) => p.playerUrl && shortlistUrls.has(p.playerUrl)).length,
    [players, shortlistUrls]
  );

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {t('returnee_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">{t('returnee_subtitle')}</p>
            {addError && (
              <p className="text-mgsr-red text-sm mt-2">{addError}</p>
            )}
          </div>
          {(players.length > 0 || !loadingList) && (
            <button
              onClick={startLoad}
              disabled={loadingList}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/40 disabled:opacity-50 transition shrink-0"
            >
              {t('releases_reload')}
            </button>
          )}
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 py-3 px-3 sm:px-4 rounded-xl bg-mgsr-card/50 border border-mgsr-border">
          <span className="text-sm text-mgsr-muted">
            {t('releases_stats_total')}: <strong className="text-mgsr-text">{players.length}</strong>
          </span>
          <span className="text-sm text-mgsr-muted">
            {t('releases_stat_shortlisted')}: <strong className="text-green-400">{shortlistedCount}</strong>
          </span>
          <span className="text-sm text-mgsr-muted">
            {t('returnee_stat_leagues')}: <strong className="text-purple-400">{loadedLeagues}/{totalLeagues}</strong>
          </span>
        </div>

        {/* Position filter chips */}
        <div className="flex flex-wrap gap-2 mb-3 overflow-x-auto pb-2">
          <button
            onClick={() => setPositionFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 transition ${
              !positionFilter
                ? 'bg-purple-500 text-white'
                : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
            }`}
          >
            {t('returnee_all_count').replace('{count}', String(players.length))}
          </button>
          {POSITION_GROUPS.map((group) => {
            const count = players.filter((p) => getPositionGroup(p.playerPosition) === group).length;
            return (
              <button
                key={group}
                onClick={() => setPositionFilter(positionFilter === group ? null : group)}
                disabled={count === 0}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 transition ${
                  positionFilter === group
                    ? 'bg-purple-500 text-white'
                    : count === 0
                      ? 'bg-transparent text-mgsr-muted/50 cursor-not-allowed'
                      : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {group} {count > 0 ? count : ''}
              </button>
            );
          })}
        </div>

        {/* Market value filter chips */}
        <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto pb-2">
          {MARKET_VALUE_FILTERS.map((v) => {
            const count =
              v.key === 'all'
                ? players.length
                : players.filter((p) => {
                    const val = parseMarketValue(p.marketValue);
                    if (val <= 0) return false;
                    if (v.min != null && val < v.min) return false;
                    if (v.max != null && val > v.max) return false;
                    return true;
                  }).length;
            return (
              <button
                key={v.key}
                onClick={() => setValueFilter(valueFilter === v.key ? 'all' : v.key)}
                disabled={count === 0}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium shrink-0 transition ${
                  valueFilter === v.key
                    ? 'bg-purple-500 text-white'
                    : count === 0
                      ? 'bg-transparent text-mgsr-muted/50 cursor-not-allowed'
                      : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {t(`contract_finisher_filter_value_${v.key}`)} {count > 0 ? count : ''}
              </button>
            );
          })}
        </div>

        {players.length === 0 && loadingList ? (
          <div className="flex items-center gap-3 py-6 px-4 rounded-xl bg-mgsr-card/50 border border-mgsr-border">
            <div className="w-6 h-6 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin shrink-0" />
            <p className="text-mgsr-muted text-sm">
              {t('returnee_loading').replace('{loaded}', String(loadedLeagues)).replace('{total}', String(totalLeagues))}
            </p>
          </div>
        ) : error ? (
          <div className="p-12 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={startLoad}
              className="px-4 py-2 rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition"
            >
              {t('releases_reload')}
            </button>
          </div>
        ) : players.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-2 relative">{t('returnee_no_found')}</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="p-12 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted">
            {t('search_no_results')}
            <button
              onClick={() => {
                setPositionFilter(null);
                setValueFilter('all');
              }}
              className="block mt-3 text-purple-400 hover:underline"
            >
              {t('returnee_clear_filters')}
            </button>
          </div>
        ) : (
          <>
            {loadingList && (
              <div className="mb-4 flex items-center gap-2 py-2 px-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <div className="w-4 h-4 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin shrink-0" />
                <span className="text-sm text-purple-300">
                  {t('returnee_loading').replace('{loaded}', String(loadedLeagues)).replace('{total}', String(totalLeagues))}
                </span>
              </div>
            )}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPlayers.map((p) => (
              <ReturneeCard
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
          </>
        )}
      </div>
    </AppLayout>
  );
}
