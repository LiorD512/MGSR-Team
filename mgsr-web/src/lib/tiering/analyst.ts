/**
 * The AI analyst — Gemini 2.5 Flash with Google Search grounding.
 *
 * Reads every fact we hold on a player (criteria, stats, FM, injuries, contract, mandate, matching
 * requests, transfer windows, notes, recent headlines) + live web search, and returns:
 *   • a refined fit (it may nudge tier/role/ceiling by one step, with a confidence),
 *   • a short EN/HE summary of the player + the opportunity,
 *   • the reasons he is (or isn't) worth working next window,
 *   • a news digest + an overall news signal (-2…+2).
 * It does NOT decide urgency or ranking — that is deterministic maths.
 *
 * Grounded search can't use JSON mode, so we ask for one JSON object in text and parse defensively,
 * then retry once without search.
 */
import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL, TIER_DEFINITIONS } from './config';
import type { NewsSentiment, Role, Tier, TierNewsItem, TierReason, TierSource } from './types';

export interface AnalystFacts {
  player: string;
  age: number | null;
  positions: string[];
  nationality?: string;
  club?: string;
  clubCountry?: string;
  marketValue?: string;
  valueTrend: string;
  contractMonthsLeft: number | null;
  haveMandate: boolean;
  mandateDaysLeft: number | null;
  criteria: { key: string; weight: number; score: number | null; note?: string }[];
  engine: { score: number; dataCoverage: number; fitTier: Tier; fitRole: Role; ceiling: Tier; urgency: number; worth: number };
  matchingClubRequests: { club: string; position: string; ages?: string; euOnly?: boolean; daysOld?: number }[];
  transferWindows: { country: string; daysLeft: number }[];
  daysSinceLastTouch: number | null;
  recentAgentNotes: string[];
  headlines: { title: string; source?: string; date?: string }[];
  today: string;
}

export interface AnalystRead {
  /** -1 / 0 / +1 on the tier (+1 = better tier). */
  tierAdj: -1 | 0 | 1;
  role?: Role;
  /** -1 / 0 / +1 on the ceiling. */
  ceilingAdj: -1 | 0 | 1;
  confidence: number;
  summaryEn: string;
  summaryHe: string;
  reasons: TierReason[];
  newsSignal: number;
  news: TierNewsItem[];
  sources: TierSource[];
}

const SENTIMENTS: NewsSentiment[] = ['positive', 'neutral', 'negative', 'risk'];
const ROLES: Role[] = ['starter', 'rotation', 'squad'];
const s = (v: unknown, n = 400) => String(v ?? '').trim().slice(0, n);
const tri = (v: unknown): -1 | 0 | 1 => (Number(v) === 1 ? 1 : Number(v) === -1 ? -1 : 0);
const wgt = (v: unknown): 1 | 2 | 3 => (Number(v) === 3 ? 3 : Number(v) === 1 ? 1 : 2);

