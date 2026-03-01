'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

interface Player {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
  age?: string;
  tmProfile?: string;
  createdAt?: number;
  contractExpired?: string;
  haveMandate?: boolean;
  agentInChargeName?: string;
  agentInChargeId?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  foot?: string;
  notes?: string;
  noteList?: { notes?: string; createBy?: string; createdAt?: number }[];
  agency?: string;
}

interface PlayersCache {
  players: Player[];
  search: string;
  positionFilter: string | null;
  freeAgents: boolean;
  contractExpiring: boolean;
  withMandate: boolean;
  myPlayersOnly: boolean;
  loanPlayersOnly: boolean;
  withoutRegisteredAgent: boolean;
  withNotes: boolean;
  footFilter: 'left' | 'right' | null;
}

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK']),
  DEF: new Set(['CB', 'RB', 'LB']),
  MID: new Set(['CM', 'DM', 'AM']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS', 'AM']),
};

function isContractExpiringWithin6Months(contractExpired: string | undefined): boolean {
  if (!contractExpired || contractExpired === '-') return false;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let date: Date | null = null;
  const m1 = contractExpired.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); // dd.MM.yyyy
  if (m1) {
    date = new Date(parseInt(m1[3]!, 10), parseInt(m1[2]!, 10) - 1, parseInt(m1[1]!, 10));
  } else {
    const m2 = contractExpired.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/MM/yyyy
    if (m2) {
      date = new Date(parseInt(m2[3]!, 10), parseInt(m2[2]!, 10) - 1, parseInt(m2[1]!, 10));
    } else {
      const m3 = contractExpired.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/); // MMM d, yyyy
      if (m3) {
        const monthIndex = monthNames.indexOf(m3[1]!);
        if (monthIndex >= 0) {
          date = new Date(parseInt(m3[3]!, 10), monthIndex, parseInt(m3[2]!, 10));
        }
      }
    }
  }
  if (!date || isNaN(date.getTime())) return false;
  const now = new Date();
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() + 6);
  return date >= now && date <= threshold;
}

