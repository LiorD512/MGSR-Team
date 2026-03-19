'use client';

import { type ClubIntelligence, type PlayerSuccessEntry, type SuccessProfileSummary } from '@/lib/clubIntel';

interface ClubIntelPanelProps {
  data: ClubIntelligence;
  isHebrew: boolean;
}

const POS_HEBREW: Record<string, string> = {
  GK: 'שוער',
  CB: 'מגן',
  'Centre-Back': 'מגן',
  RB: 'מגן ימני',
  'Right-Back': 'מגן ימני',
  LB: 'מגן שמאלי',
  'Left-Back': 'מגן שמאלי',
  DM: 'קשר הגנתי',
  'Defensive Midfield': 'קשר הגנתי',
  CM: 'קשר מרכזי',
  'Central Midfield': 'קשר מרכזי',
  AM: 'קשר התקפי',
  'Attacking Midfield': 'קשר התקפי',
  LM: 'קשר שמאלי',
  'Left Midfield': 'קשר שמאלי',
  RM: 'קשר ימני',
  'Right Midfield': 'קשר ימני',
  LW: 'כנף שמאל',
  'Left Winger': 'כנף שמאל',
  RW: 'כנף ימין',
  'Right Winger': 'כנף ימין',
  CF: 'חלוץ',
  'Centre-Forward': 'חלוץ',
  ST: 'חלוץ',
  SS: 'חלוץ שני',
  'Second Striker': 'חלוץ שני',
  Goalkeeper: 'שוער',
  Defender: 'מגן',
  Striker: 'חלוץ',
};

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-mgsr-dark/50 rounded-xl p-3 text-center">
      <p className="text-lg font-bold text-mgsr-text">{value}</p>
      <p className="text-xs text-mgsr-muted mt-0.5">{label}</p>
      {sub && <p className="text-xs text-mgsr-muted/70 mt-0.5">{sub}</p>}
    </div>
  );
}

function PctBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-mgsr-muted w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-mgsr-dark/50 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-mgsr-muted w-10 text-end">{pct}%</span>
    </div>
  );
}

