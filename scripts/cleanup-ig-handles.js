const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({ projectId: 'mgsr-64e4b' });
const db = getFirestore();

const BAD_HANDLES = new Set(['transfermarkt_official', 'transfermarkt', 'transfermarkt.de']);

async function cleanup(collectionName) {
  const snap = await db.collection(collectionName).where('instagramHandle', '!=', null).get();
  let cleaned = 0;
  for (const doc of snap.docs) {
    const handle = doc.data().instagramHandle;
    if (handle && BAD_HANDLES.has(handle.toLowerCase())) {
      await doc.ref.update({ instagramHandle: null, instagramUrl: null });
      console.log(`[${collectionName}] Cleaned: ${doc.data().playerName || doc.id} (was: ${handle})`);
      cleaned++;
    }
  }
  console.log(`[${collectionName}] Total cleaned: ${cleaned}/${snap.size}`);
}

(async () => {
  await cleanup('Shortlists');
  await cleanup('ShortlistsWomen');
  await cleanup('ShortlistsYouth');
  await cleanup('Players');
  console.log('Done!');
  process.exit(0);
})();
