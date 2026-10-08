'use client';

/**
 * Men platform dashboard — "Light Management Room" redesign.
 *
 * A self-contained, full-bleed light-themed layout (paper background, Oswald /
 * Manrope / DM Mono type, gold + red accents) that replaces the standard
 * AppLayout shell FOR THE MEN PLATFORM ONLY. All visual styling lives under the
 * `.brit-room` scope in globals.css so nothing leaks into other pages/platforms.
 *
 * Every panel is wired to the same real Firestore data the previous dashboard
 * used — the parent `DashboardPage` owns the subscriptions and passes the
 * derived data in as props. Buttons/links point to real routes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage, translateType } from '@/contexts/LanguageContext';
import { parseMarketValue, formatMarketValue } from '@/lib/releases';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
import { openWhatsAppWithMessage } from '@/lib/whatsapp';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import { type MatchdaySeed } from '@/components/MatchdayGeneratorModal';
import MatchdayDrawer from '@/components/MatchdayDrawer';
import NotificationPrompt from '@/components/NotificationPrompt';
import GlobalPlayerSearch, { type ShortlistSearchItem } from '@/components/GlobalPlayerSearch';
import { db } from '@/lib/firebase';
import { callPlayersUpdate } from '@/lib/callables';
import {
  BRIT_SPORT_GROUP_AGENCY_URL,
  normalizeAgencyUrl,
  isPlayerOurAsset,
} from '@/lib/transfermarkt-utils';

export { BRIT_SPORT_GROUP_AGENCY_URL, normalizeAgencyUrl, isPlayerOurAsset };

// ── Shared shapes (kept structurally compatible with dashboard/page.tsx) ──
export interface MenFeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  timestamp?: number;
  agentName?: string;
}

export interface MenRosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  currentClub?: { clubName?: string; clubCountry?: string; clubLogo?: string };
  tmProfile?: string;
  positions?: string[];
  marketValue?: string;
  agencyUrl?: string;
  isOurAsset?: boolean;
  haveMandate?: boolean;
  nationality?: string;
  nationalities?: string[];
  dateOfBirth?: string;
  passportDetails?: { dateOfBirth?: string };
  playerPhoneNumber?: string;
  agentInChargeName?: string;
  instagramHandle?: string;
  age?: string;
  notes?: string;
  noteList?: { notes?: string; createBy?: string; createdAt?: number; taggedAgentIds?: string[] }[];
}

export interface MenExpiringMandate extends MenRosterPlayer {
  daysLeft: number;
}

export interface MenClubRequest {
  id: string;
  clubName?: string;
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  euOnly?: boolean;
  createdAt?: number;
  status?: string;
}

interface MenDashboardProps {
  userName: string;
  greeting: string;
  rosterPlayers: MenRosterPlayer[];
  events: MenFeedEvent[];
  requests: MenClubRequest[];
  expiringMandates: MenExpiringMandate[];
}

interface DossierNextMatch {
  date: string;
  time: string | null;
  opponent: string;
  opponentLogo?: string | null;
  venue: string | null;
  homeAway: 'home' | 'away' | null;
  competition: string | null;
  round: string | null;
  sourceUrl: string;
}

interface NextMatchIdentity {
  tmProfile?: string;
  club: string;
  clubCountry?: string;
}

interface CachedNextMatch {
  match: DossierNextMatch | null;
  error: boolean;
}

interface UpcomingFixture {
  kickoffMs: number;
  opponent: string;
  opponentLogo?: string | null;
  homeAway?: 'home' | 'away' | null;
  time: string | null;
  competition: string | null;
  round: string | null;
}

/* ── Next-match store ───────────────────────────────────────────────────────
   Fixtures are fetched once on the first app entry of each Israeli calendar
   day and then served from localStorage for the rest of that day, so the
   dashboard does not re-scrape on every visit. */
const NEXT_MATCH_STORE = 'brit-next-match-store-v2';

/** Flashscore reports kickoff as Asia/Jerusalem wall-clock, so resolve it there
    rather than in the viewer's zone — otherwise the countdown drifts abroad. */
const MATCH_TIME_ZONE = 'Asia/Jerusalem';

interface NextMatchStore {
  day: string;
  entries: Record<string, CachedNextMatch>;
}

let nextMatchCache = new Map<string, CachedNextMatch>();
let nextMatchCacheDay = '';
const nextMatchRequests = new Map<string, Promise<CachedNextMatch>>();

