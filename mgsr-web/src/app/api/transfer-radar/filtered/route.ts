import { NextRequest, NextResponse } from 'next/server';
import { authenticate, ensureFlags, failure, identityReady, isResponse, parseJson, q, STORY_REPORTS } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transfer-radar/filtered - what the feed does NOT show, with the reason (transparency, nothing is deleted):
 * excluded automatically (above the value ceiling, other sport, coach/staff, retired), not identifiable yet (retried every run), hidden by the agency.
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    if (!(await identityReady())) return NextResponse.json({ items: [] });
    await ensureFlags();
    const rows = await q<Record<string, unknown>>(`SELECT p.id, p.display_name, p.aliases, p.identity_status, p.excluded_reason, p.identity_checks, p.market_value, p.club_name, p.tm_url,
        (SELECT by_email FROM player_flags f WHERE f.player_id = p.id AND f.flag = 'HIDDEN') AS hidden_by,
        (SELECT reason FROM player_flags f WHERE f.player_id = p.id AND f.flag = 'HIDDEN') AS hidden_reason
      FROM players p JOIN opportunities o ON o.player_id = p.id
      WHERE p.identity_status IN ('EXCLUDED','UNIDENTIFIED') OR p.id IN (SELECT player_id FROM player_flags WHERE flag = 'HIDDEN')
      ORDER BY o.last_report_at DESC LIMIT 200`);
    const ids = rows.map((r) => String(r.id));
    const reps = ids.length ? await q<Record<string, unknown>>(`SELECT r.player_id, r.outlet, r.publisher_url, r.url, r.published_at, r.headline_en, r.title_orig, r.club_raw FROM reports r
      WHERE r.player_id IN (${ids.map(() => '?').join(',')}) AND ${STORY_REPORTS} ORDER BY r.published_at DESC`, ids) : [];
    const latest = new Map<string, Record<string, unknown>>();
    for (const r of reps) if (!latest.has(String(r.player_id))) latest.set(String(r.player_id), r);
    const items = rows.map((r) => {
      const l = latest.get(String(r.id));
      const checks = parseJson<Record<string, unknown>[]>(r.identity_checks, []);
      const reason = r.hidden_by ? 'hidden' : String(r.excluded_reason || (r.identity_status === 'UNIDENTIFIED' ? 'ambiguous' : 'other'));
      return {
        id: r.id, name: r.identity_status === 'UNIDENTIFIED' ? (parseJson<string[]>(r.aliases, [])[0] || r.display_name) : r.display_name, reason,
        status: r.identity_status, value: r.market_value, club: r.club_name ?? l?.club_raw ?? null, tmUrl: r.tm_url, hiddenBy: r.hidden_by ?? null,
        staff: checks.find((c) => c.k === 'staff')?.n ?? null,
        article: l ? { outlet: l.outlet, url: l.publisher_url || l.url, at: l.published_at, en: l.headline_en || l.title_orig } : null,
      };
    });
    return NextResponse.json({ items });
  } catch (e) { return failure(e); }
}
