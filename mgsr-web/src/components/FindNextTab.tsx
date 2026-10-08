'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { onSnapshot, collection } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { db } from '@/lib/firebase';
import { getPlayerDetails, extractPlayerIdFromUrl, getTeammates } from '@/lib/api';
import { callShortlistAdd } from '@/lib/callables';
import Link from 'next/link';
import { appendSeenKeys, appendStoredKeys, getSeenKeys, getStoredKeys } from '@/lib/searchNoveltyMemory';
import { buildPlayerKey, diversifyCandidates, type DiversityMode } from '@/lib/discoveryDiversity';

const FIND_NEXT_MEMORY_SCOPE = 'find-next';
const FIND_NEXT_FRESHNESS_SCOPE = 'find-next:freshness';

const TM_DEFAULT_IMG = 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';

function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

interface RosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  age?: string;
  tmProfile?: string;
  playerPhoneNumber?: string;
}

interface RosterTeammateMatch {
  player: RosterPlayer;
  matchesPlayedTogether: number;
}

/* ─── helpers ─── */

function shortenPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const p = pos.trim();
  if (p.includes('Centre-Forward') || p.includes('Center-Forward')) return 'CF';
  if (p.includes('Second Striker')) return 'SS';
  if (p.includes('Centre-Back') || p.includes('Center-Back')) return 'CB';
  if (p.includes('Left-Back')) return 'LB';
  if (p.includes('Right-Back')) return 'RB';
  if (p.includes('Defensive Midfield')) return 'DM';
  if (p.includes('Central Midfield')) return 'CM';
  if (p.includes('Attacking Midfield')) return 'AM';
  if (p.includes('Left Wing') || p.includes('Left Winger')) return 'LW';
  if (p.includes('Right Wing') || p.includes('Right Winger')) return 'RW';
  if (p.includes('Goalkeeper')) return 'GK';
  return p.split(' - ').pop() || p;
}

interface SignatureStat {
  stat_key: string;
  label: string;
  label_en: string;
  percentile: number;
  value: number;
}

interface ReferencePlayer {
  name: string;
  position: string;
  age: string;
  market_value: string;
  league: string;
  club: string;
  foot: string;
  height: string;
  nationality: string;
  playing_style: string | null;
  url: string;
}

interface FindNextResult {
  name: string;
  position: string;
  age: string;
  market_value: string;
  url: string;
  league: string;
  club?: string;
  api_team?: string;
  citizenship: string;
  foot: string;
  height: string;
  contract: string;
  playing_style: string | null;
  find_next_score: number;
  signature_match: number;
  style_match_bonus: number;
  value_gap_bonus: number;
  contract_bonus: number;
  age_bonus: number;
  explanation: string;
  scout_narrative?: string;
  // API-Football season stats (last 365d) — present when api_matched is true.
  api_matched?: boolean;
  api_appearances?: number;
  api_minutes_90s?: number;
  api_goals?: number;
  api_assists?: number;
  api_dribbles_per90?: number;
  api_dribbles_success_per90?: number;
  api_shots_per90?: number;
  api_shots_on_target_per90?: number;
  api_goals_per_shot?: number;
  api_duels_won_pct?: number;
  api_key_passes_per90?: number;
  api_fouled_per90?: number;
  api_rating?: number;
}

/** Human-readable season stats derived from the per-90 + total api_ fields. */
interface DerivedStats {
  dribbles: number;
  dribbleSuccessPct: number | null;
  shots: number;
  shotsOnTargetPct: number | null;
  goals: number;
  assists: number;
  conversionPct: number | null;
  duelsWonPct: number | null;
  appearances: number | null;
}

/** Round a per-90 rate × 90-blocks into a season total. */
function toTotal(per90: number | undefined, mins90s: number | undefined): number {
  if (!per90 || !mins90s) return 0;
  return Math.round(per90 * mins90s);
}

