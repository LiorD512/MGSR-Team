import { NextRequest, NextResponse } from 'next/server';
import type { InValue } from '@libsql/client/web';
import { authenticate, failure, isResponse, parseJson, q } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

const SORTS: Record<string, string> = {
  score: 'closed ASC, score DESC, last_change_at DESC',
  new: 'closed ASC, last_report_at DESC, score DESC',
  reliable: `closed ASC, CASE best_tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 ELSE 3 END ASC, independent_origins DESC, score DESC`,
  urgent: 'closed ASC, urgency_score DESC, score DESC',
};

/** GET /api/transfer-radar/opportunities?country=&show=all|monitor|loan|transfer|low|closed&sort=&days=&q=&minScore=&limit= */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const sp = req.nextUrl.searchParams;
    const where: string[] = []; const args: InValue[] = [];
    const show = sp.get('show') || 'all';
    if (show === 'closed') where.push('closed = 1'); else if (sp.get('includeClosed') !== '1') where.push('closed = 0');
    if (show === 'monitor') where.push('score >= 30');
    if (show === 'loan') where.push('loan_available = 1');
    if (show === 'transfer') where.push('transfer_available = 1');
    if (show === 'low') where.push('score < 30');
    const country = sp.get('country'); if (country && country !== 'All') { where.push('country = ?'); args.push(country); }
    const days = Number(sp.get('days') || 30);
    if (days > 0 && days <= 365) { where.push('last_report_at >= ?'); args.push(Date.now() - days * 86_400_000); }
    const minScore = Number(sp.get('minScore') || 0); if (minScore > 0) { where.push('score >= ?'); args.push(minScore); }
    const tier = sp.get('tier'); if (tier && ['A', 'B', 'C', 'D'].includes(tier)) { where.push('best_tier <= ?'); args.push(tier); }
    const verification = sp.get('verification'); if (verification && ['CONFIRMED', 'REPORTED', 'RUMOR'].includes(verification)) { where.push('best_verification = ?'); args.push(verification); }
    const text = (sp.get('q') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0370-\u03ff\u0400-\u04ff\s]/g, ' ').trim();
    if (text) for (const tok of text.split(/\s+/).slice(0, 4)) { where.push('search_text LIKE ?'); args.push(`%${tok}%`); }
    const limit = Math.min(300, Math.max(1, Number(sp.get('limit') || 200)));
    const sort = SORTS[sp.get('sort') || 'score'] ?? SORTS.score;
    const sql = `SELECT * FROM opportunities ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT ?`;
    const rows = await q<Record<string, unknown>>(sql, [...args, limit]);
    const countries = await q<{ country: string; n: number }>(`SELECT COALESCE(country,'-') AS country, COUNT(*) AS n FROM opportunities WHERE closed = 0 GROUP BY country ORDER BY n DESC`);
    const items = rows.map((r) => ({
      playerId: r.player_id, displayName: r.display_name, clubName: r.club_name, country: r.country, league: r.league, score: r.score, rawScore: r.raw_score, level: r.level, closed: !!r.closed,
      scoreDelta7d: r.score_delta_7d, urgency: r.urgency, urgencyScore: r.urgency_score, categories: parseJson<string[]>(r.categories, []), loanAvailable: !!r.loan_available, transferAvailable: !!r.transfer_available,
      topHeadline: r.top_headline, topOutlet: r.top_outlet, topTier: r.top_tier, bestVerification: r.best_verification, bestTier: r.best_tier, reportCount: r.report_count, independentOrigins: r.independent_origins,
      action: r.action, firstSeenAt: r.first_seen_at, lastReportAt: r.last_report_at, lastChangeAt: r.last_change_at, contractExpires: r.contract_expires, onShortlist: !!r.on_shortlist, inRoster: !!r.in_roster,
    }));
    return NextResponse.json({ items, countries, generatedAt: Date.now() });
  } catch (e) { return failure(e); }
}
