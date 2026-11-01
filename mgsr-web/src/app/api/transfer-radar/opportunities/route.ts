import { NextRequest, NextResponse } from 'next/server';
import { authenticate, ensureFlags, failure, foldFlags, isResponse, parseJson, q } from '@/lib/transferRadar/server';
import { situationsOf } from '@/lib/transferRadar/situations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transfer-radar/opportunities
 * Returns every scored player (active, closed and hidden-as-not-relevant) with his plain-language situations and the agency marks.
 * The workspace does tabs / filters / sorting on this list in the browser (a few hundred rows at most).
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    await ensureFlags();
    const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit') || 400)));
    const rows = await q<Record<string, unknown>>('SELECT * FROM opportunities ORDER BY closed ASC, score DESC, last_report_at DESC LIMIT ?', [limit]);
    const flags = foldFlags(await q('SELECT player_id, flag, reason, by_email, at FROM player_flags'));
    const timeline = await q<{ player_id: string; signals: string }>('SELECT player_id, signals FROM timeline WHERE player_id IN (SELECT player_id FROM opportunities)');
    const sigs = new Map<string, string[][]>();
    for (const t of timeline) { const l = sigs.get(t.player_id) ?? []; l.push(parseJson<string[]>(t.signals, [])); sigs.set(t.player_id, l); }
    const aliases = new Map((await q<{ id: string; aliases: string | null }>('SELECT id, aliases FROM players WHERE id IN (SELECT player_id FROM opportunities)')).map((p) => [p.id, parseJson<string[]>(p.aliases, [])[0] ?? null]));
    let source = new Map<string, string | null>();
    try { source = new Map((await q<{ id: string; country_source: string | null }>('SELECT id, country_source FROM players WHERE id IN (SELECT player_id FROM opportunities)')).map((p) => [p.id, p.country_source])); } catch { /* migration 3 not applied yet: treat every country as "reported in" */ }

    const items = rows.map((r) => {
      const id = String(r.player_id);
      const all = situationsOf(sigs.get(id) ?? []);
      const live = all.filter((k) => k !== 'moved');
      return {
        playerId: id, displayName: r.display_name, writtenAs: aliases.get(id) ?? null, clubName: r.club_name, country: r.country, countryIsClub: source.get(id) === 'CLUB',
        score: r.score, rawScore: r.raw_score, level: r.level, closed: !!r.closed, situations: live, mainSituation: r.closed ? 'moved' : (live[0] ?? 'other'),
        loanAvailable: !!r.loan_available, topHeadline: r.top_headline, topOutlet: r.top_outlet, topTier: r.top_tier, bestVerification: r.best_verification, bestTier: r.best_tier,
        reportCount: r.report_count, independentOrigins: r.independent_origins, action: r.action, firstSeenAt: r.first_seen_at, lastReportAt: r.last_report_at, lastChangeAt: r.last_change_at,
        flags: flags.get(id) ?? {},
      };
    });
    return NextResponse.json({ items, generatedAt: Date.now() });
  } catch (e) { return failure(e); }
}
