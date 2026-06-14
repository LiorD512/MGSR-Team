'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, getDocs, onSnapshot, orderBy, query, limit } from 'firebase/firestore';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { FEED_EVENTS_COLLECTIONS, PLAYERS_COLLECTIONS } from '@/lib/platformCollections';
import {
  callGetReleasesRefreshJobStatus,
  callShortlistAdd,
  callTriggerReleasesRefreshJob,
} from '@/lib/callables';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import { extractPlayerIdFromUrl, getPlayerDetails, getReleasesFromCache, getTeammates, type ReleasePlayer } from '@/lib/api';
import {
  filterByAge,
  getUniquePositions,
  parseMarketValue,
  sortReleases,
  type AgeFilter,
  type SortBy,
} from '@/lib/releases';
import { getConfederation } from '@/lib/nationToConfederation';
import type { Confederation } from '@/lib/api';

const VALUE_PRESETS = [
  { min: 0, max: 50000000, label: 'All', labelHe: 'הכל', isAll: true },
  { min: 0, max: 500000, label: '0-500K', labelHe: '0-500K', isAll: false },
  { min: 500000, max: 1000000, label: '500K-1M', labelHe: '500K-1M', isAll: false },
  { min: 1000000, max: 5000000, label: '1M-5M', labelHe: '1M-5M', isAll: false },
  { min: 5000000, max: 50000000, label: '5M+', labelHe: '5M+', isAll: false },
];

const AGE_FILTERS: { value: AgeFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'releases_age_all' },
  { value: 'u23', labelKey: 'releases_age_u23' },
  { value: '23-30', labelKey: 'releases_age_23_30' },
  { value: '30+', labelKey: 'releases_age_30plus' },
];

const REGION_OPTIONS: { value: Confederation; key: string }[] = [
  { value: 'UEFA', key: 'transfer_windows_group_uefa' },
  { value: 'CONMEBOL', key: 'transfer_windows_group_conmebol' },
  { value: 'CONCACAF', key: 'transfer_windows_group_concacaf' },
  { value: 'AFC', key: 'transfer_windows_group_afc' },
  { value: 'CAF', key: 'transfer_windows_group_caf' },
  { value: 'OFC', key: 'transfer_windows_group_ofc' },
];

const SORT_OPTIONS: { value: SortBy; labelKey: string }[] = [
  { value: 'value', labelKey: 'releases_sort_value' },
  { value: 'date', labelKey: 'releases_sort_date' },
  { value: 'age', labelKey: 'releases_sort_age' },
];

const POSITION_ORDER = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const POSITION_EXCLUDED = new Set(['LM', 'RM']);
const POSITION_HEBREW: Record<string, string> = { SS: 'חלוץ שני' };
const ENRICHMENT_REQUEST_TIMEOUT_MS = 15000;
const ENRICHMENT_RETRY_COOLDOWN_MS = 30000;
const ENRICHMENT_MAX_ATTEMPTS = 3;
const ENRICHMENT_DELAY_BETWEEN_REQUESTS_MS = 450;
const MANUAL_REFRESH_STATUS_POLL_MS = 5000;
const MANUAL_REFRESH_MAX_WAIT_MS = 45 * 60 * 1000;

interface FeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  playerPosition?: string;
  marketValue?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  transferDate?: string;
  extraInfo?: string;
  timestamp?: number;
}

interface ReleaseMeta {
  playerPosition?: string;
  marketValue?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  transferDate?: string;
}

interface NotificationPlayer extends ReleaseMeta {
  event: FeedEvent;
  playerUrl: string;
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

type ManualRefreshStage = 'idle' | 'fetching' | 'preparing' | 'enriching' | 'completed' | 'failed';

interface ManualRefreshProgress {
  stage: ManualRefreshStage;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  currentPlayerName?: string;
  startedAt?: number;
  finishedAt?: number;
  lastError?: string;
  fetchInfo?: string;
}

function deduplicateReleaseEvents(events: FeedEvent[]): FeedEvent[] {
  const isMeaningful = (value?: string | null): value is string => {
    if (!value) return false;
    const v = value.trim();
    return !!v && v !== '-' && v !== '—' && v.toLowerCase() !== 'unknown';
  };

  const pickField = (newer?: string, older?: string): string | undefined => {
    if (isMeaningful(newer)) return newer;
    if (isMeaningful(older)) return older;
    return newer ?? older;
  };

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
      playerPosition: pickField(newer.playerPosition, older.playerPosition),
      marketValue: pickField(newer.marketValue, older.marketValue),
      playerAge: pickField(newer.playerAge, older.playerAge),
      playerNationality: pickField(newer.playerNationality, older.playerNationality),
      playerNationalityFlag: pickField(newer.playerNationalityFlag, older.playerNationalityFlag),
      transferDate: pickField(newer.transferDate, older.transferDate),
      playerImage: pickField(newer.playerImage, older.playerImage),
      playerName: pickField(newer.playerName, older.playerName),
    });
  }
  return Array.from(seen.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

function hasMeaningfulText(value?: string | null): value is string {
  if (!value) return false;
  const v = value.trim();
  return !!v && v !== '-' && v !== '—' && v.toLowerCase() !== 'unknown';
}

function firstMeaningful(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (hasMeaningfulText(value)) return value.trim();
  }
  return undefined;
}

