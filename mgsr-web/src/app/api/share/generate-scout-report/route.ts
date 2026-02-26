/**
 * POST /api/share/generate-scout-report
 * Generates a short scout report via Gemini. No auth required (rate limit by usage).
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
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  contractExpired?: string;
}

function buildPlayerContext(player: PlayerPayload): string {
  const parts: string[] = [];
  if (player.fullName) parts.push(`Name: ${player.fullName}`);
  if (player.age) parts.push(`Age: ${player.age}`);
  if (player.positions?.length) parts.push(`Position: ${player.positions.filter(Boolean).join(', ')}`);
  if (player.height) parts.push(`Height: ${player.height}`);
  if (player.marketValue) parts.push(`Market value: ${player.marketValue}`);
  if (player.currentClub?.clubName) parts.push(`Club: ${player.currentClub.clubName}`);
  if (player.nationality) parts.push(`Nationality: ${player.nationality}`);
  if (player.contractExpired) parts.push(`Contract: ${player.contractExpired}`);
  return parts.join('\n');
}

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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const playerContext = buildPlayerContext(player);
    const outputLang = lang === 'he' || lang === 'iw' ? 'Hebrew' : 'English';

    const prompt = `You are a football scout. Write a SHORT scout report (3-5 sentences) for this player. Be punchy and actionable. Include:
- Key strengths and playing style
- Fit for Israeli/similar leagues
- Transfer value assessment
Use ${outputLang}. Write only the report text, no headers or labels.`;

    const result = await model.generateContent(`${prompt}\n\nPlayer profile:\n${playerContext}`);
    const text = result.response.text()?.trim() || '';

    return NextResponse.json({ scoutReport: text });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}
