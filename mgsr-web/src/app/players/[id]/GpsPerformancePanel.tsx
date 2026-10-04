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
      <section className="bp-module">
        <div className="bp-mod-head">
          <h2>{t('gps_title')}</h2>
          <span className="act">{t('gps_analyzing')}</span>
        </div>
        <div className="bp-skeleton">
          <div className="bp-gps">
            {[...Array(6)].map((_, i) => (
              <div key={i}><div className="v" style={{ opacity: 0.25 }}>··</div><div className="l" style={{ opacity: 0.4 }}>····</div></div>
            ))}
          </div>
        </div>
      </section>
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
    <section className="bp-module">
      <div className="bp-mod-head">
        <h2>{t('gps_title')}</h2>
        <span className="act">
          {matches.length} {matches.length !== 1 ? t('gps_matches') : t('gps_match')} · {totalMin} {t('gps_min')}
          {posGroup !== 'default' ? ` · ${posLabel}` : ''}
          {totalStars > 0 ? ` · ★ ${totalStars}` : ''}
        </span>
      </div>

      {parsingGps && <div className="bp-caution">{t('gps_analyzing')}</div>}

      {/* Metric cards */}
      <div className="bp-gps">
        <div><div className="v">{formatDist(avgDist)}</div><div className="l">{t('gps_avg_dist')}</div></div>
        <div><div className="v">{peakVel.toFixed(1)}<small> km/h</small></div><div className="l">{t('gps_peak_speed')}</div></div>
        <div><div className="v">{avgSprints}</div><div className="l">{t('gps_sprints')}</div></div>
        <div><div className="v">{avgHI}</div><div className="l">{t('gps_hi_runs')}</div></div>
        <div><div className="v">{avgMeterage}<small> m/min</small></div><div className="l">{t('gps_work_rate')}</div></div>
        <div><div className="v">{totalMin}</div><div className="l">{t('gps_total_min')}</div></div>
      </div>

      {/* Strengths / weaknesses as plain fact rows */}
      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="bp-gps-insights">
          {strengths.length > 0 && (
            <div>
              <p className="bp-sublabel">{t('gps_strengths')}</p>
              {strengths.map((s, i) => <InsightRow key={`s${i}`} insight={s} />)}
            </div>
          )}
          {weaknesses.length > 0 && (
            <div>
              <p className="bp-sublabel">{t('gps_weaknesses')}</p>
              {weaknesses.map((w, i) => <InsightRow key={`w${i}`} insight={w} />)}
            </div>
          )}
        </div>
      )}

      {/* Match-by-Match expandable */}
      {matches.length > 0 && (
        <details className="bp-expand">
          <summary onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }}>
            <span>{t('gps_match_details')}</span>
            <span className={`chev${expanded ? ' open' : ''}`}>▾</span>
          </summary>
          {expanded && (
            <div className="bp-gps-matches">
              {matches.map(m => (
                <div key={m.id} className="bp-gps-match">
                  <div className="hd">
                    <div>
                      <b>{m.matchTitle || t('gps_match_label')}</b>
                      <span>{m.matchDate ? new Date(m.matchDate).toLocaleDateString() : m.matchDateStr} · {m.totalDuration ?? 0} {t('gps_min')}</span>
                    </div>
                    {countStars(m) > 0 && <em className="stars">★ {countStars(m)}</em>}
                  </div>
                  <div className="mini">
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
        </details>
      )}
    </section>
  );
}

function InsightRow({ insight }: { insight: GpsInsight }) {
  return (
    <div className={`bp-gps-insight${insight.type === 'weakness' ? ' weak' : ''}`}>
      <div className="tx">
        <b>{insight.title}</b>
        <span>{insight.description}</span>
      </div>
      <div className="vl">
        <b>{insight.value}</b>
        {insight.benchmark && <span>{insight.benchmark}</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bp-gps-ministat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
