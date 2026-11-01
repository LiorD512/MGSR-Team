import type { Db } from './db.js';
import { all, run } from './db.js';
import { now } from './util.js';

export interface RadarConfig {
  scoring: {
    version: number;
    weights: Record<string, number>;
    tierFactor: Record<string, number>;
    verificationFactor: Record<string, number>;
    confidenceFloor: number; confidenceSpan: number; recencyFloor: number;
    halfLifeDays: Record<string, number>;
    maxAgeDays: Record<string, number>;
    independenceTable: Record<string, number>;
    caps: { singleOriginMax: number; antiRumorMax: number; closedScore: number };
    levels: { exceptional: number; high: number; potential: number; monitor: number };
  };
  pipeline: { runEveryDays: number; intakeDays: number; archiveAfterDays: number; batchSize: number; maxItemsPerRun: number; maxBodyReads: number; analysisExpiryDays: number; runBudgetMinutes: number; perCountryShare: number };
  llm: {
    enabled: boolean; monthlyCapUsd: number; ceilingUsd: number; dailyCapDivisor: number; warnAt: number;
    model: string; price: Record<string, { in: number; out: number }>; freeDailyRequests: number; paidMaxRequestsPerRun: number;
  };
  http: { perHostDelayMs: number; timeoutMs: number; userAgent: string; concurrency: number };
}

export const DEFAULT_CONFIG: RadarConfig = {
  scoring: {
    version: 1,
    // owner's suggested weights (spec section 7)
    weights: { availability: 25, exclusion: 15, playingTime: 10, relationship: 15, contract: 10, independence: 10, financial: 5, replacement: 5, other: 5 },
    tierFactor: { A: 1, B: 0.85, C: 0.65, D: 0.4 },
    verificationFactor: { CONFIRMED: 1, REPORTED: 0.85, RUMOR: 0.5 },
    // v1 calibration from the PoC mock: confidence = floor + span * tier * verification ; recency never drops below floor inside the signal's life
    confidenceFloor: 0.4, confidenceSpan: 0.6, recencyFloor: 0.5,
    halfLifeDays: { availability: 21, exclusion: 14, playingTime: 21, relationship: 30, financial: 45, replacement: 30, other: 21 },
    maxAgeDays: { availability: 30, exclusion: 21, playingTime: 30, relationship: 30, financial: 45, replacement: 30, other: 21 },
    independenceTable: { '1': 0, '2': 5, '3': 8, '4': 10 },
    caps: { singleOriginMax: 59, antiRumorMax: 69, closedScore: 12 },
    levels: { exceptional: 85, high: 70, potential: 50, monitor: 30 },
  },
  // The AI pipeline runs every 3 days (early morning). One run therefore handles ~3 days of accumulated articles.
  pipeline: { runEveryDays: 3, intakeDays: 30, archiveAfterDays: 45, batchSize: 8, maxItemsPerRun: 1500, maxBodyReads: 30, analysisExpiryDays: 7, runBudgetMinutes: 40, perCountryShare: 0.25 },
  llm: {
    enabled: true,
    monthlyCapUsd: 5, ceilingUsd: 6, dailyCapDivisor: 20, warnAt: 0.8,
    model: 'gemini-2.5-flash-lite',
    price: { 'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 } }, // USD per 1M tokens - verify current price
    freeDailyRequests: 200,
    paidMaxRequestsPerRun: 250,
  },
  http: { perHostDelayMs: 5000, timeoutMs: 12000, userAgent: 'Mozilla/5.0 (compatible; BSG-Radar/1.0; +https://github.com/LiorD512/MGSR-Team)', concurrency: 8 },
};

function merge<T>(base: T, over: unknown): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = merge((base as Record<string, unknown>)?.[k], v);
  return out as T;
}

/** DB rows (key = section name) override defaults, so weights/limits can be recalibrated without code changes. */
export async function loadConfig(db: Db): Promise<RadarConfig> {
  const rows = await all<{ key: string; json: string; version: number }>(db, 'SELECT key, json, version FROM config');
  let cfg = DEFAULT_CONFIG;
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.json);
      cfg = merge(cfg, { [r.key]: r.key === 'scoring' ? { ...parsed, version: r.version } : parsed });
    } catch { /* ignore bad row */ }
  }
  return cfg;
}

export async function seedConfig(db: Db, force = false): Promise<void> {
  for (const key of ['scoring', 'pipeline', 'llm', 'http'] as const) {
    const exists = await all(db, 'SELECT 1 FROM config WHERE key = ?', [key]);
    if (exists.length && !force) continue;
    await run(db, 'INSERT INTO config (key, version, json, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, version=config.version+1, updated_at=excluded.updated_at', [
      key, 1, JSON.stringify(DEFAULT_CONFIG[key]), now(),
    ]);
  }
}
