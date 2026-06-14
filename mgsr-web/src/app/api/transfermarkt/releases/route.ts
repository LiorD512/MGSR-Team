import { NextRequest, NextResponse } from 'next/server';
import { handleReleases } from '@/lib/transfermarkt';
import { getCached, setCache, sanitizeKey, getCachedChunked, getCachedChunkedWithOptions, setCacheChunked } from '@/lib/scrapingCache';
import { adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const ALL_CACHE_KEY = 'releases-all';
const ALL_CACHE_TTL = 3 * 24 * 60 * 60 * 1000; // 3 days (matches local worker schedule)
const FEED_EVENTS_RELEASE_TYPE = 'NEW_RELEASE_FROM_CLUB';
const LIVE_REFRESH_RANGES: Array<[number, number]> = [
  [0, 125000],
  [125001, 250000],
  [250001, 400000],
  [400001, 600000],
  [600001, 800000],
  [800001, 1000000],
  [1000001, 1200000],
  [1200001, 1400000],
  [1400001, 1600000],
  [1600001, 1800000],
  [1800001, 2000000],
  [2000001, 2200000],
  [2200001, 2500000],
  [2500001, 3000000],
  [3000001, 3500000],
  [3500001, 4000000],
  [4000001, 50000000],
];
const LIVE_REFRESH_MAX_PAGES_PER_RANGE = 8;
const LIVE_REFRESH_DELAY_MS = 220;
const PLAYERS_COLLECTION = 'Players';
const FEED_EVENTS_COLLECTION = 'FeedEvents';

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

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function javaHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function feedEventDocIdForRelease(playerTmProfile: string): string {
  return `NEW_RELEASE_FROM_CLUB_${javaHashCode(playerTmProfile || '')}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function scrapeLatestReleasesLive(): Promise<{ players: ReleaseLike[]; pagesFetched: number; rangesProcessed: number }> {
  const all = new Map<string, ReleaseLike>();
  let pagesFetched = 0;
  let rangesProcessed = 0;

  for (const [min, max] of LIVE_REFRESH_RANGES) {
    rangesProcessed += 1;
    for (let page = 1; page <= LIVE_REFRESH_MAX_PAGES_PER_RANGE; page++) {
      const data = await handleReleases(min, max, page);
      const players = (data?.players as ReleaseLike[] | undefined) || [];
      pagesFetched += 1;

      if (players.length === 0) break;

      for (const player of players) {
        if (!player?.playerUrl) continue;
        if (!all.has(player.playerUrl)) {
          all.set(player.playerUrl, player);
        }
      }

      // Last page in range or sparse page: move to next range quickly.
      if (players.length < 25) break;
      await delay(LIVE_REFRESH_DELAY_MS);
    }
  }

  return {
    players: Array.from(all.values()),
    pagesFetched,
    rangesProcessed,
  };
}

async function syncReleaseFeedEvents(players: ReleaseLike[]): Promise<{
  createdEvents: number;
  scannedPlayers: number;
  notInDatabaseUrls: string[];
}> {
  const app = getFirebaseAdmin();
  if (!app) {
    return { createdEvents: 0, scannedPlayers: 0, notInDatabaseUrls: [] };
  }

  const db = adminDb();
  const feedRef = db.collection(FEED_EVENTS_COLLECTION);
  const playersRef = db.collection(PLAYERS_COLLECTION);

  const byUrl = new Map<string, ReleaseLike>();
  for (const player of players) {
    if (!player?.playerUrl) continue;
    if (!byUrl.has(player.playerUrl)) byUrl.set(player.playerUrl, player);
  }
  const urls = Array.from(byUrl.keys());
  if (urls.length === 0) {
    return { createdEvents: 0, scannedPlayers: 0, notInDatabaseUrls: [] };
  }

  const existingEventUrls = new Set<string>();
  for (const urlChunk of chunk(urls, 30)) {
    const snap = await feedRef
      .where('type', '==', FEED_EVENTS_RELEASE_TYPE)
      .where('playerTmProfile', 'in', urlChunk)
      .get();
    snap.docs.forEach((doc) => {
      const tm = doc.get('playerTmProfile');
      if (typeof tm === 'string' && tm) existingEventUrls.add(tm);
    });
  }

  const playersInDb = new Set<string>();
  for (const urlChunk of chunk(urls, 30)) {
    const snap = await playersRef.where('tmProfile', 'in', urlChunk).get();
    snap.docs.forEach((doc) => {
      const tm = doc.data()?.tmProfile;
      if (typeof tm === 'string' && tm) playersInDb.add(tm);
    });
  }

  const notInDatabaseUrls = urls.filter((url) => !playersInDb.has(url));
  const toCreate = urls.filter((url) => !existingEventUrls.has(url));
  const now = Date.now();

  let createdEvents = 0;
  for (const createChunk of chunk(toCreate, 350)) {
    const batch = db.batch();
    for (const url of createChunk) {
      const release = byUrl.get(url);
      if (!release) continue;
      const isInDatabase = playersInDb.has(url);
      const docId = feedEventDocIdForRelease(url);
      batch.set(feedRef.doc(docId), {
        type: FEED_EVENTS_RELEASE_TYPE,
        playerName: release.playerName || 'Unknown',
        playerImage: release.playerImage || null,
        playerTmProfile: url,
        playerPosition: release.playerPosition || null,
        marketValue: release.marketValue || null,
        playerAge: release.playerAge || null,
        playerNationality: release.playerNationality || null,
        playerNationalityFlag: release.playerNationalityFlag || null,
        transferDate: release.transferDate || null,
        oldValue: null,
        newValue: 'Without club',
        extraInfo: isInDatabase ? 'IN_DATABASE' : 'NOT_IN_DATABASE',
        timestamp: now,
      });
      createdEvents += 1;
    }
    await batch.commit();
  }

  return {
    createdEvents,
    scannedPlayers: urls.length,
    notInDatabaseUrls,
  };
}

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
    const live = request.nextUrl.searchParams.get('live') === 'true';

    // If requesting all releases, always serve from chunked cache.
    // refresh=true means "force latest persisted cache" (ignore TTL), not live scrape.
    if (all) {
      if (live) {
        const liveResult = await scrapeLatestReleasesLive();
        const feedSync = await syncReleaseFeedEvents(liveResult.players);
        const feedPlayers = await getLatestReleaseFeedPlayers();
        const merged = mergeByPlayerUrl(liveResult.players, feedPlayers);

        await setCacheChunked(ALL_CACHE_KEY, merged);

        return NextResponse.json(
          {
            players: merged,
            fromCache: false,
            forcedRefresh: true,
            liveRefreshed: true,
            feedMerged: true,
            pagesFetched: liveResult.pagesFetched,
            rangesProcessed: liveResult.rangesProcessed,
            feedEventsCreated: feedSync.createdEvents,
            feedPlayersScanned: feedSync.scannedPlayers,
            notInDatabaseUrls: feedSync.notInDatabaseUrls,
          },
          { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } }
        );
      }

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
