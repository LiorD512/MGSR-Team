/**
 * Parses player notes to extract structured data: salary range and free transfer indicator.
 * Ported from app NoteParser.kt for web parity.
 */

export interface NoteModel {
  notes?: string;
  createBy?: string;
  createByHe?: string;
  createdAt?: number;
}

const SALARY_KEYWORDS = /(?:salary|שכר|משכורת|מבקש)\s*[:\-=]?\s*/i;
const SALARY_NUMBER = /(\d+(?:[.,]\d+)?)\s*(?:k|K|k€|€k|thousand|אלף|מיליון)?/;
const FREE_TRANSFER_KEYWORDS = [
  'free transfer',
  'free agent',
  'free',
  'חופשי',
  'העברה חופשית',
  'חינם',
];

function findSalaryNumber(text: string): number | null {
  const lower = text.toLowerCase();
  const keywordMatch = lower.match(SALARY_KEYWORDS);
  if (!keywordMatch) return null;
  const afterIdx = (keywordMatch.index ?? 0) + keywordMatch[0].length;
  const afterKeyword = text.slice(afterIdx).trim();
  const numberMatch = afterKeyword.match(SALARY_NUMBER);
  if (!numberMatch) return null;
  const numStr = numberMatch[1]!.replace(',', '.');
  const value = parseFloat(numStr);
  if (isNaN(value)) return null;
  const fullMatch = numberMatch[0].toLowerCase();
  if (fullMatch.includes('מיליון') || fullMatch.includes('million')) {
    return value * 1000;
  }
  if (value >= 1000) return value / 1000;
  return value;
}

function numberToSalaryRange(value: number): string | null {
  const v = Math.max(0, Math.min(100, Math.floor(value)));
  if (v <= 5) return '>5';
  if (v >= 6 && v <= 10) return '6-10';
  if (v >= 11 && v <= 15) return '11-15';
  if (v >= 16 && v <= 20) return '16-20';
  if (v >= 20 && v <= 25) return '20-25';
  if (v >= 26 && v <= 30) return '26-30';
  if (v > 30) return '30+';
  return null;
}

export function extractSalaryRange(notes: NoteModel[]): string | null {
  const text = notes.map((n) => n.notes ?? '').join(' ').trim();
  if (!text) return null;
  const salaryValue = findSalaryNumber(text);
  if (salaryValue == null) return null;
  return numberToSalaryRange(salaryValue);
}

export function extractFreeTransfer(notes: NoteModel[]): boolean {
  const text = notes.map((n) => n.notes ?? '').join(' ').trim().toLowerCase();
  if (!text) return false;
  return FREE_TRANSFER_KEYWORDS.some((keyword) => {
    const kw = keyword.toLowerCase();
    if (kw.includes(' ')) return text.includes(kw);
    const regex = new RegExp(`(?:^|[\\s,.:;])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[\\s,.:;])`);
    return regex.test(text);
  });
}
