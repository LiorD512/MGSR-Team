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
  oldClub: string;
  newClub: string;
}

const POSITION_ORDER = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const POSITION_HEBREW: Record<string, string> = { SS: 'חלוץ שני' };

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

function deduplicateClubChangeEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Map<string, FeedEvent>();
  for (const event of events) {
    const profile = event.playerTmProfile?.trim();
    if (!profile) continue;

    const existing = seen.get(profile);
    if (!existing) {
      seen.set(profile, event);
      continue;
    }

    const eventTs = event.timestamp ?? 0;
    const existingTs = existing.timestamp ?? 0;
    const newer = eventTs >= existingTs ? event : existing;
    const older = eventTs >= existingTs ? existing : event;

    seen.set(profile, {
      ...newer,
      playerName: firstText(newer.playerName, older.playerName),
      playerImage: firstText(newer.playerImage, older.playerImage),
      playerPosition: firstText(newer.playerPosition, older.playerPosition),
      playerAge: firstText(newer.playerAge, older.playerAge),
      oldValue: firstText(newer.oldValue, older.oldValue),
      newValue: firstText(newer.newValue, older.newValue),
    });
  }

  return Array.from(seen.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

export default function ClubChangeNotificationsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
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
    const source = deduplicateClubChangeEvents(
      events.filter((event) => event.type === 'CLUB_CHANGE' && !!event.playerTmProfile)
    );

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

    return result;
  }, [clubChangeItems, search, positionFilter]);

  const hasActiveFilters = useMemo(() => {
    return !!search.trim() || !!positionFilter;
  }, [search, positionFilter]);

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
              const label = isRtl ? (POSITION_HEBREW[position] || position) : position;
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
                className="group relative overflow-hidden rounded-2xl bg-mgsr-card border border-mgsr-border hover:border-[var(--mgsr-accent)]/45 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-[var(--mgsr-accent)]/10 via-transparent to-mgsr-dark/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative p-5">
                  <div className="flex gap-4">
                    <div className="relative shrink-0">
                      <img
                        src={item.displayImage || 'https://via.placeholder.com/72'}
                        alt=""
                        className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-[var(--mgsr-accent)]/55 transition-all duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-lg text-mgsr-text truncate group-hover:text-[var(--mgsr-accent)] transition-colors">
                        {item.displayName}
                      </p>
                      <p className="text-sm text-mgsr-muted mt-1">{item.displayPosition || '—'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {item.displayAge && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-mgsr-card border border-mgsr-border text-mgsr-muted">
                            {t('players_age_display').replace('{age}', item.displayAge)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-mgsr-muted mt-2">
                        {t('releases_sort_date')}: {formatTimestamp(item.event.timestamp, isRtl)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-mgsr-border/80 bg-mgsr-dark/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-mgsr-muted/90">{t('club_change_notifications_from')}</p>
                        <p className="text-sm text-mgsr-text truncate">{item.oldClub}</p>
                      </div>
                      <svg className="w-4 h-4 text-[var(--mgsr-accent)] mt-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h15" />
                      </svg>
                      <div className="min-w-0 text-right rtl:text-left">
                        <p className="text-[11px] uppercase tracking-wide text-mgsr-muted/90">{t('club_change_notifications_to')}</p>
                        <p className="text-sm text-[var(--mgsr-accent)] font-semibold truncate">{item.newClub}</p>
                      </div>
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
