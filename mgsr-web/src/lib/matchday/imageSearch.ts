/**
 * Legitimate image search for MATCHDAY assets.
 *
 * Reuses the same providers the rest of the app already relies on:
 *   1. Serper.dev images  (SERPER_API_KEY)  — primary
 *   2. SerpAPI google_images (SERPAPI_KEY)   — fallback
 *   3. Google CSE image search (GOOGLE_CSE_*) — legacy fallback
 *
 * Returns plain http(s) image URLs. Callers are responsible for downloading
 * and validating the bytes.
 */

export interface ImageHit {
  url: string;
  source: string;
  /** Origin page, when available — useful for auditing/attribution. */
  pageUrl?: string;
}

function isUsableImageUrl(url: string | undefined | null): url is string {
  return (
    typeof url === 'string' &&
    url.startsWith('http') &&
    !url.startsWith('x-raw-image') &&
    !url.includes('undefined')
  );
}

async function serperImages(query: string, count: number): Promise<ImageHit[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch('https://google.serper.dev/images', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: Math.max(count, 10) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      images?: Array<{ imageUrl?: string; link?: string }>;
    };
    return (data.images ?? [])
      .filter((i) => isUsableImageUrl(i.imageUrl))
      .map((i) => ({ url: i.imageUrl as string, source: 'serper', pageUrl: i.link }));
  } catch {
    return [];
  }
}

async function serpApiImages(query: string): Promise<ImageHit[]> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return [];
  try {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_images');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', key);
    url.searchParams.set('safe', 'active');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MGSR/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      images_results?: Array<{ original?: string; link?: string }>;
    };
    return (data.images_results ?? [])
      .map((i) => ({ url: i.original || i.link || '', source: 'serpapi', pageUrl: i.link }))
      .filter((h) => isUsableImageUrl(h.url));
  } catch {
    return [];
  }
}

async function googleCseImages(query: string): Promise<ImageHit[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY?.trim();
  const cx = process.env.GOOGLE_CSE_CX?.trim();
  if (!apiKey || !cx) return [];
  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', '6');
    url.searchParams.set('safe', 'active');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MGSR/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<{ link?: string; image?: { contextLink?: string } }> };
    return (data.items ?? [])
      .map((i) => ({ url: i.link || '', source: 'google_cse', pageUrl: i.image?.contextLink }))
      .filter((h) => isUsableImageUrl(h.url));
  } catch {
    return [];
  }
}

/** True when at least one image-search backend is configured. */
export function imageSearchConfigured(): boolean {
  return Boolean(
    process.env.SERPER_API_KEY?.trim() ||
      process.env.SERPAPI_KEY?.trim() ||
      (process.env.GOOGLE_CSE_API_KEY?.trim() && process.env.GOOGLE_CSE_CX?.trim())
  );
}

/**
 * Search images across configured providers, returning up to `count` unique
 * URLs. Providers are tried in order and results merged/deduped.
 */
export async function searchImages(query: string, count = 6): Promise<ImageHit[]> {
  const seen = new Set<string>();
  const out: ImageHit[] = [];

  const pushAll = (hits: ImageHit[]) => {
    for (const h of hits) {
      if (seen.has(h.url)) continue;
      seen.add(h.url);
      out.push(h);
      if (out.length >= count) break;
    }
  };

  pushAll(await serperImages(query, count));
  if (out.length < count) pushAll(await serpApiImages(query));
  if (out.length < count) pushAll(await googleCseImages(query));

  return out.slice(0, count);
}
