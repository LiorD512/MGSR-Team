import type { Db } from '../db.js';
import { all, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import { hostOf, log, sleep } from '../util.js';

/**
 * Original sources: most items arrive as news.google.com/rss/articles/<id> redirect links (news-search feeds).
 * This stage resolves them to the publisher's own article URL - the same "garturlreq" call the news.google.com page itself makes -
 * so the radar always links to the original article. Direct links are copied as they are. Failures are retried (max 3).
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export interface LinkStats { direct: number; resolved: number; failed: number }

export async function resolveLinks(db: Db, cfg: RadarConfig, deadline: number): Promise<LinkStats> {
  const st: LinkStats = { direct: 0, resolved: 0, failed: 0 };
  // direct publisher links: nothing to resolve
  const d = await run(db, `UPDATE reports SET publisher_url = url WHERE publisher_url IS NULL AND url NOT LIKE 'https://news.google.com/%'`);
  st.direct = d.rowsAffected;
  const rows = await all<{ id: string; url: string; outlet: string | null }>(db, `SELECT id, url, outlet FROM reports WHERE publisher_url IS NULL AND url LIKE 'https://news.google.com/%' AND link_attempts < 3
      AND (final = 1 OR player_id IS NOT NULL) ORDER BY published_at DESC LIMIT ?`, [cfg.identify.maxLinkResolvesPerRun]);
  let streak = 0;
  for (const r of rows) {
    if (Date.now() > deadline || streak >= 5) break;
    const u = await googleNewsTarget(r.url).catch(() => null);
    if (u) {
      streak = 0; st.resolved++;
      await run(db, `UPDATE reports SET publisher_url = ?, publisher_host = ?, outlet = CASE WHEN outlet IS NULL OR outlet = 'Google News' THEN ? ELSE outlet END WHERE id = ?`, [u, hostOf(u), hostOf(u), r.id]);
    } else {
      streak++; st.failed++;
      await run(db, 'UPDATE reports SET link_attempts = link_attempts + 1 WHERE id = ?', [r.id]);
    }
    await sleep(1200 + Math.random() * 800);
  }
  // copy publisher hosts for direct links
  await run(db, `UPDATE reports SET publisher_host = substr(replace(replace(publisher_url, 'https://', ''), 'http://', ''), 1, instr(replace(replace(publisher_url, 'https://', ''), 'http://', '') || '/', '/') - 1)
      WHERE publisher_host IS NULL AND publisher_url IS NOT NULL`);
  if (st.failed) log.warn('google news links not resolved', { failed: st.failed });
  return st;
}

export async function googleNewsTarget(link: string): Promise<string | null> {
  const id = new URL(link).pathname.split('/').pop();
  if (!id) return null;
  const page = await fetch(`https://news.google.com/articles/${id}`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.8' }, signal: AbortSignal.timeout(15_000) });
  if (!page.ok) return null;
  const html = await page.text();
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) return null;
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
  const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': UA },
    body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])), signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const txt = await res.text();
  const m = txt.match(/\[\\"garturlres\\",\\"(.*?)\\"/);
  if (!m) return null;
  const url = m[1].replace(/\\\\u003d/g, '=').replace(/\\\\u0026/g, '&').replace(/\\\//g, '/');
  return /^https?:\/\//.test(url) && !url.includes('news.google.com') ? url : null;
}
