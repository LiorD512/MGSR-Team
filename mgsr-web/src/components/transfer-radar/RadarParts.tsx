'use client';

import type { Level, Tier, Verification } from '@/lib/transferRadar/client';
import { evKey, levelOf, TIER_DOTS } from '@/lib/transferRadar/model';
import { useRadarT } from '@/lib/transferRadar/i18n';

const PATHS: Record<string, React.ReactNode> = {
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  check: <path d="M5 12l5 5 9-10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  share: <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  chev: <path d="M6 9l6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
};
export function Ico({ name }: { name: keyof typeof PATHS | string }) {
  return <svg className="rx-i" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>;
}

export function Dots({ tier }: { tier: Tier }) {
  const { t } = useRadarT();
  return <span className="rx-dots" title={t('rel_' + tier)}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= TIER_DOTS[tier] ? 'on' : ''} />)}</span>;
}

export function EvBadge({ v }: { v: Verification }) {
  const { t } = useRadarT();
  return <span className={`rx-ev ${evKey(v)}`}>{v === 'CONFIRMED' && <Ico name="check" />}{t('ev_' + v.toLowerCase())}</span>;
}

/** Circular score: arc length = score, grey below 30 (still an early signal), red when the move is confirmed. */
export function Ring({ score, closed }: { score: number; closed: boolean }) {
  const r = 18, c = 2 * Math.PI * r, col = closed ? '#b0392c' : score >= 30 ? '#a47d43' : '#9d988c';
  return (
    <svg className="rx-ring" viewBox="0 0 44 44" role="img" aria-label={`${score}/100`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(22,22,19,.1)" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * Math.max(0, Math.min(100, score))) / 100} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="27" textAnchor="middle" fontSize="15" fontWeight="700" fill="#161613" fontFamily="inherit">{score}</text>
    </svg>
  );
}

/** Horizontal 0-100 meter with the zone borders (30 / 50 / 70 / 85) marked, so a score is visibly "somewhere". */
export function Meter({ score, closed }: { score: number; closed: boolean }) {
  const { t } = useRadarT();
  const pos = Math.max(0, Math.min(100, score));
  return (
    <>
      <div className="rx-meter"><div className="rx-mk" style={{ insetInlineStart: `${pos}%` }} /></div>
      <div className="rx-ticks">{[30, 50, 70, 85].map((n) => <span key={n} style={{ insetInlineStart: `${n}%` }}>{n}</span>)}</div>
      <div className="rx-lvl">{t('lv_' + levelOf(score, closed))}</div>
    </>
  );
}

export const levelShort = (l: Level) => l;
