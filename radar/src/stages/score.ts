import type { Db } from '../db.js';
import { all, one, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import { scorePlayer, type ScoreReport } from '../scoring.js';
import { correlatePlayer } from './correlate.js';
import type { Tier, Verification } from '../taxonomy.js';
import { COUNTER_SIGNALS } from '../taxonomy.js';
import { DAY, norm, now, shortHash } from '../util.js';

interface RepRow {
  id: string; published_at: number; signals: string; verification: string; origin_key: string | null; outlet: string | null; headline_en: string | null; title_orig: string;
  url: string; final: number; claim_type: string | null; quote: string | null; tier: string | null; tier_override: string | null;
}
interface PlayerRow { id: string; display_name: string; club_name: string | null; country: string | null; league: string | null; position: string | null; contract_expires: number | null; contract_verified: number; on_shortlist: number; roster_player_id: string | null; dob: string | null; nationalities: string | null }

export interface ScoreStats { players: number; scored: number; removed: number; alerts: number }

export async function scoreAll(db: Db, cfg: RadarConfig, onlyIds?: string[]): Promise<ScoreStats> {
  const st: ScoreStats = { players: 0, scored: 0, removed: 0, alerts: 0 };
  const ids = onlyIds ?? (await all<{ player_id: string }>(db, `SELECT DISTINCT player_id FROM reports WHERE player_id IS NOT NULL`)).map((r) => r.player_id);
  st.players = ids.length;
  for (const id of ids) {
    const r = await scoreOne(db, cfg, id);
    if (r === 'scored') st.scored++; else if (r === 'removed') st.removed++;
  }
  st.alerts = await makeAlerts(db, cfg);
  return st;
}

export async function scoreOne(db: Db, cfg: RadarConfig, playerId: string): Promise<'scored' | 'removed' | 'skipped'> {
  const player = await one<PlayerRow>(db, 'SELECT * FROM players WHERE id = ?', [playerId]);
  if (!player) return 'skipped';
  await correlatePlayer(db, playerId);
  const rows = await all<RepRow>(db, `SELECT r.id, r.published_at, r.signals, r.verification, r.origin_key, r.outlet, r.headline_en, r.title_orig, r.url, r.final, r.claim_type, r.evidence_quote AS quote,
      s.tier, s.tier_override FROM reports r LEFT JOIN sources s ON s.id = r.source_id WHERE r.player_id = ? ORDER BY r.published_at DESC`, [playerId]);
  const reports: ScoreReport[] = rows.map((r) => ({
    id: r.id, publishedAt: r.published_at, signals: JSON.parse(r.signals) as string[], verification: r.verification as Verification, tier: ((r.tier_override || r.tier || 'C') as Tier),
    originKey: r.origin_key ?? r.id, outlet: r.outlet ?? '', headlineEn: r.headline_en ?? r.title_orig, url: r.url, final: !!r.final, claimType: r.claim_type ?? '',
  }));
  const hasPositive = reports.some((r) => r.final);
  const t = now();
  const res = scorePlayer(reports, { contractExpires: player.contract_expires, contractVerified: !!player.contract_verified, onShortlist: !!player.on_shortlist, inRoster: !!player.roster_player_id }, cfg, t);

  // timeline (rebuilt from reports; cheap and always consistent)
  await run(db, 'DELETE FROM timeline WHERE player_id = ?', [playerId]);
  for (const r of rows) {
    const sig = JSON.parse(r.signals) as string[];
    const isCounter = sig.some((s) => COUNTER_SIGNALS.has(s));
    if (!r.final && !isCounter) continue;
    await run(db, `INSERT OR REPLACE INTO timeline (id, player_id, at, reported_at, kind, report_id, signals, verification, outlet, tier, url, headline_en, title_orig, quote, claim_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [shortHash(`${playerId}|${r.id}`), playerId, r.published_at, r.published_at, isCounter ? 'STATUS_CHANGE' : 'REPORT', r.id, r.signals, r.verification, r.outlet, r.tier_override || r.tier || 'C', r.url, r.headline_en, r.title_orig, r.quote, r.claim_type]);
  }

  const lastLive = reports.filter((r) => r.final).map((r) => r.publishedAt);
  const stale = !lastLive.length || t - Math.max(...lastLive) > cfg.pipeline.archiveAfterDays * DAY;
  if (!hasPositive || (stale && !res.closed) || (res.activeReports === 0 && !res.closed)) {
    const del = await run(db, 'DELETE FROM opportunities WHERE player_id = ?', [playerId]);
    return del.rowsAffected ? 'removed' : 'skipped';
  }

  const prev = await one<{ score: number; closed: number; first_seen_at: number; last_change_at: number }>(db, 'SELECT score, closed, first_seen_at, last_change_at FROM opportunities WHERE player_id = ?', [playerId]);
  const week = await one<{ score: number }>(db, 'SELECT score FROM score_history WHERE player_id = ? AND at <= ? ORDER BY at DESC LIMIT 1', [playerId, t - 7 * DAY]);
  const changed = !prev || prev.score !== res.score || !!prev.closed !== res.closed;
  const first = Math.min(...reports.map((r) => r.publishedAt));
  const top = res.topReport;
  const searchText = norm(`${player.display_name} ${player.club_name ?? ''} ${player.country ?? ''}`);
  await run(db, `INSERT INTO opportunities (player_id, score, raw_score, level, closed, score_delta_7d, urgency, urgency_score, categories, loan_available, transfer_available, no_recent_minutes, in_roster, on_shortlist,
      top_headline, top_outlet, top_tier, best_verification, best_tier, report_count, independent_origins, action, explanation, config_version, first_seen_at, last_report_at, last_change_at, updated_at,
      display_name, club_name, country, league, position, age, nationality, contract_expires, search_text)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(player_id) DO UPDATE SET score=excluded.score, raw_score=excluded.raw_score, level=excluded.level, closed=excluded.closed, score_delta_7d=excluded.score_delta_7d, urgency=excluded.urgency,
      urgency_score=excluded.urgency_score, categories=excluded.categories, loan_available=excluded.loan_available, transfer_available=excluded.transfer_available, in_roster=excluded.in_roster, on_shortlist=excluded.on_shortlist,
      top_headline=excluded.top_headline, top_outlet=excluded.top_outlet, top_tier=excluded.top_tier, best_verification=excluded.best_verification, best_tier=excluded.best_tier, report_count=excluded.report_count,
      independent_origins=excluded.independent_origins, action=excluded.action, explanation=excluded.explanation, config_version=excluded.config_version, first_seen_at=excluded.first_seen_at,
      last_report_at=excluded.last_report_at, last_change_at=excluded.last_change_at, updated_at=excluded.updated_at, display_name=excluded.display_name, club_name=excluded.club_name, country=excluded.country,
      league=excluded.league, position=excluded.position, contract_expires=excluded.contract_expires, search_text=excluded.search_text`, [
    playerId, res.score, res.rawScore, res.level, res.closed ? 1 : 0, week ? res.score - week.score : 0, res.urgency, res.urgencyScore, JSON.stringify(res.categories), res.loanAvailable ? 1 : 0, res.transferAvailable ? 1 : 0, 0,
    player.roster_player_id ? 1 : 0, player.on_shortlist ? 1 : 0, top?.headlineEn ?? null, top?.outlet ?? null, top?.tier ?? null, res.bestVerification, res.bestTier, rows.filter((r) => r.final).length, res.independentOrigins,
    res.action, JSON.stringify({ components: res.components, caps: res.caps, modifiers: res.modifiers, independentOrigins: res.independentOrigins, independencePoints: res.independencePoints, activeReports: res.activeReports }),
    cfg.scoring.version, prev?.first_seen_at ?? first, res.lastReportAt, changed ? t : (prev?.last_change_at ?? t), t,
    player.display_name, player.club_name, player.country, player.league, player.position, null, null, player.contract_expires, searchText]);
  if (changed) await run(db, 'INSERT INTO score_history (player_id, at, score, level, components, config_version) VALUES (?,?,?,?,?,?)', [playerId, t, res.score, res.level, JSON.stringify(res.components), cfg.scoring.version]);
  return 'scored';
}

/** Dashboard alerts (global feed, user_id='*'): new Monitor+ player, High priority, big jump, closed. Per-user rules + FCM come next. */
async function makeAlerts(db: Db, cfg: RadarConfig): Promise<number> {
  const rows = await all<{ player_id: string; display_name: string; club_name: string | null; score: number; level: string; closed: number; score_delta_7d: number; top_headline: string | null; last_change_at: number; first_seen_at: number }>(
    db, `SELECT player_id, display_name, club_name, score, level, closed, score_delta_7d, top_headline, last_change_at, first_seen_at FROM opportunities WHERE last_change_at >= ?`, [now() - 2 * DAY]);
  let n = 0;
  for (const r of rows) {
    const events: { type: string; key: string; title: string }[] = [];
    if (r.closed) events.push({ type: 'OPPORTUNITY_CLOSED', key: 'closed', title: `${r.display_name}: move reported - opportunity likely closed` });
    else if (r.score >= cfg.scoring.levels.high) events.push({ type: 'HIGH_PRIORITY', key: `high`, title: `High-priority opportunity: ${r.display_name}${r.club_name ? ` (${r.club_name})` : ''}` });
    else if (r.score >= cfg.scoring.levels.monitor) events.push({ type: 'NEW_MONITOR', key: `monitor`, title: `New player to monitor: ${r.display_name}${r.club_name ? ` (${r.club_name})` : ''}` });
    if (!r.closed && r.score_delta_7d >= 15) events.push({ type: 'SCORE_JUMP', key: `jump-${Math.floor(r.score / 10)}`, title: `Score up ${r.score_delta_7d} this week: ${r.display_name}` });
    for (const e of events) {
      const res = await run(db, `INSERT OR IGNORE INTO alerts (id, user_id, created_at, type, player_id, title, body, score, dedupe_key) VALUES (?,?,?,?,?,?,?,?,?)`,
        [shortHash(`*|${r.player_id}|${e.key}`), '*', now(), e.type, r.player_id, e.title, r.top_headline, r.score, `${r.player_id}:${e.key}`]);
      n += res.rowsAffected;
    }
  }
  return n;
}
