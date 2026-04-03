/**
 * POST /api/war-room/tm-fetch
 * Proxies Transfermarkt HTML fetches for Cloud Functions.
 * Cloud Functions run on Google Cloud IPs which TM blocks —
 * this Vercel endpoint bypasses the block.
 *
 * Body: { secret: string, url: string }
 * The secret must match SCOUT_ENRICH_SECRET env var.
 * Only transfermarkt.com URLs are allowed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchHtmlWithRetry } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // TM fetches should complete within 30s

const ALLOWED_HOSTS = ['www.transfermarkt.com', 'transfermarkt.com', 'www.transfermarkt.de', 'transfermarkt.de'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret, url } = body || {};

    // Auth check
    const expectedSecret = process.env.SCOUT_ENRICH_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate URL — only allow Transfermarkt domains
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(parsedUrl.hostname)) {
      return NextResponse.json({ error: 'Only transfermarkt.com URLs are allowed' }, { status: 400 });
    }

    // Fetch the HTML through Vercel's IP
    const html = await fetchHtmlWithRetry(url, 2);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[tm-fetch] Error:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
