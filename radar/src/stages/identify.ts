import type { Db } from '../db.js';
import { all, one, run } from '../db.js';
import type { RadarConfig } from '../config.js';
import type { Llm } from '../llm.js';
import { BudgetExhausted } from '../llm.js';
import {
  TmClient, dateToMs, isReserveTeam, latinName, nameScore, notAClub, sameClub, valueToEur,
  type NameHow, type TmClub, type TmPlayerRow, type TmProfile, type TmSquad,
} from '../tm.js';
import { DAY, log, now } from '../util.js';

/**
 * Identify stage (v3): turns "a name in a local article" into ONE Transfermarkt player, automatically.
 *
 * Evidence, strongest first:
 *  1. the player is in the CURRENT squad of the club named in the article (squad page),
 *  2. his TM transfer history shows the article's club in the last N months (left / joined) or it is his current/loan club,
 *  3. the name matches (transliteration, grammatical endings, small spelling differences),
 *  4. if 2+ candidates have club evidence: the AI reads the article text and the candidates and picks one (or refuses).
 * A player is shown only with club evidence (CONFIRMED) or, when the article names no club, when exactly one TM player has
 * that full name (PROBABLE). Everything else is UNIDENTIFIED (kept out of the feed, retried later) - the radar never guesses.
 * Other sports (URL section / AI), coaches & officials, retired players and players above the market ceiling are EXCLUDED.
 */

const OTHER_SPORT_URL = /\/(siatkowka|siatkówka|volley(ball)?|voleybol|volei|odbojka|voleibol|pallavolo|basket(ball)?|baschet|basketbol|basquete|kosarka|kosarlabda|koszykowka|koszykówka|basquet|pallacanestro|handball|handbal|handebol|hentbol|hazena|házená|pilka-reczna|rukomet|balonmano|hockey|hokej|tenis|tennis|zuzel|speedway|f1|formula-?1|moto|rugby|futsal|esport|cycling|kolarstvi|athletics|atletika|waterpolo|vaterpolo)(\/|-|$)/i;
// other-sport words in the headline itself (any language the radar reads)
const OTHER_SPORT_WORDS = /\b(rugby|rugbi|top 14|pro d2|baschet|basketball|basketbol|kosarka|košarka|koszykówk\w*|handbal\w*|handball|rukomet|hentbol|volei\w*|volleyball|voleybol|siatkówk\w*|siatkark\w*|odbojk\w*|futsal|hockey|hokej|waterpolo|vaterpolo|euroleague|eurocup|nba|ehf)\b/i;

export interface IdentifyStats { checked: number; confirmed: number; probable: number; unidentified: number; excluded: number; merged: number; aiTieBreaks: number; tmRequests: number; tmCacheHits: number; stopReason: string }
interface RepRow { id: string; player_raw: string | null; player_latin: string | null; club_raw: string | null; club_latin: string | null; country: string | null; url: string; publisher_url: string | null; title_orig: string; headline_en: string | null; evidence_quote: string | null; sport: string | null; published_at: number }
interface PlayerRow { id: string; display_name: string; aliases: string | null; country: string | null; country_source: string | null; identity_status: string | null; tm_id: string | null; tm_attempts: number }
interface Cand { row: TmPlayerRow; s: number; how: NameHow; written: string; squad: TmSquad | null; link: { club: string; date: string | null; dir: 'left' | 'joined' | 'current' | 'loan' } | null }
export interface Check { k: string; [v: string]: string | number | null }

const PICK_SCHEMA = { type: 'OBJECT', properties: { pick: { type: 'INTEGER' }, confidence: { type: 'NUMBER' }, why: { type: 'STRING' } }, required: ['pick', 'confidence', 'why'] };
const PICK_SYSTEM = `You decide which Transfermarkt player a football news article is about. You get the article headline(s) in the original language with an English translation and short quotes, the name and club exactly as written, and a numbered list of candidate players (position, age, nationality, current club, link to the article's club).
Use only facts in the text: position words (striker, goalkeeper, winger...), nationality words ("the Brazilian"), age, previous clubs, first names, the club named.
Return pick = the candidate number, or -1 when the text does not allow a safe decision. confidence 0..1. why: <= 15 English words citing the deciding fact. Never guess: two equally plausible candidates => pick -1.`;

