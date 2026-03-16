const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const https = require('https');

const app = initializeApp({ projectId: 'mgsr-64e4b' });
const db = getFirestore();

function validateHandle(handle) {
  return new Promise((resolve) => {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'Instagram 275.0.0.27.98' },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve(data.status === 'ok' && !!data.data?.user?.username);
        } catch {
          // HTML = Page Not Found
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Small delay to avoid rate-limiting
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanCollection(collectionName) {
  const snap = await db.collection(collectionName).where('instagramHandle', '!=', null).get();
  if (snap.empty) {
    console.log(`[${collectionName}] No entries with instagramHandle`);
    return;
  }
  console.log(`[${collectionName}] Checking ${snap.size} entries...\n`);
  let cleaned = 0;
  let valid = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const handle = data.instagramHandle;
    if (!handle) continue;

    const isValid = await validateHandle(handle);
    const name = data.playerName || doc.id;

    if (isValid) {
      valid++;
      console.log(`  ✓ ${name} — @${handle}`);
    } else {
      cleaned++;
      await doc.ref.update({ instagramHandle: null, instagramUrl: null });
      console.log(`  ✗ ${name} — @${handle} (REMOVED — broken profile)`);
    }
    await sleep(1000); // 1s between requests to avoid IG rate-limiting
  }

  console.log(`\n[${collectionName}] Results: ${valid} valid, ${cleaned} removed, ${snap.size} total\n`);
}

(async () => {
  console.log('=== Instagram Handle Validation Cleanup ===\n');
  await cleanCollection('Shortlists');
  await cleanCollection('ShortlistsWomen');
  await cleanCollection('ShortlistsYouth');
  await cleanCollection('Players');
  console.log('Done!');
  process.exit(0);
})();
