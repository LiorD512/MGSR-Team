/**
 * The AI analyst — Gemini 2.5 Flash with Google Search grounding.
 *
 * Input:  every fact we have about the player (criteria scores, stats, FM, injuries, contract, mandate,
 *         open club requests that match him, transfer windows, agent notes, recent headlines).
 * Output: ±1 level adjustment (with reason), ±1 focus nudge from news, a news digest, risks,
 *         and a concrete HOW / WHEN push plan.
 *
 * Grounded search does not support JSON mode, so we ask for a single JSON object in plain text and parse
 * it defensively. If grounding fails we retry once without the search tool.
 */
import { GoogleGenAI } from '@google/genai';
import { GEMINI_MODEL, LEVEL_DEFINITIONS } from './config';
import type { Level, NewsSentiment, PushTiming, TierNewsItem, TierPlan, TierRisk, TierSource, TierWindowFit } from './types';

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
  engine: { score: number; baseLevel: Level; dataCoverage: number; focus: number; urgency: number };
  matchingClubRequests: { club: string; position: string; ages?: string; euOnly?: boolean; daysOld?: number }[];
  /** Marked by the agency as a player to work hard on in the next window. */
  windowTarget: boolean;
  transferWindows: { country: string; daysLeft: number }[];
  daysSinceLastTouch: number | null;
  recentAgentNotes: string[];
  headlines: { title: string; source?: string; date?: string }[];
  today: string;
}

export interface AnalystRead {
  adj: -1 | 0 | 1;
  focusAdj: -1 | 0 | 1;
  newsSignal: number;
  confidence: number;
  reasonEn: string;
  reasonHe: string;
  evidence: string[];
  news: TierNewsItem[];
  risks: TierRisk[];
  plan: TierPlan;
  windowFit: TierWindowFit;
  sources: TierSource[];
}

const SENTIMENTS: NewsSentiment[] = ['positive', 'neutral', 'negative', 'risk'];
const TIMINGS: PushTiming[] = ['now', 'this_week', 'this_window', 'later', 'hold'];
const s = (v: unknown, n = 400) => String(v ?? '').trim().slice(0, n);
const tri = (v: unknown): -1 | 0 | 1 => (Number(v) === 1 ? 1 : Number(v) === -1 ? -1 : 0);

