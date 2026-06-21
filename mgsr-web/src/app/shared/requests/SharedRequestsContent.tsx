'use client';

import { useState } from 'react';
import type { RequestsPageData, SharedRequest } from './getRequestsData';

const BRIT_LOGO = '/brit_circle_black_gold.svg';
const BG = '#081018';
const CARD = '#111A26';
const PANEL = '#162230';
const GOLD = '#E5CBA5';
const GOLD_DARK = '#916E46';
const TEXT = '#F4F6F8';
const MUTED = '#91A0AE';
const BORDER = '#243445';

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

const POSITION_CATEGORY: Record<string, string> = {
  GK: 'Goalkeeper',
  CB: 'Defence',
  RB: 'Defence',
  LB: 'Defence',
  DM: 'Midfield',
  CM: 'Midfield',
  AM: 'Midfield',
  LM: 'Midfield',
  RM: 'Midfield',
  LW: 'Attack',
  RW: 'Attack',
  CF: 'Attack',
  SS: 'Attack',
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
  if (f === 'left') return 'Left';
  if (f === 'right') return 'Right';
  return f;
}

const PLATFORM_LABELS: Record<string, string> = {
  men: "Men's Football",
  women: "Women's Football",
  youth: 'Youth Football',
};

/* ─── Lock Icon SVG ─── */
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

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

  const pills: { label: string; value: string; accent?: boolean }[] = [];

  if (req.ageDoesntMatter) {
    pills.push({ label: 'Age', value: 'Any age' });
  } else if (req.minAge && req.maxAge) {
    pills.push({ label: 'Age', value: `${req.minAge}–${req.maxAge} yrs` });
  }
  if (req.salaryRange) pills.push({ label: 'Salary', value: formatSalary(req.salaryRange) });
  if (req.transferFee) pills.push({ label: 'Fee', value: formatFee(req.transferFee) });
  if (req.dominateFoot && req.dominateFoot !== 'any')
    pills.push({ label: 'Foot', value: formatFoot(req.dominateFoot) });
  if (req.euOnly) pills.push({ label: '', value: 'EU Passport Required', accent: true });

  return (
    <div
      className="req-card-reveal group relative rounded-2xl p-5 transition-all duration-300 hover:-translate-y-px"
      style={{
        animationDelay: `${delay}s`,
        background: CARD,
        border: `1px solid ${BORDER}`,
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, transparent, ${GOLD}90, transparent)`,
        }}
      />

      {/* Club row */}
      {!hideClubs && req.clubName && (
        <div className="flex items-center gap-3 mb-4">
          {req.clubLogo && !imgError ? (
            <img
              src={req.clubLogo}
              alt=""
              className="w-7 h-7 rounded-lg object-contain shrink-0"
              style={{ background: 'rgba(229,203,165,0.08)' }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
              style={{ background: 'rgba(229,203,165,0.08)' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke={GOLD} strokeWidth="1" opacity="0.35" />
              </svg>
            </div>
          )}
          <span className="font-display text-[15px] font-semibold text-[#F4F6F8] truncate">
            {req.clubName}
          </span>
        </div>
      )}
      {hideClubs && (
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B7B8D]"
            style={{ background: 'rgba(229,203,165,0.06)', border: '1px solid rgba(229,203,165,0.14)' }}
          >
            <LockIcon />
          </div>
          <span className="font-premium text-xs text-[#91A0AE] italic tracking-wide">
            Confidential
          </span>
        </div>
      )}

      {/* Data pills */}
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pills.map((pill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-premium"
              style={
                pill.accent
                  ? {
                      background: 'rgba(229,203,165,0.08)',
                      border: '1px solid rgba(229,203,165,0.2)',
                      color: GOLD,
                    }
                  : {
                      background: PANEL,
                      border: `1px solid ${BORDER}`,
                      color: '#B9C3CC',
                    }
              }
            >
              {pill.label && (
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#6B7B8D] font-semibold">
                  {pill.label}
                </span>
              )}
              <span className="font-medium">{pill.value}</span>
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {req.notes && (
        <div
          className="mt-4 py-2.5 px-4 rounded-xl text-[13px] font-sans text-[#6B7B8D] leading-relaxed italic"
          style={{
            background: 'rgba(229,203,165,0.04)',
            borderLeft: `3px solid ${posColor}50`,
          }}
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
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  if (!data || data.totalCount === 0) {
    return (
      <div
        dir="ltr"
        className="min-h-screen flex items-center justify-center"
        style={{ background: BG }}
      >
        <div className="text-center px-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 overflow-hidden"
            style={{ background: 'rgba(229,203,165,0.08)', border: '1px solid rgba(229,203,165,0.18)' }}
          >
            <img src={BRIT_LOGO} alt="BRIT Sport Group" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#F4F6F8] mb-3">
            No Active Requests
          </h1>
          <p className="text-[#91A0AE] font-premium text-sm tracking-wide">
            There are currently no open recruitment requests.
          </p>
        </div>
      </div>
    );
  }

  const positionOptions = Object.keys(data.groupedByPosition);
  const countryOptions = Array.from(
    new Set(
      data.requests
        .map((req) => req.clubCountry?.trim())
        .filter((country): country is string => !!country),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const filteredGroupedByPosition = Object.fromEntries(
    Object.entries(data.groupedByPosition)
      .filter(([pos]) => selectedPosition === 'all' || pos === selectedPosition)
      .map(([pos, countries]) => {
        const filteredCountries = Object.fromEntries(
          Object.entries(countries).filter(([country]) => selectedCountry === 'all' || country === selectedCountry),
        );
        return [pos, filteredCountries];
      })
      .filter(([, countries]) => Object.keys(countries).length > 0),
  ) as Record<string, Record<string, SharedRequest[]>>;

  const visiblePositionKeys = Object.keys(filteredGroupedByPosition);
  const visibleRequestsCount = Object.values(filteredGroupedByPosition)
    .flatMap((countries) => Object.values(countries))
    .reduce((sum, requests) => sum + requests.length, 0);
  const visibleMarketsCount = new Set(
    Object.values(filteredGroupedByPosition).flatMap((countries) => Object.keys(countries)),
  ).size;

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
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes lineExtend {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes gridPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(30px, -40px) scale(1.1); }
          66%      { transform: translate(-20px, 20px) scale(0.9); }
        }

        .hero-reveal     { animation: heroReveal 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .stats-reveal    { animation: statsReveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .section-reveal  { animation: sectionReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .req-card-reveal { animation: cardSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .line-extend     { animation: lineExtend 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: left; }

        .teal-gradient-text {
          background: linear-gradient(135deg, #E5CBA5, #916E46);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(229,203,165,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(229,203,165,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridPulse 8s ease-in-out infinite;
          pointer-events: none;
        }

        .hero-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          pointer-events: none;
          animation: orbFloat 12s ease-in-out infinite;
        }

        .stat-card-glow {
          background: #111A26;
          border: 1px solid #243445;
          position: relative;
          overflow: hidden;
        }
        .stat-card-glow::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #E5CBA5, transparent);
        }

        .country-flag-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 0 1.5px rgba(255,255,255,0.08);
        }
      `}</style>

      <div
        dir="ltr"
        className="min-h-screen relative overflow-hidden"
        style={{ background: BG }}
      >
        {/* ═══ Grid background (matches landing) ═══ */}
        <div className="grid-bg" />

        {/* ═══ Floating orbs (matches landing) ═══ */}
        <div
          className="hero-orb"
          style={{
            top: '-10%',
            right: '-8%',
            width: 500,
            height: 500,
            background: 'radial-gradient(circle, rgba(229,203,165,0.12), transparent)',
          }}
        />
        <div
          className="hero-orb"
          style={{
            bottom: '20%',
            left: '-5%',
            width: 350,
            height: 350,
            background: 'radial-gradient(circle, rgba(145,110,70,0.08), transparent)',
            animationDelay: '-4s',
          }}
        />

        {/* ═══ HERO SECTION ═══ */}
        <div className="hero-reveal relative z-10">
          <div className="max-w-[820px] mx-auto px-6 sm:px-8 pt-14 sm:pt-20 pb-10">
            {/* Brand mark — matching landing page gradient */}
            <div className="flex items-center gap-3.5 mb-12">
              <div className="relative w-12 h-12 shrink-0 overflow-hidden rounded-full shadow-[0_0_28px_rgba(229,203,165,0.18)]">
                <img src={BRIT_LOGO} alt="BRIT Sport Group" className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="font-display font-bold text-[13px] tracking-[0.22em] text-[#E5CBA5] leading-none">
                  BRIT SPORT GROUP
                </span>
                <span className="font-premium text-[11px] tracking-[0.12em] uppercase text-[#91A0AE] mt-0.5">
                  {PLATFORM_LABELS[platform] || 'Football'}
                </span>
              </div>
            </div>

            {/* Main heading */}
            <h1 className="font-display font-extrabold leading-[1.05] tracking-[-0.03em] select-none">
              <span className="block text-[2.2rem] sm:text-[3rem] md:text-[3.5rem] text-[#E8EAED]">
                Active
              </span>
              <span className="block text-[2.2rem] sm:text-[3rem] md:text-[3.5rem] teal-gradient-text">
                Recruitment Requests
              </span>
            </h1>

            {/* Subtitle */}
            <p className="mt-4 text-base text-[#C0C8D0] font-light max-w-[500px] leading-relaxed">
              Live overview of current player requirements across all markets. Updated in real-time.
            </p>

            {/* Teal separator */}
            <div className="mt-6 mb-5 overflow-hidden">
              <div
                className="h-[2px] line-extend"
                style={{
                  background: 'linear-gradient(90deg, #4DB6AC 0%, rgba(77,182,172,0.3) 60%, transparent 100%)',
                }}
              />
            </div>

            {/* Date line */}
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#4DB6AC' }} />
              <span className="font-premium text-xs tracking-[0.15em] text-[#6B7B8D] uppercase">
                {dateStr}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ STATS STRIP ═══ */}
        <div
          className="stats-reveal max-w-[820px] mx-auto px-6 sm:px-8 pb-14 relative z-10"
          style={{ animationDelay: '0.35s' }}
        >
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[
              { value: visibleRequestsCount, label: 'Visible Requests' },
              { value: visiblePositionKeys.length, label: 'Positions' },
              { value: visibleMarketsCount, label: 'Markets' },
            ].map((stat, i) => (
              <div
                key={i}
                className="stat-card-glow rounded-2xl px-3 py-5 sm:py-6 text-center transition-all duration-300 hover:border-[#2E4358]"
              >
                <div className="text-3xl sm:text-4xl font-display font-extrabold text-[#F4F6F8]">
                  {stat.value}
                </div>
                <div className="text-[10px] sm:text-[11px] font-premium uppercase tracking-[0.15em] text-[#91A0AE] mt-1.5">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="rounded-xl border border-[#243445] bg-[#111A26] px-3 py-2.5 text-sm text-[#C0C8D0]">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-[#91A0AE] mb-1">Position filter</span>
              <select
                value={selectedPosition}
                onChange={(e) => setSelectedPosition(e.target.value)}
                className="w-full bg-transparent text-[#F4F6F8] focus:outline-none"
              >
                <option value="all" className="bg-[#0D141F]">All positions</option>
                {positionOptions.map((pos) => (
                  <option key={pos} value={pos} className="bg-[#0D141F]">
                    {POSITION_NAMES[pos] || pos}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-xl border border-[#243445] bg-[#111A26] px-3 py-2.5 text-sm text-[#C0C8D0]">
              <span className="block text-[10px] uppercase tracking-[0.12em] text-[#91A0AE] mb-1">Country filter</span>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full bg-transparent text-[#F4F6F8] focus:outline-none"
              >
                <option value="all" className="bg-[#0D141F]">All countries</option>
                {countryOptions.map((country) => (
                  <option key={country} value={country} className="bg-[#0D141F]">
                    {country}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* ═══ POSITION SECTIONS ═══ */}
        <div className="max-w-[820px] mx-auto px-6 sm:px-8 pb-24 relative z-10">
          {visiblePositionKeys.length === 0 ? (
            <div className="rounded-2xl border border-[#243445] bg-[#111A26] p-8 text-center text-[#91A0AE]">
              No requests match the selected filters.
            </div>
          ) : (
            <div className="space-y-8">
              {visiblePositionKeys.map((pos, pi) => {
                const countries = filteredGroupedByPosition[pos];
              const count = data.positionCounts[pos] || 0;
              const color = POSITION_COLORS[pos] || '#6B7280';
              const name = POSITION_NAMES[pos] || pos;
              const category = POSITION_CATEGORY[pos] || '';
              const isExpanded = !expandedPositions.has(pos);

              return (
                <div
                  key={pos}
                  className="section-reveal"
                  style={{ animationDelay: `${0.5 + pi * 0.1}s` }}
                >
                  {/* ── Position Header ── */}
                  <button
                    onClick={() => togglePosition(pos)}
                    className="w-full flex items-center gap-4 py-4 group/hdr cursor-pointer border-b"
                    style={{ borderColor: '#253545' }}
                  >
                    {/* Position badge — typographic, no emoji */}
                    <div
                      className="w-[52px] h-[52px] sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover/hdr:scale-105 font-display font-extrabold text-base sm:text-lg"
                      style={{
                        background: 'linear-gradient(135deg, rgba(229,203,165,0.14), rgba(145,110,70,0.08))',
                        border: '1.5px solid rgba(229,203,165,0.22)',
                        color: color,
                      }}
                    >
                      {pos}
                    </div>

                    {/* Name + count + category */}
                    <div className="flex-1 min-w-0 text-left">
                      <h2 className="font-display text-base sm:text-lg font-bold text-[#E8EAED] truncate">
                        {name}
                      </h2>
                      <span className="text-xs font-premium text-[#91A0AE] tracking-wide">
                        {count} {count === 1 ? 'request' : 'requests'} · {category}
                      </span>
                    </div>

                    {/* Expand/collapse indicator */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300"
                      style={{
                        background: 'rgba(229,203,165,0.04)',
                        border: '1px solid rgba(229,203,165,0.08)',
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="text-[#6B7B8D]"
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
                    <div className="mt-5">
                      {Object.entries(countries).map(([country, requests]) => {
                        const flag = requests[0]?.clubCountryFlag;
                        return (
                          <div key={country} className="mb-5 last:mb-2">
                            {/* Country sub-header with circle flag */}
                            <div className="flex items-center gap-3 mb-3 pl-1">
                              {flag && flag.startsWith('http') ? (
                                <img
                                  src={flag}
                                  alt=""
                                  className="country-flag-circle"
                                />
                              ) : flag ? (
                                <span className="text-base leading-none">{flag}</span>
                              ) : null}
                              <span className="text-[13px] font-premium font-medium text-[#C0C8D0] tracking-wide">
                                {country !== 'Other' ? country : 'Various'}
                              </span>
                              <div className="flex-1 h-px ml-1" style={{ background: 'rgba(229,203,165,0.08)' }} />
                              <span
                                className="text-[11px] font-premium tracking-wider"
                                style={{ color: GOLD }}
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
                </div>
              );
              })}
            </div>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div className="relative z-10 border-t" style={{ borderColor: BORDER }}>
          <div className="max-w-[820px] mx-auto px-6 sm:px-8 py-12 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full overflow-hidden shadow-[0_0_20px_rgba(229,203,165,0.12)]">
                <img src={BRIT_LOGO} alt="BRIT Sport Group" className="w-full h-full object-cover" />
              </div>
              <span className="font-display font-bold text-sm tracking-[0.2em] text-[#C0C8D0] select-none">
                BRIT SPORT GROUP
              </span>
            </div>
            <p className="text-[11px] font-premium text-[#91A0AE] tracking-[0.12em] uppercase">
              Professional Football Recruitment
            </p>
            <p className="text-[10px] font-premium text-[#91A0AE]/50 tracking-wide mt-2">
              This document is confidential and intended only for the recipient.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
