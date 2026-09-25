'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import MenClubChanges from '@/components/MenClubChanges';
import MenLoading from '@/components/MenLoading';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { FEED_EVENTS_COLLECTIONS, PLAYERS_COLLECTIONS } from '@/lib/platformCollections';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { getPositionDisplayName } from '@/lib/appConfig';

interface FeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  playerPosition?: string;
  playerAge?: string;
  oldValue?: string;
  newValue?: string;
  timestamp?: number;
}

interface RosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  tmProfile?: string;
  positions?: string[];
  age?: string;
  marketValue?: string;
  nationality?: string;
  currentClub?: {
    clubName?: string;
    clubLogo?: string;
  };
}

interface ClubChangeItem {
  event: FeedEvent;
  playerUrl: string;
  rosterPlayer?: RosterPlayer;
  displayName: string;
  displayImage?: string;
  displayPosition?: string;
  displayAge?: string;
  displayMarketValue?: string;
  oldClub: string;
  newClub: string;
  newClubLogo?: string;
  playerNationality?: string;
}

type SortMode = 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc';

const POSITION_ORDER = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];

function hasText(value?: string | null): value is string {
  if (!value) return false;
  const cleaned = value.trim();
  return !!cleaned && cleaned !== '-' && cleaned !== '—';
}

function firstText(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (hasText(value)) return value.trim();
  }
  return undefined;
}

function formatTimestamp(timestamp: number | undefined, isRtl: boolean): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function parseMarketValueToNumber(value?: string): number {
  if (!value) return 0;
  const normalized = value.toLowerCase().replace(/,/g, '').replace(/\s+/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)([kmb])?/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const suffix = match[2];
  if (suffix === 'k') return amount * 1_000;
  if (suffix === 'm') return amount * 1_000_000;
  if (suffix === 'b') return amount * 1_000_000_000;
  return amount;
}

