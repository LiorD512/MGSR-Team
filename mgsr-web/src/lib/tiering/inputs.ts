/**
 * Data gathering for Level & Focus — runs in the background worker (and the single-player re-run route).
 * Every source is optional, cached on the tier doc with its own TTL, and time-boxed. A failing source
 * never fails the player; it just lowers coverage/confidence.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { gatherPlayerIntel } from '@/lib/playerIntel';
import { NEWS_WINDOW_DAYS, TTL } from './config';
import type { NewsRow, TierInputs } from './types';

export interface InputPlayer {
  fullName?: string;
  positions?: string[];
  currentClub?: { clubName?: string; clubCountry?: string };
  age?: string;
  nationality?: string;
  tmProfile?: string;
}

const fresh = (at: number | undefined, ttl: number, now: number) => !!at && now - at < ttl;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

async function fetchJson(url: string, ms: number): Promise<Record<string, unknown> | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, ms: number): Promise<string | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MGSR-Tiering/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── news (Google News RSS) ───────────────────────── */

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

export function parseNewsRss(xml: string, playerName: string, maxAgeDays = NEWS_WINDOW_DAYS, now = Date.now()): NewsRow[] {
  const items = xml.split(/<item>/i).slice(1);
  const surname = playerName.trim().split(/\s+/).slice(-1)[0]?.toLowerCase() ?? '';
  const out: NewsRow[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const title = decode(it.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '');
    const link = decode(it.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? '');
    const pub = decode(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? '');
    const source = decode(it.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] ?? '');
    if (!title) continue;
    const t = Date.parse(pub);
    if (!Number.isNaN(t) && now - t > maxAgeDays * 24 * 3600 * 1000) continue;
    // Headline must actually mention the player (surname) to avoid noise.
    if (surname && surname.length >= 3 && !title.toLowerCase().includes(surname)) continue;
    const key = title.toLowerCase().replace(/\s+-\s+[^-]+$/, '').slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: title.slice(0, 220), source: source || undefined, date: Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10), url: link || undefined });
    if (out.length >= 8) break;
  }
  return out;
}

export async function fetchPlayerNews(p: InputPlayer): Promise<NewsRow[] | null> {
  const name = (p.fullName ?? '').trim();
  if (name.length < 3) return null;
  const club = p.currentClub?.clubName ? ` "${p.currentClub.clubName}"` : '';
  const q = encodeURIComponent(`"${name}"${club} when:${NEWS_WINDOW_DAYS}d`);
  const qLoose = encodeURIComponent(`"${name}" football when:${NEWS_WINDOW_DAYS}d`);
  const urls = [
    `https://news.google.com/rss/search?q=${q}&hl=en&gl=US&ceid=US:en`,
    `https://news.google.com/rss/search?q=${qLoose}&hl=en&gl=US&ceid=US:en`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}" when:${NEWS_WINDOW_DAYS}d`)}&hl=iw&gl=IL&ceid=IL:he`,
  ];
  const xmls = await Promise.all(urls.map((u) => fetchText(u, 8000)));
  if (xmls.every((x) => x == null)) return null;
  const merged: NewsRow[] = [];
  const seen = new Set<string>();
  for (const x of xmls) {
    if (!x) continue;
    for (const r of parseNewsRss(x, name)) {
      const k = r.title.toLowerCase().slice(0, 80);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(r);
    }
  }
  merged.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return merged.slice(0, 8);
}

/* ───────────────────────── FM (Firestore cache, then live route) ───────────────────────── */

/** Same key as app/api/fminside/player/route.ts: normalize(name).replace(/\s+/g, '_'). */
const fmKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

