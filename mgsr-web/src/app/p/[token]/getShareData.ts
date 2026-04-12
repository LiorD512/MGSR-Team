/**
 * Server-side fetch of share data for metadata (OG tags) and SSR.
 * Tries Firebase Admin first, falls back to client SDK (works with public read rules).
 * For older shares missing GPS data, fetches it live from Firestore.
 * For shares missing enrichment/stats (e.g. created from Android), generates on the fly
 * and backfills the Firestore doc so subsequent loads are instant.
 */
import type { ShareData, SharedGpsData, GpsStrength, PortfolioEnrichment, SharedPlayerStats } from './types';

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

  // 3-5. Live fallbacks for missing GPS, stats, enrichment — run in PARALLEL
  //       with a hard 5s cap to keep page load fast.
  if (data) {
    const needGps = !data.gpsData && data.player?.tmProfile;
    const needStats = !data.playerStats && data.player?.tmProfile;
    const needEnrichment = !data.enrichment && data.player;

    if (needGps || needStats || needEnrichment) {
      const enrichmentWork = Promise.allSettled([
        // GPS
        needGps
          ? fetchLiveGpsData(data.player!.tmProfile!, data.lang, data.playerId)
          : Promise.resolve(undefined),
        // Stats
        needStats
          ? import('@/lib/fetchPlayerStats').then(m =>
              m.fetchPlayerStatsForShare(data.player!.tmProfile!, data.player!.positions),
            )
          : Promise.resolve(undefined),
        // Enrichment
        needEnrichment
          ? import('@/lib/generateEnrichment').then(m =>
              m.generateEnrichment(
                data.player as Record<string, unknown>,
                data.scoutReport,
                data.platform,
                data.lang,
              ),
            )
          : Promise.resolve(undefined),
      ]);

      // Hard cap: don't wait more than 5s for enrichment
      const timeout = new Promise<'timeout'>(res => setTimeout(() => res('timeout'), 5000));
      const result = await Promise.race([enrichmentWork, timeout]);

      if (result !== 'timeout') {
        const [gpsResult, statsResult, enrichResult] = result;
        if (gpsResult.status === 'fulfilled' && gpsResult.value) {
          data.gpsData = gpsResult.value;
        }
        if (statsResult.status === 'fulfilled' && statsResult.value) {
          data.playerStats = statsResult.value;
        }
        if (enrichResult.status === 'fulfilled' && enrichResult.value && Object.keys(enrichResult.value).length > 0) {
          data.enrichment = enrichResult.value;
        }
      }
    }
  }

  // 6. Backfill: persist enrichment/stats/gps to Firestore so subsequent loads skip enrichment.
  //    MUST be awaited — fire-and-forget gets killed by Vercel after response is sent.
  if (data) {
    await backfillShareDoc(token, data).catch(() => {});
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

/**
 * Backfill newly-generated enrichment, stats, and GPS data into the Firestore doc
 * so subsequent page loads don't re-generate. Uses merge to avoid overwriting existing fields.
 */
async function backfillShareDoc(token: string, data: ShareData): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (data.enrichment && Object.keys(data.enrichment).length > 0) {
    updates.enrichment = data.enrichment;
  }
  if (data.playerStats) {
    updates.playerStats = data.playerStats;
  }
  if (data.gpsData) {
    updates.gpsData = data.gpsData;
  }

  // Nothing to backfill
  if (Object.keys(updates).length === 0) return;

  try {
    const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
    const app = getFirebaseAdmin();
    if (!app) return;
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);

    // merge: true — only writes new fields, won't overwrite existing ones
    await db.collection('SharedPlayers').doc(token).set(updates, { merge: true });
  } catch {
    // Backfill is best-effort
  }
}
