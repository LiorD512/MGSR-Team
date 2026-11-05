/**
 * Roster Intelligence — weekly background agent (men roster).
 *
 * Stores a weekly stats snapshot for every roster player and flags those whose situation changed:
 * hot/cold form, suddenly playing, fallen out of the side, output surge, market-value move,
 * contract/mandate clock. Reason always shown. Uses ONLY in-app data — our scout server
 * /player_stats (season aggregates) + the Players doc + ClubRequests/PlayerDocuments/AgentTasks.
 * No external scrapers, no AI/news. Writes PlayerTiers/{id}; the dashboard only reads.
 *
 * Modes
 *   npx tsx _tiering_worker.ts sweep [--force]   # full roster, then exit (GitHub Actions, weekly)
 *   npx tsx _tiering_worker.ts player <id>       # one player (debug)
 *
 * Env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *      optional SCOUT_SERVER_URL, TIERING_CONCURRENCY (default 4).
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
  const { adminDb, getFirebaseAdmin } = await import('./src/lib/firebaseAdmin');
  const { sweepRoster, loadContext, processPlayer } = await import('./src/lib/tiering/server');

  if (!getFirebaseAdmin()) {
    console.error('Missing Firebase credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
    process.exit(1);
  }

  const db = adminDb();
  const [mode = 'sweep', arg] = process.argv.slice(2);
  const force = process.argv.includes('--force');
  const concurrency = Number(process.env.TIERING_CONCURRENCY) || 4;
  const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

  if (mode === 'player') {
    if (!arg) throw new Error('usage: player <playerId>');
    const ctx = await loadContext(db);
    const p = ctx.players.find((x) => x.id === arg);
    if (!p) throw new Error(`player ${arg} not on roster`);
    const r = await processPlayer(db, ctx, p, { force: true });
    console.log(JSON.stringify(r.doc.intel ?? '(no signal)', null, 2));
    return;
  }

  log(`weekly sweep start (concurrency ${concurrency}${force ? ', forced' : ''})`);
  const meta = await sweepRoster(db, { force, concurrency, log });
  log(
    `done: ${meta.analysed}/${meta.total} analysed, ${meta.flagged} flagged, ${meta.statsMatched} with stats, ` +
      `${Math.round((meta.durationMs ?? 0) / 1000)}s, ${meta.errors?.length ?? 0} errors`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
