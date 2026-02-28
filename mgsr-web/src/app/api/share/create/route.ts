/**
 * POST /api/share/create
 * Creates a shareable player link. Requires Firebase Auth token in Authorization header.
 * Generates a short scout report via Gemini when GEMINI_API_KEY is set.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  // Use production URL so share links never point to preview (which may require auth)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

interface SharePayload {
  playerId: string;
  player: {
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
    tmProfile?: string;
    agentPhoneNumber?: string;
    playerAdditionalInfoModel?: { agentNumber?: string };
  };
  mandateInfo?: {
    hasMandate: boolean;
    expiresAt?: number;
  };
  mandateUrl?: string;
  sharerPhone?: string;
  sharerName?: string;
  scoutReport?: string;
  highlights?: { id: string; source: string; title: string; thumbnailUrl: string; embedUrl: string; channelName?: string; viewCount?: number }[];
  lang?: 'he' | 'en';
}

function buildPlayerContext(player: SharePayload['player']): string {
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

async function generateShortScoutReport(player: SharePayload['player'], lang: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return '';
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const playerContext = buildPlayerContext(player);
    const outputLang = lang === 'he' || lang === 'iw' ? 'Hebrew' : 'English';
    const prompt = `You are a football scout. Write a SHORT scout report (2-4 sentences max) for this player. Be punchy and actionable. Focus on: key strengths, fit for Israeli/similar leagues, transfer value assessment. Use ${outputLang}.

Player profile:
${playerContext}

Write only the report text, no headers or labels.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim();
    return text || '';
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const app = getFirebaseAdmin();
    if (!app) {
      return NextResponse.json(
        { error: 'Server not configured for share. Add Firebase Admin credentials.' },
        { status: 503 }
      );
    }
    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const body = (await request.json()) as SharePayload;
    const { playerId, player, mandateInfo, mandateUrl, sharerPhone, sharerName, scoutReport: providedScoutReport, highlights, lang: bodyLang } = body;

    if (!playerId || !player) {
      return NextResponse.json({ error: 'Missing playerId or player' }, { status: 400 });
    }

    const lang = bodyLang ?? (request.headers.get('Accept-Language')?.includes('he') ? 'he' : 'en');
    let scoutReport = providedScoutReport;
    if (!scoutReport?.trim()) {
      scoutReport = await generateShortScoutReport(player, lang);
    }

    const shareDoc = {
      playerId,
      player: {
        fullName: player.fullName,
        fullNameHe: player.fullNameHe,
        profileImage: player.profileImage,
        positions: player.positions,
        marketValue: player.marketValue,
        currentClub: player.currentClub,
        age: player.age,
        height: player.height,
        nationality: player.nationality,
        contractExpired: player.contractExpired,
        tmProfile: (player as { tmProfile?: string }).tmProfile,
      },
      mandateInfo: mandateInfo ?? null,
      mandateUrl: mandateUrl ?? null,
      sharerPhone: sharerPhone ?? null,
      sharerName: sharerName ?? null,
      scoutReport: scoutReport?.trim() || null,
      highlights: highlights?.length ? highlights : null,
      lang: lang ?? null,
      createdAt: Date.now(),
      createdBy: uid,
    };

    const ref = await adminDb().collection('SharedPlayers').add(shareDoc);
    const shareToken = ref.id;
    const shareUrl = `${getAppUrl()}/p/${shareToken}`;

    return NextResponse.json({ token: shareToken, url: shareUrl });
  } catch (e) {
    console.error('[share] Create failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create share' },
      { status: 500 }
    );
  }
}
