import type { RadarConfig } from './config.js';
import { COUNTER_SIGNALS, SIGNAL_COMPONENT, CATEGORY_LABEL, type Component, type Level, type Tier, type Verification } from './taxonomy.js';
import { DAY } from './util.js';

/**
 * Opportunity scoring engine (spec R10). PURE: no I/O, no LLM. Same inputs + same config => same score.
 * component_k = weight_k * confidence * recency   (best signal per component; duplicates never add)
 *   confidence = floor + span * tierFactor * verificationFactor        (v1 calibration from the PoC mock)
 *   recency    = recencyFloor + (1-recencyFloor) * 0.5^(age/halfLife)  (only while age <= signal max life, else 0)
 * independence = table[# independent origins]; contract = from expiry date; guards: anti-rumor cap, single-origin cap, closed.
 */
export interface ScoreReport {
  id: string; publishedAt: number; signals: string[]; verification: Verification; tier: Tier; originKey: string;
  outlet: string; headlineEn: string; url: string; final: boolean; claimType: string;
}
export interface PlayerFacts { contractExpires?: number | null; contractVerified?: boolean; inRoster?: boolean; onShortlist?: boolean }

export interface ComponentScore { key: string; points: number; max: number; signal?: string; reportId?: string; outlet?: string; tier?: Tier; verification?: Verification; confidence?: number; recency?: number; ageDays?: number; note?: string }
export interface ScoreResult {
  score: number; rawScore: number; level: Level; closed: boolean; components: ComponentScore[]; independentOrigins: number; independencePoints: number;
  caps: string[]; modifiers: string[]; bestTier: Tier; bestVerification: Verification; categories: string[]; loanAvailable: boolean; transferAvailable: boolean;
  urgency: 'High' | 'Medium' | 'Low' | 'Closed'; urgencyScore: number; action: string; lastReportAt: number; topReport: ScoreReport | null; activeReports: number;
}

const TIER_ORDER: Tier[] = ['A', 'B', 'C', 'D'];
const bestOf = <T,>(arr: T[], rank: (t: T) => number) => arr.reduce((a, b) => (rank(b) < rank(a) ? b : a), arr[0]);

export function levelOf(score: number, cfg: RadarConfig, closed = false): Level {
  if (closed) return 'Closed';
  const l = cfg.scoring.levels;
  return score >= l.exceptional ? 'Exceptional' : score >= l.high ? 'High priority' : score >= l.potential ? 'Potential' : score >= l.monitor ? 'Monitor' : 'Low priority';
}

