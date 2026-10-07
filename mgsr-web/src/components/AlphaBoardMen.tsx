'use client';

/**
 * War Room — Alpha Board (men platform).
 *
 * Full-bleed "Light Management Room" board of signable players in the locked
 * acquisition range (€150K–€2.0M). Mirrors the approved mock
 * (docs/brit-sport-group-war-room-alpha-board-v3.html): masthead, locked band
 * bar, thin signals line, search + lens/position filters, a calm card grid
 * (one "why now" line per card) and a dossier drawer with the full depth.
 *
 * Data comes from GET /api/war-room/alpha-board (already built — read only).
 * Shortlist writes go through callShortlistAdd (shared Cloud Function).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import { callShortlistAdd } from '@/lib/callables';
import { getCurrentAccountForShortlist } from '@/lib/accounts';

// ─────────────────────────────────────────────────────────────────────────
// Types (mirror the alpha-board API response)
// ─────────────────────────────────────────────────────────────────────────
interface Trigger {
  id: string;
  label: string;
}

interface AlphaPlayer {
  name: string;
  url: string;
  position: string;
  position_group: string; // FWD/WING/AM/CM/DM/FB/DEF/GK
  age: number;
  club: string;
  league: string;
  nationality: string;
  market_value: string; // "€1.5m"
  market_value_eur: number;
  contract: string;
  contract_months_left: number;
  foot: string;
  image: string; // may be empty
  alpha_score: number; // 0-100
  hunt_score: number;  // 0-100, how well the player matches the active hunt
  hunt_metric: number; // raw value the active hunt ranks by
  verdict: 'SIGN' | 'MONITOR' | 'PASS';
  tier: 'a' | 'b' | 'c';
  why_now: string;
  triggers: Trigger[];
  rating: number;
  goals_per90: number;
  assists_per90: number;
  ga_per90: number;
  tackles_int_per90: number;
  dribbles_per90: number;
  key_passes_per90: number;
  duels_won_pct: number;
  minutes_90s: number;
  fm_ca: number;
  fm_pa: number;
  fm_gap: number;
  has_stats: boolean;
  league_coefficient: number;
  // raw totals + provenance for the dossier
  goals: number;
  assists: number;
  appearances: number;
  lineups: number;
  minutes: number;
  shots_total: number;
  shots_on: number;
  goals_per_shot: number;
  key_passes: number;
  stats_season: string;   // "2025/26"
  stats_club: string;     // API source club
  stats_league: string;   // "1. Lig · Turkey"
  stats_fetched_at: string;
  stats_is_stale: boolean;
}

interface AlphaBoardResponse {
  board: AlphaPlayer[];
  count: number;
  total_in_band: number;
  band: { min: number; max: number };
  hunt: string | null;
  hunt_counts: Record<string, number>;
  signals: {
    in_band: number;
    form_rising: number;
    leverage: number;
    free: number;
    risers: number;
  };
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Static option lists
// ─────────────────────────────────────────────────────────────────────────
// "What are we hunting today?" — each hunt re-ranks the board by a real metric.
// id must match the server's HUNTS keys in alpha_board.py.
interface HuntDef {
  id: string;
  en: string; he: string;
  subEn: string; subHe: string;
  metricEn: string; metricHe: string;
  icon: string; // inner SVG paths
  /** format the ranking metric for display on the card */
  fmt: (p: AlphaPlayer, isHe: boolean) => string;
  /** 0–1 fraction for the metric bar on the card */
  bar: (p: AlphaPlayer) => number;
  /** plain-language "why this ranks here" line */
  why: (p: AlphaPlayer, isHe: boolean) => string;
}

