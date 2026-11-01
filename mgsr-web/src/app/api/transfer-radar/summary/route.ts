import { NextRequest, NextResponse } from 'next/server';
import { authenticate, failure, isResponse, q, q1 } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

/** GET /api/transfer-radar/summary - KPI strip, leads that need a name, rule-removed items, recent changes, pipeline + budget status. */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const now = Date.now();
    const kpi = await q1<Record<string, number>>(`SELECT
      (SELECT COUNT(*) FROM sources WHERE status IN ('APPROVED','PROBATION')) AS sources_active,
      (SELECT COUNT(*) FROM sources WHERE status IN ('BROKEN','INACTIVE')) AS sources_attention,
      (SELECT COUNT(*) FROM articles WHERE published_at > ?) AS articles_30d,
      (SELECT COUNT(*) FROM reports WHERE final = 1 AND published_at > ?) AS final_reports,
      (SELECT COUNT(*) FROM opportunities WHERE closed = 0) AS opportunities,
      (SELECT COUNT(*) FROM opportunities WHERE closed = 0 AND score >= 30) AS monitor_plus,
      (SELECT COUNT(*) FROM opportunities WHERE closed = 0 AND first_seen_at > ?) AS new_7d,
      (SELECT COUNT(*) FROM opportunities WHERE closed = 0 AND last_change_at > ?) AS changed_24h,
      (SELECT COUNT(*) FROM articles WHERE state = 'COLLECTED') AS queued`, [now - 30 * 86_400_000, now - 30 * 86_400_000, now - 7 * 86_400_000, now - 86_400_000]);
    const leads = await q<Record<string, unknown>>(`SELECT id, outlet, url, published_at, title_orig, headline_en, club_raw, country, signals FROM reports
      WHERE needs_body = 1 OR (ai_actionable = 1 AND drop_reason = 'no named player') ORDER BY published_at DESC LIMIT 8`);
    const removed = await q<Record<string, unknown>>(`SELECT id, outlet, url, published_at, headline_en, title_orig, player_raw, club_raw, drop_reason FROM reports
      WHERE ai_actionable = 1 AND final = 0 AND drop_reason IS NOT NULL AND drop_reason <> 'no named player' ORDER BY published_at DESC LIMIT 12`);
    const recent = await q<Record<string, unknown>>(`SELECT player_id, display_name, club_name, score, level, last_change_at FROM opportunities ORDER BY last_change_at DESC LIMIT 6`);
    const newSources = await q<Record<string, unknown>>(`SELECT id, name, host, country, status, created_at FROM sources WHERE provenance NOT LIKE '%"by":"SEED"%' ORDER BY created_at DESC LIMIT 5`);
    const lastRun = await q1<Record<string, unknown>>(`SELECT started_at, ended_at, status FROM run_log WHERE job = 'pipeline' ORDER BY id DESC LIMIT 1`);
    const month = new Date().toISOString().slice(0, 7);
    const spend = await q1<{ usd: number | null; req: number | null }>(`SELECT SUM(usd) AS usd, SUM(requests) AS req FROM quota_ledger WHERE day LIKE ? AND service LIKE 'llm:%'`, [`${month}%`]);
    const cfgRow = await q1<{ json: string }>(`SELECT json FROM config WHERE key = 'llm'`);
    let cap = 5; try { const j = JSON.parse(cfgRow?.json ?? '{}'); cap = Math.min(Number(j.monthlyCapUsd ?? 5), Number(j.ceilingUsd ?? 6)); } catch { /* default */ }
    return NextResponse.json({ kpi, leads, removed, recent, newSources, lastRun, budget: { monthUsd: Number(spend?.usd ?? 0), capUsd: cap, requests: Number(spend?.req ?? 0) }, generatedAt: now });
  } catch (e) { return failure(e); }
}
