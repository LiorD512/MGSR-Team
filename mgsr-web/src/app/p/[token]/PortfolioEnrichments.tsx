'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type {
  ShareData,
  PortfolioEnrichment,
  SharedHighlightVideo,
  SeasonStatsData,
  AIScoutScore,
  RadarAttribute,
  SellingPoint,
  ComparisonPlayer,
  TacticalFit,
} from './types';
import { getPositionDisplayName, getCountryDisplayName } from '@/lib/appConfig';

/* ─── Shared props ─── */
interface ThemeProps {
  isWomen: boolean;
  useHebrew: boolean;
}

const accent = (w: boolean) => (w ? 'var(--women-rose)' : '#4DB6AC');
const accentClass = (w: boolean) => (w ? 'text-[var(--women-rose)]' : 'text-mgsr-teal');
const accentBg = (w: boolean) => (w ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal');
const accentBgDim = (w: boolean) => (w ? 'bg-[var(--women-rose)]/12' : 'bg-mgsr-teal/12');
const accentBorder = (w: boolean) =>
  w ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border';
const sectionCard = (w: boolean) =>
  `p-5 sm:p-6 rounded-xl bg-mgsr-card border mb-6 portfolio-section ${accentBorder(w)}`;

/* ─── Hooks ─── */

/** Animate a number from 0 to target when element enters viewport */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          const start = performance.now();
          const step = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { value, ref };
}

/* ═══════════════════════════════════════════════════════
   NEW: TRANSFER TICKER (Sports broadcast-style scrolling stats)
   ═══════════════════════════════════════════════════════ */

