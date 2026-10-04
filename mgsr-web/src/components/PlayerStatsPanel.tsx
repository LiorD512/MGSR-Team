'use client';

import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface PlayerStatsData {
  name: string;
  position: string;
  league: string;
  club: string;
  age: string;
  api_matched: boolean;
  api_rating?: number;
  api_appearances?: number;
  api_lineups?: number;
  api_minutes?: number;
  api_minutes_90s?: number;
  api_goals?: number;
  api_assists?: number;
  api_conceded?: number;
  api_saves?: number;
  api_shots_total?: number;
  api_shots_on?: number;
  api_passes_total?: number;
  api_passes_key?: number;
  api_passes_accuracy?: number;
  api_tackles?: number;
  api_blocks?: number;
  api_interceptions?: number;
  api_duels_total?: number;
  api_duels_won?: number;
  api_dribbles_attempts?: number;
  api_dribbles_success?: number;
  api_fouls_drawn?: number;
  api_fouls_committed?: number;
  api_cards_yellow?: number;
  api_cards_red?: number;
  api_penalty_scored?: number;
  api_penalty_missed?: number;
  api_goals_per90?: number;
  api_assists_per90?: number;
  api_goal_contributions_per90?: number;
  api_shots_per90?: number;
  api_shots_on_target_per90?: number;
  api_goals_per_shot?: number;
  api_key_passes_per90?: number;
  api_tackles_per90?: number;
  api_interceptions_per90?: number;
  api_tackles_interceptions_per90?: number;
  api_fouls_per90?: number;
  api_fouled_per90?: number;
  api_dribbles_per90?: number;
  api_dribbles_success_per90?: number;
  api_duels_per90?: number;
  api_duels_won_per90?: number;
  api_duels_won_pct?: number;
  api_saves_per90?: number;
  api_blocks_per90?: number;
  api_team?: string;
  api_league?: string;
  api_league_country?: string;
  api_photo?: string;
  api_season?: number;
}

/* ------------------------------------------------------------------ */
/*  Position classification                                           */
/* ------------------------------------------------------------------ */

type PosGroup = 'GK' | 'DEF' | 'FB' | 'MID' | 'ATT_MID' | 'WING' | 'FWD';

function classifyPosition(position: string): PosGroup {
  if (!position) return 'FWD';
  const p = position.toLowerCase();
  if (p.includes('goalkeeper') || p.includes('gk')) return 'GK';
  if (p.includes('left-back') || p.includes('right-back') || p.includes('wing-back') || p.includes('lb') || p.includes('rb') || p.includes('wb')) return 'FB';
  if (p.includes('centre-back') || p.includes('center-back') || p.includes('cb')) return 'DEF';
  if (p.includes('left wing') || p.includes('right wing') || p.includes('lw') || p.includes('rw')) return 'WING';
  if (p.includes('attacking mid') || p.includes('am')) return 'ATT_MID';
  if (p.includes('midfield') || p.includes('dm') || p.includes('cm')) return 'MID';
  if (p.includes('forward') || p.includes('striker') || p.includes('cf') || p.includes('ss')) return 'FWD';
  if (p.includes('attack')) return 'FWD';
  if (p.includes('defend')) return 'DEF';
  return 'FWD';
}

/* ------------------------------------------------------------------ */
/*  Stat definitions — position-specific                              */
/* ------------------------------------------------------------------ */

interface StatDef {
  key: string;
  label: string;
  labelHe: string;
  format: 'number' | 'decimal' | 'pct' | 'rating';
  /** For bar width: approximate max for the position group */
  max: number;
  /** Highlight color tier thresholds [good, great, elite] */
  thresholds: [number, number, number];
  icon: string;
}

