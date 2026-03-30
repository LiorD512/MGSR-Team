'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';

interface GpsMatchData {
  id: string;
  playerName?: string;
  matchTitle?: string;
  matchDate?: number;
  matchDateStr?: string;
  totalDuration?: number;
  totalDistance?: number;
  highMpEffsDist?: number;
  highMpEffs?: number;
  meteragePerMinute?: number;
  accelerations?: number;
  decelerations?: number;
  highIntensityRuns?: number;
  sprints?: number;
  maxVelocity?: number;
  isStarTotalDist?: boolean;
  isStarHighMpEffsDist?: boolean;
  isStarHighMpEffs?: boolean;
  isStarMeteragePerMin?: boolean;
  isStarAccelerations?: boolean;
  isStarHighIntensityRuns?: boolean;
  isStarSprints?: boolean;
  isStarMaxVelocity?: boolean;
  teamAverageTotalDist?: number;
  teamAverageMeteragePerMin?: number;
  teamAverageHighIntensityRuns?: number;
  teamAverageSprints?: number;
  teamAverageMaxVelocity?: number;
}

interface GpsInsight {
  type: 'strength' | 'weakness';
  title: string;
  description: string;
  value: string;
  benchmark?: string;
}

/** Stored insight from GpsPlayerInsights Firestore doc */
interface StoredInsight {
  type: 'strength' | 'weakness';
  titleEn: string; titleHe: string;
  descriptionEn: string; descriptionHe: string;
  value: string; benchmark?: string;
}

/** Position group labels for header display */
const POS_LABELS: Record<string, { en: string; he: string }> = {
  cb: { en: 'Centre-Back', he: 'בלם' },
  fb: { en: 'Full-Back', he: 'מגן צד' },
  cm: { en: 'Midfielder', he: 'קשר' },
  winger: { en: 'Winger', he: 'כנף' },
  fw: { en: 'Striker', he: 'חלוץ' },
  default: { en: 'Pro Average', he: 'ממוצע מקצועי' },
};

function countStars(m: GpsMatchData): number {
  return [m.isStarTotalDist, m.isStarHighMpEffsDist, m.isStarHighMpEffs, m.isStarMeteragePerMin, m.isStarAccelerations, m.isStarHighIntensityRuns, m.isStarSprints, m.isStarMaxVelocity].filter(Boolean).length;
}

