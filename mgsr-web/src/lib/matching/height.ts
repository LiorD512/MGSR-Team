/**
 * Height for request matching (pure module).
 *   - parsePlayerHeightCm: Transfermarkt player height ("1,85 m", "1.85m", "185 cm") → cm
 *   - parseMinHeightFromNotes: a minimum height written in a request's free-text notes → cm
 *   - requestMinHeight: the effective minimum for a request (form field first, notes as fallback)
 */

const MIN_CM = 150;
const MAX_CM = 215;
const inRange = (cm: number) => cm >= MIN_CM && cm <= MAX_CM;

/** "1,85 m" / "1.85m" / "1.85" / "185 cm" / "185" → 185. null when missing or not a height ("Unknown", "-"). */
export function parsePlayerHeightCm(h: string | number | null | undefined): number | null {
  if (typeof h === 'number') return inRange(Math.round(h)) ? Math.round(h) : null;
  const s = (h ?? '').toLowerCase().replace(/\s+/g, '');
  let m = s.match(/^([12])[.,](\d{1,2})m?$/);
  if (m) {
    const cm = parseInt(m[1]!, 10) * 100 + parseInt(m[2]!.padEnd(2, '0'), 10);
    return inRange(cm) ? cm : null;
  }
  m = s.match(/^(\d{3})(cm)?$/);
  if (m) {
    const cm = parseInt(m[1]!, 10);
    return inRange(cm) ? cm : null;
  }
  return null;
}

// Words that make a nearby number a height (EN / HE).
const HEIGHT_WORD = /(height|tall|min(imum)?\.?|at least|above|over|גובה|גבוה|גבוהה|גבוהים|מינימום|לפחות|מעל)/i;
// Units that make a number a height on their own.
const UNIT_AFTER_M = /^\s*(m\b|mt|meter|metre|מ['׳]|מטר)/i;
const UNIT_AFTER_CM = /^\s*(cm\b|ס["״]?מ|סנטימטר)/i;

/**
 * A minimum height written in free text, in cm — or null.
 * Accepts "1.80", "1,80", "1.80m", "180cm", "180 ס״מ", "180+", "מינימום 1.85", "tall (1.88+)".
 * To avoid reading money / other numbers ("€1.80m", "1.5m budget", "salary 180k"), a number counts only when it has a
 * height unit, a "+" right after it, or a height word within ~25 characters; values outside 1.50-2.15 m are ignored.
 * When several heights are written, the lowest one is used (the minimum the club accepts).
 */
export function parseMinHeightFromNotes(notes: string | null | undefined): number | null {
  const text = (notes ?? '').replace(/\s+/g, ' ');
  if (!text.trim()) return null;
  const found: number[] = [];
  // metres: 1.80 / 1,80 (exactly two decimals), not preceded by a currency sign / digit
  const reM = /(^|[^\d€$£.,])([12])[.,](\d{2})(?![\d.,])/g;
  for (let m; (m = reM.exec(text)); ) {
    const cm = parseInt(m[2]!, 10) * 100 + parseInt(m[3]!, 10);
    if (!inRange(cm)) continue;
    const start = m.index + m[1]!.length;
    const end = start + m[0].length - m[1]!.length;
    const after = text.slice(end, end + 12);
    if (/^\s*(k|m(il)?|million|€)/i.test(after) && !UNIT_AFTER_M.test(after)) continue; // "1.80m" is a height, "1.80 mil" money
    const ctx = text.slice(Math.max(0, start - 25), end + 25);
    if (UNIT_AFTER_M.test(after) || /^\s*\+/.test(after) || HEIGHT_WORD.test(ctx)) found.push(cm);
  }
  // centimetres: 180 cm / 180 ס"מ / 180+ / "height 180"
  const reCm = /(^|[^\d€$£.,])(1[5-9]\d|20\d|21[0-5])(?![\d.,])/g;
  for (let m; (m = reCm.exec(text)); ) {
    const cm = parseInt(m[2]!, 10);
    const start = m.index + m[1]!.length;
    const end = start + m[2]!.length;
    const after = text.slice(end, end + 12);
    if (/^\s*(k\b|€|eur|euro|אלף)/i.test(after)) continue;
    const ctx = text.slice(Math.max(0, start - 25), end + 25);
    if (UNIT_AFTER_CM.test(after) || /^\s*\+/.test(after) || HEIGHT_WORD.test(ctx)) found.push(cm);
  }
  return found.length ? Math.min(...found) : null;
}

export interface RequestHeight {
  minCm: number;
  source: 'field' | 'notes';
}

/** Effective minimum height of a request: the form field when filled, otherwise a height found in the notes. */
export function requestMinHeight(req: { minHeight?: number | null; heightDoesntMatter?: boolean | null; notes?: string | null }): RequestHeight | null {
  if (req.heightDoesntMatter === false && req.minHeight && inRange(req.minHeight)) return { minCm: req.minHeight, source: 'field' };
  const fromNotes = parseMinHeightFromNotes(req.notes);
  return fromNotes ? { minCm: fromNotes, source: 'notes' } : null;
}

export const formatHeight = (cm: number) => `${(cm / 100).toFixed(2)} m`;