export default function ClubChangeNotificationsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('date_desc');
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const playersQuery = query(collection(db, PLAYERS_COLLECTIONS.men), orderBy('createdAt', 'desc'));
    const unsubscribePlayers = onSnapshot(playersQuery, (snapshot) => {
      setRosterPlayers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RosterPlayer)));
    });

    const feedQuery = query(
      collection(db, FEED_EVENTS_COLLECTIONS.men),
      orderBy('timestamp', 'desc'),
      limit(1200)
    );
    const unsubscribeFeed = onSnapshot(
      feedQuery,
      (snapshot) => {
        setEvents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FeedEvent)));
        setLoadingList(false);
      },
      () => {
        setLoadingList(false);
      }
    );

    return () => {
      unsubscribePlayers();
      unsubscribeFeed();
    };
  }, []);

  const rosterByTmId = useMemo(() => {
    const map = new Map<string, RosterPlayer>();
    for (const player of rosterPlayers) {
      const tmId = extractPlayerIdFromUrl(player.tmProfile);
      if (tmId) map.set(tmId, player);
    }
    return map;
  }, [rosterPlayers]);

  const clubChangeItems = useMemo<ClubChangeItem[]>(() => {
    const source = events
      .filter((event) => event.type === 'CLUB_CHANGE' && !!event.playerTmProfile)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    return source
      .filter((event): event is FeedEvent & { playerTmProfile: string } => !!event.playerTmProfile)
      .map((event) => {
        const tmId = extractPlayerIdFromUrl(event.playerTmProfile);
        const rosterPlayer = tmId ? rosterByTmId.get(tmId) : undefined;
        const displayPosition = firstText(event.playerPosition, rosterPlayer?.positions?.find((pos) => hasText(pos)));
        return {
          event,
          playerUrl: event.playerTmProfile,
          rosterPlayer,
          displayName: firstText(event.playerName, rosterPlayer?.fullName) || 'Unknown',
          displayImage: firstText(event.playerImage, rosterPlayer?.profileImage),
          displayPosition,
          displayAge: firstText(event.playerAge, rosterPlayer?.age),
          displayMarketValue: firstText(rosterPlayer?.marketValue),
          oldClub: firstText(event.oldValue) || '—',
          newClub: firstText(event.newValue, rosterPlayer?.currentClub?.clubName) || '—',
          // Only attach the roster's stored logo when its current club matches
          // the move's destination, so we never show a stale/wrong crest.
          newClubLogo:
            rosterPlayer?.currentClub?.clubLogo &&
            hasText(rosterPlayer.currentClub.clubName) &&
            rosterPlayer.currentClub.clubName!.trim().toLowerCase() ===
              (firstText(event.newValue, rosterPlayer.currentClub.clubName) || '').trim().toLowerCase()
              ? rosterPlayer.currentClub.clubLogo
              : undefined,
          playerNationality: firstText(rosterPlayer?.nationality),
        };
      });
  }, [events, rosterByTmId]);

  const positions = useMemo(() => {
    const values = Array.from(
      new Set(clubChangeItems.map((item) => item.displayPosition).filter((position): position is string => !!position))
    );
    return values.sort((a, b) => {
      const ia = POSITION_ORDER.indexOf(a.toUpperCase());
      const ib = POSITION_ORDER.indexOf(b.toUpperCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b);
    });
  }, [clubChangeItems]);

  const filteredItems = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    let result = clubChangeItems;

    if (positionFilter) {
      result = result.filter(
        (item) => item.displayPosition?.toLowerCase() === positionFilter.toLowerCase()
      );
    }

    if (queryText) {
      result = result.filter((item) => {
        const name = item.displayName.toLowerCase();
        const oldClub = item.oldClub.toLowerCase();
        const newClub = item.newClub.toLowerCase();
        const position = item.displayPosition?.toLowerCase() ?? '';
        const url = item.playerUrl.toLowerCase();
        return (
          name.includes(queryText) ||
          oldClub.includes(queryText) ||
          newClub.includes(queryText) ||
          position.includes(queryText) ||
          url.includes(queryText)
        );
      });
    }

    const sorted = [...result];
    sorted.sort((a, b) => {
      if (sortMode === 'date_desc') {
        return (b.event.timestamp ?? 0) - (a.event.timestamp ?? 0);
      }
      if (sortMode === 'date_asc') {
        return (a.event.timestamp ?? 0) - (b.event.timestamp ?? 0);
      }

      const av = parseMarketValueToNumber(a.displayMarketValue);
      const bv = parseMarketValueToNumber(b.displayMarketValue);
      if (sortMode === 'value_desc') {
        if (bv !== av) return bv - av;
        return (b.event.timestamp ?? 0) - (a.event.timestamp ?? 0);
      }
      if (av !== bv) return av - bv;
      return (b.event.timestamp ?? 0) - (a.event.timestamp ?? 0);
    });

    return sorted;
  }, [clubChangeItems, search, positionFilter, sortMode]);

  const hasActiveFilters = useMemo(() => {
    return !!search.trim() || !!positionFilter;
  }, [search, positionFilter]);

  const renderPosition = (position?: string) => {
    if (!position) return '—';
    return getPositionDisplayName(position, isRtl) || position;
  };

  const rosterCount = useMemo(() => clubChangeItems.filter((i) => !!i.rosterPlayer?.id).length, [clubChangeItems]);
  const newTodayCount = useMemo(() => {
    const cutoff = Date.now() - 86400000;
    return clubChangeItems.filter((i) => (i.event.timestamp ?? 0) >= cutoff).length;
  }, [clubChangeItems]);

  if (loading || !user) {
    return <MenLoading />;
  }

  // Men platform only — full-bleed "Light Management Room" movement wire.
  return (
    <MenClubChanges
      totalCount={clubChangeItems.length}
      filteredCount={filteredItems.length}
      rosterCount={rosterCount}
      newTodayCount={newTodayCount}
      search={search}
      setSearch={setSearch}
      positions={positions}
      positionFilter={positionFilter}
      setPositionFilter={setPositionFilter}
      sortMode={sortMode}
      setSortMode={setSortMode}
      loadingList={loadingList}
      hasActiveFilters={hasActiveFilters}
      items={filteredItems.map((i) => ({
        playerUrl: i.playerUrl,
        rosterPlayer: i.rosterPlayer ? { id: i.rosterPlayer.id } : undefined,
        displayName: i.displayName,
        displayImage: i.displayImage,
        displayPosition: i.displayPosition,
        displayAge: i.displayAge,
        displayMarketValue: i.displayMarketValue,
        oldClub: i.oldClub,
        newClub: i.newClub,
        newClubLogo: i.newClubLogo,
        timestamp: i.event.timestamp,
        playerNationality: i.playerNationality,
      }))}
      renderPosition={renderPosition}
      formatTimestamp={formatTimestamp}
    />
  );

}
