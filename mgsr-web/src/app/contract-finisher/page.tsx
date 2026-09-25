'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callShortlistAdd } from '@/lib/callables';
import { getTeammates, extractPlayerIdFromUrl, getPlayerDetails, type ContractFinisherPlayer } from '@/lib/api';
import { subscribe, loadContractFinishers, getContractFinisherState } from '@/lib/contractFinisherStore';
import { parseMarketValue } from '@/lib/releases';
import { getConfederation } from '@/lib/nationToConfederation';
import type { Confederation } from '@/lib/api';
import MenContractFinisher from '@/components/MenContractFinisher';
import MenLoading from '@/components/MenLoading';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';

const VALUE_FILTERS = [
  { min: null as number | null, max: null as number | null, key: 'all' },
  { min: 150000, max: 500000, key: '150k_500k' },
  { min: 500000, max: 1000000, key: '500k_1m' },
  { min: 1000000, max: 2000000, key: '1m_2m' },
  { min: 2000000, max: 3000000, key: '2m_3m' },
  { min: 3000000, max: 5000000, key: '3m_5m' },
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
const FOOT_ENRICH_BATCH_SIZE = 12;
const FOOT_PREFETCH_LIMIT = 120;

type FootSide = 'left' | 'right' | 'both' | null;

function normalizeFootValue(raw: string | null | undefined): FootSide {
  if (!raw) return null;
  const val = raw.toLowerCase();
  if (val.includes('left') || val.includes('שמאל')) return 'left';
  if (val.includes('right') || val.includes('ימין')) return 'right';
  if (val.includes('both') || val.includes('ambi') || val.includes('דו') || val.includes('שתיהן')) return 'both';
  return null;
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
  playerPhoneNumber?: string;
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
  footFilter?: 'all' | 'left' | 'right';
  footByUrl?: Record<string, FootSide>;
  regionFilter: Confederation | null;
  search: string;
  rosterOnly: boolean;
  rosterPlayers: RosterPlayer[];
  shortlistUrls: string[];
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
  const [footFilter, setFootFilter] = useState<'all' | 'left' | 'right'>(cached?.footFilter ?? 'all');
  const [regionFilter, setRegionFilter] = useState<Confederation | null>(cached?.regionFilter ?? null);
  const [footByUrl, setFootByUrl] = useState<Record<string, FootSide>>(cached?.footByUrl ?? {});
  const footEnrichingRef = useRef<Set<string>>(new Set());
  const [search, setSearch] = useState(cached?.search ?? '');
  const [rosterOnly, setRosterOnly] = useState(cached?.rosterOnly ?? false);
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

  const startLoad = useCallback((refresh = false) => {
    loadContractFinishers(refresh ? { refresh: true } : undefined);
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
        footFilter,
        footByUrl,
        regionFilter,
        search,
        rosterOnly,
        rosterPlayers,
        shortlistUrls: Array.from(shortlistUrls),
      },
      user?.uid ?? undefined
    );
  }, [players, windowLabel, valueFilter, positionFilter, ageFilter, footFilter, footByUrl, regionFilter, search, rosterOnly, rosterPlayers, shortlistUrls, user?.uid]);

  const addToShortlist = useCallback(
    async (player: ContractFinisherPlayer) => {
      if (!user || !player.playerUrl) return;
      setAddingUrl(player.playerUrl);
      try {
        const rosterExists = rosterPlayers.some((p) => p.tmProfile === player.playerUrl);
        if (rosterExists) {
          setError(t('shortlist_player_in_roster'));
          return;
        }
        const account = await getCurrentAccountForShortlist(user);
        const result = await callShortlistAdd({
          platform: 'men',
          tmProfileUrl: player.playerUrl,
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
        });
        if (result.status === 'added') {
          enrichShortlistInstagram(player.playerUrl);
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

  const preFootFilteredPlayers = useMemo(() => {
    let result = players;
    const queryText = search.trim().toLowerCase();

    if (queryText) {
      result = result.filter((p) => {
        const name = p.playerName?.toLowerCase() ?? '';
        const profile = p.playerUrl?.toLowerCase() ?? '';
        const position = p.playerPosition?.toLowerCase() ?? '';
        const nationality = p.playerNationality?.toLowerCase() ?? '';
        return (
          name.includes(queryText) ||
          profile.includes(queryText) ||
          position.includes(queryText) ||
          nationality.includes(queryText)
        );
      });
    }

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

    const rosterTmIds = new Set(rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean));

    if (rosterOnly) {
      result = result.filter((p) => {
        const id = extractPlayerIdFromUrl(p.playerUrl);
        return !!id && rosterTmIds.has(id);
      });
      return result;
    }

    // Exclude players already in roster or shortlist for non-roster mode
    result = result.filter((p) => {
      const id = extractPlayerIdFromUrl(p.playerUrl);
      if (id && rosterTmIds.has(id)) return false;
      if (p.playerUrl && shortlistUrls.has(p.playerUrl)) return false;
      return true;
    });
    return result;
  }, [players, search, positionFilter, ageFilter, regionFilter, valueFilter, rosterOnly, rosterPlayers, shortlistUrls]);

  const enrichFootForCandidates = useCallback(async (candidates: ContractFinisherPlayer[]) => {
    const uniqueUrls = candidates
      .map((p) => p.playerUrl)
      .filter((url): url is string => !!url)
      .filter((url) => !(url in footByUrl))
      .filter((url) => !footEnrichingRef.current.has(url));
    if (uniqueUrls.length === 0) return;

    uniqueUrls.forEach((url) => footEnrichingRef.current.add(url));

    try {
      for (let i = 0; i < uniqueUrls.length; i += FOOT_ENRICH_BATCH_SIZE) {
        const batch = uniqueUrls.slice(i, i + FOOT_ENRICH_BATCH_SIZE);
        const enriched = await Promise.all(
          batch.map(async (url) => {
            try {
              const details = await getPlayerDetails(url);
              return { url, foot: normalizeFootValue(details.foot) };
            } catch {
              return { url, foot: null as FootSide };
            }
          })
        );

        setFootByUrl((prev) => {
          const next = { ...prev };
          for (const item of enriched) {
            next[item.url] = item.foot;
          }
          return next;
        });
      }
    } finally {
      uniqueUrls.forEach((url) => footEnrichingRef.current.delete(url));
    }
  }, [footByUrl]);

  // Background prefetch: warm a foot cache for top candidates so filters feel instant.
  useEffect(() => {
    if (players.length === 0) return;
    const candidates = players
      .filter((p) => !!p.playerUrl)
      .filter((p) => !normalizeFootValue(p.playerFoot))
      .filter((p) => {
        const url = p.playerUrl || '';
        return !!url && !(url in footByUrl);
      })
      .slice(0, FOOT_PREFETCH_LIMIT);
    if (candidates.length === 0) return;

    const timer = setTimeout(() => {
      void enrichFootForCandidates(candidates);
    }, 700);

    return () => clearTimeout(timer);
  }, [players, footByUrl, enrichFootForCandidates]);

  // Enrich missing foot data on-demand so left/right filter can work reliably.
  useEffect(() => {
    if (footFilter === 'all') return;
    const candidates = preFootFilteredPlayers.filter((p) => {
      const url = p.playerUrl || '';
      if (!url) return false;
      if (normalizeFootValue(p.playerFoot)) return false;
      return footByUrl[url] === undefined;
    });
    if (candidates.length === 0) return;
    void enrichFootForCandidates(candidates);
  }, [footFilter, preFootFilteredPlayers, footByUrl, enrichFootForCandidates]);

  const filteredPlayers = useMemo(() => {
    if (footFilter === 'all') return preFootFilteredPlayers;

    return preFootFilteredPlayers.filter((p) => {
      const resolved = normalizeFootValue(p.playerFoot) ?? (p.playerUrl ? footByUrl[p.playerUrl] ?? null : null);
      return resolved === footFilter;
    });
  }, [preFootFilteredPlayers, footFilter, footByUrl]);

  const shortlistedCount = useMemo(
    () => filteredPlayers.filter((p) => p.playerUrl && shortlistUrls.has(p.playerUrl)).length,
    [filteredPlayers, shortlistUrls]
  );

  const freeCount = useMemo(() => {
    return filteredPlayers.filter((p) => {
      const club = (p.clubJoinedName || '').toLowerCase();
      return !club || club.includes('without club') || club.includes('free');
    }).length;
  }, [filteredPlayers]);

  const positionLabel = useCallback((pos: string) => {
    const fp = firestorePositions.find((p) => p.name?.toLowerCase() === pos.toLowerCase());
    return isRtl ? (fp?.hebrewName || POSITION_HEBREW[pos] || pos) : pos;
  }, [firestorePositions, isRtl]);

  if (loading || !user) {
    return <MenLoading />;
  }

  // Men platform only — full-bleed "Light Management Room" contract clock.
  return (
    <MenContractFinisher
      totalCount={players.length}
      filteredCount={filteredPlayers.length}
      shortlistedCount={shortlistedCount}
      freeCount={freeCount}
      windowLabel={windowLabel}
      positions={positions}
      positionLabel={positionLabel}
      search={search}
      setSearch={setSearch}
      positionFilter={positionFilter}
      setPositionFilter={setPositionFilter}
      ageFilters={AGE_FILTERS.map((a) => ({ key: a.key, labelKey: `contract_finisher_filter_age_${a.key}` }))}
      ageFilter={ageFilter}
      setAgeFilter={setAgeFilter}
      regionOptions={REGION_OPTIONS}
      regionFilter={regionFilter}
      setRegionFilter={setRegionFilter}
      footFilter={footFilter}
      setFootFilter={setFootFilter}
      valueFilters={VALUE_FILTERS.map((v) => ({ key: v.key, labelKey: `contract_finisher_filter_value_${v.key}` }))}
      valueFilter={valueFilter}
      setValueFilter={setValueFilter}
      rosterOnly={rosterOnly}
      setRosterOnly={setRosterOnly}
      loadingList={loadingList}
      error={error}
      players={filteredPlayers.map((p) => ({
        playerUrl: p.playerUrl || '',
        playerName: p.playerName ?? undefined,
        playerImage: p.playerImage ?? undefined,
        playerPosition: p.playerPosition ?? undefined,
        playerAge: p.playerAge ?? undefined,
        playerNationality: p.playerNationality ?? undefined,
        playerNationalityFlag: p.playerNationalityFlag ?? undefined,
        marketValue: p.marketValue ?? undefined,
        clubJoinedName: p.clubJoinedName ?? undefined,
        transferDate: p.transferDate ?? undefined,
        foot: normalizeFootValue(p.playerFoot) ?? (p.playerUrl ? footByUrl[p.playerUrl] ?? null : null),
      }))}
      shortlistUrls={shortlistUrls}
      addingUrl={addingUrl}
      onAddToShortlist={(mp) => {
        const original = filteredPlayers.find((p) => (p.playerUrl || '') === mp.playerUrl);
        if (original) addToShortlist(original);
      }}
      onReload={() => startLoad(true)}
      teammatesCache={teammatesCache}
      loadingTeammatesUrl={loadingTeammatesUrl}
      expandedTeammatesUrl={expandedTeammatesUrl}
      onToggleTeammates={toggleTeammates}
      onFetchTeammates={fetchTeammates}
    />
  );

}
