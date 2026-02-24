/**
 * Free Hebrew → English translation for scout queries.
 * Uses MyMemory Translation API (free, no API key, 1000 words/day anonymous).
 * Fallback: returns original query if translation fails.
 */

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** Optional: set an email for higher daily quota (10k words/day instead of 1k) */
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || '';

/**
 * Detect if a string contains Hebrew characters.
 */
export function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Translate Hebrew text to English using MyMemory API.
 * Returns the English translation, or the original text if translation fails.
 * Adds no latency if text is already English.
 */
export async function translateHebrewToEnglish(text: string): Promise<{
  translated: string;
  wasTranslated: boolean;
}> {
  // Skip if no Hebrew characters
  if (!containsHebrew(text)) {
    return { translated: text, wasTranslated: false };
  }

  try {
    const params = new URLSearchParams({
      q: text,
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
