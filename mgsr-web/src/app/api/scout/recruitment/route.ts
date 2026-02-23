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
    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Scout proxy error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scout API failed', results: [] },
      { status: 500 }
    );
  }
}