const HUNTS: HuntDef[] = [
  {
    id: 'form', en: 'Best form', he: 'הכי בכושר', subEn: 'Hot right now', subHe: 'חמים כרגע',
    metricEn: 'By match rating', metricHe: 'לפי דירוג משחק',
    icon: '<path d="M3 13l4-4 4 4 6-7"/><path d="M3 20h18"/>',
    fmt: (p) => num(p.rating),
    bar: (p) => p.rating / 9,
    why: (p, he) => he ? `בכושר — דירוג ${num(p.rating)} על ${num(p.minutes_90s, 0)} משחקים מלאים.` : `Running hot — ${num(p.rating)} rating across ${num(p.minutes_90s, 0)} full matches.`,
  },
  {
    id: 'goals', en: 'Best goalscorers', he: 'כובשים', subEn: 'Pure finishers', subHe: 'מסיימים טהורים',
    metricEn: 'By goals / 90', metricHe: 'לפי שערים ל-90',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
    fmt: (p) => `${num(p.goals_per90)} /90`,
    bar: (p) => p.goals_per90 / 1.1,
    why: (p, he) => he ? `${num(p.goals_per90)} שערים ל-90 — בצמרת הטווח שלך.` : `${num(p.goals_per90)} goals per 90 — top of your band.`,
  },
  {
    id: 'creators', en: 'Best creators', he: 'יוצרים', subEn: 'Assists + key passes', subHe: 'בישולים + מסירות',
    metricEn: 'By chance creation', metricHe: 'לפי יצירת מצבים',
    icon: '<path d="M4 12h10M14 6l6 6-6 6"/>',
    fmt: (p) => `${num(p.hunt_metric)} /90`,
    bar: (p) => p.hunt_metric / 3.5,
    why: (p, he) => he ? `${num(p.assists_per90)} בישולים + ${num(p.key_passes_per90, 1)} מסירות מפתח ל-90.` : `${num(p.assists_per90)} assists + ${num(p.key_passes_per90, 1)} key passes per 90.`,
  },
  {
    id: 'dribblers', en: 'Best dribblers', he: 'דריבלרים', subEn: '1v1 beaters', subHe: 'מנצחי אחד על אחד',
    metricEn: 'By dribbles / 90', metricHe: 'לפי דריבלים ל-90',
    icon: '<path d="M12 2a4 4 0 100 8 4 4 0 000-8z"/><path d="M6 22l3-7 3 2 3-2 3 7"/>',
    fmt: (p) => `${num(p.dribbles_per90, 1)} /90`,
    bar: (p) => p.dribbles_per90 / 4.5,
    why: (p, he) => he ? `${num(p.dribbles_per90, 1)} דריבלים מוצלחים ל-90 — איום באחד על אחד.` : `${num(p.dribbles_per90, 1)} successful dribbles per 90 — a 1v1 threat.`,
  },
  {
    id: 'defenders', en: 'Best defenders', he: 'מגינים', subEn: 'Tackles + duels', subHe: 'חטיפות + דו-קרבות',
    metricEn: 'By defensive output', metricHe: 'לפי תפוקה הגנתית',
    icon: '<path d="M12 2l8 3v6c0 5-3.5 8-8 11-4.5-3-8-6-8-11V5z"/>',
    fmt: (p) => `${num(p.tackles_int_per90, 1)} /90`,
    bar: (p) => p.tackles_int_per90 / 6.5,
    why: (p, he) => he ? `${num(p.tackles_int_per90, 1)} חטיפות+יירוטים ל-90, ${Math.round(p.duels_won_pct)}% דו-קרבות.` : `${num(p.tackles_int_per90, 1)} tackles+interceptions per 90, ${Math.round(p.duels_won_pct)}% duels won.`,
  },
  {
    id: 'ceiling', en: 'Highest ceiling', he: 'תקרה גבוהה', subEn: 'FM potential gap', subHe: 'פער פוטנציאל FM',
    metricEn: 'By FM potential', metricHe: 'לפי פוטנציאל FM',
    icon: '<path d="M12 2v6m0 0 3-3m-3 3L9 5"/><circle cx="12" cy="15" r="6"/>',
    fmt: (p) => `PA ${p.fm_pa} · +${p.fm_gap}`,
    bar: (p) => p.fm_pa / 185,
    why: (p, he) => he ? `פוטנציאל FM ${p.fm_pa} מול ${p.fm_ca} נוכחי — ${p.fm_gap} נק׳ מרחב.` : `FM potential ${p.fm_pa} vs ${p.fm_ca} current — ${p.fm_gap} points of headroom.`,
  },
  {
    id: 'value', en: 'Best value', he: 'הכי משתלמים', subEn: 'Output per €', subHe: 'תפוקה לכל €',
    metricEn: 'By bang-for-buck', metricHe: 'לפי תמורה למחיר',
    icon: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
    fmt: (p) => `${Math.round(p.hunt_score)}`,
    bar: (p) => p.hunt_score / 100,
    why: (p, he) => he ? `תפוקה גבוהה בשווי ${p.market_value} בלבד — תמורה מצוינת.` : `Strong output for just ${p.market_value} — high bang-for-buck.`,
  },
  {
    id: 'leverage', en: 'Contract leverage', he: 'מינוף חוזה', subEn: 'Expiring / free', subHe: 'מסתיים / חופשי',
    metricEn: 'By months left', metricHe: 'לפי חודשים שנותרו',
    icon: '<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>',
    fmt: (p, he) => p.contract_months_left <= 0 ? (he ? 'חופשי' : 'Free agent') : `${Math.round(p.contract_months_left)}${he ? ' ח׳' : ' mo'}`,
    bar: (p) => p.hunt_score / 100,
    why: (p, he) => p.contract_months_left <= 0
      ? (he ? 'חופשי — ללא דמי העברה.' : 'Free agent — zero fee, pure wage play.')
      : (he ? `חוזה ל-${Math.round(p.contract_months_left)} חודשים — מינוף.` : `Contract down to ${Math.round(p.contract_months_left)} months — fee leverage.`),
  },
  {
    id: 'youngstart', en: 'Young starters', he: 'צעירים פותחים', subEn: 'Trusted & young', subHe: 'צעירים ומהימנים',
    metricEn: 'By minutes × youth', metricHe: 'לפי דקות × גיל',
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    fmt: (p, he) => `${he ? 'גיל ' : 'Age '}${p.age} · ${num(p.minutes_90s, 0)}`,
    bar: (p) => p.hunt_score / 100,
    why: (p, he) => he ? `בן ${p.age} וכבר מהימן — ${num(p.minutes_90s, 0)} משחקים מלאים.` : `${p.age}yo already trusted — ${num(p.minutes_90s, 0)} full matches banked.`,
  },
];

const POSITIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'GK', label: 'GK' },
  { id: 'CB', label: 'CB' },
  { id: 'RB', label: 'RB' },
  { id: 'LB', label: 'LB' },
  { id: 'DM', label: 'DM' },
  { id: 'CM', label: 'CM' },
  { id: 'AM', label: 'AM' },
  { id: 'RW', label: 'RW' },
  { id: 'LW', label: 'LW' },
  { id: 'CF', label: 'CF' },
];

// Trigger id → coloured dot (gold/black token palette only).
const TRIGGER_COLOR: Record<string, string> = {
  free: 'var(--red)',
  contract: 'var(--amber)',
  fm: 'var(--gold)',
  riser: 'var(--gold)',
  form: 'var(--blue)',
  minutes: 'var(--blue)',
  output: 'var(--green)',
  intensity: 'var(--green)',
};
const triggerColor = (id?: string) => (id && TRIGGER_COLOR[id]) || 'var(--muted)';

// Nationality name → ISO 3166-1 alpha-2 code (flagcdn). Falls back to no flag.
const NATIONALITY_TO_ISO: Record<string, string> = {
  israel: 'il', germany: 'de', brazil: 'br', argentina: 'ar', france: 'fr',
  spain: 'es', italy: 'it', portugal: 'pt', netherlands: 'nl', belgium: 'be',
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir',
  'great britain': 'gb', 'united kingdom': 'gb', ireland: 'ie',
  croatia: 'hr', serbia: 'rs', slovenia: 'si', 'bosnia-herzegovina': 'ba',
  'bosnia and herzegovina': 'ba', montenegro: 'me', 'north macedonia': 'mk', macedonia: 'mk',
  albania: 'al', kosovo: 'xk', greece: 'gr', turkey: 'tr', türkiye: 'tr',
  switzerland: 'ch', austria: 'at', poland: 'pl', ukraine: 'ua', russia: 'ru',
  'czech republic': 'cz', czechia: 'cz', slovakia: 'sk', hungary: 'hu', romania: 'ro',
  bulgaria: 'bg', sweden: 'se', norway: 'no', denmark: 'dk', finland: 'fi', iceland: 'is',
  cyprus: 'cy', 'faroe islands': 'fo', luxembourg: 'lu', malta: 'mt', georgia: 'ge',
  armenia: 'am', azerbaijan: 'az', kazakhstan: 'kz', 'saudi arabia': 'sa',
  'united arab emirates': 'ae', qatar: 'qa', kuwait: 'kw', bahrain: 'bh', oman: 'om',
  jordan: 'jo', lebanon: 'lb', syria: 'sy', iraq: 'iq', iran: 'ir', egypt: 'eg',
  morocco: 'ma', algeria: 'dz', tunisia: 'tn', libya: 'ly', nigeria: 'ng', ghana: 'gh',
  senegal: 'sn', 'ivory coast': 'ci', "cote d'ivoire": 'ci', cameroon: 'cm', mali: 'ml',
  'burkina faso': 'bf', guinea: 'gn', 'dr congo': 'cd', 'congo dr': 'cd', congo: 'cg',
  'south africa': 'za', angola: 'ao', gabon: 'ga', zambia: 'zm', 'cape verde': 'cv',
  'united states': 'us', usa: 'us', canada: 'ca', mexico: 'mx', 'costa rica': 'cr',
  honduras: 'hn', panama: 'pa', jamaica: 'jm', colombia: 'co', uruguay: 'uy',
  chile: 'cl', peru: 'pe', ecuador: 'ec', paraguay: 'py', venezuela: 've', bolivia: 'bo',
  japan: 'jp', 'south korea': 'kr', 'korea, south': 'kr', china: 'cn', australia: 'au',
  'new zealand': 'nz', india: 'in', thailand: 'th', indonesia: 'id',
};
const flagUrl = (nationality?: string): string | null => {
  if (!nationality) return null;
  const code = NATIONALITY_TO_ISO[nationality.trim().toLowerCase()];
  return code ? `https://flagcdn.com/w40/${code}.png` : null;
};

const fmtEurBand = (eur: number): string => {
  if (eur >= 1_000_000) {
    const m = eur / 1_000_000;
    return `€${Number.isInteger(m) ? m.toFixed(1) : m.toFixed(1)}M`;
  }
  if (eur >= 1_000) return `€${Math.round(eur / 1_000)}K`;
  return `€${eur}`;
};

const num = (v: number, digits = 2): string =>
  Number.isFinite(v) ? v.toFixed(digits) : '—';

