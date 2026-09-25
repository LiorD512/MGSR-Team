'use client';

/**
 * Men platform players screen — "Light Management Room" redesign.
 *
 * A self-contained, full-bleed light-themed layout that replaces the standard
 * AppLayout shell FOR THE MEN PLATFORM ONLY. All visual styling lives under the
 * `.brit-room` scope in globals.css (shared with the dashboard). Hebrew/RTL
 * automatically switches the type to Heebo (see the [dir=rtl] overrides).
 *
 * This component owns its Firestore subscriptions and reproduces the exact
 * filter/sort behavior of the previous men players screen. Women & youth keep
 * the standard AppLayout players screen.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
import { getConfederation } from '@/lib/nationToConfederation';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { openWhatsAppWithMessage } from '@/lib/whatsapp';
import type { Confederation } from '@/lib/api';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import BritRail from '@/components/BritRail';
import MenAddPlayerDrawer from '@/components/MenAddPlayerDrawer';
import { isPlayerOurAsset } from '@/lib/transfermarkt-utils';
import { callPlayersUpdate } from '@/lib/callables';

// ── Player shape (matches the men 'Players' Firestore docs used by the screen) ──
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
  isOurAsset?: boolean;
  agentInChargeName?: string;
  agentInChargeId?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  foot?: string;
  nationality?: string;
  nationalities?: string[];
  salaryRange?: string;
  transferFee?: string;
  playerPhoneNumber?: string;
  notes?: string;
  noteList?: { notes?: string; createBy?: string; createdAt?: number; taggedAgentIds?: string[] }[];
  agency?: string;
  agencyUrl?: string;
}

type SortOption = 'default' | 'age' | 'marketValue' | 'name';

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK']),
  DEF: new Set(['CB', 'RB', 'LB']),
  MID: new Set(['CM', 'DM', 'AM']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS', 'AM']),
};

const SPECIFIC_POSITIONS_BY_GROUP: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'RB', 'LB'],
  MID: ['DM', 'CM', 'AM'],
  FWD: ['LW', 'RW', 'CF', 'ST', 'SS'],
};
const ALL_SPECIFIC_POSITIONS = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'ST', 'SS'];
const SPECIFIC_POSITION_LABELS_EN: Record<string, string> = {
  GK: 'Goalkeeper', CB: 'Centre Back', RB: 'Right Back', LB: 'Left Back',
  DM: 'Defensive Mid', CM: 'Central Mid', AM: 'Attacking Mid',
  LW: 'Left Winger', RW: 'Right Winger', CF: 'Centre Forward', ST: 'Striker', SS: 'Second Striker',
};
const SPECIFIC_POSITION_LABELS_HE: Record<string, string> = {
  GK: 'שוער', CB: 'בלם', RB: 'מגן ימני', LB: 'מגן שמאלי',
  DM: 'קשר הגנתי', CM: 'קשר מרכזי', AM: 'קשר התקפי',
  LW: 'כנף שמאל', RW: 'כנף ימין', CF: 'חלוץ מרכזי', ST: 'חלוץ', SS: 'חלוץ שני',
};

const REGION_OPTIONS: { value: Confederation; key: string }[] = [
  { value: 'UEFA', key: 'transfer_windows_group_uefa' },
  { value: 'CONMEBOL', key: 'transfer_windows_group_conmebol' },
  { value: 'CONCACAF', key: 'transfer_windows_group_concacaf' },
  { value: 'AFC', key: 'transfer_windows_group_afc' },
  { value: 'CAF', key: 'transfer_windows_group_caf' },
  { value: 'OFC', key: 'transfer_windows_group_ofc' },
];

/** Men-only market-value parser used for sorting (mirrors the original page). */
function parseMarketValue(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[€$£,\s]/g, '').toLowerCase();
  const match = cleaned.match(/^([\d.]+)(k|m)?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]!);
  if (isNaN(num)) return 0;
  if (match[2] === 'm') return num * 1_000_000;
  if (match[2] === 'k') return num * 1_000;
  return num;
}

