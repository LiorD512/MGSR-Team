/**
 * Share API - create shareable player links.
 * Tries API first (when Firebase Admin is configured), falls back to client Firestore.
 */

function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  // Use production URL so share links never point to preview (which may require auth)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('localhost')) {
      return origin.replace('https://', 'http://');
    }
    return origin;
  }
  return 'http://localhost:3000';
}

export interface SharePayload {
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
    agentPhoneNumber?: string;
    playerPhoneNumber?: string;
    tmProfile?: string;
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
  includePlayerContact?: boolean;
  includeAgencyContact?: boolean;
  platform?: 'men' | 'women' | 'youth';
  familyStatus?: {
    isMarried?: boolean;
    kidsCount?: number;
  };
  gpsData?: {
    matchCount: number;
    totalMinutesPlayed: number;
    avgTotalDistance: number;
    avgMeteragePerMinute: number;
    avgHighIntensityRuns: number;
    avgSprints: number;
    peakMaxVelocity: number;
    avgMaxVelocity: number;
    totalStars: number;
    strengths: { title: string; description: string; value: string; benchmark?: string }[];
    documentUrls?: string[];
  };
}

export interface ShareResult {
  token: string;
  url: string;
}

/** Build a short scout summary from player data when no AI report is available */
export function buildScoutSummary(player: SharePayload['player']): string {
  const parts: string[] = [];
  if (player.age && player.positions?.length) {
    parts.push(`${player.age}yo ${player.positions.filter(Boolean).join('/')}`);
  } else if (player.age) parts.push(`${player.age}yo`);
  else if (player.positions?.length) parts.push(player.positions.filter(Boolean).join(', '));

  if (player.marketValue) parts.push(`• ${player.marketValue}`);
  if (player.currentClub?.clubName) parts.push(`• ${player.currentClub.clubName}`);
  if (player.nationality) parts.push(`• ${player.nationality}`);

  if (parts.length === 0) return '';
  return parts.join(' ');
}

/** Create share via API (requires Firebase Admin on server) or client Firestore */
export async function createShare(
  payload: SharePayload,
  getIdToken: () => Promise<string | null>
): Promise<ShareResult> {
  const scoutReport =
    payload.scoutReport?.trim() || buildScoutSummary(payload.player);

  // Try API first
  try {
    const token = await getIdToken();
    if (token) {
      const res = await fetch('/api/share/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...payload, scoutReport: scoutReport || undefined }),
      });
      if (res.ok) {
        const { token: t, url } = (await res.json()) as ShareResult;
        return { token: t, url };
      }
    }
  } catch {
    // Fall through to client create
  }

  // Fallback: callable (Cloud Function)
  const { callSharePlayerCreate } = await import('./callables');

  /** Firestore rejects undefined - remove undefined values recursively */
  function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
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
  }

  const playerObj: Record<string, unknown> = {
    fullName: payload.player.fullName,
    fullNameHe: payload.player.fullNameHe,
    profileImage: payload.player.profileImage,
    positions: payload.player.positions,
    marketValue: payload.player.marketValue,
    currentClub: payload.player.currentClub,
    age: payload.player.age,
    height: payload.player.height,
    nationality: payload.player.nationality,
    contractExpired: payload.player.contractExpired,
    tmProfile: (payload.player as { tmProfile?: string }).tmProfile,
  };
  if (payload.includePlayerContact) {
    const playerPhone = (payload.player as { playerPhoneNumber?: string }).playerPhoneNumber;
    if (playerPhone) (playerObj as Record<string, unknown>).playerPhoneNumber = playerPhone;
  }
  if (payload.includeAgencyContact) {
    const agentPhone = payload.player.agentPhoneNumber;
    if (agentPhone) (playerObj as Record<string, unknown>).agentPhoneNumber = agentPhone;
  }

  const shareDoc = stripUndefined({
    playerId: payload.playerId,
    player: stripUndefined(playerObj),
    mandateInfo: payload.mandateInfo ?? null,
    mandateUrl: payload.mandateUrl ?? null,
    sharerPhone: payload.sharerPhone ?? null,
    sharerName: payload.sharerName ?? null,
    scoutReport: scoutReport || null,
    highlights: payload.highlights?.length ? payload.highlights : null,
    lang: payload.lang ?? null,
    platform: payload.platform ?? null,
    gpsData: payload.gpsData ?? null,
    createdAt: Date.now(),
  });

  const { token: shareToken } = await callSharePlayerCreate(shareDoc as { playerId: string; [key: string]: unknown });
  const shareUrl = `${getAppUrl()}/p/${shareToken}`;
  return { token: shareToken, url: shareUrl };
}
