import { NextRequest, NextResponse } from 'next/server';
import { authenticate, failure, isResponse, parseJson, q, q1 } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';

/** GET /api/transfer-radar/players/:id - profile, explanation, timeline (every report with its evidence) and score history. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const id = params.id;
    const player = await q1<Record<string, unknown>>('SELECT * FROM players WHERE id = ?', [id]);
    if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const opp = await q1<Record<string, unknown>>('SELECT * FROM opportunities WHERE player_id = ?', [id]);
    const timeline = await q<Record<string, unknown>>(
      `SELECT t.*, r.claim_type AS claim, r.evidence_ok, r.attributed_to, r.fb_correct, r.fb_incorrect, r.fb_outdated, r.headline_only, r.origin_key
       FROM timeline t LEFT JOIN reports r ON r.id = t.report_id WHERE t.player_id = ? ORDER BY t.at DESC LIMIT 100`, [id]);
    const history = await q<{ at: number; score: number; level: string }>('SELECT at, score, level FROM score_history WHERE player_id = ? ORDER BY at ASC LIMIT 120', [id]);
    return NextResponse.json({
      player: {
        id: player.id, displayName: player.display_name, clubName: player.club_name, country: player.country, league: player.league, position: player.position, dob: player.dob,
        nationalities: parseJson<string[]>(player.nationalities, []), foot: player.foot, heightCm: player.height_cm, contractExpires: player.contract_expires, contractVerified: !!player.contract_verified,
        resolutionStatus: player.resolution_status, onShortlist: !!player.on_shortlist, rosterPlayerId: player.roster_player_id,
      },
      opportunity: opp ? {
        score: opp.score, rawScore: opp.raw_score, level: opp.level, closed: !!opp.closed, scoreDelta7d: opp.score_delta_7d, urgency: opp.urgency, categories: parseJson<string[]>(opp.categories, []),
        bestVerification: opp.best_verification, bestTier: opp.best_tier, reportCount: opp.report_count, independentOrigins: opp.independent_origins, action: opp.action,
        explanation: parseJson<Record<string, unknown>>(opp.explanation, {}), configVersion: opp.config_version, firstSeenAt: opp.first_seen_at, lastReportAt: opp.last_report_at, lastChangeAt: opp.last_change_at,
        loanAvailable: !!opp.loan_available, transferAvailable: !!opp.transfer_available,
      } : null,
      timeline: timeline.map((t) => ({
        id: t.id, at: t.at, kind: t.kind, reportId: t.report_id, signals: parseJson<string[]>(t.signals, []), verification: t.verification, outlet: t.outlet, tier: t.tier, url: t.url,
        headlineEn: t.headline_en, titleOrig: t.title_orig, quote: t.quote, claim: t.claim, evidenceOk: !!t.evidence_ok, attributedTo: t.attributed_to, headlineOnly: !!t.headline_only, originKey: t.origin_key,
        feedback: { correct: t.fb_correct, incorrect: t.fb_incorrect, outdated: t.fb_outdated },
      })),
      history,
    });
  } catch (e) { return failure(e); }
}
