/**
 * MATCHDAY player image library (cache).
 *
 * Searching the web every time someone generates a MATCHDAY would be slow,
 * costly and non-deterministic. Once a candidate has been confidently approved
 * we copy it into the player's own image library in Storage and record its
 * provenance + scores in Firestore, so future generations reuse it instantly.
 *
 * This module also owns the resolution PRIORITY, which is the whole safety
 * contract of the feature:
 *
 *   1. Manual `Players/{id}.matchdayPhotoUrl`  (operator override — wins)
 *   2. A previously APPROVED automatic image   (this library)
 *   3. (caller then runs a fresh search)
 *   4. Manual upload remains the fallback
 *   5. NEVER synthetic generation
 *
 * All writes use the Admin SDK (same path the existing upload route uses) and
 * are best-effort: a storage/Firestore outage must never crash a generation.
 */

import crypto from 'crypto';
import { getFirebaseAdmin, adminDb, adminBucket } from '@/lib/firebaseAdmin';
import type { ApprovalStatus, MatchdayPlayerImageRecord, RankedCandidate } from './types';

/** Firestore subcollection under each player document. */
const SUBCOLLECTION = 'MatchdayImages';

function hashUrl(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
}

const DOWNLOAD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
  accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
};

/**
 * Approve a candidate: copy its bytes into the player's library and record
 * metadata. Returns the stored record, or null when storage is unavailable (in
 * which case the caller can still use the original URL for a one-off preview).
 */
export async function approvePlayerImage(
  playerId: string,
  candidate: RankedCandidate,
  status: ApprovalStatus = 'approved'
): Promise<MatchdayPlayerImageRecord | null> {
  if (!getFirebaseAdmin()) return null;

  try {
    const res = await fetch(candidate.imageUrl, {
      headers: DOWNLOAD_HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const bytes = Buffer.from(await res.arrayBuffer());

    const hash = hashUrl(candidate.imageUrl);
    const storagePath = `matchday-assets/players/${playerId}/source/${hash}.${ext}`;

    const bucket = await adminBucket();
    const file = bucket.file(storagePath);
    await file.save(bytes, { contentType, resumable: false });
    await file.makePublic().catch(() => {
      /* uniform bucket access may forbid per-object ACLs; URL may still resolve */
    });
    const storageUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    const record: MatchdayPlayerImageRecord = {
      playerId,
      storageUrl,
      storagePath,
      originalUrl: candidate.imageUrl,
      source: candidate.source,
      sourceUrl: candidate.sourceUrl,
      identityScore: candidate.identityConfidence,
      qualityScore: candidate.imageQualityScore,
      finalScore: candidate.finalScore,
      approvalStatus: status,
      width: candidate.width,
      height: candidate.height,
      discoveredAt: Date.now(),
    };

    await adminDb()
      .collection('Players')
      .doc(playerId)
      .collection(SUBCOLLECTION)
      .doc(hash)
      .set(record, { merge: true });

    return record;
  } catch {
    return null;
  }
}

/**
 * The best previously-approved automatic image for a player, if any. Highest
 * final score wins. Returns null when none are approved or storage is absent.
 */
export async function getApprovedPlayerImage(
  playerId: string
): Promise<MatchdayPlayerImageRecord | null> {
  if (!getFirebaseAdmin()) return null;
  try {
    const snap = await adminDb()
      .collection('Players')
      .doc(playerId)
      .collection(SUBCOLLECTION)
      .where('approvalStatus', '==', 'approved')
      .get();
    if (snap.empty) return null;
    const records = snap.docs.map((d) => d.data() as MatchdayPlayerImageRecord);
    records.sort((a, b) => b.finalScore - a.finalScore);
    return records[0] ?? null;
  } catch {
    return null;
  }
}

/** The manual operator override, if the player has one. */
export async function getManualOverrideUrl(playerId: string): Promise<string | null> {
  if (!getFirebaseAdmin()) return null;
  try {
    const snap = await adminDb().collection('Players').doc(playerId).get();
    const url = snap.data()?.matchdayPhotoUrl;
    return typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch {
    return null;
  }
}

export type ResolvedSourceKind = 'manual_override' | 'approved_auto' | 'none';

export interface ResolvedPlayerImage {
  kind: ResolvedSourceKind;
  url: string | null;
  record: MatchdayPlayerImageRecord | null;
}

/**
 * Resolve the image a MATCHDAY should use for a player, honouring priority
 * 1 → 2 only. It never triggers a new web search (that is the caller's job at
 * priority 3) and never fabricates anything. A `kind: 'none'` result tells the
 * caller to search, and failing that, to fall back to manual upload.
 */
export async function resolveExistingPlayerImage(playerId: string): Promise<ResolvedPlayerImage> {
  const manual = await getManualOverrideUrl(playerId);
  if (manual) return { kind: 'manual_override', url: manual, record: null };

  const approved = await getApprovedPlayerImage(playerId);
  if (approved) return { kind: 'approved_auto', url: approved.storageUrl, record: approved };

  return { kind: 'none', url: null, record: null };
}