// ── Acquisition-range slider scale ──
// Non-linear euro steps so the agency band (€0–€2M) gets fine resolution and
// the long tail (up to €10M) is still reachable. index ↔ euros.
const RANGE_STEPS: number[] = (() => {
  const s: number[] = [];
  for (let v = 0; v <= 1_000_000; v += 50_000) s.push(v);        // 0 … 1M  (21)
  for (let v = 1_100_000; v <= 2_000_000; v += 100_000) s.push(v); // … 2M   (10)
  for (let v = 2_250_000; v <= 5_000_000; v += 250_000) s.push(v); // … 5M   (11)
  for (let v = 5_500_000; v <= 10_000_000; v += 500_000) s.push(v);// … 10M  (10)
  return s;
})();
const RANGE_MAX_IDX = RANGE_STEPS.length - 1;
const idxToEur = (i: number): number => RANGE_STEPS[Math.max(0, Math.min(RANGE_MAX_IDX, Math.round(i)))];
const eurToIdx = (v: number): number => {
  let best = 0, bd = Infinity;
  RANGE_STEPS.forEach((s, i) => { const d = Math.abs(s - v); if (d < bd) { bd = d; best = i; } });
  return best;
};

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────
export default function AlphaBoardMen() {
  const { t, lang, setLang, isRtl } = useLanguage();
  const { user } = useAuth();
  const isHe = lang === 'he';

  const [board, setBoard] = useState<AlphaPlayer[]>([]);
  const [signals, setSignals] = useState<AlphaBoardResponse['signals']>({
    in_band: 0, form_rising: 0, leverage: 0, free: 0, risers: 0,
  });
  const [bandRange, setBandRange] = useState<{ min: number; max: number }>({ min: 150_000, max: 2_000_000 });
  const [totalInBand, setTotalInBand] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [hunt, setHunt] = useState('form');       // default hunt
  const [position, setPosition] = useState('all');
  const [huntCounts, setHuntCounts] = useState<Record<string, number>>({});

  // Committed acquisition band (what the server is queried with). The slider
  // edits a local draft and only commits on release, so we don't spam the API.
  const DEFAULT_BAND = { min: 150_000, max: 2_000_000 };
  const [band, setBand] = useState<{ min: number; max: number }>(DEFAULT_BAND);

  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [shortlistedUrls, setShortlistedUrls] = useState<Set<string>>(new Set());
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set());
  const [drawerPlayer, setDrawerPlayer] = useState<AlphaPlayer | null>(null);

  const reqRef = useRef(0);

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // ── Fetch the board (re-fetches on hunt/position/band/lang change) ──
  const fetchBoard = useCallback(async () => {
    const myReq = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (position !== 'all') params.set('position', position);
      if (hunt) params.set('hunt', hunt);
      params.set('band_min', String(band.min));
      params.set('band_max', String(band.max));
      params.set('lang', lang);
      const res = await fetch(`/api/war-room/alpha-board?${params.toString()}`, {
        signal: AbortSignal.timeout(120000),
      });
      const data: AlphaBoardResponse = await res.json().catch(() => ({ board: [] } as unknown as AlphaBoardResponse));
      if (myReq !== reqRef.current) return; // a newer request superseded this one
      if (!res.ok || data.error) {
        setError(data.error || (isHe ? 'טעינת הלוח נכשלה' : 'Failed to load the board'));
        setBoard([]);
      } else {
        setBoard(Array.isArray(data.board) ? data.board : []);
        if (data.signals) setSignals(data.signals);
        if (data.band) setBandRange(data.band);
        if (data.hunt_counts) setHuntCounts(data.hunt_counts);
        if (typeof data.total_in_band === 'number') setTotalInBand(data.total_in_band);
      }
    } catch (err) {
      if (myReq !== reqRef.current) return;
      const msg = err instanceof Error ? err.message : 'Alpha Board request failed';
      setError(msg);
      setBoard([]);
    } finally {
      if (myReq === reqRef.current) {
        setLoading(false);
      }
    }
  }, [position, hunt, band, lang, isHe]);

  useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);

  // ── Client-side search filter (name / club / league) + dismissals ──
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return board.filter((p) => {
      if (dismissedUrls.has(p.url)) return false;
      if (!q) return true;
      return (
        p.name?.toLowerCase().includes(q) ||
        p.club?.toLowerCase().includes(q) ||
        p.league?.toLowerCase().includes(q)
      );
    });
  }, [board, search, dismissedUrls]);

  // ── Shortlist add ──
  const addToShortlist = useCallback(async (p: AlphaPlayer) => {
    if (!user || addingUrl) return;
    setAddingUrl(p.url);
    try {
      const account = await getCurrentAccountForShortlist(user);
      await callShortlistAdd({
        platform: 'men',
        tmProfileUrl: p.url,
        playerName: p.name,
        playerPosition: p.position,
        playerAge: String(p.age),
        clubJoinedName: p.club,
        marketValue: p.market_value,
        playerImage: p.image || null,
        addedByAgentId: account.id,
        addedByAgentName: account.name ?? null,
        addedByAgentHebrewName: account.hebrewName ?? null,
      });
      setShortlistedUrls((prev) => new Set(prev).add(p.url));
    } catch (err) {
      console.error('[AlphaBoard] shortlist add failed:', err);
    } finally {
      setAddingUrl(null);
    }
  }, [user, addingUrl]);

  const dismiss = useCallback((url: string) => {
    setDismissedUrls((prev) => new Set(prev).add(url));
  }, []);

  // ── Acquisition-range slider: draft indices while dragging; commit on release ──
  const [draftMinIdx, setDraftMinIdx] = useState(() => eurToIdx(DEFAULT_BAND.min));
  const [draftMaxIdx, setDraftMaxIdx] = useState(() => eurToIdx(DEFAULT_BAND.max));
  const draftMin = idxToEur(Math.min(draftMinIdx, draftMaxIdx));
  const draftMax = idxToEur(Math.max(draftMinIdx, draftMaxIdx));
  const atTop = Math.max(draftMinIdx, draftMaxIdx) >= RANGE_MAX_IDX;

  // Keep the slider draft in sync when the band is reset/changed programmatically.
  useEffect(() => {
    setDraftMinIdx(eurToIdx(band.min));
    setDraftMaxIdx(eurToIdx(band.max));
  }, [band.min, band.max]);

  const commitBand = useCallback(() => {
    const lo = idxToEur(Math.min(draftMinIdx, draftMaxIdx));
    const hi = idxToEur(Math.max(draftMinIdx, draftMaxIdx));
    if (lo !== band.min || hi !== band.max) setBand({ min: lo, max: hi });
  }, [draftMinIdx, draftMaxIdx, band.min, band.max]);

  const setPreset = useCallback((min: number, max: number) => {
    setBand({ min, max });
  }, []);

  const BAND_PRESETS: { label: string; min: number; max: number }[] = [
    { label: '150K–2M', min: 150_000, max: 2_000_000 },
    { label: 'Free–500K', min: 0, max: 500_000 },
    { label: '500K–1.5M', min: 500_000, max: 1_500_000 },
    { label: '1M–3M', min: 1_000_000, max: 3_000_000 },
    { label: 'Up to 5M', min: 0, max: 5_000_000 },
  ];

  const activeHunt = HUNTS.find((h) => h.id === hunt) || HUNTS[0];

  // Position-filter the (server already hunt-ranked) board, apply search + dismissals.
  const draftFillLo = (Math.min(draftMinIdx, draftMaxIdx) / RANGE_MAX_IDX) * 100;
  const draftFillHi = (Math.max(draftMinIdx, draftMaxIdx) / RANGE_MAX_IDX) * 100;

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="war-room-alpha" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            {/* Masthead */}
            <header className="brit-masthead">
              <div className="brit-ab-mastflex">
                <div>
                  <p className="brit-kicker">
                    {isHe ? 'ייצור אלפא / פלטפורמת גברים' : 'Alpha generation / Men platform'}
                  </p>
                  <h1>{isHe ? 'לוח ' : 'Alpha '}<span>{isHe ? 'אלפא.' : 'board.'}</span></h1>
                  <p className="brit-ra-sub">
                    {isHe
                      ? 'בחר מה אתה צד היום — הלוח מחשב מחדש מול נתוני השחקנים האמיתיים ומדרג את ההתאמות הטובות בטווח הרכש שלך.'
                      : "Pick what you're hunting today — the board recomputes against the real player data and ranks the best matches inside your acquisition range."}
                  </p>
                </div>
              </div>
            </header>

            {/* HUNT chooser — "what are we hunting today?" */}
            <div className="brit-ab-huntq">
              <span>{isHe ? 'מה אנחנו צדים היום?' : 'What are we hunting today?'}</span>
              <span className="ln" />
            </div>
            <div className="brit-ab-hunts">
              {HUNTS.map((h) => {
                const count = huntCounts[h.id];
                return (
                  <button
                    key={h.id}
                    className={`brit-ab-hunt${hunt === h.id ? ' on' : ''}`}
                    onClick={() => setHunt(h.id)}
                  >
                    <svg className="ico" viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: h.icon }} />
                    <b>{isHe ? h.he : h.en}</b>
                    <span className="sub">{isHe ? h.subHe : h.subEn}</span>
                    <span className="metric">{isHe ? h.metricHe : h.metricEn}</span>
                    {typeof count === 'number' && (
                      <span className="cnt">{count} {isHe ? 'מתאימים' : 'match'}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Acquisition range — draggable dual slider */}
            <div className="brit-ab-rangebar">
              <div className="rb-top">
                <span className="rb-lbl">{isHe ? 'טווח רכש · גרור לשינוי' : 'Acquisition range · drag to adjust'}</span>
                <span className="rb-val"><b>{fmtEurBand(draftMin)}</b> — <b>{atTop ? (isHe ? '∞' : 'No limit') : fmtEurBand(draftMax)}</b></span>
                <button className="rb-reset" onClick={() => setPreset(DEFAULT_BAND.min, DEFAULT_BAND.max)}>
                  {isHe ? 'אפס לברירת מחדל' : 'Reset to default'}
                </button>
              </div>
              <div className="brit-ab-slider">
                <div className="track" />
                <div className="fill" style={{ insetInlineStart: `${draftFillLo}%`, width: `${draftFillHi - draftFillLo}%` }} />
                <input
                  type="range" min={0} max={RANGE_MAX_IDX} step={1} value={draftMinIdx}
                  onChange={(e) => setDraftMinIdx(Number(e.target.value))}
                  onMouseUp={commitBand} onTouchEnd={commitBand} onKeyUp={commitBand}
                  aria-label={isHe ? 'שווי מינימלי' : 'Minimum value'}
                />
                <input
                  type="range" min={0} max={RANGE_MAX_IDX} step={1} value={draftMaxIdx}
                  onChange={(e) => setDraftMaxIdx(Number(e.target.value))}
                  onMouseUp={commitBand} onTouchEnd={commitBand} onKeyUp={commitBand}
                  aria-label={isHe ? 'שווי מקסימלי' : 'Maximum value'}
                />
              </div>
              <div className="rb-ticks"><span>€0</span><span>€1M</span><span>€2M</span><span>€5M</span><span>€10M</span></div>
              <div className="rb-presets">
                {BAND_PRESETS.map((p) => {
                  const on = band.min === p.min && band.max === p.max;
                  return (
                    <button key={p.label} className={on ? 'on' : ''} onClick={() => setPreset(p.min, p.max)}>{p.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Search + position chips */}
            <div className="brit-ab-controls">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isHe ? 'חפש לפי שם, מועדון או ליגה…' : 'Search by name, club or league…'}
                />
              </label>
              <span className="brit-ab-rankby">{isHe ? (`מדורג ${activeHunt.he}`) : (`Ranked by ${activeHunt.en.toLowerCase()}`)}</span>
            </div>

            <div className="brit-ab-poschips">
              {POSITIONS.map((p) => (
                <button
                  key={p.id}
                  className={`brit-ab-poschip${position === p.id ? ' on' : ''}`}
                  onClick={() => setPosition(p.id)}
                >
                  {p.id === 'all' ? (isHe ? 'הכל' : 'All') : p.label}
                </button>
              ))}
            </div>

            {/* Result count */}
            <p className="brit-result-count">
              {isHe
                ? `${visible.length} התאמות · מדורג ${activeHunt.he}`
                : `${visible.length} matches · ranked by ${activeHunt.en.toLowerCase()}`}
            </p>

            {/* Board */}
            {loading ? (
              <div className="brit-empty">{isHe ? 'טוען…' : 'Loading…'}</div>
            ) : error ? (
              <div className="brit-empty">{error}</div>
            ) : visible.length === 0 ? (
              <div className="brit-empty">
                {search.trim()
                  ? (isHe ? 'אין תוצאות' : 'No results')
                  : (isHe ? 'אין שחקנים בטווח כרגע' : 'No players in range right now')}
              </div>
            ) : (
              <div className="brit-ab-board">
                {visible.map((p, i) => (
                  <AlphaCard
                    key={p.url}
                    player={p}
                    rank={i + 1}
                    huntDef={activeHunt}
                    isHe={isHe}
                    isAdding={addingUrl === p.url}
                    isSaved={shortlistedUrls.has(p.url)}
                    onOpen={() => setDrawerPlayer(p)}
                    onShortlist={() => addToShortlist(p)}
                    onDismiss={() => dismiss(p.url)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Dossier drawer */}
      <AlphaDossier
        player={drawerPlayer}
        isHe={isHe}
        t={t}
        isAdding={drawerPlayer ? addingUrl === drawerPlayer.url : false}
        isSaved={drawerPlayer ? shortlistedUrls.has(drawerPlayer.url) : false}
        onClose={() => setDrawerPlayer(null)}
        onShortlist={() => drawerPlayer && addToShortlist(drawerPlayer)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────
function AlphaCard({
  player, rank, huntDef, isHe, isAdding, isSaved, onOpen, onShortlist, onDismiss,
}: {
  player: AlphaPlayer;
  rank: number;
  huntDef: HuntDef;
  isHe: boolean;
  isAdding: boolean;
  isSaved: boolean;
  onOpen: () => void;
  onShortlist: () => void;
  onDismiss: () => void;
}) {
  const p = player;
  // hunt_score is the match score for the active hunt. Fall back to the Alpha
  // score if the server hasn't sent it yet, and never render NaN.
  const rawScore = Number.isFinite(p.hunt_score) && p.hunt_score > 0 ? p.hunt_score : p.alpha_score;
  const matchScore = Number.isFinite(rawScore) ? Math.round(rawScore) : 0;
  const flag = flagUrl(p.nationality);
  const ringDeg = Math.round(Math.max(0, Math.min(100, matchScore)) * 3.6);
  const leagueStr = p.league && p.league !== '—' ? p.league : (isHe ? 'חופשי' : 'Free agent');

  return (
    <article className={`brit-ab-hero${rank <= 3 ? ' top3' : ''}`} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      {/* Hero portrait with flag background + gradient */}
      <div className="hero">
        {flag && <img className="flagbg" src={flag} alt="" aria-hidden="true" />}
        {p.image
          ? <img className="portrait" src={p.image} alt="" />
          : <div className="portrait-ph" aria-hidden="true" />}
        <span className="rank">{rank}</span>
        <span className={`brit-ab-verdict ${p.verdict}`}>{p.verdict}</span>
        <div className="score-ring" style={{ background: `conic-gradient(var(--gold-soft) ${ringDeg}deg, rgba(243,240,232,.22) 0)` }}>
          <div className="inner"><b>{matchScore}</b><small>{isHe ? 'התאמה' : 'match'}</small></div>
        </div>
        <div className="who">
          <div className="nm" title={p.name}>{p.name}</div>
          <div className="meta">{p.position} · {leagueStr} · {isHe ? `גיל ${p.age}` : `Age ${p.age}`}</div>
        </div>
      </div>

      {/* Body: hunt metric + why-now + value/actions */}
      <div className="body">
        <div className="huntrow">
          <span className="huntchip"><span className="d" />{isHe ? huntDef.he : huntDef.en}</span>
          <span className="metric">{huntDef.fmt(p, isHe)}<span className="ml">{isHe ? huntDef.metricHe : huntDef.metricEn}</span></span>
        </div>
        <p className="why">{huntDef.why(p, isHe)}</p>
        <div className="foot">
          <div className="mv">
            <b>{p.market_value}</b>
            <small>{isHe ? 'שווי שוק' : 'Market value'}</small>
          </div>
          <div className="acts">
            <button
              className="save"
              disabled={isAdding || isSaved}
              title={isHe ? 'הוסף לרשימה' : 'Shortlist'}
              onClick={(e) => { e.stopPropagation(); onShortlist(); }}
            >
              {isSaved ? (
                <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
              ) : (
                <svg viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              )}
              <span>{isSaved ? (isHe ? 'נשמר' : 'Saved') : (isHe ? 'מעקב' : 'Shortlist')}</span>
            </button>
            <button
              className="ic"
              title={isHe ? 'הסתר' : 'Dismiss'}
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            >
              <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dossier drawer
// ─────────────────────────────────────────────────────────────────────────
function AlphaDossier({
  player, isHe, t, isAdding, isSaved, onClose, onShortlist,
}: {
  player: AlphaPlayer | null;
  isHe: boolean;
  t: (k: string) => string;
  isAdding: boolean;
  isSaved: boolean;
  onClose: () => void;
  onShortlist: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  if (!player) return null;
  const p = player;
  const leagueStr = p.league && p.league !== '—' ? p.league : (isHe ? 'חופשי' : 'Free agent');
  const verdictLabel =
    p.verdict === 'SIGN' ? t('rec_sign') : p.verdict === 'MONITOR' ? t('rec_monitor') : t('rec_pass');

  const hasStats = p.has_stats && p.minutes > 0;
  // Totals shown first with the per-90 rate in parentheses.
  const totalStat = (label: string, total: number | string, per90?: number, suffix = '') =>
    ({ label, total: `${total}${suffix}`, per90: per90 !== undefined ? `${num(per90)} ${isHe ? 'ל-90' : 'per 90'}` : '' });

  const statRows = hasStats ? [
    totalStat(isHe ? 'שערים' : 'Goals', p.goals, p.goals_per90),
    totalStat(isHe ? 'בישולים' : 'Assists', p.assists, p.assists_per90),
    totalStat(isHe ? 'בעיטות (למסגרת)' : 'Shots (on target)', `${p.shots_total} (${p.shots_on})`),
    totalStat(isHe ? 'מסירות מפתח' : 'Key passes', p.key_passes, p.key_passes_per90),
    { label: isHe ? 'יעילות' : 'Conversion', total: `${Math.round((p.goals_per_shot || 0) * 100)}%`, per90: isHe ? 'שער לבעיטה' : 'goals per shot' },
    { label: isHe ? 'דירוג משחק' : 'Avg match rating', total: num(p.rating), per90: '/ 10', gold: true },
  ] : [];

  const ringDeg = Math.round(Math.max(0, Math.min(100, p.alpha_score)) * 3.6);
  const fmDeg = Math.round((p.fm_pa || 0) / 100 * 360);

  return (
    <>
      <div className="brit-scrim open" onClick={onClose} aria-hidden="true" />
      <aside className="brit-drawer open brit-dossier" aria-label={isHe ? 'תיק שחקן' : 'Player dossier'}>
        {/* ── Header ── */}
        <div className="brit-dossier-h">
          <button className="brit-drawer-close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="brit-dossier-top">
            {p.image
              ? <img className="portrait" src={p.image} alt="" aria-hidden="true" />
              : <div className="portrait ph" aria-hidden="true" />}
            <div className="brit-dossier-id">
              <div className="kick">{isHe ? 'לוח אלפא · פלטפורמת גברים' : 'Alpha board · Men platform'}</div>
              <h2>{p.name}</h2>
              <div className="bio">
                <span><b>{p.position}</b></span><span>·</span>
                <span>{isHe ? 'גיל' : 'Age'} <b>{p.age}</b></span><span>·</span>
                <span><b>{p.club}</b></span><span>·</span>
                <span>{leagueStr}</span>
              </div>
            </div>
          </div>
          <div className="brit-dossier-score">
            <div className="big"><b>{p.alpha_score}</b><span className="out">/ 100</span></div>
            <div className="lbl">{isHe ? 'ציון אלפא' : 'Alpha score'}</div>
            <div className="verdict">
              <span className={`tag ${p.verdict}`}>{verdictLabel}</span>
              <span className="vl">{isHe ? 'המלצה' : 'Recommendation'}</span>
            </div>
          </div>
        </div>

        <div className="brit-dossier-b">
          {/* ── Why now ── */}
          <section className="brit-dossier-sec">
            <div className="sh"><h3>{isHe ? 'למה עכשיו' : 'Why now'}</h3><span className="src">{isHe ? 'סיגנל' : 'Signal'}</span></div>
            <div className="brit-dossier-why">
              <span className="mark">!</span>
              <div className="txt">
                <div className="headline">{p.why_now || (p.triggers?.[0]?.label ?? '')}</div>
                {p.triggers && p.triggers.length > 1 && (
                  <div className="detail">
                    {(isHe ? 'סיגנלים נוספים: ' : 'Also: ') + p.triggers.slice(1).map((tr) => tr.label).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Performance ── */}
          {hasStats ? (
            <section className="brit-dossier-sec">
              <div className="sh">
                <h3>{isHe ? 'ביצועים' : 'Performance'}</h3>
                <span className="meta">{isHe ? 'עונה' : 'Season'} <b>{p.stats_season || '—'}</b></span>
                <span className="src">API-Football</span>
              </div>
              {p.stats_is_stale && (
                <div className="brit-dossier-ctx">
                  <span className="dot" />
                  {isHe
                    ? `הנתונים מ-${p.stats_club} (${p.stats_league}) — המועדון הקודם שלו, לא ${p.club}.`
                    : `Stats are from ${p.stats_club} (${p.stats_league}) — his previous club, not ${p.club}.`}
                </div>
              )}
              <div className="brit-dossier-stats">
                {statRows.map((s) => (
                  <div className="st" key={s.label}>
                    <div className="k">{s.label}</div>
                    <div className="v"><span className={`total${(s as { gold?: boolean }).gold ? ' gold' : ''}`}>{s.total}</span>{s.per90 && <span className="per90">{s.per90}</span>}</div>
                  </div>
                ))}
                <div className="st wide">
                  <div className="k">{isHe ? 'הופעות (פתיחה) · דקות' : 'Appearances (starts) · minutes'}</div>
                  <div className="v">
                    <span className="total">{p.appearances} <span className="sub">({p.lineups} {isHe ? 'פתיחה' : 'starts'})</span></span>
                    <span className="per90">{p.minutes} {isHe ? 'דקות' : 'min'}</span>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="brit-dossier-sec">
              <div className="sh"><h3>{isHe ? 'ביצועים' : 'Performance'}</h3></div>
              <div className="brit-dossier-nostats">
                {isHe ? 'אין נתוני ביצועים זמינים לליגה/עונה הזו.' : 'No performance stats available for this league/season.'}
              </div>
            </section>
          )}

          {/* ── Potential (FM) ── */}
          {(p.fm_pa > 0) && (
            <section className="brit-dossier-sec">
              <div className="sh"><h3>{isHe ? 'פוטנציאל (Football Manager)' : 'Potential (Football Manager)'}</h3><span className="src">FMInside</span></div>
              <div className="brit-dossier-fm">
                <div className="ring" style={{ background: `conic-gradient(var(--gold-soft) ${fmDeg}deg, var(--paper-2) 0)` }}>
                  <div className="inner"><b>{p.fm_pa}</b></div>
                </div>
                <div className="fmbody">
                  <div className="cap">{isHe ? 'נוכחי → תקרה' : 'Current → ceiling'}: {p.fm_ca || '—'} → {p.fm_pa}</div>
                  <div className="line">
                    {isHe
                      ? <>יכולת נוכחית <b>{p.fm_ca}</b>, פוטנציאל <b>{p.fm_pa}</b> — פער צמיחה של <b>+{p.fm_gap}</b>.</>
                      : <>Current ability <b>{p.fm_ca}</b>, potential <b>{p.fm_pa}</b> — a <b>+{p.fm_gap}</b> growth gap.</>}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Market & leverage ── */}
          <section className="brit-dossier-sec">
            <div className="sh"><h3>{isHe ? 'שוק ומינוף' : 'Market & leverage'}</h3><span className="src">Transfermarkt</span></div>
            <div className="brit-dossier-facts">
              <div className="fact"><div className="k">{isHe ? 'שווי שוק' : 'Market value'}</div><div className="v">{p.market_value || '—'}</div></div>
              <div className="fact"><div className="k">{isHe ? 'חוזה עד' : 'Contract until'}</div><div className="v sm">{p.contract || '—'}</div></div>
              <div className="fact"><div className="k">{isHe ? 'חודשים שנותרו' : 'Months left'}</div><div className="v">{p.contract_months_left > 0 ? Math.round(p.contract_months_left) : '—'}</div></div>
            </div>
          </section>

          {/* ── Data notice (only when stats are stale / from a prior club) ── */}
          {p.stats_is_stale && hasStats && (
            <section className="brit-dossier-sec">
              <div className="brit-dossier-notice">
                <svg className="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16.5" r=".6" fill="currentColor" stroke="none" /></svg>
                <div>
                  <div className="n-h">{isHe ? 'הערת נתונים' : 'Data note'}</div>
                  <p>
                    {isHe
                      ? `הזהות מאומתת, אך ספק הסטטיסטיקה עדיין לא מכסה את ${p.club}. המספרים הם מהעונה (${p.stats_season}) במועדונו הקודם (${p.stats_club}) ולפני המעבר.`
                      : `Identity is confirmed, but the stats provider doesn\u2019t yet cover ${p.club}. The numbers are from season ${p.stats_season} at his former club (${p.stats_club}) and predate his move.`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── Actions ── */}
          <div className="brit-dossier-cta">
            <button className="primary" disabled={isAdding || isSaved} onClick={onShortlist}>
              {isSaved ? t('shortlist_already_added') : isAdding ? t('shortlist_adding') : `+ ${t('shortlist_add')}`}
            </button>
            <a className="ghost" href={p.url} target="_blank" rel="noopener noreferrer">
              {isHe ? 'פתח בטרנספרמרקט' : 'Open on Transfermarkt'}
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
