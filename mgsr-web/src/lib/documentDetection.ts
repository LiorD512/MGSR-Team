/**
 * Document detection utilities - mandate expiry parsing from text.
 * Matches Android DocumentDetectionService regex patterns.
 */

const MANDATE_EXPIRY_PATTERNS = [
  /ends on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  /end on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  /ends on\s+(\d{1,2})-(\d{1,2})-(\d{4})/i,
  /ends on\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i,
  /and ends on\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
  /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\([^)]*Term[^)]*\)/i,
];

export function extractMandateExpiryFromText(text: string): number | null {
  for (const regex of MANDATE_EXPIRY_PATTERNS) {
    const match = text.match(regex);
    if (match) {
      const [, d, m, y] = match;
      if (d && m && y) {
        try {
          const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 23, 59, 59, 999);
          return date.getTime();
        } catch {
          continue;
        }
      }
    }
  }
  // Fallback: find Term line with dates
  const dateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  const termLines = text.split('\n').filter(
    (line) =>
      (/Term/i.test(line) && /Mandate/i.test(line)) ||
      (/Term/i.test(line) && /starts|ends/i.test(line)) ||
      (/starts/i.test(line) && /ends/i.test(line))
  );
  const searchLine = termLines[0];
  if (searchLine) {
    const dates = Array.from(searchLine.matchAll(dateRegex));
    const target = dates.length >= 2 ? dates[dates.length - 1] : dates.length === 1 && /ends/i.test(searchLine) ? dates[0] : null;
    if (target) {
      const [, d, m, y] = target;
      try {
        return new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, parseInt(d!, 10), 23, 59, 59, 999).getTime();
      } catch {
        // ignore
      }
    }
  }
  return null;
}

export function isMandateByContent(text: string, fileName: string): boolean {
  const fileNameLower = fileName.toLowerCase().replace(/\.[^.]+$/, '');
  const isMandateFilename = fileNameLower.startsWith('mandate_') || fileNameLower.startsWith('mandate ');
  const hasMandateContent =
    /FOOTBALL AGENT MANDATE/i.test(text) ||
    (/Mandate/i.test(text) && /ends on/i.test(text)) ||
    (/AUTHORIZATION/i.test(text) && /represent.*player/i.test(text));
  return isMandateFilename || hasMandateContent;
}

export function extractNameFromMandateFilename(fileName: string): string | null {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const idx = withoutExt.toLowerCase().indexOf('mandate');
  if (idx < 0) return null;
  const after = withoutExt.slice(idx + 7).replace(/^[\s_-]+/, '');
  return after || null;
}
