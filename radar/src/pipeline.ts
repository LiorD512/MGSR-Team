import { appendFileSync } from 'node:fs';
import type { Db } from './db.js';
import { all, one, run } from './db.js';
import { loadConfig, seedConfig } from './config.js';
import { Http } from './http.js';
import { Llm } from './llm.js';
import { Quota } from './quota.js';
import { collect, expireQueue, queueDepth } from './stages/collect.js';
import { enrichUnnamed, readBodies } from './stages/enrich.js';
import { analyze, triage } from './stages/analyze.js';
import { clubSearches } from './stages/clubSearches.js';
import { notifyNewPlayers } from './stages/notify.js';
import { rateSources } from './stages/quality.js';
import { TmClient } from './tm.js';
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
    // club searches are (re)built from the Transfermarkt club lists before collecting (cached 30 days; full runs only)
    if (!opt.skipAnalyze) out.clubSearches = await clubSearches(db, new TmClient(db, { minGapMs: cfg.identify.tmGapMs, maxRequests: 80 }), started + 8 * 60_000);
    if (!opt.skipCollect) { out.collect = await collect(db, cfg, http, deadline); out.expired = await expireQueue(db, cfg); }
    if (!opt.skipEnrich) out.enrich = await enrichUnnamed(db, cfg, http, deadline);
    if (!opt.skipAnalyze) {
      out.triage = await triage(db, cfg, llm, deadline);
      // the last ~15 minutes are kept for links + Transfermarkt identification, so new stories always become players in the same run
      out.bodies = await readBodies(db, cfg, http, deadline - 25 * 60_000);
      out.analyze = await analyze(db, cfg, llm, deadline - 15 * 60_000);
    }
    out.links = await resolveLinks(db, cfg, deadline);
    out.identify = await identify(db, cfg, llm, deadline);
    out.score = await scoreAll(db, cfg);
    out.sources = await rateSources(db);
    if (!opt.skipAnalyze) out.notify = await notifyNewPlayers(db);
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
  L.push(`# Press Room pipeline run (Transfer Radar)`, `Duration ${(ms / 1000).toFixed(0)}s · LLM spend this month **$${(q?.monthUsd ?? 0).toFixed(4)} of $${q?.cap ?? 0}** cap`);
  L.push(`\n| Stage | Result |\n|---|---|`);
  for (const k of ['clubSearches', 'collect', 'enrich', 'triage', 'bodies', 'analyze', 'links', 'identify', 'score', 'sources', 'notify'] as const) if (out[k]) L.push(`| ${k} | \`${JSON.stringify(out[k])}\` |`);
  L.push(`| queue depth | ${out.queueDepth} |`);
  L.push(`\n**Database:** ${JSON.stringify(counts)}`);
  L.push(`\n## Top opportunities\n| Score | Level | Player | Club | Country | Origins | Latest headline |\n|---|---|---|---|---|---|---|`);
  for (const t of top) L.push(`| ${t.score} | ${t.level} | ${t.display_name} | ${t.club_name ?? ''} | ${t.country ?? ''} | ${t.independent_origins} | ${String(t.top_headline ?? '').replace(/\|/g, '/').slice(0, 90)} |`);
  // coverage by country: where articles are lost (no articles collected / no transfer story / not identified)
  try {
    const t30 = Date.now() - 30 * 86_400_000;
    const cov = await all<any>(db, `SELECT s.country AS country, COUNT(DISTINCT s.id) AS sources,
        (SELECT COUNT(*) FROM articles a WHERE a.country = s.country AND a.published_at >= ?) AS articles,
        (SELECT COUNT(*) FROM articles a WHERE a.country = s.country AND a.published_at >= ? AND a.triage = 1) AS kept,
        (SELECT COUNT(*) FROM reports r WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ?) AS stories,
        (SELECT COUNT(DISTINCT r.player_id) FROM reports r JOIN players p ON p.id = r.player_id WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ? AND p.identity_status IN ('CONFIRMED','PROBABLE')) AS shown,
        (SELECT COUNT(DISTINCT r.player_id) FROM reports r JOIN players p ON p.id = r.player_id WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ? AND p.excluded_reason = 'star') AS stars,
        (SELECT COUNT(DISTINCT r.player_id) FROM reports r JOIN players p ON p.id = r.player_id WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ? AND p.identity_status = 'EXCLUDED' AND p.excluded_reason <> 'star') AS other_excl,
        (SELECT COUNT(DISTINCT r.player_id) FROM reports r JOIN players p ON p.id = r.player_id WHERE r.country = s.country AND r.final = 1 AND r.published_at >= ? AND p.identity_status = 'UNIDENTIFIED') AS unmatched
      FROM sources s WHERE s.status IN ('APPROVED','PROBATION') GROUP BY s.country ORDER BY shown DESC, stories DESC, articles DESC`, [t30, t30, t30, t30, t30, t30, t30]);
    L.push(`\n## Coverage by country (last 30 days)\nArticles -> kept by the triage -> transfer stories -> players: shown / above EUR 5M / other filtered (staff, other sport...) / not matched yet\n| Country | Sources | Articles | Triage kept | Stories | Shown | Above 5M | Other filtered | Not matched |\n|---|---|---|---|---|---|---|---|---|`);
    for (const c of cov) L.push(`| ${c.country ?? '?'} | ${c.sources} | ${c.articles} | ${c.kept} | ${c.stories} | ${c.shown} | ${c.stars} | ${c.other_excl} | ${c.unmatched} |`);
    // source quality: what each source contributes, and sources that produce nothing
    const q = await all<any>(db, `SELECT s.name, s.country, s.tier, s.reliability, s.status, s.items_seen, s.items_gated, s.items_collected, s.last_article_at,
        (SELECT COUNT(*) FROM reports r WHERE r.source_id = s.id AND r.final = 1 AND r.published_at >= ?) AS stories,
        (SELECT COUNT(DISTINCT r.player_id) FROM reports r JOIN players p ON p.id = r.player_id WHERE r.source_id = s.id AND r.final = 1 AND r.published_at >= ? AND p.identity_status IN ('CONFIRMED','PROBABLE')) AS shown,
        (SELECT COALESCE(SUM(fb_correct), 0) FROM reports r WHERE r.source_id = s.id) AS ok, (SELECT COALESCE(SUM(fb_incorrect), 0) FROM reports r WHERE r.source_id = s.id) AS bad
      FROM sources s WHERE s.status IN ('APPROVED','PROBATION','BROKEN')`, [t30, t30]);
    const top = [...q].sort((a, b) => b.shown - a.shown || b.stories - a.stories).filter((x) => x.stories > 0).slice(0, 25);
    L.push(`\n## Source quality (last 30 days)\n| Source | Country | Tier | Reliability | Seen | Gated | Collected | Stories | Players shown | Feedback ok / wrong |\n|---|---|---|---|---|---|---|---|---|---|`);
    for (const x of top) L.push(`| ${x.name} | ${x.country ?? ''} | ${x.tier} | ${x.reliability} | ${x.items_seen} | ${x.items_gated} | ${x.items_collected} | ${x.stories} | ${x.shown} | ${x.ok} / ${x.bad} |`);
    const dead = q.filter((x) => x.status === 'BROKEN' || !x.last_article_at || Date.now() - Number(x.last_article_at) > 7 * 86_400_000);
    if (dead.length) L.push(`\n**No new articles for 7+ days (${dead.length}):** ${dead.slice(0, 40).map((x) => `${x.name}${x.status === 'BROKEN' ? ' (broken)' : ''}`).join(' · ')}`);
    const ident = await all<any>(db, `SELECT identity_status AS s, COALESCE(excluded_reason, '') AS r, COUNT(*) AS n FROM players WHERE identity_status IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 3 DESC`);
    L.push(`\n**Identification:** ${ident.map((x) => `${x.s}${x.r ? ` (${x.r})` : ''}: ${x.n}`).join(' · ')}`);
    const aiPicks = await all<any>(db, `SELECT p.display_name, p.club_name, p.identity_checks, (SELECT group_concat(DISTINCT r.player_raw) FROM reports r WHERE r.player_id = p.id) AS written
      FROM players p WHERE p.identity_checks LIKE '%"k":"ai"%'`);
    if (aiPicks.length) {
      L.push(`\n## Identified with the AI tie-break (${aiPicks.length})\n| Written as | Picked on Transfermarkt | Club | Why |\n|---|---|---|---|`);
      for (const a of aiPicks) { let why = ''; try { why = (JSON.parse(a.identity_checks).find((c: any) => c.k === 'ai')?.why) ?? ''; } catch { /* */ } L.push(`| ${a.written ?? ''} | ${a.display_name} | ${a.club_name ?? ''} | ${String(why).replace(/\|/g, '/')} |`); }
    }
    // players the identify stage could not match: the evidence, so matching can be improved
    const un = await all<any>(db, `SELECT p.id, p.excluded_reason AS reason, p.identity_candidates AS cands, p.tm_attempts AS attempts,
        r.player_raw, r.player_latin, r.club_raw, r.club_latin, r.outlet, r.country, r.published_at, r.title_orig, r.headline_en, COALESCE(r.publisher_url, r.url) AS url
      FROM players p JOIN reports r ON r.id = (SELECT id FROM reports x WHERE x.player_id = p.id AND x.final = 1 ORDER BY x.published_at DESC LIMIT 1)
      WHERE p.identity_status = 'UNIDENTIFIED' ORDER BY r.published_at DESC LIMIT 40`);
    if (un.length) {
      L.push(`\n## Not matched to Transfermarkt (${un.length})\n| Name as written | Club as written | Country / outlet | Date | Headline (EN) | Original | Reason | Closest TM candidates | Link |\n|---|---|---|---|---|---|---|---|---|`);
      const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 140);
      for (const u of un) {
        let c: any[] = []; try { c = JSON.parse(u.cands || '[]'); } catch { /* */ }
        const cs = c.slice(0, 3).map((x) => `${x.name} (${x.position ?? '?'}, ${x.age ?? '?'}, ${x.club ?? 'no club'}, ${x.s})`).join('; ') || '-';
        L.push(`| ${cell(u.player_raw)}${u.player_latin && u.player_latin !== u.player_raw ? ` / ${cell(u.player_latin)}` : ''} | ${cell(u.club_raw)}${u.club_latin && u.club_latin !== u.club_raw ? ` / ${cell(u.club_latin)}` : ''} | ${cell(u.country)} / ${cell(u.outlet)} | ${new Date(u.published_at).toISOString().slice(0, 10)} | ${cell(u.headline_en)} | ${cell(u.title_orig)} | ${u.reason} | ${cell(cs)} | ${u.url} |`);
      }
    }
  } catch (e) { L.push(`\n(coverage table failed: ${(e as Error).message})`); }
  const md = L.join('\n');
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
