/**
 * Club Intelligence — aggregates squad + transfer data into actionable insights.
 */
import {
  scrapeClubSquad,
  scrapeClubTransfers,
  getPlayerPerformanceStats,
  type ClubSquadPlayer,
  type ClubTransfer,
} from './transfermarkt';

export interface NationalityBreakdown {
  country: string;
  flag: string;
  count: number;
  pct: number;
}

export interface TransferBehavior {
  totalArrivals: number;
  freeArrivals: number;
  paidArrivals: number;
  loanArrivals: number;
  freePct: number;
  paidPct: number;
  loanPct: number;
  avgFee: number;
  avgFeeDisplay: string;
  totalSpent: number;
  totalSpentDisplay: string;
}

/** A single player's success story at the club */
export interface PlayerSuccessEntry {
  name: string;
  position: string;
  nationality: string;
  ageAtArrival: number | null;
  arrivalFee: number;
  arrivalFeeDisplay: string;
  marketValueAtArrival: number;
  marketValueAtArrivalDisplay: string;
  wasFree: boolean;
  wasLoan: boolean;
  // If still in squad
  currentMarketValue: number;
  currentMarketValueDisplay: string;
  // If sold (departed)
  soldFor: number;
  soldForDisplay: string;
  // Profit / value growth
  valueChange: number;     // euros gained (currentMV - fee) or (soldFor - fee)
  valueChangeDisplay: string;
  valueChangePct: number;  // % change
  // Performance at this club (aggregated across seasons at club)
  appearances: number;
  goals: number;
  assists: number;
  minutesPlayed: number;
  // Status
  status: 'in-squad' | 'sold';
  // TM profile URL
  tmUrl: string;
}

/** Aggregated insight about what profile succeeds at this club */
export interface SuccessProfileSummary {
  /** Top individual success stories sorted by value growth */
  topPlayers: PlayerSuccessEntry[];
  /** Aggregate: most common position among successful arrivals */
  bestPositions: { position: string; count: number; avgValueChangePct: number }[];
  /** Aggregate: most common age range at arrival among successful arrivals */
  bestAgeRange: { min: number; max: number; count: number; avgValueChangePct: number } | null;
  /** Aggregate: most common nationalities among successful arrivals */
  bestNationalities: { country: string; count: number; avgValueChangePct: number }[];
  /** Total profit from departures vs arrival fees */
  totalProfit: number;
  totalProfitDisplay: string;
  /** Average ROI % across players with known fees */
  avgROI: number;
}

export interface ClubIntelligence {
  squadSize: number;
  avgAge: number | null;
  avgMarketValue: number;
  avgMarketValueDisplay: string;
  totalSquadValue: number;
  totalSquadValueDisplay: string;
  nationalities: NationalityBreakdown[];
  positionDistribution: Record<string, number>;
  transferBehavior: TransferBehavior;
  contractExpiringSoon: number; // players with contract ending this year or next
  successProfiles: SuccessProfileSummary | null;
  scrapedAt: string;
}

