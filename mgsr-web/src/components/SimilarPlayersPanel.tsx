'use client';

import { useState, useCallback } from 'react';
import { findSimilarPlayers, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist, SHARED_SHORTLIST_DOC_ID } from '@/lib/accounts';
import { getPlayerDetails } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Parsed explanation broken into data-source categories */
interface ParsedExplanation {
  /** Transfermarkt-sourced insights: position, age, build, foot, value */
  profile: string[];
  /** FBref per-90 stat comparisons */
  stats: { label: string; candidateVal: string; targetVal?: string }[];
  /** Football Manager attribute insights */
  fm: string[];
  /** Playing style classification */
  style?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function matchColor(pct: number): string {
  if (pct >= 80) return 'text-yellow-400';
  if (pct >= 65) return 'text-green-400';
  if (pct >= 50) return 'text-teal-400';
  return 'text-mgsr-muted';
}

function matchBgColor(pct: number): string {
  if (pct >= 80) return 'bg-yellow-400';
  if (pct >= 65) return 'bg-green-400';
  if (pct >= 50) return 'bg-teal-400';
  return 'bg-gray-500';
}

function matchRingStroke(pct: number): string {
  if (pct >= 80) return '#FBBF24';
  if (pct >= 65) return '#4ADE80';
  if (pct >= 50) return '#4DB6AC';
  return '#6B7280';
}

function fmTierBadge(tier: string | undefined): { label: string; color: string } | null {
  if (!tier) return null;
  switch (tier) {
    case 'world_class': return { label: '★ World Class', color: '#FFD700' };
    case 'elite': return { label: 'Elite', color: '#B388FF' };
    case 'top_league': return { label: 'Top League', color: '#42A5F5' };
    case 'solid_pro': return { label: 'Solid Pro', color: '#4DB6AC' };
    case 'lower_league': return { label: 'Lower League', color: '#8C999B' };
    case 'prospect': return { label: 'Prospect', color: '#66BB6A' };
    default: return null;
  }
}

/**
 * Parse the server's period-separated explanation string into structured
 * categories based on data source. Each sentence is classified as:
 * - profile: Transfermarkt-sourced (position, age, build, foot, value)
 * - stats: FBref per-90 stats (contains ":" with numeric values and optionally "vs")
 * - fm: Football Manager attributes (contains "FM")
 * - style: Playing style classification
 */
function parseExplanation(raw: string | undefined, playingStyle: string | undefined): ParsedExplanation {
  const result: ParsedExplanation = { profile: [], stats: [], fm: [], style: playingStyle };
  if (!raw) return result;

  // Split on ". " but NOT on decimal points (e.g. "0.45", "1.87")
  const sentences = raw.split(/\.(?!\d)\s*/).filter((s) => s.trim().length > 0);

  for (const sentence of sentences) {
    const s = sentence.trim();

    // FM lines: contain "FM" keyword
    if (/\bFM\b/i.test(s)) {
      result.fm.push(s);
      continue;
    }

    // Stat comparison lines: "Label: 0.45 vs 0.52" or "Label: 0.45"
    // Pattern: "Word/Word: number" or "Hebrew: number"
    const statMatch = s.match(/^(.+?):\s*([\d.]+)\s*(?:vs\s*([\d.]+))?$/);
    if (statMatch) {
      result.stats.push({
        label: statMatch[1].trim(),
        candidateVal: statMatch[2],
        targetVal: statMatch[3] || undefined,
      });
      continue;
    }

    // Style lines (already extracted separately, skip duplication)
    if (/style|סגנון/i.test(s) && playingStyle && s.includes(playingStyle)) {
      continue;
    }

    // Everything else is profile (Transfermarkt: position, age, build, foot, value)
    result.profile.push(s);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Source Badge                                                       */
/* ------------------------------------------------------------------ */

function SourceBadge({ source }: { source: 'transfermarkt' | 'fbref' | 'fm' }) {
  const config = {
    transfermarkt: { label: 'Transfermarkt', color: '#1DA1F2', icon: '⚽' },
    fbref: { label: 'FBref Stats', color: '#66BB6A', icon: '📊' },
    fm: { label: 'FM Data', color: '#B388FF', icon: '🎮' },
  }[source];

  return (
    <span
      className="inline-flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md"
      style={{ color: config.color, background: `${config.color}15`, border: `1px solid ${config.color}25` }}
    >
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Comparison Bar                                                */
/* ------------------------------------------------------------------ */

function StatComparisonRow({ label, candidateVal, targetVal }: { label: string; candidateVal: string; targetVal?: string }) {
  const cVal = parseFloat(candidateVal);
  const tVal = targetVal ? parseFloat(targetVal) : undefined;
  const maxVal = Math.max(cVal, tVal ?? 0, 0.01);
  const cPct = Math.min((cVal / maxVal) * 100, 100);
  const tPct = tVal != null ? Math.min((tVal / maxVal) * 100, 100) : undefined;
  const isHigher = tVal != null ? cVal >= tVal : true;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-mgsr-muted">{label}</span>
        <span dir="ltr" className={`font-bold ${isHigher ? 'text-green-400' : 'text-mgsr-text'}`}>
          {targetVal ? (
            <>{candidateVal} <span className="text-mgsr-muted font-normal">vs</span> {targetVal}</>
          ) : (
            candidateVal
          )}
        </span>
      </div>
      <div className="relative h-1.5 bg-mgsr-card rounded-full overflow-hidden">
        {tPct != null && (
          <div
            className="absolute h-full rounded-full bg-mgsr-muted/30"
            style={{ width: `${tPct}%` }}
          />
        )}
        <div
          className={`absolute h-full rounded-full ${isHigher ? 'bg-green-400/80' : 'bg-teal-400/60'}`}
          style={{ width: `${cPct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Player Card                                                       */
/* ------------------------------------------------------------------ */

function SimilarPlayerCard({
  player,
  isRtl,
  onAddToShortlist,
  isAddingToShortlist,
  shortlistSuccess,
}: {
  player: ScoutPlayerSuggestion;
  isRtl: boolean;
  onAddToShortlist: (player: ScoutPlayerSuggestion) => void;
  isAddingToShortlist: boolean;
  shortlistSuccess: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  const fmBadge = fmTierBadge(player.fmTier);
  const parsed = parseExplanation(player.scoutAnalysis, player.playingStyle);
  const hasStats = parsed.stats.length > 0;
  const hasFm = parsed.fm.length > 0 || player.fmCa != null;
  const hasProfile = parsed.profile.length > 0;

  return (
    <div
      className="rounded-lg bg-mgsr-dark border border-mgsr-border/60 overflow-hidden transition-all duration-200 hover:border-mgsr-teal/40"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-mgsr-teal/5 transition-colors"
      >
        {/* Match % ring */}
        {player.matchPercent != null && (
          <div className="relative shrink-0 w-11 h-11 flex items-center justify-center">
            <svg className="absolute inset-0" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="#253545" strokeWidth="3" />
              <circle
                cx="22" cy="22" r="18" fill="none"
                stroke={matchRingStroke(player.matchPercent)}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - player.matchPercent / 100)}`}
                transform="rotate(-90 22 22)"
              />
            </svg>
            <span className={`text-xs font-bold ${matchColor(player.matchPercent)}`}>
              {player.matchPercent}%
            </span>
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-mgsr-text text-sm truncate">
              {player.name}
            </span>
            {fmBadge && (
              <span
                className="text-[0.7rem] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{ color: fmBadge.color, background: `${fmBadge.color}20`, border: `1px solid ${fmBadge.color}30` }}
              >
                {fmBadge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-mgsr-muted mt-0.5 flex-wrap">
            {player.position && <span>{player.position}</span>}
            {player.age && <><span>·</span><span>{player.age}</span></>}
            {player.club && <><span>·</span><span className="truncate">{player.club}</span></>}
          </div>
          {player.marketValue && (
            <span className="text-xs text-mgsr-teal font-medium">
              {player.marketValue}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-mgsr-muted transition-transform duration-200 shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-mgsr-border/40 pt-3">

          {/* ── Overall match bar ── */}
          {player.matchPercent != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-mgsr-muted uppercase tracking-wider shrink-0">
                {t('similar_players_match')}
              </span>
              <div className="flex-1 h-2 bg-mgsr-card rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${matchBgColor(player.matchPercent)} transition-all duration-500`}
                  style={{ width: `${Math.min(player.matchPercent, 100)}%` }}
                />
              </div>
              <span className={`text-xs font-bold ${matchColor(player.matchPercent)}`}>
                {player.matchPercent}%
              </span>
            </div>
          )}

          {/* ── Playing Style ── */}
          {parsed.style && (
            <div className="flex items-center gap-2 bg-mgsr-card/60 rounded-lg px-3 py-2">
              <span className="text-base">🎯</span>
              <div>
                <span className="text-xs text-mgsr-muted uppercase tracking-wider">{t('similar_players_style')}</span>
                <p className="text-sm text-mgsr-text font-medium">{parsed.style}</p>
              </div>
            </div>
          )}

          {/* ── SECTION 1: Profile Match (Transfermarkt) ── */}
          {hasProfile && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SourceBadge source="transfermarkt" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {parsed.profile.map((item, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 text-xs text-mgsr-text bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1.5"
                  >
                    <span className="text-blue-400">✓</span>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION 2: Performance Stats (FBref) ── */}
          {hasStats && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SourceBadge source="fbref" />
                <span className="text-xs text-mgsr-muted">{t('similar_players_per90')}</span>
              </div>
              <div className="bg-mgsr-card/40 rounded-lg px-3 py-2 space-y-2">
                {parsed.stats.map((stat, i) => (
                  <StatComparisonRow
                    key={i}
                    label={stat.label}
                    candidateVal={stat.candidateVal}
                    targetVal={stat.targetVal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION 3: FM Intelligence ── */}
          {hasFm && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SourceBadge source="fm" />
              </div>
              <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg px-3 py-2 space-y-1.5">
                {/* FM CA / PA row */}
                {(player.fmCa != null || player.fmPa != null) && (
                  <div className="flex items-center gap-3 text-xs">
                    {player.fmCa != null && (
                      <div className="flex items-center gap-1">
                        <span className="text-mgsr-muted text-xs uppercase">CA</span>
                        <span className="font-bold text-mgsr-text text-sm">{player.fmCa}</span>
                      </div>
                    )}
                    {player.fmPa != null && (
                      <div className="flex items-center gap-1">
                        <span className="text-mgsr-muted text-xs uppercase">PA</span>
                        <span className="font-bold text-mgsr-text text-sm">{player.fmPa}</span>
                      </div>
                    )}
                    {player.fmPotentialGap != null && player.fmPotentialGap > 0 && (
                      <span className="text-green-400 font-semibold text-xs bg-green-400/10 px-2 py-0.5 rounded-full">
                        +{player.fmPotentialGap} {t('similar_players_growth')}
                      </span>
                    )}
                  </div>
                )}
                {/* FM explanation lines */}
                {parsed.fm.map((line, i) => (
                  <p key={i} className="text-xs text-purple-300/80 leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ── Player Details Grid ── */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-mgsr-card/30 rounded-lg px-3 py-2.5">
            {player.nationality && (
              <div>
                <span className="text-mgsr-muted">{t('similar_players_nationality')}</span>
                <p className="text-mgsr-text font-medium">
                  {player.nationality.split(/\s{2,}|[,\/\n]+/).filter(n => n.trim()).map((n, i, arr) => (
                    <span key={i}>
                      {n.trim()}
                      {i < arr.length - 1 && <span className="mx-1 text-mgsr-muted">·</span>}
                    </span>
                  ))}
                </p>
              </div>
            )}
            {player.league && (
              <div>
                <span className="text-mgsr-muted">{t('similar_players_league')}</span>
                <p className="text-mgsr-text font-medium">{player.league}</p>
              </div>
            )}
            {player.height && (
              <div>
                <span className="text-mgsr-muted">{t('similar_players_height')}</span>
                <p className="text-mgsr-text font-medium">{player.height}</p>
              </div>
            )}
            {player.foot && (
              <div>
                <span className="text-mgsr-muted">{t('similar_players_foot')}</span>
                <p className="text-mgsr-text font-medium">{player.foot}</p>
              </div>
            )}
            {player.contractEnd && (
              <div>
                <span className="text-mgsr-muted">{t('similar_players_contract')}</span>
                <p className="text-mgsr-text font-medium">{player.contractEnd}</p>
              </div>
            )}
            {player.club && (
              <div>
                <span className="text-mgsr-muted">{t('similar_players_club')}</span>
                <p className="text-mgsr-text font-medium">{player.club}</p>
              </div>
            )}
          </div>

          {/* ── Action buttons ── */}
          <div className="flex items-center gap-2 pt-1">
            {/* Add to Shortlist */}
            {player.transfermarktUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToShortlist(player);
                }}
                disabled={isAddingToShortlist || shortlistSuccess}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  shortlistSuccess
                    ? 'bg-green-500/10 text-green-400 border border-green-500/30 cursor-default'
                    : isAddingToShortlist
                      ? 'bg-mgsr-card text-mgsr-muted border border-mgsr-border cursor-wait'
                      : 'bg-mgsr-teal/10 text-mgsr-teal border border-mgsr-teal/30 hover:bg-mgsr-teal/20'
                }`}
              >
                {shortlistSuccess ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {t('shortlist_added')}
                  </>
                ) : isAddingToShortlist ? (
                  <>
                    <div className="w-3 h-3 border-2 border-mgsr-muted border-t-transparent rounded-full animate-spin" />
                    {t('shortlist_adding')}
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    {t('shortlist_add')}
                  </>
                )}
              </button>
            )}

            {/* View on TM */}
            {player.transfermarktUrl && (
              <a
                href={player.transfermarktUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-mgsr-muted hover:text-mgsr-teal transition-colors px-2 py-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {t('similar_players_view_profile')}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Panel                                                        */
/* ------------------------------------------------------------------ */

interface SimilarPlayersPanelProps {
  playerUrl: string;
  isRtl: boolean;
}

export default function SimilarPlayersPanel({ playerUrl, isRtl }: SimilarPlayersPanelProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [players, setPlayers] = useState<ScoutPlayerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);
  const [shortlistSuccessUrls, setShortlistSuccessUrls] = useState<Set<string>>(new Set());
  const [shortlistError, setShortlistError] = useState<string | null>(null);

  const handleSearch = useCallback(async (excludeNames: string[] = []) => {
    setLoading(true);
    setError(null);
    try {
      const lang = isRtl ? 'he' : 'en';
      const results = await findSimilarPlayers(playerUrl, lang, excludeNames);
      setPlayers((prev) => [...prev, ...results]);
      setHasSearched(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to find similar players';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [playerUrl, isRtl]);

  const handleRefresh = useCallback(() => {
    const currentNames = players.map((p) => p.name);
    handleSearch(currentNames);
  }, [players, handleSearch]);

  const handleAddToShortlist = useCallback(async (player: ScoutPlayerSuggestion) => {
    const url = player.transfermarktUrl;
    if (!user || !url) return;
    setShortlistError(null);
    setAddingToShortlistUrl(url);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const docRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);
      const snap = await getDoc(docRef);
      const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
      const exists = current.some((e) => e.tmProfileUrl === url);
      if (exists) {
        setShortlistSuccessUrls((prev) => new Set(prev).add(url));
        return;
      }
      const agentFields = {
        addedByAgentId: account.id,
        addedByAgentName: account.name ?? null,
        addedByAgentHebrewName: account.hebrewName ?? null,
      };
      let entry: Record<string, unknown>;
      try {
        const details = await getPlayerDetails(url);
        entry = {
          tmProfileUrl: url,
          addedAt: Date.now(),
          playerImage: details.profileImage ?? null,
          playerName: details.fullName ?? null,
          playerPosition: details.positions?.[0] ?? null,
          playerAge: details.age ?? null,
          playerNationality: details.nationality ?? null,
          playerNationalityFlag: details.nationalityFlag ?? null,
          clubJoinedName: details.currentClub?.clubName ?? null,
          marketValue: details.marketValue ?? null,
          ...agentFields,
        };
      } catch {
        entry = {
          tmProfileUrl: url,
          addedAt: Date.now(),
          playerName: player.name ?? null,
          playerPosition: player.position ?? null,
          playerAge: player.age ?? null,
          playerNationality: player.nationality ?? null,
          clubJoinedName: player.club ?? null,
          marketValue: player.marketValue ?? null,
          ...agentFields,
        };
      }
      await setDoc(docRef, { entries: [...current, entry] }, { merge: true });
      await addDoc(collection(db, 'FeedEvents'), {
        type: 'SHORTLIST_ADDED',
        playerName: entry.playerName ?? null,
        playerImage: entry.playerImage ?? null,
        playerTmProfile: url,
        timestamp: Date.now(),
        agentName: account.name ?? null,
      });
      setShortlistSuccessUrls((prev) => new Set(prev).add(url));
    } catch (err) {
      console.error('Add to shortlist error:', err);
      setShortlistError(err instanceof Error ? err.message : 'Failed to add');
    } finally {
      setAddingToShortlistUrl(null);
    }
  }, [user]);

  return (
    <div className="rounded-xl bg-mgsr-card border border-mgsr-border overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Gradient top bar */}
      <div className="h-1 bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-mgsr-border">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-mgsr-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="font-display font-semibold text-mgsr-text">
            {t('similar_players_title')}
          </h3>
          {players.length > 0 && (
            <span className="text-xs text-mgsr-muted bg-mgsr-dark px-2 py-0.5 rounded-full">
              {players.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasSearched && !loading && (
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-lg text-mgsr-muted hover:text-mgsr-teal hover:bg-mgsr-teal/10 transition-colors"
              title={t('similar_players_load_more')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Initial state — Search button */}
        {!hasSearched && !loading && (
          <div className="space-y-3">
            <button
              onClick={() => handleSearch()}
              className="w-full py-3 rounded-lg bg-mgsr-teal/10 border border-mgsr-teal/30 text-mgsr-teal font-medium text-sm hover:bg-mgsr-teal/20 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {t('similar_players_find')}
            </button>
            {/* Data source legend */}
            <div className="flex flex-wrap justify-center gap-2">
              <SourceBadge source="transfermarkt" />
              <SourceBadge source="fbref" />
              <SourceBadge source="fm" />
            </div>
            <p className="text-center text-xs text-mgsr-muted/60">
              {t('similar_players_sources_hint')}
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-8 h-8 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-mgsr-muted">{t('similar_players_searching')}</span>
          </div>
        )}

        {/* Shortlist error */}
        {shortlistError && (
          <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
            {shortlistError}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="text-center py-4">
            <p className="text-sm text-red-400 mb-3">{error}</p>
            <button
              onClick={() => handleSearch()}
              className="text-xs text-mgsr-teal hover:text-mgsr-teal/80 underline transition-colors"
            >
              {t('similar_players_retry')}
            </button>
          </div>
        )}

        {/* Results */}
        {hasSearched && !loading && !error && players.length > 0 && (
          <div className="space-y-2">
            {players.map((p, i) => (
              <SimilarPlayerCard
                key={`${p.name}-${i}`}
                player={p}
                isRtl={isRtl}
                onAddToShortlist={handleAddToShortlist}
                isAddingToShortlist={addingToShortlistUrl === p.transfermarktUrl}
                shortlistSuccess={shortlistSuccessUrls.has(p.transfermarktUrl ?? '')}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {hasSearched && !loading && !error && players.length === 0 && (
          <div className="text-center py-6">
            <p className="text-sm text-mgsr-muted">{t('similar_players_empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
