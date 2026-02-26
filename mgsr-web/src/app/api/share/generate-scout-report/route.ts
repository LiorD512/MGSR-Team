/**
 * POST /api/share/generate-scout-report
 * Generates a detailed scout report via Gemini (same structure as app's AiHelperService).
 * No auth required (rate limit by usage).
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

interface PlayerPayload {
  fullName?: string;
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  contractExpired?: string;
  foot?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  agency?: string;
  tmProfile?: string;
}

function buildPlayerContext(player: PlayerPayload): string {
  const parts: string[] = [];
  if (player.fullName) parts.push(`Name: ${player.fullName}`);
  if (player.age) parts.push(`Age: ${player.age}`);
  if (player.positions?.length)
    parts.push(`Positions: ${player.positions.filter(Boolean).join(', ')}`);
  if (player.height) parts.push(`Height: ${player.height}`);
  if (player.foot) parts.push(`Preferred foot: ${player.foot}`);
  if (player.marketValue) parts.push(`Market value: ${player.marketValue}`);
  if (player.marketValueHistory?.length) {
    const recent = player.marketValueHistory
      .slice(-3)
      .map((h) => h.value ?? '?')
      .join(' → ');
    parts.push(`Market value trend: ${recent}`);
  }
  if (player.nationality) parts.push(`Nationality: ${player.nationality}`);
  if (player.currentClub?.clubName)
    parts.push(`Current club: ${player.currentClub.clubName}`);
  if (player.currentClub?.clubCountry)
    parts.push(`Club country/league: ${player.currentClub.clubCountry}`);
  if (player.contractExpired) parts.push(`Contract: ${player.contractExpired}`);
  if (player.isOnLoan) parts.push('On loan: yes');
  if (player.onLoanFromClub)
    parts.push(`On loan from: ${player.onLoanFromClub}`);
  if (player.agency) parts.push(`Agency: ${player.agency}`);
  if (player.tmProfile) parts.push(`Transfermarkt: ${player.tmProfile}`);
  return parts.join('\n');
}

const SCOUT_REPORT_PROMPT = `You are a CHIEF SCOUT with 25+ years at top clubs. Your reports drive transfer decisions. You combine experience, creativity, and ruthless analysis. Write with authority, precision, and tactical insight.

TASK: Generate a professional scout report for the following player.

FORMAT: Full tactical scout report (Barcelona/Real Madrid standard).
Use section headers. Pro-grade detail. Every claim traceable to the profile.

SECTIONS:
1. Executive Summary — 2–3 sentences: key strengths, main concern, recommendation
2. Technical Profile — infer from position, height, foot, value: first touch, passing, dribbling, press resistance, weak foot. Use tactical reasoning. Do NOT invent match stats or playing time.
3. Tactical Fit — best system, role, instructions. Positional play understanding.
4. Strengths — 3–4 specific points. Technical, physical, tactical. Based on profile.
5. Weaknesses — 2–3 areas of concern. Age, contract, value trend. Never assume injuries or form.
6. FIT FOR ISRAELI PREMIER LEAGUE (LIGAT HA'AL) — CORE SECTION: This is the primary market. Analyze: (a) START / ROTATION / SQUAD verdict for top-6 clubs; (b) Club-specific fit: Maccabi Haifa, Maccabi TA, Hapoel BS, Hapoel TA, Beitar, Maccabi Netanya; (c) League standard comparison for position; (d) Transfer feasibility for Israeli market; (e) Risk/opportunity in Ligat Ha'Al context. Be specific and creative.
7. Market Value & Transfer Suitability — from profile. Ideal buyer profile. Contract context.
8. Verdict — SIGN / MONITOR / PASS with clear action and rationale.

ISRAELI PREMIER LEAGUE (LIGAT HA'AL) — MANDATORY CORE ANALYSIS:
This is your PRIMARY market. Every report MUST include a dedicated section analyzing this player's fit for Israel's top division. Be specific and actionable.

REQUIRED ELEMENTS:
1. LIGAT HA'AL FIT VERDICT: Would this player START / ROTATION / SQUAD / BENEATH for a top-6 Israeli club? State clearly.
2. CLUB-SPECIFIC FIT: Which Israeli clubs suit best? Maccabi Haifa, Maccabi Tel Aviv, Hapoel Be'er Sheva, Hapoel Tel Aviv, Beitar Jerusalem, Maccabi Netanya. Explain why each fits or doesn't based on profile (value, age, position, style).
3. LEAGUE STANDARD COMPARISON: Typical Ligat Ha'Al level: market values €100k–€2m for starters. Physical and technical demands. League tempo. How does this player compare to typical Israeli league standards for this position?
4. TRANSFER FEASIBILITY: Value, contract, club level compatibility. Is this a realistic target for Israeli clubs? Price range for Israeli market.
5. RISK/OPPORTUNITY: What would make this player excel or struggle in Ligat Ha'Al?
Base analysis on profile data only. Be creative and experienced — you are a chief scout who knows the Israeli market inside out.

FACTUAL ACCURACY (non-negotiable — a pro scout never gets this wrong):
- Base the report ONLY on the data provided in the player profile below. You have NO other data.
- NEVER invent, assume, or infer: playing time, minutes played, injuries, career gaps, "hasn't played for X months/years", recent form, last season stats, or any fact not explicitly in the profile.
- If the profile does not mention playing time, injuries, or recent activity — do NOT write about them. Omit those sections entirely.
- When discussing strengths/weaknesses, base them on: position, age, height, foot, market value, club, contract, nationality. Use tactical reasoning, not invented facts.
- If uncertain about any fact, omit it. A wrong claim destroys credibility. "Data not available" is better than a false claim.

Player profile (this is your ONLY data source — no other fields exist):
{playerContext}

Note: If a field is missing above (e.g. no contract, no description), do not invent it. Work with what is provided.

Write the report in {outputLang}. Use clear numbered section headers (e.g. "1. Executive Summary", "2. Technical Profile"). Do NOT use markdown asterisks (**bold**) or hashtags — use plain text only. Be specific about what the data shows. Avoid generic fluff. Your verdict should be actionable. Never fabricate facts.`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ scoutReport: '' });
    }

    const body = (await request.json()) as { player: PlayerPayload; lang?: string };
    const { player, lang = 'en' } = body;
    if (!player) return NextResponse.json({ scoutReport: '' });

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
      },
    });

    const playerContext = buildPlayerContext(player);
    const outputLang = lang === 'he' || lang === 'iw' ? 'Hebrew' : 'English';

    const prompt = SCOUT_REPORT_PROMPT.replace('{playerContext}', playerContext)
      .replace('{outputLang}', outputLang);

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() || '';

    return NextResponse.json({ scoutReport: text });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}