function cleanMeta(meta: ReleaseMeta): ReleaseMeta {
  return {
    playerPosition: firstMeaningful(meta.playerPosition),
    marketValue: firstMeaningful(meta.marketValue),
    playerAge: firstMeaningful(meta.playerAge),
    playerNationality: firstMeaningful(meta.playerNationality),
    playerNationalityFlag: firstMeaningful(meta.playerNationalityFlag),
    transferDate: firstMeaningful(meta.transferDate),
  };
}

function needsProfileEnrichment(event: FeedEvent, cacheMeta?: ReleaseMeta): boolean {
  return !firstMeaningful(event.playerPosition, cacheMeta?.playerPosition) ||
    !firstMeaningful(event.marketValue, cacheMeta?.marketValue) ||
    !firstMeaningful(event.playerAge, cacheMeta?.playerAge) ||
    !firstMeaningful(event.playerNationality, cacheMeta?.playerNationality);
}

function profileToReleaseMeta(details: Awaited<ReturnType<typeof getPlayerDetails>>): ReleaseMeta {
  return cleanMeta({
    playerPosition: Array.isArray(details.positions)
      ? details.positions.find((p) => hasMeaningfulText(p))
      : undefined,
    marketValue: details.marketValue,
    playerAge: details.age,
    playerNationality: details.nationality,
    playerNationalityFlag: details.nationalityFlag,
  });
}

async function getPlayerDetailsWithTimeout(url: string, timeoutMs = ENRICHMENT_REQUEST_TIMEOUT_MS) {
  return Promise.race([
    getPlayerDetails(url),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error('Profile enrichment timeout'));
      }, timeoutMs);
    }),
  ]);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

