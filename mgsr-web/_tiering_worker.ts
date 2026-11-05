/**
 * Roster Intelligence — weekly background agent (men roster).
 *
 * Reads everything we hold on every roster player (notes, contract, mandate, market value + history,
 * match stats, FM ability, injuries, club/league strength, recent news) and computes, mathematically:
 *   • Level  — the league tier + role the player fits, with a ceiling (prediction).
 *   • Urgency / push strength.
 *   • Worth  — a single 0-100 "work on him next window" score used to rank the roster.
 * Writes PlayerTiers/{id}. The dashboard only reads. No user interaction.
 *
 * Modes
 *   npx tsx _tiering_worker.ts sweep [--force]   # full roster, then exit (GitHub Actions, weekly)
 *   npx tsx _tiering_worker.ts player <id>       # one player (debug)
 *
 * Env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, GEMINI_API_KEY,
 *      optional SCOUT_SERVER_URL, TIERING_APP_ORIGIN, TIERING_ALERT_EMAILS, TIERING_CONCURRENCY (default 4).
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
  const { sweepRoster, loadContext, processPlayer, notifyOwners } = await import('./src/lib/tiering/server');
  const { rankBoard } = await import('./src/lib/tiering/shared');

  if (!getFirebaseAdmin()) {
    console.error('Missing Firebase credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) console.warn('⚠ GEMINI_API_KEY not set — running the maths engine only (no AI summary/news).');

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
    console.log(JSON.stringify(r.doc.analysis, null, 2));
    return;
  }

  log(`weekly sweep start (concurrency ${concurrency}${force ? ', forced' : ''})`);
  const meta = await sweepRoster(db, { appOrigin, force, concurrency, log });
  log(`done: ${meta.analysed}/${meta.total} players, ${meta.aiCalls} AI analyses, ${Math.round((meta.durationMs ?? 0) / 1000)}s, ${meta.errors?.length ?? 0} errors`);

  // Weekly digest push of the top targets (only if TIERING_ALERT_EMAILS is set).
  try {
    const ctx = await loadContext(db);
    const board = rankBoard(Array.from(ctx.tiers.values()));
    if (board.length) {
      const names = board.slice(0, 3).map((d) => d.playerName).filter(Boolean).join(', ');
      const res = await notifyOwners(db, {
        title: `This week's top ${board.length} to work on`,
        body: names ? `${names}${board.length > 3 ? ` +${board.length - 3} more` : ''}` : 'Roster intelligence refreshed.',
      });
      log(`digest: ${res.sent} push to ${res.owners} owner(s)`);
    }
  } catch (e) {
    log(`digest skipped: ${e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
