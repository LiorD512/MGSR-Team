import type { Db } from '../db.js';
import { all, one, run } from '../db.js';
import { norm, now, shortHash } from '../util.js';

// best-effort transliteration so the same player written in Cyrillic / Greek / Latin gets the same key
const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: '', ю: 'yu', я: 'ya', ј: 'j', љ: 'lj', њ: 'nj', ћ: 'c', ђ: 'dj', џ: 'dz' };
const GRK: Record<string, string> = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
export function latinKey(s: string): string {
  const base = norm(s);
  let out = '';
  for (const ch of base) out += CYR[ch] ?? GRK[ch] ?? ch;
  return out.replace(/ss/g, 's').replace(/\s+/g, ' ').trim();
}
const CLUB_NOISE = /\b(fc|fk|sk|cf|ac|as|sc|afc|sv|ks|gks|kf|bk|if|ik|rb|fcsb|club|klub|futbol|football|calcio)\b/g;
export const clubKey = (c: string) => latinKey(c).replace(CLUB_NOISE, ' ').replace(/\s+/g, ' ').trim();

export interface Resolution { playerId: string | null; status: 'LINKED' | 'CREATED' | 'REVIEW' | 'UNRESOLVED'; confidence: number }

/**
 * Entity resolution v1 (spec R7): name key + club key within the existing radar players.
 *  - full-name match (+club agrees or unknown)       -> LINKED 0.95
 *  - surname-only mention matching surname + club     -> LINKED 0.85
 *  - several candidates, none clearly better          -> REVIEW (queued, not merged)
 *  - nothing found                                    -> new player (CREATED)
 * Never merges below the link threshold; the football-database join (Transfermarkt ids, DOB, contract) is a later step.
 */