export default function PlayersPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const { platform } = usePlatform();
  const router = useRouter();
  const cached = getScreenCache<PlayersCache>('players');
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [womenPlayers, setWomenPlayers] = useState<WomanPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(cached === undefined);
  const [womenLoading, setWomenLoading] = useState(true);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [freeAgents, setFreeAgents] = useState(cached?.freeAgents ?? false);
  const [contractExpiring, setContractExpiring] = useState(cached?.contractExpiring ?? false);
  const [withMandate, setWithMandate] = useState(cached?.withMandate ?? false);
  const [myPlayersOnly, setMyPlayersOnly] = useState(cached?.myPlayersOnly ?? false);
  const [loanPlayersOnly, setLoanPlayersOnly] = useState(cached?.loanPlayersOnly ?? false);
  const [withoutRegisteredAgent, setWithoutRegisteredAgent] = useState(cached?.withoutRegisteredAgent ?? false);
  const [withNotes, setWithNotes] = useState(cached?.withNotes ?? false);
  const [footFilter, setFootFilter] = useState<'left' | 'right' | null>(cached?.footFilter ?? null);
  const [currentAccountName, setCurrentAccountName] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => {
      setCurrentAccountName(acc.name ?? null);
    });
  }, [user]);

  useEffect(() => {
    const q = query(
      collection(db, 'Players'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          isOnLoan: d.onLoan ?? d.isOnLoan ?? false,
        } as Player;
      });
      setPlayers(list);
      setPlayersLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribePlayersWomen((list) => {
      setWomenPlayers(list);
      setWomenLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<PlayersCache>('players', {
      players,
      search,
      positionFilter,
      freeAgents,
      contractExpiring,
      withMandate,
      myPlayersOnly,
      loanPlayersOnly,
      withoutRegisteredAgent,
      withNotes,
      footFilter,
    });
  }, [players, search, positionFilter, freeAgents, contractExpiring, withMandate, myPlayersOnly, loanPlayersOnly, withoutRegisteredAgent, withNotes, footFilter]);

  const filtered = useMemo(() => {
    if (platform === 'women') {
      let result = womenPlayers;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        result = result.filter(
          (p) =>
            p.fullName?.toLowerCase().includes(q) ||
            p.positions?.some((pos) => pos?.toLowerCase().includes(q)) ||
            p.currentClub?.clubName?.toLowerCase().includes(q)
        );
      }
      if (positionFilter && POSITION_CODES[positionFilter]) {
        const codes = POSITION_CODES[positionFilter];
        result = result.filter((p) =>
          p.positions?.some((pos) => pos && codes.has(pos.toUpperCase()))
        );
      }
      return result;
    }
    let result = players;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.fullName?.toLowerCase().includes(q) ||
          p.positions?.some((pos) => pos?.toLowerCase().includes(q)) ||
          p.currentClub?.clubName?.toLowerCase().includes(q)
      );
    }

    // Position
    if (positionFilter && POSITION_CODES[positionFilter]) {
      const codes = POSITION_CODES[positionFilter];
      result = result.filter((p) =>
        p.positions?.some((pos) => pos && codes.has(pos.toUpperCase()))
      );
    }

    // Free agents / Contract expiring (OR when both selected)
    if (freeAgents || contractExpiring) {
      result = result.filter((p) => {
        const clubName = p.currentClub?.clubName;
        const isFree = clubName?.toLowerCase() === 'without club';
        const isExpiring = isContractExpiringWithin6Months(p.contractExpired);
        if (freeAgents && contractExpiring) return isFree || isExpiring;
        if (freeAgents) return isFree;
        return isExpiring;
      });
    }

    // With mandate
    if (withMandate) {
      result = result.filter((p) => p.haveMandate === true);
    }

    // My players only
    if (myPlayersOnly && currentAccountName) {
      result = result.filter(
        (p) => p.agentInChargeName?.toLowerCase() === currentAccountName.toLowerCase()
      );
    }

    // Loan players only
    if (loanPlayersOnly) {
      result = result.filter((p) => p.isOnLoan === true);
    }

    // Without registered agent (agency is relatives, no agent, or blank/null)
    if (withoutRegisteredAgent) {
      const noAgentValues = ['relatives', 'no agent', 'without agent', 'ohne berater', 'sans agent'];
      result = result.filter((p) => {
        const agency = p.agency?.trim()?.toLowerCase();
        return !agency || noAgentValues.some((v) => agency === v || agency.includes(v));
      });
    }

    // With notes
    if (withNotes) {
      result = result.filter(
        (p) =>
          (p.notes && p.notes.trim().length > 0) ||
          (p.noteList && p.noteList.length > 0)
      );
    }

    // Foot
    if (footFilter) {
      const footLower = footFilter.toLowerCase();
      result = result.filter((p) => p.foot?.toLowerCase() === footLower);
    }

    return result;
  }, [
    players,
    womenPlayers,
    platform,
    search,
    positionFilter,
    freeAgents,
    contractExpiring,
    withMandate,
    myPlayersOnly,
    loanPlayersOnly,
    withoutRegisteredAgent,
    withNotes,
    footFilter,
    currentAccountName,
  ]);

  const hasActiveFilters =
    !!positionFilter ||
    (platform === 'men' &&
      (freeAgents ||
        contractExpiring ||
        withMandate ||
        myPlayersOnly ||
        loanPlayersOnly ||
        withoutRegisteredAgent ||
        withNotes ||
        !!footFilter));

  const clearFilters = useCallback(() => {
    setPositionFilter(null);
    setFreeAgents(false);
    setContractExpiring(false);
    setWithMandate(false);
    setMyPlayersOnly(false);
    setLoanPlayersOnly(false);
    setWithoutRegisteredAgent(false);
    setWithNotes(false);
    setFootFilter(null);
  }, []);

  const displayList = platform === 'women' ? filtered : filtered;
  const isLoading = platform === 'women' ? womenLoading : playersLoading;
  const dataSourceLabel =
    platform === 'women'
      ? 'Wosostat · SoccerDonna · FMInside'
      : 'Transfermarkt · Scout Server · FMInside';

  const isWomen = platform === 'women';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`max-w-6xl mx-auto ${isWomen ? 'p-6 md:p-10' : ''}`}
      >
        {/* Women: curved hero with gradient */}
        {isWomen && (
          <div className="relative mb-10 overflow-hidden">
            <div
              className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-20"
              style={{
                background: 'radial-gradient(circle, var(--women-rose) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute -bottom-10 -left-10 w-60 h-60 rounded-full opacity-15"
              style={{
                background: 'radial-gradient(circle, var(--women-blush) 0%, transparent 70%)',
              }}
            />
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1
              className={`font-display font-bold text-mgsr-text tracking-tight ${
                isWomen ? 'text-4xl md:text-5xl font-extrabold' : 'text-3xl'
              }`}
            >
              {t(isWomen ? 'players_title_women' : 'players_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {platform === 'women' ? womenPlayers.length : players.length} {t(isWomen ? 'players_women' : 'players')}
              {filtered.length !== (platform === 'women' ? womenPlayers.length : players.length) && (
                <span className={isWomen ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-accent)]'}>{` → ${filtered.length}`}</span>
              )}
              <span className="block text-xs text-mgsr-muted/80 mt-0.5">{dataSourceLabel}</span>
            </p>
          </div>
          <Link
            href="/players/add"
            className={`inline-flex items-center justify-center gap-2 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${
              isWomen
                ? 'px-6 py-3 rounded-2xl bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                : 'px-5 py-2.5 rounded-xl bg-[var(--mgsr-accent)] text-mgsr-dark hover:opacity-90'
            }`}
          >
            <span>+</span>
            {t(isWomen ? 'players_add_women' : 'players_add')}
          </Link>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className={`w-full max-w-md text-mgsr-text placeholder-mgsr-muted focus:outline-none transition ${
              isWomen
                ? 'px-5 py-3.5 rounded-2xl bg-mgsr-card border border-mgsr-border focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20'
                : 'px-4 py-3 rounded-xl bg-mgsr-card border border-mgsr-border focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30'
            }`}
          />
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {POSITION_GROUPS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPositionFilter(positionFilter === pos ? null : pos)}
                className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  isWomen ? 'rounded-xl' : 'rounded-lg'
                } ${
                  positionFilter === pos
                    ? isWomen
                      ? 'bg-[var(--women-rose)] text-mgsr-dark shadow-sm shadow-[var(--women-rose)]/20'
                      : 'bg-[var(--mgsr-accent)] text-mgsr-dark shadow-sm'
                    : isWomen
                      ? 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-[var(--women-rose)]/40'
                      : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-[var(--mgsr-accent)]/40'
                }`}
              >
                {t(isWomen && pos.toLowerCase() === 'gk' ? 'players_filter_position_gk_women' : `players_filter_position_${pos.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 -mx-1">
            {platform === 'men' && (
            <>
            <button
              onClick={() => setFreeAgents((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                freeAgents
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_free_agents')}
            </button>
            <button
              onClick={() => setContractExpiring((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                contractExpiring
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_contract_expiring')}
            </button>
            <button
              onClick={() => setWithMandate((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                withMandate
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_with_mandate')}
            </button>
            <button
              onClick={() => setMyPlayersOnly((v) => !v)}
              disabled={!currentAccountName}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                myPlayersOnly
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_my_players_only')}
            </button>
            <button
              onClick={() => setLoanPlayersOnly((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                loanPlayersOnly
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_loan_players_only')}
            </button>
            <button
              onClick={() => setWithoutRegisteredAgent((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                withoutRegisteredAgent
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_without_registered_agent')}
            </button>
            <button
              onClick={() => setWithNotes((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                withNotes
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_with_notes')}
            </button>
            <button
              onClick={() => setFootFilter((v) => (v === 'left' ? null : 'left'))}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                footFilter === 'left'
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_foot_left')}
            </button>
            <button
              onClick={() => setFootFilter((v) => (v === 'right' ? null : 'right'))}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                footFilter === 'right'
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_foot_right')}
            </button>
            </>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className={`shrink-0 px-3 py-1.5 text-sm font-medium text-mgsr-muted hover:text-mgsr-red border border-mgsr-border hover:border-mgsr-red/50 transition-all ${isWomen ? 'rounded-xl' : 'rounded-lg'}`}
              >
                {t('players_filter_clear')}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t(isWomen ? 'players_loading_women' : 'players_loading')}</div>
          </div>
        ) : displayList.length === 0 ? (
          <div
            className={`relative overflow-hidden p-16 border text-center ${
              isWomen
                ? 'bg-mgsr-card/50 border-mgsr-border rounded-3xl'
                : 'bg-mgsr-card/50 border-mgsr-border rounded-2xl'
            }`}
          >
            <div
              className="absolute inset-0"
              style={{
                background: isWomen
                  ? 'radial-gradient(ellipse at center, rgba(232,160,191,0.08) 0%, transparent 70%)'
                  : 'radial-gradient(ellipse at center, rgba(77,182,172,0.06) 0%, transparent 70%)',
              }}
            />
            <p className="text-mgsr-muted text-lg mb-4 relative">
              {search.trim() || hasActiveFilters ? t('search_no_results') : t(isWomen ? 'players_empty_women' : 'players_empty')}
            </p>
            {!search.trim() && !hasActiveFilters && (
              <Link
                href="/players/add"
                className={`inline-block px-6 py-3 font-semibold transition relative ${
                  isWomen
                    ? 'rounded-2xl bg-[var(--women-gradient)] text-white hover:opacity-90'
                    : 'rounded-xl bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
                }`}
              >
                {t(isWomen ? 'players_empty_hint_women' : 'players_empty_hint')}
              </Link>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 inline-block px-6 py-3 rounded-xl border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40 transition relative"
              >
                {t('players_filter_clear')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayList.map((p, i) => (
              <Link
                key={p.id}
                href={
                  platform === 'women'
                    ? `/players/women/${p.id}?from=/players`
                    : `/players/${p.id}?from=/players`
                }
                className={`group flex items-center gap-4 p-4 bg-mgsr-card border border-mgsr-border hover:bg-mgsr-card/80 transition-all duration-300 animate-fade-in ${
                  isWomen
                    ? 'rounded-2xl hover:border-[var(--women-rose)]/40 hover:shadow-[0_0_30px_rgba(232,160,191,0.12)]'
                    : 'rounded-xl hover:border-[var(--mgsr-accent)]/40'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="relative shrink-0">
                  <img
                    src={p.profileImage || '/placeholder-player.png'}
                    alt=""
                    className={`w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border transition ${isWomen ? 'group-hover:ring-[var(--women-rose)]/40' : 'group-hover:ring-mgsr-teal/40'}`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        platform === 'women'
                          ? 'https://placehold.co/56x56/1A2736/E8A0BF?text=?'
                          : 'https://via.placeholder.com/56?text=?';
                    }}
                  />
                  {p.currentClub && 'clubLogo' in p.currentClub && p.currentClub.clubLogo && (
                    <img
                      src={p.currentClub.clubLogo}
                      alt=""
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full object-cover border border-mgsr-dark"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-mgsr-text truncate transition ${isWomen ? 'group-hover:text-[var(--women-rose)]' : 'group-hover:text-mgsr-teal'}`}>
                    {p.fullName || 'Unknown'}
                  </p>
                  <p className="text-sm text-mgsr-muted truncate">
                    {p.positions?.filter(Boolean).join(', ') || '—'} • {(() => {
                      const c = p.currentClub?.clubName;
                      if (!c) return t('no_club');
                      if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
                      return c;
                    })()}{' '}
                    {p.age && `• ${t(isWomen ? 'players_age_display_women' : 'players_age_display').replace('{age}', p.age)}`}
                  </p>
                </div>
                <div className={`text-right shrink-0 ${isRtl ? 'text-left' : ''}`}>
                  <p className={`font-semibold ${isWomen ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-accent)]'}`}>{p.marketValue || '—'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
