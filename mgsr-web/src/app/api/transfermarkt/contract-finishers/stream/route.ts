import { NextRequest, NextResponse } from 'next/server';
import { handleContractFinishersStream, getContractFinisherWindowLabel } from '@/lib/transfermarkt';
import { getCachedChunked, getCachedChunkedWithOptions, setCacheChunked } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Bumped to -v3: the v2 cache still contained ~12K players including the wrong
// year (2027 summer contracts). The year-query fix now queries only the current
// year, producing a correct winter-only list.
const CACHE_KEY = 'contract-finishers-v3';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  // ── Cache-first path ──────────────────────────────────────────────────
  // The GH Actions cron (weekly-contract-finishers.yml) is the authoritative
  // writer — it has a 6-hour budget and fetches through the TM proxy so it
  // can scrape every page. We read that cache here; live scraping is only a
  // last-resort fallback.
  if (!refresh) {
    // Fresh cache
    const cached = await getCachedChunked<Record<string, unknown>>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const body = encoder.encode(
        `data: ${JSON.stringify({ players: cached, windowLabel: getContractFinisherWindowLabel(), isLoading: false })}\n\n`
      );
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Cache': 'HIT' },
      });
    }

    // Stale cache — serve the last known good result to avoid a blank screen
    // while the next cron run refreshes the data. Mirrors the returnees route.
    const staleCached = await getCachedChunkedWithOptions<Record<string, unknown>>(CACHE_KEY, CACHE_TTL, {
      ignoreTtl: true,
    });
    if (staleCached) {
      const body = encoder.encode(
        `data: ${JSON.stringify({ players: staleCached, windowLabel: getContractFinisherWindowLabel(), isLoading: false })}\n\n`
      );
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Cache': 'STALE' },
      });
    }
  }

  // ── Live-scrape fallback (no cache at all) ────────────────────────────
  // Only reached when there is zero cache (not even stale). Progressive
  // cache writes save whatever we get before a potential Vercel timeout.
  const allPlayers: Record<string, unknown>[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      // Heartbeat keeps the SSE connection alive while scraping (some proxies
      // drop idle connections before the next data event arrives).
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch { /* closing */ }
      }, 5000);

      // Progressive cache writes — snapshot every 200 new players so that if
      // Vercel kills the function mid-stream, partial results are persisted
      // and the next visitor gets a cache HIT instead of restarting from zero.
      let lastCachedCount = 0;
      let cacheWriteInFlight = false;
      const maybeCacheProgress = () => {
        if (cacheWriteInFlight) return;
        if (allPlayers.length - lastCachedCount < 200) return;
        cacheWriteInFlight = true;
        const snapshot = allPlayers.slice();
        lastCachedCount = snapshot.length;
        setCacheChunked(CACHE_KEY, snapshot)
          .catch(() => {})
          .finally(() => { cacheWriteInFlight = false; });
      };

      try {
        for await (const event of handleContractFinishersStream()) {
          if (event.players?.length) { allPlayers.length = 0; allPlayers.push(...event.players); }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          maybeCacheProgress();
        }
        // Final authoritative cache write — full result
        if (allPlayers.length) await setCacheChunked(CACHE_KEY, allPlayers).catch(() => {});
        controller.close();
      } catch (err) {
        if (allPlayers.length) await setCacheChunked(CACHE_KEY, allPlayers).catch(() => {});
        console.error('Contract finishers stream error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ players: allPlayers, windowLabel: getContractFinisherWindowLabel(), isLoading: false })}\n\n`
          )
        );
        controller.close();
      } finally {
        clearInterval(heartbeat);
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