export async function resolvePlayer(db: Db, o: { name: string; nameLatin?: string; club?: string; clubLatin?: string; country?: string | null; countryCertain?: boolean; reportId?: string }): Promise<Resolution> {
  const rawName = (o.nameLatin || o.name || '').trim();
  const nameKey = latinKey(rawName);
  if (!nameKey) return { playerId: null, status: 'UNRESOLVED', confidence: 0 };
  const parts = nameKey.split(' ');
  const surname = parts[parts.length - 1];
  const ck = clubKey(o.clubLatin || o.club || '');

  const sameName = await all<{ id: string; club_key: string | null; name_key: string }>(db, 'SELECT id, club_key, name_key FROM players WHERE name_key = ?', [nameKey]);
  const clubOk = (c: string | null) => !ck || !c || c === ck || c.includes(ck) || ck.includes(c);
  const exact = sameName.filter((p) => clubOk(p.club_key));
  if (exact.length === 1) { await touch(db, exact[0].id, o, ck); return { playerId: exact[0].id, status: 'LINKED', confidence: 0.95 }; }
  if (exact.length > 1) {
    const best = exact.find((p) => p.club_key && p.club_key === ck);
    if (best) { await touch(db, best.id, o, ck); return { playerId: best.id, status: 'LINKED', confidence: 0.9 }; }
    await queueReview(db, o, exact.map((p) => p.id));
    return { playerId: null, status: 'REVIEW', confidence: 0.5 };
  }

  // surname candidates: exact surname, or a surname sharing a long prefix (covers inflections: "Chorého" ~ "Chorý")
  const pfx = surname.slice(0, Math.min(4, surname.length));
  const pool = await all<{ id: string; club_key: string | null; name_key: string; surname_key: string; display_name: string; updated_at: number }>(db,
    'SELECT id, club_key, name_key, surname_key, display_name, updated_at FROM players WHERE surname_key = ? OR surname_key LIKE ?', [surname, pfx + '%']);
  const bySurname = pool.filter((p) => p.surname_key === surname ||
    (surname.length >= 5 && p.surname_key.length >= 5 && commonPrefix(p.surname_key, surname) >= Math.min(5, Math.min(surname.length, p.surname_key.length) - 1)));
  if (parts.length === 1) {
    // surname-only mention ("Chorý"): link only when exactly one known player with that surname plays for the same club
    const m = bySurname.filter((p) => ck && p.club_key && clubOk(p.club_key));
    if (m.length === 1) { await touch(db, m[0].id, o, ck); return { playerId: m[0].id, status: 'LINKED', confidence: 0.85 }; }
    if (m.length > 1) { await queueReview(db, o, m.map((p) => p.id)); return { playerId: null, status: 'REVIEW', confidence: 0.5 }; }
    // club known, but the earlier record has no club yet: link if it is the only recent player with that surname (and adopt the club)
    if (ck && m.length === 0) {
      const open = bySurname.filter((p) => !p.club_key && now() - p.updated_at < 30 * 86_400_000);
      if (open.length === 1) { await touch(db, open[0].id, o, ck); return { playerId: open[0].id, status: 'LINKED', confidence: 0.75 }; }
    }
    // no club in the headline: link only if exactly ONE recently seen player has that surname
    if (!ck) {
      const recent = bySurname.filter((p) => p.surname_key === surname && now() - p.updated_at < 30 * 86_400_000);
      if (recent.length === 1) { await touch(db, recent[0].id, o, ck); return { playerId: recent[0].id, status: 'LINKED', confidence: 0.7 }; }
    }
  } else {
    // full name arrives for a player we only knew by surname at the same club -> upgrade that record (reversible via merge_log)
    const partial = bySurname.filter((p) => p.name_key === surname && ck && p.club_key && clubOk(p.club_key));
    if (partial.length === 1) {
      const log = JSON.stringify([{ at: now(), kind: 'NAME_UPGRADE', from: partial[0].display_name, to: o.name }]);
      await run(db, `UPDATE players SET display_name=?, name_key=?, merge_log=COALESCE(merge_log,'[]'), updated_at=? WHERE id=?`, [o.name, nameKey, now(), partial[0].id]);
      await run(db, `UPDATE players SET merge_log=? WHERE id=?`, [log, partial[0].id]);
      await touch(db, partial[0].id, o, ck);
      return { playerId: partial[0].id, status: 'LINKED', confidence: 0.8 };
    }
  }

  const id = `pl-${shortHash(`${nameKey}|${ck}`, 12)}`;
  const exists = await one(db, 'SELECT 1 FROM players WHERE id = ?', [id]);
  if (!exists) {
    await run(db, `INSERT INTO players (id, display_name, name_key, surname_key, club_name, club_key, country, resolution_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, o.name || rawName, nameKey, surname, o.club || null, ck || null, o.country ?? null, parts.length > 1 ? 'NAME_ONLY' : 'SURNAME_ONLY', now(), now()]);
  }
  return { playerId: id, status: 'CREATED', confidence: 0.6 };
}

async function touch(db: Db, id: string, o: { club?: string; country?: string | null; countryCertain?: boolean }, ck: string) {
  // a club-country the model is certain about overrides the outlet's country
  await run(db, `UPDATE players SET club_name=COALESCE(club_name, ?), club_key=COALESCE(club_key, ?), country=CASE WHEN ? = 1 THEN ? ELSE COALESCE(country, ?) END, updated_at=? WHERE id=?`,
    [o.club || null, ck || null, o.countryCertain ? 1 : 0, o.country ?? null, o.country ?? null, now(), id]);
}
function commonPrefix(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }

async function queueReview(db: Db, o: { name: string; club?: string; reportId?: string }, candidates: string[]) {
  await run(db, `INSERT OR IGNORE INTO entity_review (id, report_id, raw_name, raw_club, candidates, status, created_at) VALUES (?,?,?,?,?,?,?)`,
    [shortHash(`${o.reportId}|${o.name}`), o.reportId ?? null, o.name, o.club ?? null, JSON.stringify(candidates), 'OPEN', now()]);
}
