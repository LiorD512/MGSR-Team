/**
 * Shortlist intelligence: Contact Score, value parsing, badges.
 * Used by the shortlist page for enrichment and display.
 */

/** Parse market value string to euros (number). Returns 0 for empty or "-". */
export function parseMarketValueToEuros(s: string | undefined): number {
  if (!s?.trim() || s.includes('-')) return 0;
  const t = s.replace(/[€\s]/g, '').toLowerCase();
  if (t.includes('k')) return (parseFloat(t.replace('k', '')) || 0) * 1000;
  if (t.includes('m')) return (parseFloat(t.replace('m', '')) || 0) * 1_000_000;
  return parseFloat(t) || 0;
}

/** Compute value change percentage. Returns null if cannot compute. */
export function computeValueChangePercent(
  oldValue: string | undefined,
  newValue: string | undefined
): number | null {
  const oldE = parseMarketValueToEuros(oldValue);
  const newE = parseMarketValueToEuros(newValue);
  if (oldE <= 0) return null;
  return Math.round(((newE - oldE) / oldE) * 100);
}

/** Check if player is free agent (no club or "Without Club" / "Vereinslos"). */
export function isFreeAgent(clubName: string | undefined): boolean {
  if (!clubName?.trim()) return true;
  const lower = clubName.toLowerCase();
  return lower === 'without club' || lower === 'vereinslos' || lower === 'ללא מועדון';
}

/** Parse contract expiry to months from now. Returns null if unknown. */
export function monthsUntilContractExpiry(contractExpires: string | undefined): number | null {
  if (!contractExpires?.trim()) return null;
  const monthNames: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m1 = contractExpires.match(/(\w{3})\s*\d{0,2},?\s*(\d{4})/i);
  const m2 = contractExpires.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  let date: Date | null = null;
  if (m1 && m1[1] && m1[2]) {
    const month = monthNames[m1[1].toLowerCase().slice(0, 3)] ?? 0;
    date = new Date(parseInt(m1[2], 10), month, 1);
  } else if (m2 && m2[1] && m2[2] && m2[3]) {
    date = new Date(parseInt(m2[3], 10), parseInt(m2[2], 10) - 1, parseInt(m2[1], 10));
  }
  if (!date || isNaN(date.getTime())) return null;
  const now = new Date();
  const months = Math.round((date.getTime() - now.getTime()) / (30 * 24 * 60 * 60 * 1000));
  return months;
}

/** Contact Score 1–10 based on: request matches, free agent, contract expiring, value drop, performance. */
export function computeContactScore(params: {
  requestMatchCount: number;
  isFreeAgent: boolean;
  contractMonthsLeft: number | null;
  valueChangePercent: number | null;
  minutes?: number;
  goals?: number;
  assists?: number;
}): number {
  let score = 3; // base
  if (params.requestMatchCount >= 3) score += 3;
  else if (params.requestMatchCount >= 2) score += 2;
  else if (params.requestMatchCount >= 1) score += 1;
  if (params.isFreeAgent) score += 2;
  if (params.contractMonthsLeft != null && params.contractMonthsLeft <= 6 && params.contractMonthsLeft > 0) score += 1;
  if (params.valueChangePercent != null && params.valueChangePercent < -10) score += 1; // value dropped = opportunity
  if (params.minutes != null && params.minutes >= 1500) score += 0.5; // regular starter
  const ga = (params.goals ?? 0) + (params.assists ?? 0);
  if (ga >= 5) score += 0.5; // productive
  return Math.min(10, Math.max(1, Math.round(score * 2) / 2)); // allow half-points, cap at 10
}


/** Days since timestamp. */
export function daysSince(ts: number | undefined): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}
