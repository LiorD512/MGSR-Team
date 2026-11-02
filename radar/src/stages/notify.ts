import type { Db } from '../db.js';
import { all, run } from '../db.js';
import { log, now } from '../util.js';

export interface NotifyStats { players: number; sent: boolean; skipped?: string }

/**
 * One push notification per run (a digest, never one per player) when new players were identified:
 * "Press Room: 4 new players - Alexandru Pașcanu (FC Rapid 1923), Prince Adu (Viktoria Plzeň) +2".
 * The pipeline has no Firebase access, so it calls the site (POST /api/transfer-radar/notify with a shared secret), which sends the push
 * and writes the agents' notification centres. Off until RADAR_NOTIFY_SECRET is set (GitHub secret + Vercel env).
 */
export async function notifyNewPlayers(db: Db): Promise<NotifyStats> {
  const secret = process.env.RADAR_NOTIFY_SECRET;
  const site = (process.env.RADAR_SITE_URL || 'https://management.britsportgroup.com').replace(/\/$/, '');
  const rows = await all<{ id: string; display_name: string; club_name: string | null; top_headline: string | null }>(db, `
    SELECT p.id, p.display_name, p.club_name, o.top_headline FROM players p JOIN opportunities o ON o.player_id = p.id
    WHERE p.identity_status IN ('CONFIRMED','PROBABLE') AND p.notified_at IS NULL AND o.closed = 0
      AND p.id NOT IN (SELECT player_id FROM player_flags WHERE flag = 'HIDDEN')
    ORDER BY o.last_report_at DESC LIMIT 50`);
  if (!rows.length) return { players: 0, sent: false };
  if (!secret) return { players: rows.length, sent: false, skipped: 'RADAR_NOTIFY_SECRET not set' };
  try {
    const res = await fetch(`${site}/api/transfer-radar/notify`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-radar-secret': secret }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ players: rows.map((r) => ({ id: r.id, name: r.display_name, club: r.club_name, headline: r.top_headline })) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    for (const r of rows) await run(db, 'UPDATE players SET notified_at = ? WHERE id = ?', [now(), r.id]);
    return { players: rows.length, sent: true };
  } catch (e) {
    log.warn('notify failed (players are announced next run)', { msg: (e as Error).message });
    return { players: rows.length, sent: false, skipped: (e as Error).message.slice(0, 120) };
  }
}
