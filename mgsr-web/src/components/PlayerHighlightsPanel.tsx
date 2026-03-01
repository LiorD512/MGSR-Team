'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getPlayerHighlights,
  savePinnedHighlights,
  formatDuration,
  formatViews,
  timeAgo,
  type HighlightVideo,
} from '@/lib/highlightsApi';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** YouTube lite-embed: shows thumbnail until clicked, then loads iframe */
function YouTubeLiteEmbed({
  video,
  autoplay,
}: {
  video: HighlightVideo;
  autoplay?: boolean;
}) {
  const [activated, setActivated] = useState(autoplay || false);

  useEffect(() => {
    if (autoplay) setActivated(true);
  }, [autoplay, video.id]);

  if (activated) {
    const src =
      video.source === 'youtube'
        ? `${video.embedUrl}?autoplay=1&rel=0&modestbranding=1`
        : video.embedUrl;
    return (
      <iframe
        src={src}
        className="w-full h-full rounded-lg"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={video.title}
      />
    );
  }

  return (
    <button
      onClick={() => setActivated(true)}
      className="relative w-full h-full group cursor-pointer bg-black rounded-lg overflow-hidden"
      aria-label={`Play: ${video.title}`}
    >
      {/* Thumbnail */}
      <img
        src={video.thumbnailUrl}
        alt={video.title}
        className="w-full h-full object-cover transition-transform duration-300 motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100"
        loading="lazy"
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-mgsr-teal/90 flex items-center justify-center shadow-lg shadow-mgsr-teal/30 group-hover:scale-110 transition-transform">
          <svg className="w-7 h-7 md:w-8 md:h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      {/* Duration badge */}
      {video.durationSeconds > 0 && (
        <span className="absolute bottom-3 right-3 bg-black/80 text-white text-xs font-medium px-2 py-0.5 rounded">
          {formatDuration(video.durationSeconds)}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Thumbnail strip card                                              */
/* ------------------------------------------------------------------ */

function VideoThumb({
  video,
  active,
  onClick,
  index,
  onKeyDown,
  selectable,
  selected,
  onSelectToggle,
}: {
  video: HighlightVideo;
  active: boolean;
  onClick: () => void;
  index: number;
  onKeyDown?: (e: React.KeyboardEvent, index: number) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
}) {
  const handleClick = () => {
    if (selectable && onSelectToggle) {
      onSelectToggle();
    }
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={onKeyDown ? (e) => onKeyDown(e, index) : undefined}
      aria-current={active ? 'true' : undefined}
      aria-label={selectable ? (selected ? `Deselect: ${video.title}` : `Select: ${video.title}`) : `Play: ${video.title}`}
      aria-pressed={selectable ? selected : undefined}
      className={`
        flex-shrink-0 w-40 md:w-48 rounded-lg overflow-hidden border-2 transition-all duration-200
        ${selected ? 'border-mgsr-teal ring-2 ring-mgsr-teal/50' : ''}
        ${active && !selectable
          ? 'border-mgsr-teal shadow-lg shadow-mgsr-teal/20 scale-[1.02]'
          : !selected
            ? 'border-transparent hover:border-mgsr-border/60 opacity-75 hover:opacity-100'
            : ''}
      `}
    >
      {/* Thumb image */}
      <div className="relative aspect-video bg-mgsr-dark">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {video.durationSeconds > 0 && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            {formatDuration(video.durationSeconds)}
          </span>
        )}
        {video.source === 'scorebat' && (
          <span className="absolute top-1 left-1 bg-mgsr-teal/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
            Match
          </span>
        )}
        {selectable && selected && (
          <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-mgsr-teal flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
        )}
        {active && !selectable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-6 h-6 rounded-full bg-mgsr-teal flex items-center justify-center">
              <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>
      {/* Meta */}
      <div className="px-2 py-1.5 text-left bg-mgsr-card">
        <p className="text-[11px] text-mgsr-text truncate leading-tight font-medium">
          {video.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-mgsr-muted truncate">{video.channelName}</span>
          {video.viewCount != null && video.viewCount > 0 && (
            <>
              <span className="text-mgsr-muted/40">·</span>
              <span className="text-[10px] text-mgsr-muted">{formatViews(video.viewCount)}</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                  */
/* ------------------------------------------------------------------ */

function HighlightsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Player skeleton */}
      <div className="aspect-video rounded-lg bg-mgsr-dark/60" />
      {/* Thumbnail strip skeleton */}
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-shrink-0 w-40 md:w-48">
            <div className="aspect-video rounded-lg bg-mgsr-dark/40" />
            <div className="mt-1.5 h-3 bg-mgsr-dark/30 rounded w-3/4" />
            <div className="mt-1 h-2.5 bg-mgsr-dark/20 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                       */
/* ------------------------------------------------------------------ */

function EmptyState({ isRtl }: { isRtl: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="w-16 h-16 rounded-full bg-mgsr-dark/50 flex items-center justify-center mb-3">
        <svg className="w-8 h-8 text-mgsr-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      </div>
      <p className="text-sm text-mgsr-muted">{t('highlights_empty')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

const MAX_PINNED = 2;

interface PlayerHighlightsPanelProps {
  playerId: string;
  /** Pinned highlights from Firestore (Players.pinnedHighlights). Source of truth. */
  pinnedHighlights: HighlightVideo[];
  playerName: string;
  teamName?: string;
  position?: string;
  /** When player is on loan, the loaning club (for parent-club highlights) */
  parentClub?: string;
  /** For relevanceLanguage (e.g. "Spain" → es) */
  nationality?: string;
  /** Hebrew name for Israeli players */
  fullNameHe?: string;
  /** For league hint (e.g. "England" → Premier League) */
  clubCountry?: string;
  isRtl?: boolean;
  /** Firestore collection for saving pinned highlights (default: Players) */
  playerCollection?: 'Players' | 'PlayersWomen';
  /** Accent variant for styling (women uses rose instead of teal) */
  accentVariant?: 'teal' | 'women';
}

type Mode = 'pinned' | 'select' | 'replace';

export default function PlayerHighlightsPanel({
  playerId,
  pinnedHighlights,
  playerName,
  teamName,
  position,
  parentClub,
  nationality,
  fullNameHe,
  clubCountry,
  isRtl: isRtlProp,
  playerCollection = 'Players',
  accentVariant = 'teal',
}: PlayerHighlightsPanelProps) {
  const { t, isRtl: contextRtl } = useLanguage();
  const isRtl = isRtlProp ?? contextRtl;

  const pinned = pinnedHighlights?.slice(0, MAX_PINNED) ?? [];
  const [mode, setMode] = useState<Mode>(() =>
    (pinnedHighlights?.length ?? 0) > 0 ? 'pinned' : 'select'
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const [videos, setVideos] = useState<HighlightVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cachedAt, setCachedAt] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const youtubeScrollRef = useRef<HTMLDivElement>(null);
  const scorebatScrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync mode when pinnedHighlights change (e.g. from Firestore)
  useEffect(() => {
    const hasPinned = (pinnedHighlights?.length ?? 0) > 0;
    setMode((m) => (m === 'replace' ? m : hasPinned ? 'pinned' : 'select'));
  }, [pinnedHighlights?.length]);

  // Reset activeIndex when switching mode or when display list changes
  useEffect(() => {
    const list = mode === 'pinned' ? pinned : videos;
    setActiveIndex((i) => (i >= list.length ? 0 : i));
  }, [mode, pinned.length, videos.length]);

  const displayVideos = mode === 'pinned' ? pinned : videos;
  const isSelectMode = mode === 'select' || mode === 'replace';

  const toggleSelect = useCallback((video: HighlightVideo) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(video.id)) {
        next.delete(video.id);
      } else if (next.size < MAX_PINNED) {
        next.add(video.id);
      }
      return next;
    });
  }, []);

  const confirmSelection = useCallback(async () => {
    const selectedVideos = videos.filter((v) => selectedIds.has(v.id));
    if (selectedVideos.length === 0) return;
    setSaving(true);
    try {
      await savePinnedHighlights(playerId, selectedVideos, playerCollection);
      setMode('pinned');
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [videos, selectedIds, playerId, playerCollection]);

  const cancelReplace = useCallback(() => {
    setMode('pinned');
    setSelectedIds(new Set());
  }, []);

  // Lazy-fetch: only load when panel is expanded for the first time
  const doFetch = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && fetched) return;
    if (!playerName) return;
    // Abort any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await getPlayerHighlights(
        playerName,
        teamName,
        position,
        forceRefresh,
        parentClub,
        controller.signal,
        nationality,
        fullNameHe,
        clubCountry
      );
      if (controller.signal.aborted) return;
      setVideos(data.videos || []);
      setCachedAt(data.cachedAt || 0);
      setSources(data.sources || []);
      setActiveIndex(0);
      if (data.error) setError(data.error);
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      setError(err instanceof Error ? err.message : 'Failed to load highlights');
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
      setFetched(true);
    }
  }, [playerName, teamName, position, parentClub, nationality, fullNameHe, clubCountry, fetched]);

  const startReplace = useCallback(() => {
    setMode('replace');
    setSelectedIds(new Set());
    if (!fetched) doFetch();
  }, [fetched, doFetch]);

  const handleToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next && !fetched) {
      doFetch();
    }
  }, [expanded, fetched, doFetch]);

  const youtubeVideos = videos.filter((v) => v.source === 'youtube');
  const scorebatVideos = videos.filter((v) => v.source === 'scorebat');
  const activeVideo =
    mode === 'pinned'
      ? pinned[activeIndex] || pinned[0] || null
      : (videos[activeIndex] || videos[0] || null);

  // When active video changes, scroll its thumbnail into view (use correct ref for YouTube vs Scorebat)
  useEffect(() => {
    const scrollContainer = activeVideo?.source === 'scorebat' ? scorebatScrollRef.current : youtubeScrollRef.current;
    if (!scrollContainer) return;
    const sectionVideos = activeVideo?.source === 'scorebat' ? scorebatVideos : youtubeVideos;
    const sectionIndex = sectionVideos.findIndex((v) => v === activeVideo);
    if (sectionIndex >= 0) {
      const child = scrollContainer.children[sectionIndex] as HTMLElement | undefined;
      if (child) {
        const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        child.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [activeIndex, activeVideo, youtubeVideos, scorebatVideos]);

  const cacheAgo = cachedAt > 0 ? timeAgo(new Date(cachedAt).toISOString()) : '';

  const handleThumbKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = e.key === 'ArrowLeft' ? Math.max(0, index - 1) : Math.min(videos.length - 1, index + 1);
        setActiveIndex(next);
        const scrollContainer = videos[next]?.source === 'scorebat' ? scorebatScrollRef.current : youtubeScrollRef.current;
        const sectionVideos = videos[next]?.source === 'scorebat' ? scorebatVideos : youtubeVideos;
        const sectionIndex = sectionVideos.findIndex((v) => v === videos[next]);
        if (scrollContainer && sectionIndex >= 0) {
          (scrollContainer.children[sectionIndex] as HTMLElement)?.focus();
        }
      }
    },
    [videos, youtubeVideos, scorebatVideos]
  );

  return (
    <div className="rounded-xl bg-mgsr-card border border-mgsr-border overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ── Header (always visible, click to toggle) ────────────── */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-mgsr-dark/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Video icon */}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a2.832 2.832 0 0 0-1.991-2.006C19.693 3.6 12 3.6 12 3.6s-7.693 0-9.507.58A2.832 2.832 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a2.832 2.832 0 0 0 1.991 2.006C4.307 20.4 12 20.4 12 20.4s7.693 0 9.507-.58a2.832 2.832 0 0 0 1.991-2.006C24 15.93 24 12 24 12s0-3.93-.502-5.814Z" />
              <path d="m9.545 15.568 6.364-3.568-6.364-3.568v7.136Z" fill="white" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="text-base font-display font-semibold text-mgsr-text">
              {t('highlights_title')}
            </h3>
            {!expanded && (
              <p className="text-xs text-mgsr-muted mt-0.5">
                {mode === 'pinned' && pinned.length > 0
                  ? t('highlights_pinned_count').replace('{n}', String(pinned.length))
                  : fetched && videos.length > 0
                    ? `${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`
                    : ''}
              </p>
            )}
          </div>
        </div>
        {/* Expand/collapse chevron */}
        <svg
          className={`w-5 h-5 text-mgsr-muted transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* ── Expanded content ────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-mgsr-border">
          {/* ── Pinned mode: show saved videos ───────────────────── */}
          {mode === 'pinned' && pinned.length > 0 && (
            <div className="px-5 py-4 space-y-4">
              {activeVideo && (
                <div className="aspect-video rounded-lg overflow-hidden bg-black shadow-xl shadow-black/30">
                  <YouTubeLiteEmbed key={activeVideo.id} video={activeVideo} autoplay={false} />
                </div>
              )}
              {activeVideo && (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-mgsr-text truncate">{activeVideo.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-mgsr-muted">
                      <span>{activeVideo.channelName}</span>
                      {activeVideo.viewCount != null && activeVideo.viewCount > 0 && (
                        <>
                          <span className="text-mgsr-muted/40">·</span>
                          <span>{formatViews(activeVideo.viewCount)} {t('highlights_views')}</span>
                        </>
                      )}
                      {activeVideo.publishedAt && (
                        <>
                          <span className="text-mgsr-muted/40">·</span>
                          <span>{timeAgo(activeVideo.publishedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {activeVideo.source === 'youtube' && (
                    <a
                      href={`https://www.youtube.com/watch?v=${activeVideo.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs text-mgsr-muted hover:text-mgsr-teal transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z" />
                        <path d="M5 5v14h14v-7h2v7c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h7v2H5Z" />
                      </svg>
                      YouTube
                    </a>
                  )}
                </div>
              )}
              {pinned.length > 1 && (
                <div
                  ref={youtubeScrollRef}
                  className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-mgsr-border scrollbar-track-transparent"
                >
                  {pinned.map((v, idx) => (
                    <VideoThumb
                      key={v.id}
                      video={v}
                      active={idx === activeIndex}
                      onClick={() => setActiveIndex(idx)}
                      index={idx}
                      onKeyDown={handleThumbKeyDown}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-mgsr-border/50 pt-3">
                <div className="flex items-center gap-1.5 text-[10px] text-mgsr-muted/60">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a2.832 2.832 0 0 0-1.991-2.006C19.693 3.6 12 3.6 12 3.6s-7.693 0-9.507.58A2.832 2.832 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a2.832 2.832 0 0 0 1.991 2.006C4.307 20.4 12 20.4 12 20.4s7.693 0 9.507-.58a2.832 2.832 0 0 0 1.991-2.006C24 15.93 24 12 24 12s0-3.93-.502-5.814Z" />
                    <path d="m9.545 15.568 6.364-3.568-6.364-3.568v7.136Z" fill="white" />
                  </svg>
                  <span>{t('highlights_powered_by')}</span>
                </div>
                <button
                  onClick={startReplace}
                  className="px-3 py-1.5 rounded-lg bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition-colors text-sm font-medium"
                >
                  {t('highlights_replace_videos')}
                </button>
              </div>
            </div>
          )}

          {/* ── Select/Replace mode: fetch + choose videos ────────── */}
          {(mode === 'select' || mode === 'replace') && (
            <>
              {loading && (
                <div className="px-5 py-5">
                  <HighlightsSkeleton />
                </div>
              )}

              {!loading && error && videos.length === 0 && (
                <div className="px-5 py-8 text-center space-y-3">
                  <p className="text-sm text-mgsr-muted">{t('highlights_error')}</p>
                  <p className="text-xs text-mgsr-muted/80">{error}</p>
                  <button
                    onClick={() => doFetch(true)}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {t('highlights_retry')}
                  </button>
                </div>
              )}

              {!loading && !error && videos.length === 0 && fetched && (
                <EmptyState isRtl={isRtl} />
              )}

              {!loading && videos.length > 0 && (
                <div className="px-5 py-4 space-y-4">
                  {/* Disclaimer */}
                  <div className="rounded-lg bg-mgsr-dark/50 border border-mgsr-border/50 px-4 py-3">
                    <p className="text-sm text-mgsr-muted">{t('highlights_disclaimer')}</p>
                    <p className="text-xs font-medium text-mgsr-teal mt-1">{t('highlights_select_up_to')}</p>
                  </div>

                  {/* ── Main video player ──────────────────────────── */}
                  {activeVideo && (
                <div className="aspect-video rounded-lg overflow-hidden bg-black shadow-xl shadow-black/30">
                  <YouTubeLiteEmbed
                    key={activeVideo.id}
                    video={activeVideo}
                    autoplay={false}
                  />
                </div>
              )}

              {/* Active video title + meta */}
              {activeVideo && (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-mgsr-text truncate">
                      {activeVideo.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-mgsr-muted">
                      <span>{activeVideo.channelName}</span>
                      {activeVideo.viewCount != null && activeVideo.viewCount > 0 && (
                        <>
                          <span className="text-mgsr-muted/40">·</span>
                          <span>{formatViews(activeVideo.viewCount)} {t('highlights_views')}</span>
                        </>
                      )}
                      {activeVideo.publishedAt && (
                        <>
                          <span className="text-mgsr-muted/40">·</span>
                          <span>{timeAgo(activeVideo.publishedAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Open on YouTube link */}
                  {activeVideo.source === 'youtube' && (
                    <a
                      href={`https://www.youtube.com/watch?v=${activeVideo.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs text-mgsr-muted hover:text-mgsr-teal transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z" />
                        <path d="M5 5v14h14v-7h2v7c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h7v2H5Z" />
                      </svg>
                      YouTube
                    </a>
                  )}
                </div>
              )}

              {/* ── Thumbnail strip (selectable) ────────────────── */}
              {videos.length > 0 && (
                <>
                  {/* Section: Player Highlights */}
                  {youtubeVideos.length > 0 && (
                    <div>
                      {scorebatVideos.length > 0 && (
                        <p className="text-xs font-semibold text-mgsr-muted uppercase tracking-wider mb-2">
                          {t('highlights_compilations')}
                        </p>
                      )}
                      <div
                        ref={youtubeScrollRef}
                        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-mgsr-border scrollbar-track-transparent"
                      >
                        {youtubeVideos.map((v) => {
                          const idx = videos.indexOf(v);
                          return (
                            <VideoThumb
                              key={v.id}
                              video={v}
                              active={idx === activeIndex}
                              onClick={() => setActiveIndex(idx)}
                              index={idx}
                              onKeyDown={handleThumbKeyDown}
                              selectable
                              selected={selectedIds.has(v.id)}
                              onSelectToggle={() => toggleSelect(v)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Section: Recent Match Highlights */}
                  {scorebatVideos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-mgsr-muted uppercase tracking-wider mb-2">
                        {t('highlights_recent_matches')}
                      </p>
                      <div
                        ref={scorebatScrollRef}
                        className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-mgsr-border scrollbar-track-transparent"
                      >
                        {scorebatVideos.map((v) => {
                          const idx = videos.indexOf(v);
                          return (
                            <VideoThumb
                              key={v.id}
                              video={v}
                              active={idx === activeIndex}
                              onClick={() => setActiveIndex(idx)}
                              index={idx}
                              onKeyDown={handleThumbKeyDown}
                              selectable
                              selected={selectedIds.has(v.id)}
                              onSelectToggle={() => toggleSelect(v)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={confirmSelection}
                      disabled={selectedIds.size === 0 || saving}
                      className="px-4 py-2 rounded-lg bg-mgsr-teal text-white hover:bg-mgsr-teal/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving
                        ? (t('highlights_saving') || 'Saving...')
                        : mode === 'replace'
                          ? t('highlights_confirm_replacement')
                          : t('highlights_confirm_selection')}
                    </button>
                    {mode === 'replace' && (
                      <button
                        onClick={cancelReplace}
                        className="px-4 py-2 rounded-lg border border-mgsr-border text-mgsr-muted hover:bg-mgsr-dark/50 transition-colors text-sm font-medium"
                      >
                        {t('highlights_cancel')}
                      </button>
                    )}
                  </div>

                  {/* ── Footer ─────────────────────────────────────── */}
                  <div className="flex items-center justify-between border-t border-mgsr-border/50 pt-3">
                <div className="flex items-center gap-1.5 text-[10px] text-mgsr-muted/60">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a2.832 2.832 0 0 0-1.991-2.006C19.693 3.6 12 3.6 12 3.6s-7.693 0-9.507.58A2.832 2.832 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a2.832 2.832 0 0 0 1.991 2.006C4.307 20.4 12 20.4 12 20.4s7.693 0 9.507-.58a2.832 2.832 0 0 0 1.991-2.006C24 15.93 24 12 24 12s0-3.93-.502-5.814Z" />
                    <path d="m9.545 15.568 6.364-3.568-6.364-3.568v7.136Z" fill="white" />
                  </svg>
                  <span>{t('highlights_powered_by')}</span>
                </div>
                <div className="flex items-center gap-3">
                  {cacheAgo && (
                    <span className="text-[10px] text-mgsr-muted/40">
                      {t('highlights_updated')} {cacheAgo}
                    </span>
                  )}
                  <button
                    onClick={() => doFetch(true)}
                    disabled={loading}
                    className="flex items-center gap-1 text-[10px] text-mgsr-muted/60 hover:text-mgsr-teal transition-colors disabled:opacity-40"
                    title={t('highlights_refresh')}
                  >
                    <svg
                      className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M21.015 4.356v4.992" />
                    </svg>
                    <span>{t('highlights_refresh')}</span>
                  </button>
                </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
