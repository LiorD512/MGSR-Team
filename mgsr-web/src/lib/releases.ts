import type { ReleasePlayer } from './api';

/** Format euro value for display: €150k for <1M, €1.5M for ≥1M. */
export function formatMarketValue(euro: number): string {
  if (!euro || euro <= 0) return '€0';
  if (euro >= 1_000_000) return `€${(euro / 1_000_000).toFixed(euro % 1_000_000 === 0 ? 0 : 1)}M`;
  return `€${Math.round(euro / 1_000)}k`;
}

/** Parse market value string (e.g. "€1.5m", "€500k") to number for sorting. */
export function parseMarketValue(value: string | undefined): number {
  if (!value || value.includes('-')) return 0;
  const cleaned = value.replace(/[€\s]/g, '').toLowerCase();
  if (cleaned.includes('k')) {
    return (parseFloat(cleaned.replace('k', '')) || 0) * 1000;
  }
  if (cleaned.includes('m')) {
    return (parseFloat(cleaned.replace('m', '')) || 0) * 1_000_000;
  }
  return parseFloat(cleaned) || 0;
}

/** Sort players by market value descending (highest first). */
export function sortByMarketValue(players: ReleasePlayer[]): ReleasePlayer[] {
  return [...players].sort((a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue));
}

/** Parse release date string (DD/MM/YYYY) to timestamp for sorting. */
function parseReleaseDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const parts = dateStr.trim().split(/[/.-]/);
  if (parts.length !== 3) return 0;
  const [d, m, y] = parts.map((p) => parseInt(p, 10));
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return 0;
  return new Date(y, m - 1, d).getTime();
}

/** Sort players by release date descending (newest first). */
export function sortByReleaseDate(players: ReleasePlayer[]): ReleasePlayer[] {
  return [...players].sort((a, b) => parseReleaseDate(b.transferDate) - parseReleaseDate(a.transferDate));
}

/** Sort players by age ascending (youngest first). */
export function sortByAge(players: ReleasePlayer[]): ReleasePlayer[] {
  return [...players].sort((a, b) => {
    const ageA = parseAge(a.playerAge) ?? 999;
    const ageB = parseAge(b.playerAge) ?? 999;
    return ageA - ageB;
  });
}

export type SortBy = 'value' | 'date' | 'age';

export function sortReleases(players: ReleasePlayer[], sortBy: SortBy): ReleasePlayer[] {
  switch (sortBy) {
    case 'date':
      return sortByReleaseDate(players);
    case 'age':
      return sortByAge(players);
    default:
      return sortByMarketValue(players);
  }
}

/** Extract unique positions from players for filter options. */
export function getUniquePositions(players: ReleasePlayer[]): string[] {
  const set = new Set<string>();
  for (const p of players) {
    const pos = p.playerPosition?.trim();
    if (pos) set.add(pos);
  }
  return Array.from(set).sort();
}

/** Parse age string to number (e.g. "23" -> 23). */
export function parseAge(age: string | undefined): number | null {
  if (!age) return null;
  const n = parseInt(age, 10);
  return Number.isNaN(n) ? null : n;
}

export type AgeFilter = 'all' | 'u23' | '23-30' | '30+';

export function filterByAge(players: ReleasePlayer[], ageFilter: AgeFilter): ReleasePlayer[] {
  if (ageFilter === 'all') return players;
  return players.filter((p) => {
    const age = parseAge(p.playerAge);
    if (age === null) return true;
    if (ageFilter === 'u23') return age < 23;
    if (ageFilter === '23-30') return age >= 23 && age <= 30;
    if (ageFilter === '30+') return age > 30;
    return true;
  });
}
