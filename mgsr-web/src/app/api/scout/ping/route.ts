/**
 * Instant ping - no external calls. Use to verify API routes work.
 * GET /api/scout/ping
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now(), msg: 'pong' });
}

export async function POST() {
  return NextResponse.json({ ok: true, ts: Date.now(), msg: 'pong' });
}
