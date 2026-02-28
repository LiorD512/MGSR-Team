/**
 * Client-side API for fetching player highlight videos.
 * Calls /api/highlights/search (Next.js API route) which proxies to YouTube + Scorebat.
 */

import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface HighlightVideo {
  id: string;
  source: 'youtube' | 'scorebat';
  title: string;
  thumbnailUrl: string;
  embedUrl: string;
  channelName: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount?: number;
}

export interface HighlightsResponse {
  playerName: string;
  videos: HighlightVideo[];
  cachedAt: number;
  sources: string[];
  error?: string;
}

/**
 * Fetch highlight videos for a player.
 * Results are cached server-side for 48h — safe to call on every page load.
 * @param parentClub - When player is on loan, the loaning club (for parent-club highlights)
 * @param nationality - For relevanceLanguage (e.g. "Spain" → es)
 * @param fullNameHe - Hebrew name for Israeli players
 * @param clubCountry - For league hint (e.g. "England" → Premier League)
 * @param signal - Optional AbortSignal to cancel the request
 */
export async function getPlayerHighlights(
  playerName: string,
  teamName?: string,
  position?: string,
  refresh?: boolean,
  parentClub?: string,
  signal?: AbortSignal,
  nationality?: string,
  fullNameHe?: string,
  clubCountry?: string,
): Promise<HighlightsResponse> {
  const params = new URLSearchParams({ playerName });
  if (teamName) params.set('teamName', teamName);
  if (position) params.set('position', position);
  if (parentClub) params.set('parentClub', parentClub);
  if (nationality) params.set('nationality', nationality);
  if (fullNameHe) params.set('fullNameHe', fullNameHe);
  if (clubCountry) params.set('clubCountry', clubCountry);
  if (refresh) params.set('refresh', '1');

  const res = await fetch(`/api/highlights/search?${params.toString()}`, {
    signal: signal ?? AbortSignal.timeout(30000),
    ...(refresh ? { cache: 'no-store' as RequestCache } : {}),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return {
      playerName,
      videos: [],
      cachedAt: 0,
      sources: [],
      error: (data as { error?: string }).error || `HTTP ${res.status}`,
    };
  }

  return res.json();
}

/** Format duration like "4:13" or "12:05" */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format view count like "1.2M" or "340K" */
export function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(views);
}

const MAX_PINNED = 2;

/** Save pinned highlights to Firestore (Players collection). Persists across devices. */
export async function savePinnedHighlights(playerId: string, videos: HighlightVideo[]): Promise<void> {
  const toSave = videos.slice(0, MAX_PINNED).map((v) => ({
    id: v.id,
    source: v.source,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    embedUrl: v.embedUrl,
    channelName: v.channelName,
    publishedAt: v.publishedAt,
    durationSeconds: v.durationSeconds,
    viewCount: v.viewCount,
  }));
  await updateDoc(doc(db, 'Players', playerId), { pinnedHighlights: toSave });
}

/** @deprecated Use player.pinnedHighlights from Firestore instead. Kept for fallback. */
export function getPinnedHighlights(playerId: string): HighlightVideo[] {
  return [];
}

/** Format "time ago" from a date string */
export function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // If it's already a relative string like "9 months ago", return it directly
    if (/\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i.test(dateStr)) {
      return dateStr;
    }
    return '';
  }
  const now = Date.now();
  const diffMs = now - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
