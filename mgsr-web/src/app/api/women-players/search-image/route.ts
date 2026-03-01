/**
 * Search for a player image using "player name + soccer".
 * Uses SerpAPI (recommended) — free tier: 100 searches/month.
 * Sign up at https://serpapi.com/ to get an API key.
 *
 * Alternative: Google Custom Search API (deprecated for new projects).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Missing or short query' }, { status: 400 });
  }

  const searchQuery = `${q} soccer football player`;

  // SerpAPI (recommended — works for new users)
  const serpKey = process.env.SERPAPI_KEY;
  if (serpKey?.trim()) {
    try {
      const url = new URL('https://serpapi.com/search.json');
      url.searchParams.set('engine', 'google_images');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('api_key', serpKey.trim());
      url.searchParams.set('safe', 'active');

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'MGSR/1.0' },
      });
      const data = (await res.json()) as {
        images_results?: Array<{ original?: string; link?: string }>;
        error?: string;
      };

      if (data.error) {
        return NextResponse.json(
          { error: data.error || 'Image search failed' },
          { status: 502 }
        );
      }

      const links = (data.images_results ?? [])
        .map((i) => i.original || i.link)
        .filter((l): l is string => !!l && l.startsWith('http') && !l.startsWith('x-raw-image'));
      return NextResponse.json({ images: links });
    } catch (err) {
      console.error('SerpAPI image search error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Image search failed' },
        { status: 500 }
      );
    }
  }

  // Google Custom Search (deprecated for new projects — may not work)
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (apiKey?.trim() && cx?.trim()) {
    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', apiKey.trim());
      url.searchParams.set('cx', cx.trim());
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('searchType', 'image');
      url.searchParams.set('num', '5');
      url.searchParams.set('safe', 'active');

      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'MGSR/1.0' },
      });
      const body = await res.text();
      if (!res.ok) {
        let errMsg = 'Image search failed';
        try {
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          errMsg = parsed.error?.message || errMsg;
          if (errMsg.includes('does not have the access') || errMsg.includes('access')) {
            errMsg = 'Custom Search API is deprecated for new projects. Use SerpAPI instead — add SERPAPI_KEY to .env.local (free at serpapi.com).';
          }
        } catch {
          // use default
        }
        return NextResponse.json({ error: errMsg }, { status: 502 });
      }
      const data = JSON.parse(body) as {
        items?: Array<{ link?: string }>;
      };
      const links = (data.items ?? [])
        .map((i) => i.link)
        .filter((l): l is string => !!l && l.startsWith('http'));
      return NextResponse.json({ images: links });
    } catch (err) {
      console.error('Google CSE image search error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Image search failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    {
      error:
        'Image search not configured. Add SERPAPI_KEY to .env.local (free at https://serpapi.com/ — 100 searches/month).',
    },
    { status: 503 }
  );
}
