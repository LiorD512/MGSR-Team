/**
 * /api/highlights/search — Player Highlights Video Search
 *
 * PRIMARY: Uses youtube-sr (scrapes YouTube, no API key, no quota limits).
 * FALLBACK: YouTube Data API v3 when youtube-sr fails (quota-limited).
 * BONUS: Scorebat for recent match highlights (top leagues only).
 *
 * Results are cached in Firestore for 48 hours.
 *
 * Query params:
 *   playerName  – full player name (required)
 *   teamName    – current club name (optional, improves Scorebat matching)
 *   position    – e.g. "ST", "LW" (optional, improves query)
 */
import { NextRequest, NextResponse } from 'next/server';
import YouTube from 'youtube-sr';

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
];

/** Trusted football highlight channels get a quality boost */
const TRUSTED_CHANNELS = new Set([
  'premier league', 'laliga', 'bundesliga', 'serie a', 'ligue 1',
  'uefa champions league', 'uefa', 'fifa', 'bt sport', 'sky sports',
  'bein sports', 'espn fc', 'nbc sports', 'cbs sports golazo',
  'dazn', 'eredivisie', 'liga portugal', 'süper lig',
  'football daily', 'b/r football', 'goal', 'onefootball',
  'football highlights', 'magicalhighlights', 'sporza',
]);

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

function cacheKey(playerName: string): string {
  return playerName
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 100);
}

async function getCachedHighlights(playerName: string): Promise<CachedResult | null> {
  try {
    const db = await getFirestoreAdmin();
    if (!db) return null;
    const docRef = db.collection('PlayerHighlightsCache').doc(cacheKey(playerName));
    const snap = await docRef.get();
    if (!snap.exists) return null;
    const data = snap.data() as CachedResult;
    if (Date.now() - data.cachedAt > CACHE_TTL_MS) return null; // expired
    return data;
  } catch {
    return null;
  }
}

