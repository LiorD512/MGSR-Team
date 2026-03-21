/**
 * POST /api/war-room/enrich-images
 * Batch-enriches ScoutProfiles in Firestore with real TM profile images.
 * Called by the scoutAgentWorker Cloud Function after writing profiles.
 *
 * Body: { secret: string }
 * The secret must match SCOUT_ENRICH_SECRET env var.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { fetchHtmlWithRetry } from '@/lib/transfermarkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: up to 60s

const TM_DEFAULT_IMG = 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';
const CONCURRENCY = 3;
const DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractImageFromHtml(html: string, playerId: string): string | null {
  const re = new RegExp(
    `https://img[^"']*?/portrait/(?:big|medium|header)/${playerId}-[^"'?]+\\.(?:jpg|png)[^"']*`
  );
  const match = html.match(re);
  if (!match) return null;
  return match[0].replace('/medium/', '/big/').replace('/header/', '/big/');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const secret = body?.secret;
    const expectedSecret = process.env.SCOUT_ENRICH_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const app = getFirebaseAdmin();
    if (!app) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 });
    }

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);

    // Get profiles missing real images (have default or no image)
    const snapshot = await db.collection('ScoutProfiles').get();
    const toEnrich: { docId: string; tmUrl: string }[] = [];
    for (const doc of snapshot.docs) {
      const d = doc.data();
      const img = d.profileImage || '';
      // Needs enrichment: no image, default placeholder, or old broken format (no timestamp)
      if (!img || img.includes('default.jpg') || (img.includes('/portrait/') && !/-\d+\./.test(img))) {
        const url = d.tmProfileUrl;
        if (url) toEnrich.push({ docId: doc.id, tmUrl: url });
      }
    }

    if (toEnrich.length === 0) {
      return NextResponse.json({ enriched: 0, total: snapshot.size, message: 'All profiles already have images' });
    }

    let enriched = 0;
    let failed = 0;
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 55000; // Leave 5s buffer before Vercel timeout
    for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
      if (i > 0) await sleep(DELAY_MS);
      // Stop early if running low on time
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      const chunk = toEnrich.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async ({ docId, tmUrl }) => {
          try {
            const html = await fetchHtmlWithRetry(tmUrl);
            const idMatch = tmUrl.match(/\/profil\/spieler\/(\d+)/);
            if (!idMatch) { failed++; return; }
            const imgUrl = extractImageFromHtml(html, idMatch[1]);
            await db.collection('ScoutProfiles').doc(docId).update({
              profileImage: imgUrl || TM_DEFAULT_IMG,
            });
            enriched++;
          } catch {
            failed++;
          }
        })
      );
    }

    return NextResponse.json({
      enriched,
      failed,
      total: toEnrich.length,
      alreadyGood: snapshot.size - toEnrich.length,
    });
  } catch (err) {
    console.error('Enrich images error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to enrich' },
      { status: 500 }
    );
  }
}
