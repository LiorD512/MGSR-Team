/**
 * Free Hebrew → English translation for scout queries.
 * Uses MyMemory Translation API (free, no API key, 1000 words/day anonymous).
 * Fallback: returns original query if translation fails.
 *
 * Football glossary: replace Hebrew football terms before translation so
 * "בלם" → "centre-back" (not "brake"), "מגן שמאל" → "left back", etc.
 */

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** Optional: set an email for higher daily quota (10k words/day instead of 1k) */
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || '';

/** Football glossary: Hebrew → English (prevents "בלם"→brake, ensures correct positions) */
const FOOTBALL_GLOSSARY: [RegExp, string][] = [
  // ── Compound phrases — must come BEFORE individual word entries ──
  // "בלם רגל שמאל" = left-footed centre back (NOT "left foot brake")
  [/בלם\s*רגל\s*שמאל/g, 'left-footed centre back'],
  [/בלם\s*רגל\s*ימין/g, 'right-footed centre back'],
  // "שחקן חופשי" must be matched BEFORE "שחקנים?" strips "שחקן"
  [/שחקנים?\s*חופשיי?ם?/g, 'free agent'],
  [/שחקן\s*חופשי/g, 'free agent'],
  [/חופשיים/g, 'free agent'],
  // Positions — order matters: specific before generic
  [/מגן\s*שמאל|שמאלי\s*מגן/g, 'left back'],
  [/מגן\s*ימין|ימני\s*מגן/g, 'right back'],
  [/מגן\s*מרכזי|מגנים\s*מרכזיים/g, 'centre back'],
  [/בלם|בלמים/g, 'centre back'],
  [/כנף\s*שמאל|שמאלי\s*כנף/g, 'left winger'],
  [/כנף\s*ימין|ימני\s*כנף/g, 'right winger'],
  [/חלוץ|חלוצים/g, 'striker'],
  [/קשר\s*התקפי|קשר\s*עילי/g, 'attacking midfielder'],
  [/קשר\s*הגנתי|קשר\s*שורשי/g, 'defensive midfielder'],
  [/קשר|קשרים/g, 'midfielder'],
  [/שוער|שוערים/g, 'goalkeeper'],
  // Foot
  [/רגל\s*שמאל/g, 'left foot'],
  [/רגל\s*ימין/g, 'right foot'],
  [/דו[- ]?רגלי/g, 'two-footed'],
  // Common words — AFTER compound phrases to avoid partial consumption
  [/שחקנים/g, 'players'],
  [/שחקן(?!\s*חופשי)/g, 'player'],
  [/שחקניות?/g, 'players'],
  [/חופשי/g, 'free agent'],
];

/**
 * Pre-process Hebrew query: replace football terms with English equivalents
 * so MyMemory doesn't mistranslate (e.g. בלם→brake). Keeps structure for parsing.
 */
function applyFootballGlossary(text: string): string {
  let result = text;
  for (const [pattern, replacement] of FOOTBALL_GLOSSARY) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Detect if a string contains Hebrew characters.
 */
export function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Translate Hebrew text to English using MyMemory API.
 * Applies football glossary first so "בלם רגל שמאל" → "centre back left foot" (not "left foot brake").
 */
export async function translateHebrewToEnglish(text: string): Promise<{
  translated: string;
  wasTranslated: boolean;
}> {
  // Skip if no Hebrew characters
  if (!containsHebrew(text)) {
    return { translated: text, wasTranslated: false };
  }

  const textForApi = applyFootballGlossary(text);

  // If glossary replaced all Hebrew (e.g. "בלם רגל שמאל" → "centre back left foot"), use it directly
  if (!containsHebrew(textForApi)) {
    return { translated: textForApi.trim(), wasTranslated: true };
  }

  try {
    const params = new URLSearchParams({
      q: textForApi,
      langpair: 'he|en',
    });
    if (MYMEMORY_EMAIL) {
      params.set('de', MYMEMORY_EMAIL);
    }

    const url = `${MYMEMORY_URL}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000), // 5s max — don't slow down search
    });

    if (!res.ok) {
      console.warn('[Translate] MyMemory API error:', res.status);
      return { translated: text, wasTranslated: false };
    }

    const data = (await res.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string; match?: number };
    };

    const translatedText = data?.responseData?.translatedText;
    const matchQuality = data?.responseData?.match ?? 0;

    if (translatedText && matchQuality > 0 && data.responseStatus === 200) {
      console.log(`[Translate] HE→EN: "${text.slice(0, 60)}..." → "${translatedText.slice(0, 60)}..." (match: ${matchQuality})`);
      return { translated: translatedText, wasTranslated: true };
    }

    console.warn('[Translate] Low quality or empty translation, using original');
    return { translated: text, wasTranslated: false };
  } catch (err) {
    console.warn('[Translate] Failed (timeout or network):', err instanceof Error ? err.message : err);
    return { translated: text, wasTranslated: false };
  }
}
