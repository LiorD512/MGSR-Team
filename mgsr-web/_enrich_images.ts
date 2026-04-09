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
let projectId = process.env.FIREBASE_PROJECT_ID;
let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

if (!projectId || !clientEmail || !privateKey) {
  // Try .env.local (local dev)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config({ path: '.env.local' });
  projectId = process.env.FIREBASE_PROJECT_ID;
  clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firebase credentials');
    process.exit(1);
  }
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') } as ServiceAccount) });

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

  // Step 2: Load ScoutProfiles, collect TM URLs that need scraping
  const profilesSnap = await db.collection('ScoutProfiles').get();
  const urlsToScrape = new Set<string>();
  let alreadyGood = 0;
  let cacheHits = 0;

  for (const doc of profilesSnap.docs) {
    const d = doc.data();
    const tmUrl = d.tmProfileUrl;
    if (!tmUrl) continue;
    const img = d.profileImage || '';

    // Already in cache — skip scraping (will apply in step 4)
    if (imageCache.has(tmUrl)) {
      if (img !== imageCache.get(tmUrl)!.imageUrl) cacheHits++;
      else alreadyGood++;
      continue;
    }

    // Needs enrichment: no image, default placeholder, or broken format
    if (!img || img.includes('default.jpg') || (img.includes('/portrait/') && !/-\d+\./.test(img))) {
      urlsToScrape.add(tmUrl);
    } else {
      alreadyGood++;
    }
  }

  console.log(`Profiles: ${profilesSnap.size} total, ${alreadyGood} good, ${cacheHits} will update from cache, ${urlsToScrape.size} unique URLs need TM scrape\n`);

  // Step 3: Scrape TM for missing images → write directly to ScoutImageCache
  let enriched = 0;
  let failed = 0;
  let defaultPlaceholders = 0;
  const urlList = Array.from(urlsToScrape);

  for (let i = 0; i < urlList.length; i += CONCURRENCY) {
    if (i > 0) await sleep(DELAY_MS);
    const chunk = urlList.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (tmUrl) => {
        try {
          const html = await fetchHtmlWithRetry(tmUrl);
          const idMatch = tmUrl.match(/\/profil\/spieler\/(\d+)/);
          if (!idMatch) { failed++; return; }
          const imgUrl = extractImageFromHtml(html, idMatch[1]);
          const finalImg = imgUrl || TM_DEFAULT_IMG;

          // Write to cache immediately (deterministic doc ID — never fails)
          const cacheDocId = createHash('md5').update(tmUrl).digest('hex');
          await db.collection('ScoutImageCache').doc(cacheDocId).set(
            { playerUrl: tmUrl, imageUrl: finalImg, cachedAt: Date.now() },
            { merge: true }
          );

          // Also add to in-memory cache for step 4
          imageCache.set(tmUrl, { imageUrl: finalImg, cachedAt: Date.now() });

          if (imgUrl) enriched++;
          else defaultPlaceholders++;

          console.log(`  [${i + 1}/${urlList.length}] ${imgUrl ? '✅' : '📷'} ${tmUrl.split('/').pop()}`);
        } catch (err: any) {
          failed++;
          console.log(`  [${i + 1}/${urlList.length}] ❌ ${tmUrl.split('/').pop()} — ${err.message || err}`);
        }
      })
    );
  }

  // Step 4: Apply cached images to ScoutProfiles
  // Use chunked WHERE-IN queries instead of a full collection read for reliability
  console.log('\nApplying images to current ScoutProfiles...');
  let applied = 0;
  let skipped = 0;
  let notFound = 0;
  const BATCH_SIZE = 450;
  const IN_LIMIT = 30; // Firestore WHERE IN max

  // Build list of all tmUrls we have cached images for
  const cachedUrls = Array.from(imageCache.keys());
  console.log(`Have ${cachedUrls.length} cached URLs to apply`);

  for (let i = 0; i < cachedUrls.length; i += IN_LIMIT) {
    const urlChunk = cachedUrls.slice(i, i + IN_LIMIT);
    try {
      const querySnap = await db.collection('ScoutProfiles')
        .where('tmProfileUrl', 'in', urlChunk)
        .get();

      if (querySnap.empty) {
        notFound += urlChunk.length;
        continue;
      }

      let batch = db.batch();
      let batchCount = 0;

      for (const doc of querySnap.docs) {
        const d = doc.data();
        const cached = imageCache.get(d.tmProfileUrl);
        if (!cached) continue;

        const currentImg = d.profileImage || '';
        if (currentImg === cached.imageUrl) { skipped++; continue; }

        batch.update(doc.ref, { profileImage: cached.imageUrl });
        batchCount++;
        applied++;

        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
    } catch (err: any) {
      console.log(`  Query chunk ${i / IN_LIMIT + 1} failed: ${err.message}`);
      notFound += urlChunk.length;
    }
  }
  console.log(`Applied ${applied} images, ${skipped} already up-to-date, ${notFound} URLs not found in profiles`);

  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== REPORT ===`);
  console.log(`Duration: ${durationMin} minutes`);
  console.log(`Profiles: ${profilesSnap.size} initial`);
  console.log(`Already good: ${alreadyGood}`);
  console.log(`From cache (pre-existing): ${cacheHits}`);
  console.log(`Freshly scraped: ${enriched} real images, ${defaultPlaceholders} no-photo`);
  console.log(`Failed scrapes: ${failed}`);
  console.log(`Images applied: ${applied}, skipped: ${skipped}, not found: ${notFound}`);

  // GitHub Actions summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = require('fs');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '## Scout Image Enrichment Report',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Duration | ${durationMin} min |`,
      `| Initial profiles | ${profilesSnap.size} |`,
      `| Already good | ${alreadyGood} |`,
      `| From cache | ${cacheHits} |`,
      `| Scraped (real) | ${enriched} |`,
      `| Scraped (no-photo) | ${defaultPlaceholders} |`,
      `| Failed scrapes | ${failed} |`,
      `| Images applied | ${applied} |`,
      `| Skipped (up-to-date) | ${skipped} |`,
      `| Not found | ${notFound} |`,
      '',
    ].join('\n'));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
