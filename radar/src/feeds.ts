import type { Http } from './http.js';

export interface FeedItem { title: string; link: string; date: string; snippet: string; outlet?: string }

const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const stripCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
// some feeds entity-encode their CDATA markers (&lt;![CDATA[ ... ]]&gt;): strip them again after decoding
export const cleanText = (s: string) =>
  stripCdata(decode(stripCdata(s || '').replace(/<[^>]+>/g, ' '))).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** RSS 2.0 + Atom, no dependencies. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const tag = (n: string) => { const r = b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, 'i')); return r ? r[1] : ''; };
    let link = cleanText(tag('link'));
    if (!link) { const h = b.match(/<link[^>]+href=["']([^"']+)["']/i); link = h ? h[1] : ''; }
    const date = cleanText(tag('pubDate') || tag('published') || tag('dc:date') || tag('updated'));
    const src = b.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
    items.push({ title: cleanText(tag('title')), link, date, snippet: cleanText(tag('description') || tag('summary') || tag('content:encoded')).slice(0, 300), outlet: src ? cleanText(src[1]) : undefined });
  }
  return items;
}

/** rel=alternate feed links on the homepage, then conventional paths. */
export async function discoverFeeds(http: Http, host: string): Promise<string[]> {
  const found: string[] = [];
  try {
    // a homepage refusal (403) must not put the whole host into back-off: some sites block the homepage for bots but serve /feed
    const home = await http.get(`https://${host}/`, { trackBlocks: false });
    for (const lm of home.text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
      const h = lm[0].match(/href=["']([^"']+)["']/i);
      if (h) found.push(new URL(h[1], `https://${host}/`).href);
    }
  } catch { /* ignore - fall back to conventions */ }
  for (const p of ['/feed', '/rss', '/rss.xml', '/feed/']) found.push(`https://${host}${p}`);
  return [...new Set(found)];
}

/** Parse RFC-822 / ISO dates; returns 0 when unusable (callers must NOT guess - R22.5). */
export function parseDate(s: string): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}
