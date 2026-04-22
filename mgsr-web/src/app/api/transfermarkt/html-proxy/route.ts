import { NextRequest, NextResponse } from 'next/server';
import { fetchHtml } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * HTML proxy: fetches a Transfermarkt page through the web server's
 * header-generator pipeline (which bypasses Cloudflare TLS fingerprinting)
 * and returns the raw HTML. Used by the Android app as a fallback when
 * direct OkHttp requests are blocked.
 *
 * Only allows transfermarkt.com URLs to prevent open-proxy abuse.
 */
export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || '';
    if (!url) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    // Security: only allow transfermarkt.com URLs
    const parsed = new URL(url);
    if (!parsed.hostname.includes('transfermarkt.')) {
      return NextResponse.json({ error: 'Only transfermarkt.com URLs are allowed' }, { status: 403 });
    }

    const html = await fetchHtml(url);
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('HTML proxy error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Proxy fetch failed' },
      { status: 502 }
    );
  }
}
