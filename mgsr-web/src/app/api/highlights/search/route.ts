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
/*  YouTube Data API v3 — Multi-tier cascading search                 */
/*                                                                    */
/*  Problem: superstars (Salah, Haaland) have 4-20min compilations    */
/*  uploaded every month, but most players only have short clips       */
/*  (1-3 min) and/or older compilations (3-5+ years ago).             */
/*                                                                    */
/*  Strategy: progressively relax filters until we find results.      */
/*  Each tier costs 100 YouTube API quota units (search) + 1 (detail) */
/*  so we stop as soon as we have enough results.                     */
/* ------------------------------------------------------------------ */

/** Minimum acceptable videos before we try the next search tier */
const MIN_ACCEPTABLE_RESULTS = 2;
const TARGET_RESULTS = 6;

/**
 * Single YouTube search call → filtered HighlightVideo[]
 * Does NOT apply videoDuration filter — we fetch details and filter ourselves
 * so we can accept 1-45 min instead of YouTube's rigid 4-20 min "medium" bucket.
 */
async function youtubeSearchOnce(
  query: string,
  publishedAfter?: string,
): Promise<HighlightVideo[]> {
  const searchParams = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: 'snippet',
    type: 'video',
    q: query,
    order: 'relevance',
    maxResults: '10',
    safeSearch: 'none',
    videoEmbeddable: 'true',
    relevanceLanguage: 'en',
  });
  if (publishedAfter) searchParams.set('publishedAfter', publishedAfter);

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!searchRes.ok) {
    const errText = await searchRes.text().catch(() => '');
    // If quota exceeded, don't try more tiers
    if (searchRes.status === 403 && errText.includes('quotaExceeded')) {
      throw new Error('QUOTA_EXCEEDED');
    }
    console.error('YouTube search failed:', searchRes.status, errText);
    return [];
  }
  const searchData = await searchRes.json();
  const items = searchData.items || [];
  if (items.length === 0) return [];

  // Fetch video details (duration, views) — 1 quota unit
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
  const playerLower = playerName.toLowerCase();
  const nameParts = playerLower.split(/\s+/).filter(p => p.length >= 2);
  // For name matching, prefer last name (usually longer and more unique)
  const significantParts = nameParts.filter(p => p.length >= 3);

  return videos.filter(v => {
    const titleLower = v.title.toLowerCase();

    // Skip blacklisted content
    if (TITLE_BLACKLIST.some(bw => titleLower.includes(bw))) return false;

    // Player name relevance check — at least one significant name part must appear
    // For very short names (e.g. "Dia"), also check channel description
    const nameInTitle = significantParts.length > 0
      ? significantParts.some(part => titleLower.includes(part))
      : nameParts.some(part => titleLower.includes(part));
    if (!nameInTitle) return false;

    // Duration check — allow 45s-45min (much more lenient than before)
    if (v.durationSeconds < minDuration || v.durationSeconds > maxDuration) return false;

    return true;
  });
}

/**
 * Score and sort videos by quality/relevance.
 */
function scoreAndSort(videos: HighlightVideo[], playerName: string): HighlightVideo[] {
  const playerLower = playerName.toLowerCase();
  const nameParts = playerLower.split(/\s+/).filter(p => p.length >= 2);

  return [...videos].sort((a, b) => {
    let scoreA = 0, scoreB = 0;

    // Trusted channel bonus
    if (TRUSTED_CHANNELS.has(a.channelName.toLowerCase())) scoreA += 50;
    if (TRUSTED_CHANNELS.has(b.channelName.toLowerCase())) scoreB += 50;

    // Title contains "highlight" — strong signal
    if (a.title.toLowerCase().includes('highlight')) scoreA += 30;
    if (b.title.toLowerCase().includes('highlight')) scoreB += 30;

    // Title contains relevant keywords
    const goodWords = ['goals', 'skills', 'assists', 'best', 'compilation', 'amazing', 'magic'];
    for (const w of goodWords) {
      if (a.title.toLowerCase().includes(w)) scoreA += 10;
      if (b.title.toLowerCase().includes(w)) scoreB += 10;
    }

    // Full name match in title (better relevance)
    const fullNameParts = nameParts.filter(p => a.title.toLowerCase().includes(p));
    const fullNamePartsB = nameParts.filter(p => b.title.toLowerCase().includes(p));
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
 * Multi-tier YouTube search: progressively relaxes search constraints
 * to find highlights for any player, from superstar to obscure.
 *
 * Tier 1: "name highlights goals/skills" — last 2 years
 * Tier 2: "name team highlights"         — last 2 years
 * Tier 3: "name highlights"              — last 5 years
 * Tier 4: "name highlights"              — all time
 * Tier 5: "name goals"                   — all time (last resort)
 *
 * Each tier costs ~101 quota units. We stop when we have ≥2 good results.
 * Worst case = 5 tiers × 101 = 505 units (half of daily 10k free quota).
 * But with Firestore caching (48h), repeat searches cost 0.
 */
async function searchYouTube(
  playerName: string,
  position?: string,
  teamName?: string,
): Promise<HighlightVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  const posLabel = position === 'GK' ? 'saves' : 'goals skills';
  const negKeywords = '-interview -press -conference -reaction -podcast -transfer';

  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  // Clean team name for queries (strip FC prefix/suffix)
  const cleanTeam = teamName
    ? teamName.replace(/^fc\s+|\s+fc$/gi, '').trim()
    : '';

  // Define search tiers — ordered from most strict to most relaxed
  const tiers: Array<{ query: string; publishedAfter?: string; label: string }> = [
    {
      label: 'Tier 1: strict 2y',
      query: `${playerName} highlights ${posLabel} ${negKeywords}`,
      publishedAfter: twoYearsAgo.toISOString(),
    },
    ...(cleanTeam ? [{
      label: 'Tier 2: with team 2y',
      query: `${playerName} ${cleanTeam} highlights ${negKeywords}`,
      publishedAfter: twoYearsAgo.toISOString(),
    }] : []),
    {
      label: 'Tier 3: 5y window',
      query: `${playerName} highlights ${posLabel}`,
      publishedAfter: fiveYearsAgo.toISOString(),
    },
    {
      label: 'Tier 4: all time',
      query: `${playerName} highlights ${posLabel}`,
    },
    {
      label: 'Tier 5: minimal goals',
      query: `${playerName} goals`,
    },
  ];

  let allResults: HighlightVideo[] = [];

  for (const tier of tiers) {
    try {
      const raw = await youtubeSearchOnce(tier.query, tier.publishedAfter);
      const filtered = filterHighlightVideos(raw, playerName);
      allResults = dedupeVideos([...allResults, ...filtered]);

      if (allResults.length >= MIN_ACCEPTABLE_RESULTS) {
        // We have enough, stop searching
        break;
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'QUOTA_EXCEEDED') {
        console.warn('YouTube quota exceeded, stopping search tiers');
        break;
      }
      console.error(`YouTube ${tier.label} error:`, err);
      // Continue to next tier
    }
  }

  // Score, sort, and return top results
  const sorted = scoreAndSort(allResults, playerName);
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
    // Cache empty results for only 12 hours (they might get videos later)
    // Cache non-empty results for 48 hours
    if (allVideos.length === 0) {
      result.cachedAt = Date.now() - CACHE_TTL_MS + (12 * 60 * 60 * 1000); // expire in 12h
    }
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
