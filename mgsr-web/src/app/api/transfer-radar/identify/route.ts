import { NextRequest, NextResponse } from 'next/server';
import { handlePlayer, extractPlayerIdFromUrl } from '@/lib/transfermarkt';
import { authenticate, exec, failure, identityReady, isResponse, q1 } from '@/lib/transferRadar/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_VALUE_EUR = 5_000_000; // owner's market ceiling (same default as radar config identify.maxValueEur)

function valueToEur(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, '.').match(/([\d.]+)\s*(bn|m|k|th\.?)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]); const u = (m[2] || '').toLowerCase();
  return Math.round(u === 'bn' ? n * 1e9 : u === 'm' ? n * 1e6 : u.startsWith('k') || u.startsWith('th') ? n * 1e3 : n);
}
function dateToMs(s: string | null | undefined): number | null {
  const m = s?.match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : null;
}

/**
 * POST /api/transfer-radar/identify {playerId, tmUrl}
 * Rare manual correction ("Wrong player?"): the pipeline identifies players automatically; this lets an agent point a radar player at the
 * right Transfermarkt profile. The profile is read with the site's own TM scraper; the choice is final (the pipeline will not override it).
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    if (!(await identityReady())) return NextResponse.json({ error: 'NOT_READY', message: 'Identification is not set up yet' }, { status: 409 });
    const { playerId, tmUrl } = (await req.json()) as { playerId?: string; tmUrl?: string };
    if (!playerId || !tmUrl || !/transfermarkt\.[a-z.]+\/.+\/profil\/spieler\/\d+/.test(tmUrl)) return NextResponse.json({ error: 'BAD_REQUEST', message: 'playerId and a Transfermarkt profile URL are required' }, { status: 400 });
    const p = await q1<{ id: string }>('SELECT id FROM players WHERE id = ?', [playerId]);
    if (!p) return NextResponse.json({ error: 'NOT_FOUND', message: 'Player not found' }, { status: 404 });
    const tmId = extractPlayerIdFromUrl(tmUrl);
    const prof = await handlePlayer(tmUrl);
    const eur = valueToEur(prof.marketValue);
    const status = eur != null && eur > MAX_VALUE_EUR ? 'EXCLUDED' : 'CONFIRMED';
    const crestId = prof.currentClub?.clubTmProfile?.match(/verein\/(\d+)/)?.[1] ?? null;
    // another radar player already pointing at this TM player: move this player's reports there (one player = one file)
    const other = await q1<{ id: string }>('SELECT id FROM players WHERE tm_id = ? AND id <> ?', [tmId, playerId]);
    const keep = other?.id ?? playerId;
    if (other) {
      await exec('UPDATE reports SET player_id = ? WHERE player_id = ?', [keep, playerId]);
      await exec('DELETE FROM opportunities WHERE player_id = ?', [playerId]);
      await exec("UPDATE players SET identity_status = 'EXCLUDED', excluded_reason = 'merged', tm_attempts = 99 WHERE id = ?", [playerId]);
    }
    await exec(`UPDATE players SET display_name = ?, full_name = ?, tm_id = ?, tm_url = ?, photo_url = ?, age = ?, nationalities = ?, position = ?, foot = ?, height = ?,
        club_name = ?, club_tm_id = ?, club_crest = ?, country = COALESCE(?, country), contract_expires = ?, contract_verified = ?, contract_source = 'TM', loan_from = ?,
        market_value = ?, market_value_eur = ?, identity_status = ?, excluded_reason = ?, identity_conf = 1, identity_checks = ?, tm_checked_at = ?, tm_attempts = 99, resolution_status = 'TM', updated_at = ? WHERE id = ?`, [
      prof.fullName ?? null, null, tmId, prof.tmProfile ?? tmUrl, prof.profileImage ?? null, prof.age ? Number(prof.age) : null, JSON.stringify(prof.nationalities ?? []),
      prof.positions?.[0] ?? null, prof.foot ?? null, prof.height ?? null, prof.currentClub?.clubName ?? null, crestId, crestId ? `https://tmssl.akamaized.net//images/wappen/head/${crestId}.png` : null,
      prof.currentClub?.clubCountry ?? null, dateToMs(prof.contractExpires), prof.contractExpires ? 1 : 0, prof.onLoanFromClub ?? null, prof.marketValue ?? null, eur,
      status, status === 'EXCLUDED' ? 'star' : null, JSON.stringify([{ k: 'human', who: user.email }]), Date.now(), Date.now(), keep]);
    return NextResponse.json({ ok: true, playerId: keep, status, name: prof.fullName });
  } catch (e) { return failure(e); }
}
