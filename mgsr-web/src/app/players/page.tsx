'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist, getAllAccounts, type AccountForShortlist } from '@/lib/accounts';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import AppLayout from '@/components/AppLayout';
import FilterBottomSheet from '@/components/mobile/FilterBottomSheet';
import { useIsMobileOrTablet } from '@/hooks/useMediaQuery';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
import { type ClubRequest, type RosterPlayer } from '@/lib/requestMatcher';
import { useAllRequestMatchResults } from '@/hooks/useMatchResults';
import { CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
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
  interestedInIsrael?: boolean;
  agentInChargeName?: string;
  agentInChargeId?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  foot?: string;
  nationality?: string;
  nationalities?: string[];
  salaryRange?: string;
  transferFee?: string;
  notes?: string;
  noteList?: { notes?: string; createBy?: string; createdAt?: number }[];
  agency?: string;
}

interface PlayersCache {
  players: Player[];
  search: string;
  positionFilter: string | null;
  specificPositionFilter: string | null;
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
  interestedInIsrael: boolean;
  taggedInNotes: boolean;
}

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK']),
  DEF: new Set(['CB', 'RB', 'LB']),
  MID: new Set(['CM', 'DM', 'AM']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS', 'AM']),
};

/** Specific positions available per group, shown in the dropdown. */
const SPECIFIC_POSITIONS_BY_GROUP: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'RB', 'LB'],
  MID: ['DM', 'CM', 'AM'],
  FWD: ['LW', 'RW', 'CF', 'ST', 'SS'],
};
const ALL_SPECIFIC_POSITIONS = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'ST', 'SS'];

