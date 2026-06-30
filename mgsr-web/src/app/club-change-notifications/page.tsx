'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import AppLayout from '@/components/AppLayout';
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
  currentClub?: {
    clubName?: string;
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

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-[var(--mgsr-accent)] font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        <div className="brit-hero-panel rounded-[28px] p-5 sm:p-6 lg:p-7 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-mgsr-text tracking-tight">
                {t('club_change_notifications_title')}
              </h1>
              <p className="text-mgsr-muted mt-1 text-sm">{t('club_change_notifications_subtitle')}</p>
            </div>
            <span className="self-start sm:self-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-[var(--mgsr-accent)]/20 text-[var(--mgsr-accent)] border border-[var(--mgsr-accent)]/35">
              {t('club_change_notifications_badge')}
            </span>
          </div>
        </div>

        <div className="brit-filter-tray flex flex-wrap items-center gap-2 sm:gap-4 mb-4 py-3 px-3 sm:px-4 rounded-xl overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <span className="text-sm text-mgsr-muted">
            {t('club_change_notifications_total')}: <strong className="text-mgsr-text">{clubChangeItems.length}</strong>
          </span>
          <span className="text-sm text-mgsr-muted">
            {t('club_change_notifications_visible')}: <strong className="text-[var(--mgsr-accent)]">{filteredItems.length}</strong>
          </span>
        </div>

        <div className="brit-filter-tray rounded-2xl p-3 sm:p-4 flex flex-col gap-3 sm:gap-4 mb-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('club_change_notifications_search')}
            className="w-full max-w-xl px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--mgsr-accent)]/60"
          />
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <span className="text-xs text-mgsr-muted self-center shrink-0">{t('releases_position')}:</span>
            <button
              onClick={() => setPositionFilter(null)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                !positionFilter
                  ? 'bg-[var(--mgsr-accent)] text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('releases_all')}
            </button>
            {positions.map((position) => {
              const label = renderPosition(position);
              return (
                <button
                  key={position}
                  onClick={() => setPositionFilter(positionFilter === position ? null : position)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    positionFilter === position
                      ? 'bg-[var(--mgsr-accent)] text-mgsr-dark'
                      : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <span className="text-xs text-mgsr-muted self-center shrink-0">{t('club_change_notifications_sort')}:</span>
            <button
              onClick={() => setSortMode('date_desc')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                sortMode === 'date_desc'
                  ? 'bg-[var(--mgsr-accent)] text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('club_change_notifications_sort_date_newest')}
            </button>
            <button
              onClick={() => setSortMode('date_asc')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                sortMode === 'date_asc'
                  ? 'bg-[var(--mgsr-accent)] text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('club_change_notifications_sort_date_oldest')}
            </button>
            <button
              onClick={() => setSortMode('value_desc')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                sortMode === 'value_desc'
                  ? 'bg-[var(--mgsr-accent)] text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('club_change_notifications_sort_value_high')}
            </button>
            <button
              onClick={() => setSortMode('value_asc')}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                sortMode === 'value_asc'
                  ? 'bg-[var(--mgsr-accent)] text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('club_change_notifications_sort_value_low')}
            </button>
          </div>
        </div>

        {loadingList ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t('club_change_notifications_loading')}</div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,200,116,0.12)_0%,transparent_72%)]" />
            <p className="text-mgsr-muted text-lg mb-2 relative">
              {hasActiveFilters ? t('search_no_results') : t('club_change_notifications_empty')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => (
              <div
                key={item.playerUrl}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#141414] via-[#101010] to-[#171717] border border-[#3a3324] hover:border-[var(--mgsr-accent)]/55 hover:shadow-[0_28px_70px_rgba(0,0,0,0.45)] transition-all duration-300"
              >
                <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_10%_0%,rgba(245,200,116,0.17)_0%,transparent_56%)] opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-b from-[var(--mgsr-accent)]/12 via-transparent to-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[var(--mgsr-accent)]/18 blur-2xl group-hover:bg-[var(--mgsr-accent)]/26 transition-colors duration-300" />
                <div className="relative p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] px-2.5 py-1 rounded-md bg-[var(--mgsr-accent)]/16 text-[var(--mgsr-accent)] border border-[var(--mgsr-accent)]/35 shadow-[0_0_0_1px_rgba(245,200,116,0.08)_inset]">
                      {t('club_change_notifications_badge')}
                    </span>
                    <span className="text-[11px] text-mgsr-muted">
                      {formatTimestamp(item.event.timestamp, isRtl)}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div className="relative shrink-0">
                      <img
                        src={item.displayImage || 'https://via.placeholder.com/72'}
                        alt=""
                        className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-[#4d432e] group-hover:ring-[var(--mgsr-accent)]/55 transition-all duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-lg text-mgsr-text truncate group-hover:text-[var(--mgsr-accent)] transition-colors">
                        {item.displayName}
                      </p>
                      <p className="text-sm text-mgsr-muted mt-1">{renderPosition(item.displayPosition)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {item.displayAge && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-black/25 border border-[#3c3c3c] text-mgsr-muted">
                            {t('players_age_display').replace('{age}', item.displayAge)}
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-md bg-[var(--mgsr-accent)]/10 border border-[var(--mgsr-accent)]/35 text-[var(--mgsr-accent)]">
                          {t('club_change_notifications_market_value')}: {item.displayMarketValue || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-[#3a3324] bg-black/25 p-3 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      {isRtl ? (
                        <>
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-mgsr-muted/90">{t('club_change_notifications_to')}</p>
                            <p className="text-sm text-[var(--mgsr-accent)] font-semibold truncate">{item.newClub}</p>
                          </div>
                          <svg className="w-4 h-4 text-[var(--mgsr-accent)] mt-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h15" />
                          </svg>
                          <div className="min-w-0 text-left rtl:text-right">
                            <p className="text-[11px] uppercase tracking-wide text-mgsr-muted/90">{t('club_change_notifications_from')}</p>
                            <p className="text-sm text-mgsr-text truncate">{item.oldClub}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wide text-mgsr-muted/90">{t('club_change_notifications_from')}</p>
                            <p className="text-sm text-mgsr-text truncate">{item.oldClub}</p>
                          </div>
                          <svg className="w-4 h-4 text-[var(--mgsr-accent)] mt-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5l-7 7 7 7M19 12H5" />
                          </svg>
                          <div className="min-w-0 text-right rtl:text-left">
                            <p className="text-[11px] uppercase tracking-wide text-mgsr-muted/90">{t('club_change_notifications_to')}</p>
                            <p className="text-sm text-[var(--mgsr-accent)] font-semibold truncate">{item.newClub}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.rosterPlayer?.id && (
                      <Link
                        href={`/players/${item.rosterPlayer.id}?from=/club-change-notifications`}
                        className="px-3 py-1.5 rounded-full border border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-[var(--mgsr-accent)]/45 hover:text-[var(--mgsr-accent)] transition-all text-xs font-medium"
                      >
                        {t('club_change_notifications_open_player')}
                      </Link>
                    )}
                    <a
                      href={item.playerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full border border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-[var(--mgsr-accent)]/45 hover:text-[var(--mgsr-accent)] transition-all text-xs font-medium"
                    >
                      {t('club_change_notifications_open_tm')}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
