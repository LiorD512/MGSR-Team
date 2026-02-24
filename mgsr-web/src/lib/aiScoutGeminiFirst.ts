/**
 * AI Scout - Gemini-first path: AI suggests players with full semantic understanding,
 * then we verify on Transfermarkt. Fast (~15-25s) and uses ALL criteria (notes, goals, etc).
 */

export interface GeminiPlayerSuggestion {
  name: string;
  position?: string;
  age?: string;
  marketValue?: string;
  similarityReason?: string;
}

export interface GeminiScoutResult {
  interpretation: string;
  suggestedPlayers: GeminiPlayerSuggestion[];
}

export async function suggestPlayersWithGemini(
  query: string,
  lang: 'en' | 'he',
  apiKey: string,
  limit: number = 10
): Promise<GeminiScoutResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const outputLang = lang === 'he' ? 'Hebrew' : 'English';
  const prompt = `You are an expert football scout. The user wants players matching their criteria.

USER REQUEST (${lang}): ${query}

TASK: Suggest exactly ${limit} real players who match ALL criteria. Consider:
- Position: STRICTLY match. If user asks for strikers/חלוצים → ONLY CF, ST, SS (Centre-Forward, Second Striker). NEVER suggest: CB, LB, RB, DM, CM, AM, LW, RW, GK. Only central strikers.
- Age limit (e.g. up to 23 / עד גיל 23)
- Playing style: fast/מהיר, good dribbling/דריבל טוב, strong/חזק, goals/שערים
- Israeli market / שוק ישראלי = CRITICAL: Value range = league avg ×0.5 to ×2 (50% less to 100% more). NEVER suggest: Bundesliga, Premier League, La Liga, Serie A, Ligue 1. ONLY: Belgium, Portugal, Netherlands, Scandinavia, Eastern Europe, Turkey, Greece, Poland, Austria, Cyprus.
- Goals last season (e.g. 5+ goals / 5 שערים)

CRITICAL: Names must be EXACTLY as on Transfermarkt.com (2024-2025 season). Use full names. No URLs.

CRITICAL for similarityReason: NEVER include specific numbers (goals, assists, appearances) or club names.
Only use generic attributes: "fast", "good dribbler", "physical", "fits affordable market", "young prospect".
Stats and clubs will be filled from Transfermarkt - do not invent them.

CRITICAL: In "interpretation", use the EXACT number the USER asked for (e.g. 10 if they said "10 חלוצים"). Do NOT use the limit we give you.

Return JSON only:
{
  "interpretation": "1-2 sentences in ${outputLang} summarizing how you understood the request. Use the user's requested count.",
  "suggestedPlayers": [
    {
      "name": "Exact Transfermarkt name",
      "position": "CF",
      "age": "22",
      "marketValue": "€2.5m",
      "similarityReason": "Generic attributes only: fast, good dribbler, fits Israeli market - NO numbers or club names"
    }
  ]
}

Suggest players from leagues suitable for Israeli market: Belgium, Portugal, Netherlands, Scandinavia, Eastern Europe, Turkey, Greece. Avoid top-5 league stars.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = (typeof response.text === 'function' ? response.text() : '')?.trim?.() ?? '';

  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    throw new Error('Gemini returned invalid JSON. Please try rephrasing your query.');
  }

  const suggestedPlayers = Array.isArray(parsed.suggestedPlayers)
    ? (parsed.suggestedPlayers as Record<string, unknown>[]).map((p) => ({
        name: String(p.name ?? '').trim(),
        position: String(p.position ?? '').trim() || undefined,
        age: String(p.age ?? '').trim() || undefined,
        marketValue: String(p.marketValue ?? '').trim() || undefined,
        similarityReason: String(p.similarityReason ?? '').trim() || undefined,
      }))
    : [];

  return {
    interpretation: String(parsed.interpretation ?? '').trim() || 'Search completed.',
    suggestedPlayers: suggestedPlayers.filter((p) => p.name.length > 0),
  };
}