/** English display labels for specific positions. */
const SPECIFIC_POSITION_LABELS_EN: Record<string, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre Back',
  RB: 'Right Back',
  LB: 'Left Back',
  DM: 'Defensive Mid',
  CM: 'Central Mid',
  AM: 'Attacking Mid',
  LW: 'Left Winger',
  RW: 'Right Winger',
  CF: 'Centre Forward',
  ST: 'Striker',
  SS: 'Second Striker',
};
/** Hebrew display labels for specific positions. */
const SPECIFIC_POSITION_LABELS_HE: Record<string, string> = {
  GK: 'שוער',
  CB: 'בלם',
  RB: 'מגן ימני',
  LB: 'מגן שמאלי',
  DM: 'קשר הגנתי',
  CM: 'קשר מרכזי',
  AM: 'קשר התקפי',
  LW: 'כנף שמאל',
  RW: 'כנף ימין',
  CF: 'חלוץ מרכזי',
  ST: 'חלוץ',
  SS: 'חלוץ שני',
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
  const precomputedRequestMatchResults = useAllRequestMatchResults();
  const cached = getScreenCache<PlayersCache>('players');
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [womenPlayers, setWomenPlayers] = useState<WomanPlayer[]>([]);
  const [youthPlayers, setYouthPlayers] = useState<YouthPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(cached === undefined);
  const [womenLoading, setWomenLoading] = useState(true);
  const [youthLoading, setYouthLoading] = useState(true);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [specificPositionFilter, setSpecificPositionFilter] = useState<string | null>(cached?.specificPositionFilter ?? null);
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
  const [interestedInIsrael, setInterestedInIsrael] = useState(cached?.interestedInIsrael ?? false);
  const [taggedInNotes, setTaggedInNotes] = useState(cached?.taggedInNotes ?? false);
  const scrollRestoredRef = useRef(false);

  // Save scroll position right before navigating away
  const saveScrollPosition = useCallback(() => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    try { sessionStorage.setItem('players_scrollY', String(y)); } catch {}
  }, []);

  const [offeredNoFeedbackProfiles, setOfferedNoFeedbackProfiles] = useState<Set<string>>(new Set());
  const [mandateDataByProfile, setMandateDataByProfile] = useState<Map<string, { expiryAt: number; validLeagues: string[] }>>(new Map());
  const [mandateExpanded, setMandateExpanded] = useState(false);
  const [currentAccountName, setCurrentAccountName] = useState<string | null>(null);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountForShortlist[]>([]);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [clubRequests, setClubRequests] = useState<(ClubRequest & { clubName?: string; clubLogo?: string; clubCountry?: string; clubCountryFlag?: string; notes?: string; contactName?: string; minAge?: number; maxAge?: number; ageDoesntMatter?: boolean; dominateFoot?: string; euOnly?: boolean; salaryRange?: string; transferFee?: string })[]>([]);
  const [expandedMatchingPlayerId, setExpandedMatchingPlayerId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'default' | 'age' | 'marketValue' | 'name'>('default');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => {
      setCurrentAccountName(acc.name ?? null);
      setCurrentAccountId(acc.id ?? null);
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
    const mandateQuery = query(
      collection(db, 'PlayerDocuments'),
      where('type', '==', 'MANDATE')
    );
    const unsub = onSnapshot(mandateQuery, (snap) => {
      const now = Date.now();
      const grouped = new Map<string, { expiryAt: number; validLeagues: string[] }>();
      snap.docs.forEach((doc) => {
        const d = doc.data();
        const profile = d.playerTmProfile as string | undefined;
        const expiresAt = d.expiresAt as number | undefined;
        const expired = d.expired as boolean | undefined;
        if (!profile || !expiresAt || expired || expiresAt < now) return;
        const leagues = (d.validLeagues as string[] | undefined) ?? [];
        const existing = grouped.get(profile);
        if (!existing || expiresAt > existing.expiryAt) {
          grouped.set(profile, {
            expiryAt: expiresAt,
            validLeagues: existing
              ? Array.from(new Set([...existing.validLeagues, ...leagues]))
              : leagues,
          });
        } else if (leagues.length > 0) {
          existing.validLeagues = Array.from(new Set([...existing.validLeagues, ...leagues]));
        }
      });
      setMandateDataByProfile(grouped);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'PlayerOffers'), (snap) => {
      // Group offers by player; keep those where ANY offer has no feedback
      const byPlayer = new Map<string, { total: number; withoutFeedback: number }>();
      snap.docs.forEach((doc) => {
        const d = doc.data();
        const profile = d.playerTmProfile as string | undefined;
        if (!profile) return;
        const entry = byPlayer.get(profile) ?? { total: 0, withoutFeedback: 0 };
        entry.total++;
        if (!(d.clubFeedback as string | undefined)?.trim()) {
          entry.withoutFeedback++;
        }
        byPlayer.set(profile, entry);
      });
      const profiles = new Set<string>();
      byPlayer.forEach(({ withoutFeedback }, profile) => {
        if (withoutFeedback > 0) profiles.add(profile);
      });
      setOfferedNoFeedbackProfiles(profiles);
    });
    return () => unsub();
  }, []);

  // Load ClubRequests for matching (men only)
  useEffect(() => {
    if (platform !== 'men') return;
    const reqCol = CLUB_REQUESTS_COLLECTIONS[platform];
    const q2 = query(collection(db, reqCol), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q2, (snap) => {
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as typeof clubRequests[number]);
      setClubRequests(reqs.filter((r) => (r as { status?: string }).status !== 'closed'));
    });
    return () => unsub();
  }, [platform]);

  useEffect(() => {
    setScreenCache<PlayersCache>('players', {
      players,
      search,
      positionFilter,
      specificPositionFilter,
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
      interestedInIsrael,
      taggedInNotes,
    });
  }, [players, search, positionFilter, specificPositionFilter, freeAgents, contractExpiring, withMandate, myPlayersOnly, agentFilter, loanPlayersOnly, withoutRegisteredAgent, withNotes, footFilter, euNationalOnly, offeredNoFeedback, interestedInIsrael]);

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
      if (withNotes) {
        result = result.filter((p) => p.noteList && p.noteList.length > 0);
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

    // Position — specific position takes precedence over group
    if (specificPositionFilter) {
      const code = specificPositionFilter.toUpperCase();
      result = result.filter((p) =>
        p.positions?.some((pos) => pos?.toUpperCase() === code)
      );
    } else if (positionFilter && POSITION_CODES[positionFilter]) {
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

    // Interested in Israel
    if (interestedInIsrael) {
      result = result.filter((p) => p.interestedInIsrael === true);
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

    // Tagged in notes
    if (taggedInNotes && currentAccountId) {
      result = result.filter((p) =>
        p.noteList?.some((note: any) =>
          Array.isArray(note.taggedAgentIds) && note.taggedAgentIds.includes(currentAccountId)
        )
      );
    }

    return result;
  }, [
    players,
    womenPlayers,
    youthPlayers,
    platform,
    search,
    positionFilter,
    specificPositionFilter,
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
    interestedInIsrael,
    taggedInNotes,
    currentAccountId,
  ]);

  const hasActiveFilters =
    !!positionFilter ||
    !!specificPositionFilter ||
    (platform === 'youth' && withNotes) ||
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
        interestedInIsrael ||
        taggedInNotes ||
        !!footFilter));

  const clearFilters = useCallback(() => {
    setPositionFilter(null);
    setSpecificPositionFilter(null);
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
    setInterestedInIsrael(false);
    setTaggedInNotes(false);
  }, []);

  const playersWithMandate = useMemo(() => {
    if (platform !== 'men') return [];
    return players
      .filter((p) => p.haveMandate || (p.tmProfile && mandateDataByProfile.has(p.tmProfile)))
      .map((p) => {
        const info = p.tmProfile ? mandateDataByProfile.get(p.tmProfile) : undefined;
        return { player: p, expiryAt: info?.expiryAt ?? null, validLeagues: info?.validLeagues ?? [] };
      })
      .sort((a, b) => (a.expiryAt ?? Infinity) - (b.expiryAt ?? Infinity));
  }, [players, mandateDataByProfile, platform]);

  // Compute matching requests per player using pre-computed results
  const matchingRequestsByPlayerId = useMemo(() => {
    if (platform !== 'men' || clubRequests.length === 0) return new Map<string, typeof clubRequests>();
    const map = new Map<string, typeof clubRequests>();
    // Invert pre-computed results: requestId→playerIds[] → playerId→requests[]
    const requestById = Object.fromEntries(clubRequests.map((r) => [r.id, r]));
    for (const [requestId, playerIds] of Object.entries(precomputedRequestMatchResults)) {
      const req = requestById[requestId];
      if (!req) continue;
      for (const pid of playerIds) {
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(req);
      }
    }
    return map;
  }, [platform, clubRequests, precomputedRequestMatchResults]);

  const sortedFiltered = useMemo(() => {
    if (platform !== 'men' || sortOption === 'default') return filtered;
    const parseMarketValue = (val: string | undefined): number => {
      if (!val) return 0;
      const cleaned = val.replace(/[€$£,\s]/g, '').toLowerCase();
      const match = cleaned.match(/^([\d.]+)(k|m)?$/);
      if (!match) return 0;
      const num = parseFloat(match[1]!);
      if (isNaN(num)) return 0;
      if (match[2] === 'm') return num * 1_000_000;
      if (match[2] === 'k') return num * 1_000;
      return num;
    };
    const sorted = [...filtered];
    switch (sortOption) {
      case 'age':
        sorted.sort((a, b) => {
          const ageA = a.age ? parseInt(a.age, 10) : 999;
          const ageB = b.age ? parseInt(b.age, 10) : 999;
          return ageA - ageB;
        });
        break;
      case 'marketValue':
        sorted.sort((a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue));
        break;
      case 'name':
        sorted.sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
        break;
    }
    return sorted;
  }, [filtered, sortOption, platform]);

  const displayList = sortedFiltered;
  const isLoading = platform === 'youth' ? youthLoading : platform === 'women' ? womenLoading : playersLoading;

  // Restore scroll position after list renders
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    const saved = sessionStorage.getItem('players_scrollY');
    if (!saved || saved === '0') return;
    if (isLoading || displayList.length === 0) return;
    scrollRestoredRef.current = true;
    const target = parseInt(saved, 10);
    sessionStorage.removeItem('players_scrollY');
    let attempts = 0;
    const maxAttempts = 30;
    const tryRestore = () => {
      window.scrollTo(0, target);
      const actual = window.scrollY || document.documentElement.scrollTop || 0;
      if (actual < target - 50 && attempts < maxAttempts) {
        attempts++;
        setTimeout(tryRestore, 50);
      }
    };
    tryRestore();
  }, [displayList.length, isLoading]);

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
        className={`max-w-6xl mx-auto ${isWomen ? 'p-3 sm:p-6 md:p-10' : ''}`}
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div>
            <h1
              className={`font-display font-bold text-mgsr-text tracking-tight ${
                isYouth ? 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold' : isWomen ? 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold' : 'text-2xl sm:text-3xl'
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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {POSITION_GROUPS.map((pos) => (
              <button
                key={pos}
                onClick={() => {
                  if (positionFilter === pos) {
                    setPositionFilter(null);
                    setSpecificPositionFilter(null);
                  } else {
                    setPositionFilter(pos);
                    setSpecificPositionFilter(null);
                  }
                }}
                className={`shrink-0 px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
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

            {/* Specific position dropdown — men only */}
            {platform === 'men' && (() => {
              const options = positionFilter ? (SPECIFIC_POSITIONS_BY_GROUP[positionFilter] ?? ALL_SPECIFIC_POSITIONS) : ALL_SPECIFIC_POSITIONS;
              const labels = lang === 'he' ? SPECIFIC_POSITION_LABELS_HE : SPECIFIC_POSITION_LABELS_EN;
              return (
                <select
                  value={specificPositionFilter ?? ''}
                  onChange={(e) => setSpecificPositionFilter(e.target.value || null)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 appearance-none cursor-pointer bg-mgsr-card border text-mgsr-muted hover:text-mgsr-text focus:outline-none ${
                    specificPositionFilter
                      ? 'border-[var(--mgsr-accent)]/60 text-[var(--mgsr-accent)] bg-[var(--mgsr-accent-dim)]'
                      : 'border-mgsr-border hover:border-[var(--mgsr-accent)]/40'
                  }`}
                  style={{ paddingRight: '28px', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: `${isRtl ? 'left 8px center' : 'right 8px center'}` }}
                >
                  <option value="">{lang === 'he' ? 'עמדה ספציפית' : 'Specific Position'}</option>
                  {options.map((code) => (
                    <option key={code} value={code}>
                      {labels[code] ?? code} ({code})
                    </option>
                  ))}
                </select>
              );
            })()}

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

        {/* Advanced filters — youth */}
        {platform === 'youth' && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-2 pb-1">
              <button
                onClick={() => setWithNotes((v) => !v)}
                className={`shrink-0 px-3 py-1.5 rounded-2xl text-sm font-medium transition-all duration-200 ${
                  withNotes
                    ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] border border-[var(--youth-cyan)]/40 shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                    : 'bg-white/5 border border-white/10 text-mgsr-muted hover:text-mgsr-text hover:border-[var(--youth-cyan)]/30'
                }`}
              >
                {t('players_filter_with_notes')}
              </button>
            </div>
          </div>
        )}

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
            <button
              onClick={() => setInterestedInIsrael((v) => !v)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                interestedInIsrael
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              🇮🇱 {t('players_filter_interested_in_israel')}
            </button>
            <button
              onClick={() => setTaggedInNotes((v) => !v)}
              disabled={!currentAccountId}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                taggedInNotes
                  ? 'bg-mgsr-teal text-mgsr-dark shadow-sm shadow-mgsr-teal/25'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/40'
              }`}
            >
              {t('players_filter_tagged_in_notes')}
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

        {/* Sort options — men only */}
        {platform === 'men' && (
          <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <span className="shrink-0 text-xs font-medium text-mgsr-muted uppercase tracking-wider">{t('players_sort_label')}</span>
            {([
              { key: 'default', label: t('players_sort_default') },
              { key: 'age', label: t('players_sort_age') },
              { key: 'marketValue', label: t('players_sort_market_value') },
              { key: 'name', label: t('players_sort_name') },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortOption(opt.key)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  sortOption === opt.key
                    ? 'bg-[var(--mgsr-accent)] text-mgsr-dark shadow-sm'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-[var(--mgsr-accent)]/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
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
              { key: 'interestedInIsrael', active: interestedInIsrael, toggle: () => setInterestedInIsrael(v => !v), label: `🇮🇱 ${t('players_filter_interested_in_israel')}` },
              { key: 'taggedInNotes', active: taggedInNotes, toggle: () => setTaggedInNotes(v => !v), label: t('players_filter_tagged_in_notes'), disabled: !currentAccountId },
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

        {/* Mandate section — men only */}
        {platform === 'men' && playersWithMandate.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setMandateExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/25 hover:border-blue-500/40 transition"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">
                  {playersWithMandate.length}
                </span>
                <span className="text-blue-400 font-semibold text-sm">
                  {t('players_with_mandate_title')}
                </span>
              </div>
              <svg
                className={`w-4 h-4 text-blue-400 transition-transform ${mandateExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {mandateExpanded && (
              <div className="mt-2 rounded-xl bg-mgsr-card border border-mgsr-border divide-y divide-mgsr-border overflow-hidden">
                {playersWithMandate.map((pwm) => (
                  <Link
                    key={pwm.player.id}
                    href={`/players/${pwm.player.id}?from=/players`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-mgsr-dark/40 transition"
                  >
                    <img
                      src={pwm.player.profileImage || '/placeholder-player.png'}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover bg-mgsr-dark ring-1 ring-mgsr-border"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/36?text=?'; }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-mgsr-text truncate">{pwm.player.fullName || 'Unknown'}</p>
                      <p className="text-xs text-mgsr-muted truncate">{pwm.player.currentClub?.clubName || '—'}</p>
                      {pwm.validLeagues.length > 0 && (
                        <p className="text-xs text-blue-400 truncate">{pwm.validLeagues.join(', ')}</p>
                      )}
                    </div>
                    {pwm.expiryAt && (
                      <span className="shrink-0 px-2 py-1 rounded-lg bg-blue-500/12 text-blue-400 text-[11px] font-semibold">
                        {t('players_mandate_expires_label')} {new Date(pwm.expiryAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
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
            {displayList.map((p, i) => {
              const playerMatchingReqs = platform === 'men' ? matchingRequestsByPlayerId.get(p.id) : undefined;
              const matchCount = playerMatchingReqs?.length ?? 0;
              return (
              <div
                key={p.id}
                className={`border transition-all duration-300 animate-fade-in overflow-visible ${
                  isYouth
                    ? 'youth-glass-card rounded-2xl hover:border-[var(--youth-cyan)]/40 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)]'
                    : isWomen
                      ? 'bg-mgsr-card border-mgsr-border hover:bg-mgsr-card/80 rounded-2xl hover:border-[var(--women-rose)]/40 hover:shadow-[0_0_30px_rgba(232,160,191,0.12)]'
                      : `bg-mgsr-card border-mgsr-border hover:bg-mgsr-card/80 rounded-xl ${matchCount > 0 ? 'border-mgsr-teal/15 hover:border-mgsr-teal/30' : 'hover:border-[var(--mgsr-accent)]/40'}`
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
              <Link
                onClick={saveScrollPosition}
                href={
                  platform === 'youth'
                    ? `/players/youth/${p.id}?from=/players`
                    : platform === 'women'
                      ? `/players/women/${p.id}?from=/players`
                      : `/players/${p.id}?from=/players`
                }
                className="group flex items-center gap-3 sm:gap-4 p-3 sm:p-4"
              >
                <div className="relative shrink-0">
                  {isYouth ? (
                    <div className="relative w-12 h-12 sm:w-14 sm:h-14">
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
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover bg-mgsr-dark ring-2 transition ${isWomen ? 'ring-mgsr-border group-hover:ring-[var(--women-rose)]/40' : 'ring-mgsr-border group-hover:ring-mgsr-teal/40'}`}
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
                  {platform === 'men' && p.createdAt && (
                    <p className="text-[11px] text-mgsr-muted/60 mt-0.5">
                      {isRtl ? 'נוסף' : 'Added'} {new Date(p.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
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

              {/* ── Status Badges Row — men only ── */}
              {platform === 'men' && (() => {
                const mp = p as Player;
                const clubName = mp.currentClub?.clubName;
                const isFree = clubName?.toLowerCase() === 'without club' || clubName?.toLowerCase() === 'vereinslos';
                const isExpiring = isContractExpiringWithin6Months(mp.contractExpired);
                const noteCount = (mp.noteList?.length ?? 0) || (mp.notes ? 1 : 0);
                const matchedAccount = mp.agentInChargeName && mp.agentInChargeName.toLowerCase() !== 'unknown'
                  ? allAccounts.find(a => a.name?.toLowerCase() === mp.agentInChargeName?.toLowerCase())
                  : null;
                const agentName = matchedAccount
                  ? (lang === 'he' && matchedAccount.hebrewName ? matchedAccount.hebrewName : matchedAccount.name) ?? mp.agentInChargeName
                  : (mp.agentInChargeName && mp.agentInChargeName.toLowerCase() !== 'unknown' ? mp.agentInChargeName : null);
                const hasBadges = mp.isOnLoan || mp.haveMandate || isExpiring || isFree || mp.contractExpired || noteCount > 0 || agentName;
                if (!hasBadges) return null;
                return (
                  <div className="px-3 sm:px-4 pb-2.5 pt-0.5 flex flex-wrap gap-1.5 items-center">
                    {mp.isOnLoan && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold tracking-wide bg-purple-500/15 text-purple-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        {isRtl ? 'השאלה' : 'LOAN'}
                      </span>
                    )}
                    {mp.haveMandate && (() => {
                      const mandateInfo = mp.tmProfile ? mandateDataByProfile.get(mp.tmProfile) : undefined;
                      const leagues = mandateInfo?.validLeagues?.filter(Boolean) ?? [];
                      const expiryDate = mandateInfo?.expiryAt ? new Date(mandateInfo.expiryAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
                      return (
                        <span className="relative group/mandate inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold tracking-wide bg-blue-500/15 text-blue-400 cursor-default">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
                          {isRtl ? 'מנדט' : 'MANDATE'}
                          {(leagues.length > 0 || expiryDate) && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/mandate:block z-50 animate-fade-in">
                              <span className="block rounded-xl bg-gradient-to-b from-mgsr-card to-mgsr-dark border border-blue-500/20 shadow-[0_8px_30px_rgba(0,0,0,0.5)] px-4 py-3 min-w-[240px] max-w-[360px] w-max" dir={isRtl ? 'rtl' : 'ltr'}>
                                <span className="block text-[12px] font-semibold text-blue-400 mb-2 pb-1.5 border-b border-mgsr-border/30">
                                  {isRtl ? 'פרטי מנדט' : 'Mandate Details'}
                                </span>
                                {leagues.length > 0 && (
                                  <span className="block mb-1.5">
                                    <span className="block text-[10px] text-mgsr-muted/60 uppercase tracking-wider mb-1">{isRtl ? 'ליגות / מדינות' : 'Leagues / Countries'}</span>
                                    <span className="flex flex-wrap gap-1">
                                      {leagues.map((league, li) => (
                                        <span key={li} className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-300/90">
                                          {league.toLowerCase() === 'worldwide' ? (isRtl ? '🌍 עולמי' : '🌍 Worldwide') : league}
                                        </span>
                                      ))}
                                    </span>
                                  </span>
                                )}
                                {expiryDate && (
                                  <span className="flex items-center gap-1.5 text-[11px] text-mgsr-muted/70 mt-1">
                                    <span>📅</span>
                                    <span>{isRtl ? 'תוקף עד' : 'Expires'}: <span className="text-mgsr-text/80 font-medium">{expiryDate}</span></span>
                                  </span>
                                )}
                              </span>
                              <span className="block w-2.5 h-2.5 mx-auto bg-mgsr-dark border-b border-r border-blue-500/20 rotate-45 -mt-[6px]" />
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    {isExpiring && !isFree && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold tracking-wide bg-amber-500/15 text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        {isRtl ? 'מסתיים' : 'EXPIRING'}
                      </span>
                    )}
                    {isFree && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold tracking-wide bg-red-500/15 text-red-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        {isRtl ? 'חופשי' : 'FREE'}
                      </span>
                    )}
                    {mp.contractExpired && mp.contractExpired !== '-' && !mp.contractExpired.toLowerCase().includes('unknown') && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-mgsr-muted/70 bg-white/[0.04]">
                        📅 {mp.contractExpired}
                      </span>
                    )}
                    {noteCount > 0 && (() => {
                      const noteTexts = mp.noteList?.length
                        ? mp.noteList.filter(n => n.notes).map(n => {
                            const rawBy = n.createBy;
                            const byDisplay = rawBy && lang === 'he'
                              ? (allAccounts.find(a => a.name?.toLowerCase() === rawBy.toLowerCase())?.hebrewName || rawBy)
                              : rawBy;
                            return { text: n.notes!, by: byDisplay, at: n.createdAt };
                          })
                        : mp.notes ? [{ text: mp.notes, by: undefined as string | undefined, at: undefined as number | undefined }] : [];
                      return (
                        <span className="relative group/note inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-violet-500/12 text-violet-400 cursor-default">
                          📝 {noteCount}
                          {noteTexts.length > 0 && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/note:block z-50 animate-fade-in">
                              <span className="block rounded-xl bg-gradient-to-b from-mgsr-card to-mgsr-dark border border-violet-500/20 shadow-[0_8px_30px_rgba(0,0,0,0.5)] px-4 py-3 min-w-[200px] max-w-[300px]" dir={isRtl ? 'rtl' : 'ltr'}>
                                <span className="block text-[12px] font-semibold text-violet-400 mb-2 pb-1.5 border-b border-mgsr-border/30">
                                  {isRtl ? 'הערות' : 'Notes'} ({noteCount})
                                </span>
                                <span className="flex flex-col gap-2.5 max-h-[180px] overflow-y-auto">
                                  {noteTexts.map((n, ni) => (
                                    <span key={ni} className="block" style={{ fontFamily: isRtl ? "'Heebo', 'Segoe UI', sans-serif" : "inherit" }}>
                                      <span className="block text-[13px] leading-[1.6] text-mgsr-text/90 font-normal">{n.text.length > 120 ? n.text.slice(0, 117) + '…' : n.text}</span>
                                      {(n.by || n.at) && (
                                        <span className="block text-[10px] text-mgsr-muted/50 mt-0.5">
                                          {n.by && <span>{n.by}</span>}
                                          {n.by && n.at && <span> · </span>}
                                          {n.at && <span>{new Date(n.at).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}</span>}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </span>
                              </span>
                              <span className="block w-2.5 h-2.5 mx-auto bg-mgsr-dark border-b border-r border-violet-500/20 rotate-45 -mt-[6px]" />
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    {agentName && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-mgsr-teal/10 text-mgsr-teal/80 max-w-[130px]">
                        <span className="w-3.5 h-3.5 rounded-full bg-mgsr-teal/20 flex items-center justify-center text-[7px] font-bold text-mgsr-teal leading-none shrink-0">{agentName.charAt(0).toUpperCase()}</span>
                        <span className="truncate">{agentName}</span>
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* ── Notes Badge — youth only ── */}
              {platform === 'youth' && (() => {
                const yp = p as YouthPlayer;
                const noteCount = yp.noteList?.length ?? 0;
                if (noteCount === 0) return null;
                return (
                  <div className="px-3 sm:px-4 pb-2.5 pt-0.5 flex flex-wrap gap-1.5 items-center">
                    {(() => {
                      const noteTexts = yp.noteList?.filter(n => n.notes).map(n => {
                        const rawBy = n.createBy;
                        const byDisplay = rawBy && lang === 'he'
                          ? (allAccounts.find(a => a.name?.toLowerCase() === rawBy.toLowerCase())?.hebrewName || rawBy)
                          : rawBy;
                        return { text: n.notes!, by: byDisplay, at: n.createdAt };
                      }) ?? [];
                      return (
                        <span className="relative group/note inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-violet-500/12 text-violet-400 cursor-default">
                          📝 {noteCount}
                          {noteTexts.length > 0 && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/note:block z-50 animate-fade-in">
                              <span className="block rounded-xl bg-gradient-to-b from-mgsr-card to-mgsr-dark border border-violet-500/20 shadow-[0_8px_30px_rgba(0,0,0,0.5)] px-4 py-3 min-w-[200px] max-w-[300px]" dir={isRtl ? 'rtl' : 'ltr'}>
                                <span className="block text-[12px] font-semibold text-violet-400 mb-2 pb-1.5 border-b border-mgsr-border/30">
                                  {isRtl ? 'הערות' : 'Notes'} ({noteCount})
                                </span>
                                <span className="flex flex-col gap-2.5 max-h-[180px] overflow-y-auto">
                                  {noteTexts.map((n, ni) => (
                                    <span key={ni} className="block" style={{ fontFamily: isRtl ? "'Heebo', 'Segoe UI', sans-serif" : "inherit" }}>
                                      <span className="block text-[13px] leading-[1.6] text-mgsr-text/90 font-normal">{n.text.length > 120 ? n.text.slice(0, 117) + '…' : n.text}</span>
                                      {(n.by || n.at) && (
                                        <span className="block text-[10px] text-mgsr-muted/50 mt-0.5">
                                          {n.by && <span>{n.by}</span>}
                                          {n.by && n.at && <span> · </span>}
                                          {n.at && <span>{new Date(n.at).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}</span>}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </span>
                              </span>
                              <span className="block w-2.5 h-2.5 mx-auto bg-mgsr-dark border-b border-r border-violet-500/20 rotate-45 -mt-[6px]" />
                            </span>
                          )}
                        </span>
                      );
                    })()}
                    {yp.agentInChargeName && yp.agentInChargeName.toLowerCase() !== 'unknown' && (() => {
                      const matchedAccount = allAccounts.find(a => a.name?.toLowerCase() === yp.agentInChargeName?.toLowerCase());
                      const agentName = matchedAccount
                        ? (lang === 'he' && matchedAccount.hebrewName ? matchedAccount.hebrewName : matchedAccount.name) ?? yp.agentInChargeName
                        : yp.agentInChargeName;
                      return (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium bg-[var(--youth-cyan)]/10 text-[var(--youth-cyan)]/80 max-w-[130px]">
                          <span className="w-3.5 h-3.5 rounded-full bg-[var(--youth-cyan)]/20 flex items-center justify-center text-[7px] font-bold text-[var(--youth-cyan)] leading-none shrink-0">{agentName!.charAt(0).toUpperCase()}</span>
                          <span className="truncate">{agentName}</span>
                        </span>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Matching Requests — expandable accordion, men only */}
              {matchCount > 0 && (
                <div className="border-t border-mgsr-border/20 px-3 sm:px-4 py-2">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedMatchingPlayerId(expandedMatchingPlayerId === p.id ? null : p.id); }}
                    className="w-full flex items-center justify-between text-left rtl:text-right py-0.5 group/acc"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-mgsr-teal/15 text-mgsr-teal text-[10px] font-bold ring-1 ring-mgsr-teal/20">{matchCount}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-mgsr-teal/60 group-hover/acc:text-mgsr-teal/80 transition">
                        {isRtl ? 'בקשות תואמות' : 'Matching Requests'}
                      </span>
                    </span>
                    <svg className={`w-3.5 h-3.5 text-mgsr-muted/40 transition-transform ${expandedMatchingPlayerId === p.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedMatchingPlayerId === p.id && (
                    <div className="mt-2 pb-1 flex flex-wrap gap-2">
                      {playerMatchingReqs!.map((req) => {
                        const r = req as ClubRequest & { clubName?: string; clubLogo?: string; clubCountry?: string; clubCountryFlag?: string; minAge?: number; maxAge?: number; ageDoesntMatter?: boolean; dominateFoot?: string; euOnly?: boolean; salaryRange?: string; transferFee?: string; notes?: string; contactName?: string };
                        const rows: { icon: string; img?: string; label: string }[] = [];
                        if (r.clubCountry) rows.push({ icon: '🌍', img: r.clubCountryFlag?.startsWith('http') ? r.clubCountryFlag : undefined, label: r.clubCountry });
                        if (r.ageDoesntMatter) rows.push({ icon: '📅', label: isRtl ? 'גיל: לא משנה' : 'Age: Any' });
                        else if (r.minAge || r.maxAge) rows.push({ icon: '📅', label: `${isRtl ? 'גיל' : 'Age'}: ${r.minAge ?? '—'}–${r.maxAge ?? '—'}` });
                        if (r.dominateFoot && r.dominateFoot !== 'any') rows.push({ icon: '🦶', label: `${isRtl ? 'רגל' : 'Foot'}: ${r.dominateFoot === 'left' ? (isRtl ? 'שמאל' : 'Left') : (isRtl ? 'ימין' : 'Right')}` });
                        if (r.euOnly) rows.push({ icon: '🇪🇺', label: isRtl ? 'EU בלבד' : 'EU Only' });
                        if (r.salaryRange) rows.push({ icon: '💰', label: `${isRtl ? 'שכר' : 'Salary'}: ${r.salaryRange}k` });
                        if (r.transferFee) rows.push({ icon: '🏷️', label: `${isRtl ? 'עלות' : 'Fee'}: ${r.transferFee}` });
                        if (r.contactName) rows.push({ icon: '👤', label: r.contactName });
                        if (r.notes) rows.push({ icon: '📝', label: r.notes.length > 60 ? r.notes.slice(0, 57) + '…' : r.notes });
                        return (
                          <span key={req.id} className="relative group/tip inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-mgsr-dark/60 to-mgsr-dark/30 text-[12px] text-mgsr-text cursor-default hover:from-mgsr-teal/10 hover:to-mgsr-teal/5 border border-mgsr-border/30 hover:border-mgsr-teal/30 transition-all shadow-sm">
                            {req.clubLogo && <img src={req.clubLogo} alt="" className="w-4.5 h-4.5 rounded-full object-cover ring-1 ring-mgsr-border/30" style={{ width: '18px', height: '18px' }} />}
                            <span className="font-medium text-mgsr-text/90 truncate max-w-[90px]">{req.clubName ?? '—'}</span>
                            <span className="px-1.5 py-0.5 rounded bg-mgsr-teal/15 text-mgsr-teal text-[10px] font-bold leading-none">{req.position}</span>
                            {rows.length > 0 && (
                              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/tip:block z-50 animate-fade-in">
                                <span className="block rounded-xl bg-gradient-to-b from-mgsr-card to-mgsr-dark border border-mgsr-teal/20 shadow-[0_8px_30px_rgba(0,0,0,0.5)] px-4 py-3 min-w-[180px] max-w-[260px]">
                                  <span className="flex items-center gap-2 mb-2 pb-2 border-b border-mgsr-border/30">
                                    {req.clubLogo && <img src={req.clubLogo} alt="" className="w-5 h-5 rounded object-cover" />}
                                    <span className="font-semibold text-[13px] text-mgsr-text">{req.clubName ?? '—'}</span>
                                    <span className="ml-auto text-mgsr-teal font-bold text-[13px]">{req.position}</span>
                                  </span>
                                  <span className="flex flex-col gap-1.5">
                                    {rows.map((row, ri) => (
                                      <span key={ri} className="flex items-start gap-2 text-[11px] text-mgsr-muted leading-tight">
                                        <span className="shrink-0 w-4 text-center">{row.img ? <img src={row.img} alt="" className="w-4 h-3 object-cover inline-block rounded-sm" /> : row.icon}</span>
                                        <span className="text-mgsr-text/80">{row.label}</span>
                                      </span>
                                    ))}
                                  </span>
                                </span>
                                <span className="block w-2.5 h-2.5 mx-auto bg-mgsr-dark border-b border-r border-mgsr-teal/20 rotate-45 -mt-[6px]" />
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
