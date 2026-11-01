import { appendFileSync } from 'node:fs';
import type { Db } from './db.js';
import { all, one, run } from './db.js';
import { loadConfig, seedConfig } from './config.js';
import { Http } from './http.js';
import { Llm } from './llm.js';
import { Quota } from './quota.js';
import { collect, expireQueue, queueDepth } from './stages/collect.js';
import { enrichUnnamed } from './stages/enrich.js';
import { analyze } from './stages/analyze.js';
import { scoreAll } from './stages/score.js';
import { resolveLinks } from './stages/links.js';
import { identify } from './stages/identify.js';
import { log, now, sleep } from './util.js';
import { seedSources } from './sources.js';
import { migrate } from './db.js';

export interface RunOptions { skipCollect?: boolean; skipAnalyze?: boolean; skipEnrich?: boolean; owner?: string }

async function takeLease(db: Db, name: string, owner: string, minutes: number): Promise<boolean> {
  await run(db, 'INSERT OR IGNORE INTO jobs (name, lease_until) VALUES (?, 0)', [name]);
  const r = await run(db, 'UPDATE jobs SET lease_until=?, owner=?, last_start=?, last_status=? WHERE name=? AND lease_until < ?', [now() + minutes * 60_000, owner, now(), 'RUNNING', name, now()]);
  return r.rowsAffected === 1;
}
async function releaseLease(db: Db, name: string, status: string, summary: string) {
  await run(db, 'UPDATE jobs SET lease_until=0, last_end=?, last_status=?, summary=? WHERE name=?', [now(), status, summary.slice(0, 2000), name]);
}

export async function runPipeline(db: Db, opt: RunOptions = {}) {
  await migrate(db);
  await seedConfig(db);
  await seedSources(db);
  const cfg = await loadConfig(db);
  const owner = opt.owner ?? `run-${process.env.GITHUB_RUN_ID ?? process.pid}`;
  // another run (e.g. the free collect-only job) may hold the lease: wait for it instead of silently skipping this run
  let got = await takeLease(db, 'pipeline', owner, cfg.pipeline.runBudgetMinutes + 15);
  const giveUp = Date.now() + 15 * 60_000;
  while (!got && Date.now() < giveUp) { log.info('pipeline lease is held by another run - waiting 30 s'); await sleep(30_000); got = await takeLease(db, 'pipeline', owner, cfg.pipeline.runBudgetMinutes + 15); }
  if (!got) { log.warn('another pipeline run still holds the lease after 15 min - exiting'); return null; }
  const started = now();
  const deadline = started + cfg.pipeline.runBudgetMinutes * 60_000;
  const trigger = process.env.GITHUB_EVENT_NAME || 'manual'; // 'schedule' for the 3-day timer, 'push'/'workflow_dispatch' for tests and manual runs
  const logId = (await run(db, 'INSERT INTO run_log (job, started_at, status, trigger) VALUES (?,?,?,?)', ['pipeline', started, 'RUNNING', trigger])).lastInsertRowid;
  const quota = new Quota(db, cfg);
  const llm = new Llm(cfg, quota);
  const http = new Http(db, cfg);
  const out: Record<string, unknown> = {};
  try {
    if (!opt.skipCollect) { out.collect = await collect(db, cfg, http, deadline); out.expired = await expireQueue(db, cfg); }
    if (!opt.skipEnrich) out.enrich = await enrichUnnamed(db, cfg, http, deadline);
    if (!opt.skipAnalyze) out.analyze = await analyze(db, cfg, llm, deadline);
    out.links = await resolveLinks(db, cfg, deadline);
    out.identify = await identify(db, cfg, llm, deadline);
    out.score = await scoreAll(db, cfg);
    out.queueDepth = await queueDepth(db);
    out.quota = await quota.summary();
    await run(db, 'UPDATE run_log SET ended_at=?, status=?, summary=? WHERE id=?', [now(), 'OK', JSON.stringify(out).slice(0, 4000), Number(logId)]);
    await releaseLease(db, 'pipeline', 'OK', JSON.stringify(out));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await run(db, 'UPDATE run_log SET ended_at=?, status=?, summary=? WHERE id=?', [now(), 'FAILED', msg, Number(logId)]);
    await releaseLease(db, 'pipeline', 'FAILED', msg);
    throw e;
  }
  await writeSummary(db, out, Date.now() - started);
  return out;
}

