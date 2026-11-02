import { NextRequest, NextResponse } from 'next/server';
import { authenticate, ensureFlags, exec, failure, isResponse, q1 } from '@/lib/transferRadar/server';
import { NOT_RELEVANT_REASONS } from '@/lib/transferRadar/situations';

export const dynamic = 'force-dynamic';

const ACTIONS = ['watch', 'unwatch', 'contacted', 'uncontacted', 'hide', 'restore'] as const;

/**
 * POST /api/transfer-radar/flags {playerId, action, reason?}
 * Agency-wide marks, stored in the radar database (not in Firestore):
 *   watch/unwatch     = radar watchlist     contacted/uncontacted = "we already reached out"
 *   hide(reason)/restore = "Not relevant" (the radar stops alerting on the player; the reason is kept as feedback for tuning)
 */
export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (isResponse(user)) return user;
  try {
    const { playerId, action, reason } = (await req.json()) as { playerId?: string; action?: string; reason?: string };
    if (!playerId || !(ACTIONS as readonly string[]).includes(String(action))) return NextResponse.json({ error: 'playerId and a valid action are required' }, { status: 400 });
    await ensureFlags();
    const exists = await q1('SELECT 1 FROM players WHERE id = ?', [playerId]);
    if (!exists) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const by = user.email || user.uid, at = Date.now();
    const set = (flag: string, why: string | null) => exec('INSERT OR REPLACE INTO player_flags (player_id, flag, reason, by_email, at) VALUES (?,?,?,?,?)', [playerId, flag, why, by, at]);
    const del = (flag: string) => exec('DELETE FROM player_flags WHERE player_id = ? AND flag = ?', [playerId, flag]);
    switch (action) {
      case 'watch': await set('WATCH', null); break;
      case 'unwatch': await del('WATCH'); break;
      case 'contacted': await set('CONTACTED', null); break;
      case 'uncontacted': await del('CONTACTED'); break;
      case 'hide': {
        if (!(NOT_RELEVANT_REASONS as readonly string[]).includes(String(reason))) return NextResponse.json({ error: 'reason must be one of ' + NOT_RELEVANT_REASONS.join(', ') }, { status: 400 });
        await set('HIDDEN', String(reason));
        // the reason doubles as feedback on the newest report (feeds source reliability / tuning later)
        await exec('UPDATE reports SET fb_incorrect = fb_incorrect + 1 WHERE id = (SELECT id FROM reports WHERE player_id = ? ORDER BY published_at DESC LIMIT 1)', [playerId]);
        break;
      }
      case 'restore': await del('HIDDEN'); break;
    }
    return NextResponse.json({ ok: true, by, at });
  } catch (e) { return failure(e); }
}