/** Israeli calendar day (YYYY-MM-DD) — matches the zone fixtures are dated in. */
function matchDayStamp(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MATCH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function nextMatchCacheKey(identity: NextMatchIdentity): string {
  return [identity.club, identity.clubCountry || ''].join('|').toLowerCase();
}

function readNextMatchStore(): NextMatchStore {
  const day = matchDayStamp();
  if (typeof window === 'undefined') return { day, entries: {} };
  try {
    const raw = localStorage.getItem(NEXT_MATCH_STORE);
    if (raw) {
      const store = JSON.parse(raw) as NextMatchStore;
      if (store?.day === day && store.entries) return store;
    }
  } catch {
    /* unreadable or foreign shape — fall through to a fresh store */
  }
  return { day, entries: {} };
}

/** Drop the in-memory layer when the day rolls over under a long-lived tab. */
function liveNextMatchCache(): Map<string, CachedNextMatch> {
  const day = matchDayStamp();
  if (nextMatchCacheDay !== day) {
    nextMatchCache = new Map(Object.entries(readNextMatchStore().entries));
    nextMatchCacheDay = day;
  }
  return nextMatchCache;
}

function readCachedNextMatch(key: string): CachedNextMatch | null {
  const cached = liveNextMatchCache().get(key);
  return cached && typeof cached.error === 'boolean' ? cached : null;
}

/** Only resolved fixtures are persisted for the day. A miss or an error stays
    in the in-memory layer, so it is not re-requested during this session but is
    retried on the next app entry instead of being cached until midnight. */
function writeCachedNextMatch(key: string, result: CachedNextMatch): void {
  liveNextMatchCache().set(key, result);
  if (typeof window === 'undefined' || !result.match) return;
  try {
    const store = readNextMatchStore();
    store.entries[key] = result;
    localStorage.setItem(NEXT_MATCH_STORE, JSON.stringify(store));
  } catch {
    /* quota or private-mode write failure — the in-memory layer still serves */
  }
}

function loadNextMatch(identity: NextMatchIdentity): Promise<CachedNextMatch> {
  const key = nextMatchCacheKey(identity);
  const cached = readCachedNextMatch(key);
  if (cached) return Promise.resolve(cached);

  const pending = nextMatchRequests.get(key);
  if (pending) return pending;

  const params = new URLSearchParams();
  if (identity.tmProfile) params.set('url', identity.tmProfile);
  if (identity.club && identity.club !== '—') params.set('club', identity.club);
  if (identity.clubCountry?.trim()) params.set('country', identity.clubCountry);

  const request = fetch(`/api/flashscore/next-match?${params.toString()}`, {
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Next match request failed: ${response.status}`);
      const data = (await response.json()) as { match?: DossierNextMatch | null };
      return { match: data.match ?? null, error: false };
    })
    .catch(() => ({ match: null, error: true }))
    .then((result) => {
      writeCachedNextMatch(key, result);
      nextMatchRequests.delete(key);
      return result;
    });

  nextMatchRequests.set(key, request);
  return request;
}

// (rail navigation now lives in the shared BritRail component)

function positionLabel(positions: string[] | undefined): string {
  const list = (positions ?? []).filter(Boolean);
  return list.length ? list.slice(0, 2).join(' / ') : '—';
}

/** Player surname — the last whitespace-separated token of the full name. */
function lastNameOf(fullName: string | undefined): string {
  const clean = (fullName || '').trim();
  if (!clean) return '—';
  const parts = clean.split(/\s+/);
  return parts[parts.length - 1] || clean;
}

function isUnder19Club(clubName: string | undefined): boolean {
  return /\bU[-\s]?19\b/i.test(clubName || '');
}

function ageRangeLabel(r: MenClubRequest): string {
  if (r.ageDoesntMatter !== false && !r.minAge && !r.maxAge) return '';
  if (r.minAge && r.maxAge) return ` / ${r.minAge}–${r.maxAge}`;
  if (r.minAge) return ` / ${r.minAge}+`;
  if (r.maxAge) return ` / ≤${r.maxAge}`;
  return '';
}

/** Parse dateOfBirth strings in common formats → { month (0-based), day, year }. */
function parseDob(dob: string | undefined): { month: number; day: number; year: number } | null {
  if (!dob) return null;
  const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: +iso[1]!, month: +iso[2]! - 1, day: +iso[3]! };
  const dmy = dob.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return { year: +dmy[3]!, month: +dmy[2]! - 1, day: +dmy[1]! };
  return null;
}

/** Whole days from today until the next occurrence of a birthday (0 = today). */
function daysUntilBirthday(parsed: { month: number; day: number }): number {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), parsed.month, parsed.day);
  if (next < todayMidnight) next = new Date(today.getFullYear() + 1, parsed.month, parsed.day);
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86_400_000);
}

interface BirthdayEntry {
  id: string;
  player: MenRosterPlayer;
  fullName: string;
  club?: string;
  phone?: string;
  agent?: string;
  turnsAge: number;
  daysUntil: number;
  dateLabel: string;
}

const clubDisplay = (p: MenRosterPlayer, t: (k: string) => string) => {
  const c = p.currentClub?.clubName;
  if (!c) return t('no_club');
  if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
  return c;
};

const isFreeAgent = (p: MenRosterPlayer) => {
  const c = p.currentClub?.clubName?.toLowerCase();
  return c === 'without club' || c === 'vereinslos';
};

const latestNote = (p: MenRosterPlayer) => {
  const list = p.noteList?.filter((n) => n.notes?.trim()) ?? [];
  if (list.length) return list[list.length - 1]!.notes!;
  return p.notes?.trim() || '';
};

function computePlayerAge(p: MenRosterPlayer): string {
  if (p.age) return p.age;
  const parsed = parseDob(p.dateOfBirth || p.passportDetails?.dateOfBirth);
  if (!parsed) return '—';
  const today = new Date();
  let age = today.getFullYear() - parsed.year;
  const m = today.getMonth() - parsed.month;
  if (m < 0 || (m === 0 && today.getDate() < parsed.day)) age--;
  return age > 0 ? String(age) : '—';
}

/** Minutes `timeZone` runs ahead of UTC at the given instant. */
function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour') % 24,
    part('minute')
  );
  return (wallAsUtc - utcMs) / 60_000;
}

/** Whole days since the epoch on the Israeli calendar — used for today/tomorrow. */
function matchZoneDayIndex(utcMs: number): number {
  return Math.floor((utcMs + zoneOffsetMinutes(utcMs, MATCH_TIME_ZONE) * 60_000) / 86_400_000);
}

function parseKickoffMs(dateStr: string, timeStr: string | null | undefined): number | null {
  const dm = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!dm) return null;

  // Kickoff time is occasionally still TBC; midday keeps the day bucket right.
  let hours = 12;
  let minutes = 0;
  const tm = timeStr?.match(/(\d{1,2}):(\d{2})/);
  if (tm) {
    hours = Number(tm[1]);
    minutes = Number(tm[2]);
  }

  const wallAsUtc = Date.UTC(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]), hours, minutes);
  return wallAsUtc - zoneOffsetMinutes(wallAsUtc, MATCH_TIME_ZONE) * 60_000;
}

function buildUpcomingFixture(match: DossierNextMatch): UpcomingFixture | null {
  const kickoffMs = parseKickoffMs(match.date, match.time);
  if (kickoffMs === null) return null;
  const hoursUntil = (kickoffMs - Date.now()) / 3_600_000;
  // Matchweek window: keep anything from ~2h ago (a match in progress) out to
  // 8 days ahead, so the timeline rail can show the whole week of fixtures.
  if (hoursUntil > 24 * 8 || hoursUntil < -2) return null;
  return {
    kickoffMs,
    opponent: match.opponent,
    opponentLogo: match.opponentLogo ?? null,
    homeAway: match.homeAway,
    time: match.time,
    competition: match.competition ?? null,
    round: match.round ?? null,
  };
}

/** Live countdown to kickoff. `urgent` drives the red treatment (< 6 h or live). */
function formatCountdown(kickoffMs: number): { text: string; urgent: boolean } {
  const ms = kickoffMs - Date.now();
  if (ms <= 0) return { text: 'Kicked off', urgent: true };
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const text = h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
  return { text, urgent: h < 6 };
}

/**
 * Competition line for a fixture, e.g. "Liga Leumit · Round 8". Friendlies show
 * just the competition (no round). Any "Country: Competition" prefix from the
 * fixture source is stripped so only the competition name remains.
 */
function competitionLabel(competition: string | null, round: string | null): string | null {
  const raw = (competition || '').trim();
  if (!raw) return null;
  const comp = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw;
  const isFriendly = /friendl/i.test(comp);
  const r = (round || '').trim();
  if (isFriendly || !r) return comp;
  const roundLabel = /^\d+$/.test(r) ? `Round ${r}` : r;
  return `${comp} · ${roundLabel}`;
}

/** Compact countdown for the timeline dots: "48M", "3H", "2D". */
function compactCountdown(kickoffMs: number): string {
  const ms = kickoffMs - Date.now();
  if (ms <= 0) return 'LIVE';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  if (h < 1) return `${totalMin}M`;
  if (h < 24) return `${h}H`;
  return `${Math.floor(h / 24)}D`;
}

/**
 * Colour for a compact countdown label. It is a pure function of the LABEL, so
 * two fixtures showing the same value (e.g. two "1D") always get the identical
 * colour, while different values get different ones. Palette runs warm→cool as
 * the match gets further away, staying within the dark/gold brit look.
 */
const COUNTDOWN_DAY_PALETTE = [
  '#e7c079', // today / <24h  — bright gold
  '#d98a4e', // 1D — amber
  '#c96f6f', // 2D — clay rose
  '#9c8bc0', // 3D — muted violet
  '#6f9bb8', // 4D — steel blue
  '#5f9e86', // 5D — sage
  '#8a8f9c', // 6D+ — slate
];
function countdownAccent(short: string): string {
  if (short === 'LIVE') return '#b64235';
  // Minutes or hours → treat as "today" bucket (bright gold).
  if (short.endsWith('M') || short.endsWith('H')) return COUNTDOWN_DAY_PALETTE[0];
  const days = parseInt(short, 10);
  if (!Number.isFinite(days)) return COUNTDOWN_DAY_PALETTE[0];
  return COUNTDOWN_DAY_PALETTE[Math.min(days, COUNTDOWN_DAY_PALETTE.length - 1)];
}

/** Absolute kickoff, so the countdown is never the only reference: "Tomorrow 19:00". */
function kickoffLabel(fixture: UpcomingFixture, locale: string): string {
  const dayOffset = matchZoneDayIndex(fixture.kickoffMs) - matchZoneDayIndex(Date.now());
  const day =
    dayOffset === 0
      ? 'Today'
      : dayOffset === 1
      ? 'Tomorrow'
      : new Date(fixture.kickoffMs).toLocaleDateString(locale, {
          weekday: 'short',
          timeZone: MATCH_TIME_ZONE,
        });
  return fixture.time ? `${day} ${fixture.time}` : day;
}

export default function MenDashboard({
  userName,
  greeting,
  rosterPlayers,
  events,
  requests,
  expiringMandates,
}: MenDashboardProps) {
  const { t, lang, setLang, isRtl } = useLanguage();
  const euCountries = useEuCountries();
  const router = useRouter();

  const [dossier, setDossier] = useState<{
    name: string;
    club: string;
    clubCountry?: string;
    value: string;
    position: string;
    playerId?: string;
    tmProfile?: string;
    agencyUrl?: string;
    isOurAsset?: boolean;
    profileImage?: string;
    clubLogo?: string;
    instagramHandle?: string;
  } | null>(null);
  const [matchdaySeed, setMatchdaySeed] = useState<MatchdaySeed | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortlistItems, setShortlistItems] = useState<ShortlistSearchItem[]>([]);
  const [nextMatch, setNextMatch] = useState<DossierNextMatch | null>(null);
  const [nextMatchState, setNextMatchState] = useState<'idle' | 'loading' | 'ready' | 'unavailable' | 'error'>('idle');
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState(0);
  const [assetToggling, setAssetToggling] = useState(false);
  const [drawer, setDrawer] = useState<MenRosterPlayer | null>(null);
  const [nextMatchVersion, setNextMatchVersion] = useState(0);
  const [countdownTick, setCountdownTick] = useState(0);
  const [fixturesReady, setFixturesReady] = useState(false);
  const isUnder19Dossier = isUnder19Club(dossier?.club);

  const goToPlayer = (id: string) => router.push(`/players/${id}?from=/dashboard`);

  const messageOnWhatsApp = (p: MenRosterPlayer) => {
    if (!p.playerPhoneNumber) return;
    openWhatsAppWithMessage(p.playerPhoneNumber, `${p.fullName || ''}`.trim());
  };

  // Load shortlist entries for global search — subscribe once, the first time
  // the search is opened, so the dashboard doesn't pay for it up front. A ref
  // guard (not a state dep) ensures the effect isn't torn down/re-run when the
  // "opened" flag flips, which would cancel the async subscription mid-flight.
  const shortlistUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    // Subscribe once, the first time search opens. Persist for the session so
    // reopening is instant; clean up only on unmount (separate effect below).
    if (!searchOpen || shortlistUnsubRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const { collection, onSnapshot } = await import('firebase/firestore');
        if (cancelled) return;
        shortlistUnsubRef.current = onSnapshot(collection(db, 'Shortlists'), (snap) => {
          const seen = new Set<string>();
          const items: ShortlistSearchItem[] = [];
          snap.docs.forEach((d) => {
            const e = d.data() as Record<string, unknown>;
            const url = (e.tmProfileUrl as string) || '';
            if (!url || seen.has(url)) return;
            seen.add(url);
            const club = e.currentClub && typeof e.currentClub === 'object'
              ? (e.currentClub as { clubName?: string }).clubName
              : undefined;
            items.push({
              tmProfileUrl: url,
              playerName: (e.playerName as string) || (e.fullName as string) || undefined,
              playerImage: (e.playerImage as string) || undefined,
              clubName: (e.clubJoinedName as string) || club || undefined,
              positions: Array.isArray(e.positions)
                ? (e.positions as string[])
                : e.playerPosition
                  ? [e.playerPosition as string]
                  : undefined,
            });
          });
          setShortlistItems(items);
        });
      } catch (err) {
        console.error('[dashboard] shortlist search load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchOpen]);
  // Tear the shortlist listener down when the dashboard unmounts.
  useEffect(() => () => shortlistUnsubRef.current?.(), []);

  const handleToggleOurAsset = async (targetPlayerId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;

    setDossier((prev) => (prev && prev.playerId === targetPlayerId ? { ...prev, isOurAsset: nextStatus } : prev));
    setDrawer((prev) => (prev && prev.id === targetPlayerId ? { ...prev, isOurAsset: nextStatus } : prev));

    setAssetToggling(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'Players', targetPlayerId), { isOurAsset: nextStatus });
      await callPlayersUpdate({ platform: 'men', playerId: targetPlayerId, isOurAsset: nextStatus }).catch(() => {});
    } catch (err) {
      console.error('Failed to toggle asset status:', err);
      setDossier((prev) => (prev && prev.playerId === targetPlayerId ? { ...prev, isOurAsset: currentStatus } : prev));
      setDrawer((prev) => (prev && prev.id === targetPlayerId ? { ...prev, isOurAsset: currentStatus } : prev));
    } finally {
      setAssetToggling(false);
    }
  };

  const assetPlayers = useMemo(
    () => rosterPlayers.filter((player) => isPlayerOurAsset(player)),
    [rosterPlayers]
  );

  /** Asset players whose club can actually be looked up, with their cache key. */
  const fixtureTargets = useMemo(
    () =>
      assetPlayers
        .map((player) => ({
          player,
          identity: {
            tmProfile: player.tmProfile,
            club: player.currentClub?.clubName || '—',
            clubCountry: player.currentClub?.clubCountry,
          } satisfies NextMatchIdentity,
        }))
        .filter(
          ({ identity }) =>
            !isUnder19Club(identity.club) && (Boolean(identity.tmProfile) || identity.club !== '—')
        ),
    [assetPlayers]
  );

  // Fetch the day's fixtures on first entry; subsequent visits read the store
  // and skip straight to ready so the shimmer never flashes needlessly.
  useEffect(() => {
    if (fixtureTargets.length === 0) {
      setFixturesReady(true);
      return;
    }
    if (fixtureTargets.every(({ identity }) => readCachedNextMatch(nextMatchCacheKey(identity)))) {
      setFixturesReady(true);
      return;
    }

    let active = true;
    setFixturesReady(false);
    void Promise.all(fixtureTargets.map(({ identity }) => loadNextMatch(identity))).then(() => {
      if (!active) return;
      setNextMatchVersion((n) => n + 1);
      setFixturesReady(true);
    });
    return () => {
      active = false;
    };
  }, [fixtureTargets]);

  const playerFixtures = useMemo(() => {
    const fixtures = new Map<string, UpcomingFixture>();
    for (const { player, identity } of fixtureTargets) {
      const cached = readCachedNextMatch(nextMatchCacheKey(identity));
      if (cached?.match) {
        const fixture = buildUpcomingFixture(cached.match);
        if (fixture) fixtures.set(player.id, fixture);
      }
    }
    return fixtures;
  }, [fixtureTargets, nextMatchVersion]);

  const marquee = useMemo(
    // The matchweek rail now surfaces upcoming fixtures, so the asset list no
    // longer prioritises players by their closest game — just sort by value.
    () =>
      [...assetPlayers].sort(
        (a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue)
      ),
    [assetPlayers]
  );

  // Live countdown ticker — recomputes the plaque clocks every 30s
  useEffect(() => {
    if (playerFixtures.size === 0) return;
    const id = setInterval(() => setCountdownTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [playerFixtures.size]);

  /* ── Matchweek timeline rail ──────────────────────────────────────────────
     Every asset with an upcoming fixture, laid out on one horizontal timeline
     ordered by kickoff. The soonest is the glowing "next" stop. */
  const matchweek = useMemo(() => {
    const locale = isRtl ? 'he-IL' : 'en-GB';
    const stops = marquee
      .map((p) => {
        const fixture = playerFixtures.get(p.id);
        if (!fixture) return null;
        return {
          id: p.id,
          player: p,
          lastName: lastNameOf(p.fullName),
          opponent: fixture.opponent,
          opponentLogo: fixture.opponentLogo ?? null,
          homeAway: fixture.homeAway,
          kickoffMs: fixture.kickoffMs,
          short: compactCountdown(fixture.kickoffMs),
          when: kickoffLabel(fixture, locale),
          countdown: formatCountdown(fixture.kickoffMs),
          competitionLabel: competitionLabel(fixture.competition, fixture.round),
          // Colour is keyed to the compact label, so fixtures with the same
          // countdown (e.g. two "1D") share exactly one colour.
          accent: countdownAccent(compactCountdown(fixture.kickoffMs)),
        };
      })
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => a.kickoffMs - b.kickoffMs);
    return stops;
    // countdownTick keeps the short/countdown labels live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marquee, playerFixtures, countdownTick, isRtl]);

  useEffect(() => {
    if (!dossier) {
      setNextMatch(null);
      setNextMatchState('idle');
      return;
    }
    if (isUnder19Dossier) {
      setNextMatch(null);
      setNextMatchState('idle');
      return;
    }
    if (!dossier.tmProfile && (!dossier.club || dossier.club === '—')) {
      setNextMatch(null);
      setNextMatchState('unavailable');
      return;
    }

    const identity: NextMatchIdentity = {
      tmProfile: dossier.tmProfile,
      club: dossier.club,
      clubCountry: dossier.clubCountry,
    };
    const cached = readCachedNextMatch(nextMatchCacheKey(identity));
    if (cached) {
      setNextMatch(cached.match);
      setNextMatchState(cached.error ? 'error' : cached.match ? 'ready' : 'unavailable');
      return;
    }

    setNextMatch(null);
    setNextMatchState('loading');
    let active = true;
    void loadNextMatch(identity).then((result) => {
      if (!active) return;
      setNextMatch(result.match);
      setNextMatchState(result.error ? 'error' : result.match ? 'ready' : 'unavailable');
    });

    return () => {
      active = false;
    };
  }, [dossier, isUnder19Dossier]);

  // ── Derived signals ──
  const valuedPlayers = useMemo(
    () => rosterPlayers.filter((p) => parseMarketValue(p.marketValue) > 0),
    [rosterPlayers]
  );

  const totalPortfolioValue = useMemo(
    () => rosterPlayers.reduce((sum, p) => sum + parseMarketValue(p.marketValue), 0),
    [rosterPlayers]
  );

  const euCount = useMemo(() => {
    if (euCountries.size === 0) return 0;
    return rosterPlayers.filter((p) =>
      isEuNational(p.nationality, euCountries, p.nationalities)
    ).length;
  }, [rosterPlayers, euCountries]);

  // Upcoming player birthdays (today + next 30 days), soonest first.
  const birthdays = useMemo<BirthdayEntry[]>(() => {
    const list: BirthdayEntry[] = [];
    for (const p of rosterPlayers) {
      const parsed = parseDob(p.dateOfBirth || p.passportDetails?.dateOfBirth);
      if (!parsed) continue;
      const daysUntil = daysUntilBirthday(parsed);
      if (daysUntil > 30) continue;
      // Year of the next birthday occurrence → age they will turn.
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const thisYearBday = new Date(todayMidnight.getFullYear(), parsed.month, parsed.day);
      const nextBdayYear =
        thisYearBday < todayMidnight ? todayMidnight.getFullYear() + 1 : todayMidnight.getFullYear();
      list.push({
        id: p.id,
        player: p,
        fullName: p.fullName || '—',
        club: p.currentClub?.clubName,
        phone: p.playerPhoneNumber,
        agent: p.agentInChargeName?.trim() || undefined,
        turnsAge: nextBdayYear - parsed.year,
        daysUntil,
        dateLabel: new Date(todayMidnight.getFullYear(), parsed.month, parsed.day).toLocaleDateString(
          isRtl ? 'he-IL' : 'en-US',
          { month: 'short', day: 'numeric' }
        ),
      });
    }
    const sorted = list.sort((a, b) => a.daysUntil - b.daysUntil);
    // Cap the list at 5 in general. The only exception: if MORE than 5 players
    // have a birthday today, show all of today's (and nothing else) so none of
    // them are hidden. Otherwise, take the soonest 5 (today + upcoming).
    const today = sorted.filter((b) => b.daysUntil === 0);
    return today.length > 5 ? today : sorted.slice(0, 5);
  }, [rosterPlayers, isRtl]);

  const topRoster = useMemo(
    () =>
      [...rosterPlayers]
        .sort((a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue))
        .slice(0, 6),
    [rosterPlayers]
  );

  const marqueeLastStart = Math.max(marquee.length - 2, 0);
  const marqueeSlideIndex = Math.min(marqueeStart, marqueeLastStart);

  const openRequests = useMemo(
    () =>
      [...requests]
        .filter((r) => (r.status ?? 'open').toLowerCase() !== 'closed')
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 4),
    [requests]
  );

  const recentActivity = useMemo(
    () => (showAllActivity ? events : events.slice(0, 4)),
    [events, showAllActivity]
  );

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const initials = (userName || 'BR')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const withToken = (key: string, value: string | number) =>
    t(key).replace('{n}', String(value));

  // Resolve a feed event to a player route (falls back to external TM profile).
  const feedLink = (ev: MenFeedEvent): { href: string; external: boolean } | null => {
    if (ev.playerTmProfile) {
      const tmId = extractPlayerIdFromUrl(ev.playerTmProfile);
      const rosterPlayer = tmId
        ? rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === tmId)
        : undefined;
      if (rosterPlayer) {
        return { href: `/players/${rosterPlayer.id}?from=/dashboard`, external: false };
      }
      return { href: ev.playerTmProfile, external: true };
    }
    return null;
  };

  const rosterPlayerValue = (p: MenRosterPlayer) => p.marketValue || '—';

  const sendBirthdayWish = (b: BirthdayEntry) => {
    if (!b.phone) return;
    const first = b.fullName.split(' ')[0] || b.fullName;
    const msg = `Happy Birthday ${first}!\nWishing you a wonderful year ahead, full of success on and off the pitch!\n${userName}`;
    openWhatsAppWithMessage(b.phone, msg);
  };

  const openDossier = (p: MenRosterPlayer) =>
    setDossier({
      name: p.fullName || '—',
      club: p.currentClub?.clubName || '—',
      clubCountry: p.currentClub?.clubCountry,
      value: rosterPlayerValue(p),
      position: positionLabel(p.positions),
      playerId: p.id,
      tmProfile: p.tmProfile,
      agencyUrl: p.agencyUrl,
      isOurAsset: p.isOurAsset,
      profileImage: p.profileImage,
      clubLogo: p.currentClub?.clubLogo,
      instagramHandle: p.instagramHandle,
    });

  const formatMatchDate = (value: string) => {
    const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return value;
    return new Intl.DateTimeFormat(isRtl ? 'he-IL' : 'en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))));
  };

  // Countdown to the dossier's next fixture (days/hrs/min), live via countdownTick.
  const dossierCountdown = useMemo(() => {
    if (!nextMatch) return null;
    const kickoffMs = parseKickoffMs(nextMatch.date, nextMatch.time);
    if (kickoffMs == null) return null;
    const diff = kickoffMs - Date.now();
    if (diff <= 0) return null;
    const totalMin = Math.floor(diff / 60_000);
    return {
      days: Math.floor(totalMin / 1440),
      hrs: Math.floor((totalMin % 1440) / 60),
      min: totalMin % 60,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextMatch, countdownTick]);

  // Crest initials fallback when a club logo is missing.
  const crestInitials = (name?: string | null) =>
    (name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 3).join('').toUpperCase();

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        {/* ── Rail ── */}
        <BritRail active="dashboard" />

        {/* ── Main ── */}
        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_dashboard')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
                {lang === 'en' ? 'HE / EN' : 'EN / HE'}
              </button>
              <button onClick={() => setSearchOpen(true)}>{t('room_search')}</button>
              <span>TLV {timeStr}</span>
              <span className="brit-avatar">{initials}</span>
            </div>
          </header>

          <main className="brit-canvas">
            {/* ── Masthead ── */}
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('room_kicker')}</p>
                <h1>
                  {greeting.replace(/,\s*$/, '')}
                  <br />
                  <span>{userName}.</span>
                </h1>
              </div>
            </header>

            {/* ── Signals ── */}
            <section className="brit-signals" aria-label={t('room_signals')}>
              <div className="brit-signal">
                <label>{t('room_signal_portfolio')}</label>
                <strong>{formatMarketValue(totalPortfolioValue)}</strong>
                <small>{withToken('room_signal_portfolio_note', valuedPlayers.length)}</small>
              </div>
              <div className="brit-signal">
                <label>{t('room_signal_roster')}</label>
                <strong>{String(rosterPlayers.length).padStart(2, '0')}</strong>
                <small>{withToken('room_signal_roster_note', euCount)}</small>
              </div>
              <div className="brit-signal">
                <label>{t('room_signal_mandates')}</label>
                <strong className={expiringMandates.length > 0 ? 'brit-red' : ''}>
                  {String(expiringMandates.length).padStart(2, '0')}
                </strong>
                <small>
                  {expiringMandates.length > 0
                    ? t('room_signal_mandates_note_action')
                    : t('room_signal_mandates_note_clear')}
                </small>
              </div>
            </section>

            <div className="brit-grid">
              {/* ── Left column ── */}
              <div>
                {/* Player birthdays */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_birthdays')}</h2>
                    <span>{withToken('room_birthdays_count', birthdays.length)}</span>
                  </div>
                  {birthdays.length > 0 ? (
                    birthdays.map((b) => {
                      const isToday = b.daysUntil === 0;
                      return (
                        <div
                          className="brit-deadline"
                          key={b.id}
                          onClick={() => setDrawer(b.player)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="brit-code">{isToday ? t('room_birthdays_today_code') : b.dateLabel}</div>
                          <div>
                            <h3>{b.fullName}</h3>
                            <p>
                              {(b.club || '—')} / {withToken('room_birthdays_turns', b.turnsAge)}
                            </p>
                            {b.agent && (
                              <p className="brit-birthday-agent">
                                {t('room_birthdays_agent')} <em>{b.agent}</em>
                              </p>
                            )}
                          </div>
                          <div className="brit-birthday-action" onClick={(e) => e.stopPropagation()}>
                            {isToday && b.phone && (
                              <button
                                type="button"
                                className="brit-birthday-btn"
                                onClick={() => sendBirthdayWish(b)}
                                aria-label={t('room_birthdays_wish')}
                              >
                                {t('room_birthdays_wish')}
                              </button>
                            )}
                            {isToday && !b.phone && (
                              <span className="brit-birthday-nonum" aria-label={t('room_birthdays_no_number')}>
                                <span className="brit-birthday-nonum-bar" aria-hidden />
                                <span className="brit-birthday-nonum-txt">
                                  <b>{t('room_birthdays_no_number')}</b>
                                  <span>{t('room_birthdays_no_number_sub')}</span>
                                </span>
                              </span>
                            )}
                            <time className={isToday ? 'brit-red' : ''}>
                              {isToday
                                ? t('room_birthdays_today')
                                : withToken('room_window_days', b.daysUntil)}
                            </time>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="brit-empty">{t('room_birthdays_empty')}</div>
                  )}
                </section>

                {/* Pending decisions (mandates expiring soonest) */}
                <section className="brit-module brit-black-module">
                  <div className="brit-module-head">
                    <h2>{t('room_pending')}</h2>
                    <span>
                      {withToken('room_pending_count', Math.min(expiringMandates.length, 2))}
                    </span>
                  </div>
                  {expiringMandates.length > 0 ? (
                    expiringMandates.slice(0, 2).map((p) => (
                      <div className="brit-approval" key={p.id}>
                        {p.profileImage ? (
                          <img src={p.profileImage} alt={p.fullName || ''} />
                        ) : (
                          <div className="brit-avatar-box">
                            {(p.fullName || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3>{p.fullName || '—'}</h3>
                          <p>
                            {positionLabel(p.positions)} / {rosterPlayerValue(p)}
                            <br />
                            {p.currentClub?.clubName || '—'} /{' '}
                            {p.daysLeft === 0
                              ? t('room_expires_today')
                              : withToken('room_expires_in', p.daysLeft)}
                          </p>
                        </div>
                        <Link className="brit-approve-btn" href={`/players/${p.id}?from=/dashboard`}>
                          {t('room_authorise')}
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div className="brit-empty" style={{ color: '#aaa69c' }}>
                      {t('room_pending_empty')}
                    </div>
                  )}
                </section>

                {/* Mandate watch */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_mandate_watch')}</h2>
                    <span>{t('room_mandate_watch_sub')}</span>
                  </div>
                  {expiringMandates.length > 0 ? (
                    <div className="brit-mandates">
                      {expiringMandates.slice(0, 3).map((p) => (
                        <article className="brit-mandate" key={p.id}>
                          <strong>{p.fullName || '—'}</strong>
                          <span>
                            {p.daysLeft === 0
                              ? t('room_expires_today')
                              : withToken('room_expires_in', p.daysLeft)}
                          </span>
                          <p>
                            {p.currentClub?.clubName || '—'} / {positionLabel(p.positions)} /{' '}
                            {rosterPlayerValue(p)}
                          </p>
                          <Link className="brit-mandate-link" href={`/players/${p.id}?from=/dashboard`}>
                            {t('room_initiate_renewal')}
                          </Link>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="brit-empty">{t('room_pending_empty')}</div>
                  )}
                </section>

                {/* Recent activity — moved to primary (left) column */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_recent_activity')}</h2>
                    <span>
                      {withToken(
                        'room_activity_showing',
                        recentActivity.length
                      ).replace('{total}', String(events.length))}
                    </span>
                  </div>
                  {recentActivity.length > 0 ? (
                    recentActivity.map((ev) => {
                      const link = feedLink(ev);
                      const body = (
                        <>
                          {ev.playerImage ? (
                            <img
                              className="brit-feed-thumb"
                              src={ev.playerImage}
                              alt={ev.playerName || ''}
                            />
                          ) : (
                            <div className="brit-feed-thumb brit-feed-thumb-fallback">
                              {(ev.playerName || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <p>
                            {translateType(ev.type || '', t, 'men')}
                            {ev.playerName ? <strong>{ev.playerName}</strong> : null}
                          </p>
                          <span>
                            <time className="brit-feed-time">
                              {ev.timestamp ? (
                                <>
                                  <span className="brit-feed-date">
                                    {new Date(ev.timestamp).toLocaleDateString(
                                      isRtl ? 'he-IL' : 'en-US',
                                      { day: '2-digit', month: 'short' }
                                    )}
                                  </span>
                                  <span className="brit-feed-hour">
                                    {new Date(ev.timestamp).toLocaleTimeString(
                                      isRtl ? 'he-IL' : 'en-US',
                                      { hour: '2-digit', minute: '2-digit' }
                                    )}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </time>
                          </span>
                        </>
                      );
                      return link ? (
                        link.external ? (
                          <a
                            key={ev.id}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="brit-feed-row brit-feed-activity"
                          >
                            {body}
                          </a>
                        ) : (
                          <Link
                            key={ev.id}
                            href={link.href}
                            className="brit-feed-row brit-feed-activity"
                          >
                            {body}
                          </Link>
                        )
                      ) : (
                        <div key={ev.id} className="brit-feed-row brit-feed-activity">
                          {body}
                        </div>
                      );
                    })
                  ) : (
                    <div className="brit-empty">{t('room_activity_empty')}</div>
                  )}
                  {events.length > 4 && (
                    <button
                      className="brit-reveal"
                      onClick={() => setShowAllActivity((v) => !v)}
                      aria-expanded={showAllActivity}
                    >
                      <span className="brit-reveal-line" aria-hidden />
                      <span className="brit-reveal-label">
                        {showAllActivity
                          ? t('room_activity_collapse')
                          : withToken('room_activity_reveal', events.length)}
                        <em className={`brit-reveal-caret${showAllActivity ? ' up' : ''}`} aria-hidden>
                          ↓
                        </em>
                      </span>
                      <span className="brit-reveal-line" aria-hidden />
                    </button>
                  )}
                </section>
              </div>

              {/* ── Right column ── */}
              <aside>
                {/* Marquee assets */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>
                      <span className="brit-heading-black">{t('room_our')}</span>{' '}
                      <span className="brit-heading-gold">{t('room_assets')}</span>
                    </h2>
                    <div className="brit-focus-controls">
                      {fixturesReady && marqueeSlideIndex > 0 && (
                        <button
                          type="button"
                          className="brit-focus-arrow brit-focus-arrow-previous"
                          onClick={() =>
                            setMarqueeStart((current) =>
                              Math.max(current - (current === marqueeLastStart && marqueeLastStart % 2 === 1 ? 1 : 2), 0)
                            )
                          }
                          aria-label={t('room_assets_previous')}
                          title={t('room_assets_previous')}
                        >
                          ←
                        </button>
                      )}
                      <span>
                        {fixturesReady
                          ? withToken('room_marquee_sub', marquee.length)
                          : t('room_marquee_syncing')}
                      </span>
                      {fixturesReady && marqueeSlideIndex < marqueeLastStart && (
                        <button
                          type="button"
                          className="brit-focus-arrow"
                          onClick={() =>
                            setMarqueeStart((current) =>
                              Math.min(current + 2, marqueeLastStart)
                            )
                          }
                          aria-label={t('room_assets_next')}
                          title={t('room_assets_next')}
                        >
                          →
                        </button>
                      )}
                    </div>
                  </div>
                  {!fixturesReady && assetPlayers.length > 0 ? (
                    <div className="brit-focus" aria-busy="true">
                      {[0, 1].map((slot) => (
                        <article className="brit-focus-skeleton" key={`asset-skeleton-${slot}`} aria-hidden>
                          <span className="brit-skeleton-plaque" />
                          <span className="brit-skeleton-copy">
                            <span className="brit-skeleton-line xs" />
                            <span className="brit-skeleton-line lg" />
                            <span className="brit-skeleton-line sm" />
                          </span>
                        </article>
                      ))}
                    </div>
                  ) : marquee.length > 0 ? (
                    <div className="brit-focus-carousel">
                      <div
                        className="brit-focus-track"
                        style={{
                          width: `${Math.max(marquee.length - 1, 1) * 100}%`,
                          transform: `translateX(-${marqueeSlideIndex * (100 / Math.max(marquee.length - 1, 1))}%)`,
                        }}
                      >
                        {Array.from({ length: Math.max(marquee.length - 1, 1) }, (_, slideIndex) => (
                          <div
                            className="brit-focus-slide"
                            key={`marquee-slide-${slideIndex}`}
                            style={{ flexBasis: `${100 / Math.max(marquee.length - 1, 1)}%` }}
                          >
                            <div className="brit-focus">
                              {[marquee[slideIndex], marquee[slideIndex + 1]]
                                .filter((player): player is MenRosterPlayer => Boolean(player))
                                .map((p) => {
                                  return (
                                    <article key={p.id} onClick={() => openDossier(p)}>
                                      {p.profileImage ? (
                                        <img src={p.profileImage} alt={p.fullName || ''} />
                                      ) : (
                                        <div className="brit-focus-fallback" />
                                      )}
                                      <div className="brit-focus-copy">
                                        <small>
                                          {(p.currentClub?.clubName || '—')} / {positionLabel(p.positions)}
                                        </small>
                                        <h3>{p.fullName || '—'}</h3>
                                        <p>{rosterPlayerValue(p)}</p>
                                      </div>
                                    </article>
                                  );
                                })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="brit-empty">{t('room_marquee_empty')}</div>
                  )}

                  {/* ── Matchweek timeline rail (below the asset cards) ── */}
                  {fixturesReady && matchweek.length > 0 && (
                    <div className="brit-matchweek" aria-label={t('room_matchweek')}>
                      <div className="brit-matchweek-head">
                        <span className="brit-matchweek-title">{t('room_matchweek')}</span>
                        <span className="brit-matchweek-count">
                          {withToken('room_matchweek_count', matchweek.length)}
                        </span>
                      </div>
                      <div className="brit-matchweek-rail">
                        <div className="brit-matchweek-line" />
                        <div
                          className="brit-matchweek-line-fill"
                          style={{ width: matchweek.length > 1 ? `${(1 / matchweek.length) * 100}%` : '18%' }}
                        />
                        <div className={`brit-matchweek-stops${matchweek.length > 5 ? ' is-scrollable' : ''}`}>
                          {matchweek.map((s, i) => (
                            <button
                              type="button"
                              key={s.id}
                              className={`brit-matchweek-stop${i === 0 ? ' next' : ''}${
                                s.countdown.urgent ? ' urgent' : ''
                              }`}
                              style={{ ['--mw-accent' as string]: s.accent }}
                              onClick={() => openDossier(s.player)}
                              title={`${s.lastName} ${s.homeAway === 'away' ? '@' : 'vs'} ${s.opponent} — ${s.when}`}
                            >
                              <span className="brit-matchweek-crest">
                                {s.opponentLogo ? (
                                  <img
                                    src={s.opponentLogo}
                                    alt={s.opponent}
                                    loading="lazy"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <span className="brit-matchweek-crest-fallback">
                                    {s.opponent.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                                <span className="brit-matchweek-ha">
                                  {s.homeAway === 'away' ? 'A' : 'H'}
                                </span>
                              </span>
                              <span className="brit-matchweek-who">{s.lastName}</span>
                              <span className="brit-matchweek-opp">
                                {(s.homeAway === 'away' ? '@ ' : 'vs ') + s.opponent}
                              </span>
                              {s.competitionLabel && (
                                <span className="brit-matchweek-comp">{s.competitionLabel}</span>
                              )}
                              <span className="brit-matchweek-cd">{s.short}</span>
                              <span className="brit-matchweek-when">{s.when}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* Club requests */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_club_requests')}</h2>
                    <span>{withToken('room_requests_live', requests.length)}</span>
                  </div>
                  {openRequests.length > 0 ? (
                    openRequests.map((r) => (
                      <Link
                        key={r.id}
                        href="/requests"
                        className="brit-feed-row"
                        style={{ cursor: 'pointer' }}
                      >
                        <time>
                          {r.createdAt
                            ? new Date(r.createdAt).toLocaleDateString(
                                isRtl ? 'he-IL' : 'en-US',
                                { day: '2-digit', month: 'short' }
                              )
                            : '—'}
                        </time>
                        <p>
                          {r.clubName || '—'}
                          <strong>
                            {(r.position || '—') + ageRangeLabel(r)}
                            {r.euOnly ? ' / EU' : ''}
                          </strong>
                        </p>
                        <span>
                          {(r.status ?? 'open').toLowerCase() === 'new'
                            ? t('room_status_new')
                            : t('room_status_open')}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="brit-empty">{t('room_requests_empty')}</div>
                  )}
                  <Link href="/requests" className="brit-new-request" style={{ display: 'block' }}>
                    {t('room_new_request')}
                  </Link>
                </section>

                {/* Roster intelligence — moved to secondary (right) column */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_roster_intel')}</h2>
                    <Link href="/players">{withToken('room_view_all', rosterPlayers.length)}</Link>
                  </div>
                  <div className="brit-table-wrap">
                    <table className="brit-roster">
                      <thead>
                        <tr>
                          <th>{t('room_th_player')}</th>
                          <th>{t('room_th_club')}</th>
                          <th>{t('room_th_position')}</th>
                          <th>{t('room_th_value')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topRoster.map((p) => (
                          <tr key={p.id}>
                            <td>{p.fullName || '—'}</td>
                            <td>{p.currentClub?.clubName || '—'}</td>
                            <td>{positionLabel(p.positions)}</td>
                            <td>{rosterPlayerValue(p)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>

      {/* ── Dossier modal ── */}
      <div
        className={`brit-backdrop${dossier ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('room_confidential_dossier')}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDossier(null);
        }}
      >
        {dossier && (
          <div className="brit-modal brit-asset-modal">
            <button className="brit-close" onClick={() => setDossier(null)} aria-label={t('room_close')}>
              ×
            </button>

            {/* ── Hero ── */}
            {/* ── Hero — diagonal split: player photo | club crest ── */}
            <section className="bam-hero">
              <div className="bam-shot">
                {dossier.profileImage ? (
                  <img src={dossier.profileImage} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                ) : null}
              </div>
              <span className="bam-slant" aria-hidden />
              <div className="bam-clubside">
                <div className="bam-stadium" aria-hidden />
                <div className="bam-crestwrap">
                  <div className="crest">
                    {dossier.clubLogo ? (
                      <img src={dossier.clubLogo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                    ) : (
                      <span className="ph">{crestInitials(dossier.club)}</span>
                    )}
                  </div>
                </div>
                <span className="clubname">{dossier.club}</span>
              </div>
              <div className="bam-valtab">
                <div className="v">{dossier.value}</div>
                <div className="l">{t('room_market_value')}</div>
              </div>
              <div className="bam-hero-inner">
                <p className="bam-eyebrow">{dossier.club}</p>
                <h2>{dossier.name}</h2>
                <div className="bam-tags">
                  <span className="tag">{dossier.position}</span>
                  {isPlayerOurAsset(dossier) && <span className="tag">◈ {t('room_mark_as_asset')}</span>}
                </div>
              </div>
            </section>

            <div className="bam-body">
              {/* ── Fact strip ── */}
              <div className="brit-facts bam-facts">
                <div>
                  <label>{t('room_th_position')}</label>
                  <strong>{dossier.position}</strong>
                </div>
                <div>
                  <label>{t('room_market_value')}</label>
                  <strong>{dossier.value}</strong>
                </div>
              </div>

              {dossier.playerId && (
              <div className="brit-modal-switchrow bam-switchrow">
                <div className="lbl">{t('room_mark_as_asset')}</div>
                <label className="bp-sw">
                  <input
                    type="checkbox"
                    checked={isPlayerOurAsset(dossier)}
                    disabled={assetToggling}
                    onChange={() => handleToggleOurAsset(dossier.playerId!, isPlayerOurAsset(dossier))}
                  />
                  <span className="track" />
                </label>
              </div>
            )}
            {!isUnder19Dossier && dossier.playerId && (
              <button
                type="button"
                className="brit-matchday-btn"
                onClick={() => {
                  // Prefer the fixture already resolved + displayed in the
                  // next-match section (correct teams AND the exact logos the
                  // operator sees), so the generator never re-scrapes a wrong
                  // crest. Our side = dossier.club/clubLogo; opponent =
                  // nextMatch.opponent/opponentLogo; sides from homeAway.
                  const nm = nextMatchState === 'ready' ? nextMatch : null;
                  const fixture =
                    nm && nm.homeAway
                      ? {
                          homeTeam: nm.homeAway === 'home' ? dossier.club : nm.opponent,
                          awayTeam: nm.homeAway === 'home' ? nm.opponent : dossier.club,
                          playerSide: nm.homeAway,
                          homeLogo: nm.homeAway === 'home' ? dossier.clubLogo ?? null : nm.opponentLogo ?? null,
                          awayLogo: nm.homeAway === 'home' ? nm.opponentLogo ?? null : dossier.clubLogo ?? null,
                          date: nm.date,
                          time: nm.time,
                          competition: nm.competition,
                          round: nm.round,
                          venue: nm.venue,
                        }
                      : null;
                  setMatchdaySeed({
                    playerId: dossier.playerId,
                    playerName: dossier.name,
                    playerImage: dossier.profileImage,
                    tmProfile: dossier.tmProfile,
                    club: dossier.club,
                    clubCountry: dossier.clubCountry,
                    clubLogo: dossier.clubLogo,
                    instagramHandle: dossier.instagramHandle,
                    fixture,
                  });
                }}
              >
                <span className="brit-matchday-btn-mark" aria-hidden>◈</span>
                <span className="brit-matchday-btn-label">{t('matchday_generate_button')}</span>
                <span className="brit-matchday-btn-arrow" aria-hidden>→</span>
              </button>
            )}
            {!isUnder19Dossier && <section className="bam-nm" aria-live="polite">
              <div className="bam-nm-top">
                <span className="lbl"><span className="pulse" />{t('room_next_match')}</span>
                {nextMatchState === 'ready' && nextMatch?.homeAway && (
                  <span className="ha">{t(nextMatch.homeAway === 'home' ? 'room_home' : 'room_away')}</span>
                )}
              </div>

              {nextMatchState === 'loading' && (
                <div className="bam-nm-msg">{t('room_next_match_loading')}</div>
              )}

              {nextMatchState === 'ready' && nextMatch && (() => {
                const away = nextMatch.homeAway === 'away';
                const ourSide = (
                  <div className="side me">
                    {dossier.clubLogo ? (
                      <span className="crest"><img src={dossier.clubLogo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} /></span>
                    ) : (
                      <span className="crest">{crestInitials(dossier.club)}</span>
                    )}
                    <b>{dossier.club}</b>
                    <small>{isRtl ? 'השחקן שלנו' : 'Our player'}</small>
                  </div>
                );
                const oppSide = (
                  <div className="side">
                    {nextMatch.opponentLogo ? (
                      <span className="crest"><img src={nextMatch.opponentLogo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} /></span>
                    ) : (
                      <span className="crest">{crestInitials(nextMatch.opponent)}</span>
                    )}
                    <b>{nextMatch.opponent}</b>
                    <small>{isRtl ? 'יריבה' : 'Opponent'}</small>
                  </div>
                );
                return (
                  <>
                    <div className="bam-fixture">
                      {away ? oppSide : ourSide}
                      <div className="vs">
                        <span className="v">{isRtl ? 'נגד' : 'VS'}</span>
                        {(nextMatch.competition || nextMatch.round) && (
                          <span className="comp">{[nextMatch.competition, nextMatch.round].filter(Boolean).join(' · ')}</span>
                        )}
                      </div>
                      {away ? ourSide : oppSide}
                    </div>

                    {dossierCountdown && (
                      <div className="bam-countdown">
                        <div className="unit"><b>{String(dossierCountdown.days).padStart(2, '0')}</b><small>{isRtl ? 'ימים' : 'Days'}</small></div>
                        <span className="sepc">:</span>
                        <div className="unit"><b>{String(dossierCountdown.hrs).padStart(2, '0')}</b><small>{isRtl ? 'שעות' : 'Hrs'}</small></div>
                        <span className="sepc">:</span>
                        <div className="unit"><b>{String(dossierCountdown.min).padStart(2, '0')}</b><small>{isRtl ? 'דק׳' : 'Min'}</small></div>
                      </div>
                    )}

                    <div className="bam-nm-grid">
                      <div><label>{t('room_match_date')}</label><strong>{formatMatchDate(nextMatch.date)}</strong></div>
                      <div><label>{t('room_match_kickoff')}</label><strong>{nextMatch.time || t('room_time_tbc')}</strong></div>
                      <div className="wide"><label>{t('room_match_stadium')}</label><strong>{nextMatch.venue || t('room_venue_tbc')}</strong></div>
                    </div>

                    <div className="bam-nm-src">
                      <span>{nextMatch.competition || t('room_next_match')}</span>
                      <a href={nextMatch.sourceUrl} target="_blank" rel="noreferrer">{t('room_match_source')} ↗</a>
                    </div>
                  </>
                );
              })()}

              {nextMatchState === 'unavailable' && (
                <div className="bam-nm-msg">{t('room_next_match_unavailable')}</div>
              )}
              {nextMatchState === 'error' && (
                <div className="bam-nm-msg">{t('room_next_match_error')}</div>
              )}
            </section>}

            <div className="brit-modal-actions bam-actions">
              {dossier.playerId && (
                <Link className="brit-modal-action" href={`/players/${dossier.playerId}?from=/dashboard`}>
                  {t('room_open_full_profile')}
                </Link>
              )}
              {dossier.tmProfile && (
                <a
                  className="brit-modal-action brit-modal-action-secondary"
                  href={dossier.tmProfile}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('room_open_tm')}
                </a>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick-view drawer (identical to roster page) */}
      <div
        className={`brit-scrim${drawer ? ' open' : ''}`}
        onClick={() => setDrawer(null)}
        aria-hidden={!drawer}
      />
      <aside className={`brit-drawer${drawer ? ' open' : ''}`} aria-label="Player quick view">
        {drawer && (
          <>
            <div className="brit-drawer-hero">
              {drawer.profileImage ? (
                <img src={drawer.profileImage} alt="" />
              ) : (
                <div className="brit-player-card-ph" style={{ position: 'absolute', inset: 0 }} />
              )}
              <button className="brit-drawer-close" onClick={() => setDrawer(null)} aria-label={t('room_close')}>
                ×
              </button>
              <div className="brit-drawer-hero-copy">
                <small>
                  {clubDisplay(drawer, t)} / {positionLabel(drawer.positions)}
                </small>
                <h2>{drawer.fullName || '—'}</h2>
              </div>
            </div>
            <div className="brit-drawer-body">
              <div className="brit-facts">
                <div>
                  <label>{t('room_market_value')}</label>
                  <strong>{drawer.marketValue || '—'}</strong>
                </div>
                <div>
                  <label>{t('players_th_age')}</label>
                  <strong>{computePlayerAge(drawer)}</strong>
                </div>
                <div>
                  <label>{t('room_th_position')}</label>
                  <strong>{positionLabel(drawer.positions)}</strong>
                </div>
                <div>
                  <label>{t('room_mandate_status')}</label>
                  <strong>
                    {drawer.haveMandate
                      ? t('room_mandate_active')
                      : isFreeAgent(drawer)
                      ? t('players_filter_free_agents')
                      : t('room_mandate_none')}
                  </strong>
                </div>
                <div>
                  <label>{t('players_drawer_nationality')}</label>
                  <strong>{drawer.nationality || '—'}</strong>
                </div>
                <div>
                  <label>{t('room_birthdays_agent').replace(' /', '')}</label>
                  <strong>{drawer.agentInChargeName || '—'}</strong>
                </div>
              </div>
              <div className="brit-drawer-switchrow">
                <div className="lbl">{t('players_drawer_mark_as_asset')}</div>
                <label className="bp-sw">
                  <input
                    type="checkbox"
                    checked={isPlayerOurAsset(drawer)}
                    disabled={assetToggling}
                    onChange={() => handleToggleOurAsset(drawer.id, isPlayerOurAsset(drawer))}
                  />
                  <span className="track" />
                </label>
              </div>
              {latestNote(drawer) && (
                <div className="brit-drawer-note">
                  <label>{t('players_drawer_latest_note')}</label>
                  <p>{latestNote(drawer)}</p>
                </div>
              )}
              <div className="brit-drawer-actions">
                <button className="primary" onClick={() => goToPlayer(drawer.id)}>
                  {t('players_drawer_open_profile')}
                </button>
                <button
                  className="ghost"
                  onClick={() => messageOnWhatsApp(drawer)}
                  disabled={!drawer.playerPhoneNumber}
                  style={!drawer.playerPhoneNumber ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  {t('players_drawer_whatsapp')}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      {matchdaySeed && (
        <MatchdayDrawer seed={matchdaySeed} onClose={() => setMatchdaySeed(null)} />
      )}
      {searchOpen && (
        <GlobalPlayerSearch
          roster={rosterPlayers}
          shortlist={shortlistItems}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Notification permission prompt — the men dashboard renders outside
          AppLayout, so mount it here too (gated internally). */}
      <NotificationPrompt />
    </div>
  );
}