export function scorePlayer(reports: ScoreReport[], facts: PlayerFacts, cfg: RadarConfig, now: number): ScoreResult {
  const S = cfg.scoring;
  const reps = [...reports].sort((a, b) => b.publishedAt - a.publishedAt);
  const positive = reps.filter((r) => r.final && r.signals.some((s) => SIGNAL_COMPONENT[s]));
  const counters = reps.filter((r) => r.signals.some((s) => COUNTER_SIGNALS.has(s)));
  const modifiers: string[] = []; const caps: string[] = [];

  const newestCounter = (code: string) => counters.filter((r) => r.signals.includes(code)).sort((a, b) => b.publishedAt - a.publishedAt)[0];

  // status changes: later reports that supersede earlier positive signals
  const completed = newestCounter('TRANSFER_COMPLETED');
  const firstPositiveAt = positive.length ? Math.min(...positive.map((r) => r.publishedAt)) : Infinity;
  const closed = !!completed && completed.publishedAt >= firstPositiveAt;
  const returned = newestCounter('RETURNED_TO_SQUAD');
  const renewed = newestCounter('RENEWED_CONTRACT');
  const denied = newestCounter('DENIED_BY_CLUB');
  const injured = newestCounter('INJURED') ?? newestCounter('SUSPENDED');
  const injuryActive = !!injured && now - injured.publishedAt <= 21 * DAY;

  const comps: Record<string, ComponentScore> = {};
  for (const r of positive) {
    const age = (now - r.publishedAt) / DAY;
    const conf = S.confidenceFloor + S.confidenceSpan * (S.tierFactor[r.tier] ?? 0.5) * (S.verificationFactor[r.verification] ?? 0.5);
    for (const sig of r.signals) {
      const c = SIGNAL_COMPONENT[sig] as Component | undefined; if (!c) continue;
      const life = S.maxAgeDays[c] ?? 30;
      if (age > life) continue; // expired signal (R22.3)
      let superseded = false;
      if (c === 'exclusion' && returned && returned.publishedAt > r.publishedAt) superseded = true;
      if (c === 'availability' && renewed && renewed.publishedAt > r.publishedAt) superseded = true;
      if (superseded) continue;
      if ((c === 'exclusion' || c === 'playingTime') && injuryActive) continue;
      let contradiction = 1;
      if (c === 'availability' && denied && denied.publishedAt > r.publishedAt && (denied.tier === 'A' || denied.tier === 'B')) contradiction = 0.5;
      const rec = S.recencyFloor + (1 - S.recencyFloor) * Math.pow(0.5, age / (S.halfLifeDays[c] ?? 21));
      const max = S.weights[c] ?? 0;
      const pts = max * conf * rec * contradiction;
      if (!comps[c] || pts > comps[c].points) comps[c] = { key: c, points: pts, max, signal: sig, reportId: r.id, outlet: r.outlet, tier: r.tier, verification: r.verification, confidence: +conf.toFixed(2), recency: +rec.toFixed(2), ageDays: +age.toFixed(1), note: contradiction < 1 ? 'club denial reduces this' : undefined };
    }
  }
  if (injuryActive) modifiers.push('Recent injury/suspension explains absence: sporting-status points neutralised');
  if (returned) modifiers.push('Player returned to the squad after earlier exclusion reports');
  if (renewed) modifiers.push('Contract renewal reported after availability reports');
  if (denied) modifiers.push('Club denial reported');

  const live = positive.filter((r) => r.signals.some((s) => { const c = SIGNAL_COMPONENT[s]; return c && (now - r.publishedAt) / DAY <= (S.maxAgeDays[c] ?? 30); }));
  const origins = new Set(live.map((r) => r.originKey));
  const n = Math.min(origins.size, 4);
  const indep = n >= 2 ? (S.independenceTable[String(n)] ?? 0) : 0;

  // contract (10): date-driven, not article-age-driven
  let contractPts = 0; let contractNote = 'Contract expiry unknown';
  if (facts.contractExpires) {
    const months = (facts.contractExpires - now) / (30.4 * DAY);
    const base = months <= 0 ? 0 : months <= 6 ? 1 : months <= 12 ? 0.6 : months <= 18 ? 0.3 : 0;
    contractPts = (S.weights.contract ?? 10) * base * (facts.contractVerified ? 1 : 0.7);
    contractNote = `Contract ends in ${Math.max(0, Math.round(months))} months${facts.contractVerified ? ' (verified)' : ' (unverified)'}`;
  }

  const components: ComponentScore[] = [
    ...Object.values(comps).map((c) => ({ ...c, points: +c.points.toFixed(1) })),
    { key: 'contract', points: +contractPts.toFixed(1), max: S.weights.contract ?? 10, note: contractNote },
    { key: 'independence', points: indep, max: S.weights.independence ?? 10, note: `${origins.size} independent origin(s)` },
  ];

  let total = Object.values(comps).reduce((a, c) => a + c.points, 0) + indep + contractPts;
  const bestTier: Tier = live.length ? bestOf(live.map((r) => r.tier), (t) => TIER_ORDER.indexOf(t)) : 'D';
  const bestVerification: Verification = live.some((r) => r.verification === 'CONFIRMED') ? 'CONFIRMED' : live.some((r) => r.verification === 'REPORTED') ? 'REPORTED' : 'RUMOR';

  // guards (spec section 7 / R10.5)
  if (origins.size < 2 && (bestTier === 'C' || bestTier === 'D') && total > S.caps.singleOriginMax) { total = S.caps.singleOriginMax; caps.push(`Single independent origin with a tier ${bestTier} source: capped at ${S.caps.singleOriginMax}`); }
  if (total >= 70 && origins.size < 2 && bestTier !== 'A') { total = S.caps.antiRumorMax; caps.push(`Needs 2 independent origins or a tier-A source for 70+: capped at ${S.caps.antiRumorMax}`); }

  const raw = Math.round(total);
  let score = raw;
  if (closed) { score = Math.min(raw, S.caps.closedScore); caps.push('Later reports say the transfer is agreed/announced: opportunity treated as closed'); }

  const sigs = new Set(live.flatMap((r) => r.signals));
  const categories = [...new Set([...sigs].map((s) => SIGNAL_COMPONENT[s]).filter(Boolean).map((c) => CATEGORY_LABEL[c as Component]))];
  const loanAvailable = sigs.has('AVAILABLE_ON_LOAN');
  const transferAvailable = ['CLUB_WANTS_TO_SELL', 'CLUB_WANTS_TO_RELEASE', 'CLUB_OPEN_TO_TERMINATE', 'PLAYER_SEEKING_CLUB', 'REQUESTED_TO_LEAVE'].some((s) => sigs.has(s));

  const lastReportAt = reps.length ? reps[0].publishedAt : 0;
  const hours = (now - lastReportAt) / 3_600_000;
  const monthsLeft = facts.contractExpires ? (facts.contractExpires - now) / (30.4 * DAY) : null;
  const urgency: ScoreResult['urgency'] = closed ? 'Closed' : hours <= 48 || (monthsLeft !== null && monthsLeft <= 3) ? 'High' : hours <= 168 || (monthsLeft !== null && monthsLeft <= 6) ? 'Medium' : 'Low';
  const urgencyScore = closed ? 0 : Math.round(100 * (0.35 * (monthsLeft === null ? 0 : monthsLeft <= 3 ? 1 : monthsLeft <= 6 ? 0.8 : monthsLeft <= 12 ? 0.4 : 0) + 0.25 * Math.max(0, 1 - hours / 336) + 0.2 * Math.min(1, origins.size / 3) + 0.2 * Math.min(1, score / 70)));

  // recommended next action (rule-based, spec 8.7)
  let action = 'Watch: wait for a second independent source.';
  if (closed) action = 'Do not contact: later reports say the move is agreed or announced. Keep archived; re-open only if it collapses.';
  else if (score >= 70 && origins.size >= 2) action = 'Contact the player\'s agent now.';
  else if (monthsLeft !== null && monthsLeft <= 6 && score >= 30) action = 'Approach now: contract ends within 6 months (free-agent route).';
  else if (score >= 30 && origins.size >= 2) action = 'Verify with a local contact today, then approach the agent.';
  else if (loanAvailable) action = 'Ask the club or agent about loan terms; verify before outreach.';
  else if (bestVerification === 'RUMOR' && transferAvailable) action = 'Rumor only: verify before any outreach.';
  else if (transferAvailable) action = 'Single report: verify with a local contact before outreach.';

  return {
    score, rawScore: raw, level: levelOf(score, cfg, closed), closed, components, independentOrigins: origins.size, independencePoints: indep, caps, modifiers,
    bestTier, bestVerification, categories, loanAvailable, transferAvailable, urgency, urgencyScore, action, lastReportAt,
    topReport: live[0] ?? positive[0] ?? null, activeReports: live.length,
  };
}
