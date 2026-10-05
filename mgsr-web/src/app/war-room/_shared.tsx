'use client';

/**
 * Shared helpers + presentational pieces for the War Room screens.
 *
 * The four War Room routes (discovery / agent-network / ai-scout / find-next)
 * all live under /war-room and share this module plus the useWarRoomData hook.
 * Backend/data layer is untouched — these are UI-only utilities.
 */

import Link from 'next/link';
import { extractPlayerIdFromUrl } from '@/lib/api';

export const TM_DEFAULT_IMG =
  'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';

/** Derive a Transfermarkt portrait URL fallback when scout returns no image. */
export function getPlayerImageUrl(
  profileImage: string | undefined,
  _transfermarktUrl: string
): string {
  if (profileImage?.trim()) return profileImage.trim();
  return TM_DEFAULT_IMG;
}

/** True when two Transfermarkt URLs point at the same player id. */
export function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

/** Collapse a verbose Transfermarkt position into a short code (GK/CB/DM/…). */
export function shortenPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const raw = pos.trim();
  const lower = raw.toLowerCase();

  const directMap: Record<string, string> = {
    goalkeeper: 'GK', gk: 'GK',
    'centre-back': 'CB', 'center-back': 'CB', cb: 'CB',
    'right-back': 'RB', rb: 'RB',
    'left-back': 'LB', lb: 'LB',
    'defensive midfield': 'DM', dm: 'DM', cdm: 'DM',
    'central midfield': 'CM', cm: 'CM',
    'attacking midfield': 'AM', am: 'AM',
    'left midfield': 'LM', lm: 'LM',
    'right midfield': 'RM', rm: 'RM',
    'left winger': 'LW', 'left wing': 'LW', lw: 'LW',
    'right winger': 'RW', 'right wing': 'RW', rw: 'RW',
    'centre-forward': 'CF', 'center-forward': 'CF', cf: 'CF',
    'second striker': 'SS', ss: 'SS',
    striker: 'ST', st: 'ST',
  };

  if (directMap[lower]) return directMap[lower];

  const specific = lower.includes(' - ') ? lower.split(' - ').pop()?.trim() || '' : '';
  if (specific && directMap[specific]) return directMap[specific];

  if (lower.includes('goalkeeper') || lower.includes('keeper')) return 'GK';
  if (lower.includes('centre-back') || lower.includes('center-back')) return 'CB';
  if (lower.includes('right-back') || lower.includes('right back')) return 'RB';
  if (lower.includes('left-back') || lower.includes('left back')) return 'LB';
  if (lower.includes('defensive mid')) return 'DM';
  if (lower.includes('attacking mid')) return 'AM';
  if (lower.includes('central mid') || lower.includes('midfield')) return 'CM';
  if (lower.includes('left mid')) return 'LM';
  if (lower.includes('right mid')) return 'RM';
  if (lower.includes('left wing')) return 'LW';
  if (lower.includes('right wing')) return 'RW';
  if (lower.includes('centre-forward') || lower.includes('center-forward') || lower.includes('forward')) return 'CF';
  if (lower.includes('second striker')) return 'SS';
  if (lower.includes('striker')) return 'ST';

  return raw.toUpperCase();
}

export function formatTimeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/* ── Structured explanation parser (AI Scout analysis text) ── */
export interface ExplanationSections {
  stats: string[];
  physical: string[];
  strengths: string[];
  fmAttrs: string[];
  insights: string[];
}

export function parseExplanationSections(text: string): ExplanationSections {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const sec: ExplanationSections = { stats: [], physical: [], strengths: [], fmAttrs: [], insights: [] };

  for (const line of lines) {
    if (/^(Age\s|גיל\s)/i.test(line)) continue;

    if (/^(Strengths:|חוזקות:)/i.test(line)) {
      const content = line.replace(/^(Strengths:|חוזקות:)\s*/i, '');
      sec.strengths = content.split('|').map((s) => s.trim()).filter(Boolean);
      continue;
    }

    if (/^FM:/i.test(line)) {
      const content = line.replace(/^FM:\s*/i, '');
      const cleaned = content.replace(/\(CA\s*\d+\s*[←→➝]\s*PA\s*\d+\s*\)/g, '').trim();
      sec.fmAttrs = cleaned.split('|').map((s) => s.trim()).filter(Boolean);
      continue;
    }

    if (/\w+:\s*[\d.,]+/.test(line) && line.includes('|')) {
      const items = line.split('|').map((s) => s.trim()).filter(Boolean);
      for (const item of items) {
        if (/height|גובה|foot|רגל/i.test(item)) sec.physical.push(item);
        else sec.stats.push(item);
      }
      continue;
    }

    const items = line.split('|').map((s) => s.trim()).filter(Boolean);
    sec.insights.push(...items);
  }

  return sec;
}

/* ── Shared data shapes (mirror the War Room API responses) ── */
export interface DiscoveryCandidate {
  name: string;
  position: string;
  age: string;
  marketValue: string;
  transfermarktUrl: string;
  league?: string;
  club?: string;
  nationality?: string;
  profileImage?: string;
  source: 'request_match' | 'hidden_gem' | 'general';
  sourceLabel: string;
  requestId?: string;
  clubName?: string;
  hiddenGemScore?: number;
  hiddenGemReason?: { he: string; en: string };
  fmPa?: number;
  fmCa?: number;
  fmPotentialGap?: number;
  apiGoals?: string | number;
  apiAssists?: string | number;
  apiGoalsPer90?: number;
  apiAssistsPer90?: number;
  apiMinutes90s?: string | number;
  apiRating?: number;
  sourceAgentId?: string;
  sourceProfileId?: string;
}

