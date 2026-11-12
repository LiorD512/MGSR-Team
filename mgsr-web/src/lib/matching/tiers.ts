/**
 * Tier strings → numeric bands.
 *
 * The request / player forms store budgets as tier labels from `Config/transferFees` and `Config/salaryRanges`
 * (e.g. "300-600", "900k-1m", "1-1.5m", "10m+", "Free/Free loan", ">5", "30-35", "100+"), and older data still has
 * legacy labels ("700-900", "1m+"). Instead of comparing positions in a hard-coded list (which silently broke for any
 * label not in the list), every label is parsed into a numeric range so any current or future tier compares correctly.
 *
 * Pure module (no Firebase / React) — shared by the web app and the Node audit script.
 */

export interface Band {
  /** Lower bound (inclusive). */
  lo: number;
  /** Upper bound (inclusive). `Infinity` for open-ended tiers like "10m+". */
  hi: number;
  /** Fee tiers only: the club wants a free transfer / free loan. */
  free?: boolean;
}

const EMPTY = new Set(['', 'n/a', 'na', '-', '—', 'none', 'any']);

/** One numeric token with optional unit; `defaultMult` applies when the token has no unit. */
function tokenValue(tok: string, defaultMult: number): number | null {
  const m = tok.trim().match(/^(\d+(?:[.,]\d+)?)\s*(k|th\.?|m|mil|bn)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('bn')) return n * 1_000_000_000;
  if (unit.startsWith('m')) return n * 1_000_000;
  if (unit.startsWith('k') || unit.startsWith('th')) return n * 1_000;
  return n * defaultMult;
}

/**
 * Transfer-fee tier → band in euros.
 * Numbers without a unit are thousands ("300-600" = €300k-€600k); a trailing "m" applies to unit-less tokens on the
 * same label ("1-1.5m" = €1m-€1.5m).
 */
export function parseFeeBand(label: string | null | undefined): Band | null {
  const raw = (label ?? '').trim().toLowerCase().replace(/[€\s]/g, '');
  if (EMPTY.has(raw)) return null;
  if (raw.includes('free')) return { lo: 0, hi: 0, free: true };
  const below = raw.startsWith('<');
  const open = raw.endsWith('+');
  const body = raw.replace(/^[<>]/, '').replace(/\+$/, '');
  const tokens = body.split('-').filter(Boolean);
  if (tokens.length === 0 || tokens.length > 2) return null;
  // The label's unit is the unit written on the last token ("1-1.5m" → m); unit-less tokens inherit it (default k).
  const lastUnit = tokens[tokens.length - 1]!.match(/(k|th\.?|m|mil|bn)$/i)?.[1]?.toLowerCase();
  const mult = lastUnit?.startsWith('bn') ? 1_000_000_000 : lastUnit?.startsWith('m') ? 1_000_000 : 1_000;
  const values = tokens.map((t) => tokenValue(t, mult));
  if (values.some((v) => v == null)) return null;
  const [a, b] = values as number[];
  if (below) return { lo: 0, hi: a! };
  if (open) return { lo: a!, hi: Infinity };
  if (b == null) return { lo: a!, hi: a! };
  return { lo: Math.min(a!, b), hi: Math.max(a!, b) };
}

/**
 * Salary tier → band in €K per month. ">5" is the first tier of the list ("up to 5"), "30+" is open-ended.
 */
export function parseSalaryBand(label: string | null | undefined): Band | null {
  const raw = (label ?? '').trim().toLowerCase().replace(/[€\s]/g, '').replace(/k$/, '');
  if (EMPTY.has(raw)) return null;
  const num = (t: string) => {
    const n = parseFloat(t.replace(/k$/, ''));
    return Number.isFinite(n) ? n : null;
  };
  if (raw.startsWith('>') || raw.startsWith('<')) {
    const v = num(raw.slice(1));
    return v == null ? null : { lo: 0, hi: v };
  }
  if (raw.endsWith('+')) {
    const v = num(raw.slice(0, -1));
    return v == null ? null : { lo: v, hi: Infinity };
  }
  const parts = raw.split('-');
  if (parts.length === 2) {
    const a = num(parts[0]!);
    const b = num(parts[1]!);
    if (a == null || b == null) return null;
    return { lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  const v = num(raw);
  return v == null ? null : { lo: v, hi: v };
}

/**
 * Transfermarkt-style market value → euros. Handles "€1.50m", "€500k", "€500Th.", "€1.2bn", "1,500,000".
 * Returns 0 when empty / "-" / unparseable.
 */
export function parseEuros(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  const s = (value ?? '').trim().toLowerCase().replace(/[€$£\s]/g, '');
  if (!s || s === '-' || s === '—') return 0;
  const m = s.match(/^(\d+(?:[.,]\d+)*)(k|th\.?|m|mil\.?|bn)?$/);
  if (!m) return 0;
  let numStr = m[1]!;
  // "1,500,000" → thousands separators; "1,5" → decimal comma
  if (/^\d{1,3}(,\d{3})+$/.test(numStr)) numStr = numStr.replace(/,/g, '');
  else numStr = numStr.replace(',', '.');
  const n = parseFloat(numStr);
  if (!Number.isFinite(n)) return 0;
  const unit = m[2] || '';
  if (unit.startsWith('bn')) return n * 1_000_000_000;
  if (unit.startsWith('m')) return n * 1_000_000;
  if (unit.startsWith('k') || unit.startsWith('th')) return n * 1_000;
  return n;
}
