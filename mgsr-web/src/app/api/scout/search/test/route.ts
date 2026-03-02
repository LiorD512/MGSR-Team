/**
 * Debug endpoint: calls football scout server directly (no Gemini).
 * GET /api/scout/search/test - verifies the scout server is reachable.
 */
import { NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = `${getScoutBaseUrl()}/recruitment?position=CF&age_max=25&limit=3&lang=en&request_id=debug-test`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
    });
    const elapsed = Date.now() - start;
    const data = await res.json().catch(() => ({}));

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      elapsedMs: elapsed,
      scoutUrl: url,
      resultCount: Array.isArray((data as { results?: unknown[] }).results)
        ? (data as { results: unknown[] }).results.length
        : 0,
      firstPlayer: Array.isArray((data as { results?: { name?: string }[] }).results)
        ? (data as { results: { name?: string }[] }).results[0]?.name
        : null,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: elapsed,
        scoutUrl: url,
      },
      { status: 502 }
    );
  }
}