export interface WarRoomReport {
  stats?: { strengths?: string[]; weaknesses?: string[]; key_metrics?: string[]; summary?: string };
  market?: { market_position?: string; rationale?: string; comparable_range?: string; contract_leverage?: string; summary?: string };
  tactics?: { best_role?: string; best_system?: string; ligat_haal_fit?: string; club_fit?: string[]; summary?: string };
  synthesis?: {
    executive_summary?: string;
    recommendation?: string;
    recommendation_rationale?: string;
    key_risks?: string[];
    key_opportunities?: string[];
  };
}

export type ReportCache = Record<string, WarRoomReport | { error: string }>;

export interface RosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
  age?: string;
  tmProfile?: string;
  playerPhoneNumber?: string;
}

export interface RosterTeammateMatch {
  player: RosterPlayer;
  matchesPlayedTogether: number;
}

/* ── BRIT masthead shared by every War Room screen ── */
export function WarRoomMasthead({
  kicker,
  titleLead,
  titleAccent,
  sub,
  right,
}: {
  kicker: string;
  titleLead: string;
  titleAccent: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-7">
      <div className="min-w-0">
        <p className="flex items-center gap-2.5 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--mgsr-gold)] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--mgsr-gold)] animate-pulse" />
          {kicker}
        </p>
        <h1 className="font-display font-bold uppercase leading-[0.85] tracking-tight text-mgsr-text text-[clamp(2.6rem,6vw,5rem)]">
          {titleLead} <span className="text-[var(--mgsr-gold)]">{titleAccent}</span>
        </h1>
        {sub && <p className="mt-4 max-w-xl text-sm leading-relaxed text-mgsr-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-col items-start md:items-end gap-3 shrink-0">{right}</div>}
    </header>
  );
}

/* ── BRIT signals strip (big stat tiles) ── */
export function WarRoomSignals({
  items,
}: {
  items: { label: string; value: React.ReactNode; sub?: string; accent?: 'gold' | 'green' | 'default' }[];
}) {
  return (
    <section
      className="grid border-y border-mgsr-border mb-6"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}
    >
      {items.map((s, i) => (
        <div
          key={i}
          className={`min-h-[100px] px-4 py-4 ${i < items.length - 1 ? 'border-e border-mgsr-border' : ''}`}
        >
          <div className="text-[9px] font-mono uppercase tracking-[0.08em] text-mgsr-muted">{s.label}</div>
          <div
            className={`mt-3 font-display font-bold uppercase leading-none text-[clamp(1.8rem,3vw,2.6rem)] ${
              s.accent === 'gold' ? 'text-[var(--mgsr-gold)]' : s.accent === 'green' ? 'text-[var(--mgsr-teal)]' : 'text-mgsr-text'
            }`}
          >
            {s.value}
          </div>
          {s.sub && <div className="mt-2 text-[9px] font-mono text-mgsr-muted">{s.sub}</div>}
        </div>
      ))}
    </section>
  );
}

/* ── Roster teammates ("played with") expander, shared across cards ── */
export function TeammatesPanel({
  tmUrl,
  playerName,
  teammates,
  isLoading,
  isExpanded,
  onToggle,
  t,
  compact = false,
}: {
  tmUrl: string;
  playerName: string;
  teammates: RosterTeammateMatch[] | undefined;
  isLoading: boolean;
  isExpanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
  t: (k: string) => string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'mt-2' : 'mt-3'}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border hover:border-[var(--mgsr-gold)]/40 transition-all text-left rtl:text-right"
      >
        <svg className="w-4 h-4 text-[var(--mgsr-gold)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span className="text-sm text-mgsr-text flex-1">
          {isLoading
            ? t('releases_roster_teammates_loading')
            : teammates != null
              ? t('releases_roster_teammates').replace('{count}', String(teammates.length))
              : t('releases_roster_teammates_tap')}
        </span>
        <svg
          className={`w-4 h-4 text-mgsr-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <div className="py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-[var(--mgsr-gold)]/40 border-t-[var(--mgsr-gold)] rounded-full animate-spin" />
            </div>
          ) : teammates?.length === 0 ? (
            <p className="text-xs text-mgsr-muted py-3 px-3 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/60">
              {t('releases_no_roster_teammates')}
            </p>
          ) : (
            teammates?.map((match) => (
              <div
                key={match.player.id}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/80 hover:border-[var(--mgsr-gold)]/40 hover:bg-mgsr-dark/70 transition-all"
              >
                <Link
                  href={`/players/${match.player.id}?from=/war-room/discovery`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <img
                    src={match.player.profileImage || TM_DEFAULT_IMG}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover bg-mgsr-card ring-1 ring-mgsr-border"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-mgsr-text truncate">{match.player.fullName || 'Unknown'}</p>
                    <p className="text-xs text-mgsr-muted truncate">
                      {match.player.positions?.filter(Boolean).join(', ') || '—'} •{' '}
                      {match.player.age ? t('players_age_display').replace('{age}', match.player.age) : '—'} •{' '}
                      {match.player.marketValue || '—'}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 shrink-0">
                  {match.player.playerPhoneNumber && (
                    <a
                      href={`https://wa.me/${match.player.playerPhoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Hey ${(match.player.fullName || '').split(' ')[0]},\nHope everything is well at your side.\nI need your help with something.\nAny chance you have ${playerName || ''} contact number?\nThank you!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title={`WhatsApp ${match.player.fullName || ''}`}
                      className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/25 transition-colors"
                    >
                      <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </a>
                  )}
                  <span className="text-xs font-medium text-[var(--mgsr-gold)] px-2 py-0.5 rounded-md bg-[var(--mgsr-gold-dim)]">
                    {t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
