import * as cheerio from 'cheerio';
import type { Db } from './db.js';
import { one, run } from './db.js';
import { DAY, log, norm, now, sleep } from './util.js';

/**
 * Minimal Transfermarkt client for the radar pipeline (identify stage).
 * - Every request goes through the agency's existing html-proxy (TM blocks GitHub Actions IPs), exactly like the other
 *   TM workflows in this repo (TM_HTML_PROXY_URL). One request at a time with a polite random gap.
 * - Parsed results (not raw HTML) are cached in Turso (tm_cache) so squads/clubs/profiles are re-used across runs.
 * - Circuit breaker: 3 failures in a row stop TM for the rest of the run (identify then retries next run).
 */
export const TM = 'https://www.transfermarkt.com';
const PROXY = process.env.TM_HTML_PROXY_URL || 'https://management.britsportgroup.com/api/transfermarkt/html-proxy';

export interface TmPlayerRow { tmId: string; tmUrl: string; name: string; position: string; age: number | null; dob: string | null; nationalities: string[]; club: string | null; clubId: string | null; value: string | null; photo: string | null }
export interface TmClub { id: string; slug: string; name: string; country: string }
export interface TmSquad { clubId: string; clubName: string; league: string | null; leagueId: string | null; crest: string; players: TmPlayerRow[] }
export interface TmSearch { players: TmPlayerRow[]; clubs: TmClub[]; staff: { name: string; url: string }[] }
export interface TmProfile {
  tmId: string; tmUrl: string; name: string; fullName: string | null; dob: string | null; age: number | null; nationalities: string[]; position: string | null; foot: string | null; height: string | null;
  club: string | null; clubId: string | null; league: string | null; crest: string | null; contract: string | null; loanFrom: string | null; value: string | null; photo: string | null; retired: boolean; withoutClub: boolean;
}
export interface TmMove { date: string | null; fromId: string | null; from: string | null; toId: string | null; to: string | null }

export class TmClient {
  requests = 0; cacheHits = 0; failures = 0; private streak = 0; private last = 0;
  constructor(private db: Db, private opt: { minGapMs: number; maxRequests: number }) {}
  get open() { return this.streak < 3 && this.requests < this.opt.maxRequests; }