export async function identify(db: Db, cfg: RadarConfig, llm: Llm, deadline: number): Promise<IdentifyStats> {
  const st: IdentifyStats = { checked: 0, confirmed: 0, probable: 0, unidentified: 0, excluded: 0, merged: 0, aiTieBreaks: 0, tmRequests: 0, tmCacheHits: 0, stopReason: '' };
  const I = cfg.identify;
  if (!I.enabled) { st.stopReason = 'disabled'; return st; }
  const tm = new TmClient(db, { minGapMs: I.tmGapMs, maxRequests: I.maxTmRequestsPerRun });
  const t = now();
  // RADAR_REIDENTIFY=1 (commit message [radar-reidentify]): retry every unidentified / not-on-TM player now, ignoring the 3-day wait and attempt cap
  const again = process.env.RADAR_REIDENTIFY === '1';
  if (again) await run(db, `UPDATE players SET tm_attempts = 0, tm_checked_at = 0 WHERE identity_status = 'UNIDENTIFIED'`);
  const todo = await all<PlayerRow>(db, `SELECT p.id, p.display_name, p.aliases, p.country, p.country_source, p.identity_status, p.tm_id, p.tm_attempts FROM players p
      WHERE EXISTS (SELECT 1 FROM reports r WHERE r.player_id = p.id AND r.final = 1 AND r.published_at >= ?)
        AND (p.identity_status IS NULL OR (p.identity_status = 'UNIDENTIFIED' AND p.tm_attempts < ? AND COALESCE(p.tm_checked_at,0) < ?)
             OR (p.identity_status IN ('CONFIRMED','PROBABLE') AND COALESCE(p.tm_checked_at,0) < ?))
      ORDER BY (SELECT MAX(published_at) FROM reports r WHERE r.player_id = p.id) DESC LIMIT ?`,
    [t - cfg.pipeline.intakeDays * DAY, I.maxAttempts, t - I.retryAfterDays * DAY, t - 14 * DAY, I.maxPlayersPerRun]);

  for (const p of todo) {
    if (Date.now() > deadline) { st.stopReason = 'run time budget'; break; }
    if (!tm.open) { st.stopReason = tm.failures ? 'Transfermarkt unavailable (circuit open)' : 'TM request budget'; break; }
    try {
      // already identified: only refresh the profile (contract / value / club change)
      if ((p.identity_status === 'CONFIRMED' || p.identity_status === 'PROBABLE') && p.tm_id) {
        const prof = await tm.profile(p.tm_id);
        await saveProfile(db, p.id, prof, null, cfg);
        st.checked++;
        continue;
      }
      const r = await identifyOne(db, cfg, tm, llm, p, st);
      st.checked++;
      if (r === 'CONFIRMED') st.confirmed++; else if (r === 'PROBABLE') st.probable++; else if (r === 'EXCLUDED') st.excluded++; else st.unidentified++;
    } catch (e) {
      if (e instanceof BudgetExhausted) { st.stopReason = e.message; break; }
      log.warn('identify failed', { player: p.display_name, msg: (e as Error).message });
      await run(db, 'UPDATE players SET tm_attempts = tm_attempts + 1, tm_checked_at = ? WHERE id = ?', [now(), p.id]);
    }
  }
  st.tmRequests = tm.requests; st.tmCacheHits = tm.cacheHits;
  return st;
}

