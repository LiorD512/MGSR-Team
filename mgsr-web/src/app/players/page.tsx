'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
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
  const router = useRouter();
  const cached = getScreenCache<PlayersCache>('players');
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [playersLoading, setPlayersLoading] = useState(cached === undefined);
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
    freeAgents ||
    contractExpiring ||
    withMandate ||
    myPlayersOnly ||
    loanPlayersOnly ||
    withoutRegisteredAgent ||
    withNotes ||
    !!footFilter;

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {t('players_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {players.length} {t('players')}
              {filtered.length !== players.length && (
                <span className="text-mgsr-teal">{` → ${filtered.length}`}</span>
              )}
            </p>
          </div>
          <Link
            href="/players/add"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>+</span>
            {t('players_add')}
          </Link>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full max-w-md px-4 py-3 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition"
          />
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {POSITION_GROUPS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPositionFilter(positionFilter === pos ? null : pos)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  positionFilter === pos
                    ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
                }`}
              >
                {t(`players_filter_position_${pos.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 -mx-1">
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
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium text-mgsr-muted hover:text-mgsr-red border border-mgsr-border hover:border-mgsr-red/50 transition-all"
              >
                {t('players_filter_clear')}
              </button>
            )}
          </div>
        </div>

        {playersLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t('players_loading')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-4 relative">
              {search.trim() || hasActiveFilters ? t('search_no_results') : t('players_empty')}
            </p>
            {!search.trim() && !hasActiveFilters && (
              <Link
                href="/players/add"
                className="inline-block px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition relative"
              >
                {t('players_empty_hint')}
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
            {filtered.map((p, i) => (
              <Link
                key={p.id}
                href={`/players/${p.id}?from=/players`}
                className="group flex items-center gap-4 p-4 bg-mgsr-card border border-mgsr-border rounded-xl hover:border-mgsr-teal/40 hover:bg-mgsr-card/80 transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="relative shrink-0">
                  <img
                    src={p.profileImage || '/placeholder-player.png'}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-mgsr-teal/40 transition"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/56?text=?';
                    }}
                  />
                  {p.currentClub?.clubLogo && (
                    <img
                      src={p.currentClub.clubLogo}
                      alt=""
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full object-cover border border-mgsr-dark"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-mgsr-text truncate group-hover:text-mgsr-teal transition">
                    {p.fullName || 'Unknown'}
                  </p>
                  <p className="text-sm text-mgsr-muted truncate">
                    {p.positions?.filter(Boolean).join(', ') || '—'} • {p.currentClub?.clubName || t('no_club')}{' '}
                    {p.age && `• ${t('players_age_display').replace('{age}', p.age)}`}
                  </p>
                </div>
                <div className={`text-right shrink-0 ${isRtl ? 'text-left' : ''}`}>
                  <p className="font-semibold text-mgsr-teal">{p.marketValue || '—'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
