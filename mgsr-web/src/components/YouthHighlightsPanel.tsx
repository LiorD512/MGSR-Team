'use client';

import { useState, useCallback, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  savePinnedHighlights,
  parseYouTubeVideoId,
  fetchYouTubeOembed,
  formatViews,
  type HighlightVideo,
} from '@/lib/highlightsApi';

/* ------------------------------------------------------------------ */
/*  Source detection                                                   */
/* ------------------------------------------------------------------ */

type VideoSource = 'youtube' | 'instagram' | 'tiktok' | 'other';

function detectSource(url: string): VideoSource {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('tiktok.com') || lower.includes('vm.tiktok')) return 'tiktok';
  return 'other';
}

const sourceConfig: Record<VideoSource, { label: string; emoji: string; gradient: string; color: string }> = {
  youtube: { label: 'YouTube', emoji: '▶️', gradient: 'from-red-600 to-red-800', color: 'bg-red-600' },
  instagram: { label: 'Instagram', emoji: '📸', gradient: 'from-[#F58529] via-[#DD2A7B] to-[#8134AF]', color: 'bg-[#DD2A7B]' },
  tiktok: { label: 'TikTok', emoji: '🎵', gradient: 'from-[#00F2EA] via-black to-[#FF0050]', color: 'bg-[#00F2EA]' },
  other: { label: 'Video', emoji: '🎬', gradient: 'from-cyan-500/60 to-violet-500/60', color: 'bg-gray-600' },
};