export function buildPrompt(f: AnalystFacts): string {
  const levels = ([1, 2, 3, 4, 5] as Level[]).map((l) => `L${l}: ${LEVEL_DEFINITIONS[l].en}`).join('\n');
  return `You are the head of football operations at BRIT Sport Group, a player agency working the Israeli, European and Gulf markets.
Today is ${f.today}. Analyse ONE player we represent and decide (a) his level, (b) whether he needs action NOW, (c) HOW and WHEN to push him,
and (d) whether he is a strong candidate for a focused push in the next transfer window.${f.windowTarget ? '\nThe agency has MARKED him as a window target — build the plan around the coming window.' : ''}

LEVEL SCALE:
${levels}

THE ENGINE ALREADY SCORED HIM on five weighted criteria (0-100, null = no data): output (match ratings/minutes), ability (FM),
value (market value), league (league + club strength), availability (injuries). Base level: L${f.engine.baseLevel}, score ${f.engine.score}, data coverage ${f.engine.dataCoverage}%.
The engine's focus is F${f.engine.focus} (1 Push now, 2 Active, 3 Maintain, 4 Park), urgency ${f.engine.urgency}/100.

YOUR TASKS
1. Use Google Search to check the LATEST news about this player (last ~6 weeks): transfers/rumours, injuries, form, minutes, contract talk,
   national team, coach changes, club situation. Combine with the headlines below. Ignore other people with the same name.
2. "adj": -1, 0 or +1 level (+1 = one level BETTER than the base). Only move when the facts clearly justify it
   (e.g. data coverage is low and real-world evidence shows a different level, a breakout season, a serious decline/injury). Default 0.
3. "focusAdj": -1, 0 or +1 (+1 = push HARDER than the engine says). Use it only for genuinely time-sensitive news
   (club interest, contract talks, coach change, he lost his place, long injury). Default 0.
4. "plan": concrete and actionable for an agent. "nextStepEn"/"nextStepHe" = the single next action, imperative, max 16 words
   (e.g. "Call Beer Sheva's sporting director before Thursday; renew the mandate first"). HOW = what to do and with whom (use the matching club requests and markets/windows below when relevant).
   WHEN = timing tied to real dates (contract end, mandate expiry, window deadlines). "timing" must be one of now|this_week|this_window|later|hold.
5. "windowFit": 0-100 — how much it would pay off to work hard on him in the next window
   (level vs. market, age, contract situation, demand, momentum). Explain in one sentence.
6. Never invent statistics or news. If you found nothing, say so and keep confidence moderate.

FACTS (JSON):
${JSON.stringify(f)}

Reply with ONE JSON object and nothing else:
{
 "adj": 0, "focusAdj": 0, "newsSignal": 0, "confidence": 70,
 "reasonEn": "1-2 sentences: why this level", "reasonHe": "same in Hebrew",
 "evidence": ["short fact", "short fact"],
 "news": [{"headline": "...", "sentiment": "positive|neutral|negative|risk", "impactEn": "why it matters for us", "impactHe": "...", "source": "outlet", "date": "YYYY-MM-DD"}],
 "risks": [{"en": "...", "he": "..."}],
 "plan": {"nextStepEn": "...", "nextStepHe": "...", "howEn": "...", "howHe": "...", "whenEn": "...", "whenHe": "...", "timing": "this_window", "targets": ["club"], "deadline": "YYYY-MM-DD or empty"},
 "windowFit": {"score": 60, "reasonEn": "...", "reasonHe": "..."}
}
newsSignal: -2 (very negative) … +2 (very positive) overall news momentum. Max 4 news items, max 3 risks, max 3 targets.`;
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
  const plan = (j.plan ?? {}) as Record<string, unknown>;
  const wf = (j.windowFit ?? {}) as Record<string, unknown>;
  const timing = TIMINGS.includes(plan.timing as PushTiming) ? (plan.timing as PushTiming) : 'later';
  const deadline = s(plan.deadline, 10);
  return {
    adj: tri(j.adj),
    focusAdj: tri(j.focusAdj),
    newsSignal: Math.max(-2, Math.min(2, Math.round(Number(j.newsSignal) || 0))),
    confidence: Math.max(0, Math.min(100, Number(j.confidence) || 50)),
    reasonEn: s(j.reasonEn),
    reasonHe: s(j.reasonHe),
    evidence: Array.isArray(j.evidence) ? j.evidence.slice(0, 4).map((e) => s(e, 160)).filter(Boolean) : [],
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
    risks: Array.isArray(j.risks)
      ? j.risks.slice(0, 3).map((r: Record<string, unknown>) => ({ en: s(r.en, 200), he: s(r.he, 200) })).filter((r) => r.en)
      : [],
    plan: {
      nextStepEn: s(plan.nextStepEn, 160),
      nextStepHe: s(plan.nextStepHe, 160),
      howEn: s(plan.howEn, 400),
      howHe: s(plan.howHe, 400),
      whenEn: s(plan.whenEn, 300),
      whenHe: s(plan.whenHe, 300),
      timing,
      targets: Array.isArray(plan.targets) ? plan.targets.slice(0, 3).map((t) => s(t, 60)).filter(Boolean) : [],
      ...(/^\d{4}-\d{2}-\d{2}$/.test(deadline) ? { deadline } : {}),
    },
    windowFit: {
      score: Math.max(0, Math.min(100, Math.round(Number(wf.score) || 0))),
      reasonEn: s(wf.reasonEn, 240),
      reasonHe: s(wf.reasonHe, 240),
    },
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
        if (limited) return null; // quota exhausted — keep the previous read, try again next sweep
        break; // other error (e.g. unparsable grounded answer) → retry once without search
      }
    }
  }
  return null;
}
