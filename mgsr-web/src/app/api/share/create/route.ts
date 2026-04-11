/**
 * POST /api/share/create
 * Creates a shareable player link. Requires Firebase Auth token in Authorization header.
 * Generates a short scout report via Gemini when GEMINI_API_KEY is set.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEnrichment } from '@/lib/generateEnrichment';
import { fetchPlayerStatsForShare } from '@/lib/fetchPlayerStats';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

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
    playerPhoneNumber?: string;
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
    const prompt = `You are a professional football scout. Write a SHORT player introduction (2-3 sentences, one paragraph). Include: who the player is, where he plays, his key strengths, and any notable statistics if available. Keep it professional, direct, and factual. Do NOT mention market value, transfer fees, or league-specific fit. Do NOT use section headers. Do NOT use bold or markdown. Write in ${outputLang}.

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

    const body = (await request.json()) as SharePayload & { includePlayerContact?: boolean; includeAgencyContact?: boolean; platform?: 'men' | 'women'; gpsData?: Record<string, unknown> };
    const { playerId, player, mandateInfo, mandateUrl, sharerPhone, sharerName, scoutReport: providedScoutReport, highlights, lang: bodyLang, includePlayerContact, includeAgencyContact, platform, gpsData } = body;

    if (!playerId || !player) {
      return NextResponse.json({ error: 'Missing playerId or player' }, { status: 400 });
    }

    const lang = bodyLang ?? (request.headers.get('Accept-Language')?.includes('he') ? 'he' : 'en');
    let scoutReport = providedScoutReport;
    if (!scoutReport?.trim()) {
      scoutReport = await generateShortScoutReport(player, lang);
    }

    // Pre-generate enrichment so shared page loads instantly
    let enrichment = {};
    try {
      enrichment = await generateEnrichment(player as Record<string, unknown>, scoutReport, platform, lang);
    } catch (e) {
      console.error('[share] Enrichment pre-generation failed (non-blocking):', e);
    }

    // Pre-fetch API Football stats for share page
    let playerStats = undefined;
    try {
      playerStats = await fetchPlayerStatsForShare(
        (player as { tmProfile?: string }).tmProfile,
        player.positions,
      );
    } catch (e) {
      console.error('[share] Stats pre-fetch failed (non-blocking):', e);
    }

    /** Firestore rejects undefined values – strip them recursively */
    const stripUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          result[k] = v.filter((x) => x !== undefined).map((x) =>
            x !== null && typeof x === 'object' && !(x instanceof Date) && Object.getPrototypeOf(x) === Object.prototype
              ? stripUndefined(x as Record<string, unknown>)
              : x
          );
        } else if (
          v !== null &&
          typeof v === 'object' &&
          !(v instanceof Date) &&
          Object.getPrototypeOf(v) === Object.prototype
        ) {
          result[k] = stripUndefined(v as Record<string, unknown>);
        } else {
          result[k] = v;
        }
      }
      return result;
    };

    const playerPhone = includePlayerContact
      ? ((player as { playerPhoneNumber?: string }).playerPhoneNumber)
      : undefined;
    const agentPhone = includeAgencyContact
      ? (player.agentPhoneNumber)
      : undefined;
    const shareDoc = stripUndefined({
      playerId,
      player: stripUndefined({
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
        ...(playerPhone ? { playerPhoneNumber: playerPhone } : {}),
        ...(agentPhone ? { agentPhoneNumber: agentPhone } : {}),
      }),
      mandateInfo: mandateInfo ?? null,
      mandateUrl: mandateUrl ?? null,
      sharerPhone: sharerPhone ?? null,
      sharerName: sharerName ?? null,
      scoutReport: scoutReport?.trim() || null,
      highlights: highlights?.length ? highlights : null,
      lang: lang ?? null,
      platform: platform ?? null,
      enrichment: Object.keys(enrichment).length ? enrichment : null,
      familyStatus: (body as { familyStatus?: { isMarried?: boolean; kidsCount?: number } }).familyStatus ?? null,
      gpsData: gpsData ?? null,
      playerStats: playerStats ?? null,
      createdAt: Date.now(),
      createdBy: uid,
    });

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
