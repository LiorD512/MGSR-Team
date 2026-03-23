import { NextRequest } from 'next/server';
import { runDiscovery, getSurnameStats } from '@/lib/jewishPlayerFinder';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * SSE streaming discovery endpoint.
 * Each call uses a rotating seed so different players/leagues are scanned.
 *
 * GET /api/jewish-finder/discover?seed=123
 */
export async function GET(request: NextRequest) {
  const seedParam = request.nextUrl.searchParams.get('seed');
  const seed = seedParam ? parseInt(seedParam, 10) : Date.now();
  const lang = request.nextUrl.searchParams.get('lang') || 'en';

  const apiKey = process.env.GEMINI_API_KEY;
  const serperKey = process.env.SERPER_API_KEY || '';
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Send surname stats first
        send('stats', getSurnameStats());
        send('progress', { phase: 'starting', message: 'Selecting leagues and clubs to scan...' });

        const result = await runDiscovery(seed, apiKey, 20, lang, serperKey);
        send('result', result);
        send('done', { ok: true });
      } catch (err) {
        send('error', { error: err instanceof Error ? err.message : 'Discovery failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