function isContractExpiringWithin6Months(contractExpired: string | undefined): boolean {
  if (!contractExpired || contractExpired === '-') return false;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let date: Date | null = null;
  const m1 = contractExpired.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m1) date = new Date(+m1[3]!, +m1[2]! - 1, +m1[1]!);
  else {
    const m2 = contractExpired.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m2) date = new Date(+m2[3]!, +m2[2]! - 1, +m2[1]!);
    else {
      const m3 = contractExpired.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
      if (m3) {
        const mi = monthNames.indexOf(m3[1]!);
        if (mi >= 0) date = new Date(+m3[3]!, mi, +m3[2]!);
      }
    }
  }
  if (!date || isNaN(date.getTime())) return false;
  const now = new Date();
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() + 6);
  return date >= now && date <= threshold;
}

const isFreeAgent = (p: Player) => {
  const c = p.currentClub?.clubName?.toLowerCase();
  return c === 'without club' || c === 'vereinslos';
};

const clubDisplay = (p: Player, t: (k: string) => string) => {
  const c = p.currentClub?.clubName;
  if (!c) return t('no_club');
  if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
  return c;
};

const positionsLabel = (p: Player) => p.positions?.filter(Boolean).join(' / ') || '—';
const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

interface PlayersFilterCache {
  search: string;
  positionFilter: string | null;
  specificPositionFilter: string | null;
  secondaryPositionFilter: string | null;
  regionFilter: Confederation | null;
  sortOption: SortOption;
  freeAgents: boolean;
  contractExpiring: boolean;
  withMandate: boolean;
  myPlayersOnly: boolean;
  loanPlayersOnly: boolean;
  withoutRegisteredAgent: boolean;
  withNotes: boolean;
  footFilter: 'left' | 'right' | null;
  euNationalOnly: boolean;
  offeredNoFeedback: boolean;
  interestedInIsrael: boolean;
  taggedInNotes: boolean;
  view: 'table' | 'gallery';
}