function timestampToDdMmYyyy(timestamp: number | undefined): string | undefined {
  if (!timestamp) return undefined;
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function toReleaseMeta(player: ReleasePlayer): ReleaseMeta {
  return {
    playerPosition: player.playerPosition,
    marketValue: player.marketValue,
    playerAge: player.playerAge,
    playerNationality: player.playerNationality,
    playerNationalityFlag: player.playerNationalityFlag,
    transferDate: player.transferDate,
  };
}

function ReleaseNotificationCard({
  event,
  t,
  isRtl,
  isInShortlist,
  isAdding,
  isEnriching,
  meta,
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
  isEnriching: boolean;
  meta?: ReleaseMeta;
  onAddToShortlist: (event: FeedEvent) => void;
  teammatesCache: Record<string, RosterTeammateMatch[]>;
  loadingTeammatesUrl: string | null;
  isTeammatesExpanded: string | null;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;
}) {
  const playerUrl = event.playerTmProfile || '';
  const playerPosition = event.playerPosition || meta?.playerPosition || '—';
  const marketValue = event.marketValue || meta?.marketValue || '—';
  const playerAge = event.playerAge || meta?.playerAge;
  const playerNationality = event.playerNationality || meta?.playerNationality;
  const playerNationalityFlag = event.playerNationalityFlag || meta?.playerNationalityFlag;
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
        {isEnriching && (
          <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4 flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-mgsr-dark/85 border border-mgsr-teal/30 backdrop-blur-sm shadow-lg">
            <span className="w-3.5 h-3.5 border-2 border-mgsr-teal/30 border-t-mgsr-teal rounded-full animate-spin" />
            <span className="w-1.5 h-1.5 rounded-full bg-mgsr-teal/70 animate-pulse" />
          </div>
        )}
        <div className="flex gap-4 mt-6">
          <div className="relative shrink-0">
            <img
              src={event.playerImage || 'https://via.placeholder.com/72'}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-mgsr-teal/50 transition-all duration-300 group-hover:scale-105"
            />
            {playerNationalityFlag && (
              <img
                src={playerNationalityFlag}
                alt=""
                className="absolute -bottom-1 -right-1 w-6 h-4 rounded object-cover border border-mgsr-dark shadow"
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-lg text-mgsr-text truncate group-hover:text-mgsr-teal transition-colors">
              {event.playerName || 'Unknown'}
            </p>
            <p className="text-sm text-mgsr-muted mt-1">{playerPosition}</p>
            <div className="flex items-center gap-2 mt-2">
              {playerAge && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-mgsr-card border border-mgsr-border text-mgsr-muted">
                  {t('players_age_display').replace('{age}', playerAge)}
                </span>
              )}
              {playerNationality && (
                <span className="text-xs text-mgsr-muted truncate">{playerNationality}</span>
              )}
            </div>
            <p className="text-xs text-mgsr-muted mt-2">
              {t('releases_sort_date')}: {formatTimestamp(event.timestamp, isRtl)}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-mgsr-border/80 flex items-center justify-between gap-3" data-no-propagate>
          <span className="text-base font-display font-bold text-mgsr-teal shrink-0">{marketValue}</span>
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      {match.player.playerPhoneNumber && (
                        <a
                          href={`https://wa.me/${match.player.playerPhoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hey ${(match.player.fullName || '').split(' ')[0]},\nHope everything is well at your side.\nI need your help with something.\nAny chance you have ${event.playerName || ''} contact number?\nThank you!`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title={`WhatsApp ${match.player.fullName || ''}`}
                          className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/25 transition-colors"
                        >
                          <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </a>
                      )}
                      <span className="text-xs font-medium text-mgsr-teal px-2 py-0.5 rounded-md bg-mgsr-teal/15 shrink-0">
                        {t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}
                      </span>
                    </div>
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
  const [releaseMetaByUrl, setReleaseMetaByUrl] = useState<Record<string, ReleaseMeta>>({});
  const [profileMetaByUrl, setProfileMetaByUrl] = useState<Record<string, ReleaseMeta>>({});
  const [firestorePositions, setFirestorePositions] = useState<{ name?: string; hebrewName?: string }[]>([]);
  const [preset, setPreset] = useState(0);
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [regionFilter, setRegionFilter] = useState<Confederation | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('value');
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [enrichingUrls, setEnrichingUrls] = useState<Set<string>>(new Set());
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [enrichmentRunNonce, setEnrichmentRunNonce] = useState(0);
  const [manualForcedEnrichmentUrls, setManualForcedEnrichmentUrls] = useState<Set<string>>(new Set());
  const [manualRefreshProgress, setManualRefreshProgress] = useState<ManualRefreshProgress>({
    stage: 'idle',
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
  });
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const fetchedProfileMetaRef = useRef<Set<string>>(new Set());
  const inFlightProfileMetaRef = useRef<Set<string>>(new Set());
  const profileAttemptCountRef = useRef<Map<string, number>>(new Map());
  const profileLastAttemptAtRef = useRef<Map<string, number>>(new Map());
  const manualForcedEnrichmentUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    manualForcedEnrichmentUrlsRef.current = manualForcedEnrichmentUrls;
  }, [manualForcedEnrichmentUrls]);

  useEffect(() => {
    if (!isManualRefreshing) return;
    const timer = setInterval(() => setProgressNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isManualRefreshing]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    getDocs(collection(db, 'Positions'))
      .then((snap) =>
        setFirestorePositions(
          snap.docs.map((doc) => doc.data()).sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const releases = await getReleasesFromCache();
        if (cancelled) return;
        const byUrl: Record<string, ReleaseMeta> = {};
        for (const release of releases) {
          if (!release.playerUrl) continue;
          byUrl[release.playerUrl] = toReleaseMeta(release);
        }
        setReleaseMetaByUrl(byUrl);
      } catch {
        // Best-effort enrichment: keep screen live even if cache fetch fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const notificationOnlyPlayers = useMemo<FeedEvent[]>(() => {
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

  useEffect(() => {
    const missingUrls = notificationOnlyPlayers
      .map((event) => event.playerTmProfile)
      .filter((url): url is string => !!url)
      .filter((url) => {
        const event = notificationOnlyPlayers.find((e) => e.playerTmProfile === url);
        if (!event) return false;
        const cacheMeta = releaseMetaByUrl[url];
        const profileMeta = profileMetaByUrl[url];
        const forceNow = manualForcedEnrichmentUrlsRef.current.has(url);
        if (!forceNow && profileMeta && !needsProfileEnrichment(event, { ...cacheMeta, ...profileMeta })) return false;
        const attempts = profileAttemptCountRef.current.get(url) ?? 0;
        const lastAttemptAt = profileLastAttemptAtRef.current.get(url) ?? 0;
        const cooldownPassed = Date.now() - lastAttemptAt >= ENRICHMENT_RETRY_COOLDOWN_MS;
        return (
          (forceNow || needsProfileEnrichment(event, cacheMeta)) &&
          !fetchedProfileMetaRef.current.has(url) &&
          !inFlightProfileMetaRef.current.has(url) &&
          attempts < ENRICHMENT_MAX_ATTEMPTS &&
          cooldownPassed
        );
      });

    if (missingUrls.length === 0) return;

    let cancelled = false;
    const run = async () => {
      for (let i = 0; i < missingUrls.length; i++) {
        const url = missingUrls[i];
        const event = notificationOnlyPlayers.find((entry) => entry.playerTmProfile === url);
        const isManualUrl = manualForcedEnrichmentUrlsRef.current.has(url);

        if (isManualUrl) {
          setManualRefreshProgress((prev) => ({
            ...prev,
            stage: 'enriching',
            currentPlayerName: event?.playerName || url,
          }));
        }

        inFlightProfileMetaRef.current.add(url);
        setEnrichingUrls((prev) => {
          const next = new Set(prev);
          next.add(url);
          return next;
        });

        profileLastAttemptAtRef.current.set(url, Date.now());
        profileAttemptCountRef.current.set(url, (profileAttemptCountRef.current.get(url) ?? 0) + 1);
        try {
          const details = await getPlayerDetailsWithTimeout(url);
          if (cancelled) return;
          const meta = profileToReleaseMeta(details);
          if (Object.values(meta).some(Boolean)) {
            fetchedProfileMetaRef.current.add(url);
            setProfileMetaByUrl((prev) => ({ ...prev, [url]: meta }));
          }
          if (isManualUrl) {
            setManualRefreshProgress((prev) => ({
              ...prev,
              completed: Math.min(prev.total, prev.completed + 1),
              succeeded: prev.succeeded + 1,
            }));
          }
        } catch {
          if (isManualUrl) {
            setManualRefreshProgress((prev) => ({
              ...prev,
              completed: Math.min(prev.total, prev.completed + 1),
              failed: prev.failed + 1,
            }));
          }
          // Keep UI responsive even when some profile fetches fail.
        } finally {
          inFlightProfileMetaRef.current.delete(url);
          setManualForcedEnrichmentUrls((prev) => {
            if (!prev.has(url)) return prev;
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
          setEnrichingUrls((prev) => {
            const next = new Set(prev);
            next.delete(url);
            return next;
          });
          if (isManualUrl) {
            setManualRefreshProgress((prev) => ({
              ...prev,
              currentPlayerName: prev.currentPlayerName === (event?.playerName || url) ? undefined : prev.currentPlayerName,
            }));
          }
        }

        if (cancelled) break;
        if (i < missingUrls.length - 1) {
          await wait(ENRICHMENT_DELAY_BETWEEN_REQUESTS_MS);
          if (cancelled) break;
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [notificationOnlyPlayers, releaseMetaByUrl, profileMetaByUrl, enrichmentRunNonce]);

  const runManualFetchAndEnrichment = useCallback(async () => {
    if (isManualRefreshing) return;

    const startedAt = Date.now();
    setManualRefreshProgress({
      stage: 'fetching',
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      startedAt,
      finishedAt: undefined,
      lastError: undefined,
      currentPlayerName: undefined,
      fetchInfo: undefined,
    });
    setIsManualRefreshing(true);
    try {
      const triggerResult = await callTriggerReleasesRefreshJob({});
      const requestedAt = triggerResult?.requestedAt || Date.now();

      setManualRefreshProgress((prev) => ({
        ...prev,
        stage: 'fetching',
        fetchInfo: `job=${triggerResult.jobName}, operation=${triggerResult.operationName ?? 'pending'}, status=running`,
      }));

      let workerCompleted = false;
      let finalStatus: string | null = null;
      let finalSummary: string | null = null;
      let finalError: string | null = null;

      while (Date.now() - startedAt < MANUAL_REFRESH_MAX_WAIT_MS) {
        const status = await callGetReleasesRefreshJobStatus({
          operationName: triggerResult.operationName ?? undefined,
        });
        finalStatus = status?.status ?? null;
        finalSummary = status?.summary ?? null;
        finalError = status?.error ?? null;
        const operationDone = status?.operationDone;
        const operationError = status?.operationError;

        setManualRefreshProgress((prev) => ({
          ...prev,
          stage: 'fetching',
          fetchInfo: `job=${triggerResult.jobName}, operation=${triggerResult.operationName ?? 'pending'}, opDone=${String(operationDone)}, status=${finalStatus ?? 'unknown'}, updatedAt=${status.updatedAt ?? 0}`,
        }));

        if (operationError) {
          throw new Error(`Cloud Run operation failed: ${operationError}`);
        }

        const hasFreshRun = typeof status?.lastRunAt === 'number' && status.lastRunAt >= requestedAt;
        const operationAllowsCompletion = triggerResult.operationName
          ? operationDone === true
          : true;
        if (operationAllowsCompletion && hasFreshRun && (finalStatus === 'success' || finalStatus === 'failed')) {
          workerCompleted = true;
          break;
        }

        await wait(MANUAL_REFRESH_STATUS_POLL_MS);
      }

      if (!workerCompleted) {
        throw new Error('Releases refresh worker timeout. Check WorkerRuns/ReleasesRefreshWorker.');
      }

      if (finalStatus !== 'success') {
        throw new Error(finalError || finalSummary || 'Releases refresh worker failed.');
      }

      const releases = await getReleasesFromCache(true);

      const byUrl: Record<string, ReleaseMeta> = {};
      for (const release of releases) {
        if (!release.playerUrl) continue;
        byUrl[release.playerUrl] = toReleaseMeta(release);
      }
      setReleaseMetaByUrl(byUrl);

      const freshFeedSnapshot = await getDocs(
        query(
          collection(db, FEED_EVENTS_COLLECTIONS.men),
          orderBy('timestamp', 'desc'),
          limit(1200)
        )
      );

      const freshNotInDatabaseUrls = new Set<string>(
        freshFeedSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as FeedEvent))
          .filter(
            (event) =>
              event.type === 'NEW_RELEASE_FROM_CLUB' &&
              event.extraInfo === 'NOT_IN_DATABASE' &&
              !!event.playerTmProfile &&
              typeof event.timestamp === 'number' &&
              event.timestamp >= requestedAt
          )
          .map((event) => event.playerTmProfile as string)
      );

      setManualRefreshProgress((prev) => ({
        ...prev,
        stage: 'preparing',
        fetchInfo: `jobStatus=success, freshNewEvents=${freshNotInDatabaseUrls.size}, cachePlayers=${releases.length}`,
      }));

      const targetUrlList: string[] =
        freshNotInDatabaseUrls.size > 0
          ? Array.from(freshNotInDatabaseUrls)
          : notificationOnlyPlayers
              .map((event) => event.playerTmProfile)
              .filter((url): url is string => !!url);
      const targetUrls = new Set<string>(targetUrlList);

      if (targetUrls.size === 0) {
        setManualRefreshProgress((prev) => ({
          ...prev,
          stage: 'completed',
          total: 0,
          completed: 0,
          succeeded: 0,
          failed: 0,
          finishedAt: Date.now(),
        }));
        setIsManualRefreshing(false);
        return;
      }

      // Reset enrichment guards so the same enrichment pipeline can run again on demand.
      fetchedProfileMetaRef.current = new Set(
        Array.from(fetchedProfileMetaRef.current).filter((url) => !targetUrls.has(url))
      );
      inFlightProfileMetaRef.current = new Set();
      profileAttemptCountRef.current = new Map();
      profileLastAttemptAtRef.current = new Map();
      setEnrichingUrls(new Set());
      setManualForcedEnrichmentUrls(targetUrls);
      setManualRefreshProgress((prev) => ({
        ...prev,
        stage: 'enriching',
        total: targetUrls.size,
        completed: 0,
        succeeded: 0,
        failed: 0,
        currentPlayerName: undefined,
      }));

      setProfileMetaByUrl((prev) => {
        if (targetUrls.size === 0) return prev;
        const next = { ...prev };
        targetUrls.forEach((url) => {
          delete next[url];
        });
        return next;
      });

      setEnrichmentRunNonce((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      setManualRefreshProgress((prev) => ({
        ...prev,
        stage: 'failed',
        lastError: message,
        finishedAt: Date.now(),
      }));
      setIsManualRefreshing(false);
    }
  }, [isManualRefreshing, notificationOnlyPlayers]);

  useEffect(() => {
    if (!isManualRefreshing) return;
    if (manualForcedEnrichmentUrls.size > 0) return;
    if (enrichingUrls.size > 0) return;
    setManualRefreshProgress((prev) => ({
      ...prev,
      stage: 'completed',
      currentPlayerName: undefined,
      finishedAt: Date.now(),
    }));
    setIsManualRefreshing(false);
  }, [isManualRefreshing, manualForcedEnrichmentUrls, enrichingUrls]);

  const manualRefreshUi = useMemo(() => {
    const total = manualRefreshProgress.total;
    const completed = manualRefreshProgress.completed;
    const startedAt = manualRefreshProgress.startedAt;
    const activeEnd = manualRefreshProgress.finishedAt ?? progressNow;
    const elapsedMs = startedAt ? Math.max(0, activeEnd - startedAt) : 0;
    const remaining = Math.max(0, total - completed);
    const etaMs = completed > 0 && remaining > 0
      ? Math.round((elapsedMs / completed) * remaining)
      : null;
    const progressPercent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return {
      total,
      completed,
      remaining,
      elapsedMs,
      etaMs,
      progressPercent,
    };
  }, [manualRefreshProgress, progressNow]);

  const resolvedPlayers = useMemo<NotificationPlayer[]>(() => {
    return notificationOnlyPlayers
      .filter((event): event is FeedEvent & { playerTmProfile: string } => !!event.playerTmProfile)
      .map((event) => {
        const meta = {
          ...(releaseMetaByUrl[event.playerTmProfile] || {}),
          ...(profileMetaByUrl[event.playerTmProfile] || {}),
        };
        return {
          event,
          playerUrl: event.playerTmProfile,
          playerPosition: firstMeaningful(event.playerPosition, meta.playerPosition),
          marketValue: firstMeaningful(event.marketValue, meta.marketValue),
          playerAge: firstMeaningful(event.playerAge, meta.playerAge),
          playerNationality: firstMeaningful(event.playerNationality, meta.playerNationality),
          playerNationalityFlag: firstMeaningful(event.playerNationalityFlag, meta.playerNationalityFlag),
          transferDate: firstMeaningful(event.transferDate, meta.transferDate) ?? timestampToDdMmYyyy(event.timestamp),
        };
      });
  }, [notificationOnlyPlayers, releaseMetaByUrl, profileMetaByUrl]);

  const positions = useMemo(() => {
    const fromData = getUniquePositions(
      resolvedPlayers.map((player) => ({ playerPosition: player.playerPosition } as ReleasePlayer))
    );
    const fromFirestore = firestorePositions.map((p) => p.name).filter(Boolean) as string[];
    const merged = new Set([...fromFirestore, ...fromData]);
    return Array.from(merged)
      .filter((position) => !POSITION_EXCLUDED.has(position.toUpperCase()))
      .sort((a, b) => {
        const ia = POSITION_ORDER.indexOf(a.toUpperCase());
        const ib = POSITION_ORDER.indexOf(b.toUpperCase());
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      });
  }, [resolvedPlayers, firestorePositions]);

  const filteredPlayers = useMemo<NotificationPlayer[]>(() => {
    let result = resolvedPlayers;
    const queryText = search.trim().toLowerCase();

    const selectedPreset = VALUE_PRESETS[preset];
    if (!selectedPreset.isAll) {
      result = result.filter((player) => {
        const value = parseMarketValue(player.marketValue);
        return value >= selectedPreset.min && value <= selectedPreset.max;
      });
    }

    if (queryText) {
      result = result.filter((player) => {
        const name = player.event.playerName?.toLowerCase() ?? '';
        const profile = player.playerUrl.toLowerCase();
        const position = player.playerPosition?.toLowerCase() ?? '';
        const nationality = player.playerNationality?.toLowerCase() ?? '';
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
        (player) => player.playerPosition?.toLowerCase() === positionFilter.toLowerCase()
      );
    }

    if (ageFilter !== 'all') {
      const allowed = new Set(
        filterByAge(
          result.map((player) => ({ playerUrl: player.playerUrl, playerAge: player.playerAge } as ReleasePlayer)),
          ageFilter
        )
          .map((player) => player.playerUrl)
          .filter(Boolean) as string[]
      );
      result = result.filter((player) => allowed.has(player.playerUrl));
    }

    if (regionFilter) {
      result = result.filter((player) => getConfederation(player.playerNationality) === regionFilter);
    }

    if (sortBy === 'date') {
      // Keep date sort aligned with what the UI shows on cards (FeedEvents timestamp).
      return [...result].sort((a, b) => {
        const tsA = a.event.timestamp ?? 0;
        const tsB = b.event.timestamp ?? 0;
        if (tsA !== tsB) return tsB - tsA;
        return (b.playerUrl || '').localeCompare(a.playerUrl || '');
      });
    }

    const sortedReleasePlayers = sortReleases(
      result.map((player) => ({
        playerUrl: player.playerUrl,
        marketValue: player.marketValue,
        transferDate: player.transferDate,
        playerAge: player.playerAge,
      } as ReleasePlayer)),
      sortBy
    );
    const sortedOrder = new Map(sortedReleasePlayers.map((player, index) => [player.playerUrl, index]));
    return [...result].sort((a, b) => (sortedOrder.get(a.playerUrl) ?? 0) - (sortedOrder.get(b.playerUrl) ?? 0));
  }, [resolvedPlayers, preset, search, positionFilter, ageFilter, regionFilter, sortBy]);

  const hasActiveFilters = useMemo(() => {
    return search.trim() || positionFilter || ageFilter !== 'all' || regionFilter || preset !== 0;
  }, [search, positionFilter, ageFilter, regionFilter, preset]);

  const addToShortlist = useCallback(
    async (event: FeedEvent) => {
      if (!user || !event.playerTmProfile) return;
      setAddingUrl(event.playerTmProfile);
      try {
        const playerMeta = {
          ...(releaseMetaByUrl[event.playerTmProfile] || {}),
          ...(profileMetaByUrl[event.playerTmProfile] || {}),
        };
        const account = await getCurrentAccountForShortlist(user);
        const result = await callShortlistAdd({
          platform: 'men',
          tmProfileUrl: event.playerTmProfile,
          playerImage: event.playerImage ?? null,
          playerName: event.playerName ?? null,
          playerPosition: firstMeaningful(event.playerPosition, playerMeta.playerPosition) ?? null,
          playerAge: firstMeaningful(event.playerAge, playerMeta.playerAge) ?? null,
          playerNationality: firstMeaningful(event.playerNationality, playerMeta.playerNationality) ?? null,
          playerNationalityFlag: firstMeaningful(event.playerNationalityFlag, playerMeta.playerNationalityFlag) ?? null,
          clubJoinedName: null,
          transferDate: firstMeaningful(event.transferDate, playerMeta.transferDate) ?? formatTransferDateForShortlist(event.timestamp),
          marketValue: firstMeaningful(event.marketValue, playerMeta.marketValue) ?? null,
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
    [user, releaseMetaByUrl, profileMetaByUrl]
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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <Link
              href="/releases"
              className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-teal hover:bg-mgsr-teal/20 hover:border-mgsr-teal/40 transition text-center"
            >
              {t('release_notifications_back_to_releases')}
            </Link>
            <button
              onClick={runManualFetchAndEnrichment}
              disabled={isManualRefreshing}
              className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-teal hover:bg-mgsr-teal/20 hover:border-mgsr-teal/40 transition text-center disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isManualRefreshing && (
                <span className="w-4 h-4 border-2 border-mgsr-teal/40 border-t-mgsr-teal rounded-full animate-spin" />
              )}
              <span>
                {isManualRefreshing
                  ? t('release_notifications_manual_refreshing')
                  : t('release_notifications_manual_refresh')}
              </span>
            </button>
            {VALUE_PRESETS.map((valuePreset, index) => (
              <button
                key={index}
                onClick={() => setPreset(index)}
                className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                  preset === index
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30'
                }`}
              >
                {valuePreset.isAll ? t('releases_all') : isRtl ? valuePreset.labelHe : valuePreset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 py-3 px-3 sm:px-4 rounded-xl bg-mgsr-card/50 border border-mgsr-border overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <span className="text-sm text-mgsr-muted">
            {t('release_notifications_total')}: <strong className="text-mgsr-text">{resolvedPlayers.length}</strong>
          </span>
          <span className="text-sm text-mgsr-muted">
            {t('release_notifications_visible')}: <strong className="text-mgsr-teal">{filteredPlayers.length}</strong>
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-mgsr-muted">{t('releases_sort')}:</span>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  sortBy === option.value
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {(isManualRefreshing || manualRefreshProgress.stage === 'completed' || manualRefreshProgress.stage === 'failed') && (
          <div className="mb-4 rounded-xl border border-mgsr-border bg-mgsr-card/60 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="text-sm font-medium text-mgsr-text">
                {t('release_notifications_progress_title')}
              </div>
              <div className="text-xs text-mgsr-muted">
                {manualRefreshProgress.stage === 'fetching' && t('release_notifications_progress_stage_fetching')}
                {manualRefreshProgress.stage === 'preparing' && t('release_notifications_progress_stage_preparing')}
                {manualRefreshProgress.stage === 'enriching' && t('release_notifications_progress_stage_enriching')}
                {manualRefreshProgress.stage === 'completed' && t('release_notifications_progress_stage_completed')}
                {manualRefreshProgress.stage === 'failed' && t('release_notifications_progress_stage_failed')}
              </div>
            </div>

            {manualRefreshProgress.fetchInfo && (
              <div className="mt-2 text-xs text-mgsr-muted">
                {manualRefreshProgress.fetchInfo}
              </div>
            )}

            {manualRefreshUi.total > 0 && (
              <>
                <div className="mt-3 h-2 rounded-full bg-mgsr-dark/70 overflow-hidden">
                  <div
                    className="h-full bg-mgsr-teal transition-all duration-300"
                    style={{ width: `${manualRefreshUi.progressPercent}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="text-mgsr-muted">
                    {t('release_notifications_progress_processed')
                      .replace('{done}', String(manualRefreshUi.completed))
                      .replace('{total}', String(manualRefreshUi.total))}
                  </div>
                  <div className="text-mgsr-muted">
                    {t('release_notifications_progress_success')
                      .replace('{count}', String(manualRefreshProgress.succeeded))}
                  </div>
                  <div className="text-mgsr-muted">
                    {t('release_notifications_progress_failed')
                      .replace('{count}', String(manualRefreshProgress.failed))}
                  </div>
                  <div className="text-mgsr-muted">
                    {t('release_notifications_progress_elapsed')
                      .replace('{time}', formatDurationMs(manualRefreshUi.elapsedMs))}
                  </div>
                </div>
                <div className="mt-2 text-xs text-mgsr-muted">
                  {manualRefreshUi.etaMs != null
                    ? t('release_notifications_progress_eta').replace('{time}', formatDurationMs(manualRefreshUi.etaMs))
                    : t('release_notifications_progress_eta_unknown')}
                </div>
              </>
            )}

            {manualRefreshProgress.currentPlayerName && (
              <div className="mt-2 text-xs text-mgsr-muted truncate">
                {t('release_notifications_progress_current')
                  .replace('{name}', manualRefreshProgress.currentPlayerName)}
              </div>
            )}

            {manualRefreshProgress.lastError && (
              <div className="mt-2 text-xs text-rose-400">
                {manualRefreshProgress.lastError}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:gap-4 mb-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('release_notifications_search')}
            className="w-full max-w-md px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60"
          />
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <span className="text-xs text-mgsr-muted self-center shrink-0">{t('releases_position')}:</span>
            <button
              onClick={() => setPositionFilter(null)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                !positionFilter
                  ? 'bg-mgsr-teal text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('releases_all')}
            </button>
            {positions.map((position) => {
              const firestorePosition = firestorePositions.find((p) => p.name?.toLowerCase() === position.toLowerCase());
              const label = isRtl ? (firestorePosition?.hebrewName || POSITION_HEBREW[position] || position) : position;
              return (
                <button
                  key={position}
                  onClick={() => setPositionFilter(positionFilter === position ? null : position)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    positionFilter === position
                      ? 'bg-mgsr-teal text-mgsr-dark'
                      : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <span className="text-xs text-mgsr-muted self-center shrink-0">{t('releases_age')}:</span>
            {AGE_FILTERS.map(({ value, labelKey }) => (
              <button
                key={value}
                onClick={() => setAgeFilter(ageFilter === value ? 'all' : value)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  ageFilter === value
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            <span className="text-xs text-mgsr-muted self-center shrink-0">{t('releases_region')}:</span>
            <button
              onClick={() => setRegionFilter(null)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                !regionFilter
                  ? 'bg-mgsr-teal text-mgsr-dark'
                  : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
              }`}
            >
              {t('releases_all')}
            </button>
            {REGION_OPTIONS.map((region) => (
              <button
                key={region.value}
                onClick={() => setRegionFilter(regionFilter === region.value ? null : region.value)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  regionFilter === region.value
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {t(region.key)}
              </button>
            ))}
          </div>
        </div>

        {loadingList ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="animate-pulse text-mgsr-muted">{t('release_notifications_loading')}</div>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-2 relative">
              {hasActiveFilters ? t('search_no_results') : t('release_notifications_empty')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPlayers.map((player) => (
              <ReleaseNotificationCard
                key={player.playerUrl}
                event={player.event}
                t={t}
                isRtl={isRtl}
                isInShortlist={shortlistUrls.has(player.playerUrl)}
                isAdding={addingUrl === player.playerUrl}
                isEnriching={enrichingUrls.has(player.playerUrl)}
                meta={player}
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