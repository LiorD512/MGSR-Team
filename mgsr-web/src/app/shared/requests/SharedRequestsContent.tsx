'use client';

import { useState } from 'react';
import type { RequestsPageData, SharedRequest } from './getRequestsData';

/* ─── Position Metadata ─── */

const POSITION_NAMES: Record<string, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre-Back',
  RB: 'Right-Back',
  LB: 'Left-Back',
  DM: 'Defensive Midfielder',
  CM: 'Central Midfielder',
  AM: 'Attacking Midfielder',
  LM: 'Left Midfielder',
  RM: 'Right Midfielder',
  LW: 'Left Winger',
  RW: 'Right Winger',
  CF: 'Centre-Forward',
  SS: 'Second Striker',
};

const POSITION_COLORS: Record<string, string> = {
  GK: '#F59E0B',
  CB: '#3B82F6',
  RB: '#60A5FA',
  LB: '#60A5FA',
  DM: '#10B981',
  CM: '#22C55E',
  AM: '#34D399',
  LM: '#8B5CF6',
  RM: '#8B5CF6',
  LW: '#EC4899',
  RW: '#EC4899',
  CF: '#EF4444',
  SS: '#F87171',
};

const POSITION_ICONS: Record<string, string> = {
  GK: '🧤',
  CB: '🛡️',
  RB: '🛡️',
  LB: '🛡️',
  DM: '⚙️',
  CM: '⚙️',
  AM: '🎯',
  LM: '⚡',
  RM: '⚡',
  LW: '💨',
  RW: '💨',
  CF: '⚽',
  SS: '⚽',
};

/* ─── Formatters ─── */

function formatSalary(s: string): string {
  const m: Record<string, string> = {
    '>5': '< €5K',
    '6-10': '€6-10K',
    '11-15': '€11-15K',
    '16-20': '€16-20K',
    '20-25': '€20-25K',
    '26-30': '€26-30K',
    '30+': '€30K+',
  };
  return m[s] || s;
}

function formatFee(f: string): string {
  const m: Record<string, string> = {
    'Free/Free loan': 'Free / Loan',
    '<200': '< €200K',
    '300-600': '€300-600K',
    '700-900': '€700-900K',
    '1m+': '€1M+',
  };
  return m[f] || f;
}

function formatFoot(f: string): string {
  if (f === 'left') return 'Left foot';
  if (f === 'right') return 'Right foot';
  return f;
}

const PLATFORM_LABELS: Record<string, string> = {
  men: "Men's Football",
  women: "Women's Football",
  youth: 'Youth Football',
};

/* ─── Sub-components ─── */

