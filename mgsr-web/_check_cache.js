const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  env[t.slice(0, eq)] = t.slice(eq + 1);
}

const app = initializeApp({ credential: cert({
  projectId: env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey: (env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
}) });
const db = getFirestore(app);

async function check() {
  // Check chunked contract-finishers
  const chunk0 = await db.collection('ScrapingCache').doc('contract-finishers-chunk-0').get();
  if (!chunk0.exists) {
    // Fallback: check old single-doc key
    const old = await db.collection('ScrapingCache').doc('contract-finishers').get();
    if (!old.exists) { console.log('contract-finishers: NOT FOUND'); }
    else {
      const d = old.data();
      const len = d.payload ? d.payload.length : 'no payload';
      const age = d.cachedAt ? Math.round((Date.now() - d.cachedAt) / 60000) + ' min ago' : 'no timestamp';
      console.log(`contract-finishers (old single-doc): ${len} items, cached ${age}`);
    }
  } else {
    const d = chunk0.data();
    const totalChunks = d.totalChunks || 1;
    let totalItems = d.payload ? d.payload.length : 0;
    for (let i = 1; i < totalChunks; i++) {
      const s = await db.collection('ScrapingCache').doc(`contract-finishers-chunk-${i}`).get();
      if (s.exists && s.data().payload) totalItems += s.data().payload.length;
    }
    const age = d.cachedAt ? Math.round((Date.now() - d.cachedAt) / 60000) + ' min ago' : 'no timestamp';
    console.log(`contract-finishers: ${totalItems} items in ${totalChunks} chunks, cached ${age}`);
  }

  // Check returnees (now chunked too)
  const retChunk0 = await db.collection('ScrapingCache').doc('returnees-stream-all-chunk-0').get();
  if (!retChunk0.exists) {
    // Fallback: check old single-doc key
    const old = await db.collection('ScrapingCache').doc('returnees-stream-all').get();
    if (!old.exists) { console.log('returnees-stream-all: NOT FOUND'); }
    else {
      const d = old.data();
      const len = d.payload ? d.payload.length : 'no payload';
      const age = d.cachedAt ? Math.round((Date.now() - d.cachedAt) / 60000) + ' min ago' : 'no timestamp';
      console.log(`returnees-stream-all (old single-doc): ${len} items, cached ${age}`);
    }
  } else {
    const d = retChunk0.data();
    const totalChunks = d.totalChunks || 1;
    let totalItems = d.payload ? d.payload.length : 0;
    for (let i = 1; i < totalChunks; i++) {
      const s = await db.collection('ScrapingCache').doc(`returnees-stream-all-chunk-${i}`).get();
      if (s.exists && s.data().payload) totalItems += s.data().payload.length;
    }
    const age = d.cachedAt ? Math.round((Date.now() - d.cachedAt) / 60000) + ' min ago' : 'no timestamp';
    console.log(`returnees-stream-all: ${totalItems} items in ${totalChunks} chunks, cached ${age}`);
  }

  process.exit(0);
}
check().catch(e => { console.error(e.message); process.exit(1); });
