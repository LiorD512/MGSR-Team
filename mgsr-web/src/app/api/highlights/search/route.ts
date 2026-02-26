/**
 * /api/highlights/search — Player Highlights Video Search
 *
 * Fetches highlight videos from YouTube Data API v3 + Scorebat (free).
 * Results are cached in Firestore for 48 hours to conserve YouTube quota.
 *
 * Query params:
 *   playerName  – full player name (required)
 *   teamName    – current club name (optional, improves Scorebat matching)
 *   position    – e.g. "ST", "LW" (optional, improves query)
 */
import { NextRequest, NextResponse } from 'next/server';

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
/*  YouTube Data API v3                                               */
/* ------------------------------------------------------------------ */

async function searchYouTube(playerName: string, position?: string): Promise<HighlightVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  // Build search query — focus on highlights, exclude junk
  const posLabel = position === 'GK' ? 'saves' : 'goals skills';
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const publishedAfter = twoYearsAgo.toISOString();

  const q = `${playerName} highlights ${posLabel} -interview -press -conference -reaction -news -podcast -transfer`;

  const searchParams = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: 'snippet',
    type: 'video',
    q,
    videoDuration: 'medium', // 4-20 min
    order: 'relevance',
    publishedAfter,
    maxResults: '8',
    safeSearch: 'none',
    videoEmbeddable: 'true',
    relevanceLanguage: 'en',
  });

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!searchRes.ok) {
      console.error('YouTube search failed:', searchRes.status, await searchRes.text().catch(() => ''));
      return [];
    }
    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (items.length === 0) return [];

    // Get video details (duration, view count) — only 1 quota unit per call
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

    // Build results with filtering
    const results: HighlightVideo[] = [];
    const playerLower = playerName.toLowerCase();

    for (const item of items) {
      const videoId = item.id.videoId;
      const title = item.snippet?.title || '';
      const titleLower = title.toLowerCase();
      const channelTitle = item.snippet?.channelTitle || '';

      // Skip if title contains blacklisted words
      if (TITLE_BLACKLIST.some(bw => titleLower.includes(bw))) continue;

      // Skip if title doesn't seem related to the player at all
      // (check if at least part of the player name appears)
      const nameParts = playerLower.split(/\s+/);
      const lastNameMatch = nameParts.some(part => part.length >= 3 && titleLower.includes(part));
      if (!lastNameMatch) continue;

      const detail = detailMap.get(videoId);
      const duration = detail?.duration || 0;

      // Skip if too short (< 60 seconds)
      if (duration < 60) continue;

      // Skip if suspiciously long (> 45 min — likely full match)
      if (duration > 2700) continue;

      const thumbnailUrl =
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url || '';

      results.push({
        id: videoId,
        source: 'youtube',
        title,
        thumbnailUrl,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        channelName: channelTitle,
        publishedAt: item.snippet?.publishedAt || '',
        durationSeconds: duration,
        viewCount: detail?.views || 0,
      });
    }

    // Sort: trusted channels first, then by views
    results.sort((a, b) => {
      const aT = TRUSTED_CHANNELS.has(a.channelName.toLowerCase()) ? 1 : 0;
      const bT = TRUSTED_CHANNELS.has(b.channelName.toLowerCase()) ? 1 : 0;
      if (aT !== bT) return bT - aT;
      return (b.viewCount || 0) - (a.viewCount || 0);
    });

    return results.slice(0, 6);
  } catch (err) {
    console.error('YouTube search error:', err);
    return [];
  }
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

    if (!playerName) {
      return NextResponse.json(
        { error: 'playerName is required', videos: [] },
        { status: 400 }
      );
    }

    // 1. Check cache
    const cached = await getCachedHighlights(playerName);
    if (cached && cached.videos.length > 0) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'private, max-age=3600' },
      });
    }

    // 2. Fetch from both sources in parallel
    const [youtubeVideos, scorebatVideos] = await Promise.all([
      searchYouTube(playerName, position),
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

    // 3. Cache results (even if empty — prevents re-fetching for players with no videos)
    await setCachedHighlights(playerName, result);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Highlights search failed';
    console.error('Highlights API error:', msg, err);
    return NextResponse.json({ error: msg, videos: [] }, { status: 500 });
  }
}
