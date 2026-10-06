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
}

interface AlphaBoardResponse {
  board: AlphaPlayer[];
  count: number;
  total_in_band: number;
  band: { min: number; max: number };
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
const LENSES: { id: string; en: string; he: string }[] = [
  { id: 'all', en: 'All', he: 'הכל' },
  { id: 'riser', en: 'Undervalued risers', he: 'עליות מתומחרות נמוך' },
  { id: 'form', en: 'In-form', he: 'בכושר' },
  { id: 'contract', en: 'Leverage windows', he: 'חלונות מינוף' },
  { id: 'free', en: 'Free & released', he: 'חופשי ושוחרר' },
  { id: 'intensity', en: 'Intensity', he: 'אינטנסיביות' },
];

const POSITIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'GK', label: 'GK' },
  { id: 'DEF', label: 'DEF' },
  { id: 'FB', label: 'FB' },
  { id: 'DM', label: 'DM' },
  { id: 'CM', label: 'CM' },
  { id: 'AM', label: 'AM' },
  { id: 'WING', label: 'WING' },
  { id: 'FWD', label: 'FWD' },
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
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [lens, setLens] = useState('all');
  const [position, setPosition] = useState('all');

  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [shortlistedUrls, setShortlistedUrls] = useState<Set<string>>(new Set());
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(new Set());
  const [drawerPlayer, setDrawerPlayer] = useState<AlphaPlayer | null>(null);

  const reqRef = useRef(0);

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // ── Fetch the board (re-fetches on lens/position/lang change, or manual rebuild) ──
  const fetchBoard = useCallback(async (opts?: { rebuild?: boolean }) => {
    const myReq = ++reqRef.current;
    if (opts?.rebuild) setRebuilding(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (position !== 'all') params.set('position', position);
      if (lens !== 'all') params.set('trigger', lens);
      params.set('lang', lang);
      if (opts?.rebuild) params.set('_t', String(Date.now()));
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
        setRebuilding(false);
      }
    }
  }, [position, lens, lang, isHe]);

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

  const bandLabel = `${fmtEurBand(bandRange.min)} – ${fmtEurBand(bandRange.max)}`;

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="war-room" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <span className="brit-ab-lastrun">{isHe ? 'נבנה אוטומטית מדי יום · 07:00' : 'Auto-refreshed daily · 07:00'}</span>
              <button
                className={`brit-ra-refresh${rebuilding ? ' live' : ''}`}
                onClick={() => fetchBoard({ rebuild: true })}
                disabled={rebuilding}
              >
                <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
                <span>{rebuilding ? (isHe ? 'מרענן…' : 'Refreshing…') : (isHe ? 'רענן' : 'Refresh')}</span>
              </button>
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
                      ? 'שחקנים בני-החתמה בטווח הרכש שלך, שמתגלים לפני שהשוק מגיב. לוח אחד מדורג, סיבה אחת לכל אחד — פתח כל כרטיס לתיק המלא.'
                      : 'Signable players in your acquisition range, surfaced before the market reacts. One ranked board, one reason each — open any card for the full dossier.'}
                  </p>
                </div>
              </div>
            </header>

            {/* Value band — the KEY constraint, shown explicitly (locked) */}
            <div className="brit-ab-band">
              <span className="lbl">{isHe ? 'טווח רכש · נעול' : 'Acquisition range · locked'}</span>
              <span className="val">{bandLabel}</span>
              <div className="track"><i /></div>
            </div>

            {/* Thin signals line */}
            <section className="brit-signals brit-ab-signals">
              <div className="brit-signal brit-ab-sig">
                <strong>{String(signals.in_band ?? totalInBand).padStart(2, '0')}</strong>
                <small>{isHe ? 'בטווח כעת' : 'In band'}</small>
              </div>
              <div className="brit-signal brit-ab-sig">
                <strong className="green">{String(signals.form_rising).padStart(2, '0')}</strong>
                <small>{isHe ? 'כושר עולה' : 'Form rising'}</small>
              </div>
              <div className="brit-signal brit-ab-sig">
                <strong className="amber">{String(signals.leverage).padStart(2, '0')}</strong>
                <small>{isHe ? 'חלונות מינוף' : 'Leverage'}</small>
              </div>
              <div className="brit-signal brit-ab-sig">
                <strong className="red">{String(signals.free).padStart(2, '0')}</strong>
                <small>{isHe ? 'חופשי / שוחרר' : 'Free / released'}</small>
              </div>
              <div className="brit-signal brit-ab-sig">
                <strong className="gold">{String(signals.risers).padStart(2, '0')}</strong>
                <small>{isHe ? 'עליות' : 'Risers'}</small>
              </div>
            </section>

            {/* Controls — search (rank-by is implicit: server ranks by Alpha) */}
            <div className="brit-ab-controls">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isHe ? 'חפש לפי שם, מועדון או ליגה…' : 'Search by name, club or league…'}
                />
              </label>
              <span className="brit-ab-rankby">{isHe ? 'מדורג לפי אלפא' : 'Ranked by Alpha'}</span>
            </div>

            {/* Lens pills (re-fetch with trigger=) */}
            <div className="brit-ab-lenses">
              {LENSES.map((l) => (
                <button
                  key={l.id}
                  className={`brit-ab-lens${lens === l.id ? ' on' : ''}`}
                  onClick={() => setLens(l.id)}
                >
                  {isHe ? l.he : l.en}
                </button>
              ))}
            </div>

            {/* Position chips (re-fetch with position=) */}
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
                ? `${visible.length} הזדמנויות בטווח · מדורג לפי ציון אלפא`
                : `${visible.length} opportunities in range · ranked by Alpha Score`}
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
                {visible.map((p) => (
                  <AlphaCard
                    key={p.url}
                    player={p}
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
  player, isHe, isAdding, isSaved, onOpen, onShortlist, onDismiss,
}: {
  player: AlphaPlayer;
  isHe: boolean;
  isAdding: boolean;
  isSaved: boolean;
  onOpen: () => void;
  onShortlist: () => void;
  onDismiss: () => void;
}) {
  const p = player;
  const hot = p.alpha_score >= 85;
  const trig = p.triggers?.[0];
  const flag = flagUrl(p.nationality);

  return (
    <article className={`brit-ab-card tier-${p.tier}`} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <div className="brit-ab-chead">
        {p.image
          ? <img src={p.image} alt="" />
          : <div className="brit-ab-cimg-ph" aria-hidden="true" />}
        <div className="brit-ab-cid">
          <div className="nm" title={p.name}>{p.name}</div>
          <div className="meta">
            <b>{p.club}</b> · {p.position} · {isHe ? `גיל ${p.age}` : `Age ${p.age}`}
            {flag && <img className="fl" src={flag} alt="" />}
          </div>
        </div>
        <div className={`brit-ab-score${hot ? ' hot' : ''}`}>
          <b>{p.alpha_score}</b>
          <small>{isHe ? 'אלפא' : 'alpha'}</small>
        </div>
      </div>

      <div className="brit-ab-cwhy">
        {trig && (
          <span className="tag">
            <span className="d" style={{ background: triggerColor(trig.id) }} />
            {trig.label}
          </span>
        )}
        <p>{p.why_now}</p>
      </div>

      <div className="brit-ab-cfoot">
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
          </button>
          <button
            className="dismiss"
            title={isHe ? 'הסתר' : 'Dismiss'}
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          >
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
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
  const flag = flagUrl(p.nationality);
  const leagueStr = p.league && p.league !== '—' ? p.league : (isHe ? 'חופשי' : 'Free agent');
  const subLine = `${p.club} · ${leagueStr} · ${p.position} · ${isHe ? `גיל ${p.age}` : `Age ${p.age}`}`;
  const verdictLabel =
    p.verdict === 'SIGN' ? t('rec_sign') : p.verdict === 'MONITOR' ? t('rec_monitor') : t('rec_pass');

  const leverage =
    p.contract_months_left > 0 && p.contract_months_left <= 12
      ? (isHe ? 'מינוף: גבוה' : 'leverage: high')
      : (isHe ? 'מינוף: בינוני' : 'leverage: moderate');

  const stats: { label: string; value: string; cls?: string }[] = [
    { label: isHe ? 'שערים / 90' : 'Goals / 90', value: num(p.goals_per90) },
    { label: isHe ? 'בישולים / 90' : 'Assists / 90', value: num(p.assists_per90) },
    { label: isHe ? 'ש+ב / 90' : 'G+A / 90', value: num(p.ga_per90) },
    { label: isHe ? 'חטיפות+יירוטים / 90' : 'Tkl + Int / 90', value: num(p.tackles_int_per90, 1) },
    { label: isHe ? 'דריבלים / 90' : 'Dribbles / 90', value: num(p.dribbles_per90, 1) },
    { label: isHe ? 'מסירות מפתח / 90' : 'Key passes / 90', value: num(p.key_passes_per90, 1) },
    { label: isHe ? 'דו-קרב %' : 'Duels won %', value: Number.isFinite(p.duels_won_pct) ? `${Math.round(p.duels_won_pct)}%` : '—' },
    { label: isHe ? 'דירוג' : 'Rating', value: num(p.rating), cls: 'gold' },
    { label: isHe ? 'דקות (90s)' : 'Minutes (90s)', value: num(p.minutes_90s, 1) },
  ];

  return (
    <>
      <div className="brit-scrim open" onClick={onClose} aria-hidden="true" />
      <aside className="brit-drawer open brit-ab-drawer" aria-label={isHe ? 'תיק שחקן' : 'Player dossier'}>
        {/* Header */}
        <div className="brit-ab-dh">
          <button className="brit-drawer-close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="brit-ab-dh-top">
            {p.image
              ? <img src={p.image} alt="" aria-hidden="true" />
              : <div className="brit-ab-dh-ph" aria-hidden="true" />}
            <div className="brit-ab-dh-info">
              <small>
                {flag && <img className="fl" src={flag} alt="" />}
                {subLine}
              </small>
              <h2>{p.name}</h2>
            </div>
          </div>
          <div className="brit-ab-dh-alpha">
            <div>
              <div className="big">{p.alpha_score}</div>
              <div className="lbl">{isHe ? 'ציון אלפא' : 'Alpha Score'}</div>
            </div>
            <span className={`brit-ab-verdict ${p.verdict}`}>{verdictLabel}</span>
          </div>
        </div>

        <div className="brit-ab-db">
          {/* Why now — the triggers list */}
          <section className="brit-ab-sec">
            <h3>⚡ <span>{isHe ? 'למה עכשיו' : 'Why now'}</span><span className="src">{isHe ? 'מחושב' : 'Computed'}</span></h3>
            <div className="brit-ab-why">
              {p.triggers && p.triggers.length > 0 ? (
                p.triggers.map((trig, i) => (
                  <div className="w" key={trig.id || i}>
                    <span className="d" style={{ background: triggerColor(trig.id) }} />
                    {trig.label}
                  </div>
                ))
              ) : (
                <div className="w"><span className="d" style={{ background: 'var(--muted)' }} />{p.why_now}</div>
              )}
            </div>
          </section>

          {/* Performance */}
          <section className="brit-ab-sec">
            <h3>📊 <span>{isHe ? 'ביצועים' : 'Performance'}</span><span className="src">{p.has_stats ? 'FBref · Opta' : 'FMInside'}</span></h3>
            <div className="brit-ab-sg">
              {stats.map((s) => (
                <div key={s.label}>
                  <label>{s.label}</label>
                  <b className={s.cls}>{s.value}</b>
                </div>
              ))}
              <div>
                <label>{isHe ? 'FM CA→PA' : 'FM CA→PA'}</label>
                <b className="gold">{p.fm_ca || '—'}{p.fm_pa ? `→${p.fm_pa}` : ''}</b>
              </div>
              <div>
                <label>{isHe ? 'פער FM' : 'FM gap'}</label>
                <b>{Number.isFinite(p.fm_gap) ? `+${p.fm_gap}` : '—'}</b>
              </div>
            </div>
            {/* Honest data-availability note */}
            <div className="brit-ab-avail">
              {!p.has_stats && (
                <div className="ar off">
                  <span className="d off" />
                  {isHe ? 'נתונים מוגבלים לליגה זו' : 'Limited stats for this league'}
                </div>
              )}
              <div className="ar off">
                <span className="d off" />
                {isHe ? 'xG לא בשימוש — נשפט לפי תפוקה + FM + אינטנסיביות' : 'xG not used — judged on output + FM + intensity'}
              </div>
            </div>
          </section>

          {/* Market & leverage */}
          <section className="brit-ab-sec">
            <h3>💰 <span>{isHe ? 'שוק ומינוף' : 'Market & leverage'}</span><span className="src">TM · FMInside</span></h3>
            <div className="brit-ab-sg brit-ab-sg-3">
              <div>
                <label>{isHe ? 'שווי שוק' : 'Market value'}</label>
                <b>{p.market_value || '—'}</b>
              </div>
              <div>
                <label>{isHe ? 'חוזה' : 'Contract'}</label>
                <b>{p.contract || '—'}</b>
              </div>
              <div>
                <label>{isHe ? 'חודשים שנותרו' : 'Months left'}</label>
                <b className={p.contract_months_left > 0 && p.contract_months_left <= 12 ? 'amber' : undefined}>
                  {p.contract_months_left > 0 ? Math.round(p.contract_months_left) : '—'}
                  <span className="lev">{leverage}</span>
                </b>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="brit-ab-cta">
            <button
              className="primary"
              disabled={isAdding || isSaved}
              onClick={onShortlist}
            >
              {isSaved
                ? t('shortlist_already_added')
                : isAdding
                  ? t('shortlist_adding')
                  : `+ ${t('shortlist_add')}`}
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
