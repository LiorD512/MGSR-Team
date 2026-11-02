import type { Db } from '../db.js';
import { all, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import type { Http } from '../http.js';
import { cleanText } from '../feeds.js';
import { hostOf, log, now } from '../util.js';
import { googleNewsTarget } from './links.js';

/** Plain-text article body: <article>/<main> paragraphs only, first ~1800 characters. Text is used for analysis and discarded (72 h TTL); never stored as an archive. */
export function extractBody(html: string): string {
  let h = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>|<aside[\s\S]*?<\/aside>|<!--[\s\S]*?-->/gi, ' ');
  const scope = h.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? h.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? h;
  const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => cleanText(m[1])).filter((t) => t.length > 40);
  return paras.join(' ').slice(0, 1800);
}

export interface EnrichStats { candidates: number; fetched: number; failed: number }

/**
 * PoC finding: ~1 in 4 strong leads do not name the player in the headline ("Player worth 750K out of Raków's squad").
 * For those (and only those) the article page is read once, then the article goes back to the analysis queue with the text.
 */
export async function enrichUnnamed(db: Db, cfg: RadarConfig, http: Http, deadline: number): Promise<EnrichStats> {
  const st: EnrichStats = { candidates: 0, fetched: 0, failed: 0 };
  const rows = await all<{ article_id: string; link: string }>(db, `SELECT DISTINCT r.article_id, a.link FROM reports r JOIN articles a ON a.id = r.article_id
    WHERE r.needs_body = 1 AND a.body_read = 0 AND a.headline_only = 0 AND r.published_at > ? ORDER BY r.published_at DESC LIMIT ?`, [now() - cfg.pipeline.intakeDays * 86_400_000, cfg.pipeline.maxBodyReads]);
  st.candidates = rows.length;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    try {
      const res = await http.get(r.link);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const body = extractBody(res.text);
      if (body.length < 120) throw new Error('no readable body');
      await run(db, 'INSERT OR REPLACE INTO article_bodies (article_id, body, expires_at) VALUES (?,?,?)', [r.article_id, body, now() + 72 * 3_600_000]);
      await run(db, `DELETE FROM reports WHERE article_id = ?`, [r.article_id]);
      await run(db, `UPDATE articles SET state='COLLECTED', body_read=1, priority=priority+5, attempts=0, next_attempt_at=0 WHERE id=?`, [r.article_id]);
      st.fetched++;
    } catch (e) {
      st.failed++;
      await run(db, `UPDATE articles SET body_read=1 WHERE id=?`, [r.article_id]); // do not retry forever
      await run(db, `UPDATE reports SET needs_body=0 WHERE article_id=?`, [r.article_id]);
      log.warn('body read failed', { link: r.link, msg: (e as Error).message });
    }
  }
  await run(db, 'DELETE FROM article_bodies WHERE expires_at < ?', [now()]);
  return st;
}

export interface BodyStats { candidates: number; resolved: number; fetched: number; failed: number }

/**
 * Full text for every headline the triage kept (up to maxBodyReads per run): the analysis then sees the article, not just the title,
 * so names, clubs and evidence quotes are found far more often. News-search links are first resolved to the publisher's own URL.
 * robots.txt and per-host delays are respected (Http); a page that cannot be read simply stays headline-only.
 */
export async function readBodies(db: Db, cfg: RadarConfig, http: Http, deadline: number): Promise<BodyStats> {
  const st: BodyStats = { candidates: 0, resolved: 0, fetched: 0, failed: 0 };
  const rows = await all<{ id: string; link: string; publisher_url: string | null }>(db, `SELECT id, link, publisher_url FROM articles
    WHERE state = 'COLLECTED' AND triage = 1 AND body_read = 0 ORDER BY priority DESC, published_at DESC LIMIT ?`, [cfg.pipeline.maxBodyReads]);
  st.candidates = rows.length;
  let gnStreak = 0;
  // 6 at a time: different publishers run in parallel, Http keeps one request per host every few seconds
  const one = async (r: { id: string; link: string; publisher_url: string | null }) => {
    if (Date.now() > deadline) return;
    let url = r.publisher_url || r.link;
    try {
      if (url.startsWith('https://news.google.com/')) {
        if (gnStreak >= 5) throw new Error('google news resolver unavailable');
        const u = await googleNewsTarget(url).catch(() => null);
        if (!u) { gnStreak++; throw new Error('news link not resolved'); }
        gnStreak = 0; st.resolved++; url = u;
        await run(db, 'UPDATE articles SET publisher_url = ? WHERE id = ?', [u, r.id]);
      }
      const res = await http.get(url);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const body = extractBody(res.text);
      if (body.length < 120) throw new Error('no readable body');
      await run(db, 'INSERT OR REPLACE INTO article_bodies (article_id, body, expires_at) VALUES (?,?,?)', [r.id, body, now() + 72 * 3_600_000]);
      await run(db, `UPDATE articles SET body_read = 1, headline_only = 0 WHERE id = ?`, [r.id]);
      st.fetched++;
    } catch (e) {
      st.failed++;
      await run(db, `UPDATE articles SET body_read = 1 WHERE id = ?`, [r.id]);
      if (st.failed <= 5) log.warn('body read failed', { host: hostOf(url), msg: (e as Error).message });
    }
  };
  for (let i = 0; i < rows.length; i += 6) { if (Date.now() > deadline) break; await Promise.all(rows.slice(i, i + 6).map(one)); }
  return st;
}
