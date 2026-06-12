import { NextRequest, NextResponse } from 'next/server';
import { handleReleases } from '@/lib/transfermarkt';
import { getCached, setCache, sanitizeKey, getCachedChunked, getCachedChunkedWithOptions } from '@/lib/scrapingCache';
import { adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const ALL_CACHE_KEY = 'releases-all';
const ALL_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days (matches local worker schedule)
const FEED_EVENTS_RELEASE_TYPE = 'NEW_RELEASE_FROM_CLUB';

type ReleaseLike = {
  playerName?: string;
  playerImage?: string;
  playerUrl?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  transferDate?: string;
  marketValue?: string;
};

function mergeByPlayerUrl(base: ReleaseLike[], incoming: ReleaseLike[]): ReleaseLike[] {
  const merged = new Map<string, ReleaseLike>();

  for (const player of base) {
    if (!player?.playerUrl) continue;
    merged.set(player.playerUrl, player);
  }

  // FeedEvents are considered fresher for visibility, so they are inserted first when missing.
  for (const player of incoming) {
    if (!player?.playerUrl || merged.has(player.playerUrl)) continue;
    merged.set(player.playerUrl, player);
  }

  return Array.from(merged.values());
}

async function getLatestReleaseFeedPlayers(limit = 800): Promise<ReleaseLike[]> {
  const app = getFirebaseAdmin();
  if (!app) return [];

  const db = adminDb();
  const snap = await db
    .collection('FeedEvents')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const players: ReleaseLike[] = [];
  for (const doc of snap.docs) {
    const event = doc.data();
    if (event?.type !== FEED_EVENTS_RELEASE_TYPE) continue;
    const playerUrl = typeof event.playerTmProfile === 'string' ? event.playerTmProfile : undefined;
    if (!playerUrl) continue;

    players.push({
      playerName: event.playerName || undefined,
      playerImage: event.playerImage || undefined,
      playerUrl,
      transferDate: event.timestamp ? new Date(event.timestamp).toISOString().slice(0, 10) : undefined,
      marketValue: undefined,
    });
  }

  return players;
}

export async function GET(request: NextRequest) {
  try {
    const min = parseInt(request.nextUrl.searchParams.get('min') || '0', 10);
    const max = parseInt(request.nextUrl.searchParams.get('max') || '5000000', 10);
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const all = request.nextUrl.searchParams.get('all') === 'true';

    // If requesting all releases, always serve from chunked cache.
    // refresh=true means "force latest persisted cache" (ignore TTL), not live scrape.
    if (all) {
      const cached = refresh
        ? await getCachedChunkedWithOptions<Record<string, unknown>>(ALL_CACHE_KEY, ALL_CACHE_TTL, { ignoreTtl: true })
        : await getCachedChunked<Record<string, unknown>>(ALL_CACHE_KEY, ALL_CACHE_TTL);

      if (refresh) {
        const cachedPlayers = (cached as ReleaseLike[] | null) || [];
        const feedPlayers = await getLatestReleaseFeedPlayers();
        const merged = mergeByPlayerUrl(cachedPlayers, feedPlayers);

        return NextResponse.json(
          {
            players: merged,
            fromCache: cachedPlayers.length > 0,
            forcedRefresh: true,
            feedMerged: true,
          },
          { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } }
        );
      }

      if (cached && cached.length > 0) {
        return NextResponse.json(
          { players: cached, fromCache: true, forcedRefresh: refresh },
          {
            headers: {
              'X-Cache': 'HIT',
              'Cache-Control': refresh
                ? 'no-store'
                : 'public, s-maxage=3600, stale-while-revalidate=43200',
            },
          }
        );
      }

      return NextResponse.json(
        { players: [], fromCache: false, forcedRefresh: refresh },
        { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } }
      );
    }

    const cacheKey = `releases-${sanitizeKey(`${min}-${max}-${page}`)}`;
    if (!refresh) {
      const cached = await getCached<unknown>(cacheKey, CACHE_TTL);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=43200' },
        });
      }
    }
    const data = await handleReleases(min, max, page);
    await setCache(cacheKey, data);
    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=43200' },
    });
  } catch (err) {
    console.error('Releases error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch releases' },
      { status: 500 }
    );
  }
}
