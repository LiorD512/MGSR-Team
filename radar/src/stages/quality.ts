import type { Db } from '../db.js';
import { all, one, run } from '../db.js';
import { DAY, now } from '../util.js';
import { recordSourceEvent } from '../sources.js';

const ORDER = ['A', 'B', 'C', 'D'] as const;
const BASE: Record<string, number> = { A: 90, B: 70, C: 50, D: 30 };
export interface RateStats { rated: number; down: number; up: number }

/**
 * Source reliability from the agents' feedback ("Is this story right?" in the player file):
 *  - reliability = tier base + 8 x (correct - 2 x incorrect), 0..100
 *  - tier goes down one step when wrong answers clearly dominate (>= 3 wrong and wrong >= 2 x correct + 1), up one step for C/D sources
 *    with >= 5 correct and no wrong answers. At most one automatic change per source per 30 days; an admin tier override always wins.
 */
export async function rateSources(db: Db): Promise<RateStats> {
  const st: RateStats = { rated: 0, down: 0, up: 0 };
  const rows = await all<{ id: string; tier: string; tier_override: string | null; correct: number; incorrect: number }>(db, `
    SELECT s.id, s.tier, s.tier_override, COALESCE(SUM(r.fb_correct), 0) AS correct, COALESCE(SUM(r.fb_incorrect), 0) AS incorrect
    FROM sources s JOIN reports r ON r.source_id = s.id GROUP BY s.id HAVING correct + incorrect > 0`);
  for (const s of rows) {
    st.rated++;
    const c = Number(s.correct), w = Number(s.incorrect);
    await run(db, 'UPDATE sources SET reliability = ? WHERE id = ?', [Math.max(0, Math.min(100, (BASE[s.tier] ?? 50) + 8 * (c - 2 * w))), s.id]);
    if (s.tier_override) continue;
    const recent = await one(db, `SELECT 1 FROM source_events WHERE source_id = ? AND kind = 'AUTO_TIER' AND at > ?`, [s.id, now() - 30 * DAY]);
    if (recent) continue;
    const i = ORDER.indexOf(s.tier as typeof ORDER[number]);
    let to: string | null = null;
    if (w >= 3 && w >= 2 * c + 1 && i < 3) to = ORDER[i + 1];
    else if (c >= 5 && w === 0 && i >= 2) to = ORDER[i - 1];
    if (!to) continue;
    await run(db, 'UPDATE sources SET tier = ? WHERE id = ?', [to, s.id]);
    await recordSourceEvent(db, s.id, 'AUTO_TIER', 'system', `${s.tier} -> ${to} (feedback: ${c} correct, ${w} wrong)`);
    if (ORDER.indexOf(to as typeof ORDER[number]) > i) st.down++; else st.up++;
  }
  return st;
}
