import { NextRequest, NextResponse } from 'next/server';
import { authenticate, failure, isResponse, q } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

/** GET /api/transfer-radar/alerts?since=ts - dashboard alert feed (global in v1; per-user thresholds + push are the next step). */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const since = Number(req.nextUrl.searchParams.get('since') || 0);
    const rows = await q<Record<string, unknown>>(`SELECT id, created_at, type, player_id, title, body, score FROM alerts WHERE user_id = '*' ORDER BY created_at DESC LIMIT 30`);
    return NextResponse.json({ items: rows, unread: rows.filter((r) => Number(r.created_at) > since).length });
  } catch (e) { return failure(e); }
}
