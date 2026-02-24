/**
 * Warm the football scout server to prevent cold start.
 * Call this every 10 min via Vercel Cron or external cron (cron-job.org).
 * GET /api/scout/warm
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

export async function GET() {
  const url = `${SCOUT_BASE}/recruitment?position=CF&limit=1&lang=en`;
  const start = Date.now();

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });
    const elapsed = Date.now() - start;
    await res.json().catch(() => ({}));
    return NextResponse.json({
      ok: res.ok,
      elapsedMs: elapsed,
      message: 'Scout server warmed',
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error('[Scout warm] Failed:', err);
    return NextResponse.json(
      { ok: false, error: String(err), elapsedMs: elapsed },
      { status: 502 }
    );
  }
}
