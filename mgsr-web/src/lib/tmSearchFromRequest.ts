/**
 * Client-safe helpers for the Transfermarkt search screen:
 * filter model + converting a club request into search filters.
 */
import type { Confederation } from './api';

export interface TmSearchForm {
  position: string | null;
  minAge: string;
  maxAge: string;
  minValue: string;
  maxValue: string;
  confederation: Confederation | null;
  countryId: number | null;
  foot: 'left' | 'right' | 'both' | null;
  contractYear: number | null;
  freeAgentsOnly: boolean;
  excludeLoans: boolean;
}

export const EMPTY_TM_SEARCH_FORM: TmSearchForm = {
  position: null,
  minAge: '',
  maxAge: '',
  minValue: '',
  maxValue: '',
  confederation: null,
  countryId: null,
  foot: null,
  contractYear: null,
  freeAgentsOnly: false,
  excludeLoans: false,
};

export const TM_SEARCH_POSITIONS = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'] as const;

export interface RequestForSearch {
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  dominateFoot?: string;
  transferFee?: string;
  euOnly?: boolean;
}

function parseAmount(token: string): { n: number; unit: 'k' | 'm' | null } | null {
  const m = token.trim().toLowerCase().match(/^([\d.]+)\s*(k|m)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  return { n, unit: (m[2] as 'k' | 'm' | undefined) ?? null };
}

const toEuros = (n: number, unit: 'k' | 'm' | null) => Math.round(n * (unit === 'm' ? 1_000_000 : 1_000));

/**
 * Transfer-fee label from a request ("<200", "300-600", "900k-1m", "1-1.5m", "10m+",
 * "Free/Free loan") to the upper bound of the fee in euros. null = no upper bound / unknown.
 * Numbers without a unit are thousands (the fee tiers are expressed in k).
 */
export function transferFeeUpperBound(fee: string | undefined): number | null {
  const lower = (fee || '').trim().toLowerCase().replace(/€/g, '');
  if (!lower) return null;
  if (lower.startsWith('free')) return 150_000;
  if (lower.endsWith('+')) return null;
  if (lower.startsWith('<')) {
    const a = parseAmount(lower.slice(1));
    return a ? toEuros(a.n, a.unit) : null;
  }
  const parts = lower.split('-');
  if (parts.length === 2) {
    const lo = parseAmount(parts[0]);
    const hi = parseAmount(parts[1]);
    if (!hi) return null;
    // "1-1.5m": the first part inherits the unit of the second unless it's clearly thousands ("900-1m").
    if (lo && !lo.unit && hi.unit === 'm' && lo.n >= hi.n) return toEuros(hi.n, 'm');
    return toEuros(hi.n, hi.unit);
  }
  const single = parseAmount(lower);
  return single ? toEuros(single.n, single.unit) : null;
}

/**
 * Build a search form from a club request. Market value ceiling is 2x the fee ceiling,
 * mirroring `matchesMarketValueVsTransferFee` in requestMatcher.ts (a player's market value
 * is often well above what clubs actually pay).
 */
export function requestToSearchForm(req: RequestForSearch): {
  form: TmSearchForm;
  feeCeiling: number | null;
} {
  const pos = (req.position || '').trim().toUpperCase();
  const position = pos === 'ST' ? 'CF' : pos;
  const feeMax = transferFeeUpperBound(req.transferFee);
  const foot = (req.dominateFoot || '').trim().toLowerCase();

  const form: TmSearchForm = {
    ...EMPTY_TM_SEARCH_FORM,
    position: (TM_SEARCH_POSITIONS as readonly string[]).includes(position) ? position : null,
    minAge: !req.ageDoesntMatter && req.minAge ? String(req.minAge) : '',
    maxAge: !req.ageDoesntMatter && req.maxAge ? String(req.maxAge) : '',
    maxValue: feeMax ? String(feeMax * 2) : '',
    foot: foot === 'left' || foot === 'right' || foot === 'both' ? foot : null,
    confederation: req.euOnly ? 'UEFA' : null,
  };
  return { form, feeCeiling: feeMax };
}

/** Query string for /api/transfermarkt/advanced-search */
export function searchFormToQuery(form: TmSearchForm, page = 1): string {
  const sp = new URLSearchParams();
  if (form.position) sp.set('position', form.position);
  if (form.minAge) sp.set('minAge', form.minAge);
  if (form.maxAge) sp.set('maxAge', form.maxAge);
  if (form.minValue) sp.set('minValue', form.minValue);
  if (form.maxValue) sp.set('maxValue', form.maxValue);
  if (form.countryId) sp.set('countryId', String(form.countryId));
  else if (form.confederation) sp.set('confederation', form.confederation);
  if (form.foot) sp.set('foot', form.foot);
  if (form.contractYear) sp.set('contractYear', String(form.contractYear));
  if (form.freeAgentsOnly) sp.set('freeAgents', '1');
  if (form.excludeLoans) sp.set('excludeLoans', '1');
  if (page > 1) sp.set('page', String(page));
  return sp.toString();
}