/** Safe pct of two per-90 rates (part / whole × 100). */
function ratePct(part: number | undefined, whole: number | undefined): number | null {
  if (!part || !whole || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

function deriveStats(p: FindNextResult): DerivedStats | null {
  if (p.api_matched === false) return null;
  const m = p.api_minutes_90s;
  // Need minutes to turn per-90 into totals; without it, the readout is noise.
  if (!m || m <= 0) return null;
  return {
    dribbles: toTotal(p.api_dribbles_per90, m),
    dribbleSuccessPct: ratePct(p.api_dribbles_success_per90, p.api_dribbles_per90),
    shots: toTotal(p.api_shots_per90, m),
    shotsOnTargetPct: ratePct(p.api_shots_on_target_per90, p.api_shots_per90),
    goals: p.api_goals ?? 0,
    assists: p.api_assists ?? 0,
    conversionPct: p.api_goals_per_shot != null ? Math.round(p.api_goals_per_shot * 100) : null,
    duelsWonPct: p.api_duels_won_pct != null ? Math.round(p.api_duels_won_pct) : null,
    appearances: p.api_appearances ?? null,
  };
}

/**
 * Turn the backend's emoji-prefixed explanation into a short, clean "why".
 * The raw string looks like:
 *   "🎯 Profile match to Leroy Sané: 94%\n⚽ Style: Winger\n✅ Same playing
 *    style as Leroy Sané\n📊 Signature stats: Dribbles/90: 5.37 | …\n💰
 *    Undervalued relative to stats: €250k\n📋 Contract: 31/12/2027"
 * We drop the lines already shown elsewhere (profile-match % is in the ring,
 * the raw signature stats are in the stat band) and keep the human insight:
 * the "same playing style" note plus any value/contract angle. Emoji are
 * stripped so nothing renders as a tofu box.
 */
function cleanWhy(raw: string | null | undefined, refName?: string): string {
  if (!raw || !raw.trim()) return '';
  const isSymbol = (cp: number) =>
    (cp >= 0x2190 && cp <= 0x27bf) || // arrows, misc symbols, dingbats
    (cp >= 0x2b00 && cp <= 0x2bff) || // misc symbols & arrows
    cp === 0xfe0e || cp === 0xfe0f || // variation selectors
    (cp >= 0x1f000 && cp <= 0x1faff) || // emoji planes
    (cp >= 0x1f1e6 && cp <= 0x1f1ff); // regional indicators
  const stripEmoji = (s: string) =>
    Array.from(s)
      .filter((ch) => !isSymbol(ch.codePointAt(0) ?? 0))
      .join('')
      .replace(/\s{2,}/g, ' ')
      .trim();

  const keep: string[] = [];
  for (const line of raw.split('\n')) {
    const t = stripEmoji(line);
    if (!t) continue;
    const low = t.toLowerCase();
    // Drop lines already represented in the ring / stat band.
    if (low.startsWith('profile match')) continue;
    if (low.startsWith('signature stats')) continue;
    // "Style: Winger" duplicates the eyebrow archetype — skip the bare label.
    if (/^style:\s*\S+$/i.test(t)) continue;
    keep.push(t);
  }
  let out = keep.join(' · ');
  // Tidy the common "Same playing style as X" phrasing.
  if (refName) out = out.replace(new RegExp(`same playing style as ${refName}`, 'i'), `Same style as ${refName}`);
  return out;
}

interface RadarGeom {
  rings: string[];      // concentric grid polygons (outer→inner)
  axes: { x: number; y: number }[];   // axis end points
  shape: string;        // the player's percentile polygon
  dots: { x: number; y: number }[];   // vertex dots
  labels: { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end' }[];
}

/**
 * Build the reference-signature radar geometry from the signature stats.
 * N axes evenly spaced around the circle; each vertex sits at
 * (percentile/100) of the max radius. Pure geometry — no magic numbers tied
 * to a specific stat set, so it adapts to however many stats come back.
 */
function buildRadar(stats: SignatureStat[], R = 90): RadarGeom | null {
  const n = stats.length;
  if (n < 3) return null; // a radar needs at least a triangle
  const pt = (radius: number, i: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n; // start at top, clockwise
    return { x: +(radius * Math.cos(ang)).toFixed(1), y: +(radius * Math.sin(ang)).toFixed(1) };
  };
  const poly = (radius: number) => Array.from({ length: n }, (_, i) => { const p = pt(radius, i); return `${p.x},${p.y}`; }).join(' ');

  const rings = [R, R * 0.66, R * 0.33].map(poly);
  const axes = Array.from({ length: n }, (_, i) => pt(R, i));
  const dots = stats.map((s, i) => pt((Math.max(0, Math.min(100, s.percentile)) / 100) * R, i));
  const shape = dots.map((p) => `${p.x},${p.y}`).join(' ');
  const labels = stats.map((s, i) => {
    const p = pt(R + 16, i);
    const anchor: 'start' | 'middle' | 'end' = p.x > 6 ? 'start' : p.x < -6 ? 'end' : 'middle';
    // Short label: drop the "/90" suffix, keep it compact for the ring.
    const text = (s.label_en || s.label || '').replace(/\s*\/\s*90$/i, '').replace(/successful/i, 'Succ.').toUpperCase();
    return { x: p.x, y: p.y, text, anchor };
  });
  return { rings, axes, shape, dots, labels };
}

interface FindNextResponse {
  reference_player?: ReferencePlayer;
  signature_stats?: SignatureStat[];
  results: FindNextResult[];
  result_count: number;
  total_candidates_scanned?: number;
  error?: string;
}

const ALL_EXAMPLE_PLAYERS = [
  'Mohamed Salah',
  'Erling Haaland',
  'Jude Bellingham',
  'Vinicius Junior',
  'Florian Wirtz',
  'Lamine Yamal',
  'Bukayo Saka',
  'Phil Foden',
  'Rodri',
  'Jamal Musiala',
  'Martin Ødegaard',
  'Pedri',
  'Kylian Mbappé',
  'Cole Palmer',
  'Bruno Fernandes',
  'Kevin De Bruyne',
  'Harry Kane',
  'Robert Lewandowski',
  'Declan Rice',
  'Federico Valverde',
  'Gavi',
  'Bernardo Silva',
  'Leroy Sané',
  'Rafael Leão',
  'Dani Olmo',
  'Khvicha Kvaratskhelia',
  'Victor Osimhen',
  'Alexander Isak',
  'Nico Williams',
  'Alejandro Garnacho',
  'Aurélien Tchouaméni',
  'Sandro Tonali',
  'William Saliba',
  'Lionel Messi',
  'Cristiano Ronaldo',
  'Neymar',
  'Son Heung-min',
  'Luka Modric',
  'Toni Kroos',
  'Bruno Guimaraes',
  'Alexis Mac Allister',
  'Martin Zubimendi',
  'Joao Neves',
  'Ruben Dias',
  'Virgil van Dijk',
  'Josko Gvardiol',
  'Alphonso Davies',
  'Achraf Hakimi',
  'Trent Alexander-Arnold',
  'Federico Chiesa',
  'Julian Alvarez',
  'Lautaro Martinez',
  'Benjamin Sesko',
  'Victor Boniface',
  'Xavi Simons',
  'Arda Guler',
  'Warren Zaire-Emery',
  'Kobbie Mainoo',
  'Pau Cubarsi',
  'Endrick',
  'Joao Pedro',
  'Dominik Szoboszlai',
  'Matheus Nunes',
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getFindNextKey(player: FindNextResult): string {
  return buildPlayerKey(player.url, player.name);
}

function selectFindNextResults(
  pool: FindNextResult[],
  count: number,
  mode: DiversityMode,
  seenKeys: string[],
  seed: string,
): FindNextResult[] {
  return diversifyCandidates({
    candidates: pool,
    limit: count,
    mode,
    seed,
    seenKeys,
    getKey: (p) => getFindNextKey(p),
    getBaseScore: (p) => Math.max(0.1, p.find_next_score),
    getTokens: (p) => {
      const league = (p.league || '').trim().toLowerCase();
      const club = (p.club || p.api_team || '').trim().toLowerCase();
      const nation = (p.citizenship || '').trim().toLowerCase();
      const position = (p.position || '').trim().toLowerCase();
      const age = parseInt((p.age || '').replace(/[^\d]/g, ''), 10);
      const value = p.market_value || '';
      return [
        league ? `league:${league}` : '',
        club ? `club:${club}` : '',
        nation ? `nation:${nation}` : '',
        position ? `pos:${position}` : '',
        Number.isNaN(age) ? 'age:unknown' : `age:${Math.floor(age / 3) * 3}`,
        value ? `value:${value.toLowerCase()}` : 'value:unknown',
      ].filter(Boolean);
    },
  });
}

function parseAgeValue(age: string | undefined): number | null {
  const parsed = parseInt((age || '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseMarketValueToEuro(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().replace(/,/g, '').toLowerCase();
  const number = parseFloat(normalized.replace(/[^\d.]/g, ''));
  if (Number.isNaN(number)) return null;
  if (normalized.includes('m')) return Math.round(number * 1_000_000);
  if (normalized.includes('k')) return Math.round(number * 1_000);
  return Math.round(number);
}

const VALUE_PRESETS = [
  { label: '€100K', value: 100000 },
  { label: '€250K', value: 250000 },
  { label: '€500K', value: 500000 },
  { label: '€750K', value: 750000 },
  { label: '€1M', value: 1000000 },
  { label: '€1.5M', value: 1500000 },
  { label: '€2M', value: 2000000 },
  { label: '€2.5M', value: 2500000 },
  { label: '€3M', value: 3000000 },
  { label: '€4M', value: 4000000 },
  { label: '€5M', value: 5000000 },
  { label: '€7.5M', value: 7500000 },
  { label: '€10M', value: 10000000 },
  { label: '€15M', value: 15000000 },
  { label: '€20M', value: 20000000 },
  { label: 'No limit', value: 0, labelHe: 'ללא הגבלה' },
];

export default function FindNextTab() {
  const { user } = useAuth();
  const { isRtl, lang, t } = useLanguage();
  const searchAbortRef = useRef<AbortController | null>(null);

  const [playerName, setPlayerName] = useState('');
  const [ageMin, setAgeMin] = useState(17);
  const [ageMax, setAgeMax] = useState(23);
  const [valueMin, setValueMin] = useState<number>(100000);
  const [valueMax, setValueMax] = useState<number>(3000000);

  const [response, setResponse] = useState<FindNextResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diversityMode, setDiversityMode] = useState<DiversityMode>('balanced');
  const [examples, setExamples] = useState<string[]>([]);
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterTmProfiles, setRosterTmProfiles] = useState<Set<string>>(new Set());
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const shortlistUnsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    });
    const rosterUnsub = onSnapshot(collection(db, 'Players'), (snap) => {
      const urls = snap.docs
        .map((d) => (d.data().tmProfile as string)?.trim())
        .filter((u): u is string => !!u);
      setRosterTmProfiles(new Set(urls));
      const players: RosterPlayer[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: data.fullName as string | undefined,
          profileImage: data.profileImage as string | undefined,
          positions: data.positions as string[] | undefined,
          marketValue: data.marketValue as string | undefined,
          age: data.age as string | undefined,
          tmProfile: (data.tmProfile as string)?.trim(),
          playerPhoneNumber: data.playerPhoneNumber as string | undefined,
        };
      });
      setRosterPlayers(players);
    });
    return () => { shortlistUnsub(); rosterUnsub(); };
  }, [user]);

  const fetchTeammates = useCallback(async (playerUrl: string) => {
    setLoadingTeammatesUrl(playerUrl);
    try {
      const teammates = await getTeammates(playerUrl);
      const rosterIds = new Set(rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean));
      const matches: RosterTeammateMatch[] = teammates
        .filter((tm) => rosterIds.has(extractPlayerIdFromUrl(tm.tmProfileUrl) ?? ''))
        .map((tm) => {
          const id = extractPlayerIdFromUrl(tm.tmProfileUrl);
          const rosterPlayer = rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === id);
          return rosterPlayer ? { player: rosterPlayer, matchesPlayedTogether: tm.matchesPlayedTogether } : null;
        })
        .filter((m): m is RosterTeammateMatch => m != null)
        .sort((a, b) => b.matchesPlayedTogether - a.matchesPlayedTogether);
      setTeammatesCache((prev) => ({ ...prev, [playerUrl]: matches }));
    } catch {
      setTeammatesCache((prev) => ({ ...prev, [playerUrl]: [] }));
    } finally {
      setLoadingTeammatesUrl(null);
    }
  }, [rosterPlayers]);

  const toggleTeammates = useCallback((url: string) => {
    setExpandedTeammatesUrl((prev) => (prev === url ? null : url));
  }, []);

  const handleTeammatesClick = useCallback((e: React.MouseEvent, playerUrl: string) => {
    e.stopPropagation();
    if (!playerUrl) return;
    toggleTeammates(playerUrl);
    if (!(playerUrl in teammatesCache) && !loadingTeammatesUrl) {
      fetchTeammates(playerUrl);
    }
  }, [toggleTeammates, fetchTeammates, teammatesCache, loadingTeammatesUrl]);

  const addToShortlist = useCallback(
    async (player: FindNextResult, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = player.url;
      if (!user || !url) return;
      setShortlistError(null);
      setAddingToShortlistUrl(url);
      try {
        const account = await getCurrentAccountForShortlist(user);
        let entry: Record<string, unknown> = {
          platform: 'men',
          tmProfileUrl: url,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        try {
          const details = await getPlayerDetails(url);
          entry = {
            ...entry,
            playerImage: details.profileImage ?? null,
            playerName: details.fullName ?? null,
            playerPosition: details.positions?.[0] ?? null,
            playerAge: details.age ?? null,
            playerNationality: details.nationality ?? null,
            playerNationalityFlag: details.nationalityFlag ?? null,
            clubJoinedName: details.currentClub?.clubName ?? null,
            marketValue: details.marketValue ?? null,
          };
        } catch {
          entry = {
            ...entry,
            playerName: player.name ?? null,
            playerPosition: player.position ?? null,
            playerAge: player.age ?? null,
            playerNationality: player.citizenship ?? null,
            clubJoinedName: player.club ?? player.api_team ?? null,
            marketValue: player.market_value ?? null,
          };
        }
        await callShortlistAdd(entry as Parameters<typeof callShortlistAdd>[0]);
      } catch (err) {
        setShortlistError(err instanceof Error ? err.message : 'Failed to add');
      } finally {
        setAddingToShortlistUrl(null);
      }
    },
    [user]
  );

  // Shuffle example badges on mount
  useEffect(() => {
    setExamples(shuffleArray(ALL_EXAMPLE_PLAYERS));
  }, []);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  const handleAgeMinChange = useCallback((next: number) => {
    setAgeMin(next);
    setAgeMax((current) => Math.max(current, next));
  }, []);

  const handleAgeMaxChange = useCallback((next: number) => {
    setAgeMax(next);
    setAgeMin((current) => Math.min(current, next));
  }, []);

  const handleValueMinChange = useCallback((next: number) => {
    setValueMin(next);
    setValueMax((current) => (current > 0 && current < next ? next : current));
  }, []);

  const handleValueMaxChange = useCallback((next: number) => {
    setValueMax(next);
    if (next > 0) {
      setValueMin((current) => Math.min(current, next));
    }
  }, []);

  const handleStopSearch = useCallback(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }, []);

  const handleSearch = useCallback(async () => {
    const name = playerName.trim();
    if (!name) return;
    const normalizedAgeMin = Math.min(ageMin, ageMax);
    const normalizedAgeMax = Math.max(ageMin, ageMax);
    const normalizedValueMin = valueMin;
    const normalizedValueMax = valueMax > 0 && valueMax < normalizedValueMin ? normalizedValueMin : valueMax;
    const noveltyQuery = `${name}|age:${normalizedAgeMin}-${normalizedAgeMax}|value:${normalizedValueMin}-${normalizedValueMax || 'any'}`;
    const freshnessScope = user?.uid ? `${FIND_NEXT_FRESHNESS_SCOPE}:${user.uid}` : FIND_NEXT_FRESHNESS_SCOPE;
    const querySeenKeys = getSeenKeys(FIND_NEXT_MEMORY_SCOPE, noveltyQuery);
    const freshnessSeenKeys = getStoredKeys(freshnessScope);
    const seenKeys = Array.from(new Set([...querySeenKeys, ...freshnessSeenKeys]));
    const seed = `${new Date().toISOString().slice(0, 10)}-${user?.uid ?? 'anon'}-${noveltyQuery}`;
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    setSearching(true);
    setError(null);
    setResponse(null);
    try {
      const params = new URLSearchParams({
        player_name: name,
        age_min: String(normalizedAgeMin),
        age_max: String(normalizedAgeMax),
        lang: lang,
        limit: '500', // Request large pool; we randomly sample 15 on the client for variety
      });
      if (normalizedValueMin > 0) {
        params.set('value_min', String(normalizedValueMin));
      }
      if (normalizedValueMax > 0) {
        params.set('value_max', String(normalizedValueMax));
      }
      if (seenKeys.length > 0) {
        params.set('seen_keys', seenKeys.join(','));
      }
      const res = await fetch(`https://football-scout-server-l38w.onrender.com/find_next?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const data = (await res.json()) as FindNextResponse;
      if (data.error) {
        setError(data.error);
      } else {
        const filteredResults = (data.results ?? []).filter((player) => {
          const playerAge = parseAgeValue(player.age);
          if (playerAge == null || playerAge < normalizedAgeMin || playerAge > normalizedAgeMax) {
            return false;
          }

          const playerValue = parseMarketValueToEuro(player.market_value);
          if (normalizedValueMin > 0) {
            if (playerValue == null || playerValue < normalizedValueMin) return false;
          }
          if (normalizedValueMax > 0 && playerValue != null && playerValue > normalizedValueMax) {
            return false;
          }
          return true;
        });

        // Diversify by league/club/nationality and penalize previously seen keys per reference player query.
        const sampled = selectFindNextResults(filteredResults, 15, diversityMode, seenKeys, seed);
        setResponse({ ...data, results: sampled, result_count: sampled.length });
        const keys = sampled.map((p) => getFindNextKey(p)).filter(Boolean);
        appendSeenKeys(FIND_NEXT_MEMORY_SCOPE, noveltyQuery, keys);
        appendStoredKeys(freshnessScope, keys);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(timeoutId);
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
      }
      setSearching(false);
    }
  }, [playerName, ageMin, ageMax, valueMin, valueMax, lang, diversityMode, user?.uid]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const isHe = lang === 'he';

  return (
    <>
      {/* Masthead */}
      <header className="brit-masthead">
        <div className="brit-ab-mastflex">
          <div>
            <p className="brit-kicker">{isHe ? 'התאמת חתימה / פלטפורמת גברים' : 'Signature match / Men platform'}</p>
            <h1>{isHe ? 'מצא את ' : 'Find the '}<span>{isHe ? 'הבא.' : 'next.'}</span></h1>
            <p className="brit-ra-sub">
              {isHe
                ? 'בחר שחקן ייחוס והמנוע ימצא שחקנים צעירים וזולים עם חתימה סטטיסטית דומה — בטווח שלך.'
                : 'Pick a reference player and the engine finds young, affordable players with a similar statistical signature — in your band.'}
            </p>
          </div>
        </div>
      </header>

      {/* Search config panel */}
      <div className="brit-wr-cfg">
        <div className="cfg-term"><span className="d" />{isHe ? 'מנוע התאמת חתימה' : 'Signature match engine'}</div>

        {/* Reference player — prompt row (input + search together) */}
        <label className="cfg-label" htmlFor="find-next-name">{isHe ? 'שחקן ייחוס' : 'Reference player'}</label>
        <div className="cfg-search">
          <input
            id="find-next-name"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isHe ? 'למשל: Mohamed Salah' : 'e.g. Mohamed Salah'}
            dir="ltr"
            disabled={searching}
          />
          {searching && (
            <button className="cfg-stop" onClick={handleStopSearch}>{isHe ? 'עצור' : 'Stop'}</button>
          )}
          <button className="cfg-go" onClick={handleSearch} disabled={searching || !playerName.trim()}>
            {searching ? (isHe ? 'מחפש…' : 'Searching…') : (isHe ? 'מצא את הבא' : 'Find the next')}
          </button>
        </div>
        <div className="cfg-chips">
          {examples.slice(0, 10).map((name) => (
            <button key={name} className="cfg-chip" onClick={() => setPlayerName(name)} disabled={searching}>{name}</button>
          ))}
        </div>

        {/* Filters row: age · value · diversity */}
        <div className="cfg-filters">
          <div className="cfg-f">
            <div className="cfg-fh"><span className="k">{isHe ? 'טווח גיל' : 'Age range'}</span><span className="v">{ageMin} – {ageMax}</span></div>
            <div className="cfg-range"><span>{isHe ? 'מינ' : 'Min'}</span><input type="range" min={17} max={35} value={ageMin} onChange={(e) => handleAgeMinChange(Number(e.target.value))} disabled={searching} /><b>{ageMin}</b></div>
            <div className="cfg-range"><span>{isHe ? 'מקס' : 'Max'}</span><input type="range" min={17} max={35} value={ageMax} onChange={(e) => handleAgeMaxChange(Number(e.target.value))} disabled={searching} /><b>{ageMax}</b></div>
          </div>

          <div className="cfg-f">
            <div className="cfg-fh">
              <span className="k">{isHe ? 'שווי שוק' : 'Market value'}</span>
              <span className="v">
                {VALUE_PRESETS.find((p) => p.value === valueMin)?.label ?? `€${valueMin}`} – {valueMax > 0 ? (VALUE_PRESETS.find((p) => p.value === valueMax)?.label ?? `€${valueMax}`) : (isHe ? 'ללא הגבלה' : 'No limit')}
              </span>
            </div>
            <div className="cfg-selrow">
              <span className="cfg-sel">
                <select value={String(valueMin)} onChange={(e) => handleValueMinChange(Number(e.target.value))} disabled={searching}>
                  {VALUE_PRESETS.filter((p) => p.value > 0).map((p) => (
                    <option key={`min-${p.value}`} value={p.value}>{isHe && p.labelHe ? p.labelHe : p.label}</option>
                  ))}
                </select>
              </span>
              <span className="cfg-dash">—</span>
              <span className="cfg-sel">
                <select value={String(valueMax)} onChange={(e) => handleValueMaxChange(Number(e.target.value))} disabled={searching}>
                  {VALUE_PRESETS.map((p) => (
                    <option key={`max-${p.value}`} value={p.value}>{isHe && p.labelHe ? p.labelHe : p.label}</option>
                  ))}
                </select>
              </span>
            </div>
          </div>

          <div className="cfg-f">
            <div className="cfg-fh"><span className="k">{isHe ? 'מצב גיוון' : 'Diversity'}</span></div>
            <div className="cfg-modes">
              {([
                { key: 'strict' as DiversityMode, en: 'Strict', he: 'מדויק', subEn: 'On-brief', subHe: 'מדויק' },
                { key: 'balanced' as DiversityMode, en: 'Balanced', he: 'מאוזן', subEn: 'Mix & fit', subHe: 'שילוב' },
                { key: 'discovery' as DiversityMode, en: 'Discovery', he: 'תגלית', subEn: 'Wildcards', subHe: 'הפתעות' },
              ]).map((m) => (
                <button key={m.key} className={`cfg-mode${diversityMode === m.key ? ' on' : ''}`} onClick={() => setDiversityMode(m.key)} disabled={searching}>
                  {isHe ? m.he : m.en}<span className="cx">{isHe ? m.subHe : m.subEn}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="brit-wr-error">{error}</div>}

      {/* Reference player signature hero */}
      {response?.reference_player && (() => {
        const radar = response.signature_stats ? buildRadar(response.signature_stats) : null;
        return (
        <div className="brit-wr-hero">
          <div className="hero-left">
            <span className="tag">{isHe ? 'חתימת ייחוס' : 'Reference signature'}</span>
            <h2>{response.reference_player.name}</h2>
            <div className="who">
              <b>{shortenPosition(response.reference_player.position)}</b> · {response.reference_player.age} · {response.reference_player.club && response.reference_player.club !== '?' ? response.reference_player.club : response.reference_player.league}
              <br />
              {response.reference_player.market_value}
              {response.reference_player.nationality && ` · ${response.reference_player.nationality}`}
              {response.reference_player.foot && ` · ${response.reference_player.foot}`}
            </div>
            {response.reference_player.playing_style && (
              <div className="style-tag">{response.reference_player.playing_style}</div>
            )}
            {radar && (
              <div className="radar-wrap">
                <svg className="radar" viewBox="-132 -116 264 232" aria-label="Statistical signature radar">
                  {radar.rings.map((pts, i) => <polygon key={`ring-${i}`} className="grid" points={pts} />)}
                  {radar.axes.map((a, i) => <line key={`axis-${i}`} className="axis" x1="0" y1="0" x2={a.x} y2={a.y} />)}
                  <polygon className="shape" points={radar.shape} />
                  {radar.dots.map((d, i) => <circle key={`dot-${i}`} className="dot" cx={d.x} cy={d.y} r="3" />)}
                  {radar.labels.map((l, i) => <text key={`lbl-${i}`} className="lbl" x={l.x} y={l.y} textAnchor={l.anchor}>{l.text}</text>)}
                </svg>
              </div>
            )}
          </div>
          <div className="hero-right">
            {response.signature_stats && response.signature_stats.length > 0 ? (
              <>
                <p className="sig-title">
                  {isHe ? 'חתימה סטטיסטית · ל-90 דקות ואחוזון מול עמדה' : 'Statistical signature · per 90 & percentile vs position'}
                </p>
                <div className="sigbars">
                  {response.signature_stats.map((stat) => (
                    <div key={stat.stat_key} className="sigbar">
                      <span className="sl">{stat.label}</span>
                      <span className="sv">{stat.value}<small>/90</small></span>
                      <span className="st"><i style={{ width: `${Math.max(0, Math.min(100, stat.percentile))}%` }} /></span>
                      <span className="sp">{stat.percentile}<small>pct</small></span>
                    </div>
                  ))}
                </div>
                <p className="sig-note">
                  {isHe
                    ? '↳ ל-90 דקות = קצב · אחוזון = דירוג מול שחקנים באותה עמדה'
                    : '↳ per-90 = output rate · percentile = rank vs players in the same position'}
                </p>
              </>
            ) : (
              <p className="sig-title">{isHe ? 'אין נתוני חתימה זמינים' : 'No signature data available for this player'}</p>
            )}
          </div>
        </div>
        );
      })()}

      {/* Results */}
      {response && response.results.length > 0 && (
        <>
          <p className="brit-wr-count">
            <b>{response.result_count}</b>{' '}
            {isHe
              ? `יורשים סטטיסטיים · ${response.total_candidates_scanned ?? '?'} מועמדים נסרקו`
              : `statistical successors · ${response.total_candidates_scanned ?? '?'} candidates scanned`}
          </p>
          {shortlistError && <div className="brit-wr-error">{shortlistError}</div>}
          <div className="brit-wr-succ">
            {response.results.filter((player) => {
              const url = player.url;
              if (!url) return true;
              if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
              if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
              return true;
            }).map((player) => {
              const pct = Math.round(player.find_next_score);
              const url = player.url;
              const isAdding = addingToShortlistUrl === url;
              const inShortlist = url ? Array.from(shortlistUrls).some((u) => samePlayer(u, url)) : false;
              const stats = deriveStats(player);
              // Score ring arc: circumference for r=26 ≈ 163.4
              const dashOffset = 163.4 * (1 - Math.max(0, Math.min(100, pct)) / 100);
              // One consolidated "fit" pill — the single strongest signal.
              const fit = (() => {
                if (player.value_gap_bonus >= 7) return { label: isHe ? 'פער שווי' : 'Value gap', val: `+${Math.round(player.value_gap_bonus)}` };
                if (player.style_match_bonus >= 10) return { label: isHe ? 'סגנון' : 'Style', val: `+${Math.round(player.style_match_bonus)}` };
                if (player.contract_bonus >= 5) return { label: isHe ? 'חוזה' : 'Contract', val: `+${Math.round(player.contract_bonus)}` };
                if (player.age_bonus >= 5) return { label: isHe ? 'צעיר' : 'Youth', val: `+${Math.round(player.age_bonus)}` };
                return { label: isHe ? 'חתימה' : 'Signature', val: String(Math.round(player.signature_match)) };
              })();
              const clubLine = player.club || player.api_team || player.league || '—';
              const why = cleanWhy(player.scout_narrative || player.explanation, response?.reference_player?.name);
              return (
                <div key={url || player.name} className="brit-wr-card">
                  <div className="card-head">
                    <div className="score">
                      <svg className="ring-bg" viewBox="0 0 58 58">
                        <circle className="t" cx="29" cy="29" r="26" />
                        <circle className="v" cx="29" cy="29" r="26" strokeDasharray="163.4" strokeDashoffset={dashOffset} />
                      </svg>
                      <b>{pct}</b>
                    </div>
                    <div className="ident">
                      {player.playing_style && <div className="eyebrow">{player.playing_style}</div>}
                      <div className="nm">
                        {url ? <a href={url} target="_blank" rel="noopener noreferrer">{player.name || '—'}</a> : (player.name || '—')}
                      </div>
                      <div className="mt">
                        <b>{shortenPosition(player.position)}</b><span className="sep">·</span>
                        {isHe ? 'גיל' : 'Age'} <b>{player.age}</b><span className="sep">·</span>
                        <b>{player.market_value || '—'}</b><span className="sep">·</span>{clubLine}
                      </div>
                    </div>
                    <span className="fit">{fit.label} <b>{fit.val}</b></span>
                  </div>

                  {stats && (
                    <div className="card-stats">
                      <div className="cs">
                        <div className="n">{stats.dribbles}{stats.dribbleSuccessPct != null && <span className="p">·{stats.dribbleSuccessPct}%</span>}</div>
                        <div className="l">{isHe ? 'דריבלים · הצלחה' : 'Dribbles · success'}</div>
                      </div>
                      <div className="cs">
                        <div className="n">{stats.shots}{stats.shotsOnTargetPct != null && <span className="p">·{stats.shotsOnTargetPct}%</span>}</div>
                        <div className="l">{isHe ? 'בעיטות · למסגרת' : 'Shots · on target'}</div>
                      </div>
                      <div className="cs">
                        <div className="n">{stats.goals}<span className="a">G</span> {stats.assists}<span className="a">A</span></div>
                        <div className="l">{isHe ? `תפוקה · ${stats.appearances ?? '—'} משחקים` : `Output · ${stats.appearances ?? '—'} apps`}</div>
                      </div>
                      <div className="cs">
                        <div className="n">{stats.duelsWonPct != null ? <>{stats.duelsWonPct}<span className="p">%</span></> : '—'}</div>
                        <div className="l">{isHe ? 'דו-קרבות' : 'Duels won'}</div>
                      </div>
                    </div>
                  )}

                  <div className="card-foot">
                    {why && (
                      <p className="why" dir={isHe ? 'rtl' : 'ltr'}>
                        <span className="q">{isHe ? 'למה:' : 'Why:'}</span>{why}
                      </p>
                    )}
                    <div className="acts">
                      {url && <a className="brit-wr-btn ghost" href={url} target="_blank" rel="noopener noreferrer">TM →</a>}
                      {url && user && !inShortlist && (
                        <button className="brit-wr-btn gold" onClick={(e) => addToShortlist(player, e)} disabled={!!addingToShortlistUrl}>
                          {isAdding ? (isHe ? 'מוסיף…' : 'Adding…') : `+ ${isHe ? 'מעקב' : 'Shortlist'}`}
                        </button>
                      )}
                      {inShortlist && <span className="brit-wr-btn ghost" style={{ cursor: 'default' }}>✓ {isHe ? 'ברשימת מעקב' : 'In shortlist'}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* No results */}
      {response && response.results.length === 0 && !error && (
        <div className="brit-wr-placeholder">
          {isHe
            ? 'לא נמצאו שחקנים צעירים עם פרופיל מתאים. נסה להגדיל את הגיל או שווי השוק המקסימלי.'
            : 'No young players found matching this profile. Try increasing the age or value cap.'}
        </div>
      )}
    </>
  );
}