function RequestCard({
  req,
  hideClubs,
  posColor,
  delay,
}: {
  req: SharedRequest;
  hideClubs: boolean;
  posColor: string;
  delay: number;
}) {
  const [imgError, setImgError] = useState(false);

  const pills: { icon: string; label: string; accent?: boolean }[] = [];

  if (req.ageDoesntMatter) {
    pills.push({ icon: '📅', label: 'Any age' });
  } else if (req.minAge && req.maxAge) {
    pills.push({ icon: '📅', label: `${req.minAge}–${req.maxAge} yrs` });
  }
  if (req.salaryRange) pills.push({ icon: '💰', label: formatSalary(req.salaryRange) });
  if (req.transferFee) pills.push({ icon: '🏷️', label: formatFee(req.transferFee) });
  if (req.dominateFoot && req.dominateFoot !== 'any')
    pills.push({ icon: '🦶', label: formatFoot(req.dominateFoot) });
  if (req.euOnly) pills.push({ icon: '🇪🇺', label: 'EU Only', accent: true });

  return (
    <div
      className="req-card-reveal group relative rounded-2xl p-5 transition-all duration-500 hover:scale-[1.008]"
      style={{
        animationDelay: `${delay}s`,
        background:
          'linear-gradient(135deg, rgba(17,22,33,0.8) 0%, rgba(12,15,23,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${posColor}08 0%, transparent 70%)`,
        }}
      />

      {/* Club row */}
      {!hideClubs && req.clubName && (
        <div className="flex items-center gap-3 mb-4 relative z-10">
          {req.clubLogo && !imgError && (
            <img
              src={req.clubLogo}
              alt=""
              className="w-7 h-7 rounded-md object-contain shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              onError={() => setImgError(true)}
            />
          )}
          <span className="font-display text-[15px] text-mgsr-text tracking-wide truncate">
            {req.clubName}
          </span>
        </div>
      )}
      {hideClubs && (
        <div className="flex items-center gap-2.5 mb-4 relative z-10">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-[10px]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            🔒
          </div>
          <span className="font-premium text-xs text-mgsr-muted italic tracking-wide">
            Confidential
          </span>
        </div>
      )}

      {/* Data pills */}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-2 relative z-10">
          {pills.map((pill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-premium tracking-wide"
              style={
                pill.accent
                  ? {
                      background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      color: '#60A5FA',
                    }
                  : {
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      color: '#CBD5E1',
                    }
              }
            >
              <span className="opacity-60 text-[11px]">{pill.icon}</span>
              {pill.label}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {req.notes && (
        <div
          className="mt-4 pl-3.5 border-l-2 text-[13px] font-sans text-mgsr-muted/80 leading-relaxed relative z-10"
          style={{ borderColor: `${posColor}50` }}
          dir="ltr"
        >
          {req.notes}
        </div>
      )}
    </div>
  );
}

/* ─── Main Content ─── */

export default function SharedRequestsContent({
  data,
  hideClubs,
  platform,
}: {
  data: RequestsPageData | null;
  hideClubs: boolean;
  platform: string;
}) {
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (!data || data.totalCount === 0) {
    return (
      <div
        dir="ltr"
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #060810 0%, #0C0F17 100%)' }}
      >
        <div className="text-center px-8">
          <div className="text-7xl mb-6 opacity-40">📋</div>
          <h1
            className="font-serif italic text-3xl mb-3"
            style={{ color: '#C9A84C' }}
          >
            No Active Requests
          </h1>
          <p className="text-mgsr-muted font-premium text-sm tracking-wide">
            There are currently no open recruitment requests.
          </p>
        </div>
      </div>
    );
  }

  const positions = Object.keys(data.groupedByPosition);

  // Track cumulative card index for stagger animation
  let globalCardIdx = 0;

  const togglePosition = (pos: string) => {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  return (
    <>
      <style>{`
        @keyframes heroReveal {
          from { opacity: 0; transform: translateY(-24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes statsReveal {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sectionReveal {
          from { opacity: 0; transform: translateY(14px) scale(0.99); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cardSlideIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes lineExtend {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes goldShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.8; }
        }
        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(30px, -20px) scale(1.1); }
          66%      { transform: translate(-20px, 10px) scale(0.95); }
        }

        .hero-reveal     { animation: heroReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .stats-reveal    { animation: statsReveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .section-reveal  { animation: sectionReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .req-card-reveal { animation: cardSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .line-extend     { animation: lineExtend 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: left; }

        .gold-shimmer {
          background: linear-gradient(90deg, #B8943F 0%, #E8D48B 40%, #C9A84C 60%, #E8D48B 80%, #B8943F 100%);
          background-size: 200% auto;
          animation: goldShimmer 4s linear infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .orb-float { animation: floatOrb 15s ease-in-out infinite; }
        .glow-pulse { animation: pulseGlow 3s ease-in-out infinite; }

        .glass-stat {
          background: rgba(17, 22, 33, 0.45);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(201, 168, 76, 0.12);
        }

        /* Noise texture */
        .page-bg::after {
          content: '';
          position: fixed;
          inset: 0;
          opacity: 0.035;
          pointer-events: none;
          z-index: 1;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          background-repeat: repeat;
        }
      `}</style>

      <div
        dir="ltr"
        className="page-bg min-h-screen relative overflow-hidden"
        style={{
          background: 'linear-gradient(170deg, #060810 0%, #0A0D15 30%, #0E1219 60%, #080B12 100%)',
        }}
      >
        {/* ═══ Background decorative orbs ═══ */}
        <div
          className="orb-float glow-pulse absolute pointer-events-none"
          style={{
            top: '-10%',
            right: '-5%',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)',
            zIndex: 0,
          }}
        />
        <div
          className="orb-float absolute pointer-events-none"
          style={{
            bottom: '10%',
            left: '-8%',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(77,182,172,0.04) 0%, transparent 70%)',
            animationDelay: '-5s',
            zIndex: 0,
          }}
        />

        {/* ═══ HERO SECTION ═══ */}
        <div className="hero-reveal relative z-10">
          {/* Subtle diagonal line texture */}
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{
              backgroundImage:
                'repeating-linear-gradient(-45deg, transparent, transparent 50px, rgba(201,168,76,0.4) 50px, rgba(201,168,76,0.4) 51px)',
            }}
          />

          <div className="relative max-w-3xl mx-auto px-6 sm:px-8 pt-14 sm:pt-20 pb-10">
            {/* Brand mark */}
            <div className="flex items-center gap-3.5 mb-12">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg select-none"
                style={{ background: '#C9A84C', color: '#080A11' }}
              >
                M
              </div>
              <div className="flex flex-col">
                <span className="font-premium text-[11px] tracking-[0.35em] uppercase text-mgsr-muted leading-none">
                  MGSR TEAM
                </span>
                <span className="font-premium text-[10px] tracking-[0.2em] uppercase text-mgsr-muted/50 mt-0.5">
                  {PLATFORM_LABELS[platform] || 'Football'}
                </span>
              </div>
            </div>

            {/* Main heading */}
            <h1 className="font-serif italic leading-[0.9] tracking-tight select-none">
              <span
                className="block text-[3.2rem] sm:text-[5rem] md:text-[6.5rem] gold-shimmer"
              >
                Active
              </span>
              <span
                className="block text-[3.2rem] sm:text-[5rem] md:text-[6.5rem] gold-shimmer"
                style={{ animationDelay: '-1s' }}
              >
                Recruitment
              </span>
            </h1>

            {/* Gold separator */}
            <div className="mt-7 mb-5 overflow-hidden">
              <div
                className="h-[2px] line-extend"
                style={{
                  background: 'linear-gradient(90deg, #C9A84C 0%, rgba(201,168,76,0.3) 60%, transparent 100%)',
                }}
              />
            </div>

            {/* Date line */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#C9A84C' }}
              />
              <span className="font-premium text-xs tracking-[0.15em] text-mgsr-muted uppercase">
                {dateStr}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ STATS STRIP ═══ */}
        <div
          className="stats-reveal max-w-3xl mx-auto px-6 sm:px-8 pb-12 relative z-10"
          style={{ animationDelay: '0.35s' }}
        >
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { value: data.totalCount, label: 'Requests' },
              { value: Object.keys(data.positionCounts).length, label: 'Positions' },
              { value: Object.keys(data.countryCounts).length, label: 'Markets' },
            ].map((stat, i) => (
              <div
                key={i}
                className="glass-stat rounded-2xl px-3 py-5 sm:py-6 text-center transition-all duration-300 hover:border-[rgba(201,168,76,0.25)]"
              >
                <div className="text-3xl sm:text-4xl md:text-5xl font-bold gold-shimmer">
                  {stat.value}
                </div>
                <div className="text-[10px] sm:text-[11px] font-premium uppercase tracking-[0.2em] text-mgsr-muted mt-1.5">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ POSITION SECTIONS ═══ */}
        <div className="max-w-3xl mx-auto px-6 sm:px-8 pb-24 relative z-10">
          <div className="space-y-6">
            {positions.map((pos, pi) => {
              const countries = data.groupedByPosition[pos];
              const count = data.positionCounts[pos] || 0;
              const color = POSITION_COLORS[pos] || '#6B7280';
              const name = POSITION_NAMES[pos] || pos;
              const icon = POSITION_ICONS[pos] || '⚽';
              const isExpanded = !expandedPositions.has(pos); // Show all by default, collapse on click

              const sectionCards: { country: string; req: SharedRequest }[] = [];
              Object.entries(countries).forEach(([country, reqs]) => {
                reqs.forEach((r) => sectionCards.push({ country, req: r }));
              });

              return (
                <div
                  key={pos}
                  className="section-reveal"
                  style={{ animationDelay: `${0.5 + pi * 0.1}s` }}
                >
                  {/* ── Position Header ── */}
                  <button
                    onClick={() => togglePosition(pos)}
                    className="w-full flex items-center gap-3 sm:gap-4 py-3 group/hdr cursor-pointer"
                  >
                    {/* Position badge */}
                    <div
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex flex-col items-center justify-center shrink-0 transition-all duration-300 group-hover/hdr:scale-105"
                      style={{
                        background: `${color}12`,
                        border: `1.5px solid ${color}35`,
                        boxShadow: `0 0 20px ${color}10`,
                      }}
                    >
                      <span className="text-base sm:text-lg leading-none">{icon}</span>
                      <span
                        className="text-[10px] font-bold mt-0.5 tracking-wider"
                        style={{ color }}
                      >
                        {pos}
                      </span>
                    </div>

                    {/* Name + count */}
                    <div className="flex-1 min-w-0 text-left">
                      <h2 className="font-display text-base sm:text-lg text-mgsr-text truncate">
                        {name}
                      </h2>
                      <span className="text-xs font-premium text-mgsr-muted/60 tracking-wide">
                        {count} {count === 1 ? 'request' : 'requests'}
                      </span>
                    </div>

                    {/* Expand/collapse indicator */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="text-mgsr-muted"
                      >
                        <path
                          d="M3.5 5.25L7 8.75L10.5 5.25"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </button>

                  {/* ── Content ── */}
                  {isExpanded && (
                    <div className="ml-1 mt-1">
                      {Object.entries(countries).map(([country, requests]) => {
                        const flag = requests[0]?.clubCountryFlag;
                        return (
                          <div key={country} className="mb-5 last:mb-2">
                            {/* Country sub-header */}
                            <div className="flex items-center gap-2.5 mb-3 pl-1">
                              {flag && flag.startsWith('http') ? (
                                <img src={flag} alt="" className="w-5 h-4 object-contain shrink-0" />
                              ) : flag ? (
                                <span className="text-base leading-none">{flag}</span>
                              ) : null}
                              <span className="text-[13px] font-premium text-mgsr-muted tracking-wide">
                                {country !== 'Other' ? country : 'Various'}
                              </span>
                              <div
                                className="flex-1 h-px ml-1"
                                style={{ background: 'rgba(255,255,255,0.04)' }}
                              />
                              <span
                                className="text-[11px] font-premium tracking-wider"
                                style={{ color: `${color}90` }}
                              >
                                {requests.length}
                              </span>
                            </div>

                            {/* Cards */}
                            <div className="space-y-3">
                              {requests.map((req) => {
                                const idx = globalCardIdx++;
                                return (
                                  <RequestCard
                                    key={req.id}
                                    req={req}
                                    hideClubs={hideClubs}
                                    posColor={color}
                                    delay={0.6 + idx * 0.04}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Separator */}
                  {pi < positions.length - 1 && (
                    <div
                      className="mt-5 h-px"
                      style={{
                        background: `linear-gradient(90deg, ${color}20 0%, rgba(255,255,255,0.03) 50%, transparent 100%)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ FOOTER ═══ */}
        <div
          className="relative z-10 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.04)' }}
        >
          <div className="max-w-3xl mx-auto px-6 sm:px-8 py-10 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold select-none"
                style={{ background: '#C9A84C', color: '#080A11' }}
              >
                M
              </div>
              <span className="font-premium text-sm tracking-[0.25em] text-mgsr-text/80 select-none">
                MGSR TEAM
              </span>
            </div>
            <p className="text-[11px] font-premium text-mgsr-muted/50 tracking-[0.15em] uppercase">
              Professional Football Recruitment
            </p>
            <p className="text-[10px] font-premium text-mgsr-muted/30 tracking-wide mt-2">
              This document is confidential and intended only for the recipient.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
