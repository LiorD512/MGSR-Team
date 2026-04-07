import { NextRequest, NextResponse } from 'next/server';
import { handleContractFinishersStream } from '@/lib/transfermarkt';
import { getCached, setCache } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_KEY = 'contract-finishers';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  // Check Firestore cache first — return as a single SSE frame
  if (!refresh) {
    const cached = await getCached<Record<string, unknown>[]>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const body = encoder.encode(
        `data: ${JSON.stringify({ players: cached, windowLabel: '', isLoading: false })}\n\n`
      );
      return new NextResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Cache': 'HIT' },
      });
    }
  }

  const allPlayers: Record<string, unknown>[] = [];
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of handleContractFinishersStream()) {
          if (event.players?.length) allPlayers.length = 0, allPlayers.push(...event.players);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        // Cache the final result
        if (allPlayers.length) await setCache(CACHE_KEY, allPlayers);
        controller.close();
      } catch (err) {
        console.error('Contract finishers stream error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Failed', isLoading: false })}\n\n`
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