  private async fetchText(url: string): Promise<string> {
    if (!this.open) throw new Error(this.streak >= 3 ? 'TM circuit open' : 'TM request budget used');
    const wait = this.last + this.opt.minGapMs + Math.random() * 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now(); this.requests++;
    try {
      const res = await fetch(`${PROXY}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(60_000) });
      const body = await res.text();
      if (!res.ok || body.length < 400) throw new Error(`TM ${res.status}`);
      this.streak = 0;
      return body;
    } catch (e) {
      this.failures++; this.streak++;
      log.warn('TM request failed', { url: url.replace(TM, ''), msg: (e as Error).message });
      throw e;
    }
  }

  private async cached<T>(key: string, ttlDays: number, fn: () => Promise<T>): Promise<T> {
    const hit = await one<{ json: string; fetched_at: number }>(this.db, 'SELECT json, fetched_at FROM tm_cache WHERE key = ?', [key]);
    if (hit && now() - hit.fetched_at < ttlDays * DAY) { this.cacheHits++; return JSON.parse(hit.json) as T; }
    const v = await fn();
    await run(this.db, 'INSERT INTO tm_cache (key, json, fetched_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, fetched_at=excluded.fetched_at', [key, JSON.stringify(v), now()]);
    return v;
  }

  search(q: string): Promise<TmSearch> {
    const query = tmQuery(q);
    return this.cached(`search:${query}`, 7, async () => parseSearch(await this.fetchText(`${TM}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`)));
  }
  squad(club: TmClub, season = currentSeason()): Promise<TmSquad> {
    return this.cached(`squad:${club.id}:${season}`, 3, async () => parseSquad(await this.fetchText(`${TM}/${club.slug}/kader/verein/${club.id}/saison_id/${season}/plus/1`), club));
  }
  profile(tmId: string): Promise<TmProfile> {
    return this.cached(`profile:${tmId}`, 7, async () => parseProfile(await this.fetchText(`${TM}/-/profil/spieler/${tmId}`), tmId));
  }
  history(tmId: string): Promise<TmMove[]> {
    return this.cached(`history:${tmId}`, 7, async () => parseHistory(await this.fetchText(`${TM}/ceapi/transferHistory/list/${tmId}`)));
  }
}

export const currentSeason = (d = new Date()) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
const abs = (u: string | undefined | null) => (!u ? null : u.startsWith('http') ? u : TM + u);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** TM's search is accent-insensitive but not script-insensitive: always search in Latin letters. */
export const tmQuery = (s: string) => latinName(s).split(' ').filter(Boolean).join(' ');

function parseAge(s: string): { dob: string | null; age: number | null } {
  const dob = s.match(/(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? null;
  const a = s.match(/\((\d{1,2})\)/)?.[1] ?? (/^\d{1,2}$/.test(s.trim()) ? s.trim() : null);
  return { dob, age: a ? Number(a) : null };
}

export function parseSearch(html: string): TmSearch {
  const $ = cheerio.load(html);
  const box = (re: RegExp) => $('div.box').filter((_, e) => re.test($(e).find('h2').first().text()));
  const players: TmPlayerRow[] = [];
  box(/for players/i).find('table.items > tbody > tr').each((_, r) => {
    const $r = $(r);
    const href = $r.find('td.hauptlink a').first().attr('href') || '';
    const tmId = href.match(/profil\/spieler\/(\d+)/)?.[1];
    if (!tmId) return;
    const tds = $r.find('td.zentriert');
    const clubA = $r.find('td.zentriert a[href*="/verein/"]').first();
    const club = clubA.find('img').attr('title') || clean(clubA.text()) || null;
    const { age } = parseAge(tds.eq(2).text());
    players.push({
      tmId, tmUrl: `${TM}${href.split('?')[0]}`, name: $r.find('img').first().attr('alt') || clean($r.find('td.hauptlink a').first().text()),
      position: clean(tds.eq(0).text()), age, dob: null, nationalities: tds.eq(3).find('img').map((_, i) => $(i).attr('title') || '').get().filter(Boolean),
      club, clubId: clubA.attr('href')?.match(/verein\/(\d+)/)?.[1] ?? null, value: clean($r.find('td.rechts.hauptlink').text()) || null,
      photo: ($r.find('img').first().attr('src') || '').replace('/small/', '/medium/') || null,
    });
  });
  const clubs: TmClub[] = [];
  box(/clubs/i).find('table.items > tbody > tr').each((_, r) => {
    const a = $(r).find('td.hauptlink a').first();
    const m = (a.attr('href') || '').match(/\/([^/]+)\/startseite\/verein\/(\d+)/);
    if (m) clubs.push({ slug: m[1], id: m[2], name: clean(a.text()), country: $(r).find('img.flaggenrahmen').first().attr('title') || '' });
  });
  const staff: { name: string; url: string }[] = [];
  box(/managers|officials/i).find('table.items > tbody > tr').each((_, r) => {
    const a = $(r).find('td.hauptlink a').first();
    if (a.text().trim()) staff.push({ name: clean(a.text()), url: abs(a.attr('href')) ?? '' });
  });
  return { players, clubs, staff };
}

export function parseSquad(html: string, club: TmClub): TmSquad {
  const $ = cheerio.load(html);
  const lg = $('.data-header__club a').first();
  const players: TmPlayerRow[] = [];
  $('table.items > tbody > tr').each((_, r) => {
    const a = $(r).find('td.hauptlink a').first();
    const href = a.attr('href') || '';
    const tmId = href.match(/profil\/spieler\/(\d+)/)?.[1];
    if (!tmId) return;
    const tds = $(r).children('td');
    const { dob, age } = parseAge(tds.eq(2).text());
    players.push({
      tmId, tmUrl: `${TM}${href.split('?')[0]}`, name: clean(a.text()), position: clean($(r).find('td.posrela table tr').last().text()), age, dob,
      nationalities: $(r).find('img.flaggenrahmen').map((_, i) => $(i).attr('title') || '').get().filter(Boolean), club: club.name, clubId: club.id,
      value: clean($(r).find('td.rechts.hauptlink').text()) || null, photo: $(r).find('img.bilderrahmen-fixed').attr('data-src') || null,
    });
  });
  const clubName = clean($('h1').first().text()) || club.name;
  for (const p of players) p.club = clubName;
  return { clubId: club.id, clubName, league: clean(lg.text()) || null, leagueId: lg.attr('href')?.match(/wettbewerb\/(\w+)/)?.[1] ?? null,
    crest: `https://tmssl.akamaized.net//images/wappen/head/${club.id}.png`, players };
}

export function parseProfile(html: string, tmId: string): TmProfile {
  const $ = cheerio.load(html);
  const info: Record<string, string> = {};
  $('.info-table__content--regular').each((_, e) => { info[clean($(e).text()).replace(/:$/, '')] = clean($(e).next().text()); });
  const clubA = $('.data-header__club a').first();
  const { dob, age } = parseAge(info['Date of birth/Age'] ?? $('[itemprop=birthDate]').text());
  const clubName = clean(clubA.text()) || info['Current club'] || null;
  const name = clean($('h1').first().clone().children('span').remove().end().text()) || clean($('h1').text()).replace(/^#\d+\s*/, '');
  const mv = clean($('.data-header__market-value-wrapper').first().clone().children('p, span.data-header__last-update').remove().end().text()).split(' Last')[0];
  return {
    tmId, tmUrl: clean($('link[rel=canonical]').attr('href') || `${TM}/-/profil/spieler/${tmId}`), name, fullName: info['Name in home country'] || info['Full name'] || null, dob, age,
    nationalities: $('.info-table img.flaggenrahmen').map((_, i) => $(i).attr('title') || '').get().filter(Boolean).filter((v, i, a) => a.indexOf(v) === i),
    position: (info['Position'] || '').replace(/^.* - /, '') || null, foot: info['Foot'] || null, height: info['Height'] || null,
    club: clubName, clubId: clubA.attr('href')?.match(/verein\/(\d+)/)?.[1] ?? null, league: clean($('.data-header__league a').first().text()) || null,
    crest: clubA.attr('href')?.match(/verein\/(\d+)/)?.[1] ? `https://tmssl.akamaized.net//images/wappen/head/${clubA.attr('href')!.match(/verein\/(\d+)/)![1]}.png` : null,
    contract: info['Contract expires'] && info['Contract expires'] !== '-' ? info['Contract expires'] : null, loanFrom: info['On loan from'] || null,
    value: mv && /€/.test(mv) ? mv.replace(/\s/g, '') : null, photo: $('img.data-header__profile-image').attr('src') || null,
    retired: /retired/i.test(clubName ?? '') || /retired/i.test(info['Current club'] ?? ''), withoutClub: /without club/i.test(clubName ?? ''),
  };
}

export function parseHistory(body: string): TmMove[] {
  try {
    const j = JSON.parse(body.slice(body.indexOf('{')));
    return (j.transfers ?? []).map((t: any) => ({ date: t.dateUnformatted ?? null, fromId: idOf(t.from?.href), from: t.from?.clubName ?? null, toId: idOf(t.to?.href), to: t.to?.clubName ?? null }));
  } catch { return []; }
}
const idOf = (h?: string) => h?.match(/verein\/(\d+)/)?.[1] ?? null;

/* ------------------------------------------------------------------ names */
const EXTRA: Record<string, string> = { ł: 'l', ø: 'o', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', æ: 'ae', œ: 'oe', ı: 'i', ħ: 'h' };
const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', є: 'ye', ж: 'zh', з: 'z', и: 'i', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ґ: 'g', ј: 'j', љ: 'lj', њ: 'nj', ћ: 'c', ђ: 'dj', џ: 'dz' };
const GRK: Record<string, string> = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
/** Latin, lower-case, no diacritics, letters/digits/spaces only; Cyrillic + Greek transliterated. Keeps the spelling otherwise (TM search is spelling-sensitive). */
export function latinName(s: string): string {
  let out = '';
  // Greek digraphs first: γκ/γγ -> g, μπ -> b, ντ -> d, ου -> ou ("Γκρίλις" -> grilis)
  s = String(s || '').toLowerCase().replace(/γκ|γγ/g, 'g').replace(/μπ/g, 'b').replace(/ντ/g, 'd').replace(/ου/g, 'ou');
  for (const ch of norm(String(s || '').split('').map((c) => EXTRA[c.toLowerCase()] ?? c).join(''))) out += CYR[ch] ?? GRK[ch] ?? ch;
  return out.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const stem = (w: string) => w.replace(/(ego|emu|om|em|ovi|ova|ho|mu|ym|im|a|u|e|y|i)$/, '');
export type NameHow = 'exact' | 'translit' | 'inflect' | 'fuzzy';
/**
 * 0..1 similarity between a name as written in the press and a TM name. Handles:
 *  - transliteration (Cyrillic / Greek), diacritics
 *  - grammatical endings: "Chorého" ~ Chorý, "Adua" ~ Adu (Czech genitive), "Grealishom" ~ Grealish
 *  - short first names / nicknames: "Alex Pașcanu" ~ Alexandru Pașcanu
 *  - extra or missing middle names: "Dion Drena Beljo" ~ Dion Beljo
 *  - small spelling differences ("Wjunnyk" ~ Viunnyk)
 * The surname (last written token) must always match. Surname-only mentions score lower than full names.
 */
export function nameScore(written: string, tmName: string): { s: number; how: NameHow } {
  const w = latinName(written).split(' ').filter(Boolean), t = latinName(tmName).split(' ').filter(Boolean);
  if (!w.length || !t.length) return { s: 0, how: 'fuzzy' };
  let how: NameHow = /[^\u0000-\u024f]/.test(written) ? 'translit' : 'exact';
  const mark = (h: NameHow) => { if (how === 'exact') how = h; };
  const pair = (a: string, b: string, isSurname: boolean): number => {
    if (a === b) return 1;
    // doubled letters are spelling variants: "heverton" ~ "hevertton"
    if (a.length >= 4 && a.replace(/(.)\1+/g, '$1') === b.replace(/(.)\1+/g, '$1')) { mark('fuzzy'); return 0.95; }
    if (a.length >= 4 && stem(a) === stem(b)) { mark('inflect'); return 0.95; }
    if (b.length >= 3 && (stem(a) === b || stem(b) === a)) { mark('inflect'); return 0.92; }
    const k = Math.max(4, Math.min(a.length, b.length) - 1);
    if (a.length >= 4 && b.length >= 4 && a.slice(0, k - 1) === b.slice(0, k - 1) && Math.abs(a.length - b.length) <= 3) { mark('inflect'); return 0.9; }
    // first names: "alex" ~ "alexandru", "dani" ~ "daniel" (never for the surname)
    if (!isSurname && Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) { mark('fuzzy'); return 0.85; }
    const dist = lev(a, b), m = Math.max(a.length, b.length);
    if (dist <= 1 && m >= 4) { mark('fuzzy'); return 0.85; }
    if (dist <= 2 && m >= 7) { mark('fuzzy'); return 0.75; }
    return 0;
  };
  const best = (a: string, pool: string[], isSurname: boolean) => Math.max(0, ...pool.map((b) => pair(a, b, isSurname)));
  // the surname must match one of the TM name parts (TM sometimes lists a player by first name only: "Heverton", "Endrick")
  const sur = best(w[w.length - 1], t, true);
  if (!sur) return { s: 0, how };
  if (w.length === 1) return { s: Math.max(0, sur - 0.08), how };
  // written -> TM coverage (every word in the article found in the TM name) and TM -> written coverage (every TM name part in the article)
  const wScores = w.map((a, i) => (i === w.length - 1 ? sur : best(a, t, false)));
  const tScores = t.map((b) => Math.max(0, ...w.map((a, i) => pair(a, b, i === w.length - 1))));
  const cover = (xs: number[]) => xs.filter((x) => x > 0).length / xs.length;
  const avg = (xs: number[]) => { const hit = xs.filter((x) => x > 0); return hit.reduce((p, c) => p + c, 0) / Math.max(1, hit.length); };
  let s = 0;
  if (cover(wScores) === 1) s = Math.min(1, avg(wScores) + 0.05);           // all written words matched
  else if (cover(tScores) === 1 && t.length >= 2) s = Math.min(0.95, avg(tScores));  // article adds a middle name: "Dion Drena Beljo" ~ "Dion Beljo"
  else s = avg(wScores) * cover(wScores) * 0.9;                             // partial (first name differs completely)
  return { s, how };
}

const GENERIC = new Set(['fc', 'sc', 'fk', 'cf', 'ac', 'sk', 'afc', 'cd', 'club', 'de', 'do', 'da', 'the', 'bk', 'if', 'nk', 'hnk', 'ks', 'gd', 'cs', 'sv', 'vfl', 'vfb', 'tsv', 'ud', 'sd', 'rc', 'as', 'us', 'ssc', 'ss', 'pfc', 'ofk', 'sp', 'kv', 'krc', 'aik', 'gks', 'mks', 'kf', 'fotbal', 'futbol', 'football', 'calcio', 'united', 'city', 'town', 'sporting', 'real', 'athletic', 'club', 'ii', 'b', 'u19', 'u21', 'u23']);
export const clubTokens = (s: string) => latinName(s).split(' ').filter((t) => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t));
/** Same club? "FC Dinamo 1948" ~ "Dinamo Bucuresti", "Legia Warszawa" ~ "Legia Warsaw"; never matches on generic words like "FC". */
export function sameClub(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const A = clubTokens(a), B = clubTokens(b);
  if (!A.length || !B.length) {
    // names made only of generic words ("Sporting", "Real", "Athletic"): whole-word containment
    const x = ` ${latinName(a)} `, y = ` ${latinName(b)} `;
    return x.trim().length >= 4 && y.trim().length >= 4 && (x.includes(y) || y.includes(x));
  }
  return A.some((x) => B.some((y) => x === y || (x.length >= 5 && y.length >= 5 && (x.startsWith(y.slice(0, 5)) || y.startsWith(x.slice(0, 5))))));
}
/** Values the AI sometimes puts into "club" that are not a club. */
export function notAClub(c: string): boolean {
  const v = latinName(c);
  if (!v || /^(unknown|n a|na|none|null|no club|free agent|without club|bez kluba|bez klubu|-)$/.test(v)) return true;
  return /\b(liga|league|ligue|ekstraklasa|superliga|super lig|bundesliga|eredivisie|serie a|serie b|premiership|championship|division|primeira|segunda|allsvenskan|eliteserien|superettan|veikkausliiga|efbet|chance liga|fortuna liga|nb i|otp bank liga|prva liga|hnl|super league|national team|nationalmannschaft|reprezentac\w*)\b/.test(v);
}
export const isReserveTeam = (name: string) => /\b(ii|b|u\d{2}|youth|reserves?|jugend|juniors?|academy)\b/i.test(name);

export function valueToEur(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, '.').match(/([\d.]+)\s*(bn|m|k|th\.?)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] || '').toLowerCase();
  return Math.round(u === 'bn' ? n * 1e9 : u === 'm' ? n * 1e6 : u.startsWith('k') || u.startsWith('th') ? n * 1e3 : n);
}
/** "30/06/2027" or "Jun 30, 2027" -> epoch ms (UTC) */
export function dateToMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
