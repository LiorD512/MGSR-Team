/**
 * Proxy for football-scout-server. Avoids CORS when app runs on Vercel.
 */
import { NextRequest, NextResponse } from 'next/server';

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${SCOUT_BASE}/recruitment?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: string })?.error || `Scout server returned ${res.status}`;
      return NextResponse.json({ error: msg, results: [] }, { status: 502 });
    }
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scout API failed';
    console.error('Scout proxy error:', msg, err);
    const hint =
      SCOUT_BASE.includes('localhost') && msg.includes('fetch')
        ? ' (Is the scout server running? Run: cd football_scout_server && source venv/bin/activate && uvicorn server:app --port 8000)'
        : '';
    return NextResponse.json(
      { error: msg + hint, results: [] },
      { status: 502 }
    );
  }
}
