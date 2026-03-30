'use client';

import type { SharedGpsData, GpsStrength } from './types';

/**
 * GPS Performance showcase for shared player profiles.
 * Shows only strengths (positive metrics) in a beautiful, creative layout.
 * Includes links to view full GPS reports.
 * Fully bilingual (Hebrew / English) with RTL support.
 */
export function GpsPerformanceShowcase({
  gpsData,
  isWomen = false,
  useHebrew = false,
}: {
  gpsData: SharedGpsData;
  isWomen?: boolean;
  useHebrew?: boolean;
}) {
  const accent = isWomen ? 'from-purple-500 to-amber-400' : 'from-teal-500 to-blue-500';
  const accentText = isWomen ? 'text-purple-400' : 'text-teal-400';
  const accentBg = isWomen ? 'bg-purple-500/10' : 'bg-teal-500/10';
  const accentBorder = isWomen ? 'border-purple-500/20' : 'border-teal-500/20';

  const t = useHebrew ? {
    title: 'ביצועי GPS',
    matchSuffix: (n: number) => n === 1 ? 'משחק נותח' : 'משחקים נותחו',
    min: 'דק׳',
    peakSpeed: 'מהירות שיא',
    avgDistance: 'מרחק ממוצע',
    sprintsMatch: 'ספרינטים/משחק',
    hiRuns: 'ריצות עצימות',
    strengths: 'חוזקות פיזיות',
    vs: 'מול',
    reportsAvailable: (n: number) => `${n} ${n === 1 ? 'דוח GPS זמין' : 'דוחות GPS זמינים'}`,
    viewReport: 'צפה בדוח',
    report: 'דוח',
  } : {
    title: 'GPS Performance',
    matchSuffix: (n: number) => `match${n !== 1 ? 'es' : ''} analyzed`,
    min: 'min',
    peakSpeed: 'Peak Speed',
    avgDistance: 'Avg Distance',
    sprintsMatch: 'Sprints/Match',
    hiRuns: 'HI Runs',
    strengths: 'Physical Strengths',
    vs: 'vs',
    reportsAvailable: (n: number) => `${n} GPS report${n !== 1 ? 's' : ''} available`,
    viewReport: 'View Report',
    report: 'Report',
  };

  return (
    <div dir={useHebrew ? 'rtl' : 'ltr'} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-mgsr-card via-mgsr-card to-mgsr-bg border border-mgsr-border">
      {/* Subtle gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-[0.03] pointer-events-none`} />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center shrink-0`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-mgsr-text">{t.title}</h3>
              <p className="text-xs text-mgsr-muted">
                {gpsData.matchCount} {t.matchSuffix(gpsData.matchCount)} · {gpsData.totalMinutesPlayed} {t.min}
              </p>
            </div>
          </div>
          {gpsData.totalStars > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/20">
              <span className="text-amber-400 text-sm">★</span>
              <span className="text-amber-400 text-xs font-bold">{gpsData.totalStars}</span>
            </div>
          )}
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <QuickStat
            label={t.peakSpeed}
            value={`${gpsData.peakMaxVelocity.toFixed(1)}`}
            unit="km/h"
            color="purple"
          />
          <QuickStat
            label={t.avgDistance}
            value={formatDistance(gpsData.avgTotalDistance)}
            unit=""
            color="teal"
          />
          <QuickStat
            label={t.sprintsMatch}
            value={`${gpsData.avgSprints}`}
            unit=""
            color="orange"
          />
          <QuickStat
            label={t.hiRuns}
            value={`${gpsData.avgHighIntensityRuns}`}
            unit=""
            color="blue"
          />
        </div>

        {/* Strengths */}
        {gpsData.strengths.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="text-sm font-semibold text-emerald-400">{t.strengths}</span>
            </div>
            {gpsData.strengths.map((s, i) => (
              <StrengthCard key={i} strength={s} isWomen={isWomen} vsLabel={t.vs} />
            ))}
          </div>
        )}

        {/* GPS Report Links */}
        {gpsData.documentUrls && gpsData.documentUrls.length > 0 && (
          <div className="mt-4 pt-4 border-t border-mgsr-border">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-3.5 h-3.5 text-mgsr-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs text-mgsr-muted font-medium">
                {t.reportsAvailable(gpsData.documentUrls.length)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {gpsData.documentUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${accentBg} border ${accentBorder} ${accentText} text-xs font-medium hover:opacity-80 transition`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {t.viewReport} {gpsData.documentUrls!.length > 1 ? i + 1 : ''}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: 'purple' | 'teal' | 'orange' | 'blue';
}) {
  const colorMap = {
    purple: 'bg-purple-500/10 text-purple-400',
    teal: 'bg-teal-500/10 text-teal-400',
    orange: 'bg-orange-500/10 text-orange-400',
    blue: 'bg-blue-500/10 text-blue-400',
  };

  return (
    <div className={`rounded-xl p-3 ${colorMap[color].split(' ')[0]}`}>
      <p className="text-[10px] text-mgsr-muted mb-1 truncate">{label}</p>
      <p className={`text-sm font-bold ${colorMap[color].split(' ')[1]}`}>
        {value}
        {unit && <span className="text-[10px] font-normal ms-0.5">{unit}</span>}
      </p>
    </div>
  );
}

function StrengthCard({ strength, isWomen, vsLabel }: { strength: GpsStrength; isWomen: boolean; vsLabel: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10">
      <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-mgsr-text truncate">{strength.title}</p>
        <p className="text-[10px] text-mgsr-muted line-clamp-1">{strength.description}</p>
      </div>
      <div className="text-end shrink-0">
        <p className="text-xs font-bold text-emerald-400">{strength.value}</p>
        {strength.benchmark && (
          <p className="text-[9px] text-mgsr-muted">{vsLabel} {strength.benchmark}</p>
        )}
      </div>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${meters}m`;
}