function generateId(url: string): string {
  const ytId = parseYouTubeVideoId(url);
  if (ytId) return ytId;
  // Simple hash for non-YouTube URLs
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const chr = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Placeholder thumbnail                                             */
/* ------------------------------------------------------------------ */

function PlaceholderThumb({ source, className = '' }: { source: VideoSource; className?: string }) {
  const config = sourceConfig[source];
  return (
    <div className={`bg-gradient-to-br ${config.gradient} flex flex-col items-center justify-center ${className}`}>
      <span className="text-4xl">{config.emoji}</span>
      <span className="text-white font-bold text-sm mt-1">{config.label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  YouTube lite embed                                                */
/* ------------------------------------------------------------------ */

function YouTubeLiteEmbed({ video }: { video: HighlightVideo }) {
  const [activated, setActivated] = useState(false);

  if (activated) {
    return (
      <iframe
        src={`${video.embedUrl}?autoplay=1&rel=0&modestbranding=1`}
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
      {video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
      ) : (
        <PlaceholderThumb source={detectSource(video.embedUrl)} className="w-full h-full" />
      )}
      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/15 transition-colors" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[var(--youth-cyan,#06b6d4)]/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <svg className="w-7 h-7 md:w-8 md:h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                        */
/* ------------------------------------------------------------------ */

interface YouthHighlightsPanelProps {
  playerId: string;
  pinnedHighlights?: HighlightVideo[];
  isRtl?: boolean;
}

export default function YouthHighlightsPanel({
  playerId,
  pinnedHighlights,
  isRtl: isRtlProp,
}: YouthHighlightsPanelProps) {
  const { t, isRtl: contextRtl } = useLanguage();
  const isRtl = isRtlProp ?? contextRtl;

  const pinned = pinnedHighlights ?? [];
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeVideo = pinned[activeIndex] ?? pinned[0] ?? null;

  const handleAdd = useCallback(async () => {
    const url = urlInput.trim();
    if (!url || !isValidUrl(url)) {
      setError(t('youth_highlights_invalid_url'));
      return;
    }

    const id = generateId(url);
    if (pinned.some((v) => v.id === id)) {
      setError(t('youth_highlights_already_added'));
      return;
    }

    setError(null);
    setAdding(true);

    try {
      const source = detectSource(url);
      let video: HighlightVideo;

      if (source === 'youtube') {
        const videoId = parseYouTubeVideoId(url);
        if (videoId) {
          const oembed = await fetchYouTubeOembed(videoId);
          video = oembed;
        } else {
          video = {
            id,
            source: 'youtube',
            title: 'YouTube Video',
            thumbnailUrl: '',
            embedUrl: url,
            channelName: '',
            publishedAt: '',
            durationSeconds: 0,
          };
        }
      } else {
        video = {
          id,
          source,
          title: source === 'instagram' ? 'Instagram Video' : source === 'tiktok' ? 'TikTok Video' : 'Video',
          thumbnailUrl: '',
          embedUrl: url,
          channelName: '',
          publishedAt: '',
          durationSeconds: 0,
        };
      }

      const newPinned = [...pinned, video];
      setSaving(true);
      await savePinnedHighlights(playerId, newPinned, 'PlayersYouth');
      setUrlInput('');
      setActiveIndex(newPinned.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video');
    } finally {
      setAdding(false);
      setSaving(false);
    }
  }, [urlInput, pinned, playerId, t]);

  const handleRemove = useCallback(async (videoId: string) => {
    const newPinned = pinned.filter((v) => v.id !== videoId);
    setSaving(true);
    try {
      await savePinnedHighlights(playerId, newPinned, 'PlayersYouth');
      setActiveIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove video');
    } finally {
      setSaving(false);
    }
  }, [pinned, playerId]);

  return (
    <div
      className="rounded-xl bg-mgsr-card border border-mgsr-border overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ '--youth-cyan': '#06b6d4', '--youth-violet': '#8b5cf6' } as React.CSSProperties}
    >
      {/* ── Header ──────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-mgsr-dark/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="text-base font-display font-semibold text-mgsr-text">
              {t('highlights_title')}
            </h3>
            {!expanded && pinned.length > 0 && (
              <p className="text-xs text-mgsr-muted mt-0.5">
                {pinned.length} {pinned.length === 1 ? 'video' : 'videos'}
              </p>
            )}
          </div>
        </div>
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

      {/* ── Expanded content ────────────────────────────── */}
      {expanded && (
        <div className="border-t border-mgsr-border px-5 py-4 space-y-4">
          {/* ── URL input ───────────────────────────────── */}
          <div className="rounded-lg bg-mgsr-dark/40 border border-mgsr-border/50 p-3 space-y-2">
            <p className="text-xs font-medium text-mgsr-muted">{t('youth_highlights_add_video')}</p>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mgsr-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.916 0 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setError(null); }}
                  placeholder={t('youth_highlights_url_placeholder')}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-sm text-mgsr-text placeholder:text-mgsr-muted/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                  dir="ltr"
                  disabled={adding || saving}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={adding || saving || !urlInput.trim()}
                className="px-4 py-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-500/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
              >
                {adding ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                )}
                {t('youth_highlights_add')}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-[10px] text-mgsr-muted/40">{t('youth_highlights_supported_platforms')}</p>
          </div>

          {/* ── Pinned videos ───────────────────────────── */}
          {pinned.length > 0 && activeVideo ? (
            <>
              {/* Active video player */}
              <div className="relative aspect-video rounded-lg overflow-hidden bg-black shadow-xl shadow-black/30">
                {activeVideo.source === 'youtube' && activeVideo.thumbnailUrl ? (
                  <YouTubeLiteEmbed key={activeVideo.id} video={activeVideo} />
                ) : (
                  <a
                    href={activeVideo.embedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative block w-full h-full group"
                    aria-label={`Open: ${activeVideo.title}`}
                  >
                    {activeVideo.thumbnailUrl ? (
                      <img src={activeVideo.thumbnailUrl} alt={activeVideo.title} className="w-full h-full object-cover" />
                    ) : (
                      <PlaceholderThumb source={detectSource(activeVideo.embedUrl)} className="w-full h-full" />
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[var(--youth-cyan)]/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <svg className="w-7 h-7 md:w-8 md:h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </a>
                )}

                {/* Source badge */}
                <div className={`absolute top-3 left-3 ${sourceConfig[detectSource(activeVideo.embedUrl)].color} px-2.5 py-1 rounded-md`}>
                  <span className="text-white text-[10px] font-bold uppercase tracking-wider">
                    {sourceConfig[detectSource(activeVideo.embedUrl)].label}
                  </span>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemove(activeVideo.id)}
                  disabled={saving}
                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/60 hover:bg-red-500/80 transition-colors flex items-center justify-center disabled:opacity-50"
                  aria-label={t('youth_highlights_remove')}
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Active video meta */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-mgsr-text truncate">{activeVideo.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-mgsr-muted">
                    {activeVideo.channelName && <span>{activeVideo.channelName}</span>}
                    {activeVideo.viewCount != null && activeVideo.viewCount > 0 && (
                      <>
                        <span className="text-mgsr-muted/40">·</span>
                        <span>{formatViews(activeVideo.viewCount)} {t('highlights_views')}</span>
                      </>
                    )}
                  </div>
                </div>
                <a
                  href={activeVideo.source === 'youtube' ? `https://www.youtube.com/watch?v=${activeVideo.id}` : activeVideo.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-xs text-mgsr-muted hover:text-cyan-400 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z" />
                    <path d="M5 5v14h14v-7h2v7c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h7v2H5Z" />
                  </svg>
                  {sourceConfig[detectSource(activeVideo.embedUrl)].label}
                </a>
              </div>

              {/* Thumbnail strip */}
              {pinned.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-mgsr-border scrollbar-track-transparent">
                  {pinned.map((v, idx) => {
                    const src = detectSource(v.embedUrl);
                    const config = sourceConfig[src];
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={`flex-shrink-0 w-36 sm:w-40 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                          idx === activeIndex
                            ? 'border-cyan-400 shadow-lg shadow-cyan-500/20 scale-[1.02]'
                            : 'border-transparent hover:border-mgsr-border/60 opacity-75 hover:opacity-100'
                        }`}
                      >
                        <div className="relative aspect-video bg-mgsr-dark">
                          {v.thumbnailUrl ? (
                            <img src={v.thumbnailUrl} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <PlaceholderThumb source={src} className="w-full h-full text-xs [&>span:first-child]:text-lg" />
                          )}
                          {/* Source badge */}
                          <span className={`absolute top-1 left-1 ${config.color} text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider`}>
                            {config.label}
                          </span>
                          {idx === activeIndex && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="px-2 py-1.5 text-left bg-mgsr-card">
                          <p className="text-[11px] text-mgsr-text truncate leading-tight font-medium">{v.title}</p>
                          {v.channelName && (
                            <span className="text-[10px] text-mgsr-muted truncate block">{v.channelName}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* ── Empty state ───────────────────────────── */
            <div className="py-8 text-center space-y-2">
              <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-cyan-500/15 to-violet-500/15 flex items-center justify-center">
                <svg className="w-7 h-7 text-mgsr-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <p className="text-sm text-mgsr-muted">{t('youth_highlights_empty')}</p>
              <p className="text-xs text-mgsr-muted/60">{t('youth_highlights_empty_subtitle')}</p>
            </div>
          )}

          {/* Saving indicator */}
          {saving && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-mgsr-muted">{t('youth_highlights_saving')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