const CORE_STATS: Record<PosGroup, StatDef[]> = {
  GK: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_saves_per90', label: 'Saves / 90', labelHe: 'הצלות / 90', format: 'decimal', max: 5, thresholds: [2.0, 3.0, 4.0], icon: '🧤' },
    { key: 'api_conceded', label: 'Goals Conceded', labelHe: 'שערים שספג', format: 'number', max: 40, thresholds: [25, 15, 8], icon: '🥅' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', max: 100, thresholds: [55, 65, 75], icon: '🎯' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% מאבקים מוצלחים', format: 'pct', max: 100, thresholds: [40, 55, 70], icon: '💪' },
    { key: 'api_blocks_per90', label: 'Blocks / 90', labelHe: 'חסימות / 90', format: 'decimal', max: 3, thresholds: [0.3, 0.6, 1.0], icon: '🛡️' },
  ],
  DEF: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', format: 'decimal', max: 8, thresholds: [2.5, 4.0, 5.5], icon: '🛡️' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% מאבקים מוצלחים', format: 'pct', max: 100, thresholds: [55, 65, 75], icon: '💪' },
    { key: 'api_blocks_per90', label: 'Blocks / 90', labelHe: 'חסימות / 90', format: 'decimal', max: 3, thresholds: [0.5, 1.0, 1.5], icon: '🧱' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', max: 100, thresholds: [70, 80, 88], icon: '🎯' },
    { key: 'api_fouls_per90', label: 'Fouls / 90', labelHe: 'עבירות / 90', format: 'decimal', max: 3, thresholds: [2.0, 1.5, 0.8], icon: '⚠️' },
  ],
  FB: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', format: 'decimal', max: 6, thresholds: [2.0, 3.0, 4.5], icon: '🛡️' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 3, thresholds: [0.5, 1.0, 1.8], icon: '🔑' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', max: 3, thresholds: [0.5, 1.0, 1.5], icon: '⚡' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 0.6, thresholds: [0.1, 0.2, 0.35], icon: '⚽' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% מאבקים מוצלחים', format: 'pct', max: 100, thresholds: [50, 55, 65], icon: '💪' },
  ],
  MID: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 3, thresholds: [0.8, 1.5, 2.5], icon: '🔑' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', max: 100, thresholds: [72, 82, 90], icon: '🎯' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', format: 'decimal', max: 6, thresholds: [1.5, 3.0, 4.5], icon: '🛡️' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 0.8, thresholds: [0.15, 0.3, 0.5], icon: '⚽' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% מאבקים מוצלחים', format: 'pct', max: 100, thresholds: [48, 55, 65], icon: '💪' },
  ],
  ATT_MID: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 1.2, thresholds: [0.3, 0.5, 0.8], icon: '⚽' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 4, thresholds: [1.0, 2.0, 3.0], icon: '🔑' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', max: 4, thresholds: [0.8, 1.5, 2.5], icon: '⚡' },
    { key: 'api_shots_per90', label: 'Shots / 90', labelHe: 'בעיטות / 90', format: 'decimal', max: 4, thresholds: [1.0, 2.0, 3.0], icon: '🎯' },
    { key: 'api_fouled_per90', label: 'Fouled / 90', labelHe: 'עבירות שספג / 90', format: 'decimal', max: 4, thresholds: [1.0, 1.8, 2.5], icon: '⚡' },
  ],
  WING: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 1.2, thresholds: [0.25, 0.45, 0.7], icon: '⚽' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', max: 4, thresholds: [0.8, 1.5, 2.5], icon: '⚡' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 3, thresholds: [0.8, 1.5, 2.5], icon: '🔑' },
    { key: 'api_shots_on_target_per90', label: 'Shots on Target / 90', labelHe: 'בעיטות למסגרת / 90', format: 'decimal', max: 2.5, thresholds: [0.5, 1.0, 1.5], icon: '🎯' },
    { key: 'api_fouled_per90', label: 'Fouled / 90', labelHe: 'עבירות שספג / 90', format: 'decimal', max: 4, thresholds: [1.0, 2.0, 3.0], icon: '⚡' },
  ],
  FWD: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_goals_per90', label: 'Goals / 90', labelHe: 'שערים / 90', format: 'decimal', max: 1.0, thresholds: [0.25, 0.45, 0.7], icon: '⚽' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 1.5, thresholds: [0.35, 0.6, 0.9], icon: '🔥' },
    { key: 'api_shots_on_target_per90', label: 'Shots on Target / 90', labelHe: 'בעיטות למסגרת / 90', format: 'decimal', max: 3, thresholds: [0.8, 1.2, 2.0], icon: '🎯' },
    { key: 'api_goals_per_shot', label: 'Conversion Rate', labelHe: 'אחוז המרה', format: 'pct', max: 1, thresholds: [0.1, 0.2, 0.35], icon: '💎' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% מאבקים מוצלחים', format: 'pct', max: 100, thresholds: [40, 50, 60], icon: '💪' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Format helpers                                                    */
/* ------------------------------------------------------------------ */

function formatStat(value: number | undefined | null, format: string): string {
  if (value == null || value === 0) return '—';
  switch (format) {
    case 'rating': return value.toFixed(2);
    case 'decimal': return value.toFixed(2);
    case 'pct': return value <= 1 ? `${(value * 100).toFixed(0)}%` : `${value.toFixed(0)}%`;
    case 'number': return String(Math.round(value));
    default: return String(value);
  }
}

function barWidth(value: number | undefined, max: number): number {
  if (!value || max <= 0) return 0;
  return Math.min(100, Math.max(3, (value / max) * 100));
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

interface PlayerStatsPanelProps {
  playerUrl?: string;
  playerName?: string;
  playerClub?: string;
  playerPosition?: string;
  isRtl?: boolean;
}

export default function PlayerStatsPanel({
  playerUrl,
  playerName,
  playerClub,
  playerPosition,
}: PlayerStatsPanelProps) {
  const { isRtl } = useLanguage();
  const [data, setData] = useState<PlayerStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerUrl && !playerName) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (playerUrl) params.set('url', playerUrl);
    else if (playerName) params.set('name', playerName);
    if (playerClub) params.set('club', playerClub);

    const endpoint = `/api/scout/player-stats?${params.toString()}`;

    const attemptFetch = (attempt: number) => {
      fetch(endpoint, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(45000),
      })
        .then(async (res) => {
          if (!res.ok) {
            // Retry on 502/503 (Render cold start) — up to 2 attempts
            if ((res.status === 502 || res.status === 503) && attempt < 2) {
              setTimeout(() => attemptFetch(attempt + 1), 2000);
              return;
            }
            if (res.status === 404) {
              setError('not_found');
            } else {
              setError('failed');
            }
            setLoading(false);
            return;
          }
          const json = await res.json();
          if (json.api_matched) {
            setData(json);
          } else {
            setError('not_enriched');
          }
          setLoading(false);
        })
        .catch(() => {
          // Retry on network timeout — up to 2 attempts
          if (attempt < 2) {
            setTimeout(() => attemptFetch(attempt + 1), 2000);
            return;
          }
          setError('failed');
          setLoading(false);
        });
    };

    attemptFetch(1);
  }, [playerUrl, playerName, playerClub]);

  const posGroup = useMemo(() => {
    return classifyPosition(playerPosition || data?.position || '');
  }, [playerPosition, data?.position]);

  const coreStats = useMemo(() => CORE_STATS[posGroup] || CORE_STATS.FWD, [posGroup]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <section className="bp-module">
        <div className="bp-mod-head">
          <h2>{isRtl ? 'סטטיסטיקות עונה' : 'Season stats'}</h2>
        </div>
        <div className="bp-skeleton">
          <div className="bp-statgrid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}><div className="v" style={{ opacity: 0.25 }}>··</div><div className="l" style={{ opacity: 0.4 }}>····</div></div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  /* ── Error / empty states ── */
  if (error || !data) {
    return (
      <section className="bp-module">
        <div className="bp-mod-head">
          <h2>{isRtl ? 'סטטיסטיקות עונה' : 'Season stats'}</h2>
          <span className="act">Transfermarkt</span>
        </div>
        <div className="bp-empty">
          {error === 'not_found'
            ? (isRtl ? 'השחקן לא נמצא במאגר' : 'Player not found in database')
            : error === 'not_enriched'
            ? (isRtl ? 'אין נתוני ביצועים עדיין' : 'No performance data available yet')
            : (isRtl ? 'טעינת הנתונים נכשלה' : 'Failed to load stats')}
        </div>
      </section>
    );
  }

  const rating = data.api_rating;
  const appearances = data.api_appearances ?? 0;
  const minutes = data.api_minutes ?? 0;
  const goals = data.api_goals ?? 0;
  const assists = data.api_assists ?? 0;
  const season = data.api_season ?? 2025;
  const seasonLabel = `${season}/${String(season + 1).slice(-2)}`;

  const INACCURATE_DB_LEAGUES = new Set([
    'Liga Portugal 2', 'A Division Cyprus', 'Veikkausliiga',
    'Premier League Ukraine', 'Parva Liga', 'Nb I Ungarn',
  ]);
  const INACCURATE_API_LEAGUES = new Set([
    'Segunda Liga', '1. Division', 'Veikkausliiga',
    'First League', 'NB I',
  ]);
  const apiLeague = data.api_league || '';
  const dbLeague = data.league || '';
  const apiCountry = (data.api_league_country || '').toLowerCase();
  const isInaccurateLeague =
    INACCURATE_DB_LEAGUES.has(dbLeague) ||
    INACCURATE_API_LEAGUES.has(apiLeague) ||
    (apiLeague === 'Premier League' && apiCountry === 'ukraine');

  return (
    <>
      {/* ── Season stats ── */}
      <section className="bp-module">
        <div className="bp-mod-head">
          <h2>{isRtl ? 'סטטיסטיקות עונה' : 'Season stats'}</h2>
          <span className="act">{(data.api_league || data.league) ?? 'Transfermarkt'} · {seasonLabel}</span>
        </div>

        {isInaccurateLeague && (
          <div className="bp-caution">
            ⚠️ {isRtl
              ? 'הנתונים לליגה זו עשויים להיות לא מדויקים. שערים, בישולים ודקות עלולים לא לשקף את המציאות.'
              : 'Data for this league may be inaccurate. Goals, assists and minutes may not reflect actual figures.'}
          </div>
        )}

        <div className="bp-statgrid">
          <div><div className="v gold">{appearances}</div><div className="l">{isRtl ? 'הופעות' : 'Apps'}</div></div>
          <div><div className="v">{goals}</div><div className="l">{isRtl ? 'שערים' : 'Goals'}</div></div>
          <div><div className="v">{assists}</div><div className="l">{isRtl ? 'בישולים' : 'Assists'}</div></div>
          <div><div className="v">{minutes.toLocaleString()}</div><div className="l">{isRtl ? 'דקות' : 'Minutes'}</div></div>
          <div><div className="v">{data.api_cards_yellow ?? 0}</div><div className="l">{isRtl ? 'צהוב' : 'Yellow'}</div></div>
          <div><div className="v">{data.api_cards_red ?? 0}</div><div className="l">{isRtl ? 'אדום' : 'Red'}</div></div>
          <div><div className="v">{data.api_tackles_per90 != null && data.api_tackles_per90 > 0 ? data.api_tackles_per90.toFixed(1) : '—'}</div><div className="l">{isRtl ? 'תיקולים/90' : 'Tackles/90'}</div></div>
          <div><div className="v gold">{rating != null && rating > 0 ? rating.toFixed(1) : '—'}</div><div className="l">{isRtl ? 'דירוג' : 'Rating'}</div></div>
        </div>
      </section>

      {/* ── Key metrics by position (mock .attr labeled bars) ── */}
      {coreStats.some((s) => s.key !== 'api_rating' && typeof data[s.key as keyof PlayerStatsData] === 'number') && (
        <section className="bp-module">
          <div className="bp-mod-head">
            <h2>{isRtl ? 'מדדי מפתח' : 'Key metrics'}</h2>
            <span className="act">API-Football</span>
          </div>
          {coreStats.map((stat) => {
            if (stat.key === 'api_rating') return null;
            const raw = data[stat.key as keyof PlayerStatsData];
            const val = typeof raw === 'number' ? raw : undefined;
            if (val == null) return null;
            const width = stat.format === 'pct'
              ? (val <= 1 ? val * 100 : val)
              : barWidth(val, stat.max);
            return (
              <div className="bp-attr" key={stat.key}>
                <label>{isRtl ? stat.labelHe : stat.label}</label>
                <div className="bar"><i style={{ width: `${Math.min(100, Math.max(3, width))}%` }} /></div>
                <span className="n">{formatStat(val, stat.format)}</span>
              </div>
            );
          })}
          <SecondaryStats data={data} posGroup={posGroup} isRtl={isRtl} />
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Secondary Stats (expandable)                                      */
/* ------------------------------------------------------------------ */

function SecondaryStats({
  data,
  posGroup,
  isRtl,
}: {
  data: PlayerStatsData;
  posGroup: PosGroup;
  isRtl: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const secondaryDefs: { label: string; labelHe: string; value: string }[] = useMemo(() => {
    const s: { label: string; labelHe: string; value: string }[] = [];

    // Add stats NOT already shown in core
    const coreKeys = new Set((CORE_STATS[posGroup] || []).map((d) => d.key));

    if (!coreKeys.has('api_goals_per90') && data.api_goals_per90)
      s.push({ label: 'Goals / 90', labelHe: 'שערים / 90', value: data.api_goals_per90.toFixed(2) });
    if (!coreKeys.has('api_assists_per90') && data.api_assists_per90)
      s.push({ label: 'Assists / 90', labelHe: 'בישולים / 90', value: data.api_assists_per90.toFixed(2) });
    if (!coreKeys.has('api_goal_contributions_per90') && data.api_goal_contributions_per90)
      s.push({ label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', value: data.api_goal_contributions_per90.toFixed(2) });
    if (!coreKeys.has('api_shots_per90') && data.api_shots_per90)
      s.push({ label: 'Shots / 90', labelHe: 'בעיטות / 90', value: data.api_shots_per90.toFixed(2) });
    if (!coreKeys.has('api_shots_on_target_per90') && data.api_shots_on_target_per90)
      s.push({ label: 'On Target / 90', labelHe: 'למסגרת / 90', value: data.api_shots_on_target_per90.toFixed(2) });
    if (!coreKeys.has('api_goals_per_shot') && data.api_goals_per_shot)
      s.push({ label: 'Conversion', labelHe: 'אחוז המרה', value: `${(data.api_goals_per_shot * 100).toFixed(0)}%` });
    if (!coreKeys.has('api_key_passes_per90') && data.api_key_passes_per90)
      s.push({ label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', value: data.api_key_passes_per90.toFixed(2) });
    if (!coreKeys.has('api_passes_accuracy') && data.api_passes_accuracy)
      s.push({ label: 'Pass Accuracy', labelHe: 'דיוק מסירות', value: `${data.api_passes_accuracy.toFixed(0)}%` });
    if (!coreKeys.has('api_dribbles_success_per90') && data.api_dribbles_success_per90)
      s.push({ label: 'Dribbles / 90', labelHe: 'כדרורים / 90', value: data.api_dribbles_success_per90.toFixed(2) });
    if (!coreKeys.has('api_tackles_interceptions_per90') && data.api_tackles_interceptions_per90)
      s.push({ label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', value: data.api_tackles_interceptions_per90.toFixed(2) });
    if (!coreKeys.has('api_blocks_per90') && data.api_blocks_per90)
      s.push({ label: 'Blocks / 90', labelHe: 'חסימות / 90', value: data.api_blocks_per90.toFixed(2) });
    if (!coreKeys.has('api_duels_won_pct') && data.api_duels_won_pct)
      s.push({ label: 'Duels Won', labelHe: 'מאבקים מוצלחים', value: `${data.api_duels_won_pct.toFixed(0)}%` });
    if (!coreKeys.has('api_fouled_per90') && data.api_fouled_per90)
      s.push({ label: 'Fouled / 90', labelHe: 'עבירות שספג / 90', value: data.api_fouled_per90.toFixed(2) });
    if (!coreKeys.has('api_fouls_per90') && data.api_fouls_per90)
      s.push({ label: 'Fouls / 90', labelHe: 'עבירות / 90', value: data.api_fouls_per90.toFixed(2) });
    if (data.api_cards_yellow)
      s.push({ label: 'Yellow Cards', labelHe: 'כרטיסים צהובים', value: String(data.api_cards_yellow) });
    if (data.api_cards_red)
      s.push({ label: 'Red Cards', labelHe: 'כרטיסים אדומים', value: String(data.api_cards_red) });
    if (data.api_penalty_scored)
      s.push({ label: 'Penalties Scored', labelHe: 'פנדלים שהובקעו', value: String(data.api_penalty_scored) });

    return s;
  }, [data, posGroup]);

  if (secondaryDefs.length === 0) return null;

  return (
    <details className="bp-expand">
      <summary onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}>
        <span>{isRtl ? 'כל הסטטיסטיקות' : 'All statistics'}</span>
        <span className={`chev${expanded ? ' open' : ''}`}>▾</span>
      </summary>
      {expanded && (
        <div className="bp-facts twocol">
          {secondaryDefs.map((s, i) => (
            <div className="row" key={i}>
              <label>{isRtl ? s.labelHe : s.label}</label>
              <span className="v mono">{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
