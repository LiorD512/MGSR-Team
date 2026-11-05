/**
 * Data gathering for Roster Intelligence — IN-APP SOURCES ONLY. No external scrapers.
 *
 *   • FM score  — Firestore `FmIntelligenceCache` (populated nightly), keyed by normalized name. No network.
 *   • Stats     — our own scout server /player_stats (Render, reliable), keyed by tmProfile. One call, cached.
 *
 * Everything else the engine needs (market value, contract, club, mandate, requests, notes/effort) comes
 * straight off Firestore in server.ts loadContext — no fetching here.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { TTL } from './config';
import type { TierInputs } from './types';

export interface InputPlayer {
  fullName?: string;
  positions?: string[];
  currentClub?: { clubName?: string; clubCountry?: string };
  age?: string;
  nationality?: string;
  tmProfile?: string;
}

const fresh = (at: number | undefined, ttl: number, now: number) => !!at && now - at < ttl;

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

/* ───────────────────────── FM (Firestore cache only) ───────────────────────── */

/** Same key as app/api/fminside/player/route.ts: normalize(name).replace(/\s+/g, '_'). */
const fmKey = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

async function readFmCache(db: Firestore, name: string): Promise<{ ca?: number; pa?: number; tier?: string } | null> {
  if (!name) return null;
  try {
    let snap = await db.collection('FmIntelligenceCache').doc(fmKey(name)).get();
    if (!snap.exists || !(Number(snap.data()?.ca) > 0)) {
      // fallback: match by original query name
      const alt = await db.collection('FmIntelligenceCache').where('original_query_name', '==', name).limit(1).get();
      if (!alt.empty) snap = alt.docs[0] as typeof snap;
    }
    const d = snap.data();
    if (d && Number(d.ca) > 0) return { ca: Number(d.ca), pa: Number(d.pa) || undefined, tier: d.tier ? String(d.tier) : undefined };
  } catch {
    /* ignore */
  }
  return null;
}

/* ───────────────────────── gather ───────────────────────── */

export interface GatherResult {
  inputs: TierInputs;
  refreshed: string[];
}

export async function gatherInputs(
  db: Firestore,
  p: InputPlayer,
  prev: TierInputs | undefined,
  opts: { now: number; force?: boolean }
): Promise<GatherResult> {
  const { now, force } = opts;
  const inputs: TierInputs = { ...(prev ?? {}) };
  const refreshed: string[] = [];
  const name = p.fullName ?? '';

  const jobs: Promise<void>[] = [];

  // Scout server stats (our own server) — match rating, minutes, goals/90.
  if (p.tmProfile && (force || !fresh(inputs.statsAt, TTL.stats, now))) {
    jobs.push(
      fetchJson(`${getScoutBaseUrl()}/player_stats?${new URLSearchParams({ url: p.tmProfile })}`, 15000).then((s) => {
        if (s && s.api_matched) {
          const r = Number(s.api_rating);
          const m = Number(s.api_minutes);
          const g90 = Number(s.api_goals_per90);
          if (r > 0) inputs.apiRating = r;
          if (m > 0) inputs.apiMinutes = m;
          if (g90 > 0) inputs.apiGoalsPer90 = g90;
          inputs.statsAt = now;
          refreshed.push('stats');
        } else if (s) {
          inputs.statsAt = now; // answered, no match — don't re-hit until TTL
        }
      })
    );
  }

  // FM score from the Firestore cache (no network).
  if (name && (force || !fresh(inputs.fmAt, TTL.fm, now))) {
    jobs.push(
      readFmCache(db, name).then((fm) => {
        inputs.fmAt = now;
        if (fm?.ca) {
          inputs.fmCa = fm.ca;
          if (fm.pa) inputs.fmPa = fm.pa;
          if (fm.tier) inputs.fmTier = fm.tier;
          refreshed.push('fm');
        }
      })
    );
  }

  await Promise.all(jobs);
  return { inputs, refreshed };
}
