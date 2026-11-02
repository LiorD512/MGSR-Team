import type { Db } from '../db.js';
import { all, run } from '../db.js';
import { LEAGUES, LEAVE_TERMS } from '../leagues.js';
import { TmClient, isReserveTeam, shortClub } from '../tm.js';
import { chunk, log, now } from '../util.js';

const PER_QUERY = 6;
export interface ClubSearchStats { leagues: number; clubs: number; searches: number; disabled: number; tmRequests: number; stopReason: string }

/**
 * Club searches: for every covered league, Google News searches of the form ("Club A" OR "Club B" ...) (leave words) in the local
 * language, ~6 clubs per search. They are ordinary news-search sources (headline-only, read every 12 hours by the collector).
 * Club lists come from Transfermarkt (cached 30 days), so promotions / relegations are picked up automatically.
 */
export async function clubSearches(db: Db, tm: TmClient, deadline: number): Promise<ClubSearchStats> {
  const st: ClubSearchStats = { leagues: 0, clubs: 0, searches: 0, disabled: 0, tmRequests: 0, stopReason: '' };
  const live = new Set<string>();
  for (const L of LEAGUES) {
    if (Date.now() > deadline) { st.stopReason = 'run time budget'; break; }
    if (!tm.open) { st.stopReason = 'Transfermarkt unavailable'; break; }
    let clubs: string[];
    try { clubs = (await tm.league(L.code)).clubs.map((c) => c.name).filter((n) => !isReserveTeam(n)); }
    catch (e) { log.warn('league clubs failed', { league: L.code, msg: (e as Error).message }); continue; }
    if (!clubs.length) continue;
    st.leagues++; st.clubs += clubs.length;
    const terms = LEAVE_TERMS[L.lang] ?? LEAVE_TERMS.en;
    const groups = chunk(Array.from(new Set(clubs.map(shortClub))), PER_QUERY);
    for (let i = 0; i < groups.length; i++) {
      const id = `gnc-${L.code.toLowerCase()}-${i + 1}`;
      const q = `(${groups[i].map((c) => `"${c.replace(/"/g, '')}"`).join(' OR ')}) (${terms})`;
      const name = `Club search (${L.country}, ${L.code} ${i + 1}/${groups.length})`;
      const prov = JSON.stringify({ by: 'SEED', kind: 'GNEWS', q, cc: L.cc, lang: L.lang, key: id, league: L.code, clubs: groups[i] });
      await run(db, `INSERT INTO sources (id, name, url, host, country, languages, type, access_chosen, headline_only, status, status_reason, status_changed_at, status_changed_by, tier, reliability,
          base_interval_min, next_scan_at, provenance, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, provenance = excluded.provenance, country = excluded.country, languages = excluded.languages,
          status = CASE WHEN sources.status = 'DISABLED' AND json_extract(sources.provenance, '$.by') = 'SEED' THEN 'APPROVED' ELSE sources.status END, updated_at = excluded.updated_at
        WHERE json_extract(sources.provenance, '$.by') = 'SEED'`,
        [id, name, 'https://news.google.com/', 'news.google.com', L.country, JSON.stringify([L.lang]), 'AGGREGATOR', 'SEARCH_RSS', 1, 'APPROVED', 'Club search (auto from Transfermarkt)',
          now(), 'system', 'C', 45, 720, 0, prov, now(), now()]);
      live.add(id); st.searches++;
    }
  }
  // a league that shrank (fewer clubs) leaves stale searches behind: disable them (only when the full list was processed)
  if (!st.stopReason) {
    const old = await all<{ id: string }>(db, `SELECT id FROM sources WHERE id LIKE 'gnc-%' AND status <> 'DISABLED'`);
    for (const o of old) if (!live.has(o.id)) { await run(db, `UPDATE sources SET status = 'DISABLED', status_reason = 'club search no longer needed', updated_at = ? WHERE id = ?`, [now(), o.id]); st.disabled++; }
  }
  st.tmRequests = tm.requests;
  return st;
}

/** Club-name words of every covered league (from the cached Transfermarkt lists): football evidence for general-news headlines. */
export async function clubWordSet(db: Db): Promise<Set<string>> {
  const rows = await all<{ json: string }>(db, `SELECT json FROM tm_cache WHERE key LIKE 'league:%'`);
  const { clubTokens } = await import('../tm.js');
  const set = new Set<string>();
  for (const r of rows) {
    try { for (const c of (JSON.parse(r.json).clubs ?? []) as { name: string }[]) for (const t of clubTokens(c.name)) if (t.length >= 4) set.add(t); } catch { /* skip */ }
  }
  // words that are club names but also everyday words in the radar's languages would let general news through
  for (const w of ['union', 'national', 'nacional', 'sport', 'sporting', 'olympic', 'olympique', 'racing', 'royal', 'central', 'stade', 'unirea', 'progres', 'victoria', 'viktoria', 'atletico', 'energie', 'metalist', 'vasco', 'arsenal', 'liverpool', 'santos', 'flamengo']) set.delete(w);
  return set;
}
