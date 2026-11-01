import type { Db } from './db.js';
import { one, run } from './db.js';
import type { RadarConfig } from './config.js';
import { hostOf, now, sleep, log, DAY } from './util.js';

export interface HttpResult { status: number; text: string; url: string; etag?: string; lastModified?: string; notModified: boolean }

/**
 * Polite fetcher: identifying User-Agent, robots.txt (User-agent: * Disallow), one request per host every `perHostDelayMs`,
 * conditional GET, and persistent back-off when a host answers 403/429/503. Never rotates IPs, never bypasses blocks.
 */
export class Http {
  private lastHit = new Map<string, number>();
  private chain = new Map<string, Promise<void>>();
  private robots = new Map<string, string[] | null>();
  constructor(private db: Db, private cfg: RadarConfig) {}

  private async slot(host: string, delay: number) {
    const prev = this.chain.get(host) ?? Promise.resolve();
    const next = prev.then(async () => {
      const wait = (this.lastHit.get(host) ?? 0) + delay - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastHit.set(host, Date.now());
    });
    this.chain.set(host, next.catch(() => undefined));
    await next;
  }

  async isBlocked(host: string): Promise<boolean> {
    const r = await one<{ blocked_until: number }>(this.db, 'SELECT blocked_until FROM host_state WHERE host = ?', [host]);
    return !!r && r.blocked_until > now();
  }

  private async noteStatus(host: string, status: number) {
    if (status === 403 || status === 429 || status === 503) {
      const row = await one<{ consecutive_blocks: number }>(this.db, 'SELECT consecutive_blocks FROM host_state WHERE host = ?', [host]);
      const n = (row?.consecutive_blocks ?? 0) + 1;
      const until = now() + Math.min(DAY, 3_600_000 * 2 ** (n - 1));
      await run(this.db, `INSERT INTO host_state (host, blocked_until, consecutive_blocks) VALUES (?,?,?)
        ON CONFLICT(host) DO UPDATE SET blocked_until=excluded.blocked_until, consecutive_blocks=excluded.consecutive_blocks`, [host, until, n]);
      log.warn(`host ${host} answered ${status}; backing off until ${new Date(until).toISOString()}`);
    } else if (status >= 200 && status < 400) {
      await run(this.db, `INSERT INTO host_state (host, blocked_until, consecutive_blocks) VALUES (?,0,0)
        ON CONFLICT(host) DO UPDATE SET blocked_until=0, consecutive_blocks=0`, [host]);
    }
  }

  async robotsAllows(url: string): Promise<boolean> {
    const host = hostOf(url);
    if (!this.robots.has(host)) {
      let disallow: string[] | null = [];
      try {
        const r = await this.raw(`https://${host}/robots.txt`, { timeoutMs: 8000 }, host, true);
        if (r.status === 200) disallow = parseRobots(r.text); else disallow = [];
      } catch { disallow = []; }
      this.robots.set(host, disallow);
    }
    const dis = this.robots.get(host) ?? [];
    let path = '/';
    try { const u = new URL(url); path = u.pathname + u.search; } catch { /* keep */ }
    return !dis.some((d) => d && path.startsWith(d));
  }

  private async raw(url: string, o: { timeoutMs?: number; headers?: Record<string, string> }, host: string, skipRobots = false): Promise<HttpResult> {
    if (!skipRobots && (await this.isBlocked(host))) throw new Error(`host ${host} is in back-off`);
    await this.slot(host, this.cfg.http.perHostDelayMs);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? this.cfg.http.timeoutMs);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': this.cfg.http.userAgent, Accept: 'text/html,application/xml,application/rss+xml,application/atom+xml,*/*', ...(o.headers ?? {}) },
        signal: ctl.signal, redirect: 'follow',
      });
      const text = r.status === 304 ? '' : (await r.text()).slice(0, 2_500_000);
      if (!skipRobots) await this.noteStatus(host, r.status);
      return { status: r.status, text, url: r.url, etag: r.headers.get('etag') ?? undefined, lastModified: r.headers.get('last-modified') ?? undefined, notModified: r.status === 304 };
    } finally { clearTimeout(t); }
  }

  /** GET with robots check. Throws on robots denial or active back-off. */
  async get(url: string, o: { timeoutMs?: number; etag?: string | null; lastModified?: string | null; ignoreRobots?: boolean } = {}): Promise<HttpResult> {
    const host = hostOf(url);
    if (!o.ignoreRobots && !(await this.robotsAllows(url))) throw new Error(`robots.txt disallows ${url}`);
    const headers: Record<string, string> = {};
    if (o.etag) headers['If-None-Match'] = o.etag;
    if (o.lastModified) headers['If-Modified-Since'] = o.lastModified;
    return this.raw(url, { timeoutMs: o.timeoutMs, headers }, host);
  }
}

export function parseRobots(txt: string): string[] {
  let applies = false; const dis: string[] = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') applies = v === '*';
    else if (applies && k === 'disallow' && v) dis.push(v);
  }
  return dis;
}
