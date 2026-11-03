/**
 * Level & Focus — background worker (men roster).
 *
 * Analyses every roster player in the background: news (Google News + Gemini Google Search), match ratings,
 * FM ability, injuries, club strength, contract, mandate, matching club requests and transfer windows →
 * Level, Focus, and a HOW/WHEN push plan. Nobody clicks anything; the dashboard only reads results.
 *
 * Modes
 *   npx tsx _tiering_worker.ts sweep            # full roster sweep, then exit (GitHub Actions, every few hours)
 *   npx tsx _tiering_worker.ts sweep --force    # ignore all caches
 *   npx tsx _tiering_worker.ts watch            # sweep, then stay up: re-analyse a player within seconds when
 *                                               # his doc, a mandate or a club request changes, and sweep hourly
 *                                               # (for an always-on host such as a Cloud Run service or a VM)
 *   npx tsx _tiering_worker.ts player <id>      # one player
 *
 * Env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, GEMINI_API_KEY,
 *      optional SCOUT_SERVER_URL, TIERING_APP_ORIGIN (for the live FMInside fallback), TIERING_ALERT_EMAILS,
 *      TIERING_CONCURRENCY (default 4).
 */
import fs from 'fs';
import path from 'path';

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const k = trimmed.slice(0, eq);
    if (!process.env[k]) process.env[k] = trimmed.slice(eq + 1);
  }
}

async function main() {
  // Imported after env is loaded so firebaseAdmin picks the credentials up.
  const { adminDb, getFirebaseAdmin } = await import('./src/lib/firebaseAdmin');
  const { sweepRoster, loadContext, processPlayer, alertIfNewlyUrgent } = await import('./src/lib/tiering/server');

  if (!getFirebaseAdmin()) {
    console.error('Missing Firebase credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) console.warn('⚠ GEMINI_API_KEY not set — running criteria engine only (no AI analyst, no news reasoning).');

  const db = adminDb();
  const [mode = 'sweep', arg] = process.argv.slice(2);
  const force = process.argv.includes('--force');
  const appOrigin = process.env.TIERING_APP_ORIGIN || 'https://management.britsportgroup.com';
  const concurrency = Number(process.env.TIERING_CONCURRENCY) || 4;
  const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

  if (mode === 'player') {
    if (!arg) throw new Error('usage: player <playerId>');
    const ctx = await loadContext(db);
    const p = ctx.players.find((x) => x.id === arg);
    if (!p) throw new Error(`player ${arg} not on roster`);
    const r = await processPlayer(db, ctx, p, { appOrigin, force: true });
    await alertIfNewlyUrgent(db, r.doc);
    console.log(JSON.stringify(r.doc.ai, null, 2));
    return;
  }

  const runSweep = async (f: boolean) => {
    log(`sweep start (concurrency ${concurrency}${f ? ', forced' : ''})`);
    const meta = await sweepRoster(db, { appOrigin, force: f, concurrency, log });
    log(`sweep done: ${meta.analysed}/${meta.total} players, ${meta.aiCalls} AI analyses, ${Math.round((meta.durationMs ?? 0) / 1000)}s, ${meta.errors?.length ?? 0} errors`);
  };

  await runSweep(force);
  if (mode !== 'watch') return;

  // ── watch mode: react to changes in near real time ──
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    const ids = Array.from(pending);
    pending.clear();
    if (!ids.length) return;
    log(`change detected → re-analysing ${ids.length} player(s)`);
    sweepRoster(db, { appOrigin, concurrency, onlyIds: ids, log }).catch((e) => log(`watch error: ${e}`));
  };
  const queue = (id: string) => {
    pending.add(id);
    if (!timer) timer = setTimeout(flush, 15_000); // debounce bursts of edits
  };

  let first = true;
  db.collection('Players').onSnapshot((snap) => {
    if (first) {
      first = false;
      return;
    }
    snap.docChanges().forEach((c) => {
      if (c.type !== 'removed') queue(c.doc.id);
    });
  });
  // Mandates and club requests affect many players → schedule a quick sweep (caches make it cheap).
  let firstOther = 0;
  const sweepSoon = () => {
    if (firstOther < 2) {
      firstOther++;
      return;
    }
    if (!timer) timer = setTimeout(() => runSweep(false).catch((e) => log(`${e}`)), 30_000);
  };
  db.collection('PlayerDocuments').where('type', '==', 'MANDATE').onSnapshot(sweepSoon);
  db.collection('ClubRequests').onSnapshot(sweepSoon);

  setInterval(() => runSweep(false).catch((e) => log(`${e}`)), 60 * 60 * 1000);
  log('watching for changes…');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
