'use client';

import { useEffect, useState, useMemo } from 'react';
import type { FmIntelligenceData } from '@/lib/scoutApi';
import { getFmIntelligence } from '@/lib/scoutApi';
import { useLanguage } from '@/contexts/LanguageContext';

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
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
      <span
        className="font-display font-extrabold text-2xl z-10"
        style={{ color }}
      >
        {ca}
      </span>
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-mgsr-muted text-right shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 h-2.5 bg-mgsr-dark rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${dimBarColor(value)} transition-all duration-700 ease-out`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`w-7 text-right text-xs font-bold ${dimValueColor(value)}`}>
        {value}
      </span>
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
      {/* Tooltip */}
      <div className="
        absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        bg-mgsr-card border border-mgsr-border rounded-lg
        px-2.5 py-1.5 text-[0.65rem] whitespace-nowrap
        opacity-0 group-hover:opacity-100 pointer-events-none
        transition-opacity duration-200 z-10 shadow-xl
      ">
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

interface FmIntelligencePanelProps {
  playerName: string;
  club?: string;
  age?: string;
  isRtl?: boolean;
}

export default function FmIntelligencePanel({ playerName, club, age }: FmIntelligencePanelProps) {
  const { t, isRtl } = useLanguage();
  const [data, setData] = useState<FmIntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'overview' | 'positions'>('overview');

  useEffect(() => {
    if (!playerName) return;
    setLoading(true);
    setError(null);
    getFmIntelligence(playerName, club, age)
      .then((result) => {
        if (result) {
          setData(result);
        } else {
          setError('No FM data available');
        }
      })
      .catch(() => setError('Failed to load FM data'))
      .finally(() => setLoading(false));
  }, [playerName, club, age]);

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
    return (
      <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-mgsr-muted">{t('fm_loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Silently hide if no FM data
  }

  const tc = tierColor(data.tier);
  const tl = t(`fm_tier_${data.tier}`);

  return (
    <div className="rounded-xl bg-mgsr-card border border-mgsr-border overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Gradient top bar */}
      <div className="h-1 bg-gradient-to-r from-teal-400 via-blue-400 via-purple-400 to-yellow-400" />

      {/* Toggle: Overview / Position Fit */}
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
          /* ============ OVERVIEW TAB ============ */
          <div className="space-y-6">
            {/* Hero: CA ring + PA + Tier */}
            <div className="flex items-start gap-5">
              <div className="flex flex-col items-center gap-1.5">
                <CaRing ca={data.ca} tier={data.tier} />
                <span className="text-[0.6rem] uppercase tracking-widest text-mgsr-muted">
                  {t('fm_current_ability')}
                </span>
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
                    <span className="text-xs text-amber-400 font-medium">
                      {t('fm_at_peak')}
                    </span>
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
                      {t(`fm_pos_${data.best_position.position}`)}
                    </span>
                    <span className="text-mgsr-muted"> ({data.best_position.fit}%)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dimension Bars */}
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

            {/* Top + Weak Attributes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-mgsr-dark rounded-lg p-3">
                <h4 className="text-[0.6rem] uppercase tracking-widest text-mgsr-muted font-semibold mb-2">
                  🔥 {t('fm_top_attributes')}
                </h4>
                <div className="space-y-1">
                  {data.top_attributes.map((attr) => (
                    <div key={attr.name} className="flex justify-between text-xs">
                      <span className="text-mgsr-text">{t(`fm_attr_${attr.name}`)}</span>
                      <span className={`font-bold ${attrValueColor(attr.value)}`}>
                        {attr.value}
                      </span>
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
                      <span className="text-mgsr-muted">{t(`fm_attr_${attr.name}`)}</span>
                      <span className={`font-bold ${attrValueColor(attr.value)}`}>
                        {attr.value}
                      </span>
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
          /* ============ POSITION FIT TAB ============ */
          <div className="space-y-5">
            {/* Pitch — always LTR so positions stay correct */}
            <div className="relative mx-auto rounded-xl overflow-hidden border-2 border-white/10"
              dir="ltr"
              style={{
                width: '100%',
                maxWidth: '340px',
                aspectRatio: '340 / 480',
                background: 'linear-gradient(180deg, #1a3a2a 0%, #1a3a2a 100%)',
              }}
            >
              {/* Pitch lines */}
              <div className="absolute inset-0 opacity-[0.15]">
                <div className="absolute top-1/2 left-[10%] right-[10%] h-px bg-white" />
                <div className="absolute top-1/2 left-1/2 w-20 h-20 border border-white rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute top-0 left-1/4 right-1/4 h-[18%] border border-white border-t-0" />
                <div className="absolute bottom-0 left-1/4 right-1/4 h-[18%] border border-white border-b-0" />
              </div>

              {/* Position dots */}
              {positionEntries.map(([pos, fit]) => (
                <PositionDot
                  key={pos}
                  pos={pos}
                  fit={fit}
                  isBest={data.best_position?.position === pos}
                  posLabel={t(`fm_pos_${pos}`)}
                  fitWord={t('fm_fit')}
                />
              ))}
            </div>

            {/* Legend */}
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

            {/* Position list — bars always LTR */}
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
                          : fit >= 72
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
                  <span className={`w-8 text-right font-bold ${
                    fit >= 85 ? 'text-yellow-400' : fit >= 72 ? 'text-green-400' : fit >= 58 ? 'text-blue-400' : 'text-mgsr-muted'
                  }`}>
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

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-mgsr-border text-center">
        <span className="text-[0.6rem] text-mgsr-muted/60">
          {t('fm_footer')} · {data.ca > 0 ? `CA ${data.ca}` : ''}
          {data.pa > 0 ? ` · PA ${data.pa}` : ''}
        </span>
      </div>
    </div>
  );
}