export default function MenPlayers() {
  const { user } = useAuth();
  const { t, lang, setLang, isRtl } = useLanguage();
  const router = useRouter();
  const euCountries = useEuCountries();

  const cached = getScreenCache<PlayersFilterCache>('men-players');

  const [players, setPlayers] = useState<Player[]>([]);
  const [ready, setReady] = useState(false);
  const [offeredNoFeedbackProfiles, setOfferedNoFeedbackProfiles] = useState<Set<string>>(new Set());
  const [currentAccountName, setCurrentAccountName] = useState<string | null>(null);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);

  // Filters / view
  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [specificPositionFilter, setSpecificPositionFilter] = useState<string | null>(cached?.specificPositionFilter ?? null);
  const [secondaryPositionFilter, setSecondaryPositionFilter] = useState<string | null>(cached?.secondaryPositionFilter ?? null);
  const [regionFilter, setRegionFilter] = useState<Confederation | null>(cached?.regionFilter ?? null);
  const [sortOption, setSortOption] = useState<SortOption>(cached?.sortOption ?? 'default');
  const [freeAgents, setFreeAgents] = useState(cached?.freeAgents ?? false);
  const [contractExpiring, setContractExpiring] = useState(cached?.contractExpiring ?? false);
  const [withMandate, setWithMandate] = useState(cached?.withMandate ?? false);
  const [myPlayersOnly, setMyPlayersOnly] = useState(cached?.myPlayersOnly ?? false);
  const [loanPlayersOnly, setLoanPlayersOnly] = useState(cached?.loanPlayersOnly ?? false);
  const [withoutRegisteredAgent, setWithoutRegisteredAgent] = useState(cached?.withoutRegisteredAgent ?? false);
  const [withNotes, setWithNotes] = useState(cached?.withNotes ?? false);
  const [footFilter, setFootFilter] = useState<'left' | 'right' | null>(cached?.footFilter ?? null);
  const [euNationalOnly, setEuNationalOnly] = useState(cached?.euNationalOnly ?? false);
  const [offeredNoFeedback, setOfferedNoFeedback] = useState(cached?.offeredNoFeedback ?? false);
  const [interestedInIsrael, setInterestedInIsrael] = useState(cached?.interestedInIsrael ?? false);
  const [taggedInNotes, setTaggedInNotes] = useState(cached?.taggedInNotes ?? false);
  const [view, setView] = useState<'table' | 'gallery'>(cached?.view ?? 'gallery');

  const [drawer, setDrawer] = useState<Player | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [assetToggling, setAssetToggling] = useState(false);

  const handleToggleOurAsset = async (targetPlayer: Player) => {
    const currentStatus = isPlayerOurAsset(targetPlayer);
    const nextStatus = !currentStatus;

    setDrawer((prev) => (prev && prev.id === targetPlayer.id ? { ...prev, isOurAsset: nextStatus } : prev));
    setPlayers((prev) =>
      prev.map((p) => (p.id === targetPlayer.id ? { ...p, isOurAsset: nextStatus } : p))
    );

    setAssetToggling(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'Players', targetPlayer.id), { isOurAsset: nextStatus });
      await callPlayersUpdate({ platform: 'men', playerId: targetPlayer.id, isOurAsset: nextStatus }).catch(() => {});
    } catch (err) {
      console.error('Failed to toggle asset status:', err);
      setDrawer((prev) => (prev && prev.id === targetPlayer.id ? { ...prev, isOurAsset: currentStatus } : prev));
      setPlayers((prev) =>
        prev.map((p) => (p.id === targetPlayer.id ? { ...p, isOurAsset: currentStatus } : p))
      );
    } finally {
      setAssetToggling(false);
    }
  };

  // ── Subscriptions ──
  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => {
      setCurrentAccountName(acc.name ?? null);
      setCurrentAccountId(acc.id ?? null);
    });
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'Players'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setPlayers(
        snap.docs.map((doc) => {
          const d = doc.data();
          return { id: doc.id, ...d, isOnLoan: d.onLoan ?? d.isOnLoan ?? false } as Player;
        })
      );
      setReady(true);
    }, () => setReady(true));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'PlayerOffers'), (snap) => {
      const byPlayer = new Map<string, { total: number; withoutFeedback: number }>();
      snap.docs.forEach((doc) => {
        const d = doc.data();
        const profile = d.playerTmProfile as string | undefined;
        if (!profile) return;
        const entry = byPlayer.get(profile) ?? { total: 0, withoutFeedback: 0 };
        entry.total++;
        if (!(d.clubFeedback as string | undefined)?.trim()) entry.withoutFeedback++;
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

  // Persist filters/view
  useEffect(() => {
    setScreenCache<PlayersFilterCache>('men-players', {
      search,
      positionFilter,
      specificPositionFilter,
      secondaryPositionFilter,
      regionFilter,
      sortOption,
      freeAgents,
      contractExpiring,
      withMandate,
      myPlayersOnly,
      loanPlayersOnly,
      withoutRegisteredAgent,
      withNotes,
      footFilter,
      euNationalOnly,
      offeredNoFeedback,
      interestedInIsrael,
      taggedInNotes,
      view,
    });
  }, [
    search, positionFilter, specificPositionFilter, secondaryPositionFilter, regionFilter, sortOption,
    freeAgents, contractExpiring, withMandate, myPlayersOnly, loanPlayersOnly, withoutRegisteredAgent,
    withNotes, footFilter, euNationalOnly, offeredNoFeedback, interestedInIsrael, taggedInNotes, view,
  ]);

  // ── Filtering (mirrors the original men predicates exactly) ──
  const filtered = useMemo(() => {
    let result = players;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.fullName?.toLowerCase().includes(q) ||
          p.positions?.some((pos) => pos?.toLowerCase().includes(q)) ||
          p.currentClub?.clubName?.toLowerCase().includes(q)
      );
    }

    // Position — specific main position takes precedence over group; checks the
    // primary position (index 0) only. Otherwise fall back to the group filter.
    if (specificPositionFilter) {
      const code = specificPositionFilter.toUpperCase();
      result = result.filter((p) => p.positions?.[0]?.toUpperCase() === code);
    } else if (positionFilter && POSITION_CODES[positionFilter]) {
      const codes = POSITION_CODES[positionFilter];
      result = result.filter((p) => p.positions?.some((pos) => pos && codes.has(pos.toUpperCase())));
    }

    // Secondary position — matches if the code exists anywhere in positions[].
    if (secondaryPositionFilter) {
      const code = secondaryPositionFilter.toUpperCase();
      result = result.filter((p) => (p.positions ?? []).some((pos) => pos?.toUpperCase() === code));
    }

    if (regionFilter) {
      result = result.filter((p) => {
        if (p.nationality && getConfederation(p.nationality) === regionFilter) return true;
        if (Array.isArray(p.nationalities)) {
          return p.nationalities.some((n) => getConfederation(n) === regionFilter);
        }
        return false;
      });
    }

    if (freeAgents || contractExpiring) {
      result = result.filter((p) => {
        const free = p.currentClub?.clubName?.toLowerCase() === 'without club';
        const expiring = isContractExpiringWithin6Months(p.contractExpired);
        if (freeAgents && contractExpiring) return free || expiring;
        if (freeAgents) return free;
        return expiring;
      });
    }

    if (withMandate) result = result.filter((p) => p.haveMandate === true);
    if (interestedInIsrael) result = result.filter((p) => p.interestedInIsrael === true);

    if (myPlayersOnly && currentAccountName) {
      result = result.filter(
        (p) => p.agentInChargeName?.toLowerCase() === currentAccountName.toLowerCase()
      );
    }

    if (loanPlayersOnly) result = result.filter((p) => p.isOnLoan === true);

    if (withoutRegisteredAgent) {
      const noAgentValues = ['relatives', 'no agent', 'without agent', 'ohne berater', 'sans agent'];
      result = result.filter((p) => {
        const agency = p.agency?.trim()?.toLowerCase();
        return !agency || noAgentValues.some((v) => agency === v || agency.includes(v));
      });
    }

    if (withNotes) {
      result = result.filter(
        (p) => (p.notes && p.notes.trim().length > 0) || (p.noteList && p.noteList.length > 0)
      );
    }

    if (footFilter) {
      const f = footFilter.toLowerCase();
      result = result.filter((p) => p.foot?.toLowerCase() === f);
    }

    if (euNationalOnly && euCountries.size > 0) {
      result = result.filter((p) =>
        p.nationality ? isEuNational(p.nationality, euCountries, p.nationalities) : false
      );
    }

    if (offeredNoFeedback) {
      result = result.filter((p) => p.tmProfile && offeredNoFeedbackProfiles.has(p.tmProfile));
    }

    if (taggedInNotes && currentAccountId) {
      result = result.filter((p) =>
        p.noteList?.some(
          (note) => Array.isArray(note.taggedAgentIds) && note.taggedAgentIds.includes(currentAccountId)
        )
      );
    }

    return result;
  }, [
    players, search, positionFilter, specificPositionFilter, secondaryPositionFilter, regionFilter,
    freeAgents, contractExpiring, withMandate, interestedInIsrael, myPlayersOnly, currentAccountName,
    loanPlayersOnly, withoutRegisteredAgent, withNotes, footFilter, euNationalOnly, euCountries,
    offeredNoFeedback, offeredNoFeedbackProfiles, taggedInNotes, currentAccountId,
  ]);

  const displayList = useMemo(() => {
    if (sortOption === 'default') return filtered;
    const sorted = [...filtered];
    if (sortOption === 'age') {
      sorted.sort((a, b) => (a.age ? parseInt(a.age, 10) : 999) - (b.age ? parseInt(b.age, 10) : 999));
    } else if (sortOption === 'marketValue') {
      sorted.sort((a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue));
    } else if (sortOption === 'name') {
      sorted.sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
    }
    return sorted;
  }, [filtered, sortOption]);

  // ── Signals ──
  const valuedCount = useMemo(
    () => players.filter((p) => parseMarketValue(p.marketValue) > 0).length,
    [players]
  );
  const totalValue = useMemo(
    () => players.reduce((s, p) => s + parseMarketValue(p.marketValue), 0),
    [players]
  );
  const euCount = useMemo(() => {
    if (euCountries.size === 0) return 0;
    return players.filter((p) => isEuNational(p.nationality, euCountries, p.nationalities)).length;
  }, [players, euCountries]);
  const mandateCount = useMemo(() => players.filter((p) => p.haveMandate).length, [players]);
  const freeCount = useMemo(() => players.filter(isFreeAgent).length, [players]);

  const activeFilterCount =
    (positionFilter ? 1 : 0) +
    (specificPositionFilter ? 1 : 0) +
    (secondaryPositionFilter ? 1 : 0) +
    (regionFilter ? 1 : 0) +
    [freeAgents, contractExpiring, withMandate, myPlayersOnly, loanPlayersOnly, withoutRegisteredAgent,
      withNotes, euNationalOnly, offeredNoFeedback, interestedInIsrael, taggedInNotes].filter(Boolean).length +
    (footFilter ? 1 : 0);

  const clearFilters = () => {
    setPositionFilter(null);
    setSpecificPositionFilter(null);
    setSecondaryPositionFilter(null);
    setRegionFilter(null);
    setFreeAgents(false);
    setContractExpiring(false);
    setWithMandate(false);
    setMyPlayersOnly(false);
    setLoanPlayersOnly(false);
    setWithoutRegisteredAgent(false);
    setWithNotes(false);
    setFootFilter(null);
    setEuNationalOnly(false);
    setOfferedNoFeedback(false);
    setInterestedInIsrael(false);
    setTaggedInNotes(false);
  };

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmtValue = (v: number) =>
    v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 2)}M` : v > 0 ? `€${Math.round(v / 1000)}K` : '€0';

  const goToPlayer = (id: string) => router.push(`/players/${id}?from=/players`);

  const messageOnWhatsApp = (p: Player) => {
    if (!p.playerPhoneNumber) return;
    openWhatsAppWithMessage(p.playerPhoneNumber, `${p.fullName || ''}`.trim());
  };

  // Toggle chips definition (label + active + toggle), plus disabled where relevant.
  const chips: { key: string; label: string; active: boolean; toggle: () => void; disabled?: boolean }[] = [
    { key: 'my', label: t('players_filter_my_players_only'), active: myPlayersOnly, toggle: () => setMyPlayersOnly((v) => !v), disabled: !currentAccountName },
    { key: 'eu', label: `🇪🇺 ${t('players_filter_eu_national')}`, active: euNationalOnly, toggle: () => setEuNationalOnly((v) => !v) },
    { key: 'mandate', label: t('players_filter_with_mandate'), active: withMandate, toggle: () => setWithMandate((v) => !v) },
    { key: 'free', label: t('players_filter_free_agents'), active: freeAgents, toggle: () => setFreeAgents((v) => !v) },
    { key: 'exp', label: t('players_filter_contract_expiring'), active: contractExpiring, toggle: () => setContractExpiring((v) => !v) },
    { key: 'loan', label: t('players_filter_loan_players_only'), active: loanPlayersOnly, toggle: () => setLoanPlayersOnly((v) => !v) },
    { key: 'notes', label: t('players_filter_with_notes'), active: withNotes, toggle: () => setWithNotes((v) => !v) },
    { key: 'noagent', label: t('players_filter_without_registered_agent'), active: withoutRegisteredAgent, toggle: () => setWithoutRegisteredAgent((v) => !v) },
    { key: 'footL', label: t('players_filter_foot_left'), active: footFilter === 'left', toggle: () => setFootFilter((v) => (v === 'left' ? null : 'left')) },
    { key: 'footR', label: t('players_filter_foot_right'), active: footFilter === 'right', toggle: () => setFootFilter((v) => (v === 'right' ? null : 'right')) },
    { key: 'offered', label: t('players_filter_offered_no_feedback'), active: offeredNoFeedback, toggle: () => setOfferedNoFeedback((v) => !v) },
    { key: 'israel', label: `🇮🇱 ${t('players_filter_interested_in_israel')}`, active: interestedInIsrael, toggle: () => setInterestedInIsrael((v) => !v) },
    { key: 'tagged', label: t('players_filter_tagged_in_notes'), active: taggedInNotes, toggle: () => setTaggedInNotes((v) => !v), disabled: !currentAccountId },
  ];

  const specLabels = lang === 'he' ? SPECIFIC_POSITION_LABELS_HE : SPECIFIC_POSITION_LABELS_EN;
  // Main-position options narrow to the active group (if any), else list all.
  const mainPositionOptions = positionFilter
    ? SPECIFIC_POSITIONS_BY_GROUP[positionFilter] ?? ALL_SPECIFIC_POSITIONS
    : ALL_SPECIFIC_POSITIONS;

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: 'default', label: t('players_sort_default') },
    { key: 'age', label: t('players_sort_age') },
    { key: 'marketValue', label: t('players_sort_market_value') },
    { key: 'name', label: t('players_sort_name') },
  ];

  const playerFlags = (p: Player) => {
    const out: { cls: string; label: string }[] = [];
    if (isEuNational(p.nationality, euCountries, p.nationalities)) out.push({ cls: 'eu', label: t('eu_nat_tag') });
    if (p.haveMandate) out.push({ cls: 'mandate', label: isRtl ? 'מנדט' : 'Mandate' });
    if (isFreeAgent(p)) out.push({ cls: 'free', label: isRtl ? 'חופשי' : 'Free' });
    else if (isContractExpiringWithin6Months(p.contractExpired)) out.push({ cls: 'exp', label: isRtl ? 'מסתיים' : 'Exp' });
    if (p.isOnLoan) out.push({ cls: 'loan', label: isRtl ? 'השאלה' : 'Loan' });
    return out;
  };

  const latestNote = (p: Player) => {
    const list = p.noteList?.filter((n) => n.notes?.trim()) ?? [];
    if (list.length) return list[list.length - 1]!.notes!;
    return p.notes?.trim() || '';
  };

  const agentDisplay = (p: Player) => {
    const name = p.agentInChargeName?.trim();
    if (!name || name.toLowerCase() === 'unknown') return '';
    return name;
  };

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        {/* Rail */}
        <BritRail
          active="players"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('room_signal_roster')}
              <strong>{players.length}</strong>
            </div>
          }
        />

        {/* Main */}
        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_players')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
                {lang === 'en' ? 'HE / EN' : 'EN / HE'}
              </button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            {/* Masthead */}
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('room_kicker')}</p>
                <h1>
                  {t('players_room_head_a')} <span>{t('players_room_head_b')}</span>
                </h1>
              </div>
              <div className="brit-mast-actions">
                <div className="brit-view-toggle" role="tablist" aria-label="View mode">
                  <button
                    className={view === 'table' ? 'active' : ''}
                    onClick={() => setView('table')}
                  >
                    {t('players_view_ledger')}
                  </button>
                  <button
                    className={view === 'gallery' ? 'active' : ''}
                    onClick={() => setView('gallery')}
                  >
                    {t('players_view_gallery')}
                  </button>
                </div>
                <button className="brit-mast-add" onClick={() => setShowAddDrawer(true)}>+ {t('players_add')}</button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals" aria-label={t('room_signals')}>
              <div className="brit-signal">
                <label>{t('room_signal_roster')}</label>
                <strong>{String(players.length).padStart(2, '0')}</strong>
                <small>{t('room_signal_roster_note').replace('{n}', String(euCount))}</small>
              </div>
              <div className="brit-signal">
                <label>{t('players_signal_value')}</label>
                <strong className="brit-gold">{fmtValue(totalValue)}</strong>
                <small>{t('players_signal_value_note').replace('{n}', String(valuedCount))}</small>
              </div>
              <div className="brit-signal">
                <label>{t('players_signal_mandate')}</label>
                <strong>{String(mandateCount).padStart(2, '0')}</strong>
                <small>{t('players_signal_mandate_note').replace('{n}', String(players.length - mandateCount))}</small>
              </div>
              <div className="brit-signal">
                <label>{t('players_signal_free')}</label>
                <strong className={freeCount > 0 ? 'brit-gold' : ''}>{String(freeCount).padStart(2, '0')}</strong>
                <small>{t('players_signal_free_note')}</small>
              </div>
            </section>

            {/* Filter tray */}
            <section className="brit-tray" aria-label={t('filters')}>
              <div className="brit-tray-top">
                <label className="brit-search">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('search_placeholder')}
                    aria-label={t('search_placeholder')}
                  />
                </label>
                <div className="brit-segment" role="group" aria-label="Position group">
                  <button
                    className={!positionFilter ? 'active' : ''}
                    onClick={() => {
                      setPositionFilter(null);
                      setSpecificPositionFilter(null);
                    }}
                  >
                    {t('releases_all')}
                  </button>
                  {POSITION_GROUPS.map((pos) => (
                    <button
                      key={pos}
                      className={positionFilter === pos ? 'active' : ''}
                      onClick={() => {
                        setPositionFilter((v) => (v === pos ? null : pos));
                        setSpecificPositionFilter(null);
                      }}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific main + secondary position selectors */}
              <div className="brit-pos-row">
                <label className="brit-pos-select">
                  <span>{t('players_position_main')}</span>
                  <select
                    value={specificPositionFilter ?? ''}
                    onChange={(e) => setSpecificPositionFilter(e.target.value || null)}
                  >
                    <option value="">{t('players_position_any')}</option>
                    {mainPositionOptions.map((code) => (
                      <option key={code} value={code}>
                        {code} · {specLabels[code] ?? code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="brit-pos-select">
                  <span>{t('players_position_secondary')}</span>
                  <select
                    value={secondaryPositionFilter ?? ''}
                    onChange={(e) => setSecondaryPositionFilter(e.target.value || null)}
                  >
                    <option value="">{t('players_position_any')}</option>
                    {ALL_SPECIFIC_POSITIONS.map((code) => (
                      <option key={code} value={code}>
                        {code} · {specLabels[code] ?? code}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="brit-chips">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    className={`brit-chip${c.active ? ' on' : ''}`}
                    onClick={c.toggle}
                    disabled={c.disabled}
                    style={c.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                  >
                    <span className="brit-dot" />
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Confederation / region — its own dedicated row */}
              <div className="brit-region-row">
                <span className="brit-region-label">{t('releases_region')}</span>
                <div className="brit-region-chips">
                  {REGION_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      className={`brit-region-chip${regionFilter === r.value ? ' on' : ''}`}
                      onClick={() => setRegionFilter((v) => (v === r.value ? null : r.value))}
                    >
                      {t(r.key)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-tray-bottom">
                <div className="brit-sort">
                  <span>{t('players_sort_label')}</span>
                  {sortOptions.map((o) => (
                    <button
                      key={o.key}
                      className={sortOption === o.key ? 'active' : ''}
                      onClick={() => setSortOption(o.key)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {activeFilterCount > 0 && (
                  <button className="brit-clear" onClick={clearFilters}>
                    {t('players_clear_filters')} ×
                  </button>
                )}
              </div>
            </section>

            <p className="brit-result-count">
              {t('players_showing')
                .replace('{n}', String(displayList.length))
                .replace('{total}', String(players.length))}
              {activeFilterCount > 0 && (
                <> / {t('players_filters_active').replace('{n}', String(activeFilterCount))}</>
              )}
            </p>

            {/* First-load skeleton (avoids empty gallery / 0-count flash) */}
            {!ready && (
              <div className="brit-players-gallery">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div className="brit-skel-card brit-skel-tall" key={i}>
                    <div className="top brit-skel" />
                  </div>
                ))}
              </div>
            )}

            {/* Table view */}
            {ready && view === 'table' && (
              <div className="brit-table-wrap">
                <table className="brit-roster brit-players-table">
                  <thead>
                    <tr>
                      <th>{t('room_th_player')}</th>
                      <th>{t('room_th_club')}</th>
                      <th>{t('room_th_position')}</th>
                      <th>{t('players_th_age')}</th>
                      <th>{t('room_th_value')}</th>
                      <th>{t('players_th_agent')}</th>
                      <th>{t('players_th_signals')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map((p) => (
                      <tr key={p.id} onClick={() => setDrawer(p)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div className="brit-cell-player">
                            {p.profileImage ? (
                              <img className="brit-p-thumb" src={p.profileImage} alt="" />
                            ) : (
                              <div className="brit-p-thumb brit-p-thumb-ph">{initials(p.fullName)}</div>
                            )}
                            <div>
                              <div className="brit-p-name">{p.fullName || '—'}</div>
                              <div className="brit-p-meta">{p.nationality || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{clubDisplay(p, t)}</td>
                        <td>
                          <div className="brit-pos-tags">
                            {(p.positions?.filter(Boolean) ?? []).slice(0, 3).map((pos, idx) => (
                              <b key={idx}>{pos}</b>
                            ))}
                            {(!p.positions || p.positions.filter(Boolean).length === 0) && '—'}
                          </div>
                        </td>
                        <td>{p.age || '—'}</td>
                        <td className="brit-val">{p.marketValue || '—'}</td>
                        <td className="brit-p-agent-cell">{agentDisplay(p) || '—'}</td>
                        <td>
                          <div className="brit-flags">
                            {playerFlags(p).length ? (
                              playerFlags(p).map((f, idx) => (
                                <span key={idx} className={`brit-tag ${f.cls}`}>
                                  {f.label}
                                </span>
                              ))
                            ) : (
                              <span className="brit-p-meta">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {displayList.length === 0 && <div className="brit-empty">{t('players_empty_filtered')}</div>}
              </div>
            )}

            {/* Gallery view */}
            {ready && view === 'gallery' && (
              <div className="brit-players-gallery">
                {displayList.map((p, i) => {
                  const flags = playerFlags(p).filter((f) => f.cls !== 'mandate');
                  return (
                    <article key={p.id} className="brit-player-card" onClick={() => setDrawer(p)}>
                      {p.profileImage ? (
                        <img src={p.profileImage} alt={p.fullName || ''} />
                      ) : (
                        <div className="brit-player-card-ph" />
                      )}
                      <div className="brit-player-card-top">
                        <span className="brit-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="brit-ct-flags">
                          {flags.map((f, idx) => (
                            <b key={idx}>{f.label}</b>
                          ))}
                        </span>
                      </div>
                      {agentDisplay(p) && (
                        <span className="brit-card-agent" title={agentDisplay(p)}>
                          <span className="brit-card-agent-dot">{agentDisplay(p).charAt(0).toUpperCase()}</span>
                          {agentDisplay(p)}
                        </span>
                      )}
                      <div className="brit-player-card-copy">
                        <small>
                          {clubDisplay(p, t)} / {positionsLabel(p)}
                        </small>
                        <h3>{p.fullName || '—'}</h3>
                        <div className="brit-cval">
                          {p.marketValue || '—'}
                          {p.age ? ` · ${p.age}` : ''}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {displayList.length === 0 && <div className="brit-empty">{t('players_empty_filtered')}</div>}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Quick-view drawer */}
      <div
        className={`brit-scrim${drawer ? ' open' : ''}`}
        onClick={() => setDrawer(null)}
        aria-hidden={!drawer}
      />
      <aside className={`brit-drawer${drawer ? ' open' : ''}`} aria-label="Player quick view">
        {drawer && (
          <>
            <div className="brit-drawer-hero">
              {drawer.profileImage ? (
                <img src={drawer.profileImage} alt="" />
              ) : (
                <div className="brit-player-card-ph" style={{ position: 'absolute', inset: 0 }} />
              )}
              <button className="brit-drawer-close" onClick={() => setDrawer(null)} aria-label={t('room_close')}>
                ×
              </button>
              <div className="brit-drawer-hero-copy">
                <small>
                  {clubDisplay(drawer, t)} / {positionsLabel(drawer)}
                </small>
                <h2>{drawer.fullName || '—'}</h2>
              </div>
            </div>
            <div className="brit-drawer-body">
              <div className="brit-facts">
                <div>
                  <label>{t('room_market_value')}</label>
                  <strong>{drawer.marketValue || '—'}</strong>
                </div>
                <div>
                  <label>{t('players_th_age')}</label>
                  <strong>{drawer.age || '—'}</strong>
                </div>
                <div>
                  <label>{t('room_th_position')}</label>
                  <strong>{positionsLabel(drawer)}</strong>
                </div>
                <div>
                  <label>{t('room_mandate_status')}</label>
                  <strong>
                    {drawer.haveMandate
                      ? t('room_mandate_active')
                      : isFreeAgent(drawer)
                      ? t('players_filter_free_agents')
                      : t('room_mandate_none')}
                  </strong>
                </div>
                <div>
                  <label>{t('players_drawer_nationality')}</label>
                  <strong>{drawer.nationality || '—'}</strong>
                </div>
                <div>
                  <label>{t('room_birthdays_agent').replace(' /', '')}</label>
                  <strong>{drawer.agentInChargeName || '—'}</strong>
                </div>
              </div>
              <div className="brit-drawer-switchrow">
                <div className="lbl">{t('players_drawer_mark_as_asset')}</div>
                <label className="bp-sw">
                  <input
                    type="checkbox"
                    checked={isPlayerOurAsset(drawer)}
                    disabled={assetToggling}
                    onChange={() => handleToggleOurAsset(drawer)}
                  />
                  <span className="track" />
                </label>
              </div>
              {latestNote(drawer) && (
                <div className="brit-drawer-note">
                  <label>{t('players_drawer_latest_note')}</label>
                  <p>{latestNote(drawer)}</p>
                </div>
              )}
              <div className="brit-drawer-actions">
                <button className="primary" onClick={() => goToPlayer(drawer.id)}>
                  {t('players_drawer_open_profile')}
                </button>
                <button
                  className="ghost"
                  onClick={() => messageOnWhatsApp(drawer)}
                  disabled={!drawer.playerPhoneNumber}
                  style={!drawer.playerPhoneNumber ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  {t('players_drawer_whatsapp')}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      {/* Add-player guided drawer */}
      <MenAddPlayerDrawer open={showAddDrawer} onClose={() => setShowAddDrawer(false)} />
    </div>
  );
}
