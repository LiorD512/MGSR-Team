'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist, getAllAccounts, type AccountForShortlist } from '@/lib/accounts';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import AppLayout from '@/components/AppLayout';
import FilterBottomSheet from '@/components/mobile/FilterBottomSheet';
import { useIsMobileOrTablet } from '@/hooks/useMediaQuery';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
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
  nationality?: string;
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
  agentFilter: string | null;
  loanPlayersOnly: boolean;
  withoutRegisteredAgent: boolean;
  withNotes: boolean;
  footFilter: 'left' | 'right' | null;
  euNationalOnly: boolean;
  offeredNoFeedback: boolean;
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
  const { t, isRtl, lang } = useLanguage();
  const { platform } = usePlatform();
  const router = useRouter();
  const isMobileOrTablet = useIsMobileOrTablet();
  const euCountries = useEuCountries();
  const cached = getScreenCache<PlayersCache>('players');
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [womenPlayers, setWomenPlayers] = useState<WomanPlayer[]>([]);
  const [youthPlayers, setYouthPlayers] = useState<YouthPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(cached === undefined);
  const [womenLoading, setWomenLoading] = useState(true);
  const [youthLoading, setYouthLoading] = useState(true);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [freeAgents, setFreeAgents] = useState(cached?.freeAgents ?? false);
  const [contractExpiring, setContractExpiring] = useState(cached?.contractExpiring ?? false);
  const [withMandate, setWithMandate] = useState(cached?.withMandate ?? false);
  const [myPlayersOnly, setMyPlayersOnly] = useState(cached?.myPlayersOnly ?? false);
  const [agentFilter, setAgentFilter] = useState<string | null>(cached?.agentFilter ?? null);
  const [loanPlayersOnly, setLoanPlayersOnly] = useState(cached?.loanPlayersOnly ?? false);
  const [withoutRegisteredAgent, setWithoutRegisteredAgent] = useState(cached?.withoutRegisteredAgent ?? false);
  const [withNotes, setWithNotes] = useState(cached?.withNotes ?? false);
  const [footFilter, setFootFilter] = useState<'left' | 'right' | null>(cached?.footFilter ?? null);
  const [euNationalOnly, setEuNationalOnly] = useState(cached?.euNationalOnly ?? false);
  const [offeredNoFeedback, setOfferedNoFeedback] = useState(cached?.offeredNoFeedback ?? false);
  const [offeredNoFeedbackProfiles, setOfferedNoFeedbackProfiles] = useState<Set<string>>(new Set());
  const [currentAccountName, setCurrentAccountName] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountForShortlist[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => {
      setCurrentAccountName(acc.name ?? null);
    });
    getAllAccounts().then(setAllAccounts);
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
    const unsub = subscribePlayersYouth((list) => {
      setYouthPlayers(list);
      setYouthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'PlayerOffers'), (snap) => {
      const byPlayer = new Map<string, boolean>();
      snap.docs.forEach((doc) => {
        const d = doc.data();
        const profile = d.playerTmProfile as string | undefined;
        if (!profile) return;
        const hasFeedback = !!(d.clubFeedback as string | undefined)?.trim();
        if (hasFeedback) {
          byPlayer.set(profile, true);
        } else if (!byPlayer.has(profile)) {
          byPlayer.set(profile, false);
        }
      });
      const profiles = new Set<string>();
      byPlayer.forEach((hasAnyFeedback, profile) => {
        if (!hasAnyFeedback) profiles.add(profile);
      });
      setOfferedNoFeedbackProfiles(profiles);
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
      agentFilter,
      loanPlayersOnly,
      withoutRegisteredAgent,
      withNotes,
      footFilter,
      euNationalOnly,
      offeredNoFeedback,
    });
  }, [players, search, positionFilter, freeAgents, contractExpiring, withMandate, myPlayersOnly, agentFilter, loanPlayersOnly, withoutRegisteredAgent, withNotes, footFilter, euNationalOnly, offeredNoFeedback]);

  const filtered = useMemo(() => {
    if (platform === 'youth') {
      let result = youthPlayers;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        result = result.filter(
          (p) =>
            p.fullName?.toLowerCase().includes(q) ||
            p.fullNameHe?.includes(q) ||
            p.positions?.some((pos) => pos?.toLowerCase().includes(q)) ||
            p.currentClub?.clubName?.toLowerCase().includes(q) ||
            p.ageGroup?.toLowerCase().includes(q) ||
            p.academy?.toLowerCase().includes(q)
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

    // Agent filter (specific agent)
    if (agentFilter) {
      result = result.filter(
        (p) => p.agentInChargeName?.toLowerCase() === agentFilter.toLowerCase()
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

    // EU National
    if (euNationalOnly && euCountries.size > 0) {
      result = result.filter((p) => p.nationality ? isEuNational(p.nationality, euCountries, (p as any).nationalities) : false);
    }

    // Offered · No Feedback
    if (offeredNoFeedback) {
      result = result.filter((p) => p.tmProfile && offeredNoFeedbackProfiles.has(p.tmProfile));
    }

    return result;
  }, [
    players,
    womenPlayers,
    youthPlayers,
    platform,
    search,
    positionFilter,
    freeAgents,
    contractExpiring,
    withMandate,
    myPlayersOnly,
    agentFilter,
    loanPlayersOnly,
    withoutRegisteredAgent,
    withNotes,
    footFilter,
    euNationalOnly,
    offeredNoFeedback,
    offeredNoFeedbackProfiles,
    euCountries,
    currentAccountName,
  ]);

  const hasActiveFilters =
    !!positionFilter ||
    (platform === 'men' &&
      (freeAgents ||
        contractExpiring ||
        withMandate ||
        myPlayersOnly ||
        !!agentFilter ||
        loanPlayersOnly ||
        withoutRegisteredAgent ||
        withNotes ||
        euNationalOnly ||
        offeredNoFeedback ||
        !!footFilter));

  const clearFilters = useCallback(() => {
    setPositionFilter(null);
    setFreeAgents(false);
    setContractExpiring(false);
    setWithMandate(false);
    setMyPlayersOnly(false);
    setAgentFilter(null);
    setLoanPlayersOnly(false);
    setWithoutRegisteredAgent(false);
    setWithNotes(false);
    setFootFilter(null);
    setEuNationalOnly(false);
    setOfferedNoFeedback(false);
  }, []);

  const displayList = filtered;
  const isLoading = platform === 'youth' ? youthLoading : platform === 'women' ? womenLoading : playersLoading;
  const dataSourceLabel =
    platform === 'youth'
      ? 'IFA · football.org.il'
      : platform === 'women'
        ? 'Wosostat · SoccerDonna · FMInside'
        : 'Transfermarkt · Scout Server · FMInside';

  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isYouth ? 'youth-gradient-text' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`max-w-6xl mx-auto ${isWomen ? 'p-6 md:p-10' : ''}`}
      >
        {/* Youth: glassmorphism glow */}
        {isYouth && (
          <div className="relative mb-10 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, var(--youth-cyan) 0%, transparent 70%)' }} />
            <div className="absolute -bottom-10 -left-10 w-60 h-60 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, var(--youth-violet) 0%, transparent 70%)' }} />
          </div>
        )}

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
                isYouth ? 'text-4xl md:text-5xl font-extrabold' : isWomen ? 'text-4xl md:text-5xl font-extrabold' : 'text-3xl'
              }`}
            >
              {isYouth ? <span className="youth-gradient-text">{t('players_title_youth')}</span> : t(isWomen ? 'players_title_women' : 'players_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {platform === 'youth' ? youthPlayers.length : platform === 'women' ? womenPlayers.length : players.length} {isYouth ? t('players_subtitle_youth') : t(isWomen ? 'players_women' : 'players')}
              {filtered.length !== (platform === 'youth' ? youthPlayers.length : platform === 'women' ? womenPlayers.length : players.length) && (
                <span className={isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-accent)]'}>{` → ${filtered.length}`}</span>
              )}
              <span className="block text-xs text-mgsr-muted/80 mt-0.5">{dataSourceLabel}</span>
            </p>
          </div>
          <Link
            href="/players/add"
            className={`inline-flex items-center justify-center gap-2 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${
              isYouth
                ? 'px-6 py-3 rounded-2xl text-white shadow-[0_0_30px_rgba(0,212,255,0.15)] hover:shadow-[0_0_40px_rgba(0,212,255,0.25)]'
                : isWomen
                  ? 'px-6 py-3 rounded-2xl bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                  : 'px-5 py-2.5 rounded-xl bg-[var(--mgsr-accent)] text-mgsr-dark hover:opacity-90'
            }`}
            style={isYouth ? { background: 'linear-gradient(135deg, var(--youth-cyan), var(--youth-violet))' } : undefined}
          >
            <span>+</span>
            {isYouth ? t('players_add_youth') : t(isWomen ? 'players_add_women' : 'players_add')}
          </Link>
        </div>

        {/* Search + filter trigger */}
        <div className="mb-4 flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isYouth ? t('players_search_youth') : t('search_placeholder')}
            className={`flex-1 lg:max-w-md text-mgsr-text placeholder-mgsr-muted focus:outline-none transition ${
              isYouth
                ? 'px-5 py-3.5 rounded-2xl youth-glass-input'
                : isWomen
                  ? 'px-5 py-3.5 rounded-2xl bg-mgsr-card border border-mgsr-border focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20'
                  : 'px-4 py-3 rounded-xl bg-mgsr-card border border-mgsr-border focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30'
            }`}
          />
          {/* Mobile: filter button */}
          {platform === 'men' && isMobileOrTablet && (
            <button
              onClick={() => setFilterSheetOpen(true)}
              className={`relative shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl border transition text-sm font-medium ${
                hasActiveFilters
                  ? 'bg-[var(--mgsr-accent-dim)] border-[var(--mgsr-accent)]/40 text-[var(--mgsr-accent)]'
                  : 'bg-mgsr-card border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--mgsr-accent)]" />
              )}
            </button>
          )}
        </div>

        {/* Position filter pills — always visible */}
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {POSITION_GROUPS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPositionFilter(positionFilter === pos ? null : pos)}
                className={`px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  isWomen ? 'rounded-xl' : 'rounded-lg'
                } ${
                  positionFilter === pos
                    ? isYouth
                      ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] border border-[var(--youth-cyan)]/40 shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                      : isWomen
                        ? 'bg-[var(--women-rose)] text-mgsr-dark shadow-sm shadow-[var(--women-rose)]/20'
                        : 'bg-[var(--mgsr-accent)] text-mgsr-dark shadow-sm'
                    : isYouth
                      ? 'bg-white/5 border border-white/10 text-mgsr-muted hover:text-mgsr-text hover:border-[var(--youth-cyan)]/30'
                      : isWomen
                        ? 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-[var(--women-rose)]/40'
                        : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-[var(--mgsr-accent)]/40'
                }`}
              >
                {t(isWomen && pos.toLowerCase() === 'gk' ? 'players_filter_position_gk_women' : `players_filter_position_${pos.toLowerCase()}`)}
              </button>
            ))}
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

        {/* Advanced filters — desktop only (inline) */}
        {platform === 'men' && !isMobileOrTablet && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-2 pb-1">
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
            <button
              onClick={() => setEuNationalOnly((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                euNationalOnly
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              🇪🇺 {t('players_filter_eu_national')}
            </button>
            <button
              onClick={() => setOfferedNoFeedback((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                offeredNoFeedback
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_offered_no_feedback')}
            </button>
            <div className="relative shrink-0">
              <select
                value={agentFilter ?? ''}
                onChange={(e) => setAgentFilter(e.target.value || null)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 appearance-none cursor-pointer pr-7 ${
                  agentFilter
                    ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
                }`}
              >
                <option value="">{t('players_filter_agent')} ▾</option>
                {allAccounts.filter((acc) => acc.name?.toLowerCase() !== currentAccountName?.toLowerCase()).map((acc) => (
                  <option key={acc.id} value={acc.name ?? ''}>
                    {(lang === 'he' ? acc.hebrewName : null) ?? acc.name ?? acc.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        )}

        {/* Mobile filter bottom sheet */}
        {platform === 'men' && (
        <FilterBottomSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title={t('filters') || 'Filters'}>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'freeAgents', active: freeAgents, toggle: () => setFreeAgents(v => !v), label: t('players_filter_free_agents') },
              { key: 'contractExpiring', active: contractExpiring, toggle: () => setContractExpiring(v => !v), label: t('players_filter_contract_expiring') },
              { key: 'withMandate', active: withMandate, toggle: () => setWithMandate(v => !v), label: t('players_filter_with_mandate') },
              { key: 'myPlayersOnly', active: myPlayersOnly, toggle: () => setMyPlayersOnly(v => !v), label: t('players_filter_my_players_only'), disabled: !currentAccountName },
              { key: 'loanPlayersOnly', active: loanPlayersOnly, toggle: () => setLoanPlayersOnly(v => !v), label: t('players_filter_loan_players_only') },
              { key: 'withoutRegisteredAgent', active: withoutRegisteredAgent, toggle: () => setWithoutRegisteredAgent(v => !v), label: t('players_filter_without_registered_agent') },
              { key: 'withNotes', active: withNotes, toggle: () => setWithNotes(v => !v), label: t('players_filter_with_notes') },
              { key: 'footLeft', active: footFilter === 'left', toggle: () => setFootFilter(v => v === 'left' ? null : 'left'), label: t('players_filter_foot_left') },
              { key: 'footRight', active: footFilter === 'right', toggle: () => setFootFilter(v => v === 'right' ? null : 'right'), label: t('players_filter_foot_right') },
              { key: 'euNational', active: euNationalOnly, toggle: () => setEuNationalOnly(v => !v), label: `🇪🇺 ${t('players_filter_eu_national')}` },
              { key: 'offeredNoFeedback', active: offeredNoFeedback, toggle: () => setOfferedNoFeedback(v => !v), label: t('players_filter_offered_no_feedback') },
            ].map(f => (
              <button
                key={f.key}
                onClick={f.toggle}
                disabled={f.disabled}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition min-h-[44px] ${
                  f.active
                    ? 'bg-mgsr-teal text-mgsr-dark shadow-sm'
                    : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted'
                } ${f.disabled ? 'opacity-50' : ''}`}
              >
                {f.label}
              </button>
            ))}
            <select
              value={agentFilter ?? ''}
              onChange={(e) => setAgentFilter(e.target.value || null)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition min-h-[44px] appearance-none cursor-pointer ${
                agentFilter
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm'
                  : 'bg-mgsr-dark/60 border border-mgsr-border text-mgsr-muted'
              }`}
            >
              <option value="">{t('players_filter_agent')} ▾</option>
              {allAccounts.filter((acc) => acc.name?.toLowerCase() !== currentAccountName?.toLowerCase()).map((acc) => (
                <option key={acc.id} value={acc.name ?? ''}>
                  {(lang === 'he' ? acc.hebrewName : null) ?? acc.name ?? acc.id}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => { clearFilters(); setFilterSheetOpen(false); }}
              className="w-full mt-2 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:text-mgsr-red text-sm font-medium transition min-h-[44px]"
            >
              {t('players_filter_clear')}
            </button>
          )}
        </FilterBottomSheet>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className={`animate-pulse ${isYouth ? 'youth-gradient-text' : 'text-mgsr-muted'}`}>{isYouth ? t('players_loading_youth') : t(isWomen ? 'players_loading_women' : 'players_loading')}</div>
          </div>
        ) : displayList.length === 0 ? (
          <div
            className={`relative overflow-hidden p-16 border text-center ${
              isYouth
                ? 'youth-glass-card rounded-3xl'
                : isWomen
                  ? 'bg-mgsr-card/50 border-mgsr-border rounded-3xl'
                  : 'bg-mgsr-card/50 border-mgsr-border rounded-2xl'
            }`}
          >
            <div
              className="absolute inset-0"
              style={{
                background: isYouth
                  ? 'radial-gradient(ellipse at center, rgba(0,212,255,0.08) 0%, transparent 70%)'
                  : isWomen
                    ? 'radial-gradient(ellipse at center, rgba(232,160,191,0.08) 0%, transparent 70%)'
                    : 'radial-gradient(ellipse at center, rgba(77,182,172,0.06) 0%, transparent 70%)',
              }}
            />
            <p className="text-mgsr-muted text-lg mb-4 relative">
              {search.trim() || hasActiveFilters ? t('search_no_results') : isYouth ? t('players_empty_youth') : t(isWomen ? 'players_empty_women' : 'players_empty')}
            </p>
            {!search.trim() && !hasActiveFilters && (
              <Link
                href="/players/add"
                className={`inline-block px-6 py-3 font-semibold transition relative ${
                  isYouth
                    ? 'rounded-2xl text-white hover:opacity-90 shadow-[0_0_20px_rgba(0,212,255,0.15)]'
                    : isWomen
                      ? 'rounded-2xl bg-[var(--women-gradient)] text-white hover:opacity-90'
                      : 'rounded-xl bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
                }`}
                style={isYouth ? { background: 'linear-gradient(135deg, var(--youth-cyan), var(--youth-violet))' } : undefined}
              >
                {isYouth ? t('players_empty_hint_youth') : t(isWomen ? 'players_empty_hint_women' : 'players_empty_hint')}
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
                  platform === 'youth'
                    ? `/players/youth/${p.id}?from=/players`
                    : platform === 'women'
                      ? `/players/women/${p.id}?from=/players`
                      : `/players/${p.id}?from=/players`
                }
                className={`group flex items-center gap-4 p-4 border transition-all duration-300 animate-fade-in ${
                  isYouth
                    ? 'youth-glass-card rounded-2xl hover:border-[var(--youth-cyan)]/40 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)]'
                    : isWomen
                      ? 'bg-mgsr-card border-mgsr-border hover:bg-mgsr-card/80 rounded-2xl hover:border-[var(--women-rose)]/40 hover:shadow-[0_0_30px_rgba(232,160,191,0.12)]'
                      : 'bg-mgsr-card border-mgsr-border hover:bg-mgsr-card/80 rounded-xl hover:border-[var(--mgsr-accent)]/40'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="relative shrink-0">
                  {isYouth ? (
                    <div className="relative w-14 h-14">
                      {p.profileImage && (
                        <img
                          src={p.profileImage}
                          alt=""
                          className="absolute inset-0 w-full h-full rounded-full object-cover ring-2 ring-[var(--youth-cyan)]/20 group-hover:ring-[var(--youth-cyan)]/40 transition z-10"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div
                        className="w-full h-full rounded-full flex items-center justify-center ring-2 ring-[var(--youth-cyan)]/20 group-hover:ring-[var(--youth-cyan)]/40 transition"
                        style={{ background: 'linear-gradient(135deg, #00D4FF, #A855F7)' }}
                      >
                        <span className="text-base font-extrabold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
                          {(p.fullName || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={p.profileImage || '/placeholder-player.png'}
                      alt=""
                      className={`w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 transition ${isWomen ? 'ring-mgsr-border group-hover:ring-[var(--women-rose)]/40' : 'ring-mgsr-border group-hover:ring-mgsr-teal/40'}`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          platform === 'women'
                            ? 'https://placehold.co/56x56/1A2736/E8A0BF?text=?'
                            : 'https://via.placeholder.com/56?text=?';
                      }}
                    />
                  )}
                  {p.currentClub && 'clubLogo' in p.currentClub && p.currentClub.clubLogo && (
                    <img
                      src={p.currentClub.clubLogo}
                      alt=""
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full object-cover border border-mgsr-dark"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-mgsr-text truncate transition ${isYouth ? 'group-hover:text-[var(--youth-cyan)]' : isWomen ? 'group-hover:text-[var(--women-rose)]' : 'group-hover:text-mgsr-teal'}`}>
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
                  {isYouth && ('ageGroup' in p) && (p as YouthPlayer).ageGroup ? (
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--youth-violet)]/15 text-[var(--youth-violet)] text-xs font-semibold border border-[var(--youth-violet)]/20">
                      {(p as YouthPlayer).ageGroup}
                    </span>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <p className={`font-semibold ${isWomen ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-accent)]'}`}>{p.marketValue || '—'}</p>
                      {platform === 'men' && isEuNational(p.nationality, euCountries, (p as any).nationalities) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 leading-tight">
                          🇪🇺 {t('eu_nat_tag')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
