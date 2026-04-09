/**
 * _enrich_images.ts — Scrape TM profile images for ScoutProfiles missing them.
 * Writes results to the persistent ScoutImageCache collection (14-day TTL).
 * Then updates ScoutProfiles docs with the resolved image URLs.
 *
 * Run: npx tsx _enrich_images.ts
 * Works locally (.env.local) and in GitHub Actions (env vars).
 */
import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { fetchHtmlWithRetry } from './src/lib/transfermarkt';

// ── Firebase init ──
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

if (!projectId || !clientEmail || !privateKey) {
  // Try .env.local
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
  const p = process.env.FIREBASE_PROJECT_ID;
  const c = process.env.FIREBASE_CLIENT_EMAIL;
  const k = process.env.FIREBASE_PRIVATE_KEY || '';
  if (!p || !c || !k) {
    console.error('Missing Firebase credentials');
    process.exit(1);
  }
  initializeApp({ credential: cert({ projectId: p, clientEmail: c, privateKey: k.replace(/\\n/g, '\n') } as ServiceAccount) });
} else {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') } as ServiceAccount) });
}

const db = getFirestore();
const TM_DEFAULT_IMG = 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';
const IMAGE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const CONCURRENCY = 3;
const DELAY_MS = 2000;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function extractImageFromHtml(html: string, playerId: string): string | null {
  const re = new RegExp(
    `https://img[^"']*?/portrait/(?:big|medium|header)/${playerId}-[^"'?]+\\.(?:jpg|png)[^"']*`
  );
  const match = html.match(re);
  if (!match) return null;
  return match[0].replace('/medium/', '/big/').replace('/header/', '/big/');
}

async function main() {
  const startTime = Date.now();
  console.log('=== Scout Profile Image Enrichment ===\n');

  // Step 1: Load existing image cache
  const cacheSnap = await db.collection('ScoutImageCache').get();
  const imageCache = new Map<string, { imageUrl: string; cachedAt: number }>();
  for (const doc of cacheSnap.docs) {
    const d = doc.data();
    if (d.imageUrl && d.cachedAt && (Date.now() - d.cachedAt) < IMAGE_CACHE_TTL_MS) {
      imageCache.set(d.playerUrl, { imageUrl: d.imageUrl, cachedAt: d.cachedAt });
    }
  }
  console.log(`Image cache: ${imageCache.size} valid entries (of ${cacheSnap.size} total)`);

  // Step 2: Load ScoutProfiles needing images
  const profilesSnap = await db.collection('ScoutProfiles').get();
  const toEnrich: { docId: string; tmUrl: string }[] = [];
  let alreadyGood = 0;
  let cacheHits = 0;

  for (const doc of profilesSnap.docs) {
    const d = doc.data();
    const tmUrl = d.tmProfileUrl;
    if (!tmUrl) continue;
    const img = d.profileImage || '';

    // Check cache first
    const cached = imageCache.get(tmUrl);
    if (cached) {
      // If profile has different image than cache, update it
      if (img !== cached.imageUrl) {
        await doc.ref.update({ profileImage: cached.imageUrl });
        cacheHits++;
      } else {
        alreadyGood++;
      }
      continue;
    }

    // Needs enrichment: no image, default placeholder, or broken format
    if (!img || img.includes('default.jpg') || (img.includes('/portrait/') && !/-\d+\./.test(img))) {
      toEnrich.push({ docId: doc.id, tmUrl });
    } else {
      alreadyGood++;
    }
  }

  console.log(`Profiles: ${profilesSnap.size} total, ${alreadyGood} good, ${cacheHits} updated from cache, ${toEnrich.length} need TM scrape\n`);

  if (toEnrich.length === 0) {
    console.log('Nothing to scrape — all profiles have images.');
    process.exit(0);
  }

  // Step 3: Scrape TM for missing images
  let enriched = 0;
  let failed = 0;
  let defaultPlaceholders = 0;
  const cacheWrites: { playerUrl: string; imageUrl: string; cachedAt: number }[] = [];

  for (let i = 0; i < toEnrich.length; i += CONCURRENCY) {
    if (i > 0) await sleep(DELAY_MS);
    const chunk = toEnrich.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async ({ docId, tmUrl }) => {
        try {
          const html = await fetchHtmlWithRetry(tmUrl);
          const idMatch = tmUrl.match(/\/profil\/spieler\/(\d+)/);
          if (!idMatch) { failed++; return; }
          const imgUrl = extractImageFromHtml(html, idMatch[1]);
          const finalImg = imgUrl || TM_DEFAULT_IMG;

          // Update profile
          await db.collection('ScoutProfiles').doc(docId).update({ profileImage: finalImg });

          // Queue cache write
          cacheWrites.push({ playerUrl: tmUrl, imageUrl: finalImg, cachedAt: Date.now() });

          if (imgUrl) enriched++;
          else defaultPlaceholders++;

          console.log(`  [${i + 1}/${toEnrich.length}] ${imgUrl ? '✅' : '📷'} ${tmUrl.split('/').pop()}`);
        } catch (err: any) {
          failed++;
          console.log(`  [${i + 1}/${toEnrich.length}] ❌ ${tmUrl.split('/').pop()} — ${err.message || err}`);
        }
      })
    );
  }

  // Step 4: Batch write to ScoutImageCache
  if (cacheWrites.length > 0) {
    const BATCH_SIZE = 450;
    for (let i = 0; i < cacheWrites.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const entry of cacheWrites.slice(i, i + BATCH_SIZE)) {
        const docId = createHash('md5').update(entry.playerUrl).digest('hex');
        batch.set(db.collection('ScoutImageCache').doc(docId), entry, { merge: true });
      }
      await batch.commit();
    }
    console.log(`\nWrote ${cacheWrites.length} entries to ScoutImageCache`);
  }

  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== REPORT ===`);
  console.log(`Duration: ${durationMin} minutes`);
  console.log(`Profiles: ${profilesSnap.size} total`);
  console.log(`Already good: ${alreadyGood}`);
  console.log(`Updated from cache: ${cacheHits}`);
  console.log(`Freshly scraped: ${enriched} real images, ${defaultPlaceholders} no-photo`);
  console.log(`Failed: ${failed}`);
  console.log(`Cache entries written: ${cacheWrites.length}`);

  // GitHub Actions summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('fs');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '## Scout Image Enrichment Report',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Duration | ${durationMin} min |`,
      `| Total profiles | ${profilesSnap.size} |`,
      `| Already good | ${alreadyGood} |`,
      `| From cache | ${cacheHits} |`,
      `| Scraped (real) | ${enriched} |`,
      `| Scraped (no-photo) | ${defaultPlaceholders} |`,
      `| Failed | ${failed} |`,
      `| Cache writes | ${cacheWrites.length} |`,
      '',
    ].join('\n'));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
