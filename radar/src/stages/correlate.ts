import type { Db } from '../db.js';
import { all, run } from '../db.js';
import { jaccard, norm, tokens } from '../util.js';

/**
 * Origin clustering v1 (spec R9.2): reports that are probably the same story from the same origin must count ONCE as independent confirmation.
 * Two reports of a player share an origin if:
 *   - same outlet (a newsroom repeating itself is not independent), or
 *   - their English headlines are very similar within 72 h (rewrites / syndication), or
 *   - they cite the same attribution (e.g. "club president") within 72 h.
 * Production will add simhash + journalist-level signals; this is the deterministic baseline.
 */
interface R { id: string; outlet: string | null; published_at: number; headline_en: string | null; title_orig: string; attributed_to: string | null }

export async function correlatePlayer(db: Db, playerId: string): Promise<number> {
  const rows = await all<R>(db, `SELECT id, outlet, published_at, headline_en, title_orig, attributed_to FROM reports WHERE player_id = ? ORDER BY published_at ASC`, [playerId]);
  const parent = new Map<string, string>(rows.map((r) => [r.id, r.id]));
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const H72 = 72 * 3_600_000;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const sameOutlet = !!a.outlet && norm(a.outlet) === norm(b.outlet);
      const close = Math.abs(a.published_at - b.published_at) <= H72;
      const sim = close && jaccard(tokens(a.headline_en || a.title_orig), tokens(b.headline_en || b.title_orig)) >= 0.45;
      const attr = close && !!a.attributed_to && norm(a.attributed_to) === norm(b.attributed_to) && !!norm(a.attributed_to);
      if (sameOutlet || sim || attr) union(a.id, b.id);
    }
  }
  let changed = 0;
  for (const r of rows) {
    const key = `o-${find(r.id).slice(0, 10)}`;
    const res = await run(db, 'UPDATE reports SET origin_key = ? WHERE id = ? AND (origin_key IS NULL OR origin_key <> ?)', [key, r.id, key]);
    changed += res.rowsAffected;
  }
  return changed;
}
