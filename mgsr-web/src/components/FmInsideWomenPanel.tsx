'use client';

import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import SimilarPlayersWomenPanel from '@/components/SimilarPlayersWomenPanel';

/* ------------------------------------------------------------------ */
/*  FMInside Women API response shape (compatible with FmIntelligenceData) */
/* ------------------------------------------------------------------ */
interface FmInsideWomenData {
  found: true;
  player_name: string;
  ca: number;
  pa: number;
  potential_gap: number;
  tier: string;
  dimension_scores: Record<string, number>;
  top_attributes: { name: string; value: number }[];
  weak_attributes: { name: string; value: number }[];
  all_attributes: Record<string, number>;
  position_fit: Record<string, number>;
  best_position: { position: string; fit: number };
  foot: { left: number; right: number };
  height_cm: number;
  fminside_url?: string;
  similar_players?: { name: string; club?: string; age?: string; value?: string; fmInsideUrl: string }[];
}

interface FmInsideNoMatch {
  found: false;
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Position coordinates on the pitch (percentage-based)              */
/* ------------------------------------------------------------------ */
const POS_COORDS: Record<string, { x: number; y: number }> = {
  ST: { x: 50, y: 8 },
  LW: { x: 20, y: 18 },
  RW: { x: 80, y: 18 },
  AM: { x: 50, y: 28 },
  LM: { x: 18, y: 38 },
  RM: { x: 82, y: 38 },
  CM: { x: 50, y: 48 },
  DM: { x: 50, y: 60 },
  LB: { x: 18, y: 75 },
  RB: { x: 82, y: 75 },
  CB: { x: 50, y: 78 },
  GK: { x: 50, y: 93 },
};

function tierColor(tier: string): string {
  switch (tier) {
    case 'world_class': return '#FFD700';
    case 'elite': return '#B388FF';
    case 'top_league': return '#42A5F5';
    case 'solid_pro': return '#4DB6AC';
    case 'lower_league': return '#8C999B';
    default: return '#66BB6A';
  }
}

function dimBarColor(value: number): string {
  if (value >= 85) return 'from-yellow-400 to-amber-500';
  if (value >= 75) return 'from-purple-400 to-purple-500';
  if (value >= 65) return 'from-blue-400 to-blue-500';
  if (value >= 55) return 'from-teal-400 to-teal-500';
  return 'from-gray-500 to-gray-600';
}

function dimValueColor(value: number): string {
  if (value >= 85) return 'text-yellow-400';
  if (value >= 75) return 'text-purple-400';
  if (value >= 65) return 'text-blue-400';
  if (value >= 55) return 'text-teal-400';
  return 'text-gray-400';
}

function attrValueColor(value: number): string {
  if (value >= 85) return 'text-yellow-400';
  if (value >= 75) return 'text-green-400';
  if (value >= 65) return 'text-teal-400';
  if (value >= 50) return 'text-mgsr-text';
  if (value >= 40) return 'text-mgsr-muted';
  return 'text-red-400';
}

function fitDotClasses(fit: number): string {
  if (fit >= 85) return 'bg-yellow-400/90 text-gray-900 shadow-[0_0_16px_rgba(255,215,0,0.4)]';
  if (fit >= 72) return 'bg-green-500/85 text-gray-900 shadow-[0_0_12px_rgba(102,187,106,0.3)]';
  if (fit >= 58) return 'bg-blue-500/70 text-white';
  if (fit >= 40) return 'bg-gray-500/40 text-gray-300';
  return 'bg-red-500/30 text-gray-400';
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader (women theme)                                     */
/* ------------------------------------------------------------------ */
function SkeletonLoader({ loadingText }: { loadingText: string }) {
  return (
    <div className="p-5 rounded-xl bg-mgsr-card border border-[var(--women-rose)]/20">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-[var(--women-rose)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-mgsr-muted">{loadingText}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  No match state — redesigned for women's theme                      */
/* ------------------------------------------------------------------ */
function NoMatchState({
  message,
  onPasteUrl,
  playerName,
}: {
  message?: string;
  onPasteUrl?: (url: string) => void;
  playerName?: string;
}) {
  const { t } = useLanguage();
  const [pasteValue, setPasteValue] = useState('');
  const [pasting, setPasting] = useState(false);
  // Map API English messages to translation keys for i18n
  const displayMessage = (() => {
    if (!message) return t('fm_no_match_women');
    if (message.includes('Found a possible match') || message.includes('could not load details')) return t('fm_no_match_load_failed');
    if (message.includes('Failed to fetch')) return t('fm_no_match_error');
    return t('fm_no_match_women');
  })();

  const handlePaste = () => {
    const url = pasteValue.trim();
    if (!url || !onPasteUrl) return;
    if (!url.includes('fminside.net/players/7-fm-26/')) {
      setPasteValue('');
      return;
    }
    setPasting(true);
    onPasteUrl(url.startsWith('http') ? url : `https://${url}`);
    setPasteValue('');
    setPasting(false);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--women-rose)]/25 bg-mgsr-card">
      <div className="h-1 bg-gradient-to-r from-[var(--women-rose)] via-[var(--women-blush)] to-[var(--women-rose)]/60" />
      <div className="relative p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--women-rose)]/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-[var(--women-rose)]/15 flex items-center justify-center mb-4 ring-2 ring-[var(--women-rose)]/20">
            <svg className="w-10 h-10 text-[var(--women-rose)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-mgsr-text mb-1">{t('fm_empty_title_women')}</h3>
          <p className="text-sm text-mgsr-muted max-w-sm mb-6">{displayMessage}</p>
          {onPasteUrl && (
            <div className="w-full max-w-md space-y-3">
              <p className="text-xs text-mgsr-muted font-medium">{t('fm_paste_url_hint')}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  placeholder={t('fm_paste_url_placeholder')}
                  value={pasteValue}
                  onChange={(e) => setPasteValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePaste()}
                  className="flex-1 px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-sm text-mgsr-text placeholder:text-mgsr-muted/70 focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/15"
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={!pasteValue.trim().includes('fminside') || pasting}
                  className="px-5 py-3 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
                >
                  {t('fm_paste_apply')}
                </button>
              </div>
              <a
                href="https://fminside.net/players"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--women-rose)]/80 hover:text-[var(--women-rose)]"
              >
                <span>{t('fm_search_on_site')}</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */
function CaRing({ ca, tier }: { ca: number; tier: string }) {
  const pct = Math.min(ca, 100);
  const color = tierColor(tier);
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative w-[88px] h-[88px] flex items-center justify-center">
      <svg className="absolute inset-0" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="42" fill="none" stroke="#253545" strokeWidth="5" />
        <circle
          cx="48" cy="48" r="42" fill="none"
          stroke={color} strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 48 48)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="font-display font-extrabold text-2xl z-10" style={{ color }}>
        {ca}
      </span>
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-mgsr-muted text-right shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-mgsr-dark rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${dimBarColor(value)} transition-all duration-700 ease-out`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`w-7 text-right text-xs font-bold ${dimValueColor(value)}`}>{value}</span>
    </div>
  );
}

function PositionDot({
  pos,
  fit,
  isBest,
  posLabel,
  fitWord,
}: {
  pos: string;
  fit: number;
  isBest: boolean;
  posLabel: string;
  fitWord: string;
}) {
  const coords = POS_COORDS[pos];
  if (!coords) return null;

  return (
    <div
      className="absolute group"
      style={{
        left: `${coords.x}%`,
        top: `${coords.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className={`
          w-11 h-11 rounded-full flex items-center justify-center
          text-[0.6rem] font-bold uppercase tracking-wider
          transition-transform duration-200 hover:scale-110 cursor-default
          ${fitDotClasses(fit)}
          ${isBest ? 'ring-2 ring-yellow-400/60 ring-offset-1 ring-offset-transparent' : ''}
        `}
      >
        {pos}
      </div>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-mgsr-card border border-mgsr-border rounded-lg px-2.5 py-1.5 text-[0.65rem] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-10 shadow-xl">
        <span className="text-mgsr-text font-medium">{posLabel}</span>
        <span className="text-mgsr-muted"> — </span>
        <span className={`font-bold ${fit >= 72 ? 'text-green-400' : fit >= 58 ? 'text-blue-400' : 'text-mgsr-muted'}`}>
          {fit}% {fitWord}
        </span>
        {isBest && <span className="text-yellow-400 ml-1">★</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

interface FmInsideWomenPanelProps {
  playerName: string;
  positions?: string[];
  nationality?: string;
  age?: string;
  club?: string;
  fmInsideId?: string;
  /** Full FMInside URL for direct lookup when search fails */
  fmInsideUrl?: string;
  /** Callback when FM URL is found via search - save to player for faster future loads */
  onFmUrlFound?: (url: string) => void;
  isRtl?: boolean;
}

export default function FmInsideWomenPanel({
  playerName,
  positions = [],
  nationality,
  age,
  club,
  fmInsideId,
  fmInsideUrl,
  onFmUrlFound,
  isRtl,
}: FmInsideWomenPanelProps) {
  const { t } = useLanguage();
  const [data, setData] = useState<FmInsideWomenData | null>(null);
  const [noMatch, setNoMatch] = useState<FmInsideNoMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'positions'>('overview');

  useEffect(() => {
    if (!playerName?.trim()) {
      setLoading(false);
      setNoMatch({ found: false, message: t('fm_no_match_women') });
      return;
    }
    setLoading(true);
    setData(null);
    setNoMatch(null);
    const params = new URLSearchParams();
    params.set('name', playerName.trim());
    if (positions.length) params.set('positions', positions.join(','));
    if (nationality) params.set('nationality', nationality);
    if (age) params.set('age', age);
    if (club) params.set('club', club);
    if (fmInsideId) params.set('fmInsideId', fmInsideId);
    if (fmInsideUrl) params.set('fmInsideUrl', fmInsideUrl);

    fetch(`/api/fminside/women-player?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.found) {
          setData(json as FmInsideWomenData);
          setNoMatch(null);
          if (onFmUrlFound && json.fminside_url && !fmInsideUrl && !fmInsideId) {
            onFmUrlFound(json.fminside_url);
          }
        } else {
          setNoMatch({ found: false, message: json.message || t('fm_no_match_women') });
          setData(null);
        }
      })
      .catch(() => {
        setNoMatch({ found: false, message: t('fm_no_match_women') });
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [playerName, positions, nationality, age, club, fmInsideId, fmInsideUrl, onFmUrlFound, t]);

  const sortedDimensions = useMemo(() => {
    if (!data?.dimension_scores) return [];
    return Object.entries(data.dimension_scores)
      .filter(([k]) => k !== 'overall')
      .sort(([, a], [, b]) => b - a)
      .map(([key, value]) => ({
        key,
        label: t(`fm_dim_${key}`),
        value: Math.round(value),
      }));
  }, [data, t]);

  const positionEntries = useMemo(() => {
    if (!data?.position_fit) return [];
    return Object.entries(data.position_fit).sort(([, a], [, b]) => b - a);
  }, [data]);

  if (loading) {
    return <SkeletonLoader loadingText={t('fm_loading_women')} />;
  }

  if (noMatch) {
    return (
      <NoMatchState
        message={noMatch.message}
        onPasteUrl={onFmUrlFound}
        playerName={playerName}
      />
    );
  }

  if (!data) return null;

  const tc = tierColor(data.tier);
  const tl = t(`fm_tier_${data.tier}`);

  return (
    <div className="rounded-xl bg-mgsr-card border border-mgsr-border overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="h-1 bg-gradient-to-r from-teal-400 via-blue-400 via-purple-400 to-yellow-400" />

      <div className="flex border-b border-mgsr-border">
        <button
          onClick={() => setActiveView('overview')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeView === 'overview'
              ? 'text-mgsr-teal border-mgsr-teal bg-mgsr-teal/5'
              : 'text-mgsr-muted border-transparent hover:text-mgsr-text'
          }`}
        >
          {t('fm_tab_intelligence')}
        </button>
        <button
          onClick={() => setActiveView('positions')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeView === 'positions'
              ? 'text-mgsr-teal border-mgsr-teal bg-mgsr-teal/5'
              : 'text-mgsr-muted border-transparent hover:text-mgsr-text'
          }`}
        >
          {t('fm_tab_position_fit')}
        </button>
      </div>

      <div className="p-5">
        {activeView === 'overview' ? (
          <div className="space-y-6">
            <div className="flex items-start gap-5">
              <div className="flex flex-col items-center gap-1.5">
                <CaRing ca={data.ca} tier={data.tier} />
                <span className="text-[0.6rem] uppercase tracking-widest text-mgsr-muted">{t('fm_current_ability')}</span>
              </div>
              <div className="flex-1 pt-2 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                    style={{ background: `${tc}20`, color: tc, border: `1px solid ${tc}40` }}
                  >
                    {data.tier === 'world_class' ? '★ ' : ''}{tl}
                  </span>
                  {data.potential_gap > 0 && (
                    <span className="text-xs text-green-400 font-semibold bg-green-400/10 px-2 py-0.5 rounded-full">
                      +{data.potential_gap} {t('fm_potential')}
                    </span>
                  )}
                  {data.potential_gap <= 0 && (
                    <span className="text-xs text-amber-400 font-medium">{t('fm_at_peak')}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-mgsr-muted">
                  <span>{t('fm_pa_label')}:</span>
                  <span className="font-bold text-mgsr-text">{data.pa}</span>
                  {data.foot && (data.foot.left > 0 || data.foot.right > 0) && (
                    <>
                      <span className="mx-1">·</span>
                      <span>
                        {data.foot.left > data.foot.right
                          ? `${t('fm_left_foot')} (${data.foot.left})`
                          : `${t('fm_right_foot')} (${data.foot.right})`}
                      </span>
                    </>
                  )}
                  {data.height_cm > 0 && (
                    <>
                      <span className="mx-1">·</span>
                      <span>{data.height_cm}cm</span>
                    </>
                  )}
                </div>
                {data.best_position && (
                  <div className="text-xs text-mgsr-muted">
                    {t('fm_best_fit')}{' '}
                    <span className="font-semibold text-mgsr-text">
                      {t(`fm_pos_${data.best_position.position}`) || data.best_position.position}
                    </span>
                    <span className="text-mgsr-muted"> ({data.best_position.fit}%)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[0.65rem] uppercase tracking-widest text-mgsr-muted font-semibold">
                {t('fm_ability_dimensions')}
              </h4>
              <div className="space-y-1.5">
                {sortedDimensions.map((dim) => (
                  <DimensionBar key={dim.key} label={dim.label} value={dim.value} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-mgsr-dark rounded-lg p-3">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-mgsr-muted font-semibold mb-2">
                  🔥 {t('fm_top_attributes')}
                </h4>
                <div className="space-y-1">
                  {data.top_attributes.map((attr) => (
                    <div key={attr.name} className="flex justify-between text-xs">
                      <span className="text-mgsr-text">{t(`fm_attr_${attr.name}`) || attr.name}</span>
                      <span className={`font-bold ${attrValueColor(attr.value)}`}>{attr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-mgsr-dark rounded-lg p-3">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-mgsr-muted font-semibold mb-2">
                  ⚠️ {t('fm_weaknesses')}
                </h4>
                <div className="space-y-1">
                  {data.weak_attributes.map((attr) => (
                    <div key={attr.name} className="flex justify-between text-xs">
                      <span className="text-mgsr-muted">{t(`fm_attr_${attr.name}`) || attr.name}</span>
                      <span className={`font-bold ${attrValueColor(attr.value)}`}>{attr.value}</span>
                    </div>
                  ))}
                  {data.weak_attributes.length === 0 && (
                    <p className="text-xs text-mgsr-muted italic">{t('fm_no_weaknesses')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div
              className="relative mx-auto rounded-xl overflow-hidden border-2 border-white/10"
              dir="ltr"
              style={{
                width: '100%',
                maxWidth: '340px',
                aspectRatio: '340 / 480',
                background: 'linear-gradient(180deg, #1a3a2a 0%, #1a3a2a 100%)',
              }}
            >
              <div className="absolute inset-0 opacity-[0.15]">
                <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-white" />
                <div className="absolute top-1/2 left-1/2 w-20 h-20 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute top-0 left-1/4 right-1/4 h-[18%] border border-white border-t-0" />
                <div className="absolute bottom-0 left-1/4 right-1/4 h-[18%] border border-white border-b-0" />
              </div>
              {positionEntries.map(([pos, fit]) => (
                <PositionDot
                  key={pos}
                  pos={pos}
                  fit={fit}
                  isBest={data.best_position?.position === pos}
                  posLabel={t(`fm_pos_${pos}`) || pos}
                  fitWord={t('fm_fit')}
                />
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.65rem] text-mgsr-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/90" /> {t('fm_legend_perfect')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/85" /> {t('fm_legend_great')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500/70" /> {t('fm_legend_decent')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-500/40" /> {t('fm_legend_possible')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/30" /> {t('fm_legend_poor')} (&lt;40%)
              </span>
            </div>

            <div className="space-y-1">
              <h4 className="text-[0.6rem] uppercase tracking-widest text-mgsr-muted font-semibold mb-2">
                {t('fm_position_rankings')}
              </h4>
              {positionEntries.map(([pos, fit]) => (
                <div key={pos} className="flex items-center gap-2 text-xs" dir="ltr">
                  <span className="w-7 font-bold text-mgsr-muted uppercase">{pos}</span>
                  <div className="flex-1 h-2 bg-mgsr-dark rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        fit >= 85
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                          :                         fit >= 72
                            ? 'bg-gradient-to-r from-green-400 to-green-500'
                            : fit >= 58
                              ? 'bg-gradient-to-r from-blue-400 to-blue-500'
                              : fit >= 40
                                ? 'bg-gray-500'
                                : 'bg-red-500/60'
                      }`}
                      style={{ width: `${fit}%` }}
                    />
                  </div>
                  <span
                    className={`w-8 text-right font-bold ${
                      fit >= 85 ? 'text-yellow-400' : fit >= 72 ? 'text-green-400' : fit >= 58 ? 'text-blue-400' : 'text-mgsr-muted'
                    }`}
                  >
                    {fit}%
                  </span>
                  {data.best_position?.position === pos && (
                    <span className="text-yellow-400 text-[0.7rem]">★</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.similar_players && data.similar_players.length > 0 && (
        <div className="px-5 pb-5">
          <SimilarPlayersWomenPanel
            similarPlayers={data.similar_players}
            isRtl={isRtl}
          />
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-mgsr-border text-center">
        <span className="text-[0.6rem] text-mgsr-muted/60">
          {t('fm_footer')} · {data.ca > 0 ? `CA ${data.ca}` : ''}
          {data.pa > 0 ? ` · PA ${data.pa}` : ''}
          {data.fminside_url && (
            <>
              {' · '}
              <a
                href={data.fminside_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mgsr-teal hover:underline"
              >
                FMInside
              </a>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
