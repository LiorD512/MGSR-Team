import { NextRequest, NextResponse } from 'next/server';
import { handleContractFinishersStream, getContractFinisherWindowLabel } from '@/lib/transfermarkt';
import { getCachedChunked, setCacheChunked } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Bumped to -v2 to invalidate caches populated before the window-month fix,
// which contained out-of-window (e.g. June/summer) contracts under Winter.
const CACHE_KEY = 'contract-finishers-v2';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  // Check Firestore cache first — return as a single SSE frame
  if (!refresh) {
    const cached = await getCachedChunked<Record<string, unknown>>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const body = encoder.encode(
        `data: ${JSON.stringify({ players: cached, windowLabel: getContractFinisherWindowLabel(), isLoading: false })}\n\n`
      );
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Cache': 'HIT' },
      });
    }
  }

  const allPlayers: Record<string, unknown>[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      // ── Progressive cache write ──────────────────────────────────
      // Vercel serverless has a hard execution timeout (60s hobby, 300s pro).
      // If the function is killed mid-stream, neither the success nor the catch
      // path below runs, so the cache would never be written and the NEXT
      // visitor starts scraping from zero again — the user sees it climb to a
      // few thousand then reset. By snapshotting the cache periodically as we
      // go, whatever we scraped so far is persisted; the next load returns a
      // warm (possibly partial) cache instantly instead of restarting.
      let lastCachedCount = 0;
      let cacheWriteInFlight = false;
      const maybeCacheProgress = () => {
        if (cacheWriteInFlight) return;
        // Only re-write once at least 200 new players have accumulated, to
        // keep Firestore writes bounded during a long scrape.
        if (allPlayers.length - lastCachedCount < 200) return;
        cacheWriteInFlight = true;
        const snapshot = allPlayers.slice();
        lastCachedCount = snapshot.length;
        setCacheChunked(CACHE_KEY, snapshot)
          .catch(() => {})
          .finally(() => {
            cacheWriteInFlight = false;
          });
      };

      try {
        for await (const event of handleContractFinishersStream()) {
          if (event.players?.length) allPlayers.length = 0, allPlayers.push(...event.players);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          maybeCacheProgress();
        }
        // Final cache write — authoritative, covers the full result
        if (allPlayers.length) await setCacheChunked(CACHE_KEY, allPlayers).catch(() => {});
        controller.close();
      } catch (err) {
        // Cache whatever we have so far (partial results)
        if (allPlayers.length) await setCacheChunked(CACHE_KEY, allPlayers).catch(() => {});
        console.error('Contract finishers stream error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ players: allPlayers, isLoading: false })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
