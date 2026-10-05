import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminAuth, adminDb } from '@/lib/firebaseAdmin';
import {
  discoverPlayerPhotos,
  resolveExistingPlayerImage,
  approvePlayerImage,
  type PlayerPhotoSearchInput,
  type RankedCandidate,
} from '@/lib/matchday/intelligence';

export const dynamic = 'force-dynamic';
// Discovery downloads several images and may run a few Gemini checks.
export const maxDuration = 120;

interface Body {
  /** Resolve club/country/instagram/profileImage from Firestore when provided. */
  playerId?: string | null;
  /** Direct overrides (also used for ad-hoc testing without a player doc). */
  playerName?: string | null;
  club?: string | null;
  country?: string | null;
  /** Instagram handle (any format); PRIMARY photo source when present. */
  instagramHandle?: string | null;
  /** Known reference photo URL (identity aid only; never the MATCHDAY image). */
  profileImage?: string | null;
  /** Disable the Gemini verification pass (deterministic / cost-free test). */
  useGemini?: boolean;
  maxDownloads?: number;
  maxGeminiChecks?: number;
  /** When set, approve+cache this candidate URL from a prior run. */
  approveUrl?: string | null;
}

/**
 * Require an authenticated MGSR user. This is an internal validation tool, so
 * it reuses the project's existing Firebase ID-token pattern (same as
 * /api/shared-requests/*): the client sends `Authorization: Bearer <idToken>`
 * and we verify it with the Admin SDK. Returns the uid, or null to reject.
 */
async function requireAuth(request: NextRequest): Promise<{ uid: string } | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  if (!getFirebaseAdmin()) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

/** Pull name/club/country off a Players doc so the tester can pass only an id. */
async function hydrateFromPlayer(playerId: string): Promise<Partial<PlayerPhotoSearchInput>> {
  if (!getFirebaseAdmin()) return {};
  try {
    const snap = await adminDb().collection('Players').doc(playerId).get();
    const d = snap.data();
    if (!d) return {};
    const currentClub = (d.currentClub ?? {}) as { clubName?: string; clubCountry?: string };
    return {
      playerName: typeof d.fullName === 'string' ? d.fullName : undefined,
      club: currentClub.clubName,
      country: currentClub.clubCountry ?? (typeof d.nationality === 'string' ? d.nationality : undefined),
      instagramHandle: typeof d.instagramHandle === 'string' ? d.instagramHandle : undefined,
      profileImage: typeof d.profileImage === 'string' ? d.profileImage : undefined,
    };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  // ── Auth gate (internal tool — authenticated users only) ──
  const auth = await requireAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fromDoc = body.playerId ? await hydrateFromPlayer(body.playerId) : {};
  const input: PlayerPhotoSearchInput = {
    playerId: body.playerId ?? null,
    playerName: (body.playerName ?? fromDoc.playerName ?? '').trim(),
    club: (body.club ?? fromDoc.club ?? null) || null,
    country: (body.country ?? fromDoc.country ?? null) || null,
    instagramHandle: (body.instagramHandle ?? fromDoc.instagramHandle ?? null) || null,
    profileImage: (body.profileImage ?? fromDoc.profileImage ?? null) || null,
  };

  if (!input.playerName) {
    return NextResponse.json(
      { error: 'playerName is required (directly, or via a playerId that resolves to one)' },
      { status: 400 }
    );
  }

  // ── Approval path: cache a specific candidate the operator picked. ──
  if (body.approveUrl && input.playerId) {
    // Re-run discovery so we persist the candidate with its real scores rather
    // than fabricating them; find the matching URL in the fresh results.
    const result = await discoverPlayerPhotos(input, {
      useGemini: body.useGemini,
      maxDownloads: body.maxDownloads,
      maxGeminiChecks: body.maxGeminiChecks,
      useVerdictCache: true,
    });
    const match: RankedCandidate | undefined = result.topCandidates.find(
      (c) => c.imageUrl === body.approveUrl
    );
    if (!match) {
      return NextResponse.json(
        { error: 'That candidate was not among the current top results; re-run the search and approve a listed candidate.' },
        { status: 409 }
      );
    }
    const status = match.decision === 'accept' ? 'approved' : 'review';
    const record = await approvePlayerImage(input.playerId, match, status);
    if (!record) {
      return NextResponse.json({ error: 'Storage not configured; cannot cache image' }, { status: 503 });
    }
    return NextResponse.json({ approved: true, record });
  }

  // ── Discovery path (default). ──
  const existing = input.playerId
    ? await resolveExistingPlayerImage(input.playerId)
    : { kind: 'none' as const, url: null, record: null };

  const result = await discoverPlayerPhotos(input, {
    useGemini: body.useGemini,
    maxDownloads: body.maxDownloads,
    maxGeminiChecks: body.maxGeminiChecks,
    cacheHit: existing.kind !== 'none',
    cacheSource: existing.kind,
    useVerdictCache: true,
  });

  return NextResponse.json({ existing, ...result });
}
