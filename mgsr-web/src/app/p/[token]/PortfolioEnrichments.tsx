'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { ShareData, SharedHighlightVideo } from './types';

/* ─── Shared props ─── */
interface ThemeProps {
  isWomen: boolean;
  useHebrew: boolean;
}

const accent = (w: boolean) => (w ? 'var(--women-rose)' : '#4DB6AC');
const accentClass = (w: boolean) => (w ? 'text-[var(--women-rose)]' : 'text-mgsr-teal');
const accentBg = (w: boolean) => (w ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal');
const accentBorder = (w: boolean) =>
  w ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border';
const sectionCard = (w: boolean) =>
  `p-5 sm:p-6 rounded-xl bg-mgsr-card border mb-6 portfolio-section ${accentBorder(w)}`;

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
