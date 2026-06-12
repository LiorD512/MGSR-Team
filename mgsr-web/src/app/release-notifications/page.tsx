'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { FEED_EVENTS_COLLECTIONS, PLAYERS_COLLECTIONS } from '@/lib/platformCollections';
import { callShortlistAdd } from '@/lib/callables';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import { extractPlayerIdFromUrl, getTeammates } from '@/lib/api';

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

function formatTransferDateForShortlist(timestamp: number | undefined): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function ReleaseNotificationCard({
  event,
  t,
  isRtl,
  isInShortlist,
  isAdding,
  onAddToShortlist,
  teammatesCache,
  loadingTeammatesUrl,
  isTeammatesExpanded,
  onToggleTeammates,
  onFetchTeammates,
}: {
  event: FeedEvent;
  t: (key: string) => string;
  isRtl: boolean;
  isInShortlist: boolean;
  isAdding: boolean;
  onAddToShortlist: (event: FeedEvent) => void;
  teammatesCache: Record<string, RosterTeammateMatch[]>;
  loadingTeammatesUrl: string | null;
  isTeammatesExpanded: string | null;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;
}) {
  const playerUrl = event.playerTmProfile || '';
  const rosterTeammates = playerUrl ? teammatesCache[playerUrl] : undefined;
  const isLoadingTeammates = loadingTeammatesUrl === playerUrl;
  const isExpanded = isTeammatesExpanded === playerUrl;

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('a') || target.closest('button') || target.closest('[data-no-propagate]')) return;
      if (playerUrl) window.open(playerUrl, '_blank', 'noopener,noreferrer');
    },
    [playerUrl]
  );

  const handleTeammatesClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!playerUrl) return;
      onToggleTeammates(playerUrl);
      if (!(playerUrl in teammatesCache) && !loadingTeammatesUrl) {
        onFetchTeammates(playerUrl);
      }
    },
    [playerUrl, onToggleTeammates, onFetchTeammates, teammatesCache, loadingTeammatesUrl]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick(e as unknown as React.MouseEvent);
        }
      }}
      className="group relative overflow-hidden rounded-2xl bg-mgsr-card border border-mgsr-border hover:border-mgsr-teal/40 transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50 focus:ring-offset-2 focus:ring-offset-mgsr-dark"
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

        <div className="mt-4 pt-4 border-t border-mgsr-border/80 flex items-center justify-between gap-3" data-no-propagate>
          {isInShortlist ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30">
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
              </svg>
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                {t('releases_saved')}
              </span>
              <Link
                href="/shortlist"
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-amber-400/90 hover:text-amber-300 underline underline-offset-2 decoration-amber-400/50 hover:decoration-amber-300 transition-colors"
              >
                {t('releases_view_shortlist')} {isRtl ? '←' : '→'}
              </Link>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToShortlist(event);
              }}
              disabled={isAdding}
              className="group/bookmark flex items-center gap-2 px-3 py-1.5 rounded-full border border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-amber-500/40 hover:text-amber-400/90 hover:bg-amber-500/5 disabled:opacity-60 transition-all duration-200"
            >
              {isAdding ? (
                <span className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />
              ) : (
                <svg className="w-4 h-4 shrink-0 opacity-70 group-hover/bookmark:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              )}
              <span className="text-xs font-medium">
                {isAdding ? t('shortlist_adding') : t('releases_bookmark')}
              </span>
            </button>
          )}
          <span className="text-sm font-medium text-mgsr-teal shrink-0">{t('release_notifications_open_tm')}</span>
        </div>

        <div className="mt-4" data-no-propagate>
          <button
            type="button"
            onClick={handleTeammatesClick}
            className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border hover:border-mgsr-teal/30 transition-all text-left rtl:text-right"
          >
            <svg className="w-4 h-4 text-mgsr-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-sm text-mgsr-text flex-1">
              {isLoadingTeammates
                ? t('releases_roster_teammates_loading')
                : rosterTeammates != null
                  ? t('releases_roster_teammates').replace('{count}', String(rosterTeammates.length))
                  : t('releases_roster_teammates_tap')}
            </span>
            <svg
              className={`w-4 h-4 text-mgsr-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-2">
              {isLoadingTeammates ? (
                <div className="py-6 flex justify-center">
                  <div className="w-5 h-5 border-2 border-mgsr-teal/40 border-t-mgsr-teal rounded-full animate-spin" />
                </div>
              ) : rosterTeammates?.length === 0 ? (
                <p className="text-xs text-mgsr-muted py-3 px-3 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/60">
                  {t('releases_no_roster_teammates')}
                </p>
              ) : (
                rosterTeammates?.map((match) => (
                  <div key={match.player.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/80 hover:border-mgsr-teal/40 hover:bg-mgsr-dark/70 transition-all">
                    <Link
                      href={`/players/${match.player.id}?from=/release-notifications`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      <img
                        src={match.player.profileImage || 'https://via.placeholder.com/40'}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover bg-mgsr-card ring-1 ring-mgsr-border"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-mgsr-text truncate">
                          {match.player.fullName || 'Unknown'}
                        </p>
                        <p className="text-xs text-mgsr-muted truncate">
                          {match.player.positions?.filter(Boolean).join(', ') || '—'} • {(match.player.age ? t('players_age_display').replace('{age}', match.player.age) : '—')} • {match.player.marketValue || '—'}
                        </p>
                      </div>
                    </Link>
                    <span className="text-xs font-medium text-mgsr-teal px-2 py-0.5 rounded-md bg-mgsr-teal/15 shrink-0">
                      {t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReleaseNotificationsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const playersQuery = query(collection(db, PLAYERS_COLLECTIONS.men), orderBy('createdAt', 'desc'));
    const unsubscribePlayers = onSnapshot(playersQuery, (snapshot) => {
      setRosterPlayers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as RosterPlayer)));
    });

    const unsubscribeShortlist = onSnapshot(collection(db, 'Shortlists'), (snapshot) => {
      setShortlistUrls(new Set(snapshot.docs.map((doc) => doc.data().tmProfileUrl as string).filter((url): url is string => !!url)));
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
      unsubscribeShortlist();
      unsubscribeFeed();
    };
  }, []);

  const notificationOnlyPlayers = useMemo(() => {
    const rosterProfiles = new Set(rosterPlayers.map((player) => player.tmProfile).filter(Boolean));
    const deduped = deduplicateReleaseEvents(
      events.filter(
        (event) =>
          event.type === 'NEW_RELEASE_FROM_CLUB' &&
          event.extraInfo === 'NOT_IN_DATABASE' &&
          !!event.playerTmProfile
      )
    );

    return deduped.filter((event) => !rosterProfiles.has(event.playerTmProfile));
  }, [events, rosterPlayers]);

  const filteredPlayers = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    if (!queryText) return notificationOnlyPlayers;
    return notificationOnlyPlayers.filter((event) => {
      const name = event.playerName?.toLowerCase() ?? '';
      const profile = event.playerTmProfile?.toLowerCase() ?? '';
      return name.includes(queryText) || profile.includes(queryText);
    });
  }, [notificationOnlyPlayers, search]);

  const addToShortlist = useCallback(
    async (event: FeedEvent) => {
      if (!user || !event.playerTmProfile) return;
      setAddingUrl(event.playerTmProfile);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const result = await callShortlistAdd({
          platform: 'men',
          tmProfileUrl: event.playerTmProfile,
          playerImage: event.playerImage ?? null,
          playerName: event.playerName ?? null,
          playerPosition: null,
          playerAge: null,
          playerNationality: null,
          playerNationalityFlag: null,
          clubJoinedName: null,
          transferDate: formatTransferDateForShortlist(event.timestamp),
          marketValue: null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        });
        if (result.status === 'added') {
          enrichShortlistInstagram(event.playerTmProfile);
        }
      } finally {
        setAddingUrl(null);
      }
    },
    [user]
  );

  const fetchTeammates = useCallback(async (playerUrl: string) => {
    setLoadingTeammatesUrl(playerUrl);
    try {
      const teammates = await getTeammates(playerUrl);
      const rosterIds = new Set(rosterPlayers.map((player) => extractPlayerIdFromUrl(player.tmProfile)).filter(Boolean));
      const matches: RosterTeammateMatch[] = teammates
        .filter((teammate) => rosterIds.has(extractPlayerIdFromUrl(teammate.tmProfileUrl) ?? ''))
        .map((teammate) => {
          const id = extractPlayerIdFromUrl(teammate.tmProfileUrl);
          const rosterPlayer = rosterPlayers.find((player) => extractPlayerIdFromUrl(player.tmProfile) === id);
          return rosterPlayer ? { player: rosterPlayer, matchesPlayedTogether: teammate.matchesPlayedTogether } : null;
        })
        .filter((match): match is RosterTeammateMatch => match != null)
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
              <ReleaseNotificationCard
                key={event.playerTmProfile}
                event={event}
                t={t}
                isRtl={isRtl}
                isInShortlist={!!event.playerTmProfile && shortlistUrls.has(event.playerTmProfile)}
                isAdding={addingUrl === event.playerTmProfile}
                onAddToShortlist={addToShortlist}
                teammatesCache={teammatesCache}
                loadingTeammatesUrl={loadingTeammatesUrl}
                isTeammatesExpanded={expandedTeammatesUrl}
                onToggleTeammates={toggleTeammates}
                onFetchTeammates={fetchTeammates}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}