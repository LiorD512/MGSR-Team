import { NextRequest, NextResponse } from 'next/server';
import { authenticate, ensureFlags, failure, foldFlags, identityReady, isResponse, parseJson, q, q1, STORY_REPORTS } from '@/lib/transferRadar/server';
import { SIGNAL_TO_SITUATION, SITUATION_PRIORITY, type Situation } from '@/lib/transferRadar/situations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transfer-radar/players/:id - the player file.
 * identity (Transfermarkt profile + the checks that prove it is him), the story (timeline, oldest first) and every original source
 * exactly as published (original language) with the English translation and the publisher's own URL.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    if (!(await identityReady())) return NextResponse.json({ error: 'NOT_FOUND', message: 'Player not identified yet' }, { status: 404 });
    await ensureFlags();
    const p = await q1<Record<string, unknown>>('SELECT * FROM players WHERE id = ?', [params.id]);
    if (!p) return NextResponse.json({ error: 'NOT_FOUND', message: 'Player not found' }, { status: 404 });
    const opp = await q1<Record<string, unknown>>('SELECT closed, first_seen_at, last_report_at FROM opportunities WHERE player_id = ?', [params.id]);
    const reps = await q<Record<string, unknown>>(`SELECT r.id, r.signals, r.outlet, r.url, r.publisher_url, r.publisher_host, r.country, r.lang, r.published_at, r.title_orig, r.headline_en, r.evidence_quote,
        r.player_raw, s.languages, COALESCE(s.tier_override, s.tier, 'C') AS tier, s.name AS source_name
      FROM reports r LEFT JOIN sources s ON s.id = r.source_id WHERE r.player_id = ? AND ${STORY_REPORTS} ORDER BY r.published_at ASC`, [params.id]);
    const sources = reps.map((r) => ({
      id: String(r.id), outlet: (r.outlet && r.outlet !== 'Google News' ? r.outlet : r.publisher_host || r.source_name || r.outlet) as string, country: r.country as string | null,
      lang: (r.lang as string | null) || parseJson<string[]>(r.languages, [])[0] || null, tier: r.tier as string, at: Number(r.published_at),
      orig: r.title_orig as string, en: (r.headline_en as string | null) || null, quote: (r.evidence_quote as string | null) || null,
      url: (r.publisher_url as string | null) || (r.url as string), viaGoogle: !r.publisher_url && String(r.url).includes('news.google.com'), writtenAs: r.player_raw as string | null,
      situation: mainOf(parseJson<string[]>(r.signals, [])),
    }));
    // timeline: one event per day + situation, listing every source that reported it
    const events: { at: number; situation: Situation; title: string; sources: string[] }[] = [];
    for (const s of sources) {
      const day = Math.floor(s.at / 86_400_000);
      const ev = events.find((e) => Math.floor(e.at / 86_400_000) === day && e.situation === s.situation);
      if (ev) ev.sources.push(s.id); else events.push({ at: s.at, situation: s.situation, title: s.en || s.orig, sources: [s.id] });
    }
    const flags = foldFlags(await q('SELECT player_id, flag, reason, by_email, at FROM player_flags WHERE player_id = ?', [params.id]));
    return NextResponse.json({
      player: {
        id: p.id, name: p.display_name, fullName: p.full_name, writtenAs: parseJson<string[]>(p.aliases, []).filter((a) => a !== p.display_name).slice(0, 4),
        tmUrl: p.tm_url, photo: p.photo_url, position: p.position, age: p.age, dob: p.dob, nationalities: parseJson<string[]>(p.nationalities, []), foot: p.foot, height: p.height,
        club: p.club_name, crest: p.club_crest, league: p.league, country: p.country, contractEnd: p.contract_expires, loanFrom: p.loan_from, value: p.market_value, valueEur: p.market_value_eur,
        identity: p.identity_status, excludedReason: p.excluded_reason, checks: parseJson<Record<string, unknown>[]>(p.identity_checks, []), candidates: parseJson<Record<string, unknown>[]>(p.identity_candidates, []),
        inRoster: !!p.roster_player_id,
      },
      closed: !!opp?.closed, firstAt: opp?.first_seen_at ?? sources[0]?.at ?? null, lastAt: sources[sources.length - 1]?.at ?? null,
      events, sources, flags: flags.get(String(p.id)) ?? {},
    });
  } catch (e) { return failure(e); }
}

function mainOf(signals: string[]): Situation {
  const set = new Set(signals.map((s) => SIGNAL_TO_SITUATION[s]).filter(Boolean));
  return SITUATION_PRIORITY.find((k) => set.has(k)) ?? 'other';
}
