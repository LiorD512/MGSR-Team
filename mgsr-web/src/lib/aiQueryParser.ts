/**
 * AI-powered parsing of free-text scout queries (Hebrew and English).
 * Uses Gemini to analyze the request and extract structured recruitment params.
 */

export interface ParsedScoutParams {
  position?: string;
  ageMin?: number;
  ageMax?: number;
  notes?: string;
  transferFee?: string;
  salaryRange?: string;
  limit?: number;
  /** Human-readable summary of how the query was interpreted */
  interpretation?: string;
}

const POSITION_MAP: Record<string, string> = {
  striker: 'CF',
  strikers: 'CF',
  centreforward: 'CF',
  centerforward: 'CF',
  cf: 'CF',
  st: 'ST',
  חלוץ: 'CF',
  חלוצים: 'CF',
  winger: 'LW',
  wingers: 'LW',
  leftwinger: 'LW',
  rightwinger: 'RW',
  lw: 'LW',
  rw: 'RW',
  כנף: 'LW',
  כנפיים: 'LW',
  midfielder: 'CM',
  midfield: 'CM',
  cm: 'CM',
  dm: 'DM',
  am: 'AM',
  קשר: 'CM',
  defender: 'CB',
  centreback: 'CB',
  centerback: 'CB',
  cb: 'CB',
  lb: 'LB',
  rb: 'RB',
  בלם: 'CB',
  מגן: 'CB',
  goalkeeper: 'GK',
  gk: 'GK',
  שוער: 'GK',
};

/** Transfer fee values supported by the scout server */
const TRANSFER_FEE_OPTIONS = ['Free/Free loan', '<200', '300-600', '700-900', '1m+'];

export async function parseScoutQueryWithGemini(
  query: string,
  lang: 'en' | 'he',
  apiKey: string
): Promise<ParsedScoutParams> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `You are a football scout assistant. Analyze the user's player search request (in Hebrew or English) and extract structured recruitment criteria.

Output a JSON object with these fields (use null for unspecified):
- position: Transfermarkt position code. Map: striker/חלוץ/חלוצים → CF or ST; winger/כנף → LW or RW; midfielder/קשר → CM; defender/בלם/מגן → CB; goalkeeper/שוער → GK. Use CF, ST, LW, RW, CM, DM, AM, CB, LB, RB, GK.
- ageMin: minimum age (number) if mentioned
- ageMax: maximum age (number) if mentioned (e.g. "up to 23" / "עד גיל 23" → 23)
- notes: combined free-text of playing attributes. Include: pace/speed (מהיר/fast), dribbling (דריבל/dribble), goals (שערים/goals), experience, physicality, etc. For "Israeli market" / "שוק ישראלי" add "Israeli market fit, affordable, lower leagues" to notes.
- transferFee: ONLY use one of these exact values: "Free/Free loan", "<200", "300-600", "700-900", "1m+". For Israeli market / שוק ישראלי use "<200" or "300-600". Omit if not specified.
- salaryRange: if salary mentioned (e.g. "6-10" for €6k-10k)
- limit: number of players requested (default 10)
- interpretation: 1-2 sentence summary in the user's language explaining how you understood the request

Be precise: "at least 5 goals last season" / "לפחות 5 שערים בעונה הקודמת" → include "5+ goals last season" in notes.
"Fast with good dribbling" / "מהירים עם דריבל טוב" → include "fast, good dribbling" in notes.`;

  const userPrompt = `Query (${lang}): ${query}

Return ONLY valid JSON, no markdown or extra text.`;

  const result = await model.generateContent([systemPrompt, userPrompt]);
  const response = result.response;
  const text = (typeof response.text === 'function' ? response.text() : '')?.trim?.() ?? '';

  // Extract JSON (handle markdown code blocks if present)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error('Gemini returned invalid JSON. Please try rephrasing your query.');
  }

  const rawPosition = String(parsed.position ?? '');
  const position = rawPosition && ['CF', 'ST', 'LW', 'RW', 'CM', 'DM', 'AM', 'CB', 'LB', 'RB', 'GK'].includes(rawPosition.trim().toUpperCase())
    ? rawPosition.trim().toUpperCase()
    : normalizePosition(rawPosition) || undefined;
  const transferFee = normalizeTransferFee(String(parsed.transferFee ?? ''));

  return {
    position,
    ageMin: typeof parsed.ageMin === 'number' ? parsed.ageMin : undefined,
    ageMax: typeof parsed.ageMax === 'number' ? parsed.ageMax : undefined,
    notes: String(parsed.notes ?? '').trim() || undefined,
    transferFee: transferFee || undefined,
    salaryRange: String(parsed.salaryRange ?? '').trim() || undefined,
    limit: typeof parsed.limit === 'number' ? Math.min(25, Math.max(5, parsed.limit)) : 10,
    interpretation: String(parsed.interpretation ?? '').trim() || undefined,
  };
}

function normalizePosition(raw: string): string | undefined {
  const key = raw.trim().toLowerCase().replace(/[\s-]/g, '');
  return POSITION_MAP[key] ?? (['CF', 'ST', 'LW', 'RW', 'CM', 'DM', 'AM', 'CB', 'LB', 'RB', 'GK'].includes(raw.trim().toUpperCase()) ? raw.trim().toUpperCase() : undefined);
}

function normalizeTransferFee(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower.includes('free') || lower.includes('חינם') || lower.includes('חופשי')) return 'Free/Free loan';
  if (lower.includes('<200') || lower.includes('200') || lower.includes('מתחת ל-200')) return '<200';
  if (lower.includes('300') || lower.includes('600')) return '300-600';
  if (lower.includes('700') || lower.includes('900')) return '700-900';
  if (lower.includes('1m') || lower.includes('1 m') || lower.includes('מיליון')) return '1m+';
  return TRANSFER_FEE_OPTIONS.includes(trimmed) ? trimmed : undefined;
}