async function identifyOne(db: Db, cfg: RadarConfig, tm: TmClient, llm: Llm, p: PlayerRow, st: IdentifyStats): Promise<string> {
  let reps = await all<RepRow>(db, `SELECT id, player_raw, player_latin, club_raw, club_latin, country, url, publisher_url, title_orig, headline_en, evidence_quote, sport, published_at
      FROM reports WHERE player_id = ? ORDER BY final DESC, published_at DESC LIMIT 12`, [p.id]);
  if (!reps.length) return 'UNIDENTIFIED';

  // 0a) the same article is already attached to another radar player (the AI spelled the name differently in another analysis,
  //     e.g. "Heberton" vs "Хевертон"): one story = one player. Names must still fit, so two players named in one article stay apart.
  const twin = await sameArticleTwin(db, p.id, reps);
  if (twin) {
    if (twin.identity_status && twin.identity_status !== 'UNIDENTIFIED') { await mergeInto(db, p.id, twin.id, st); return twin.identity_status; }
    await mergeInto(db, twin.id, p.id, st); // both unknown: combine them and identify once, with every spelling
    reps = await all<RepRow>(db, `SELECT id, player_raw, player_latin, club_raw, club_latin, country, url, publisher_url, title_orig, headline_en, evidence_quote, sport, published_at
      FROM reports WHERE player_id = ? ORDER BY final DESC, published_at DESC LIMIT 12`, [p.id]);
  }
  const articleAt = Math.max(...reps.map((r) => r.published_at));

  // names as written (+ Latin form); full names first
  const names: { q: string; written: string }[] = [];
  for (const r of reps) for (const w of [r.player_latin, r.player_raw]) {
    const v = (w || '').trim(); if (!v || names.some((n) => latinName(n.q) === latinName(v))) continue;
    names.push({ q: v, written: r.player_raw || v });
  }
  // the name exactly as printed in the original headline (Cyrillic / Greek / ...): the AI's own Latin spelling can drift
  // ("Хевертон" printed, "Heberton" returned) - the printed form transliterated is the better evidence
  for (const r of reps) {
    if (!/[^\u0000-\u024f]/.test(r.title_orig)) continue;
    const words = r.title_orig.match(/[\p{L}'’-]{3,}/gu) ?? [];
    for (const n of [...names]) {
      const sur = n.q.split(/\s+/).pop() ?? '';
      for (const w of words) {
        if (!/[^\u0000-\u024f]/.test(w) || names.some((x) => x.q === w)) continue;
        if (Math.max(nameScore(w, sur).s, nameScore(sur, w).s) >= 0.6) names.push({ q: w, written: w });
      }
    }
  }
  names.sort((a, b) => latinName(b.q).split(' ').length - latinName(a.q).split(' ').length);
  const clubs: string[] = [];
  // clubs as written; "unknown", league names ("Ekstraklasa") and national teams are not clubs. Generic names ("Sporting") are kept.
  for (const r of reps) for (const v of [r.club_latin, r.club_raw]) {
    const c = (v || '').replace(/["„“”«»]/g, '').trim();
    if (c && latinName(c).length >= 3 && !notAClub(c) && !clubs.some((x) => sameClub(x, c) || latinName(x) === latinName(c))) clubs.push(c);
  }
  const countryHint = (p.country_source === 'CLUB' && p.country) || mode(reps.map((r) => r.country).filter(Boolean) as string[]);

  // 0) other sport: the outlet's own URL section says so (e.g. sportowefakty.wp.pl/siatkowka/...) or the AI said so
  const pathOf = (u: string) => { try { return new URL(u).pathname; } catch { return ''; } };
  const sportUrl = reps.find((r) => OTHER_SPORT_URL.test(pathOf(r.publisher_url || r.url)));
  const sportWord = reps.find((r) => OTHER_SPORT_WORDS.test(`${r.title_orig} ${r.headline_en ?? ''}`));
  if (sportUrl || sportWord || reps.every((r) => r.sport && r.sport !== 'FOOTBALL')) {
    return exclude(db, p, 'other_sport', [{ k: 'other_sport', url: sportUrl ? (sportUrl.publisher_url || sportUrl.url) : sportWord ? (sportWord.publisher_url || sportWord.url) : null }], names);
  }
  // the "player" is really a club ("Fenerbahçe" as player and club)
  if (names.length && names.every((n) => clubs.some((c) => sameClub(c, n.q)) || notAClub(n.q))) return exclude(db, p, 'not_player', [{ k: 'not_player', n: names[0].q }], names);

  // 0b) already on the radar: the same name in the same country as a player we identified before ("Cordea" at FCSB = Andrei Cordea of CFR Cluj,
  //     "Chorý" with another club named in the text = Tomas Chory). One unique known player only.
  {
    const known = await all<{ id: string; display_name: string; full_name: string | null; country: string | null }>(db,
      `SELECT id, display_name, full_name, country FROM players WHERE identity_status IN ('CONFIRMED','PROBABLE') AND tm_id IS NOT NULL AND id <> ?`, [p.id]);
    const countries = new Set([countryHint, ...reps.map((r) => r.country)].filter(Boolean).map((c) => latinName(c as string)));
    const hits = known.filter((k) => {
      if (!k.country || !countries.has(latinName(k.country))) return false;
      return names.some((n) => {
        const full = latinName(n.q).split(' ').length >= 2;
        const m = Math.max(nameScore(n.q, k.display_name).s, k.full_name ? nameScore(n.q, k.full_name).s : 0);
        const surname = latinName(n.q).split(' ').pop() ?? '';
        return full ? m >= 0.9 : (m >= 0.9 && surname.length >= 4) || (m >= 0.85 && surname.length >= 5);
      });
    });
    if (hits.length === 1) {
      await mergeInto(db, p.id, hits[0].id, st);
      return 'CONFIRMED';
    }
  }

  const cands = new Map<string, Cand>();
  const add = (row: TmPlayerRow, squad: TmSquad | null) => {
    let best: { s: number; how: NameHow; written: string } | null = null;
    for (const n of names) { const m = nameScore(n.q, row.name); if (!best || m.s > best.s) best = { ...m, written: n.written }; }
    if (!best || best.s < 0.7) return;
    const prev = cands.get(row.tmId);
    if (!prev) cands.set(row.tmId, { row, s: best.s, how: best.how, written: best.written, squad, link: null });
    else { if (squad && !prev.squad) prev.squad = squad; if (best.s > prev.s) Object.assign(prev, { s: best.s, how: best.how, written: best.written }); }
  };

  // 1) club named in the article -> its current squad (first team, then the reserve team if needed)
  const resolvedClubs: TmClub[] = [];
  for (const club of clubs.slice(0, 2)) {
    const sr = await tm.search(club);
    const options = sr.clubs.filter((c) => sameClub(c.name, club));
    const ranked = [...options].sort((a, b) => score(b) - score(a));
    function score(c: TmClub) { return (countryHint && latinName(c.country) === latinName(countryHint) ? 2 : 0) + (isReserveTeam(c.name) ? -1 : 0); }
    const first = ranked.find((c) => !isReserveTeam(c.name)) ?? ranked[0];
    if (!first) continue;
    resolvedClubs.push(first);
    const sq = await tm.squad(first);
    sq.players.forEach((x) => add(x, sq));
    if (![...cands.values()].some((c) => c.squad && c.s >= 0.8)) {
      const reserve = ranked.find((c) => c !== first && isReserveTeam(c.name) && latinName(c.country) === latinName(first.country));
      if (reserve) { resolvedClubs.push(reserve); const sq2 = await tm.squad(reserve); sq2.players.forEach((x) => add(x, sq2)); }
    }
  }

  // 2) not (clearly) in the squad -> search by name; keep staff hits (coaches) as a separate signal
  const staff: string[] = []; let staffScore = 0;
  if (![...cands.values()].some((c) => c.squad && c.s >= 0.85)) {
    for (const n of names.slice(0, 2)) {
      const sr = await tm.search(n.q);
      sr.players.forEach((x) => add(x, null));
      for (const s of sr.staff) { const m = nameScore(n.q, s.name).s; if (m >= 0.9) { staff.push(s.name); staffScore = Math.max(staffScore, m); } }
    }
  }

  // 3) club link for candidates outside the squad: current/loan club from search, else transfer history
  const clubIds = new Set(resolvedClubs.map((c) => c.id));
  const linked = (id: string | null, name: string | null) => (id && clubIds.has(id)) || clubs.some((c) => sameClub(c, name));
  const horizon = cfg.identify.historyMonths * 30 * DAY;
  const outside = [...cands.values()].filter((c) => !c.squad).sort((a, b) => b.s - a.s).slice(0, 5);
  for (const c of outside) {
    if (!clubs.length) break;
    if (linked(c.row.clubId, c.row.club)) { c.link = { club: c.row.club ?? '', date: null, dir: 'current' }; continue; }
    if (!tm.open) break;
    const hist = await tm.history(c.row.tmId);
    for (const m of hist) {
      const at = m.date ? Date.parse(m.date) : NaN;
      if (!Number.isFinite(at) || Math.abs(articleAt - at) > horizon) continue;
      if (linked(m.fromId, m.from)) { c.link = { club: m.from ?? '', date: m.date, dir: 'left' }; break; }
      if (linked(m.toId, m.to)) { c.link = { club: m.to ?? '', date: m.date, dir: 'joined' }; break; }
    }
  }

  // 4) decide
  const all_ = [...cands.values()].sort((a, b) => b.s - a.s);
  // candidates with club evidence; a close rival (same club, similar name) forces the AI tie-break instead of a guess
  const clubbed = all_.filter((c) => (c.squad || c.link) && c.s >= 0.7);
  const strong = clubbed.filter((c) => c.s >= 0.8);
  const candidatesJson = [...all_].sort((a, b) => Number(!!(b.squad || b.link)) - Number(!!(a.squad || a.link)) || b.s - a.s).slice(0, 4).map((c) => ({ tmId: c.row.tmId, tmUrl: c.row.tmUrl, name: c.row.name, position: c.row.position, age: c.row.age, club: c.row.club, value: c.row.value, photo: c.row.photo,
    nationalities: c.row.nationalities, s: Math.round(c.s * 100), link: c.link ?? (c.squad ? { club: c.squad.clubName, dir: 'squad', date: null } : null) }));
  let pick: Cand | null = null; let status: 'CONFIRMED' | 'PROBABLE' = 'CONFIRMED'; const checks: Check[] = [];
  let aiWhy: string | null = null;

  if (strong.length && (clubbed.length === 1 || strong[0].s - clubbed[1].s >= 0.12)) pick = strong[0];
  else if (clubbed.length) { const r = await tieBreak(llm, reps, clubbed.slice(0, 4), st); if (r) { pick = r.c; aiWhy = r.why; } }
  else if (!clubs.length) {
    // the article names no club: one TM player with that full name, or the AI decides from the text (e.g. "El Clasico ... Real Madrid")
    const full = all_.filter((c) => c.s >= 0.95 && latinName(c.written).split(' ').length >= 2);
    if (full.length === 1 && all_.filter((c) => c.s >= 0.9).length === 1) { pick = full[0]; status = 'PROBABLE'; }
    else {
      const pool = all_.filter((c) => c.s >= 0.85).slice(0, 4);
      if (pool.length) { const r = await tieBreak(llm, reps, pool, st); if (r) { pick = r.c; aiWhy = r.why; status = 'PROBABLE'; } }
    }
  }
  // the only realistic match is a star above the market ceiling (e.g. "Endrick", Roma wants to sign him): filtered as a star either way
  if (!pick) {
    const top = all_.filter((c) => c.s >= 0.9);
    const valued = top.filter((c) => (valueToEur(c.row.value) ?? 0) >= 1_000_000);
    if (valued.length === 1 && (valueToEur(valued[0].row.value) ?? 0) > cfg.identify.maxValueEur) {
      await run(db, 'UPDATE players SET market_value = ?, market_value_eur = ?, tm_url = ?, club_name = COALESCE(?, club_name) WHERE id = ?', [valued[0].row.value, valueToEur(valued[0].row.value), valued[0].row.tmUrl, valued[0].row.club, p.id]);
      return exclude(db, p, 'star', [{ k: 'star', n: valued[0].row.name, v: valued[0].row.value }], names, candidatesJson);
    }
  }
  // a coach/official with that name, and no PLAYER with that name connected to the club -> staff (e.g. Estoril's coach Vasco Matos)
  const bestPlayer = all_[0]?.s ?? 0;
  if (!pick && staff.length && (clubs.length ? !clubbed.length : staffScore > bestPlayer)) return exclude(db, p, 'staff', [{ k: 'staff', n: staff[0] }], names, candidatesJson);
  if (!pick) {
    const reason = !all_.length ? 'not_on_tm' : clubbed.length > 1 ? 'ambiguous' : 'no_club_link';
    await run(db, `UPDATE players SET identity_status='UNIDENTIFIED', excluded_reason=?, identity_candidates=?, identity_checks=?, tm_checked_at=?, tm_attempts=tm_attempts+1 WHERE id=?`,
      [reason, JSON.stringify(candidatesJson), JSON.stringify([{ k: reason, clubs: clubs.join(', ') || null }]), now(), p.id]);
    return 'UNIDENTIFIED';
  }

  // checks shown in the player file ("Is it really him?")
  checks.push({ k: pick.how === 'exact' && latinName(pick.written) === latinName(pick.row.name) ? 'name' : pick.how, w: pick.written, n: pick.row.name });
  if (pick.squad) checks.push({ k: 'squad', c: pick.squad.clubName });
  else if (pick.link?.dir === 'current' || pick.link?.dir === 'loan') checks.push({ k: 'club', c: pick.link.club });
  else if (pick.link) checks.push({ k: pick.link.dir === 'left' ? 'left' : 'joined', c: pick.link.club, d: pick.link.date });
  if (aiWhy) checks.push({ k: 'ai', why: aiWhy });
  else if (strong.length === 1 && pick.squad && !all_.some((c) => c !== pick && c.squad === pick!.squad && c.s >= 0.7)) checks.push({ k: 'unique' });
  else if (status === 'PROBABLE') checks.push({ k: 'only_one' }, { k: 'no_club' });

  const prof = await tm.profile(pick.row.tmId);
  // the squad table is the fresher source for nationality/photo when the profile lacks them
  if (!prof.photo) prof.photo = pick.row.photo;
  if (!prof.nationalities.length) prof.nationalities = pick.row.nationalities;
  const conf = status === 'PROBABLE' ? 0.7 : Math.min(0.99, 0.55 + 0.45 * pick.s);
  const keepId = await mergeByTmId(db, p.id, prof.tmId, st);
  await saveProfile(db, keepId, prof, { status, conf, checks, candidates: candidatesJson, country: pick.squad ? resolvedClubs.find((c) => c.id === pick!.squad!.clubId)?.country ?? null : null, league: pick.squad?.league ?? null, names }, cfg);
  const after = await one<{ identity_status: string }>(db, 'SELECT identity_status FROM players WHERE id = ?', [keepId]);
  return after?.identity_status ?? status;
}

async function sameArticleTwin(db: Db, playerId: string, reps: RepRow[]): Promise<{ id: string; identity_status: string | null } | null> {
  const urls = Array.from(new Set(reps.map((r) => r.publisher_url).filter((u): u is string => !!u)));
  const titles = Array.from(new Set(reps.map((r) => r.title_orig).filter((x) => x && x.length >= 25)));
  if (!urls.length && !titles.length) return null;
  const cond = [urls.length ? `r.publisher_url IN (${urls.map(() => '?').join(',')})` : '', titles.length ? `r.title_orig IN (${titles.map(() => '?').join(',')})` : ''].filter(Boolean).join(' OR ');
  const rows = await all<{ id: string; identity_status: string | null; display_name: string; full_name: string | null; player_raw: string | null; player_latin: string | null }>(db,
    `SELECT p.id, p.identity_status, p.display_name, p.full_name, r.player_raw, r.player_latin FROM reports r JOIN players p ON p.id = r.player_id
     WHERE r.player_id <> ? AND (${cond})
     ORDER BY CASE p.identity_status WHEN 'CONFIRMED' THEN 0 WHEN 'PROBABLE' THEN 1 WHEN 'EXCLUDED' THEN 2 ELSE 3 END, p.created_at`, [playerId, ...urls, ...titles]);
  const mine = reps.flatMap((r) => [r.player_raw, r.player_latin]).filter((x): x is string => !!x);
  for (const o of rows) {
    const theirs = [o.player_raw, o.player_latin, o.display_name, o.full_name].filter((x): x is string => !!x);
    if (mine.some((a) => theirs.some((b) => Math.max(nameScore(a, b).s, nameScore(b, a).s) >= 0.7))) return { id: o.id, identity_status: o.identity_status };
  }
  return null;
}

async function tieBreak(llm: Llm, reps: RepRow[], cs: Cand[], st: IdentifyStats): Promise<{ c: Cand; why: string } | null> {
  if (!llm.configured) return null;
  const text = reps.slice(0, 4).map((r) => `- ${r.title_orig}${r.headline_en ? ` (EN: ${r.headline_en})` : ''}${r.evidence_quote ? ` | quote: "${r.evidence_quote}"` : ''}`).join('\n');
  const list = cs.map((c, i) => `${i}. ${c.row.name} | ${c.row.position || '?'} | age ${c.row.age ?? '?'} | ${c.row.nationalities.join('/') || '?'} | club now: ${c.row.club || '?'} | ${c.squad ? `in ${c.squad.clubName} squad` : c.link ? `${c.link.dir} ${c.link.club} ${c.link.date ?? ''}` : 'no link to the club'}`).join('\n');
  const user = `ARTICLES:\n${text}\nNAME AS WRITTEN: ${reps[0].player_raw ?? ''}${reps[0].club_raw ? ` | CLUB AS WRITTEN: ${reps[0].club_raw}` : ''}\nCANDIDATES:\n${list}`;
  st.aiTieBreaks++;
  const r = await llm.json<{ pick: number; confidence: number; why: string }>(PICK_SYSTEM, user, PICK_SCHEMA);
  if (!r || r.pick < 0 || r.pick >= cs.length || r.confidence < 0.75) return null;
  return { c: cs[r.pick], why: String(r.why || '').slice(0, 140) };
}

async function exclude(db: Db, p: PlayerRow, reason: string, checks: Check[], names: { q: string; written: string }[], candidates: unknown[] = []): Promise<string> {
  await run(db, `UPDATE players SET identity_status='EXCLUDED', excluded_reason=?, identity_checks=?, identity_candidates=?, tm_checked_at=?, tm_attempts=tm_attempts+1, aliases=? WHERE id=?`,
    [reason, JSON.stringify(checks), JSON.stringify(candidates), now(), aliasJson(p.aliases, names), p.id]);
  return 'EXCLUDED';
}

function aliasJson(prev: string | null, names: { q: string; written: string }[]): string {
  let a: string[] = [];
  try { a = JSON.parse(prev || '[]'); } catch { a = []; }
  for (const n of names) for (const v of [n.written, n.q]) if (v && !a.includes(v)) a.push(v);
  return JSON.stringify(a.slice(0, 12));
}

/** Writes the TM identity onto the radar player. identity = null => refresh only (keeps status/checks). Applies the market-value ceiling and retired rule. */
async function saveProfile(db: Db, playerId: string, prof: TmProfile, identity: { status: string; conf: number; checks: Check[]; candidates: unknown[]; country: string | null; league: string | null; names: { q: string; written: string }[] } | null, cfg: RadarConfig) {
  const eur = valueToEur(prof.value);
  const prev = await one<{ aliases: string | null; identity_status: string | null; excluded_reason: string | null; country: string | null }>(db, 'SELECT aliases, identity_status, excluded_reason, country FROM players WHERE id = ?', [playerId]);
  let status = identity?.status ?? prev?.identity_status ?? 'CONFIRMED';
  let reason: string | null = identity ? null : prev?.excluded_reason ?? null;
  if (prof.retired) { status = 'EXCLUDED'; reason = 'retired'; }
  else if (eur != null && eur > cfg.identify.maxValueEur) { status = 'EXCLUDED'; reason = 'star'; }
  else if (prev?.identity_status === 'EXCLUDED' && (prev.excluded_reason === 'star' || prev.excluded_reason === 'retired') && !identity) { status = 'CONFIRMED'; reason = null; } // value dropped below the ceiling
  await run(db, `UPDATE players SET display_name=?, full_name=?, tm_id=?, tm_url=?, photo_url=?, dob=?, age=?, nationalities=?, position=?, foot=?, height=?, club_name=?, club_tm_id=?, club_crest=?,
      league=COALESCE(?, league), country=COALESCE(?, country), country_source=CASE WHEN ? IS NOT NULL THEN 'CLUB' ELSE country_source END, contract_expires=?, contract_verified=?, contract_source='TM', loan_from=?,
      market_value=?, market_value_eur=?, identity_status=?, excluded_reason=?, identity_conf=COALESCE(?, identity_conf), identity_checks=COALESCE(?, identity_checks), identity_candidates=COALESCE(?, identity_candidates),
      aliases=COALESCE(?, aliases), resolution_status='TM', tm_checked_at=?, tm_attempts=tm_attempts+1, updated_at=? WHERE id=?`, [
    prof.name, prof.fullName, prof.tmId, prof.tmUrl, prof.photo, prof.dob, prof.age, JSON.stringify(prof.nationalities), prof.position, prof.foot, prof.height, prof.withoutClub ? 'Without club' : prof.club, prof.clubId, prof.crest,
    prof.league ?? identity?.league ?? null, identity?.country ?? null, identity?.country ?? null, dateToMs(prof.contract), prof.contract ? 1 : 0, prof.loanFrom,
    prof.value, eur, status, reason, identity?.conf ?? null, identity ? JSON.stringify(identity.checks) : null, identity ? JSON.stringify(identity.candidates) : null,
    identity ? aliasJson(prev?.aliases ?? null, identity.names) : null, now(), now(), playerId]);
}

/** Two radar players that turn out to be the same TM player (e.g. "Chorý" + "Chorého") are merged into the older one. Returns the id that is kept. */
async function mergeByTmId(db: Db, playerId: string, tmId: string, st: IdentifyStats): Promise<string> {
  const other = await one<{ id: string }>(db, 'SELECT id FROM players WHERE tm_id = ? AND id <> ? ORDER BY created_at LIMIT 1', [tmId, playerId]);
  if (!other) return playerId;
  await mergeInto(db, playerId, other.id, st);
  return other.id;
}

/** Moves every report / mark of radar player `playerId` to `intoId` (aliases kept) and removes the duplicate. */
async function mergeInto(db: Db, playerId: string, intoId: string, st: IdentifyStats): Promise<void> {
  const other = await one<{ id: string; aliases: string | null }>(db, 'SELECT id, aliases FROM players WHERE id = ?', [intoId]);
  if (!other) return;
  const dup = await one<{ aliases: string | null; display_name: string }>(db, 'SELECT aliases, display_name FROM players WHERE id = ?', [playerId]);
  await run(db, 'UPDATE reports SET player_id = ? WHERE player_id = ?', [other.id, playerId]);
  await run(db, 'INSERT OR IGNORE INTO player_flags (player_id, flag, reason, by_email, at) SELECT ?, flag, reason, by_email, at FROM player_flags WHERE player_id = ?', [other.id, playerId]);
  for (const tbl of ['player_flags', 'opportunities', 'timeline', 'score_history']) await run(db, `DELETE FROM ${tbl} WHERE player_id = ?`, [playerId]);
  let a: string[] = []; try { a = JSON.parse(other.aliases || '[]'); } catch { /* */ }
  let b: string[] = []; try { b = JSON.parse(dup?.aliases || '[]'); } catch { /* */ }
  for (const v of [...b, dup?.display_name]) if (v && !a.includes(v)) a.push(v);
  await run(db, `UPDATE players SET aliases = ?, merge_log = json_insert(COALESCE(merge_log,'[]'), '$[#]', json(?)) WHERE id = ?`, [JSON.stringify(a.slice(0, 12)), JSON.stringify({ at: now(), kind: 'TM_MERGE', from: playerId }), other.id]);
  await run(db, 'DELETE FROM players WHERE id = ?', [playerId]);
  st.merged++;
}

function mode(a: string[]): string | null {
  const m = new Map<string, number>(); a.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}