async function fetchFm(db: Firestore, p: InputPlayer, appOrigin: string | null): Promise<{ ca?: number; pa?: number } | null> {
  const name = p.fullName ?? '';
  if (!name) return null;
  try {
    const snap = await db.collection('FmIntelligenceCache').doc(fmKey(name)).get();
    const d = snap.data();
    if (d && Number(d.ca) > 0) return { ca: Number(d.ca), pa: Number(d.pa) || undefined };
  } catch {
    /* ignore */
  }
  if (!appOrigin) return null;
  const j = await fetchJson(
    `${appOrigin}/api/fminside/player?` +
      new URLSearchParams({
        player_name: name,
        club: p.currentClub?.clubName ?? '',
        age: p.age ?? '',
        position: (p.positions ?? [])[0] ?? '',
        nationality: p.nationality ?? '',
      }).toString(),
    20000
  );
  const ca = Number(j?.ca);
  return ca > 0 ? { ca, pa: Number(j?.pa) || undefined } : null;
}

/* ───────────────────────── gather ───────────────────────── */

export interface GatherResult {
  inputs: TierInputs;
  /** Sources that were (re)fetched successfully this run. */
  refreshed: string[];
}

export async function gatherInputs(
  db: Firestore,
  p: InputPlayer,
  prev: TierInputs | undefined,
  opts: { now: number; appOrigin: string | null; force?: boolean }
): Promise<GatherResult> {
  const { now, appOrigin, force } = opts;
  const inputs: TierInputs = { ...(prev ?? {}) };
  const refreshed: string[] = [];
  const name = p.fullName ?? '';

  const jobs: Promise<void>[] = [];

  if (force || !fresh(inputs.newsAt, TTL.news, now)) {
    jobs.push(
      fetchPlayerNews(p).then((news) => {
        if (news) {
          inputs.news = news;
          inputs.newsAt = now;
          refreshed.push('news');
        }
      })
    );
  }

  if (p.tmProfile && (force || !fresh(inputs.statsAt, TTL.stats, now))) {
    jobs.push(
      fetchJson(`${getScoutBaseUrl()}/player_stats?${new URLSearchParams({ url: p.tmProfile })}`, 12000).then((s) => {
        if (s && s.api_matched) {
          const r = Number(s.api_rating);
          const m = Number(s.api_minutes);
          if (r > 0) inputs.apiRating = r;
          if (m > 0) inputs.apiMinutes = m;
          inputs.statsAt = now;
          refreshed.push('stats');
        } else if (s) {
          inputs.statsAt = now; // answered, just no match — don't hammer it
        }
      })
    );
  }

  if (name && (force || !fresh(inputs.intelAt, TTL.intel, now))) {
    jobs.push(
      withTimeout(
        gatherPlayerIntel(name, {
          club: p.currentClub?.clubName,
          tmUrl: p.tmProfile,
          sources: ['sofascore', 'fotmob', 'injuries', 'clubelo', 'capology'],
        }),
        25000
      ).then((d) => {
        if (!d) return;
        const recent = (d.injuries?.injuries ?? []).slice(0, 3).map((i) => `${i.injury}${i.daysMissed ? ` (${i.daysMissed}d)` : ''}`);
        const eloLevel = Number(d.clubElo?.level) || undefined;
        inputs.intel = {
          sofascoreRating: d.sofascore?.rating,
          fotmobRating: d.fotmob?.rating,
          minutes: d.sofascore?.minutesPlayed ?? d.fotmob?.minutesPlayed,
          injuryProne: d.injuries?.injuryProne,
          daysMissed: d.injuries?.totalDaysMissed,
          recentInjuries: recent.length ? recent : undefined,
          eloLevel,
          elo: d.clubElo?.elo,
          weeklyWageEur: d.capology?.weeklyWageEur,
          formTrend: d.consensus?.formTrend,
        };
        inputs.intelAt = now;
        if (d.sources.length) refreshed.push('intel');
      })
    );
  }

  if (name && (force || !fresh(inputs.fmAt, TTL.fm, now))) {
    jobs.push(
      fetchFm(db, p, appOrigin).then((fm) => {
        inputs.fmAt = now;
        if (fm?.ca) {
          inputs.fmCa = fm.ca;
          if (fm.pa) inputs.fmPa = fm.pa;
          refreshed.push('fm');
        }
      })
    );
  }

  await Promise.all(jobs);
  return { inputs, refreshed };
}
