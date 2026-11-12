/**
 * Transfermarkt scrapers for the club-level model (server / worker only).
 * Parsers were verified on live pages (Nov 2026) — see the proof notes in docs/REQUEST_MATCHING_PLAN.md §8.
 * The older `scrapeClubTransfers` in transfermarkt.ts returns mangled names / empty origin clubs, so it is not used here.
 */
import * as cheerio from 'cheerio';
import { fetchHtmlWithRetry } from '@/lib/transfermarkt';
import { normalizePosition } from './positions';

const TM = 'https://www.transfermarkt.com';
/** TM pseudo-clubs: Without Club, Unknown, Career break, Retired. */
const PSEUDO_CLUBS = new Set(['515', '75', '2113', '123']);

export function eurFromTm(s: string): number {
  const t = (s ?? '').trim().replace(/[€\s]/g, '').toLowerCase();
  const m = t.match(/^([\d.]+)(bn|m|k|th\.)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return 0;
  return m[2] === 'bn' ? n * 1e9 : m[2] === 'm' ? n * 1e6 : m[2] === 'k' || m[2] === 'th.' ? n * 1e3 : n;
}

function median(values: number[]): number | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor(v.length / 2)]!;
}

/** TM season id of the current season (Jul-Dec → this year, Jan-Jun → last year). */
export function currentSeasonId(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export interface SquadData {
  id: string;
  name: string;
  league: string | null;
  median: number | null;
  size: number;
  positionMedian: Record<string, number>;
}

export async function scrapeSquad(vereinId: string, season = currentSeasonId()): Promise<SquadData> {
  const $ = cheerio.load(await fetchHtmlWithRetry(`${TM}/x/kader/verein/${vereinId}/saison_id/${season}`));
  const vals: number[] = [];
  const byPos: Record<string, number[]> = {};
  $('table.items > tbody > tr').each((_, tr) => {
    const v = eurFromTm($(tr).find('td.rechts.hauptlink').last().text());
    const pos = normalizePosition($(tr).find('table.inline-table tr').eq(1).text().trim());
    if (!v) return;
    vals.push(v);
    if (pos) (byPos[pos] ??= []).push(v);
  });
  const positionMedian: Record<string, number> = {};
  for (const [k, list] of Object.entries(byPos)) { const m = median(list); if (m) positionMedian[k] = m; }
  const name = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const league = ($('span.data-header__club a[href*="/startseite/wettbewerb/"]').first().attr('href') || '').match(/wettbewerb\/([A-Z0-9]+)/)?.[1] ?? null;
  return { id: vereinId, name, league, median: median(vals), size: vals.length, positionMedian };
}

export interface LeagueData { code: string; avg: number | null; uefaRank: number | null }

export async function scrapeLeague(code: string): Promise<LeagueData> {
  const h = await fetchHtmlWithRetry(`${TM}/x/startseite/wettbewerb/${code}`);
  const t = h.replace(/<[^>]+>/g, ' ').replace(/(&nbsp;|\s)+/g, ' ');
  const avgTxt = t.match(/(?:&oslash;|ø)-Market value: (€[\d.,]+[mMkK]?)/)?.[1]?.replace(/M$/, 'm').replace(/K$/, 'k');
  const uefa = t.match(/UEFA coefficient: (\d+)\. Pos/)?.[1];
  return { code, avg: avgTxt ? eurFromTm(avgTxt) || null : null, uefaRank: uefa ? +uefa : null };
}

export interface Arrival {
  name: string;
  pos: string;
  age: number | null;
  mv: number;
  fromId: string | null;
  fromName: string;
  fee: string;
  season: number;
}

/** A club's arrivals in one season, excluding returns from loan, own youth and pseudo-clubs. */
export async function scrapeArrivals(vereinId: string, season: number): Promise<Arrival[]> {
  const $ = cheerio.load(await fetchHtmlWithRetry(`${TM}/x/transfers/verein/${vereinId}/saison_id/${season}/pos//detailpos/0/w_s//plus/1`));
  const box = $('div.box').filter((_, b) => /arrivals/i.test($(b).find('h2').first().text())).first();
  const out: Arrival[] = [];
  box.find('table.items > tbody > tr').each((_, tr) => {
    const $tr = $(tr);
    const tds = $tr.children('td');
    const name = $tr.find('td.hauptlink a[href*="/profil/spieler/"]').first().text().trim();
    if (!name) return;
    const fee = tds.last().text().replace(/\s+/g, ' ').trim();
    if (/end of loan/i.test(fee)) return;
    const fromA = $tr.find('a[href*="/startseite/verein/"]').last();
    const fromId = (fromA.attr('href') || '').match(/verein\/(\d+)/)?.[1] ?? null;
    const fromName = (fromA.attr('title') || fromA.text() || '').trim();
    if (fromId === vereinId) return;
    // own / other academies distort the profile of who the first team signs
    if (/\bu1[5-9]\b|\bu2[0-3]\b|\byouth\b/i.test(fromName)) return;
    const ageTxt = tds.filter('.zentriert').first().text().trim();
    out.push({
      name,
      pos: $tr.find('table.inline-table tr').eq(1).text().trim(),
      age: /^\d{1,2}$/.test(ageTxt) ? +ageTxt : null,
      mv: eurFromTm(tds.filter('.rechts').first().text()),
      fromId: fromId && !PSEUDO_CLUBS.has(fromId) ? fromId : null,
      fromName,
      fee,
      season,
    });
  });
  return out;
}

/** The club a player last played for: current club, or (free agents) the club he left. Uses TM's transfer-history JSON. */
export async function lastClubOf(tmPlayerId: string): Promise<{ id: string; name: string } | null> {
  const raw = await fetchHtmlWithRetry(`${TM}/ceapi/transferHistory/list/${tmPlayerId}`);
  const j = JSON.parse(raw) as { transfers?: { from?: { href?: string; clubName?: string }; to?: { href?: string; clubName?: string } }[] };
  for (const t of j.transfers ?? []) {
    for (const side of [t.to, t.from]) {
      const id = side?.href?.match(/verein\/(\d+)/)?.[1];
      if (id && !PSEUDO_CLUBS.has(id)) return { id, name: side?.clubName ?? '' };
    }
  }
  return null;
}
