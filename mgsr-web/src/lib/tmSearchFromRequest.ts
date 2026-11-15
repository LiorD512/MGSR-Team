/**
 * Client-safe helpers for the Transfermarkt search screen:
 * filter model, smart-bar parser, and converting a club request into search filters.
 * (No server imports here: this file is bundled into the browser.)
 */
import type { Confederation } from './api';
import { TM_COUNTRIES } from './tmCountries';

export interface TmSearchForm {
  position: string | null;
  /** Age bounds as strings so an empty field means "no limit". */
  minAge: string;
  maxAge: string;
  /** Euros */
  minValue: string;
  maxValue: string;
  /** Centimetres */
  minHeight: string;
  maxHeight: string;
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
  minHeight: '',
  maxHeight: '',
  confederation: null,
  countryId: null,
  foot: null,
  contractYear: null,
  freeAgentsOnly: false,
  excludeLoans: false,
};

export const TM_SEARCH_POSITIONS = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'] as const;

/** Slider steps for market value (euros). Last step = "no maximum". */
export const TM_VALUE_STEPS = [
  0, 50e3, 100e3, 150e3, 200e3, 300e3, 400e3, 500e3, 750e3, 1e6, 1.5e6, 2e6, 3e6, 5e6, 8e6, 10e6, 15e6, 20e6, 30e6, 50e6, 200e6,
];
export const TM_AGE_MIN = 14;
export const TM_AGE_MAX = 45; // slider end = "45+" = no maximum
export const TM_HEIGHT_MIN = 155;
export const TM_HEIGHT_MAX = 205; // slider end = "205+" = no maximum

export interface RequestForSearch {
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  dominateFoot?: string;
  transferFee?: string;
  euOnly?: boolean;
  /** Not stored on requests yet. Used automatically if/when requests carry a height range (cm). */
  minHeight?: number;
  maxHeight?: number;
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
    minHeight: req.minHeight ? String(req.minHeight) : '',
    maxHeight: req.maxHeight ? String(req.maxHeight) : '',
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
  if (form.minHeight) sp.set('minHeight', form.minHeight);
  if (form.maxHeight) sp.set('maxHeight', form.maxHeight);
  if (form.countryId) sp.set('countryId', String(form.countryId));
  else if (form.confederation) sp.set('confederation', form.confederation);
  if (form.foot) sp.set('foot', form.foot);
  if (form.contractYear) sp.set('contractYear', String(form.contractYear));
  if (form.freeAgentsOnly) sp.set('freeAgents', '1');
  if (form.excludeLoans) sp.set('excludeLoans', '1');
  if (page > 1) sp.set('page', String(page));
  return sp.toString();
}

export function isEmptySearchForm(f: TmSearchForm): boolean {
  return JSON.stringify(f) === JSON.stringify(EMPTY_TM_SEARCH_FORM);
}

// ─── Smart bar: "CF 18-23 under 3m africa left foot 185+" ─────────────────────

const POSITION_WORDS: Record<string, string> = {
  gk: 'GK', keeper: 'GK', goalkeeper: 'GK', cb: 'CB', defender: 'CB', lb: 'LB', rb: 'RB', dm: 'DM', cm: 'CM', am: 'AM',
  lw: 'LW', rw: 'RW', ss: 'SS', cf: 'CF', st: 'CF', striker: 'CF', forward: 'CF',
};
/** Multi-word positions are matched first so "left back" is not read as "left foot". */
const POSITION_PHRASES: Array<[string, string]> = [
  ['left back', 'LB'], ['right back', 'RB'], ['centre back', 'CB'], ['center back', 'CB'], ['left winger', 'LW'],
  ['right winger', 'RW'], ['centre forward', 'CF'], ['center forward', 'CF'], ['second striker', 'SS'],
  ['defensive midfielder', 'DM'], ['central midfielder', 'CM'], ['attacking midfielder', 'AM'],
];
const REGION_WORDS: Record<string, Confederation> = {
  africa: 'CAF', caf: 'CAF', europe: 'UEFA', uefa: 'UEFA', asia: 'AFC', afc: 'AFC',
  'south america': 'CONMEBOL', conmebol: 'CONMEBOL', concacaf: 'CONCACAF', 'north america': 'CONCACAF', oceania: 'OFC', ofc: 'OFC',
};

const COUNTRIES_BY_LENGTH = [...TM_COUNTRIES].sort((a, b) => b.name.length - a.name.length);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function amount(token: string): number | null {
  const a = parseAmount(token.replace(/€/g, ''));
  if (!a) return null;
  // In the bar a bare number is euros ("500000"), only k / m multiply.
  return Math.round(a.n * (a.unit === 'm' ? 1_000_000 : a.unit === 'k' ? 1_000 : 1));
}

const H = '(1[4-9]\\d|2[0-2]\\d)'; // 140–229, unmistakably a height in cm (ages are 2 digits)

/**
 * Turns free text into filters. Returns how many tokens were understood (0 = nothing recognised,
 * the caller keeps the previous filters).
 */
