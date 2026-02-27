/**
 * /api/highlights/search — Player Highlights Video Search (Supernova)
 *
 * PRIMARY (when YOUTUBE_API_KEY set): YouTube Data API v3 with filters
 *   (videoDuration=medium, publishedAfter, topicId=football).
 * SCRAPING: youtube-sr → @distube/ytsr fallback (no quota).
 * FALLBACK: YouTube API when scraping fails.
 * BONUS: Scorebat for recent match highlights.
 *
 * Results are cached in Firestore for 48 hours.
 *
 * Query params:
 *   playerName  – full player name (required)
 *   teamName    – current club name (optional)
 *   position    – e.g. "ST", "LW" (optional)
 *   parentClub  – on-loan parent club (optional)
 *   nationality – for relevanceLanguage (optional)
 *   fullNameHe  – Hebrew name for Israeli players (optional)
 *   clubCountry – for league hint (optional)
 */
import { NextRequest, NextResponse } from 'next/server';
import YouTube from 'youtube-sr';
import ytsr from '@distube/ytsr';

export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface HighlightVideo {
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

interface CachedResult {
  playerName: string;
  videos: HighlightVideo[];
  cachedAt: number;
  sources: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Words in a video title that indicate it's NOT a highlight */
const TITLE_BLACKLIST = [
  'interview', 'press conference', 'reaction', 'news', 'transfer',
  'podcast', 'prediction', 'preview', 'debate', 'analysis show',
  'behind the scenes', 'training', 'arrival', 'medical', 'signing',
  'contract', 'unveiled', 'farewell', 'retirement', 'tabloid',
  'controversy', 'fight', 'red card compilation', 'funny', 'meme',
  'parody', 'fan cam', 'fancam', 'rant', 'angry',
  'vlog', 'daily', 'viral', 'tiktok', 'shorts',
  'fifa', 'pes', 'ea sports', 'career mode', 'ultimate team',
  'kid', 'child', 'youth',
];

/** Trusted football highlight channels get a quality boost */
const TRUSTED_CHANNELS = new Set([
  'premier league', 'laliga', 'bundesliga', 'serie a', 'ligue 1',
  'uefa champions league', 'uefa', 'fifa', 'bt sport', 'sky sports',
  'bein sports', 'espn fc', 'nbc sports', 'cbs sports golazo',
  'dazn', 'eredivisie', 'liga portugal', 'süper lig',
  'football daily', 'b/r football', 'goal', 'onefootball',
  'football highlights', 'magicalhighlights', 'sporza',
  'mls', 'liga mx', 'argentine primera', 'brasileirão',
]);

/** Exclude from YouTube search query to reduce junk results */
const QUERY_EXCLUSIONS = ' -interview -podcast -press -conference -reaction -news -transfer -fifa -pes';

/** Nationality/country → YouTube relevanceLanguage (ISO 639-1) */
const NATIONALITY_TO_LANG: Record<string, string> = {
  spain: 'es', argentina: 'es', mexico: 'es', chile: 'es', colombia: 'es',
  peru: 'es', uruguay: 'es', ecuador: 'es', venezuela: 'es', bolivia: 'es',
  brazil: 'pt', portugal: 'pt',
  france: 'fr', belgium: 'fr', switzerland: 'de',
  germany: 'de', austria: 'de',
  italy: 'it',
  egypt: 'ar', saudi: 'ar', 'saudi arabia': 'ar', uae: 'ar', 'united arab emirates': 'ar',
  morocco: 'ar', algeria: 'ar', tunisia: 'ar',
  israel: 'he',
  netherlands: 'nl', turkey: 'tr', russia: 'ru', japan: 'ja', korea: 'ko', 'south korea': 'ko',
};

/** Club country → league name for query */
const COUNTRY_TO_LEAGUE: Record<string, string> = {
  england: 'Premier League', spain: 'La Liga', germany: 'Bundesliga',
  italy: 'Serie A', france: 'Ligue 1', portugal: 'Liga Portugal',
  netherlands: 'Eredivisie', turkey: 'Süper Lig', belgium: 'Pro League',
  brazil: 'Brasileirão', argentina: 'Argentine Primera', mexico: 'Liga MX',
  usa: 'MLS', 'united states': 'MLS', scotland: 'Scottish Premiership', greece: 'Super League',
};

function appendExclusions(q: string): string {
  return q + QUERY_EXCLUSIONS;
}

function getRelevanceLanguage(nationality?: string): string | undefined {
  if (!nationality) return undefined;
  const key = nationality.toLowerCase().replace(/\s+/g, ' ').trim();
  return NATIONALITY_TO_LANG[key] || undefined;
}

function getLeagueFromCountry(clubCountry?: string): string | undefined {
  if (!clubCountry) return undefined;
  const key = clubCountry.toLowerCase().replace(/\s+/g, ' ').trim();
  return COUNTRY_TO_LEAGUE[key] || undefined;
}

/* ------------------------------------------------------------------ */
/*  Firestore admin (lightweight — reuse existing service account)    */
/* ------------------------------------------------------------------ */

let firestoreDb: FirebaseFirestore.Firestore | null = null;

async function getFirestoreAdmin() {
  if (firestoreDb) return firestoreDb;
  try {
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      if (serviceAccountJson) {
        const sa = JSON.parse(serviceAccountJson);
        admin.initializeApp({ credential: admin.credential.cert(sa) });
      } else if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        return null;
      }
    }
    firestoreDb = admin.firestore();
    return firestoreDb;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Cache helpers                                                     */
/* ------------------------------------------------------------------ */

function cacheKey(playerName: string, teamName?: string): string {
  const base = playerName
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  if (!teamName) return base;
  const team = teamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return team ? `${base}_${team}` : base;
}

async function getCachedHighlights(playerName: string, teamName?: string): Promise<CachedResult | null> {
  try {
    const db = await getFirestoreAdmin();
    if (!db) return null;
    const docRef = db.collection('PlayerHighlightsCache').doc(cacheKey(playerName, teamName));
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const data = snap.data() as CachedResult;
    if (Date.now() - data.cachedAt > CACHE_TTL_MS) return null; // expired
    return data;
  } catch {
    return null;
  }
}

async function setCachedHighlights(playerName: string, result: CachedResult, teamName?: string): Promise<void> {
  try {
    const db = await getFirestoreAdmin();
    if (!db) return;
    const docRef = db.collection('PlayerHighlightsCache').doc(cacheKey(playerName, teamName));
    await docRef.set(result);
  } catch {
    // silently ignore cache write failures
  }
}

/* ------------------------------------------------------------------ */
/*  Duration parser: youtube-sr may return ms (number) or "M:SS" string */
/* ------------------------------------------------------------------ */
function parseYoutubeSrDuration(duration: unknown): number {
  if (duration == null) return 0;
  if (typeof duration === 'number') {
    // Assume milliseconds if > 100 (e.g. 253000 for 4:13)
    if (duration > 100) return Math.round(duration / 1000);
    // Could be seconds if small number
    return Math.round(duration);
  }
  if (typeof duration === 'string') {
    // Parse "M:SS" or "H:MM:SS" or "S"
    const parts = duration.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  ISO 8601 Duration parser (PT4M13S → seconds)                     */
/* ------------------------------------------------------------------ */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
}

/* ------------------------------------------------------------------ */
/*  Relative date parser (youtube-sr returns "9 months ago" etc.)     */
/* ------------------------------------------------------------------ */
/**
 * youtube-sr returns uploadedAt as a relative string like "2 weeks ago",
 * "9 months ago", "1 year ago" — NOT an ISO date.
 * This converts it to an approximate ISO date string.
 * If the input is already ISO-like, returns it as-is.
 */
function parseRelativeDate(raw: string | undefined | null): string {
  if (!raw) return '';
  // If it already looks like an ISO date (starts with 4 digits), return as-is
  if (/^\d{4}-/.test(raw)) return raw;
  // if it's a valid Date already, return ISO
  const directParse = new Date(raw);
  if (!isNaN(directParse.getTime()) && raw.length > 8) return directParse.toISOString();

  // Parse relative strings like "2 weeks ago", "9 months ago", "1 year ago"
  const match = raw.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (!match) {
    // Handle "Streamed X ago" pattern
    const streamed = raw.match(/streamed\s+(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
    if (!streamed) return '';
    return computeDateFromRelative(parseInt(streamed[1]), streamed[2].toLowerCase());
  }
  return computeDateFromRelative(parseInt(match[1]), match[2].toLowerCase());
}

function computeDateFromRelative(amount: number, unit: string): string {
  const now = new Date();
  switch (unit) {
    case 'second': now.setSeconds(now.getSeconds() - amount); break;
    case 'minute': now.setMinutes(now.getMinutes() - amount); break;
    case 'hour': now.setHours(now.getHours() - amount); break;
    case 'day': now.setDate(now.getDate() - amount); break;
    case 'week': now.setDate(now.getDate() - amount * 7); break;
    case 'month': now.setMonth(now.getMonth() - amount); break;
    case 'year': now.setFullYear(now.getFullYear() - amount); break;
  }
  return now.toISOString();
}

/* ------------------------------------------------------------------ */
/*  youtube-sr — PRIMARY search (no API key, no quota, unlimited)    */
/*                                                                    */
/*  Scrapes YouTube search results directly. Works for any player.    */
/*  Falls back to YouTube Data API v3 only if youtube-sr fails.       */
/* ------------------------------------------------------------------ */

const MIN_ACCEPTABLE_RESULTS = 2;
const TARGET_RESULTS = 6;

/**
 * Search YouTube using youtube-sr (scraping, no API key needed).
 * Returns raw HighlightVideo[] from a single query.
 * Has a 12s timeout to prevent hanging, retries with modified query on error.
 */
async function youtubeSrSearch(query: string): Promise<HighlightVideo[]> {
  const attempts = [appendExclusions(query), appendExclusions(`${query} 2024`)];
  
  for (const q of attempts) {
    try {
      // Race against a 12s timeout to prevent hanging
      const result = await Promise.race([
        YouTube.search(q, { limit: 15, type: 'video' }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('youtube-sr timeout')), 12000)
        ),
      ]);
      
      if (!result || (result as unknown[]).length === 0) continue;
      const videos = result as Array<{
        id?: string;
        title?: string;
        thumbnail?: { url?: string };
        channel?: { name?: string };
        uploadedAt?: string;
        duration?: number;
        views?: number;
      }>;
      
      return videos
        .filter(v => v.id && v.title)
        .map(v => ({
          id: v.id!,
          source: 'youtube' as const,
          title: v.title || '',
          thumbnailUrl: v.thumbnail?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${v.id}`,
          channelName: v.channel?.name || '',
          publishedAt: parseRelativeDate(v.uploadedAt),
          durationSeconds: parseYoutubeSrDuration(v.duration),
          viewCount: v.views || 0,
        }));
    } catch (err) {
      console.warn(`youtube-sr failed for "${q}":`, err instanceof Error ? err.message : err);
      // Try next query variant
    }
  }
  return [];
}

/**
 * Run scraper: youtube-sr first, then @distube/ytsr on empty.
 */
async function scraperSearch(query: string, hl?: string): Promise<HighlightVideo[]> {
  let raw = await youtubeSrSearch(query);
  if (raw.length === 0) {
    raw = await ytsrSearch(query, hl);
  }
  return raw;
}

/**
 * Fallback scraper: @distube/ytsr when youtube-sr fails.
 */
async function ytsrSearch(query: string, hl?: string): Promise<HighlightVideo[]> {
  try {
    const result = await Promise.race([
      ytsr(appendExclusions(query), {
        type: 'video',
        limit: 15,
        safeSearch: false,
        hl: hl || 'en',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ytsr timeout')), 12000)
      ),
    ]);
    const items = (result as { items?: Array<{ id?: string; name?: string; thumbnail?: string; views?: number; duration?: string; author?: { name?: string } }> }).items || [];
    return items
      .filter((v) => v.id && v.name)
      .map((v) => ({
        id: v.id!,
        source: 'youtube' as const,
        title: v.name || '',
        thumbnailUrl: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        embedUrl: `https://www.youtube.com/embed/${v.id}`,
        channelName: v.author?.name || '',
        publishedAt: '',
        durationSeconds: parseYoutubeSrDuration(v.duration),
        viewCount: v.views || 0,
      }));
  } catch (err) {
    console.warn('ytsr failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * YouTube Data API v3 — PRIMARY when key is set (uses filters).
 * videoDuration=medium (4-20 min), publishedAfter (2y), topicId=football.
 */
async function youtubeApiPrimary(
  query: string,
  relevanceLanguage?: string,
): Promise<HighlightVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  const publishedAfter = new Date();
  publishedAfter.setFullYear(publishedAfter.getFullYear() - 2);
  const publishedAfterStr = publishedAfter.toISOString();

  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: 'snippet',
    type: 'video',
    q: appendExclusions(query),
    order: 'relevance',
    maxResults: '15',
    safeSearch: 'none',
    videoEmbeddable: 'true',
    videoDuration: 'medium',
    publishedAfter: publishedAfterStr,
    topicId: '/m/02vx4', // Football
  });
  if (relevanceLanguage) params.set('relevanceLanguage', relevanceLanguage);

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return [];

    const videoIds = items.map((it: { id: { videoId: string } }) => it.id.videoId).join(',');
    const detailParams = new URLSearchParams({
      key: YOUTUBE_API_KEY,
      part: 'contentDetails,statistics',
      id: videoIds,
    });
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${detailParams.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const detailData = detailRes.ok ? await detailRes.json() : { items: [] };
    const detailMap = new Map<string, { duration: number; views: number }>();
    for (const d of detailData.items || []) {
      detailMap.set(d.id, {
        duration: parseDuration(d.contentDetails?.duration || ''),
        views: parseInt(d.statistics?.viewCount || '0', 10),
      });
    }

    return items.map((item: {
      id: { videoId: string };
      snippet: {
        title?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: { high?: { url?: string }; medium?: { url?: string }; default?: { url?: string } };
      };
    }) => {
      const videoId = item.id.videoId;
      const detail = detailMap.get(videoId);
      return {
        id: videoId,
        source: 'youtube' as const,
        title: item.snippet?.title || '',
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url || '',
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        channelName: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || '',
        durationSeconds: detail?.duration || 0,
        viewCount: detail?.views || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Fallback: YouTube Data API v3 search (no filters, when primary fails).
 */
async function youtubeApiFallback(
  query: string,
): Promise<HighlightVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  try {
    const searchParams = new URLSearchParams({
      key: YOUTUBE_API_KEY,
      part: 'snippet',
      type: 'video',
      q: appendExclusions(query),
      order: 'relevance',
      maxResults: '10',
      safeSearch: 'none',
      videoEmbeddable: 'true',
    });

    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return [];

    // Fetch video details (duration, views)
    const videoIds = items.map((it: { id: { videoId: string } }) => it.id.videoId).join(',');
    const detailParams = new URLSearchParams({
      key: YOUTUBE_API_KEY,
      part: 'contentDetails,statistics',
      id: videoIds,
    });
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${detailParams.toString()}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const detailData = detailRes.ok ? await detailRes.json() : { items: [] };
    const detailMap = new Map<string, { duration: number; views: number }>();
    for (const d of detailData.items || []) {
      detailMap.set(d.id, {
        duration: parseDuration(d.contentDetails?.duration || ''),
        views: parseInt(d.statistics?.viewCount || '0', 10),
      });
    }

    return items.map((item: {
      id: { videoId: string };
      snippet: {
        title?: string;
        channelTitle?: string;
        publishedAt?: string;
        thumbnails?: {
          high?: { url?: string };
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
    }) => {
      const videoId = item.id.videoId;
      const detail = detailMap.get(videoId);
      return {
        id: videoId,
        source: 'youtube' as const,
        title: item.snippet?.title || '',
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url || '',
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        channelName: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || '',
        durationSeconds: detail?.duration || 0,
        viewCount: detail?.views || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Strip diacritics/accents for fuzzy name matching.
 * "Gaël" → "gael", "André" → "andre", "Müller" → "muller"
 */
function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Filter raw YouTube results to only keep relevant highlight videos.
 * Separated from search so we can reuse across tiers.
 *
 * For multi-word names (e.g. "Santiago González"), requires at least 2
 * name parts to match in the title — OR — the team name to appear.
 * This prevents false positives like "Kevin González" or "Martin González"
 * when searching for "Santiago González".
 */
function filterHighlightVideos(
  videos: HighlightVideo[],
  playerName: string,
  teamName?: string,
  minDuration = 45, // allow slightly shorter clips for lesser-known players
  maxDuration = 2700, // 45 min
): HighlightVideo[] {
  const playerNorm = stripAccents(playerName);
  const nameParts = playerNorm.split(/\s+/).filter(p => p.length >= 2);
  // For name matching, prefer last name (usually longer and more unique)
  const significantParts = nameParts.filter(p => p.length >= 3);

  // Team name for disambiguation
  const teamNorm = teamName ? stripAccents(teamName).replace(/^fc\s+|\s+fc$/g, '').trim() : '';
  const teamParts = teamNorm ? teamNorm.split(/\s+/).filter(p => p.length >= 3) : [];

  return videos.filter(v => {
    const titleNorm = stripAccents(v.title);
    const channelNorm = stripAccents(v.channelName);

    // Skip blacklisted content
    if (TITLE_BLACKLIST.some(bw => titleNorm.includes(bw))) return false;

    // Player name relevance check — accent-stripped comparison
    // Count how many significant name parts appear in the title
    const matchedParts = significantParts.filter(part => titleNorm.includes(part));
    const matchedCount = matchedParts.length;

    // For multi-word names (2+ significant parts), require stronger matching
    // to avoid false positives with common last names (González, Silva, etc.)
    if (significantParts.length >= 2) {
      if (matchedCount >= 2) {
        // Strong match — 2+ name parts found in title → allow
      } else if (matchedCount === 1) {
        // Only 1 part matched — could be wrong person (e.g. "Kevin González")
        // Allow ONLY if team name also appears in title or channel
        const teamInTitle = teamNorm && (
          titleNorm.includes(teamNorm) ||
          channelNorm.includes(teamNorm) ||
          teamParts.some(tp => titleNorm.includes(tp) || channelNorm.includes(tp))
        );
        if (!teamInTitle) return false;
      } else {
        // 0 parts matched → definitely not this player
        return false;
      }
    } else {
      // Single-word name (e.g. "Neymar", "Pelé") — 1 match is fine
      const nameInTitle = significantParts.length > 0
        ? significantParts.some(part => titleNorm.includes(part))
        : nameParts.some(part => titleNorm.includes(part));
      if (!nameInTitle) return false;
    }

    // Duration check — allow 45s-45min (much more lenient than before)
    if (v.durationSeconds < minDuration || v.durationSeconds > maxDuration) return false;

    return true;
  });
}

/**
 * Score and sort videos by quality/relevance.
 */
function scoreAndSort(videos: HighlightVideo[], playerName: string, teamName?: string): HighlightVideo[] {
  const playerNorm = stripAccents(playerName);
  const nameParts = playerNorm.split(/\s+/).filter(p => p.length >= 2);
  const teamNorm = teamName ? stripAccents(teamName) : '';
  // Also create team word parts for partial matching (e.g. "atletico" from "Atletico Madrid")
  const teamParts = teamNorm ? teamNorm.split(/\s+/).filter(p => p.length >= 3) : [];

  return [...videos].sort((a, b) => {
    let scoreA = 0, scoreB = 0;

    const titleA = stripAccents(a.title);
    const titleB = stripAccents(b.title);
    const channelA = stripAccents(a.channelName);
    const channelB = stripAccents(b.channelName);

    // Team name match — STRONGEST signal for disambiguation
    // (e.g. "Santiago González Sporting Cristal" vs generic "Santiago Gonzalez")
    // Bumped to 120 to ensure team-specific videos always rank above generic ones
    if (teamNorm) {
      const teamInA = titleA.includes(teamNorm) || channelA.includes(teamNorm) ||
        teamParts.some(tp => titleA.includes(tp));
      const teamInB = titleB.includes(teamNorm) || channelB.includes(teamNorm) ||
        teamParts.some(tp => titleB.includes(tp));
      if (teamInA) scoreA += 120;
      if (teamInB) scoreB += 120;
    }

    // Penalty for college / amateur / unrelated context
    const collegePenalty = ['njcaa', 'naia', 'ncaa', 'college soccer', 'community college',
      'junior college', ' cc ', ' juco ', 'high school', 'd1 ', 'd2 ', 'd3 ',
      'division i', 'division ii', 'division iii', 'all-american',
      'recruitment', 'recruiting', 'commit'];
    for (const cp of collegePenalty) {
      if (titleA.includes(cp) || channelA.includes(cp)) { scoreA -= 60; break; }
    }
    for (const cp of collegePenalty) {
      if (titleB.includes(cp) || channelB.includes(cp)) { scoreB -= 60; break; }
    }

    // Trusted channel bonus
    if (TRUSTED_CHANNELS.has((a.channelName || '').toLowerCase())) scoreA += 50;
    if (TRUSTED_CHANNELS.has((b.channelName || '').toLowerCase())) scoreB += 50;

    // Title contains "highlight" — strong signal (EN + ES/PT)
    if (titleA.includes('highlight') || titleA.includes('jugadas') || titleA.includes('melhores')) scoreA += 30;
    if (titleB.includes('highlight') || titleB.includes('jugadas') || titleB.includes('melhores')) scoreB += 30;

    // Title contains relevant keywords (EN + ES/PT + FR + DE + IT + AR)
    const goodWords = [
      'goals', 'skills', 'assists', 'best', 'compilation', 'amazing', 'magic',
      'goles', 'gol', 'golazo', 'jugadas', 'asistencias', 'resumen', 'compacto',
      'mejores', 'crack', 'destaques', 'lances',
      'buts', 'meilleurs moments', 'résumé', 'resume',
      'tore', 'best of',
      'migliori', 'miglior',
      'أهداف', 'تسجيلات',
    ];
    for (const w of goodWords) {
      if (titleA.includes(w)) scoreA += 10;
      if (titleB.includes(w)) scoreB += 10;
    }

    // Full name match in title (better relevance)
    const fullNameParts = nameParts.filter(p => titleA.includes(p));
    const fullNamePartsB = nameParts.filter(p => titleB.includes(p));
    scoreA += fullNameParts.length * 15;
    scoreB += fullNamePartsB.length * 15;

    // Ideal duration range (3-15 min) gets a bonus
    if (a.durationSeconds >= 180 && a.durationSeconds <= 900) scoreA += 20;
    if (b.durationSeconds >= 180 && b.durationSeconds <= 900) scoreB += 20;

    // View count bonus (log scale)
    scoreA += Math.min(30, Math.log10(Math.max(1, a.viewCount || 0)) * 5);
    scoreB += Math.min(30, Math.log10(Math.max(1, b.viewCount || 0)) * 5);

    // Recency bonus (newer = better, but don't penalize older too much)
    const ageA = Date.now() - new Date(a.publishedAt).getTime();
    const ageB = Date.now() - new Date(b.publishedAt).getTime();
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    if (!isNaN(ageA)) {
      if (ageA < yearMs) scoreA += 15;
      else if (ageA < 2 * yearMs) scoreA += 10;
      else if (ageA < 3 * yearMs) scoreA += 5;
    }
    if (!isNaN(ageB)) {
      if (ageB < yearMs) scoreB += 15;
      else if (ageB < 2 * yearMs) scoreB += 10;
      else if (ageB < 3 * yearMs) scoreB += 5;
    }

    return scoreB - scoreA;
  });
}

/**
 * Deduplicate videos by YouTube video ID.
 */
function dedupeVideos(videos: HighlightVideo[]): HighlightVideo[] {
  const seen = new Set<string>();
  return videos.filter(v => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}

/**
 * Multi-tier YouTube search using youtube-sr (no quota limits!).
 *
 * Tiers are split into two phases:
 *   Phase A (team-specific) — always run all of these, never stop early.
 *     Includes English AND Spanish/Portuguese keywords for international coverage.
 *   Phase B (broad) — stop once we have enough results.
 *
 * When team is known:
 *   A1: "name team highlights position"
 *   A2: "name team highlights"
 *   A3: "name team goles jugadas"           ← Spanish (Latin America, Spain)
 *   B1: "name highlights position"
 *   B2: "name highlights"
 *   B3: "name goals"
 *   B4: "name"                              ← catches agent reels, recent uploads
 *
 * When team unknown:
 *   B1: "name highlights position"
 *   B2: "name highlights"
 *   B3: "name goals"
 *   B4: "name"
 *
 * If youtube-sr fails entirely on all tiers, falls back to YouTube Data API.
 * Each tier is FREE — no API key needed, no quota consumed.
 */
const CURRENT_YEAR = new Date().getFullYear();
const PREV_YEAR = CURRENT_YEAR - 1;

async function searchYouTube(
  playerName: string,
  position?: string,
  teamName?: string,
  parentClub?: string,
  nationality?: string,
  fullNameHe?: string,
  clubCountry?: string,
): Promise<HighlightVideo[]> {
  const posLabel = position === 'GK' ? 'saves' : 'goals skills';
  const relLang = getRelevanceLanguage(nationality);
  const hl = relLang || 'en';
  const league = getLeagueFromCountry(clubCountry);

  // Name variants: last name (for distinctive names), fullNameHe for Israeli
  const nameParts = playerName.trim().split(/\s+/).filter(Boolean);
  const lastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : null;
  const isDistinctiveLastName = lastName && lastName.length >= 4 && !['silva', 'santos', 'oliveira', 'gonzalez', 'rodriguez', 'martinez', 'fernandez'].includes(lastName.toLowerCase());

  const cleanTeam = teamName
    ? teamName.replace(/^fc\s+|\s+fc$/gi, '').trim()
    : '';
  const cleanParentClub = parentClub
    ? parentClub.replace(/^fc\s+|\s+fc$/gi, '').trim()
    : '';
  const filterTeam = [cleanTeam, cleanParentClub].filter(Boolean).join(' ') || undefined;

  const teamTiers: Array<{ query: string; label: string }> = cleanTeam ? [
    { label: 'A1: team + position', query: `${playerName} ${cleanTeam} highlights ${posLabel}` },
    { label: 'A2: team', query: `${playerName} ${cleanTeam} highlights` },
    { label: 'A3: team (ES)', query: `${playerName} ${cleanTeam} goles jugadas` },
    { label: 'A4: team + year', query: `${playerName} ${cleanTeam} highlights ${CURRENT_YEAR}` },
  ] : [];

  if (league) {
    teamTiers.push({ label: 'A5: league', query: `${playerName} ${league} highlights` });
  }
  if (cleanParentClub && cleanParentClub !== cleanTeam) {
    teamTiers.push({ label: 'A6: parent club', query: `${playerName} ${cleanParentClub} highlights ${posLabel}` });
  }

  const broadTiers: Array<{ query: string; label: string }> = [
    { label: 'B1: highlights + position', query: `${playerName} highlights ${posLabel}` },
    { label: 'B2: highlights', query: `${playerName} highlights` },
    { label: 'B3: highlights + year', query: `${playerName} highlights ${PREV_YEAR}` },
    { label: 'B4: goals', query: `${playerName} goals` },
    { label: 'B5: name only', query: playerName },
  ];

  if (isDistinctiveLastName && lastName) {
    broadTiers.push({ label: 'B6: lastName + team', query: `${lastName} ${cleanTeam || ''} highlights`.trim() });
  }
  if (fullNameHe && fullNameHe.trim()) {
    broadTiers.push({ label: 'B7: fullNameHe', query: `${fullNameHe.trim()} highlights` });
  }

  let allResults: HighlightVideo[] = [];
  let scraperWorked = false;

  // --- Try YouTube API first when key is set (best quality with filters) ---
  if (YOUTUBE_API_KEY) {
    const apiQueries = [
      cleanTeam ? `${playerName} ${cleanTeam} highlights ${posLabel}` : `${playerName} highlights ${posLabel}`,
      `${playerName} highlights`,
    ];
    for (const q of apiQueries) {
      const raw = await youtubeApiPrimary(q, relLang);
      if (raw.length > 0) {
        const filtered = filterHighlightVideos(raw, playerName, filterTeam);
        allResults = dedupeVideos([...allResults, ...filtered]);
        if (allResults.length >= TARGET_RESULTS) break;
      }
    }
  }

  // --- Phase A: team-specific tiers (scraper) ---
  for (const tier of teamTiers) {
    if (allResults.length >= TARGET_RESULTS) break;
    try {
      const raw = await scraperSearch(tier.query, hl);
      if (raw.length > 0) scraperWorked = true;
      const filtered = filterHighlightVideos(raw, playerName, filterTeam);
      allResults = dedupeVideos([...allResults, ...filtered]);
    } catch (err) {
      console.error(`[highlights] ${tier.label} error:`, err);
    }
  }

  // --- Phase B: broader tiers — stop when enough, skip if we have MIN_ACCEPTABLE_RESULTS from Phase A ---
  for (const tier of broadTiers) {
    if (allResults.length >= TARGET_RESULTS) break;
    try {
      const raw = await scraperSearch(tier.query, hl);
      if (raw.length > 0) scraperWorked = true;
      const filtered = filterHighlightVideos(raw, playerName, filterTeam);
      allResults = dedupeVideos([...allResults, ...filtered]);
    } catch (err) {
      console.error(`[highlights] ${tier.label} error:`, err);
    }
  }

  // --- Fallback: YouTube API when scraper returned < MIN_ACCEPTABLE_RESULTS ---
  if (allResults.length < MIN_ACCEPTABLE_RESULTS && YOUTUBE_API_KEY) {
    console.log('[highlights] Scraper returned < 2 results, falling back to YouTube API');
    const fallbackQueries = [
      cleanTeam ? `${playerName} ${cleanTeam} highlights ${posLabel}` : `${playerName} highlights ${posLabel}`,
      `${playerName} highlights`,
      cleanParentClub ? `${playerName} ${cleanParentClub} highlights` : null,
    ].filter(Boolean) as string[];
    for (const fallbackQuery of fallbackQueries) {
      try {
        const raw = await youtubeApiFallback(fallbackQuery);
        if (raw.length > 0) {
          const filtered = filterHighlightVideos(raw, playerName, filterTeam);
          allResults = dedupeVideos([...allResults, ...filtered]);
          break;
        }
      } catch (err) {
        console.error('[highlights] YouTube API fallback failed:', fallbackQuery, err);
      }
    }
  }

  const sorted = scoreAndSort(allResults, playerName, filterTeam);
  return sorted.slice(0, TARGET_RESULTS);
}

/* ------------------------------------------------------------------ */
/*  Scorebat API                                                      */
/* ------------------------------------------------------------------ */

async function searchScorebat(teamName: string): Promise<HighlightVideo[]> {
  if (!teamName) return [];

  try {
    const res = await fetch('https://www.scorebat.com/video-api/v3/', {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const matches = (data.response || data) as Array<{
      title?: string;
      thumbnail?: string;
      date?: string;
      matchviewUrl?: string;
      videos?: Array<{ id?: string; title?: string; embed?: string }>;
    }>;

    // Normalize team name for matching
    const teamLower = teamName.toLowerCase()
      .replace(/^fc\s+|\s+fc$/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Also try common abbreviations
    const teamParts = teamLower.split(' ');

    const results: HighlightVideo[] = [];

    for (const match of matches) {
      const matchTitle = (match.title || '').toLowerCase();
      // Check if team is in this match
      const teamMatch = matchTitle.includes(teamLower) ||
        (teamParts.length > 1 && teamParts.some(p => p.length >= 4 && matchTitle.includes(p)));
      if (!teamMatch) continue;

      // Get the highlights video (not individual goal clips)
      const highlightVid = (match.videos || []).find(v =>
        (v.title || '').toLowerCase().includes('highlight')
      ) || (match.videos || [])[0];

      if (!highlightVid?.embed) continue;

      // Extract embed URL from iframe HTML
      const srcMatch = highlightVid.embed.match(/src=['"](https?:\/\/[^'"]+)['"]/);
      const embedUrl = srcMatch ? srcMatch[1] : '';
      if (!embedUrl) continue;

      results.push({
        id: highlightVid.id || `sb_${Date.now()}_${results.length}`,
        source: 'scorebat',
        title: match.title || 'Match Highlights',
        thumbnailUrl: match.thumbnail || '',
        embedUrl,
        channelName: 'Scorebat',
        publishedAt: match.date || '',
        durationSeconds: 300, // Typically 3-8 min, estimate 5min
      });
    }

    return results.slice(0, 4);
  } catch (err) {
    console.error('Scorebat error:', err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                      */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const playerName = searchParams.get('playerName')?.trim();
    const teamName = searchParams.get('teamName')?.trim() || '';
    const position = searchParams.get('position')?.trim() || '';
    const parentClub = searchParams.get('parentClub')?.trim() || '';
    const nationality = searchParams.get('nationality')?.trim() || '';
    const fullNameHe = searchParams.get('fullNameHe')?.trim() || '';
    const clubCountry = searchParams.get('clubCountry')?.trim() || '';
    const forceRefresh = searchParams.get('refresh') === '1';

    if (!playerName) {
      return NextResponse.json(
        { error: 'playerName is required', videos: [] },
        { status: 400 }
      );
    }

    const cleanTeam = teamName.replace(/^fc\s+|\s+fc$/gi, '').trim();

    // 1. Check cache (skip if forceRefresh)
    if (!forceRefresh) {
      const cached = await getCachedHighlights(playerName, cleanTeam || undefined);
      if (cached && cached.videos.length > 0) {
        return NextResponse.json(cached, {
          headers: { 'Cache-Control': 'private, max-age=3600' },
        });
      }
    } else {
      console.log(`[highlights] Force refresh for: ${playerName}`);
    }

    // 2. Fetch from both sources in parallel
    const [youtubeVideos, scorebatVideos] = await Promise.all([
      searchYouTube(
        playerName,
        position || undefined,
        teamName || undefined,
        parentClub || undefined,
        nationality || undefined,
        fullNameHe || undefined,
        clubCountry || undefined,
      ),
      searchScorebat(teamName),
    ]);

    const sources: string[] = [];
    if (youtubeVideos.length > 0) sources.push('youtube');
    if (scorebatVideos.length > 0) sources.push('scorebat');

    // Combine: YouTube first (player-specific), then Scorebat (team match highlights)
    const allVideos = [...youtubeVideos, ...scorebatVideos];

    const result: CachedResult = {
      playerName,
      videos: allVideos,
      cachedAt: Date.now(),
      sources,
    };

    // 3. Cache results
    // Cache empty results for only 4 hours (retry sooner in case youtube-sr had a hiccup)
    // Cache non-empty results for 48 hours
    if (allVideos.length === 0) {
      result.cachedAt = Date.now() - CACHE_TTL_MS + (4 * 60 * 60 * 1000); // expire in 4h
    }
    await setCachedHighlights(playerName, result, cleanTeam || undefined);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': forceRefresh
          ? 'no-store, no-cache, must-revalidate'
          : 'private, max-age=3600',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Highlights search failed';
    console.error('Highlights API error:', msg, err);
    return NextResponse.json({ error: msg, videos: [] }, { status: 500 });
  }
}
