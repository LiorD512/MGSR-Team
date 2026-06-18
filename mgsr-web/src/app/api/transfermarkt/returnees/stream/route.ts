import { NextRequest, NextResponse } from 'next/server';
import { handleReturneesStream } from '@/lib/transfermarkt';
import { getCachedChunked, getCachedChunkedWithOptions, setCacheChunked } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const CACHE_KEY = 'returnees-stream-all';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  // Check Firestore cache — return as single SSE frame
  if (!refresh) {
    const cached = await getCachedChunked<Record<string, unknown>>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const body = encoder.encode(
        `data: ${JSON.stringify({ players: cached, loadedLeagues: 27, totalLeagues: 27, isLoading: false })}\n\n`
      );
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Cache': 'HIT' },
      });
    }

    // If fresh cache is missing/expired, serve last known cache to avoid blank screens.
    const staleCached = await getCachedChunkedWithOptions<Record<string, unknown>>(CACHE_KEY, CACHE_TTL, {
      ignoreTtl: true,
    });
    if (staleCached) {
      const body = encoder.encode(
        `data: ${JSON.stringify({ players: staleCached, loadedLeagues: 27, totalLeagues: 27, isLoading: false })}\n\n`
      );
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Cache': 'STALE' },
      });
    }
  }

  const allPlayers: Record<string, unknown>[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      // Keep the SSE connection alive while long scraping batches run.
      // Without heartbeats, some proxies terminate the stream before the next data event.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          // Ignore enqueue errors when stream is already closing.
        }
      }, 5000);

      try {
        for await (const event of handleReturneesStream()) {
          if (event.players?.length) { allPlayers.length = 0; allPlayers.push(...event.players); }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        if (allPlayers.length) await setCacheChunked(CACHE_KEY, allPlayers).catch(() => {});
        controller.close();
      } catch (err) {
        if (allPlayers.length) await setCacheChunked(CACHE_KEY, allPlayers).catch(() => {});
        console.error('Returnees stream error:', err);
        const payload = allPlayers.length
          ? { players: allPlayers, loadedLeagues: 27, totalLeagues: 27, isLoading: false }
          : { players: [], loadedLeagues: 0, totalLeagues: 27, isLoading: false, error: err instanceof Error ? err.message : 'Failed' };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
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
