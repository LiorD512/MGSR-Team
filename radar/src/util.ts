import { createHash } from 'node:crypto';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const now = () => Date.now();
export const DAY = 86_400_000;

export const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
export const shortHash = (s: string, n = 16) => sha1(s).slice(0, n);

/** lower-case, strip diacritics + punctuation; keeps letters/digits of any script */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  return norm(s).split(' ').filter((t) => t.length > 2);
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|ref_|igshid|spm$|cmpid|at_)/i;
/** canonical URL used as dedupe key: no tracking params, no fragment, no trailing slash, lower-case host */
export function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    let out = url.toString();
    if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
    return out;
  } catch {
    return u.trim();
  }
}

export function hostOf(u: string): string {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const log = {
  info: (m: string, extra?: unknown) => console.log(`[radar] ${m}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`),
  warn: (m: string, extra?: unknown) => console.warn(`[radar][warn] ${m}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`),
  error: (m: string, extra?: unknown) => console.error(`[radar][error] ${m}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`),
};

export function dayKey(ts = Date.now()): string { return new Date(ts).toISOString().slice(0, 10); }
export function monthKey(ts = Date.now()): string { return new Date(ts).toISOString().slice(0, 7); }
