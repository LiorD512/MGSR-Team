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

interface FeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  extraInfo?: string;
  timestamp?: number;
}

interface RosterPlayer {
  id: string;
  tmProfile?: string;
}

function deduplicateReleaseEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Map<string, FeedEvent>();
  for (const event of events) {
    const profile = event.playerTmProfile?.trim();
    if (!profile) continue;
    const existing = seen.get(profile);
    if (!existing || (event.timestamp ?? 0) > (existing.timestamp ?? 0)) {
      seen.set(profile, event);
    }
  }
  return Array.from(seen.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

function formatTimestamp(timestamp: number | undefined, isRtl: boolean): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function ReleaseNotificationsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsubscribePlayers = onSnapshot(collection(db, PLAYERS_COLLECTIONS.men), (snapshot) => {
      setPlayers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RosterPlayer)));
    });

    const feedQuery = query(
      collection(db, FEED_EVENTS_COLLECTIONS.men),
      orderBy('timestamp', 'desc'),
      limit(1000)
    );
    const unsubscribeFeed = onSnapshot(feedQuery, (snapshot) => {
      const feedEvents = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FeedEvent));
      setEvents(feedEvents);
      setLoadingList(false);
    }, () => {
      setLoadingList(false);
    });

    return () => {
      unsubscribePlayers();
      unsubscribeFeed();
    };
  }, []);

  const notificationOnlyPlayers = useMemo(() => {
    const rosterProfiles = new Set(players.map((player) => player.tmProfile).filter(Boolean));
    const deduped = deduplicateReleaseEvents(
      events.filter(
        (event) =>
          event.type === 'NEW_RELEASE_FROM_CLUB' &&
          event.extraInfo === 'NOT_IN_DATABASE' &&
          !!event.playerTmProfile
      )
    );

    return deduped.filter((event) => !rosterProfiles.has(event.playerTmProfile));
  }, [events, players]);

  const filteredPlayers = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    if (!queryText) return notificationOnlyPlayers;
    return notificationOnlyPlayers.filter((event) => {
      const name = event.playerName?.toLowerCase() ?? '';
      const profile = event.playerTmProfile?.toLowerCase() ?? '';
      return name.includes(queryText) || profile.includes(queryText);
    });
  }, [notificationOnlyPlayers, search]);

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {t('release_notifications_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">{t('release_notifications_subtitle')}</p>
          </div>
          <Link
            href="/releases"
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-teal hover:bg-mgsr-teal/20 hover:border-mgsr-teal/40 transition text-center"
          >
            {t('release_notifications_back_to_releases')}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 py-3 px-3 sm:px-4 rounded-xl bg-mgsr-card/50 border border-mgsr-border overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <span className="text-sm text-mgsr-muted">
            {t('release_notifications_total')}: <strong className="text-mgsr-text">{notificationOnlyPlayers.length}</strong>
          </span>
          <span className="text-sm text-mgsr-muted">
            {t('release_notifications_visible')}: <strong className="text-mgsr-teal">{filteredPlayers.length}</strong>
          </span>
        </div>

        <div className="mb-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('release_notifications_search')}
            className="w-full max-w-md px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60"
          />
        </div>

        {loadingList ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t('release_notifications_loading')}</div>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-2 relative">{t('release_notifications_empty')}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPlayers.map((event) => (
              <a
                key={event.playerTmProfile}
                href={event.playerTmProfile}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-2xl bg-mgsr-card border border-mgsr-border hover:border-mgsr-teal/40 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-mgsr-teal/5 via-transparent to-mgsr-dark/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative p-5">
                  <span className="absolute top-4 left-4 rtl:left-auto rtl:right-4 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {t('release_notifications_badge')}
                  </span>
                  <div className="flex gap-4 mt-6">
                    <img
                      src={event.playerImage || 'https://via.placeholder.com/72'}
                      alt=""
                      className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-mgsr-teal/50 transition-all duration-300 group-hover:scale-105 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-lg text-mgsr-text truncate group-hover:text-mgsr-teal transition-colors">
                        {event.playerName || 'Unknown'}
                      </p>
                      <p className="text-sm text-mgsr-muted mt-1">{t('new_release_from_club')}</p>
                      <p className="text-xs text-mgsr-muted mt-2">
                        {t('releases_sort_date')}: {formatTimestamp(event.timestamp, isRtl)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-mgsr-border/80 flex items-center justify-between gap-3">
                    <span className="text-xs text-mgsr-muted truncate">{event.playerTmProfile}</span>
                    <span className="text-sm font-medium text-mgsr-teal shrink-0">{t('release_notifications_open_tm')}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}