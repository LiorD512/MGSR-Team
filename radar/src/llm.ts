import type { RadarConfig } from './config.js';
import type { Quota } from './quota.js';
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, type AiItem } from './prompt.js';
import { log, sleep } from './util.js';

export class BudgetExhausted extends Error { constructor(m: string) { super(m); this.name = 'BudgetExhausted'; } }

interface Provider { name: string; key: string; paid: boolean }

/**
 * Free-first routing (spec R0.4): free-tier key first while its daily request allowance lasts, then the existing paid
 * Gemini key under the software dollar cap. Keys come from env only (RADAR_GEMINI_FREE_KEY, RADAR_GEMINI_KEY).
 */
export class Llm {
  private providers: Provider[] = [];
  private freeExhausted = new Set<string>();
  paidRequestsThisRun = 0;
  stats = { free: 0, paid: 0, usd: 0, tokensIn: 0, tokensOut: 0, failures: 0, stopReason: '' };

  constructor(private cfg: RadarConfig, private quota: Quota) {
    if (process.env.RADAR_GEMINI_FREE_KEY) this.providers.push({ name: 'gemini-free', key: process.env.RADAR_GEMINI_FREE_KEY, paid: false });
    if (process.env.RADAR_GEMINI_KEY) this.providers.push({ name: 'gemini-paid', key: process.env.RADAR_GEMINI_KEY, paid: true });
  }

  get configured() { return this.providers.length > 0; }

  private async pick(): Promise<Provider> {
    for (const p of this.providers) {
      if (!p.paid) {
        if (!this.freeExhausted.has(p.name) && (await this.quota.freeAllowed(p.name))) return p;
        continue;
      }
      if (this.paidRequestsThisRun >= this.cfg.llm.paidMaxRequestsPerRun) throw new BudgetExhausted(`paid request limit per run (${this.cfg.llm.paidMaxRequestsPerRun})`);
      const ok = await this.quota.paidAllowed();
      if (!ok.ok) throw new BudgetExhausted(ok.reason ?? 'paid budget exhausted');
      return p;
    }
    throw new BudgetExhausted(this.providers.length ? 'no provider with remaining quota' : 'no LLM key configured (RADAR_GEMINI_KEY / RADAR_GEMINI_FREE_KEY)');
  }

  /** One batched call. Returns parsed items (may be fewer than inputs if the model dropped some). */
  async analyze(userPrompt: string): Promise<AiItem[]> {
    const model = this.cfg.llm.model;
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await this.pick();
      const body = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      };
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key }, body: JSON.stringify(body),
        });
      } catch (e) { this.stats.failures++; await sleep(1500 * (attempt + 1)); continue; }

      if (res.status === 429) {
        if (!p.paid) { this.freeExhausted.add(p.name); log.warn(`${p.name} hit 429 - falling back`); continue; }
        await sleep(3000 * (attempt + 1)); continue;
      }
      if (res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) { this.stats.failures++; throw new Error(`Gemini ${res.status}: ${JSON.stringify(j).slice(0, 200).split(p.key).join('***')}`); }

      const tin = j.usageMetadata?.promptTokenCount ?? 0;
      const tout = (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0);
      const usd = p.paid ? this.quota.usdFor(model, tin, tout) : 0;
      await this.quota.record(`llm:${p.paid ? 'paid' : 'free'}:${p.name}`, { requests: 1, tokensIn: tin, tokensOut: tout, usd });
      if (p.paid) { this.paidRequestsThisRun++; this.stats.paid++; } else this.stats.free++;
      this.stats.usd += usd; this.stats.tokensIn += tin; this.stats.tokensOut += tout;

      const txt = j.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join('') ?? '[]';
      try {
        const arr = JSON.parse(txt);
        return Array.isArray(arr) ? (arr as AiItem[]) : [];
      } catch { this.stats.failures++; return []; }
    }
    throw new Error('LLM failed after retries');
  }
}
