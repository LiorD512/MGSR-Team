/**
 * Populate Firestore ScrapingCache for returnees & contract-finishers.
 * Runs locally or in GitHub Actions. Writes chunked Firestore docs.
 *
 * Local:  cd mgsr-web && npx tsx _populate_cache.ts [finishers|returnees]
 * GH Actions: env vars FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Load .env.local if it exists (local dev); GH Actions uses env vars directly
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials (set env vars or .env.local)');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

const CHUNK_SIZE = 2000;

async function writeChunked(key: string, items: unknown[]): Promise<{ written: number; chunks: number; errors: string[] }> {
  const totalChunks = Math.ceil(items.length / CHUNK_SIZE);
  const now = Date.now();
  const errors: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunk = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const docData: Record<string, unknown> = { payload: chunk, cachedAt: now };
    if (i === 0) docData.totalChunks = totalChunks;
    try {
      await db.collection('ScrapingCache').doc(`${key}-chunk-${i}`).set(docData);
      console.log(`  ✅ Chunk ${i}: ${chunk.length} items`);
    } catch (err: any) {
      const msg = `Chunk ${i} failed: ${err.message}`;
      console.error(`  ❌ ${msg}`);
      errors.push(msg);
    }
  }
  return { written: items.length, chunks: totalChunks, errors };
}

async function populateReturnees(): Promise<{ total: number; leagues: number; errors: string[] }> {
  console.log('\n=== Populating returnees cache ===');
  const { handleReturneesStream } = await import('./src/lib/transfermarkt');

  let finalPlayers: Record<string, unknown>[] = [];
  let leaguesLoaded = 0;
  let totalLeagues = 0;
  const errors: string[] = [];

  for await (const event of handleReturneesStream()) {
    if (event.players.length) finalPlayers = event.players;
    leaguesLoaded = event.loadedLeagues || leaguesLoaded;
    totalLeagues = event.totalLeagues || totalLeagues;
    console.log(`  [${new Date().toLocaleTimeString()}] Leagues: ${event.loadedLeagues}/${event.totalLeagues} | Players: ${event.players.length} | isLoading: ${event.isLoading}`);
  }

  if (finalPlayers.length) {
    console.log(`  Writing ${finalPlayers.length} returnees in chunks...`);
    const result = await writeChunked('returnees-stream-all', finalPlayers);
    errors.push(...result.errors);
    console.log(`  ✅ Cached ${finalPlayers.length} returnees to Firestore (${result.chunks} chunks)`);
  } else {
    console.log('  ⚠️  No returnees found — cache not updated');
    errors.push('No returnees found');
  }

  return { total: finalPlayers.length, leagues: leaguesLoaded, errors };
}

async function populateContractFinishers(): Promise<{ total: number; errors: string[] }> {
  console.log('\n=== Populating contract-finishers cache ===');
  const { handleContractFinishersStream } = await import('./src/lib/transfermarkt');

  let finalPlayers: Record<string, unknown>[] = [];
  for await (const event of handleContractFinishersStream()) {
    if (event.players.length) finalPlayers = event.players;
    console.log(`  [${new Date().toLocaleTimeString()}] Players: ${event.players.length} | isLoading: ${event.isLoading}`);
  }

  const errors: string[] = [];
  if (finalPlayers.length) {
    console.log(`  Writing ${finalPlayers.length} players in chunks...`);
    const result = await writeChunked('contract-finishers', finalPlayers);
    errors.push(...result.errors);
    console.log(`  ✅ Cached all ${finalPlayers.length} contract finishers to Firestore (${result.chunks} chunks)`);
  } else {
    console.log('  ⚠️  No contract finishers found — cache not updated');
    errors.push('No contract finishers found');
  }

  return { total: finalPlayers.length, errors };
}

async function main() {
  const start = Date.now();
  const target = process.argv[2]; // 'returnees', 'finishers', or empty for both
  const isCI = !!process.env.CI;

  let cfResult: { total: number; errors: string[] } | null = null;
  let retResult: { total: number; leagues: number; errors: string[] } | null = null;

  if (!target || target === 'finishers') {
    cfResult = await populateContractFinishers();
  }
  if (!target || target === 'returnees') {
    retResult = await populateReturnees();
  }

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);

  // Print report
  console.log('\n' + '='.repeat(50));
  console.log('📊 CACHE POPULATION REPORT');
  console.log('='.repeat(50));
  console.log(`Environment: ${isCI ? 'GitHub Actions' : 'Local'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Duration: ${elapsed} minutes`);

  if (cfResult) {
    console.log(`\nContract Finishers:`);
    console.log(`  Players scraped: ${cfResult.total}`);
    console.log(`  Chunks written: ${Math.ceil(cfResult.total / CHUNK_SIZE)}`);
    console.log(`  Status: ${cfResult.errors.length === 0 ? '✅ SUCCESS' : '⚠️  PARTIAL (' + cfResult.errors.length + ' errors)'}`);
    if (cfResult.errors.length) cfResult.errors.forEach(e => console.log(`    - ${e}`));
  }

  if (retResult) {
    console.log(`\nReturnees:`);
    console.log(`  Players scraped: ${retResult.total}`);
    console.log(`  Leagues loaded: ${retResult.leagues}`);
    console.log(`  Chunks written: ${Math.ceil(retResult.total / CHUNK_SIZE)}`);
    console.log(`  Status: ${retResult.errors.length === 0 ? '✅ SUCCESS' : '⚠️  PARTIAL (' + retResult.errors.length + ' errors)'}`);
    if (retResult.errors.length) retResult.errors.forEach(e => console.log(`    - ${e}`));
  }

  console.log('\n' + '='.repeat(50));

  const hasErrors = (cfResult?.errors.length ?? 0) > 0 || (retResult?.errors.length ?? 0) > 0;
  const totalPlayers = (cfResult?.total ?? 0) + (retResult?.total ?? 0);

  if (totalPlayers === 0) {
    console.log('❌ FAILED — no players scraped at all');
    process.exit(1);
  } else if (hasErrors) {
    console.log('⚠️  COMPLETED WITH ERRORS');
    process.exit(0); // don't fail the workflow, data was partially written
  } else {
    console.log(`✅ ALL DONE — ${totalPlayers} total players cached`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
