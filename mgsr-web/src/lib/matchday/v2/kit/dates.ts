/**
 * Fixture date helpers.
 *
 * The dossier hands us the date as a string produced by Intl en-GB
 * ("09/10/2026" = 9 Oct 2026, day first). A poster is clearer with an
 * unambiguous "SAT 9 OCT" and a countdown badge ("TOMORROW").
 * Everything degrades to the raw string if the date can't be parsed — we never
 * invent or guess a date.
 */

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export interface ParsedDate {
  day: number;
  month: number; // 1-12
  year: number;
}

/** Parse DD/MM/YYYY, DD.MM.YYYY or DD-MM-YYYY (day first). Null if invalid. */
export function parseFixtureDate(raw: string | null | undefined): ParsedDate | null {
  const m = (raw ?? '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return null; // e.g. 31/02
  return { day, month, year };
}

function utcMs(p: ParsedDate): number {
  return Date.UTC(p.year, p.month - 1, p.day);
}

export interface PosterDate {
  /** "SAT" */
  weekday: string;
  /** "9" */
  day: string;
  /** "OCT" */
  month: string;
  year: string;
  /** "SAT 9 OCT" */
  short: string;
  /** "SATURDAY 9 OCTOBER 2026" style long line, upper-case. */
  long: string;
}

const LONG_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const LONG_MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

export function posterDate(raw: string | null | undefined): PosterDate | null {
  const p = parseFixtureDate(raw);
  if (!p) return null;
  const dow = new Date(utcMs(p)).getUTCDay();
  return {
    weekday: DAYS[dow],
    day: String(p.day),
    month: MONTHS[p.month - 1],
    year: String(p.year),
    short: `${DAYS[dow]} ${p.day} ${MONTHS[p.month - 1]}`,
    long: `${LONG_DAYS[dow]} ${p.day} ${LONG_MONTHS[p.month - 1]} ${p.year}`,
  };
}

/**
 * Countdown badge text relative to `now` (calendar days, UTC), or null when the
 * match is far away / in the past / the date is unparseable.
 */
export function countdownLabel(raw: string | null | undefined, now: Date = new Date()): string | null {
  const p = parseFixtureDate(raw);
  if (!p) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((utcMs(p) - today) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'TODAY';
  if (days === 1) return 'TOMORROW';
  if (days <= 6) return `IN ${days} DAYS`;
  return null;
}