function formatEuros(v: number): string {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1_000)}K`;
  if (v > 0) return `€${v}`;
  return '€0';
}

function countExpiringSoon(players: ClubSquadPlayer[]): number {
  const now = new Date();
  const cutoff = new Date(now.getFullYear() + 1, 6, 1); // July 1 next year
  let count = 0;
  for (const p of players) {
    if (!p.contractEnd) continue;
    // Parse dates like "Jun 30, 2025" or "30.06.2025"
    const d = new Date(p.contractEnd.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$2/$1/$3'));
    if (!isNaN(d.getTime()) && d <= cutoff) count++;
  }
  return count;
}

function buildTransferBehavior(arrivals: ClubTransfer[]): TransferBehavior {
  const total = arrivals.length;
  const free = arrivals.filter((a) => a.isFree && !a.isLoan).length;
  const loans = arrivals.filter((a) => a.isLoan).length;
  // Paid = has actual positive fee and is not a loan
  const paidArrivals = arrivals.filter((a) => !a.isFree && !a.isLoan && a.fee > 0);
  const paid = paidArrivals.length;
  // Anything remaining (not free, not loan, no fee) — classify as free
  const unclassified = total - free - loans - paid;
  const effectiveFree = free + unclassified;
  const totalSpent = paidArrivals.reduce((sum, a) => sum + a.fee, 0);
  const avgFee = paidArrivals.length > 0 ? Math.round(totalSpent / paidArrivals.length) : 0;

  return {
    totalArrivals: total,
    freeArrivals: effectiveFree,
    paidArrivals: paid,
    loanArrivals: loans,
    freePct: total > 0 ? Math.round((effectiveFree / total) * 100) : 0,
    paidPct: total > 0 ? Math.round((paid / total) * 100) : 0,
    loanPct: total > 0 ? Math.round((loans / total) * 100) : 0,
    avgFee,
    avgFeeDisplay: formatEuros(avgFee),
    totalSpent,
    totalSpentDisplay: formatEuros(totalSpent),
  };
}

/**
 * Generate full club intelligence report from a Transfermarkt club profile URL.
 */
export async function generateClubIntelligence(clubTmProfile: string): Promise<ClubIntelligence> {
  // Scrape squad and transfers for last 3 seasons (with delays to avoid rate limiting)
  const squad = await scrapeClubSquad(clubTmProfile);

  const currentYear = new Date().getFullYear();
  const currentSeason = new Date().getMonth() >= 7 ? currentYear : currentYear - 1;
  const seasons = [currentSeason, currentSeason - 1, currentSeason - 2];

  const allArrivals: import('./transfermarkt').ClubTransfer[] = [];
  const allDepartures: import('./transfermarkt').ClubTransfer[] = [];
  for (const season of seasons) {
    await new Promise((r) => setTimeout(r, 1500));
    const transfers = await scrapeClubTransfers(clubTmProfile, season);
    allArrivals.push(...transfers.arrivals);
    allDepartures.push(...transfers.departures);
  }

  // Squad stats
  const ages = squad.filter((p) => p.age != null).map((p) => p.age!);
  const avgAge = ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;
  const totalSquadValue = squad.reduce((s, p) => s + p.marketValue, 0);
  const playersWithValue = squad.filter((p) => p.marketValue > 0);
  const avgMarketValue = playersWithValue.length > 0 ? Math.round(totalSquadValue / playersWithValue.length) : 0;

  // Nationality breakdown
  const natMap = new Map<string, { count: number; flag: string }>();
  for (const p of squad) {
    if (!p.nationality) continue;
    const existing = natMap.get(p.nationality);
    if (existing) {
      existing.count++;
    } else {
      natMap.set(p.nationality, { count: 1, flag: p.nationalityFlag });
    }
  }
  const nationalities: NationalityBreakdown[] = Array.from(natMap.entries())
    .map(([country, { count, flag }]) => ({
      country,
      flag,
      count,
      pct: squad.length > 0 ? Math.round((count / squad.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Position distribution
  const positionDistribution: Record<string, number> = {};
  for (const p of squad) {
    const pos = p.position || 'Unknown';
    positionDistribution[pos] = (positionDistribution[pos] || 0) + 1;
  }

  // Transfer behavior (last 3 seasons)
  const transferBehavior = buildTransferBehavior(allArrivals);

  // Contract expiry
  const contractExpiringSoon = countExpiringSoon(squad);

  // --- Success Profiles Analysis ---
  const successProfiles = await buildSuccessProfiles(allArrivals, allDepartures, squad, seasons);

  return {
    squadSize: squad.length,
    avgAge,
    avgMarketValue,
    avgMarketValueDisplay: formatEuros(avgMarketValue),
    totalSquadValue,
    totalSquadValueDisplay: formatEuros(totalSquadValue),
    nationalities,
    positionDistribution,
    transferBehavior,
    contractExpiringSoon,
    successProfiles,
    scrapedAt: new Date().toISOString(),
  };
}

// ─── Success Profiles Builder ───────────────────────────────────────────────

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract clean position abbreviation from potentially messy scraped text */
const KNOWN_POSITIONS: Record<string, string> = {
  'goalkeeper': 'GK',
  'left back': 'LB',
  'centre-back': 'CB',
  'centre back': 'CB',
  'right back': 'RB',
  'right-back': 'RB',
  'left-back': 'LB',
  'defensive midfield': 'DM',
  'central midfield': 'CM',
  'attacking midfield': 'AM',
  'right winger': 'RW',
  'left winger': 'LW',
  'centre-forward': 'CF',
  'centre forward': 'CF',
  'second striker': 'SS',
  'left midfield': 'LM',
  'right midfield': 'RM',
};

function cleanPosition(raw: string): string {
  if (!raw) return '';
  // Already a short abbreviation
  if (/^[A-Z]{2,3}$/.test(raw.trim())) return raw.trim();
  // Try to find a known position within the messy string
  const lower = raw.toLowerCase();
  for (const [phrase, abbrev] of Object.entries(KNOWN_POSITIONS)) {
    if (lower.includes(phrase)) return abbrev;
  }
  // If the string is short enough, use as-is
  if (raw.length <= 20) return raw.trim();
  // Fallback: take first two words max
  return raw.trim().split(/\s+/).slice(0, 2).join(' ');
}

async function buildSuccessProfiles(
  arrivals: ClubTransfer[],
  departures: ClubTransfer[],
  squad: ClubSquadPlayer[],
  seasons: number[],
): Promise<SuccessProfileSummary | null> {
  if (arrivals.length === 0) return null;

  // Build lookup maps
  const squadByName = new Map<string, ClubSquadPlayer>();
  for (const p of squad) squadByName.set(normalizePlayerName(p.name), p);

  const departureByName = new Map<string, ClubTransfer>();
  for (const d of departures) {
    const key = normalizePlayerName(d.playerName);
    // Keep the departure with the highest fee if there are duplicates
    const existing = departureByName.get(key);
    if (!existing || d.fee > existing.fee) departureByName.set(key, d);
  }

  // Deduplicate arrivals by player name (keep first occurrence = earliest signing)
  const seenNames = new Set<string>();
  const uniqueArrivals: ClubTransfer[] = [];
  for (const a of arrivals) {
    const key = normalizePlayerName(a.playerName);
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    uniqueArrivals.push(a);
  }

  // Build entries for each arrival
  const entries: PlayerSuccessEntry[] = [];
  for (const a of uniqueArrivals) {
    if (a.isLoan) continue; // skip loans for profit analysis

    const key = normalizePlayerName(a.playerName);
    const inSquad = squadByName.get(key);
    const departed = departureByName.get(key);

    let currentMarketValue = 0;
    let soldFor = 0;
    let status: 'in-squad' | 'sold' = 'in-squad';

    if (departed && !departed.isLoan) {
      // Player was sold — use departure fee
      soldFor = departed.fee;
      status = 'sold';
    } else if (inSquad) {
      // Still in squad — use current market value
      currentMarketValue = inSquad.marketValue;
    } else {
      // Not in squad, not found in departures — skip (maybe loaned out or released)
      continue;
    }

    const investedAmount = a.fee; // 0 for free signings
    const currentWorth = status === 'sold' ? soldFor : currentMarketValue;
    const valueChange = currentWorth - investedAmount;
    const valueChangePct = investedAmount > 0
      ? Math.round((valueChange / investedAmount) * 100)
      : (currentWorth > 0 ? 100 : 0); // Free signing with value = 100% gain

    // Use squad data for position if available (cleaner), otherwise clean the arrival position
    const posFromSquad = inSquad?.position;
    const cleanPos = posFromSquad || cleanPosition(a.position);

    entries.push({
      name: a.playerName,
      position: cleanPos,
      nationality: a.nationality,
      ageAtArrival: a.age,
      arrivalFee: investedAmount,
      arrivalFeeDisplay: investedAmount > 0 ? formatEuros(investedAmount) : 'Free',
      marketValueAtArrival: a.marketValue,
      marketValueAtArrivalDisplay: a.marketValue > 0 ? formatEuros(a.marketValue) : '—',
      wasFree: a.isFree,
      wasLoan: false,
      currentMarketValue,
      currentMarketValueDisplay: currentMarketValue > 0 ? formatEuros(currentMarketValue) : '—',
      soldFor,
      soldForDisplay: soldFor > 0 ? formatEuros(soldFor) : '—',
      valueChange,
      valueChangeDisplay: formatEuros(Math.abs(valueChange)),
      valueChangePct,
      appearances: 0,
      goals: 0,
      assists: 0,
      minutesPlayed: 0,
      status,
      tmUrl: inSquad?.tmUrl || a.tmUrl || '',
    });
  }

  // Sort by value change (best performers first)
  entries.sort((a, b) => b.valueChange - a.valueChange);

  // Fetch performance stats for top 3 players only (each needs 3 season scrapes)
  const topForStats = entries.slice(0, 3);
  for (const entry of topForStats) {
    // Find their TM URL from the squad or try to build one
    const key = normalizePlayerName(entry.name);
    const squadPlayer = squadByName.get(key);
    if (!squadPlayer?.tmUrl) continue;

    try {
      // Aggregate stats across all seasons
      for (const season of seasons) {
        await new Promise((r) => setTimeout(r, 800));
        const stats = await getPlayerPerformanceStats(squadPlayer.tmUrl, season);
        if (stats) {
          entry.appearances += stats.appearances;
          entry.goals += stats.goals;
          entry.assists += stats.assists;
          entry.minutesPlayed += stats.minutes;
        }
      }
    } catch {
      // If stats scraping fails for a player, continue
    }
  }

  // Filter to only "successful" players (positive value change or significant contributions)
  const successful = entries.filter(
    (e) => e.valueChange > 0 || e.goals > 3 || e.assists > 3 || e.appearances > 30
  );

  if (successful.length === 0) {
    // Return all entries sorted by best, even if negative, so there's always data
    const fallback = entries.slice(0, 5);
    return {
      topPlayers: fallback,
      bestPositions: aggregateByPosition(fallback),
      bestAgeRange: aggregateAgeRange(fallback),
      bestNationalities: aggregateByNationality(fallback),
      totalProfit: computeTotalProfit(entries),
      totalProfitDisplay: formatEuros(Math.abs(computeTotalProfit(entries))),
      avgROI: computeAvgROI(entries),
    };
  }

  return {
    topPlayers: successful.slice(0, 5),
    bestPositions: aggregateByPosition(successful),
    bestAgeRange: aggregateAgeRange(successful),
    bestNationalities: aggregateByNationality(successful),
    totalProfit: computeTotalProfit(entries),
    totalProfitDisplay: formatEuros(Math.abs(computeTotalProfit(entries))),
    avgROI: computeAvgROI(entries),
  };
}

function aggregateByPosition(
  players: PlayerSuccessEntry[],
): { position: string; count: number; avgValueChangePct: number }[] {
  const map = new Map<string, { count: number; totalPct: number }>();
  for (const p of players) {
    const pos = p.position || 'Unknown';
    const existing = map.get(pos);
    if (existing) {
      existing.count++;
      existing.totalPct += p.valueChangePct;
    } else {
      map.set(pos, { count: 1, totalPct: p.valueChangePct });
    }
  }
  return Array.from(map.entries())
    .map(([position, { count, totalPct }]) => ({
      position,
      count,
      avgValueChangePct: Math.round(totalPct / count),
    }))
    .sort((a, b) => b.count - a.count);
}

function aggregateAgeRange(
  players: PlayerSuccessEntry[],
): { min: number; max: number; count: number; avgValueChangePct: number } | null {
  const withAge = players.filter((p) => p.ageAtArrival != null);
  if (withAge.length === 0) return null;

  // Group into 4-year buckets, find the most common
  const buckets = new Map<string, { min: number; max: number; count: number; totalPct: number }>();
  for (const p of withAge) {
    const age = p.ageAtArrival!;
    const bucketStart = Math.floor(age / 4) * 4;
    const key = `${bucketStart}-${bucketStart + 3}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
      existing.totalPct += p.valueChangePct;
    } else {
      buckets.set(key, { min: bucketStart, max: bucketStart + 3, count: 1, totalPct: p.valueChangePct });
    }
  }

  const best = Array.from(buckets.values()).sort((a, b) => b.count - a.count)[0];
  if (!best) return null;
  return {
    min: best.min,
    max: best.max,
    count: best.count,
    avgValueChangePct: Math.round(best.totalPct / best.count),
  };
}

function aggregateByNationality(
  players: PlayerSuccessEntry[],
): { country: string; count: number; avgValueChangePct: number }[] {
  const map = new Map<string, { count: number; totalPct: number }>();
  for (const p of players) {
    if (!p.nationality) continue;
    const existing = map.get(p.nationality);
    if (existing) {
      existing.count++;
      existing.totalPct += p.valueChangePct;
    } else {
      map.set(p.nationality, { count: 1, totalPct: p.valueChangePct });
    }
  }
  return Array.from(map.entries())
    .map(([country, { count, totalPct }]) => ({
      country,
      count,
      avgValueChangePct: Math.round(totalPct / count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function computeTotalProfit(entries: PlayerSuccessEntry[]): number {
  return entries.reduce((sum, e) => sum + e.valueChange, 0);
}

function computeAvgROI(entries: PlayerSuccessEntry[]): number {
  const withFee = entries.filter((e) => e.arrivalFee > 0);
  if (withFee.length === 0) return 0;
  const totalPct = withFee.reduce((sum, e) => sum + e.valueChangePct, 0);
  return Math.round(totalPct / withFee.length);
}
