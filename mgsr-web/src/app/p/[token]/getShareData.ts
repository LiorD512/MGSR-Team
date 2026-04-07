/**
 * Server-side fetch of share data for metadata (OG tags) and SSR.
 * Tries Firebase Admin first, falls back to client SDK (works with public read rules).
 * For older shares missing GPS data, fetches it live from Firestore.
 */
import type { ShareData, SharedGpsData, GpsStrength } from './types';

export async function getShareData(token: string): Promise<ShareData | null> {
  let data: ShareData | null = null;

  // 1. Try Firebase Admin (when configured on Vercel)
  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    if (app) {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore(app);
      const snap = await db.collection('SharedPlayers').doc(token).get();
      if (snap.exists) data = snap.data() as ShareData;
    }
  } catch {
    // Fall through to client SDK
  }

  // 2. Fallback: client Firebase SDK (works with public SharedPlayers read rules)
  if (!data) {
    try {
      const { db } = await import('@/lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'SharedPlayers', token));
      if (snap.exists()) data = snap.data() as ShareData;
    } catch {
      // Ignore
    }
  }

  // 3. Live GPS fallback for shares created before GPS was included
  if (data && !data.gpsData && data.player?.tmProfile) {
    try {
      data.gpsData = await fetchLiveGpsData(data.player.tmProfile, data.lang, data.playerId);
    } catch {
      // GPS enrichment is best-effort
    }
  }

  // 4. Live stats fallback for shares created before stats were included
  if (data && !data.playerStats && data.player?.tmProfile) {
    try {
      const { fetchPlayerStatsForShare } = await import('@/lib/fetchPlayerStats');
      data.playerStats = await fetchPlayerStatsForShare(data.player.tmProfile, data.player.positions);
    } catch {
      // Stats enrichment is best-effort
    }
  }

  return data;
}

/**
 * Fetch GPS stats + strengths live from Firestore (Admin SDK).
 * Used as fallback when a share doc was created before GPS data was included.
 */
async function fetchLiveGpsData(
  tmProfile: string,
  lang?: 'he' | 'en',
  playerId?: string
): Promise<SharedGpsData | undefined> {
  const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
  const app = getFirebaseAdmin();
  if (!app) return undefined;

  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore(app);

  const gpsSnap = await db
    .collection('GpsMatchData')
    .where('playerTmProfile', '==', tmProfile)
    .get();
  if (gpsSnap.empty) return undefined;

  const matches = gpsSnap.docs.map(d => d.data());
  const n = matches.length;
  const totalMin = matches.reduce((s, m) => s + ((m.totalDuration as number) || 0), 0);
  const avgDist = Math.round(matches.reduce((s, m) => s + ((m.totalDistance as number) || 0), 0) / n);
  const avgMeterage = Math.round(matches.reduce((s, m) => s + ((m.meteragePerMinute as number) || 0), 0) / n);
  const avgHI = Math.round(matches.reduce((s, m) => s + ((m.highIntensityRuns as number) || 0), 0) / n);
  const avgSprints = Math.round(matches.reduce((s, m) => s + ((m.sprints as number) || 0), 0) / n);
  const peakVel = Math.max(...matches.map(m => (m.maxVelocity as number) || 0));
  const avgMaxVel =
    Math.round((matches.reduce((s, m) => s + ((m.maxVelocity as number) || 0), 0) / n) * 10) / 10;
  const totalStars = matches.reduce(
    (sum, m) =>
      sum +
      [
        m.isStarTotalDist,
        m.isStarHighMpEffsDist,
        m.isStarHighMpEffs,
        m.isStarMeteragePerMin,
        m.isStarAccelerations,
        m.isStarHighIntensityRuns,
        m.isStarSprints,
        m.isStarMaxVelocity,
      ].filter(Boolean).length,
    0
  );

  // Fetch server-computed insights (strengths only for share)
  const safeId = tmProfile.replace(/[/\\]/g, '_');
  const insightsSnap = await db.collection('GpsPlayerInsights').doc(safeId).get();
  let strengths: GpsStrength[] = [];
  if (insightsSnap.exists) {
    const insData = insightsSnap.data()!;
    const isHe = lang === 'he';
    strengths = ((insData.insights || []) as Array<Record<string, string>>)
      .filter((i: Record<string, string>) => i.type === 'strength')
      .map((i: Record<string, string>) => ({
        title: isHe ? i.titleHe : i.titleEn,
        description: isHe ? i.descriptionHe : i.descriptionEn,
        value: i.value,
        benchmark: i.benchmark,
      }));
  }

  // Fetch GPS document URLs from PlayerDocuments
  let documentUrls: string[] | undefined;
  if (playerId) {
    const docsSnap = await db
      .collection('Players').doc(playerId)
      .collection('documents')
      .where('type', '==', 'GPS_DATA')
      .get();
    const urls = docsSnap.docs
      .map(d => d.data().storageUrl as string | undefined)
      .filter((u): u is string => !!u);
    if (urls.length > 0) documentUrls = urls;
  }

  return {
    matchCount: n,
    totalMinutesPlayed: totalMin,
    avgTotalDistance: avgDist,
    avgMeteragePerMinute: avgMeterage,
    avgHighIntensityRuns: avgHI,
    avgSprints,
    peakMaxVelocity: peakVel,
    avgMaxVelocity: avgMaxVel,
    totalStars,
    strengths,
    documentUrls,
  };
}
