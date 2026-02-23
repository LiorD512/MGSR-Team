import { NextResponse } from 'next/server';
import { handleReturneesStream } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of handleReturneesStream()) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      } catch (err) {
        console.error('Returnees stream error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ players: [], loadedLeagues: 0, totalLeagues: 27, isLoading: false, error: err instanceof Error ? err.message : 'Failed' })}\n\n`
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
