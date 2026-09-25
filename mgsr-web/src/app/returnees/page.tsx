'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callShortlistAdd } from '@/lib/callables';
import { getTeammates, extractPlayerIdFromUrl, type ReturneePlayer } from '@/lib/api';
import { parseMarketValue } from '@/lib/releases';
import MenReturnees from '@/components/MenReturnees';
import MenLoading from '@/components/MenLoading';
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
  playerPhoneNumber?: string;
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
  { min: 3000000, max: 4000000, key: '3m_4m' },
  { min: 4000000, max: 6000000, key: '4m_6m' },
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
        const rosterExists = rosterPlayers.some((p) => p.tmProfile === player.playerUrl);
        if (rosterExists) {
          setAddError(t('shortlist_player_in_roster'));
          setAddingUrl(null);
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
    // Exclude players already in roster or shortlist
    const rosterTmIds = new Set(rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean));
    result = result.filter((p) => {
      const id = extractPlayerIdFromUrl(p.playerUrl);
      if (id && rosterTmIds.has(id)) return false;
      if (p.playerUrl && shortlistUrls.has(p.playerUrl)) return false;
      return true;
    });
    return result;
  }, [players, positionFilter, valueFilter, rosterPlayers, shortlistUrls]);

  const shortlistedCount = useMemo(
    () => players.filter((p) => p.playerUrl && shortlistUrls.has(p.playerUrl)).length,
    [players, shortlistUrls]
  );

  const positionGroups = useMemo(
    () => POSITION_GROUPS.map((value) => ({
      value,
      count: players.filter((p) => getPositionGroup(p.playerPosition) === value).length,
    })),
    [players]
  );
  const valueFilters = useMemo(
    () => MARKET_VALUE_FILTERS.map((v) => ({
      key: v.key,
      count: v.key === 'all'
        ? players.length
        : players.filter((p) => {
            const val = parseMarketValue(p.marketValue);
            if (val <= 0) return false;
            if (v.min != null && val < v.min) return false;
            if (v.max != null && val > v.max) return false;
            return true;
          }).length,
    })),
    [players]
  );

  if (loading || !user) {
    return <MenLoading />;
  }

  // Men platform only — full-bleed "Light Management Room" on-loan wire.
  return (
    <MenReturnees
      totalCount={players.length}
      filteredCount={filteredPlayers.length}
      shortlistedCount={shortlistedCount}
      loadedLeagues={loadedLeagues}
      totalLeagues={totalLeagues}
      positionGroups={positionGroups}
      positionFilter={positionFilter}
      setPositionFilter={setPositionFilter}
      valueFilters={valueFilters}
      valueFilter={valueFilter}
      setValueFilter={setValueFilter}
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
        loanEndDate: p.loanEndDate ?? undefined,
        onLoanFromClub: p.onLoanFromClub ?? undefined,
        clubJoinedName: p.clubJoinedName ?? undefined,
        clubJoinedLogo: p.clubJoinedLogo ?? undefined,
      }))}
      shortlistUrls={shortlistUrls}
      addingUrl={addingUrl}
      onAddToShortlist={(mp) => {
        const original = filteredPlayers.find((p) => (p.playerUrl || '') === mp.playerUrl);
        if (original) addToShortlist(original);
      }}
      onReload={startLoad}
      teammatesCache={teammatesCache}
      loadingTeammatesUrl={loadingTeammatesUrl}
      expandedTeammatesUrl={expandedTeammatesUrl}
      onToggleTeammates={toggleTeammates}
      onFetchTeammates={fetchTeammates}
    />
  );

}