export function TransferTicker({
  data,
  enrichment,
  isWomen,
  useHebrew,
}: {
  data: ShareData;
  enrichment: PortfolioEnrichment | null;
} & ThemeProps) {
  const items = useMemo(() => {
    const ticks: string[] = [];
    const p = data.player;
    const name = (useHebrew ? p.fullNameHe || p.fullName : p.fullName || p.fullNameHe) || '—';
    
    if (p.marketValue) ticks.push(`💰 ${name} · ${p.marketValue}`);
    if (p.nationality) ticks.push(`🌍 ${getCountryDisplayName(p.nationality, useHebrew)}`);
    if (p.positions?.length) ticks.push(`⚽ ${p.positions.map(pos => getPositionDisplayName(pos, useHebrew)).join(' / ')}`);
    if (p.contractExpired?.trim() && p.contractExpired !== '-') ticks.push(`📋 ${useHebrew ? 'חוזה' : 'Contract'}: ${p.contractExpired}`);
    
    if (data.mandateInfo?.hasMandate) ticks.push(`✅ ${useHebrew ? 'מנדט פעיל' : 'Active Mandate'}`);
    
    return ticks;
  }, [data, enrichment, useHebrew]);

  if (items.length < 3) return null;

  const doubled = [...items, ...items]; // seamless loop

  return (
    <div className={`overflow-hidden border-y mb-6 ${isWomen ? 'border-[var(--women-rose)]/15 bg-[var(--women-rose)]/[0.02]' : 'border-mgsr-teal/15 bg-mgsr-teal/[0.02]'}`}>
      <div className="ticker-track flex items-center whitespace-nowrap py-2.5">
        {doubled.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-4 px-5">
            <span className="text-sm font-semibold text-mgsr-text">{item}</span>
            <span className={`text-xs ${isWomen ? 'text-[var(--women-rose)]/30' : 'text-mgsr-teal/30'}`}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   NEW: AVAILABILITY BADGE (Live broadcast-style)
   ═══════════════════════════════════════════════════════ */

export function AvailabilityBadge({ isWomen, useHebrew }: ThemeProps) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
      <span className="relative flex h-2.5 w-2.5">
        <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
        {useHebrew ? 'זמין להעברה' : 'Available for Transfer'}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   NEW: DEAL VALUE SIGNAL (Value-for-money thermometer)
   ═══════════════════════════════════════════════════════ */

export function DealValueMeter({
  player,
  enrichment,
  isWomen,
  useHebrew,
}: {
  player: ShareData['player'];
  enrichment: PortfolioEnrichment | null;
} & ThemeProps) {
  // Calculate a value signal from available data
  const signal = useMemo(() => {
    let score = 50; // baseline
    const age = parseInt(player.age || '25') || 25;
    
    // Age bonus: younger = better value
    if (age <= 22) score += 20;
    else if (age <= 25) score += 12;
    else if (age <= 28) score += 5;
    
    // If we have AI score data, use it
    if (enrichment?.aiScore) {
      const valueCat = enrichment.aiScore.categories.find(c => c.name === 'Value Deal');
      if (valueCat) score = valueCat.value;
    }
    
    return Math.min(99, Math.max(10, score));
  }, [player, enrichment]);

  const acColor = accent(isWomen);
  const signalLabel = signal >= 80
    ? (useHebrew ? '🔥 עסקה חמה' : '🔥 Hot Deal')
    : signal >= 60
      ? (useHebrew ? '✅ השקעה טובה' : '✅ Good Value')
      : (useHebrew ? '📊 סביר' : '📊 Fair Value');

  return (
    <div className={`${sectionCard(isWomen)} relative overflow-hidden`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'איתות עסקה' : 'Deal Signal'}
        </h3>
        <span className="text-sm font-bold" style={{ color: acColor }}>{signalLabel}</span>
      </div>
      
      <div className="relative h-3 rounded-full bg-mgsr-border overflow-hidden">
        <div
          className="value-meter-fill h-full rounded-full"
          style={{
            '--meter-pct': `${signal}%`,
            background: `linear-gradient(90deg, ${acColor}80 0%, ${acColor} 100%)`,
            boxShadow: `0 0 12px ${acColor}40`,
          } as React.CSSProperties}
        />
        {/* Tick marks */}
        <div className="absolute inset-0 flex justify-between px-[1px]">
          {[25, 50, 75].map(pct => (
            <div key={pct} className="w-px h-full bg-mgsr-dark/30" style={{ marginLeft: `${pct}%` }} />
          ))}
        </div>
      </div>
      
      <div className="flex justify-between mt-2 text-[10px] text-mgsr-muted uppercase tracking-wider">
        <span>{useHebrew ? 'סביר' : 'Fair'}</span>
        <span>{useHebrew ? 'טוב' : 'Good'}</span>
        <span>{useHebrew ? 'מעולה' : 'Excellent'}</span>
        <span>{useHebrew ? 'חובה' : 'Must-Sign'}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   1. URGENCY BADGES STRIP
   ═══════════════════════════════════════════════════════ */

function deriveUrgencyBadges(data: ShareData): { type: string; label: string; labelHe: string; variant: string }[] {
  const badges: { type: string; label: string; labelHe: string; variant: string }[] = [];

  if (data.player.contractExpired?.trim() && data.player.contractExpired !== '-') {
    badges.push({
      type: 'contract',
      label: `Contract Ends ${data.player.contractExpired}`,
      labelHe: `חוזה מסתיים ${data.player.contractExpired}`,
      variant: 'red',
    });
  }

  if (data.mandateInfo?.hasMandate) {
    badges.push({ type: 'mandate', label: 'Mandate', labelHe: 'מנדט', variant: 'teal' });
  }

  const age = parseInt(data.player.age || '');
  if (age) {
    if (age <= 23) {
      badges.push({
        type: 'age',
        label: `Age ${age} — High Potential`,
        labelHe: `גיל ${age} — פוטנציאל גבוה`,
        variant: 'gold',
      });
    } else if (age <= 27) {
      badges.push({
        type: 'age',
        label: `Age ${age} — Peak Years`,
        labelHe: `גיל ${age} — שנות שיא`,
        variant: 'gold',
      });
    }
  }

  return badges;
}

const chipVariants: Record<string, string> = {
  red: 'bg-red-500/10 border-red-500/25 text-red-400',
  teal: 'bg-mgsr-teal/10 border-mgsr-teal/25 text-mgsr-teal',
  gold: 'bg-amber-400/10 border-amber-400/25 text-amber-400',
  blue: 'bg-blue-400/10 border-blue-400/25 text-blue-400',
  green: 'bg-emerald-400/10 border-emerald-400/25 text-emerald-400',
};

const chipIcons: Record<string, React.ReactNode> = {
  contract: (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
    </svg>
  ),
  mandate: (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
    </svg>
  ),
  age: <span className="text-[10px]">⚡</span>,
};

export function UrgencyBadgesStrip({ data, useHebrew }: { data: ShareData } & Omit<ThemeProps, 'isWomen'>) {
  const badges = useMemo(() => deriveUrgencyBadges(data), [data]);
  if (badges.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
      {badges.map((b, i) => (
        <div
          key={i}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 border transition-all ${chipVariants[b.variant] ?? chipVariants.teal}`}
        >
          {chipIcons[b.type]}
          {useHebrew ? b.labelHe : b.label}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   2. SEASON PERFORMANCE STATS
   ═══════════════════════════════════════════════════════ */

function PerfItem({
  value,
  label,
  pct,
  isWomen,
  highlight,
  numericValue,
}: {
  value: string | number;
  label: string;
  pct: number;
  isWomen: boolean;
  highlight?: boolean;
  numericValue?: number;
}) {
  const counter = useCountUp(numericValue ?? (typeof value === 'number' ? value : 0));
  const displayVal = numericValue != null || typeof value === 'number' ? counter.value : value;
  
  return (
    <div className="text-center" ref={counter.ref}>
      <div
        className={`font-mono text-2xl font-bold leading-none ${highlight ? accentClass(isWomen) : 'text-mgsr-text'}`}
      >
        {displayVal}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-mgsr-muted mt-1.5">{label}</div>
      <div className="w-full h-[3px] bg-mgsr-border rounded-full mt-2 overflow-hidden">
        <div
          className={`h-full rounded-full stat-fill-bar ${accentBg(isWomen)}`}
          style={{ '--fill-pct': `${Math.min(100, Math.max(5, pct))}%` } as React.CSSProperties}
        />
      </div>
    </div>
  );
}

export function SeasonPerformance({
  stats,
  isWomen,
  useHebrew,
}: {
  stats: SeasonStatsData;
} & ThemeProps) {
  const items: { value: string | number; label: string; pct: number; highlight?: boolean }[] = [];

  if (stats.appearances != null)
    items.push({
      value: stats.appearances,
      label: useHebrew ? 'הופעות' : 'Apps',
      pct: Math.min(100, (stats.appearances / 38) * 100),
    });
  if (stats.goals != null)
    items.push({
      value: stats.goals,
      label: useHebrew ? 'שערים' : 'Goals',
      pct: Math.min(100, (stats.goals / 20) * 100),
      highlight: true,
    });
  if (stats.assists != null)
    items.push({
      value: stats.assists,
      label: useHebrew ? 'בישולים' : 'Assists',
      pct: Math.min(100, (stats.assists / 15) * 100),
      highlight: true,
    });
  if (stats.minutes != null)
    items.push({
      value: stats.minutes.toLocaleString(),
      label: useHebrew ? 'דקות' : 'Minutes',
      pct: Math.min(100, (stats.minutes / 3420) * 100),
    });
  if (stats.keyStatValue != null && stats.keyStatLabel)
    items.push({
      value: stats.keyStatValue,
      label: useHebrew ? (stats.keyStatLabelHe || stats.keyStatLabel) : stats.keyStatLabel,
      pct: Math.min(100, (stats.keyStatValue / 5) * 100),
    });

  if (items.length === 0) return null;

  return (
    <div className={`${sectionCard(isWomen)} relative overflow-hidden`}>
      <div
        className={`absolute top-0 inset-x-0 h-[3px] ${accentBg(isWomen)}`}
        style={{ opacity: 0.6 }}
      />
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'ביצועי עונה' : 'Season Performance'}
        </h3>
        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${accentBgDim(isWomen)} ${accentClass(isWomen)}`}>
          {stats.season}
        </span>
      </div>
      <div className={`grid gap-5 ${items.length <= 3 ? 'grid-cols-3' : items.length === 4 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'}`}>
        {items.map((item, i) => (
          <PerfItem key={i} isWomen={isWomen} {...item} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   3. AI SCOUTING SCORE
   ═══════════════════════════════════════════════════════ */

export function AIScoutScoreSection({
  score,
  isWomen,
  useHebrew,
}: {
  score: AIScoutScore;
} & ThemeProps) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - score.overall / 100);
  const acColor = accent(isWomen);

  return (
    <div className={`${sectionCard(isWomen)} relative overflow-hidden`}>
      <div
        className="absolute top-0 right-0 w-48 h-48 opacity-20 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${acColor}40 0%, transparent 70%)`,
        }}
      />
      <div className="flex items-center justify-center gap-2 mb-5">
        <svg className={`w-3.5 h-3.5 ${accentClass(isWomen)}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'ציון סקאוטינג AI' : 'AI Scouting Score'}
        </h3>
      </div>

      {/* Ring with glow */}
      <div className="relative w-[130px] h-[130px] mx-auto mb-5">
        <svg viewBox="0 0 120 120" className="w-full h-full ai-ring-glow" style={{ '--ring-color': acColor, transform: 'rotate(-90deg)' } as React.CSSProperties}>
          <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="5" className="text-mgsr-border" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={acColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-[1500ms] ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-bold" style={{ color: acColor }}>
            {score.overall}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-mgsr-muted mt-0.5">
            {useHebrew ? 'מתוך 100' : 'out of 100'}
          </span>
        </div>
      </div>

      {/* Confidence label */}
      <div className="text-center mb-4">
        <span className={`inline-block text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
          score.overall >= 80 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
          score.overall >= 65 ? `${accentBgDim(isWomen)} ${accentClass(isWomen)} border ${isWomen ? 'border-[var(--women-rose)]/20' : 'border-mgsr-teal/20'}` :
          'bg-amber-400/10 text-amber-400 border border-amber-400/20'
        }`}>
          {score.overall >= 80
            ? (useHebrew ? '🏆 מומלץ בחום' : '🏆 Highly Recommended')
            : score.overall >= 65
              ? (useHebrew ? '✅ מומלץ' : '✅ Recommended')
              : (useHebrew ? '📋 שווה בדיקה' : '📋 Worth Checking')}
        </span>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {score.categories.map((cat, i) => (
          <div
            key={i}
            className={`text-center py-3 px-2 rounded-lg border ${isWomen ? 'bg-[var(--women-rose)]/[0.03] border-[var(--women-rose)]/10' : 'bg-mgsr-teal/[0.03] border-mgsr-teal/10'}`}
          >
            <div className="font-mono text-lg font-bold text-mgsr-text">{cat.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-mgsr-muted mt-1">
              {useHebrew ? cat.nameHe : cat.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   4. PLAYER RADAR CHART
   ═══════════════════════════════════════════════════════ */

function computeRadarPoints(attributes: RadarAttribute[], radius: number, cx: number, cy: number) {
  const n = attributes.length;
  return attributes.map((attr, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (attr.value / 100) * radius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

function computeRingPoints(n: number, radius: number, cx: number, cy: number) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function pointsToString(pts: { x: number; y: number }[]) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

export function PlayerRadarChart({
  attributes,
  isWomen,
  useHebrew,
}: {
  attributes: RadarAttribute[];
} & ThemeProps) {
  if (!attributes || attributes.length < 3) return null;

  const cx = 150,
    cy = 150,
    maxR = 110;
  const n = attributes.length;
  const acColor = accent(isWomen);
  const rings = [0.25, 0.5, 0.75, 1.0];
  const dataPoints = computeRadarPoints(attributes, maxR, cx, cy);

  // Label positions — slightly outside the outer ring
  const labelR = maxR + 28;
  const labelPoints = attributes.map((attr, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x: cx + labelR * Math.cos(angle),
      y: cy + labelR * Math.sin(angle),
      anchor: (Math.abs(Math.cos(angle)) < 0.01 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end') as 'start' | 'middle' | 'end',
      name: useHebrew ? attr.nameHe : attr.name,
    };
  });

  return (
    <div className={`${sectionCard(isWomen)} text-center`}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted mb-4">
        {useHebrew ? 'פרופיל שחקן' : 'Player Profile'}
      </h3>
      <div className="w-[280px] h-[280px] mx-auto relative">
        <svg viewBox="0 0 300 300" className="w-full h-full">
          {/* Background rings */}
          {rings.map((scale) => (
            <polygon
              key={scale}
              points={pointsToString(computeRingPoints(n, maxR * scale, cx, cy))}
              fill="none"
              stroke={acColor}
              strokeWidth="1"
              opacity="0.12"
            />
          ))}
          {/* Axis lines */}
          {computeRingPoints(n, maxR, cx, cy).map((p, i) => (
            <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={acColor} strokeWidth="1" opacity="0.08" />
          ))}
          {/* Data shape with glow */}
          <defs>
            <filter id="radar-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <polygon
            points={pointsToString(dataPoints)}
            fill={`${acColor}22`}
            stroke={acColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
            filter="url(#radar-glow)"
          />
          {/* Data dots with pulse */}
          {dataPoints.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="7" fill={acColor} opacity="0.15">
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" begin={`${i * 0.3}s`} />
                <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" begin={`${i * 0.3}s`} />
              </circle>
              <circle cx={p.x} cy={p.y} r="4" fill={acColor} />
            </g>
          ))}
          {/* Sweep line */}
          <line x1={cx} y1={cy} x2={cx} y2={cy - maxR} stroke={acColor} strokeWidth="1.5" opacity="0.4" className="radar-sweep-line" style={{ transformOrigin: `${cx}px ${cy}px` }} />
          {/* Labels */}
          {labelPoints.map((lp, i) => (
            <text
              key={i}
              x={lp.x}
              y={lp.y}
              textAnchor={lp.anchor}
              fill="#E8EAED"
              fontSize="11"
              fontWeight="600"
              fontFamily="inherit"
              dominantBaseline="central"
            >
              {lp.name}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   4b. MINI FOOTBALL PITCH — Position visualizer
   ═══════════════════════════════════════════════════════ */

/** Map common position abbreviations to (x%, y%) on a vertical pitch */
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
  GK: { x: 50, y: 92 },
  CB: { x: 50, y: 75 }, LCB: { x: 35, y: 75 }, RCB: { x: 65, y: 75 },
  LB: { x: 15, y: 70 }, RB: { x: 85, y: 70 },
  LWB: { x: 12, y: 58 }, RWB: { x: 88, y: 58 },
  CDM: { x: 50, y: 60 }, DM: { x: 50, y: 60 },
  CM: { x: 50, y: 50 }, LCM: { x: 35, y: 50 }, RCM: { x: 65, y: 50 },
  CAM: { x: 50, y: 38 }, AM: { x: 50, y: 38 },
  LM: { x: 15, y: 48 }, RM: { x: 85, y: 48 },
  LW: { x: 18, y: 28 }, RW: { x: 82, y: 28 },
  CF: { x: 50, y: 18 }, ST: { x: 50, y: 15 },
  LF: { x: 35, y: 20 }, RF: { x: 65, y: 20 },
  SS: { x: 50, y: 25 },
};

export function MiniPitchPosition({
  positions,
  isWomen,
  useHebrew,
}: {
  positions: string[];
} & ThemeProps) {
  if (!positions || positions.length === 0) return null;
  const acColor = accent(isWomen);
  const dots = positions
    .map((p) => POSITION_COORDS[p.trim().toUpperCase()])
    .filter(Boolean);
  if (dots.length === 0) return null;

  return (
    <div className={`${sectionCard(isWomen)} flex flex-col items-center`}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted mb-4">
        {useHebrew ? 'מיקום במגרש' : 'Position Map'}
      </h3>
      <div className="relative w-[200px] h-[280px]">
        {/* Pitch SVG */}
        <svg viewBox="0 0 200 280" className="w-full h-full" fill="none">
          {/* Pitch outline */}
          <rect x="4" y="4" width="192" height="272" rx="4" stroke={acColor} strokeWidth="1.5" opacity="0.25" />
          {/* Halfway line */}
          <line x1="4" y1="140" x2="196" y2="140" stroke={acColor} strokeWidth="1" opacity="0.2" />
          {/* Center circle */}
          <circle cx="100" cy="140" r="28" stroke={acColor} strokeWidth="1" opacity="0.2" />
          <circle cx="100" cy="140" r="2" fill={acColor} opacity="0.3" />
          {/* Top penalty box */}
          <rect x="40" y="4" width="120" height="52" stroke={acColor} strokeWidth="1" opacity="0.2" />
          <rect x="65" y="4" width="70" height="22" stroke={acColor} strokeWidth="1" opacity="0.15" />
          {/* Bottom penalty box */}
          <rect x="40" y="224" width="120" height="52" stroke={acColor} strokeWidth="1" opacity="0.2" />
          <rect x="65" y="254" width="70" height="22" stroke={acColor} strokeWidth="1" opacity="0.15" />
          {/* Position dots */}
          {dots.map((d, i) => {
            const cx = d.x * 1.92 + 4; // scale to 200px width
            const cy = d.y * 2.72 + 4; // scale to 280px height
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r="14" fill={acColor} opacity="0.12">
                  <animate attributeName="r" values="14;18;14" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.12;0.04;0.12" dur="2s" repeatCount="indefinite" />
                </circle>
                <circle cx={cx} cy={cy} r="6" fill={acColor} />
                <text
                  x={cx}
                  y={cy - 14}
                  textAnchor="middle"
                  fill={acColor}
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="inherit"
                >
                  {positions[i]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   4c. CONTRACT COUNTDOWN TIMER — Urgency generator
   ═══════════════════════════════════════════════════════ */

export function ContractCountdown({
  contractExpiry,
  isWomen,
  useHebrew,
}: {
  contractExpiry: string; // e.g. "30/06/2026" or "2026"
} & ThemeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiryDate = useMemo(() => {
    if (!contractExpiry) return null;
    // Try DD/MM/YYYY
    const ddmmyyyy = contractExpiry.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (ddmmyyyy) return new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1]);
    // Try YYYY alone — assume June 30
    const yyyy = contractExpiry.match(/(\d{4})/);
    if (yyyy) return new Date(+yyyy[1], 5, 30);
    return null;
  }, [contractExpiry]);

  if (!expiryDate) return null;

  const diff = expiryDate.getTime() - now;
  if (diff <= 0) return null; // already expired — other badges handle this

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const acColor = accent(isWomen);
  const urgencyColor = days < 180 ? '#E53935' : days < 365 ? '#FF9800' : acColor;

  return (
    <div className={`${sectionCard(isWomen)} text-center`}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted mb-4">
        {useHebrew ? 'ספירה לאחור לסיום חוזה' : 'Contract Expiry Countdown'}
      </h3>
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        {[
          { value: days, label: useHebrew ? 'ימים' : 'Days' },
          { value: hours, label: useHebrew ? 'שעות' : 'Hours' },
          { value: minutes, label: useHebrew ? 'דקות' : 'Min' },
          { value: seconds, label: useHebrew ? 'שניות' : 'Sec' },
        ].map((unit, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border flex items-center justify-center bg-mgsr-dark/60"
              style={{ borderColor: `${urgencyColor}30` }}
            >
              <span
                className="font-display text-2xl sm:text-3xl font-bold tabular-nums"
                style={{ color: urgencyColor }}
              >
                {String(unit.value).padStart(2, '0')}
              </span>
            </div>
            <span className="text-[10px] text-mgsr-muted mt-1.5 uppercase tracking-wider">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
      {days < 365 && (
        <p className="text-xs mt-4" style={{ color: urgencyColor }}>
          {useHebrew
            ? days < 180 ? '⚡ חלון הזדמנויות — חוזה מסתיים בקרוב!' : '⏰ פחות משנה לסיום החוזה'
            : days < 180 ? '⚡ Opportunity Window — Contract ending soon!' : '⏰ Less than a year on current deal'}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   5. WHY THIS PLAYER (SELLING POINTS)
   ═══════════════════════════════════════════════════════ */

export function WhyThisPlayerPitch({
  points,
  isWomen,
  useHebrew,
}: {
  points: SellingPoint[];
} & ThemeProps) {
  if (!points || points.length === 0) return null;

  return (
    <div
      className={`p-5 sm:p-6 rounded-xl border mb-6 ${
        isWomen
          ? 'bg-gradient-to-br from-[var(--women-rose)]/[0.04] to-transparent border-[var(--women-rose)]/15'
          : 'bg-gradient-to-br from-mgsr-teal/[0.04] to-transparent border-mgsr-teal/15'
      }`}
    >
      <h3 className={`text-xs font-bold uppercase tracking-widest mb-5 ${accentClass(isWomen)}`}>
        {useHebrew ? 'למה השחקן הזה?' : 'Why This Player?'}
      </h3>
      <div className="flex flex-col gap-4">
        {points.map((pt, i) => (
          <div
            key={i}
            className="selling-point-shimmer flex gap-3.5 items-start p-3 rounded-lg transition-all duration-300 hover:bg-white/[0.03]"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 border shadow-lg ${
                isWomen
                  ? 'bg-[var(--women-rose)]/10 border-[var(--women-rose)]/20 shadow-[var(--women-rose)]/5'
                  : 'bg-mgsr-teal/10 border-mgsr-teal/20 shadow-mgsr-teal/5'
              }`}
            >
              {pt.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-mgsr-text">{useHebrew ? pt.titleHe : pt.title}</div>
              <div className="text-[13px] text-mgsr-muted leading-relaxed mt-0.5">
                {useHebrew ? pt.descriptionHe : pt.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   6. COMPARISON TABLE
   ═══════════════════════════════════════════════════════ */

export function ComparisonSnapshot({
  comparisons,
  isWomen,
  useHebrew,
}: {
  comparisons: ComparisonPlayer[];
} & ThemeProps) {
  if (!comparisons || comparisons.length === 0) return null;
  const keyLabel = useHebrew
    ? (comparisons[0]?.keyStatLabelHe || comparisons[0]?.keyStatLabel || '—')
    : (comparisons[0]?.keyStatLabel || '—');

  return (
    <div className={sectionCard(isWomen)}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted mb-4">
        {useHebrew ? 'השוואה לשחקנים דומים' : 'Similar Player Profiles'}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mgsr-border">
              <th className="text-[10px] uppercase tracking-wider text-mgsr-muted font-semibold py-2 px-3 text-start">
                {useHebrew ? 'שחקן' : 'Player'}
              </th>
              <th className="text-[10px] uppercase tracking-wider text-mgsr-muted font-semibold py-2 px-3 text-center">
                {useHebrew ? 'גיל' : 'Age'}
              </th>
              <th className="text-[10px] uppercase tracking-wider text-mgsr-muted font-semibold py-2 px-3 text-center">
                G+A
              </th>
              <th className="text-[10px] uppercase tracking-wider text-mgsr-muted font-semibold py-2 px-3 text-center">
                {keyLabel}
              </th>
              <th className="text-[10px] uppercase tracking-wider text-mgsr-muted font-semibold py-2 px-3 text-center">
                {useHebrew ? 'שווי' : 'Value'}
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map((c, i) => (
              <tr
                key={i}
                className={`border-b border-mgsr-border/50 last:border-0 ${
                  c.isSubject
                    ? isWomen
                      ? 'bg-[var(--women-rose)]/[0.05]'
                      : 'bg-mgsr-teal/[0.05]'
                    : ''
                }`}
              >
                <td className={`py-2.5 px-3 font-semibold text-start ${c.isSubject ? accentClass(isWomen) : 'text-mgsr-text'}`}>
                  {c.name}
                  {c.isSubject && (
                    <span className={`ms-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${accentBgDim(isWomen)} ${accentClass(isWomen)}`}>
                      {useHebrew ? 'שחקן זה' : 'This Player'}
                    </span>
                  )}
                </td>
                <td className={`py-2.5 px-3 text-center font-semibold ${c.isSubject ? accentClass(isWomen) : 'text-mgsr-text'}`}>
                  {c.age}
                </td>
                <td className={`py-2.5 px-3 text-center font-semibold ${c.isSubject ? accentClass(isWomen) : 'text-mgsr-text'}`}>
                  {c.goalsAndAssists}
                </td>
                <td className={`py-2.5 px-3 text-center font-semibold ${c.isSubject ? accentClass(isWomen) : 'text-mgsr-text'}`}>
                  {c.keyStat}
                </td>
                <td className={`py-2.5 px-3 text-center font-semibold ${c.isSubject ? accentClass(isWomen) : 'text-mgsr-text'}`}>
                  {c.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   7. HIGHLIGHTS GRID (Thumbnails)
   ═══════════════════════════════════════════════════════ */

export function HighlightsGrid({
  highlights,
  isWomen,
  useHebrew,
}: {
  highlights: SharedHighlightVideo[];
} & ThemeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (!highlights || highlights.length === 0) return null;

  return (
    <div className={sectionCard(isWomen)}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted mb-4">
        {useHebrew ? 'היילייטס' : 'Highlights'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {highlights.map((v, i) => {
          const isActive = activeId === v.id;
          const isFeatured = i === 0;

          return (
            <div
              key={v.id}
              className={`rounded-xl overflow-hidden border border-mgsr-border transition-all hover:border-mgsr-muted/30 ${
                isFeatured ? 'sm:col-span-2' : ''
              }`}
            >
              {isActive ? (
                /* Show iframe when activated */
                <div className="aspect-video bg-mgsr-dark">
                  <iframe
                    src={v.embedUrl}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              ) : (
                /* Show thumbnail with play button */
                <button
                  type="button"
                  onClick={() => setActiveId(v.id)}
                  className="relative w-full aspect-video bg-mgsr-dark group cursor-pointer"
                >
                  {v.thumbnailUrl ? (
                    <img
                      src={v.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-mgsr-card flex items-center justify-center">
                      <svg className="w-12 h-12 text-mgsr-muted/30" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-all">
                    <div
                      className={`w-12 h-12 rounded-full bg-white/95 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform ${
                        isFeatured ? 'w-14 h-14' : ''
                      }`}
                    >
                      <svg className="w-5 h-5 text-mgsr-dark ms-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </button>
              )}
              <div className="p-2.5 bg-mgsr-card/50">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${accentClass(isWomen)}`}>
                    {v.source === 'scorebat'
                      ? useHebrew
                        ? 'משחק'
                        : 'Match'
                      : useHebrew
                        ? 'יוטיוב'
                        : 'YouTube'}
                  </span>
                  {v.channelName && <span className="text-xs text-mgsr-muted truncate">{v.channelName}</span>}
                </div>
                <p className="text-sm font-medium text-mgsr-text line-clamp-2">{v.title}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   8. INTEREST HEADER CTA
   ═══════════════════════════════════════════════════════ */

export function InterestHeaderCTA({
  isWomen,
  useHebrew,
  onInterested,
  onSave,
}: {
  onInterested: () => void;
  onSave?: () => void;
} & ThemeProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onInterested}
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all hover:-translate-y-0.5 ${
          isWomen
            ? 'bg-[var(--women-rose)] text-mgsr-dark shadow-[0_4px_24px_rgba(232,160,191,0.3)] hover:shadow-[0_6px_32px_rgba(232,160,191,0.4)]'
            : 'bg-mgsr-teal text-mgsr-dark shadow-[0_4px_24px_rgba(77,182,172,0.3)] hover:shadow-[0_6px_32px_rgba(77,182,172,0.4)]'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {useHebrew ? 'בקשת תנאי עסקה' : 'Request Deal Terms'}
      </button>
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          className="w-9 h-9 rounded-full border border-mgsr-border bg-mgsr-card text-mgsr-muted flex items-center justify-center hover:border-mgsr-muted hover:text-mgsr-text transition-all"
          title={useHebrew ? 'שמור' : 'Save'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   9. STICKY BOTTOM BAR
   ═══════════════════════════════════════════════════════ */

export function StickyBottomBar({
  player,
  isWomen,
  useHebrew,
  onInterested,
  onDownloadPDF,
}: {
  player: { fullName?: string; fullNameHe?: string; profileImage?: string; positions?: string[]; age?: string; marketValue?: string };
  onInterested: () => void;
  onDownloadPDF: () => void;
} & ThemeProps) {
  const displayName = useHebrew
    ? player.fullNameHe || player.fullName || '—'
    : player.fullName || player.fullNameHe || '—';
  const pos = player.positions?.[0] || '';
  const subtitle = [pos, player.age ? (useHebrew ? `גיל ${player.age}` : `Age ${player.age}`) : '', player.marketValue]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl bg-mgsr-dark/90 border-mgsr-border print:hidden">
      <div
        className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3"
        dir={useHebrew ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {player.profileImage && (
            <img src={player.profileImage} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-mgsr-text truncate">{displayName}</div>
            <div className="text-xs text-mgsr-muted truncate">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDownloadPDF}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-mgsr-border text-xs font-semibold text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-muted transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            type="button"
            onClick={onInterested}
            className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
              isWomen
                ? 'bg-[var(--women-rose)] text-mgsr-dark shadow-[0_4px_24px_rgba(232,160,191,0.3)]'
                : 'bg-mgsr-teal text-mgsr-dark shadow-[0_4px_24px_rgba(77,182,172,0.3)]'
            }`}
          >
            ⚡ {useHebrew ? 'קבלו חבילת שחקן מלאה' : 'Get Full Player Package'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   10. ENRICHMENT LOADING SKELETON
   ═══════════════════════════════════════════════════════ */

export function EnrichmentSkeleton({ isWomen }: { isWomen: boolean }) {
  return (
    <div className="space-y-6 mb-6 animate-pulse">
      {/* Score skeleton */}
      <div className={sectionCard(isWomen)}>
        <div className="h-3 w-32 bg-mgsr-border rounded mx-auto mb-5" />
        <div className="w-[120px] h-[120px] rounded-full border-4 border-mgsr-border mx-auto mb-5" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-mgsr-border/30" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   11. HOOK LINE — 3-second pitch at top
   ═══════════════════════════════════════════════════════ */

export function HookLine({
  hookLine,
  hookLineHe,
  isWomen,
  useHebrew,
}: {
  hookLine?: string;
  hookLineHe?: string;
} & ThemeProps) {
  const text = useHebrew ? (hookLineHe || hookLine) : (hookLine || hookLineHe);
  if (!text) return null;
  return (
    <p className={`text-lg sm:text-xl font-semibold leading-snug mt-4 ${isWomen ? 'text-[var(--women-rose)]/90' : 'text-mgsr-teal/90'}`}>
      {text}
    </p>
  );
}

/* ═══════════════════════════════════════════════════════
   12. CLUB SUMMARY — "Why Clubs Like Him"
   ═══════════════════════════════════════════════════════ */

export function ClubSummarySection({
  items,
  itemsHe,
  isWomen,
  useHebrew,
}: {
  items?: string[];
  itemsHe?: string[];
} & ThemeProps) {
  const bullets = useHebrew ? (itemsHe || items) : (items || itemsHe);
  if (!bullets?.length) return null;
  return (
    <div className={sectionCard(isWomen)}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">⭐</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'למה מועדונים אוהבים אותו' : 'Why Clubs Like Him'}
        </h3>
      </div>
      <ul className="space-y-2.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${accentBg(isWomen)}`} />
            <span className="text-mgsr-text text-sm leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>
      {/* Ideal-for line */}
      <div className={`mt-4 pt-3 border-t border-dashed ${isWomen ? 'border-[var(--women-rose)]/15' : 'border-mgsr-border/50'}`}>
        <p className="text-xs text-mgsr-muted italic">
          {useHebrew
            ? '📌 אידיאלי למועדונים שמחפשים שחקן שיכול להשפיע מיידית.'
            : '📌 Ideal for clubs looking for a player who can make an immediate impact.'}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   13. KEY TRAITS — scannable checkmark grid
   ═══════════════════════════════════════════════════════ */

export function KeyTraitsGrid({
  traits,
  traitsHe,
  isWomen,
  useHebrew,
}: {
  traits?: string[];
  traitsHe?: string[];
} & ThemeProps) {
  const items = useHebrew ? (traitsHe || traits) : (traits || traitsHe);
  if (!items?.length) return null;
  return (
    <div className={sectionCard(isWomen)}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📊</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'מאפיינים מרכזיים' : 'Key Performance Traits'}
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((trait, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border ${
              isWomen
                ? 'border-[var(--women-rose)]/15 bg-[var(--women-rose)]/[0.04]'
                : 'border-mgsr-teal/15 bg-mgsr-teal/[0.04]'
            }`}
          >
            <svg className={`w-4 h-4 shrink-0 ${accentClass(isWomen)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium text-mgsr-text">{trait}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   14. TACTICAL FIT — systems, role, description
   ═══════════════════════════════════════════════════════ */

export function TacticalFitSection({
  fit,
  isWomen,
  useHebrew,
}: {
  fit?: TacticalFit;
} & ThemeProps) {
  if (!fit) return null;
  const role = useHebrew ? (fit.roleHe || fit.role) : (fit.role || fit.roleHe);
  const desc = useHebrew ? (fit.descriptionHe || fit.description) : (fit.description || fit.descriptionHe);
  return (
    <div className={sectionCard(isWomen)}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🎯</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'התאמה טקטית' : 'Tactical Fit'}
        </h3>
      </div>
      {/* Formation badges */}
      {fit.systems?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs text-mgsr-muted font-medium">{useHebrew ? 'מערכים:' : 'Systems:'}</span>
          {fit.systems.map((sys, i) => (
            <span
              key={i}
              className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${
                isWomen
                  ? 'bg-[var(--women-rose)]/15 text-[var(--women-rose)]'
                  : 'bg-mgsr-teal/15 text-mgsr-teal'
              }`}
            >
              {sys}
            </span>
          ))}
        </div>
      )}
      {/* Role */}
      {role && (
        <div className="mb-3">
          <span className="text-xs text-mgsr-muted font-medium">{useHebrew ? 'תפקיד:' : 'Role:'} </span>
          <span className={`text-sm font-semibold ${accentClass(isWomen)}`}>{role}</span>
        </div>
      )}
      {/* Description */}
      {desc && (
        <p className="text-sm text-mgsr-text/80 leading-relaxed">{desc}</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   15. AVAILABILITY / TRANSFER — deal terms block
   ═══════════════════════════════════════════════════════ */

export function AvailabilitySection({
  data,
  isWomen,
  useHebrew,
}: {
  data: ShareData;
} & ThemeProps) {
  const hasMandate = data.mandateInfo?.hasMandate;
  return (
    <div className={`p-5 sm:p-6 rounded-xl border mb-6 portfolio-section ${
      isWomen
        ? 'border-[var(--women-rose)]/30 bg-gradient-to-br from-[var(--women-rose)]/[0.06] to-mgsr-card shadow-[0_0_30px_rgba(232,160,191,0.08)]'
        : 'border-mgsr-teal/30 bg-gradient-to-br from-mgsr-teal/[0.06] to-mgsr-card shadow-[0_0_30px_rgba(77,182,172,0.08)]'
    }`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">💰</span>
        <h3 className="text-xs font-bold uppercase tracking-widest text-mgsr-muted">
          {useHebrew ? 'זמינות להעברה' : 'Transfer Availability'}
        </h3>
      </div>
      <div className="space-y-2">
        {hasMandate && (
          <div className="flex items-center gap-2.5">
            <span className={`text-sm ${accentClass(isWomen)}`}>📌</span>
            <span className="text-sm text-mgsr-text font-medium">
              {useHebrew ? 'העברה אפשרית' : 'Transfer possible'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <span className={`text-sm ${accentClass(isWomen)}`}>📌</span>
          <span className="text-sm text-mgsr-text font-medium">
            {useHebrew ? 'מוכן למעבר מיידי' : 'Ready for immediate move'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-sm ${accentClass(isWomen)}`}>📌</span>
          <span className="text-sm text-mgsr-text font-medium">
            {useHebrew ? 'מבנה עסקה גמיש' : 'Flexible deal structure'}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   16. BOTTOM CTA — strong close section
   ═══════════════════════════════════════════════════════ */

export function BottomCTASection({
  playerName,
  isWomen,
  useHebrew,
  onInterested,
}: {
  playerName: string;
} & ThemeProps & { onInterested: () => void }) {
  return (
    <div className={`p-6 sm:p-8 rounded-2xl border-2 mb-8 text-center portfolio-section ${
      isWomen
        ? 'border-[var(--women-rose)]/40 bg-gradient-to-br from-[var(--women-rose)]/[0.08] to-mgsr-card shadow-[0_0_40px_rgba(232,160,191,0.12)]'
        : 'border-mgsr-teal/40 bg-gradient-to-br from-mgsr-teal/[0.08] to-mgsr-card shadow-[0_0_40px_rgba(77,182,172,0.12)]'
    }`}>
      <h3 className="text-xl font-display font-bold text-mgsr-text mb-3">
        {useHebrew
          ? `מעוניינים ב-${playerName}?`
          : `Interested in ${playerName}?`}
      </h3>
      <p className="text-sm text-mgsr-muted mb-5 max-w-md mx-auto">
        {useHebrew
          ? 'לחצו על הכפתור ונשלח לכם את כל הפרטים.'
          : 'Click the button and we\'ll send you all the details.'}
      </p>
      <button
        type="button"
        onClick={onInterested}
        className={`inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-base font-bold transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] ${
          isWomen
            ? 'bg-[var(--women-rose)] text-white hover:bg-[var(--women-rose)]/90 shadow-[var(--women-rose)]/25'
            : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90 shadow-mgsr-teal/25'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {useHebrew ? 'כן — שלחו לי פרטי עסקה מלאים' : 'Yes — Send Me Full Deal Details'}
      </button>
    </div>
  );
}