export default function ClubIntelPanel({ data, isHebrew }: ClubIntelPanelProps) {
  const t = isHebrew
    ? {
        squadOverview: 'סקירת סגל',
        players: 'שחקנים',
        avgAge: 'גיל ממוצע',
        avgValue: 'שווי ממוצע',
        totalValue: 'שווי כולל',
        expiring: 'חוזים שנגמרים בקרוב',
        nationalities: 'לאומיות בסגל',
        topNationalities: 'לאומים מובילים',
        transferDna: 'DNA העברות',
        arrivals: 'הגעות',
        free: 'חופשי',
        paid: 'תשלום',
        loan: 'השאלה',
        avgFee: 'עלות העברה ממוצעת',
        totalSpent: 'סה"כ הוצאות',
        noArrivals: 'אין נתוני העברות עדכניים',
        positionDist: 'פיזור עמדות',
        disclaimer3years: '* הנתונים מבוססים על 3 העונות האחרונות',
        successTitle: 'פרופילים מצליחים',
        inSquad: 'בסגל',
        sold: 'נמכר',
        arrivalFee: 'עלות הגעה',
        arrivalMV: 'שווי בהגעה',
        currentValue: 'שווי נוכחי',
        soldFor: 'נמכר ב',
        growth: 'גידול',
        decline: 'ירידה',
        appearances: 'הופעות',
        goals: 'שערים',
        assists: 'בישולים',
        winningProfile: 'הפרופיל המנצח',
        bestPositions: 'עמדות מצליחות',
        bestAgeRange: 'גיל הגעה מיטבי',
        bestNationalities: 'לאומים מצליחים',
        totalProfit: 'רווח כולל',
        totalLoss: 'הפסד כולל',
        avgROI: 'החזר ממוצע',
        noSuccessData: 'אין מספיק נתונים לפרופילים מצליחים',
        years: 'שנים',
      }
    : {
        squadOverview: 'Squad Overview',
        players: 'Players',
        avgAge: 'Avg Age',
        avgValue: 'Avg Value',
        totalValue: 'Total Value',
        expiring: 'Contracts expiring soon',
        nationalities: 'Squad Nationalities',
        topNationalities: 'Top Nationalities',
        transferDna: 'Transfer DNA',
        arrivals: 'Arrivals',
        free: 'Free',
        paid: 'Paid',
        loan: 'Loan',
        avgFee: 'Avg Transfer Fee',
        totalSpent: 'Total Spent',
        noArrivals: 'No recent transfer data',
        positionDist: 'Position Distribution',
        disclaimer3years: '* Data based on the last 3 seasons',
        successTitle: 'Success Profiles',
        inSquad: 'In Squad',
        sold: 'Sold',
        arrivalFee: 'Arrival Fee',
        arrivalMV: 'MV at Arrival',
        currentValue: 'Current Value',
        soldFor: 'Sold For',
        growth: 'Growth',
        decline: 'Decline',
        appearances: 'Apps',
        goals: 'Goals',
        assists: 'Assists',
        winningProfile: 'Winning Profile',
        bestPositions: 'Best Positions',
        bestAgeRange: 'Best Arrival Age',
        bestNationalities: 'Best Nationalities',
        totalProfit: 'Total Profit',
        totalLoss: 'Total Loss',
        avgROI: 'Avg ROI',
        noSuccessData: 'Not enough data for success profiles',
        years: 'years',
      };

  const tb = data.transferBehavior;
  const topNats = data.nationalities.slice(0, 7);

  return (
    <div className="space-y-4 p-3">
      {/* Squad Overview */}
      <div>
        <p className="text-xs font-semibold text-mgsr-teal uppercase tracking-wider mb-2">{t.squadOverview}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox label={t.players} value={data.squadSize} />
          <StatBox label={t.avgAge} value={data.avgAge ?? '—'} />
          <StatBox label={t.avgValue} value={data.avgMarketValueDisplay} />
          <StatBox label={t.totalValue} value={data.totalSquadValueDisplay} />
        </div>
        {data.contractExpiringSoon > 0 && (
          <p className="text-xs text-amber-400 mt-2">
            ⚠️ {data.contractExpiringSoon} {t.expiring}
          </p>
        )}
      </div>

      {/* Nationalities */}
      {topNats.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-mgsr-teal uppercase tracking-wider mb-2">{t.topNationalities}</p>
          <div className="flex flex-wrap gap-2">
            {topNats.map((n) => (
              <div
                key={n.country}
                className="flex items-center gap-1.5 bg-mgsr-dark/50 rounded-lg px-2.5 py-1.5"
              >
                {n.flag && (
                  <img src={n.flag} alt="" className="w-4 h-3 object-cover rounded-sm" />
                )}
                <span className="text-xs text-mgsr-text font-medium">{n.country}</span>
                <span className="text-xs text-mgsr-muted">({n.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer DNA */}
      <div>
        <p className="text-xs font-semibold text-mgsr-teal uppercase tracking-wider mb-2">{t.transferDna}</p>
        {tb.totalArrivals > 0 ? (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <PctBar label={t.free} pct={tb.freePct} color="bg-emerald-500" />
              <PctBar label={t.paid} pct={tb.paidPct} color="bg-blue-500" />
              <PctBar label={t.loan} pct={tb.loanPct} color="bg-amber-500" />
            </div>
            {tb.avgFee > 0 && (
              <div className="mt-2 bg-mgsr-dark/60 rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="text-sm font-semibold text-mgsr-teal">{t.avgFee}:</span>
                <span className="text-sm font-bold text-mgsr-text">{tb.avgFeeDisplay}</span>
                {tb.totalSpent > 0 && (
                  <>
                    <span className="text-mgsr-muted">|</span>
                    <span className="text-xs text-mgsr-muted">{t.totalSpent}: <span className="text-mgsr-text font-medium">{tb.totalSpentDisplay}</span></span>
                  </>
                )}
              </div>
            )}
            <p className="text-[10px] text-mgsr-muted/60 mt-1.5">{t.disclaimer3years}</p>
          </div>
        ) : (
          <p className="text-xs text-mgsr-muted">{t.noArrivals}</p>
        )}
      </div>

      {/* Position Distribution */}
      {Object.keys(data.positionDistribution).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-mgsr-teal uppercase tracking-wider mb-2">{t.positionDist}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.positionDistribution)
              .sort(([, a], [, b]) => b - a)
              .map(([pos, count]) => (
                <span
                  key={pos}
                  className="inline-flex items-center gap-1 bg-mgsr-dark/50 rounded-lg px-2 py-1 text-xs"
                >
                  <span className="text-mgsr-text font-medium">{isHebrew ? (POS_HEBREW[pos] || pos) : pos}</span>
                  <span className="text-mgsr-muted">×{count}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Success Profiles */}
      {data.successProfiles && <SuccessProfilesSection sp={data.successProfiles} t={t} isHebrew={isHebrew} />}
    </div>
  );
}

// ─── Success Profiles Section ──────────────────────────────────────────────

function PlayerCard({ p, t, isHebrew }: { p: PlayerSuccessEntry; t: Record<string, string>; isHebrew: boolean }) {
  const isPositive = p.valueChange >= 0;
  const changeColor = isPositive ? 'text-emerald-400' : 'text-red-400';
  const arrow = isPositive ? '↑' : '↓';
  const posDisplay = isHebrew ? (POS_HEBREW[p.position] || p.position) : p.position;

  return (
    <div className="bg-mgsr-dark/40 border border-mgsr-border/30 rounded-lg p-2.5 space-y-1.5">
      {/* Header: name + status badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          {p.tmUrl ? (
            <a href={p.tmUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-mgsr-text hover:text-mgsr-teal transition truncate block">{p.name}</a>
          ) : (
            <p className="text-sm font-semibold text-mgsr-text truncate">{p.name}</p>
          )}
          <p className="text-[11px] text-mgsr-muted">{posDisplay} · {p.nationality}{p.ageAtArrival ? ` · ${p.ageAtArrival}` : ''}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${p.status === 'in-squad' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
          {p.status === 'in-squad' ? t.inSquad : t.sold}
        </span>
      </div>

      {/* Financial row */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="text-mgsr-muted">{t.arrivalFee}: <span className="text-mgsr-text font-medium">{p.wasFree ? t.free : p.arrivalFeeDisplay}</span></span>
        {p.marketValueAtArrival > 0 && (
          <span className="text-mgsr-muted">{t.arrivalMV}: <span className="text-mgsr-text font-medium">{p.marketValueAtArrivalDisplay}</span></span>
        )}
        <span className="text-mgsr-muted">→</span>
        {p.status === 'sold' ? (
          <span className="text-mgsr-muted">{t.soldFor}: <span className="text-mgsr-text font-medium">{p.soldForDisplay}</span></span>
        ) : (
          <span className="text-mgsr-muted">{t.currentValue}: <span className="text-mgsr-text font-medium">{p.currentMarketValueDisplay}</span></span>
        )}
        <span className={`font-bold ${changeColor}`}>
          {arrow} {p.valueChangeDisplay} {p.valueChangePct !== 0 && `(${isPositive ? '+' : ''}${p.valueChangePct}%)`}
        </span>
      </div>

      {/* Stats row (only if we have data) */}
      {p.appearances > 0 && (
        <div className="flex gap-3 text-[11px]">
          <span className="text-mgsr-muted">{t.appearances}: <span className="text-mgsr-text font-medium">{p.appearances}</span></span>
          {p.goals > 0 && <span className="text-mgsr-muted">{t.goals}: <span className="text-mgsr-text font-medium">{p.goals}</span></span>}
          {p.assists > 0 && <span className="text-mgsr-muted">{t.assists}: <span className="text-mgsr-text font-medium">{p.assists}</span></span>}
        </div>
      )}
    </div>
  );
}

function SuccessProfilesSection({ sp, t, isHebrew }: { sp: SuccessProfileSummary; t: Record<string, string>; isHebrew: boolean }) {
  if (sp.topPlayers.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">{t.successTitle}</p>
        <p className="text-xs text-mgsr-muted">{t.noSuccessData}</p>
      </div>
    );
  }

  const profitIsPositive = sp.totalProfit >= 0;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">{t.successTitle}</p>

      {/* Winning Profile Summary */}
      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 space-y-2.5">
        <p className="text-xs font-semibold text-purple-300">{t.winningProfile}</p>

        {/* Best positions */}
        {sp.bestPositions.length > 0 && (
          <div>
            <p className="text-[10px] text-mgsr-muted mb-1">{t.bestPositions}</p>
            <div className="flex flex-wrap gap-1.5">
              {sp.bestPositions.slice(0, 4).map((bp) => {
                const pos = isHebrew ? (POS_HEBREW[bp.position] || bp.position) : bp.position;
                return (
                  <span key={bp.position} className="inline-flex items-center gap-1 bg-purple-500/15 rounded px-2 py-0.5 text-[11px]">
                    <span className="text-mgsr-text font-medium">{pos}</span>
                    <span className="text-purple-300/70">×{bp.count}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Best age range + nationalities row */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
          {sp.bestAgeRange && (
            <div>
              <p className="text-[10px] text-mgsr-muted mb-0.5">{t.bestAgeRange}</p>
              <span className="text-mgsr-text font-medium">
                {sp.bestAgeRange.min}–{sp.bestAgeRange.max} {t.years}
              </span>
              <span className="text-purple-300/70 ms-1">({sp.bestAgeRange.count})</span>
            </div>
          )}

          {sp.bestNationalities.length > 0 && (
            <div>
              <p className="text-[10px] text-mgsr-muted mb-0.5">{t.bestNationalities}</p>
              <span className="text-mgsr-text font-medium">
                {sp.bestNationalities.slice(0, 3).map((bn) => bn.country).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Financial summary */}
        <div className="flex gap-4 text-[11px] pt-1.5 border-t border-purple-500/20">
          <span className="text-mgsr-muted">
            {profitIsPositive ? t.totalProfit : t.totalLoss}:{' '}
            <span className={`font-bold ${profitIsPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {profitIsPositive ? '+' : '-'}{sp.totalProfitDisplay}
            </span>
          </span>
          {sp.avgROI !== 0 && (
            <span className="text-mgsr-muted">
              {t.avgROI}:{' '}
              <span className={`font-bold ${sp.avgROI >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {sp.avgROI >= 0 ? '+' : ''}{sp.avgROI}%
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Individual player cards */}
      <div className="space-y-1.5">
        {sp.topPlayers.map((p) => (
          <PlayerCard key={p.name} p={p} t={t} isHebrew={isHebrew} />
        ))}
      </div>

      <p className="text-[10px] text-mgsr-muted/60">{t.disclaimer3years}</p>
    </div>
  );
}