function formatDist(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

export default function GpsPerformancePanel({
  playerRefId,
  playerPosition = '',
  parsingGps = false,
  isRtl = false,
}: {
  playerRefId: string;
  playerPosition?: string;
  parsingGps?: boolean;
  isRtl?: boolean;
}) {
  const [matches, setMatches] = useState<GpsMatchData[]>([]);
  const [storedInsights, setStoredInsights] = useState<StoredInsight[]>([]);
  const [storedPosGroup, setStoredPosGroup] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const recomputeTriggered = useRef(false);
  const { t, lang } = useLanguage();
  const isHebrew = lang === 'he';

  // Listen to GpsMatchData
  useEffect(() => {
    if (!playerRefId) return;
    setLoading(true);
    const q = query(
      collection(db, 'GpsMatchData'),
      where('playerTmProfile', '==', playerRefId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as GpsMatchData))
        .sort((a, b) => (b.matchDate ?? 0) - (a.matchDate ?? 0));
      setMatches(data);
      setLoading(false);
    });
    return unsub;
  }, [playerRefId]);

  // Listen to GpsPlayerInsights (server-computed, bilingual)
  useEffect(() => {
    if (!playerRefId) return;
    const safeId = playerRefId.replace(/[/\\]/g, '_');
    const unsub = onSnapshot(
      doc(db, 'GpsPlayerInsights', safeId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setStoredInsights((data.insights as StoredInsight[]) || []);
          setStoredPosGroup((data.positionGroup as string) || 'default');
        } else {
          setStoredInsights([]);
        }
      },
      (err) => {
        console.error('[GpsPlayerInsights] listener error:', err);
      }
    );
    return unsub;
  }, [playerRefId]);

  // Auto-trigger recompute if matches exist but no insights yet (backfill)
  useEffect(() => {
    if (recomputeTriggered.current || loading || matches.length === 0 || storedInsights.length > 0) return;
    recomputeTriggered.current = true;
    fetch('/api/documents/gps-recompute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerTmProfile: playerRefId }),
    }).catch(() => {});
  }, [loading, matches.length, storedInsights.length, playerRefId]);

  if (!loading && matches.length === 0 && !parsingGps) return null;

  if (loading || (parsingGps && matches.length === 0)) {
    return (
      <div className="rounded-2xl bg-mgsr-card border border-mgsr-border overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-mgsr-text">{t('gps_title')}</h3>
              <p className="text-sm text-mgsr-muted">{t('gps_analyzing')}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-lg p-2 bg-mgsr-bg/50 animate-pulse">
                  <div className="h-2 w-10 bg-mgsr-border/40 rounded mb-2" />
                  <div className="h-3 w-8 bg-mgsr-border/60 rounded" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-mgsr-bg/30 animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-mgsr-border/40 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-24 bg-mgsr-border/50 rounded" />
                    <div className="h-2 w-36 bg-mgsr-border/30 rounded" />
                  </div>
                  <div className="h-3 w-10 bg-mgsr-border/40 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Map stored bilingual insights to display format
  const insights: GpsInsight[] = storedInsights.map(s => ({
    type: s.type,
    title: isHebrew ? s.titleHe : s.titleEn,
    description: isHebrew ? s.descriptionHe : s.descriptionEn,
    value: s.value,
    benchmark: s.benchmark,
  }));
  const strengths = insights.filter(i => i.type === 'strength');
  const weaknesses = insights.filter(i => i.type === 'weakness');
  const totalStars = matches.reduce((sum, m) => sum + countStars(m), 0);
  const totalMin = matches.reduce((sum, m) => sum + (m.totalDuration ?? 0), 0);
  const avgDist = Math.round(matches.reduce((s, m) => s + (m.totalDistance ?? 0), 0) / matches.length);
  const avgMeterage = Math.round(matches.reduce((s, m) => s + (m.meteragePerMinute ?? 0), 0) / matches.length);
  const avgHI = Math.round(matches.reduce((s, m) => s + (m.highIntensityRuns ?? 0), 0) / matches.length);
  const avgSprints = Math.round(matches.reduce((s, m) => s + (m.sprints ?? 0), 0) / matches.length);
  const peakVel = Math.max(...matches.map(m => m.maxVelocity ?? 0));
  const posGroup = storedPosGroup || 'default';
  const posLabel = isHebrew ? (POS_LABELS[posGroup]?.he ?? '') : (POS_LABELS[posGroup]?.en ?? '');

  return (
    <div className="rounded-2xl bg-mgsr-card border border-mgsr-border overflow-hidden">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-mgsr-text">{t('gps_title')}</h3>
              <p className="text-sm text-mgsr-muted">{matches.length} {matches.length !== 1 ? t('gps_matches') : t('gps_match')} · {totalMin} {t('gps_min')}{posGroup !== 'default' && <span className="text-teal-400 ms-1">· {posLabel}</span>}</p>
            </div>
          </div>
          {totalStars > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/10">
              <span className="text-amber-400 text-sm">★</span>
              <span className="text-amber-400 text-xs font-bold">{totalStars}</span>
            </div>
          )}
        </div>

        {/* Analyzing GPS banner */}
        {parsingGps && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
            <svg className="w-4 h-4 text-teal-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-teal-400 font-medium">{t('gps_analyzing')}</span>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          <StatChip label={t('gps_peak_speed')} value={`${peakVel.toFixed(1)}`} unit="km/h" color="purple" />
          <StatChip label={t('gps_avg_dist')} value={formatDist(avgDist)} color="teal" />
          <StatChip label={t('gps_sprints')} value={`${avgSprints}`} unit={`/${t('gps_match')}`} color="orange" />
          <StatChip label={t('gps_hi_runs')} value={`${avgHI}`} unit={`/${t('gps_match')}`} color="blue" />
          <StatChip label={t('gps_work_rate')} value={`${avgMeterage}`} unit="m/min" color="emerald" />
          <StatChip label={t('gps_total_min')} value={`${totalMin}`} color="slate" />
        </div>

        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-sm font-bold text-emerald-400">{t('gps_strengths')}</span>
            </div>
            <div className="space-y-1.5">
              {strengths.map((s, i) => (
                <InsightRow key={i} insight={s} />
              ))}
            </div>
          </div>
        )}

        {/* Weaknesses */}
        {weaknesses.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-3.5 h-3.5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
              <span className="text-sm font-bold text-orange-400">{t('gps_weaknesses')}</span>
            </div>
            <div className="space-y-1.5">
              {weaknesses.map((w, i) => (
                <InsightRow key={i} insight={w} />
              ))}
            </div>
          </div>
        )}

        {/* Match-by-Match expandable */}
        {matches.length > 0 && (
          <div className="border-t border-mgsr-border pt-3 mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-between w-full text-sm font-medium text-mgsr-text hover:text-mgsr-teal transition"
            >
              <span>{t('gps_match_details')}</span>
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {expanded && (
              <div className="mt-3 space-y-2">
                {matches.map(m => (
                  <div key={m.id} className="p-3 rounded-xl bg-mgsr-bg/50 border border-mgsr-border/50">
                    <div className="flex justify-between items-center mb-2">
                      <div>
                        <p className="text-sm font-bold text-mgsr-text">{m.matchTitle || t('gps_match_label')}</p>
                        <p className="text-xs text-mgsr-muted">
                          {m.matchDate ? new Date(m.matchDate).toLocaleDateString() : m.matchDateStr} · {m.totalDuration ?? 0} {t('gps_min')}
                        </p>
                      </div>
                      {countStars(m) > 0 && (
                        <span className="text-amber-400 text-xs">★ {countStars(m)}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-center">
                      <MiniStat label={t('gps_dist')} value={formatDist(m.totalDistance ?? 0)} />
                      <MiniStat label="m/min" value={`${m.meteragePerMinute ?? 0}`} />
                      <MiniStat label={t('gps_hi_runs')} value={`${m.highIntensityRuns ?? 0}`} />
                      <MiniStat label={t('gps_sprint')} value={`${m.sprints ?? 0}`} />
                      <MiniStat label={t('gps_max')} value={`${(m.maxVelocity ?? 0).toFixed(1)}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-500/10 text-purple-400',
    teal: 'bg-teal-500/10 text-teal-400',
    orange: 'bg-orange-500/10 text-orange-400',
    blue: 'bg-blue-500/10 text-blue-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    slate: 'bg-slate-500/10 text-slate-400',
  };
  const cls = colorMap[color] || colorMap.slate;
  return (
    <div className={`rounded-xl p-2.5 ${cls.split(' ')[0]}`}>
      <p className="text-[11px] text-mgsr-muted mb-1 truncate">{label}</p>
      <p className={`text-sm font-bold leading-tight ${cls.split(' ')[1]}`}>
        {value}{unit && <span className="text-[10px] font-normal ms-0.5">{unit}</span>}
      </p>
    </div>
  );
}

function InsightRow({ insight }: { insight: GpsInsight }) {
  const isStrength = insight.type === 'strength';
  const cls = isStrength ? 'bg-emerald-500/[0.07] border-emerald-500/15' : 'bg-orange-500/[0.07] border-orange-500/15';
  const iconCls = isStrength ? 'text-emerald-400 bg-emerald-500/20' : 'text-orange-400 bg-orange-500/20';
  const valueCls = isStrength ? 'text-emerald-400' : 'text-orange-400';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${cls}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${iconCls}`}>
        {isStrength ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-mgsr-text leading-snug">{insight.title}</p>
        <p className="text-xs text-mgsr-muted leading-relaxed mt-0.5">{insight.description}</p>
      </div>
      <div className="text-end shrink-0 ps-2 ms-auto min-w-[70px]">
        <p className={`text-sm font-bold ${valueCls}`}>{insight.value}</p>
        {insight.benchmark && <p className="text-[10px] text-mgsr-muted">{insight.benchmark}</p>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-mgsr-text">{value}</p>
      <p className="text-[10px] text-mgsr-muted">{label}</p>
    </div>
  );
}