export async function writeSummary(db: Db, out: Record<string, any>, ms: number) {
  const top = await all<any>(db, `SELECT display_name, club_name, country, score, level, independent_origins, top_headline FROM opportunities WHERE closed = 0 ORDER BY score DESC LIMIT 12`);
  const counts = await one<any>(db, `SELECT (SELECT COUNT(*) FROM articles) AS articles, (SELECT COUNT(*) FROM reports) AS reports, (SELECT COUNT(*) FROM reports WHERE final=1) AS final_reports,
    (SELECT COUNT(*) FROM players) AS players, (SELECT COUNT(*) FROM opportunities) AS opportunities, (SELECT COUNT(*) FROM sources WHERE status IN ('APPROVED','PROBATION')) AS active_sources,
    (SELECT COUNT(*) FROM sources WHERE status='BROKEN') AS broken_sources`);
  const q = out.quota as { cap: number; monthUsd: number } | undefined;
  const L: string[] = [];
  L.push(`# Transfer Radar pipeline run`, `Duration ${(ms / 1000).toFixed(0)}s · LLM spend this month **$${(q?.monthUsd ?? 0).toFixed(4)} of $${q?.cap ?? 0}** cap`);
  L.push(`\n| Stage | Result |\n|---|---|`);
  for (const k of ['collect', 'enrich', 'analyze', 'links', 'identify', 'score'] as const) if (out[k]) L.push(`| ${k} | \`${JSON.stringify(out[k])}\` |`);
  L.push(`| queue depth | ${out.queueDepth} |`);
  L.push(`\n**Database:** ${JSON.stringify(counts)}`);
  L.push(`\n## Top opportunities\n| Score | Level | Player | Club | Country | Origins | Latest headline |\n|---|---|---|---|---|---|---|`);
  for (const t of top) L.push(`| ${t.score} | ${t.level} | ${t.display_name} | ${t.club_name ?? ''} | ${t.country ?? ''} | ${t.independent_origins} | ${String(t.top_headline ?? '').replace(/\|/g, '/').slice(0, 90)} |`);
  // coverage by country: where articles are lost (no articles collected / no transfer story / not identified)
  try {
    const t30 = Date.now() - 30 * 86_400_000;
    const cov = await all<any>(db, `SELECT s.country AS country, COUNT(DISTINCT s.id) AS sources,
        (SELECT COUNT(*) FROM articles a WHERE a.country = s.country AND a.published_at >= ?) AS articles,
        (SELECT COUNT(*) FROM articles a WHERE a.country = s.country AND a.published_at >= ? AND a.state = 'ANALYZED') AS analyzed,
        (SELECT COUNT(*) FROM reports r WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ?) AS stories,
        (SELECT COUNT(DISTINCT r.player_id) FROM reports r JOIN players p ON p.id = r.player_id WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ? AND p.identity_status IN ('CONFIRMED','PROBABLE')) AS shown
      FROM sources s WHERE s.status IN ('APPROVED','PROBATION') GROUP BY s.country ORDER BY shown DESC, stories DESC, articles DESC`, [t30, t30, t30, t30]);
    L.push(`\n## Coverage by country (last 30 days)\n| Country | Sources | Articles | Analyzed | Transfer stories | Players shown |\n|---|---|---|---|---|---|`);
    for (const c of cov) L.push(`| ${c.country ?? '?'} | ${c.sources} | ${c.articles} | ${c.analyzed} | ${c.stories} | ${c.shown} |`);
    const ident = await all<any>(db, `SELECT identity_status AS s, COALESCE(excluded_reason, '') AS r, COUNT(*) AS n FROM players WHERE identity_status IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 3 DESC`);
    L.push(`\n**Identification:** ${ident.map((x) => `${x.s}${x.r ? ` (${x.r})` : ''}: ${x.n}`).join(' · ')}`);
  } catch (e) { L.push(`\n(coverage table failed: ${(e as Error).message})`); }
  const md = L.join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
