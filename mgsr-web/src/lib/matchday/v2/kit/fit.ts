/**
 * Text fitting. satori has no auto-shrink, so long surnames / club names would
 * overflow. We estimate the rendered width from per-font average glyph widths
 * (em fraction, measured for UPPER-CASE) and pick the largest size that fits.
 */

/** Average advance width of an upper-case glyph, as a fraction of font-size. */
export const GLYPH_EM: Record<string, number> = {
  Anton: 0.47,
  Bebas: 0.4,
  DMSerif: 0.66,
  Cinzel: 0.78,
  Montserrat: 0.7,
  SpaceMono: 0.6,
  ArchivoBlack: 0.78,
};

export function estimateWidth(text: string, fontSize: number, family: string, letterSpacing = 0): number {
  const em = GLYPH_EM[family] ?? 0.65;
  return text.length * (fontSize * em + letterSpacing);
}

/** Largest font size (clamped to [min,max]) whose estimated width ≤ maxWidth. */
export function fitFontSize(
  text: string,
  maxWidth: number,
  family: string,
  max: number,
  min: number,
  letterSpacing = 0
): number {
  const em = GLYPH_EM[family] ?? 0.65;
  const len = Math.max(1, text.length);
  const size = Math.floor((maxWidth / len - letterSpacing) / em);
  return Math.max(min, Math.min(max, size));
}

/** Split a full name into [given, surname]. Single names → ['', name]. */
export function splitName(full: string): { given: string; surname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { given: '', surname: full.trim() };
  return { given: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] };
}

/**
 * Break a very long surname (e.g. "KONSTANTINOPOLSKYI-PAPADOPOULOS") into at most
 * two lines at the hyphen/space nearest the middle, so display type can stay
 * large instead of shrinking to fit one line. Short names stay on one line.
 */
export function wrapSurname(surname: string, singleLineMax = 11): string[] {
  const s = surname.trim();
  if (s.length <= singleLineMax) return [s];
  const mid = s.length / 2;
  let best = -1;
  for (let k = 1; k < s.length - 1; k++) {
    if (s[k] === '-' || s[k] === ' ') {
      if (best < 0 || Math.abs(k - mid) < Math.abs(best - mid)) best = k;
    }
  }
  if (best < 0) return [s];
  const a = s.slice(0, best + (s[best] === '-' ? 1 : 0)).trim();
  const b = s.slice(best + 1).trim();
  return a && b ? [a, b] : [s];
}

/**
 * One-line text that is guaranteed to fit `maxW`: the largest size in
 * [min, max] that fits, and — only if even `min` is too wide — the text is
 * shortened with an ellipsis. Estimates are padded 6 % to stay on the safe side.
 */
export function fitText(text: string, maxW: number, family: string, max: number, min: number, letterSpacing = 0): { size: number; text: string } {
  const safeW = maxW / 1.06;
  const size = fitFontSize(text, safeW, family, max, min, letterSpacing);
  if (estimateWidth(text, size, family, letterSpacing) <= safeW) return { size, text };
  let t = text;
  while (t.length > 4 && estimateWidth(`${t}…`, min, family, letterSpacing) > safeW) t = t.slice(0, -1);
  return { size: min, text: `${t.trimEnd()}…` };
}

/**
 * Competition kicker ("COUNTRY: LEAGUE • ROUND") fitted to a width. Tries the
 * full line, then without the "Country:" prefix, then without the round, and
 * only then truncates — so long leagues lose the least important part first.
 */
export function compLineFit(
  facts: { competition?: string | null; country?: string | null; round?: string | null },
  maxW: number,
  family: string,
  max: number,
  min: number,
  letterSpacing = 0,
  sep = '  •  '
): { size: number; text: string } {
  const comp = (facts.competition ?? '').trim();
  const country = (facts.country ?? '').trim();
  const round = (facts.round ?? '').trim();
  const hasCountry = country && comp.toLowerCase().includes(country.toLowerCase());
  const bare = comp.replace(/^[^:]{2,40}:\s*/, '');
  const candidates = [
    [hasCountry ? '' : country, comp, round],
    [bare, round],
    [bare],
  ].map((parts) => parts.filter(Boolean).join(sep).toUpperCase() || 'MATCHDAY');
  for (const c of candidates) {
    const s = fitFontSize(c, maxW / 1.06, family, max, min, letterSpacing);
    if (estimateWidth(c, s, family, letterSpacing) <= maxW / 1.06) return { size: s, text: c };
  }
  return fitText(candidates[candidates.length - 1], maxW, family, max, min, letterSpacing);
}