async function setCachedHighlights(playerName: string, result: CachedResult): Promise<void> {
  try {
    const db = await getFirestoreAdmin();
    if (!db) return;
    const docRef = db.collection('PlayerHighlightsCache').doc(cacheKey(playerName));
    await docRef.set(result);
  } catch {
    // silently ignore cache write failures
  }
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
  const attempts = [query, `${query} 2024`];
  
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
          publishedAt: v.uploadedAt || '',
          durationSeconds: Math.round((v.duration || 0) / 1000),
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
 * Fallback: YouTube Data API v3 search (quota-limited, 100 searches/day).
 * Only used when youtube-sr fails entirely.
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
      q: query,
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
 */
function filterHighlightVideos(
  videos: HighlightVideo[],
  playerName: string,
  minDuration = 45, // allow slightly shorter clips for lesser-known players
  maxDuration = 2700, // 45 min
): HighlightVideo[] {
  const playerNorm = stripAccents(playerName);
  const nameParts = playerNorm.split(/\s+/).filter(p => p.length >= 2);
  // For name matching, prefer last name (usually longer and more unique)
  const significantParts = nameParts.filter(p => p.length >= 3);

  return videos.filter(v => {
    const titleNorm = stripAccents(v.title);

    // Skip blacklisted content
    if (TITLE_BLACKLIST.some(bw => titleNorm.includes(bw))) return false;

    // Player name relevance check — at least one significant name part must appear
    // Uses accent-stripped comparison so "Gaël" matches "Gael", "André" matches "Andre"
    const nameInTitle = significantParts.length > 0
      ? significantParts.some(part => titleNorm.includes(part))
      : nameParts.some(part => titleNorm.includes(part));
    if (!nameInTitle) return false;

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
    // (e.g. "Santiago González Atlas" vs generic "Santiago Gonzalez")
    if (teamNorm) {
      const teamInA = titleA.includes(teamNorm) || channelA.includes(teamNorm) ||
        teamParts.some(tp => titleA.includes(tp));
      const teamInB = titleB.includes(teamNorm) || channelB.includes(teamNorm) ||
        teamParts.some(tp => titleB.includes(tp));
      if (teamInA) scoreA += 80;
      if (teamInB) scoreB += 80;
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
    if (TRUSTED_CHANNELS.has(a.channelName.toLowerCase())) scoreA += 50;
    if (TRUSTED_CHANNELS.has(b.channelName.toLowerCase())) scoreB += 50;

    // Title contains "highlight" — strong signal
    if (titleA.includes('highlight')) scoreA += 30;
    if (titleB.includes('highlight')) scoreB += 30;

    // Title contains relevant keywords
    const goodWords = ['goals', 'skills', 'assists', 'best', 'compilation', 'amazing', 'magic'];
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
    if (ageA < yearMs) scoreA += 15;
    else if (ageA < 2 * yearMs) scoreA += 10;
    else if (ageA < 3 * yearMs) scoreA += 5;
    if (ageB < yearMs) scoreB += 15;
    else if (ageB < 2 * yearMs) scoreB += 10;
    else if (ageB < 3 * yearMs) scoreB += 5;

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
 * When team is known (most cases):
 *   Tier 1: "name team highlights position"  (most specific)
 *   Tier 2: "name team highlights"           (with team)
 *   Tier 3: "name highlights position"       (without team)
 *   Tier 4: "name highlights"                (broader)
 *   Tier 5: "name goals"                     (last resort)
 *
 * When team unknown:
 *   Tier 1: "name highlights position"
 *   Tier 2: "name highlights"
 *   Tier 3: "name goals"
 *
 * If youtube-sr fails entirely on all tiers, falls back to YouTube Data API.
 * Each tier is FREE — no API key needed, no quota consumed.
 */
async function searchYouTube(
  playerName: string,
  position?: string,
  teamName?: string,
): Promise<HighlightVideo[]> {
  const posLabel = position === 'GK' ? 'saves' : 'goals skills';

  // Clean team name for queries (strip FC prefix/suffix)
  const cleanTeam = teamName
    ? teamName.replace(/^fc\s+|\s+fc$/gi, '').trim()
    : '';

  // Define search tiers — ordered from most specific to broadest
  // When team is known, search with team FIRST to avoid false positives
  // (e.g. "Santiago González" is common — "Santiago González Atlas" is specific)
  const tiers: Array<{ query: string; label: string }> = [
    ...(cleanTeam ? [{
      label: 'Tier 1: with team + position',
      query: `${playerName} ${cleanTeam} highlights ${posLabel}`,
    }] : []),
    ...(cleanTeam ? [{
      label: 'Tier 2: with team',
      query: `${playerName} ${cleanTeam} highlights`,
    }] : []),
    {
      label: 'Tier 3: highlights + position',
      query: `${playerName} highlights ${posLabel}`,
    },
    {
      label: 'Tier 4: broad highlights',
      query: `${playerName} highlights`,
    },
    {
      label: 'Tier 5: goals only',
      query: `${playerName} goals`,
    },
  ];

  let allResults: HighlightVideo[] = [];
  let youtubeSrWorked = false;

  for (const tier of tiers) {
    try {
      const raw = await youtubeSrSearch(tier.query);
      if (raw.length > 0) youtubeSrWorked = true;
      const filtered = filterHighlightVideos(raw, playerName);
      allResults = dedupeVideos([...allResults, ...filtered]);

      if (allResults.length >= MIN_ACCEPTABLE_RESULTS) {
        break; // We have enough good results
      }
    } catch (err) {
      console.error(`youtube-sr ${tier.label} error:`, err);
    }
  }

  // If youtube-sr returned zero results across ALL tiers, try YouTube Data API as fallback
  if (!youtubeSrWorked && YOUTUBE_API_KEY) {
    console.log('youtube-sr returned 0 across all tiers, falling back to YouTube Data API');
    try {
      const fallbackQuery = cleanTeam
        ? `${playerName} ${cleanTeam} highlights ${posLabel}`
        : `${playerName} highlights ${posLabel}`;
      const raw = await youtubeApiFallback(fallbackQuery);
      const filtered = filterHighlightVideos(raw, playerName);
      allResults = dedupeVideos([...allResults, ...filtered]);
    } catch (err) {
      console.error('YouTube API fallback also failed:', err);
    }
  }

  // Score, sort, and return top results
  const sorted = scoreAndSort(allResults, playerName, cleanTeam);
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
    const forceRefresh = searchParams.get('refresh') === '1';

    if (!playerName) {
      return NextResponse.json(
        { error: 'playerName is required', videos: [] },
        { status: 400 }
      );
    }

    // 1. Check cache (skip if forceRefresh or if cache has empty results from old API-based search)
    if (!forceRefresh) {
      const cached = await getCachedHighlights(playerName);
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
      searchYouTube(playerName, position, teamName),
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
    await setCachedHighlights(playerName, result);

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
