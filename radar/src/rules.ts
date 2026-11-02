import type { AiItem } from './prompt.js';
import { COUNTER_SIGNALS, SIGNAL_COMPONENT, STRICT_SIGNALS, type Tier, type Verification } from './taxonomy.js';
import type { RadarConfig } from './config.js';
import { DAY, norm } from './util.js';

/**
 * Deterministic decision layer: the AI proposes, rules decide (PoC lesson).
 * Stand-in for the DB-based target-profile filter (value / league tier) until the football-data join exists (Phase 1 task 1.23 / Phase 2).
 */
const ELITE_RAW = [
  'real madrid', 'barcelona', 'atletico madrid', 'manchester united', 'man united', 'manchester city', 'man city', 'liverpool', 'chelsea', 'arsenal', 'tottenham', 'newcastle', 'aston villa',
  'bayern', 'leverkusen', 'borussia dortmund', 'psg', 'paris saint', 'inter', 'milan', 'juventus', 'napoli', 'atalanta', 'al hilal', 'al nassr',
  // non-Latin spellings seen in the PoC (Greek / Cyrillic)
  'αρσεναλ', 'ρεαλ μαδριτης', 'μπαρτσελονα', 'τσελσι', 'λιβερπουλ', 'реал мадрид', 'барселона', 'челси', 'арсенал', 'ливърпул', 'манчестър юнайтед', 'манчестър сити',
];
const ELITE = ELITE_RAW.map((x) => new RegExp(`(^| )${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`, 'i'));
export const isEliteClub = (club: string) => { const k = norm(club); return !!k && ELITE.some((re) => re.test(k)); };

const OFFICIAL_ATTRIBUTION = /\b(club|president|chairman|official|federation|league|spokes|statement|announce|confirmed by the club|player himself|agent)\b/i;

const PARTICLES = new Set(['van', 'de', 'der', 'den', 'da', 'di', 'do', 'dos', 'das', 'del', 'della', 'von', 'el', 'al', 'bin', 'ben', 'le', 'la', 'du', 'ter', 'ten', 'mac', 'mc', 'o', 'jr', 'jr.']);
/** A real name = every word starts with an upper-case letter (or is a name particle). Rejects "Problémový hráč", "the striker", "Szoboszlai's rival". */
export function looksLikeName(n: string): boolean {
  const words = (n || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 5) return false;
  if (/'s\b|’s\b/.test(n)) return false;
  return words.every((w) => PARTICLES.has(w.toLowerCase()) || /^\p{Lu}/u.test(w));
}

export interface RuleCtx { tier: Tier; headlineOnly: boolean; text: string; publishedAt: number; now: number; cfg: RadarConfig }
export interface RuleOut {
  final: boolean; reasons: string[]; verification: Verification; evidenceOk: boolean;
  needsBody: boolean; eventDate: number | null; resolvable: boolean;
}

const nfc = (s: string) => norm(s);

export function evaluate(ai: AiItem, ctx: RuleCtx): RuleOut {
  const sig = ai.signals ?? [];
  const reasons: string[] = [];
  const q = nfc(ai.evidenceQuote || '');
  const evidenceOk = !q || nfc(ctx.text).includes(q);

  let eventDate: number | null = null;
  if (ai.eventDate) { const t = Date.parse(ai.eventDate); if (Number.isFinite(t)) eventDate = t; }

  // R22.4 event date vs publication date
  const positive = sig.filter((s) => SIGNAL_COMPONENT[s]);
  const maxAge = Math.max(0, ...positive.map((s) => ctx.cfg.scoring.maxAgeDays[SIGNAL_COMPONENT[s]] ?? 30));
  if (eventDate && positive.length && ctx.now - eventDate > maxAge * DAY) reasons.push('event date older than signal life');

  const named = !!(ai.player && ai.player.trim()) && looksLikeName(ai.player);
  const elite = isEliteClub(ai.clubLatin || ai.club);
  const hasStrict = sig.some((s) => STRICT_SIGNALS.has(s));

  if (ai.sport !== 'FOOTBALL') reasons.push('not football');
  if (ai.squadType !== 'CLUB') reasons.push('not a club squad');
  if (ai.role !== 'PLAYER') reasons.push('not a player');
  if (!named) reasons.push('no named player');
  if (ai.starPlayer) reasons.push('star player');
  if (elite) reasons.push('elite club (outside target profile)');
  if (ai.strength !== 'EXPLICIT') reasons.push('signal only implied');
  if (!hasStrict) reasons.push('no strict signal');
  if (sig.includes('TRANSFER_COMPLETED')) reasons.push('transfer already completed');
  if (ai.historical) reasons.push('historical');
  if (!evidenceOk) reasons.push('evidence quote not in text');

  const aiSaid = !!ai.actionable;
  // never override a "no": rules can only veto, never add
  const final = aiSaid && reasons.length === 0;

  // verification (R16.2) - deterministic
  let verification: Verification = 'RUMOR';
  if (ai.claimType === 'FACT') {
    verification = 'REPORTED';
    const official = ctx.tier === 'A' || OFFICIAL_ATTRIBUTION.test(ai.attributedTo || '');
    if (official && !ctx.headlineOnly && evidenceOk) verification = 'CONFIRMED';
  }

  // strong lead whose only problem is that the headline does not name the player -> read the article text next
  const onlyNameMissing = reasons.length === 1 && reasons[0] === 'no named player';
  const needsBody = onlyNameMissing && hasStrict && !ctx.headlineOnly;

  // which reports are worth resolving to a player: football club players with any signal (incl. counter-signals needed for status changes)
  const resolvable = named && ai.sport === 'FOOTBALL' && ai.squadType === 'CLUB' && ai.role === 'PLAYER' && !ai.historical &&
    (sig.some((s) => SIGNAL_COMPONENT[s] || COUNTER_SIGNALS.has(s)));
  return { final, reasons, verification, evidenceOk, needsBody, eventDate, resolvable };
}
