import type { Db } from './db.js';
import { all, one, run } from './db.js';
import type { RadarConfig } from './config.js';
import { dayKey, monthKey, log } from './util.js';

/**
 * Quota ledger + hard budget guard (spec R0).
 *  - paid LLM spend is computed from API-reported token counts and stored in dollars
 *  - paid calls stop at the monthly cap, the daily sub-cap (cap / dailyCapDivisor) and the kill-switch
 */
export class Quota {
  constructor(private db: Db, private cfg: RadarConfig) {}

  async record(service: string, o: { requests?: number; tokensIn?: number; tokensOut?: number; usd?: number }) {
    await run(this.db, `INSERT INTO quota_ledger (day, service, requests, tokens_in, tokens_out, usd) VALUES (?,?,?,?,?,?)
      ON CONFLICT(day, service) DO UPDATE SET requests=requests+excluded.requests, tokens_in=tokens_in+excluded.tokens_in, tokens_out=tokens_out+excluded.tokens_out, usd=usd+excluded.usd`,
      [dayKey(), service, o.requests ?? 0, o.tokensIn ?? 0, o.tokensOut ?? 0, o.usd ?? 0]);
  }

  async monthUsd(): Promise<number> {
    const r = await one<{ s: number | null }>(this.db, `SELECT SUM(usd) AS s FROM quota_ledger WHERE day LIKE ? AND service LIKE 'llm:paid:%'`, [monthKey() + '%']);
    return Number(r?.s ?? 0);
  }
  async dayUsd(): Promise<number> {
    const r = await one<{ s: number | null }>(this.db, `SELECT SUM(usd) AS s FROM quota_ledger WHERE day = ? AND service LIKE 'llm:paid:%'`, [dayKey()]);
    return Number(r?.s ?? 0);
  }
  async dayRequests(servicePrefix: string): Promise<number> {
    const r = await one<{ s: number | null }>(this.db, `SELECT SUM(requests) AS s FROM quota_ledger WHERE day = ? AND service LIKE ?`, [dayKey(), servicePrefix + '%']);
    return Number(r?.s ?? 0);
  }

  /** Can we start another PAID call whose worst-case cost is `estUsd`? */
  async paidAllowed(estUsd = 0.003): Promise<{ ok: boolean; reason?: string }> {
    const l = this.cfg.llm;
    if (!l.enabled) return { ok: false, reason: 'kill-switch (llm.enabled=false)' };
    const cap = Math.min(l.monthlyCapUsd, l.ceilingUsd);
    const month = await this.monthUsd();
    if (month + estUsd > cap) return { ok: false, reason: `monthly cap reached ($${month.toFixed(3)} of $${cap})` };
    const dayCap = cap / Math.max(1, l.dailyCapDivisor);
    const day = await this.dayUsd();
    if (day + estUsd > dayCap) return { ok: false, reason: `daily sub-cap reached ($${day.toFixed(3)} of $${dayCap.toFixed(3)})` };
    return { ok: true };
  }

  async freeAllowed(provider: string): Promise<boolean> {
    return (await this.dayRequests(`llm:free:${provider}`)) < this.cfg.llm.freeDailyRequests;
  }

  usdFor(model: string, tokensIn: number, tokensOut: number): number {
    const p = this.cfg.llm.price[model];
    if (!p) { log.warn(`no price for model ${model}; assuming flash-lite price`); return (tokensIn * 0.1 + tokensOut * 0.4) / 1e6; }
    return (tokensIn * p.in + tokensOut * p.out) / 1e6;
  }

  async summary() {
    const cap = Math.min(this.cfg.llm.monthlyCapUsd, this.cfg.llm.ceilingUsd);
    const month = await this.monthUsd();
    const rows = await all(this.db, `SELECT service, SUM(requests) AS requests, SUM(tokens_in) AS tokens_in, SUM(tokens_out) AS tokens_out, SUM(usd) AS usd FROM quota_ledger WHERE day LIKE ? GROUP BY service`, [monthKey() + '%']);
    return { cap, monthUsd: month, pctOfCap: cap ? month / cap : 0, rows };
  }
}
