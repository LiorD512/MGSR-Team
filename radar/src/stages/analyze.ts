import type { Db } from '../db.js';
import { all, one, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import { Llm, BudgetExhausted } from '../llm.js';
import { PROMPT_VERSION, buildUserPrompt, type AiItem } from '../prompt.js';
import { evaluate } from '../rules.js';
import { resolvePlayer } from './resolve.js';
import { chunk, hostOf, log, now, shortHash } from '../util.js';
import { sourceTier } from '../sources.js';
import type { Tier } from '../taxonomy.js';

interface ArticleRow {
  id: string; source_id: string; outlet: string | null; link: string; title_orig: string; excerpt: string | null; lang: string | null; country: string | null;
  published_at: number; collected_at: number; headline_only: number; attempts: number; priority: number; body_read: number; publisher_url?: string | null;
}
export interface AnalyzeStats { selected: number; analyzed: number; failed: number; reports: number; final: number; needsBody: number; stopReason: string; usd: number; freeCalls: number; paidCalls: number }

/** Highest-priority queued articles first, no country may take more than perCountryShare of a run (keeps coverage broad). */
async function selectBatch(db: Db, cfg: RadarConfig): Promise<ArticleRow[]> {
  const limit = cfg.pipeline.maxItemsPerRun;
  // with triage on, only headlines the triage kept go to the full (expensive) analysis
  const rows = await all<ArticleRow>(db, `SELECT * FROM articles WHERE state='COLLECTED' AND next_attempt_at <= ? AND (triage = 1 OR ? = 0) ORDER BY priority DESC, published_at DESC LIMIT ?`,
    [now(), cfg.triage.enabled ? 1 : 0, limit * 2]);
  const cap = Math.max(1, Math.ceil(limit * cfg.pipeline.perCountryShare));
  const per: Record<string, number> = {}; const out: ArticleRow[] = [];
  for (const r of rows) {
    const c = r.country ?? '?'; per[c] = (per[c] ?? 0) + 1;
    if (per[c] <= cap) out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export async function analyze(db: Db, cfg: RadarConfig, llm: Llm, deadline: number): Promise<AnalyzeStats> {
  const st: AnalyzeStats = { selected: 0, analyzed: 0, failed: 0, reports: 0, final: 0, needsBody: 0, stopReason: '', usd: 0, freeCalls: 0, paidCalls: 0 };
  if (!llm.configured) { st.stopReason = 'no LLM key configured'; return st; }
  const arts = await selectBatch(db, cfg);
  st.selected = arts.length;

  for (const batch of chunk(arts, cfg.pipeline.batchSize)) {
    if (Date.now() > deadline) { st.stopReason = 'run time budget'; break; }
    const bodies = new Map<string, string>();
    for (const a of batch) {
      const b = await one<{ body: string }>(db, 'SELECT body FROM article_bodies WHERE article_id = ?', [a.id]);
      if (b) bodies.set(a.id, b.body);
    }
    const prompt = buildUserPrompt(batch.map((a, i) => ({
      id: i, country: a.country ?? '', lang: a.lang ?? '', outlet: a.outlet ?? '', date: new Date(a.published_at).toISOString().slice(0, 10), title: a.title_orig,
      text: bodies.get(a.id) ?? a.excerpt ?? '',
    })));
    let out: AiItem[] = [];
    try {
      out = await llm.analyze(prompt);
    } catch (e) {
      if (e instanceof BudgetExhausted) { st.stopReason = e.message; break; }
      log.error('LLM batch failed', { msg: (e as Error).message });
      for (const a of batch) await run(db, `UPDATE articles SET attempts=attempts+1, next_attempt_at=?, state=CASE WHEN attempts>=4 THEN 'DEAD' ELSE state END WHERE id=?`, [now() + 30 * 60_000, a.id]);
      st.failed += batch.length; continue;
    }
    for (let i = 0; i < batch.length; i++) {
      const a = batch[i];
      const ai = out.find((o) => o.id === i) ?? out[i];
      if (!ai) { st.failed++; await run(db, `UPDATE articles SET attempts=attempts+1, next_attempt_at=?, state=CASE WHEN attempts>=4 THEN 'DEAD' ELSE state END WHERE id=?`, [now() + 30 * 60_000, a.id]); continue; }
      const res = await persistFromAi(db, cfg, a, ai, bodies.get(a.id) ?? '', llm.configured ? 'gemini' : 'n/a');
      st.analyzed++; st.reports += res.reports; st.final += res.final; st.needsBody += res.needsBody;
      await run(db, `UPDATE articles SET state='ANALYZED', analyzed_at=?, prompt_ver=?, model_id=? WHERE id=?`, [now(), PROMPT_VERSION, cfg.llm.model, a.id]);
      await run(db, 'DELETE FROM article_bodies WHERE article_id = ?', [a.id]);
    }
  }
  st.usd = llm.stats.usd; st.freeCalls = llm.stats.free; st.paidCalls = llm.stats.paid;
  return st;
}

/** Applies the rule layer to one AI item and stores the report (+ resolves the player). Shared by the live pipeline and the PoC importer. */
export async function persistFromAi(db: Db, cfg: RadarConfig, a: ArticleRow, ai: AiItem, text: string, modelId: string): Promise<{ reports: number; final: number; needsBody: number }> {
  const signals = ai.signals ?? [];
  if (!signals.length) return { reports: 0, final: 0, needsBody: 0 };
  const tier = (await sourceTier(db, a.source_id)) as Tier;
  const ev = evaluate(ai, { tier, headlineOnly: !!a.headline_only, text: `${a.title_orig} ${a.excerpt ?? ''} ${text}`, publishedAt: a.published_at, now: now(), cfg });
  const reportId = shortHash(`${a.id}|${ai.player || ai.playerLatin || 'noname'}|${signals.join(',')}`);
  let playerId: string | null = null; let status = 'UNRESOLVED'; let conf = 0;
  if (ev.resolvable) {
    const r = await resolvePlayer(db, { name: ai.player, nameLatin: ai.playerLatin, club: ai.club, clubLatin: ai.clubLatin, country: (ai.clubCountry || '').trim() || a.country, countryCertain: !!(ai.clubCountry || '').trim(), reportId });
    playerId = r.playerId; status = r.status; conf = r.confidence;
  }
  await run(db, `INSERT OR REPLACE INTO reports (id, article_id, source_id, outlet, url, published_at, collected_at, lang, country, player_raw, player_latin, club_raw, club_latin, player_id, resolution_status, resolution_conf,
      signals, claim_type, strength, attributed_to, verification, evidence_quote, evidence_ok, event_date, historical, sport, squad_type, role, star_player, title_orig, headline_en, why, ai_actionable, final, drop_reason,
      needs_body, prompt_ver, model_id, headline_only)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    reportId, a.id, a.source_id, a.outlet, a.link, a.published_at, a.collected_at, a.lang, a.country, ai.player || null, ai.playerLatin || null, ai.club || null, ai.clubLatin || null, playerId, status, conf,
    JSON.stringify(signals), ai.claimType, ai.strength, ai.attributedTo || null, ev.verification, ai.evidenceQuote || null, ev.evidenceOk ? 1 : 0, ev.eventDate, ai.historical ? 1 : 0, ai.sport, ai.squadType, ai.role,
    ai.starPlayer ? 1 : 0, a.title_orig, ai.titleEn || null, ai.why || null, ai.actionable ? 1 : 0, ev.final ? 1 : 0, ev.reasons.join('; ') || null, ev.needsBody ? 1 : 0, PROMPT_VERSION, modelId, a.headline_only]);
  if (a.publisher_url) await run(db, `UPDATE reports SET publisher_url = ?, publisher_host = ? WHERE id = ?`, [a.publisher_url, hostOf(a.publisher_url), reportId]);
  if (playerId) {
    await run(db, 'UPDATE sources SET relevant_reports = relevant_reports + 1 WHERE id = ? AND ? = 1', [a.source_id, ev.final ? 1 : 0]);
  }
  return { reports: 1, final: ev.final ? 1 : 0, needsBody: ev.needsBody ? 1 : 0 };
}

/* ------------------------------------------------------------------ triage */
export interface TriageStats { selected: number; kept: number; dropped: number; calls: number; failed: number; stopReason: string }
const TRIAGE_SCHEMA = { type: 'OBJECT', properties: { keep: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['keep'] };
const TRIAGE_SYSTEM = `You pre-screen local football news headlines (many languages) for a football agency that recruits MEN'S CLUB footballers.
Return the #ids of items that COULD be about a men's club footballer (named or not) who may become available or whose situation changes:
wants to leave, club wants to sell / release / terminate, contract ending or not renewed, loan (out or ending), left out of the squad / frozen out / sent to the B team,
conflict or discipline, unpaid wages, free agent / without club, player close to leaving, a transfer completed or a player returning to the squad.
Do NOT return: match reports, results, line-ups, previews, goals, statistics, coaches' comments about a game, injuries only, other sports, national teams, women, youth,
betting, TV listings, general news. When unsure, KEEP the item (recall matters more than precision here).`;

/** Cheap first pass: ~60 headlines per request, only the id list comes back. Drops the clear non-stories before the full analysis. */
export async function triage(db: Db, cfg: RadarConfig, llm: Llm, deadline: number): Promise<TriageStats> {
  const st: TriageStats = { selected: 0, kept: 0, dropped: 0, calls: 0, failed: 0, stopReason: '' };
  if (!cfg.triage.enabled) { st.stopReason = 'disabled'; return st; }
  if (!llm.configured) { st.stopReason = 'no LLM key configured'; return st; }
  const rows = await all<{ id: string; title_orig: string; excerpt: string | null; country: string | null; lang: string | null }>(db,
    `SELECT id, title_orig, excerpt, country, lang FROM articles WHERE state = 'COLLECTED' AND triage IS NULL ORDER BY priority DESC, published_at DESC LIMIT ?`, [cfg.triage.maxPerRun]);
  st.selected = rows.length;
  for (const batch of chunk(rows, cfg.triage.batchSize)) {
    if (Date.now() > deadline) { st.stopReason = 'run time budget'; break; }
    const prompt = batch.map((a, i) => `#${i} | ${a.country ?? ''} | ${a.title_orig}${a.excerpt ? ` | ${a.excerpt.slice(0, 160)}` : ''}`).join('\n');
    let keep: Set<number>;
    try {
      const r = await llm.json<{ keep: number[] }>(TRIAGE_SYSTEM, prompt, TRIAGE_SCHEMA);
      st.calls++;
      if (!r || !Array.isArray(r.keep)) { st.failed += batch.length; continue; } // unparsed reply: the batch stays untriaged and is retried next run
      keep = new Set(r.keep.filter((n) => Number.isInteger(n)));
    } catch (e) {
      if (e instanceof BudgetExhausted) { st.stopReason = e.message; break; }
      log.error('triage batch failed', { msg: (e as Error).message }); st.failed += batch.length; continue;
    }
    for (let i = 0; i < batch.length; i++) {
      if (keep.has(i)) { st.kept++; await run(db, `UPDATE articles SET triage = 1, priority = priority + 2 WHERE id = ?`, [batch[i].id]); }
      else { st.dropped++; await run(db, `UPDATE articles SET triage = 0, state = 'SKIPPED', skip_reason = 'TRIAGE' WHERE id = ?`, [batch[i].id]); }
    }
  }
  return st;
}