export function parseSearchText(text: string): { form: TmSearchForm; hits: number } {
  const o: TmSearchForm = { ...EMPTY_TM_SEARCH_FORM };
  let t = ` ${text.toLowerCase().replace(/[,·]/g, ' ')} `;
  let hits = 0;
  let m: RegExpMatchArray | null;
  const eat = (re: RegExp): RegExpMatchArray | null => {
    const r = t.match(re);
    if (r) { t = t.replace(r[0], ' '); hits++; }
    return r;
  };

  for (const [phrase, code] of POSITION_PHRASES) {
    if (eat(new RegExp(`\\s${phrase}\\s`))) o.position = code;
  }
  for (const [word, conf] of Object.entries(REGION_WORDS)) {
    if (eat(new RegExp(`\\s${word}\\s`))) o.confederation = conf;
  }
  if (eat(/\s(free agents?|without club|no club|free)\s/)) o.freeAgentsOnly = true;
  if ((m = eat(/\s(left|right|both)\s*(foot|footed)?\s/))) o.foot = m[1] as TmSearchForm['foot'];
  if ((m = eat(/\s(?:contract|exp|expiring|until)\s*(20\d\d)\s/))) o.contractYear = Number(m[1]);

  // Height first: 3-digit numbers / "cm" / "1.85m" can't be ages or values.
  if ((m = eat(new RegExp(`\\s${H}\\s*[-–]\\s*${H}\\s*(?:cm)?\\s`)))) { o.minHeight = m[1]; o.maxHeight = m[2]; }
  else if ((m = eat(/\s1[.,](\d\d)\s*[-–]\s*1[.,](\d\d)\s*m?\s/))) { o.minHeight = `1${m[1]}`; o.maxHeight = `1${m[2]}`; }
  else if ((m = eat(new RegExp(`\\s(?:height\\s*)?${H}\\s*(?:cm)?\\s*\\+\\s`)))) o.minHeight = m[1];
  else if ((m = eat(/\s(?:height\s*)?1[.,](\d\d)\s*m?\s*\+\s/))) o.minHeight = `1${m[1]}`;
  else if ((m = eat(new RegExp(`\\s(?:over|above|taller than|min(?:imum)?|from)\\s*${H}\\s*(?:cm)?\\s`)))) o.minHeight = m[1];
  else if ((m = eat(new RegExp(`\\s(?:under|below|shorter than|max(?:imum)?|up to)\\s*${H}\\s*(?:cm)\\s`)))) o.maxHeight = m[1];
  else if ((m = eat(new RegExp(`\\s(?:under|below|shorter than|max(?:imum)?|up to)\\s*${H}\\s`)))) o.maxHeight = m[1];
  else if ((m = eat(new RegExp(`\\s${H}\\s*cm\\s`)))) { o.minHeight = String(Number(m[1]) - 2); o.maxHeight = String(Number(m[1]) + 2); }
  else if ((m = eat(/\s(?:tall|big)\s/))) o.minHeight = '190';

  // "u23" = 23 or younger; "under 24" = younger than 24 = 23 or younger.
  if ((m = eat(/\s(u|under\s*)(\d\d)\s/))) o.maxAge = String(m[1] === 'u' ? Number(m[2]) : Number(m[2]) - 1);
  else if ((m = eat(/\s(\d\d)\s*[-–]\s*(\d\d)\s/))) { o.minAge = m[1]; o.maxAge = m[2]; }
  else if ((m = eat(/\s(\d\d)\s*\+\s/))) o.minAge = m[1];

  if ((m = t.match(/\s(?:under|up to|max|<|below)\s*€?([\d.]+\s*[km]?)\s/))) {
    const v = amount(m[1].replace(/\s/g, ''));
    t = t.replace(m[0], ' ');
    if (v != null) { o.maxValue = String(v); hits++; }
  } else if ((m = t.match(/\s€?([\d.]+[km]?)\s*[-–]\s*€?([\d.]+[km]?)\s/))) {
    const a = amount(m[1]);
    const b = amount(m[2]);
    t = t.replace(m[0], ' ');
    if (a != null && b != null) { o.minValue = String(a); o.maxValue = String(b); hits++; }
  } else if ((m = t.match(/\s(?:over|above|from|>)\s*€?([\d.]+\s*[km]?)\s/))) {
    const v = amount(m[1].replace(/\s/g, ''));
    t = t.replace(m[0], ' ');
    if (v != null) { o.minValue = String(v); hits++; }
  }

  for (const c of COUNTRIES_BY_LENGTH) {
    if (eat(new RegExp(`\\s${escapeRe(c.name.toLowerCase())}\\s`))) { o.countryId = c.id; break; }
  }
  for (const w of o.position ? [] : t.split(/\s+/)) {
    if (POSITION_WORDS[w]) { o.position = POSITION_WORDS[w]; hits++; break; }
  }
  return { form: o, hits };
}

export function fmtEuro(n: number): string {
  if (n >= 1e6) return `€${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1e3) return `€${Math.round(n / 1e3)}k`;
  return '€0';
}

/** Plain-text summary of a form, shown in the smart bar when filters are changed with the mouse. */
export function describeSearchForm(f: TmSearchForm): string {
  const a: string[] = [];
  if (f.position) a.push(f.position);
  if (f.minAge || f.maxAge) a.push(f.minAge && f.maxAge ? `${f.minAge}-${f.maxAge}` : f.maxAge ? `u${f.maxAge}` : `${f.minAge}+`);
  if (f.minValue || f.maxValue) {
    a.push(f.minValue && f.maxValue ? `${fmtEuro(+f.minValue)}-${fmtEuro(+f.maxValue)}` : f.maxValue ? `up to ${fmtEuro(+f.maxValue)}` : `from ${fmtEuro(+f.minValue)}`);
  }
  if (f.minHeight || f.maxHeight) {
    a.push(f.minHeight && f.maxHeight ? `${f.minHeight}-${f.maxHeight}cm` : f.maxHeight ? `under ${f.maxHeight}cm` : `${f.minHeight}cm+`);
  }
  if (f.countryId) a.push(TM_COUNTRIES.find((c) => c.id === f.countryId)?.name ?? '');
  else if (f.confederation) a.push(f.confederation);
  if (f.foot) a.push(`${f.foot} foot`);
  if (f.contractYear) a.push(`contract ${f.contractYear}`);
  if (f.freeAgentsOnly) a.push('free agent');
  return a.filter(Boolean).join(' ');
}
