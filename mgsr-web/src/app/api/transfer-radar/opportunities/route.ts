import { NextRequest, NextResponse } from 'next/server';
import { authenticate, ensureFlags, failure, foldFlags, identityReady, isResponse, parseJson, playerCols, q, STORY_REPORTS } from '@/lib/transferRadar/server';
import { situationsOf } from '@/lib/transferRadar/situations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transfer-radar/opportunities - the feed.
 * Only players the pipeline identified on Transfermarkt (CONFIRMED / PROBABLE), not excluded (stars above the ceiling, other sports,
 * staff, retired) and not hidden by the agency. Filters / sorting / sections happen in the browser (a few hundred rows at most).
 */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    if (!(await identityReady())) return NextResponse.json({ items: [], pending: true, generatedAt: Date.now() });
    await ensureFlags();
    const cols = await playerCols();
    const extra = ['agent', 'agent_url', 'club_tm_id'].filter((c) => cols.has(c)).map((c) => `p.${c}`).join(', ');
    const rows = await q<Record<string, unknown>>(`SELECT ${extra ? extra + ', ' : ''}o.player_id, o.closed, o.loan_available, o.first_seen_at, o.last_report_at,
        p.display_name, p.full_name, p.aliases, p.tm_url, p.photo_url, p.position, p.age, p.dob, p.nationalities, p.club_name, p.club_crest, p.league, p.country, p.contract_expires,
        p.loan_from, p.market_value, p.market_value_eur, p.identity_status, p.on_shortlist, p.roster_player_id
      FROM opportunities o JOIN players p ON p.id = o.player_id
      WHERE p.identity_status IN ('CONFIRMED','PROBABLE') AND o.player_id NOT IN (SELECT player_id FROM player_flags WHERE flag = 'HIDDEN')
      ORDER BY o.last_report_at DESC LIMIT 500`);
    const ids = rows.map((r) => String(r.player_id));
    const reps = ids.length ? await q<Record<string, unknown>>(`SELECT r.player_id, r.signals, r.outlet, r.country, r.published_at, r.title_orig, r.headline_en FROM reports r
      WHERE r.player_id IN (${ids.map(() => '?').join(',')}) AND ${STORY_REPORTS} ORDER BY r.published_at DESC`, ids) : [];
    const by = new Map<string, Record<string, unknown>[]>();
    for (const r of reps) { const k = String(r.player_id); const l = by.get(k) ?? []; l.push(r); by.set(k, l); }
    const flags = foldFlags(await q('SELECT player_id, flag, reason, by_email, at FROM player_flags'));

    const items = rows.map((r) => {
      const id = String(r.player_id);
      const rs = by.get(id) ?? [];
      const sits = situationsOf(rs.map((x) => parseJson<string[]>(x.signals, [])));
      const live = sits.filter((k) => k !== 'moved');
      const latest = rs[0];
      return {
        id, name: r.display_name, fullName: r.full_name, writtenAs: parseJson<string[]>(r.aliases, []).filter((a) => a !== r.display_name).slice(0, 3),
        tmUrl: r.tm_url, photo: r.photo_url, position: r.position, age: r.age, dob: r.dob, nationalities: parseJson<string[]>(r.nationalities, []),
        club: r.club_name, crest: r.club_crest, league: r.league, country: r.country, contractEnd: r.contract_expires, loanFrom: r.loan_from,
        value: r.market_value, valueEur: r.market_value_eur, identity: r.identity_status, closed: !!r.closed,
        situation: r.closed ? 'moved' : (live[0] ?? (r.loan_available ? 'loan' : 'other')), situations: live,
        firstAt: r.first_seen_at, lastAt: Number(latest?.published_at ?? r.last_report_at), sources: rs.length,
        latest: latest ? { outlet: latest.outlet, country: latest.country, at: latest.published_at, en: latest.headline_en || latest.title_orig, orig: latest.title_orig } : null,
        inRoster: !!r.roster_player_id, flags: flags.get(id) ?? {},
        agent: (r.agent as string | null) ?? null, agentUrl: (r.agent_url as string | null) ?? null, clubTmId: (r.club_tm_id as string | null) ?? null,
      };
    });
    return NextResponse.json({ items, pending: false, generatedAt: Date.now() });
  } catch (e) { return failure(e); }
}