export function buildPrompt(f: AnalystFacts): string {
  const tiers = ([1, 2, 3, 4, 5] as Tier[]).map((t) => `${t}: ${TIER_DEFINITIONS[t].en}`).join('\n');
  return `You are the head of recruitment at BRIT Sport Group, a football agency working the Israeli, European and Gulf markets.
Today is ${f.today}. For ONE player we represent, judge how good a transfer target he is for the NEXT window and at which level he fits.

LEAGUE TIER SCALE:
${tiers}

The engine already scored him from the data on five criteria (0-100; null = no data): output (match ratings/minutes), ability (FM),
value (market value), league (league + club strength), availability (injuries). It predicts: fit tier ${f.engine.fitTier}, role ${f.engine.fitRole},
ceiling ${f.engine.ceiling}, data coverage ${f.engine.dataCoverage}%. Deterministic urgency ${f.engine.urgency}/100, worth ${f.engine.worth}/100.

YOUR TASKS
1. Use Google Search for the LATEST on this player (~6 weeks): form, minutes, injuries, transfer links, contract talk, national team, coach/club situation.
   Combine with the headlines below. Ignore other people with the same name.
2. Refine the FIT only if the data clearly justifies it: "tierAdj" and "ceilingAdj" are each -1, 0 or +1 (+1 = a better / higher tier). Default 0.
   Optionally correct "role" (starter|rotation|squad). Be conservative; the engine prediction is usually right.
3. "summaryEn"/"summaryHe": one or two sentences an agent can read at a glance — who he is and whether he's worth working next window.
4. "reasons": the 2-4 strongest reasons he is (or is not) worth working on now, each with weight 3 (time-critical), 2 (important) or 1 (context).
   Use the matching club requests, contract/mandate timing, form and market below. Be concrete.
5. "newsSignal": -2 (very negative) … +2 (very positive) overall momentum from news.
6. Never invent statistics or news. If data is thin, say so and lower confidence.

FACTS (JSON):
${JSON.stringify(f)}

Reply with ONE JSON object and nothing else:
{
 "tierAdj": 0, "ceilingAdj": 0, "role": "starter", "confidence": 70,
 "summaryEn": "...", "summaryHe": "...",
 "reasons": [{"en": "...", "he": "...", "weight": 3}],
 "newsSignal": 0,
 "news": [{"headline": "...", "sentiment": "positive|neutral|negative|risk", "impactEn": "why it matters to us", "impactHe": "...", "source": "outlet", "date": "YYYY-MM-DD"}]
}
Max 4 reasons, max 4 news items.`;
}

export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function normaliseRead(raw: unknown, sources: TierSource[]): AnalystRead {
  const j = (raw ?? {}) as Record<string, unknown>;
  return {
    tierAdj: tri(j.tierAdj),
    ceilingAdj: tri(j.ceilingAdj),
    role: ROLES.includes(j.role as Role) ? (j.role as Role) : undefined,
    confidence: Math.max(0, Math.min(100, Number(j.confidence) || 50)),
    summaryEn: s(j.summaryEn, 320),
    summaryHe: s(j.summaryHe, 320),
    reasons: Array.isArray(j.reasons)
      ? j.reasons.slice(0, 4).map((r: Record<string, unknown>) => ({ en: s(r.en, 200), he: s(r.he, 200), weight: wgt(r.weight) })).filter((r) => r.en)
      : [],
    newsSignal: Math.max(-2, Math.min(2, Math.round(Number(j.newsSignal) || 0))),
    news: Array.isArray(j.news)
      ? j.news.slice(0, 4).map((n: Record<string, unknown>) => ({
          headline: s(n.headline, 200),
          sentiment: SENTIMENTS.includes(n.sentiment as NewsSentiment) ? (n.sentiment as NewsSentiment) : 'neutral',
          impactEn: s(n.impactEn, 240),
          impactHe: s(n.impactHe, 240),
          ...(n.source ? { source: s(n.source, 60) } : {}),
          ...(n.date ? { date: s(n.date, 10) } : {}),
        })).filter((n) => n.headline)
      : [],
    sources: sources.slice(0, 6),
  };
}

export async function runAnalyst(facts: AnalystFacts): Promise<AnalystRead | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(facts);

  for (const grounded of [true, false]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: grounded ? { tools: [{ googleSearch: {} }], temperature: 0.2 } : { responseMimeType: 'application/json', temperature: 0.2 },
        });
        const text = res.text ?? '';
        const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources: TierSource[] = [];
        const seen = new Set<string>();
        for (const c of chunks) {
          const uri = c.web?.uri;
          if (!uri || seen.has(uri)) continue;
          seen.add(uri);
          sources.push({ title: s(c.web?.title || uri, 80), url: uri });
        }
        return normaliseRead(extractJsonObject(text), sources);
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        const limited = /429|quota|rate|RESOURCE_EXHAUSTED/i.test(msg);
        if (limited && attempt === 0) {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        if (limited) return null;
        break;
      }
    }
  }
  return null;
}
