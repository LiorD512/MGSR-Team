/**
 * Request-matching level data — weekly worker (men platform). Phase B-C of docs/REQUEST_MATCHING_PLAN.md §8.
 *
 * Builds the data the matching engine's "club level" model reads:
 *   1. every requesting club (open men's requests): squad strength + 3 seasons of real signings → MatchingClubLevels/{id}
 *   2. every roster player: the club his level is judged by (current club, or last club for free agents) and the
 *      date of the last game he actually played → MatchingData/playerLevels
 *   3. strength (median squad value) of every club involved → MatchingData/clubStrength
 *
 * Read-only towards Players / ClubRequests. Caches everything (club strength 30 days, requesting clubs 7 days,
 * player info 7 days), so a normal weekly run only fetches what changed. Paced at ~1 page / 0.5-1s.
 *
 *   npx tsx _matching_worker.ts [--force] [--max-fetches=1500] [--minutes=50] [--club=<vereinId>]
 *   (local runs can use e.g. --minutes=180 --max-fetches=4000 to finish the whole roster in one go)
 * Env: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, TM_HTML_PROXY_URL (GitHub Actions).
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
    if (!process.env[k]) process.env[k] = trimmed.slice(eq + 1).replace(/^"|"$/g, '');
  }
}

const arg = (n: string) => process.argv.slice(2).find((a) => a === `--${n}` || a.startsWith(`--${n}=`))?.split('=')[1];
const FORCE = process.argv.includes('--force');
const MAX_FETCHES = Number(arg('max-fetches')) || 1500;
const ONLY_CLUB = arg('club');
const MINUTES = Number(arg('minutes')) || 50; // GitHub Actions job timeout is 60 min
const PLAYER_TTL_MS = 7 * 86_400_000;

async function main() {
  const { adminDb, getFirebaseAdmin } = await import('./src/lib/firebaseAdmin');
  const { loadStore, saveStore, buildClubLevel, ensureStrength, CLUB_LEVELS, CLUB_LEVEL_TTL_MS } = await import('./src/lib/matching/levelServer');
  const { lastClubOf } = await import('./src/lib/matching/levelScrape');
  const { fetchRecentGames } = await import('./src/lib/transfermarkt');
  const { tmClubId, tmPlayerId, isFreeAgent } = await import('./src/lib/matching/engine');
  if (!getFirebaseAdmin()) {
    console.error('Missing Firebase credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
    process.exit(1);
  }
  const db = adminDb();
  const t0 = Date.now();
  const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
  const budget = { fetches: MAX_FETCHES, deadline: t0 + MINUTES * 60_000, log };

  const [reqSnap, playersSnap, tiersSnap, levelsSnap, store] = await Promise.all([
    db.collection('ClubRequests').get(),
    db.collection('Players').get(),
    db.collection('PlayerTiers').get(),
    db.collection(CLUB_LEVELS).get(),
    loadStore(db),
  ]);
  const existing = new Map(levelsSnap.docs.map((d) => [d.id, d.data() as { updatedAt?: number }]));

  // ── 1. requesting clubs ──
  const clubIds = new Set<string>();
  for (const d of reqSnap.docs) {
    const r = d.data();
    if ((r.status || 'pending') !== 'pending') continue;
    const id = tmClubId(r.clubTmProfile);
    if (id) clubIds.add(id);
  }
  const targets = Array.from(clubIds).filter((id) => (!ONLY_CLUB || id === ONLY_CLUB) && (FORCE || !existing.has(id) || Date.now() - (existing.get(id)!.updatedAt ?? 0) > CLUB_LEVEL_TTL_MS));
  log(`requesting clubs: ${clubIds.size} (${targets.length} to (re)build)`);
  let built = 0;
  for (const id of targets) {
    const lvl = await buildClubLevel(id, store, budget);
    if (!lvl) { log(`  ${id}: failed / out of budget`); continue; }
    await db.collection(CLUB_LEVELS).doc(id).set(lvl);
    built++;
    const known = lvl.signings.filter((s) => s.mv > 0).length;
    log(`  ${lvl.name} (${id}): squad median ${lvl.squadMedian ?? '-'}, ${lvl.signings.length} signings (${known} with value) · fetches left ${budget.fetches}`);
    if (built % 5 === 0) await saveStore(db, store, ['strength', 'leagues']);
  }
  await saveStore(db, store, ['strength', 'leagues']);

  // ── 2. roster players ──
  if (!ONLY_CLUB) {
    const tierGames = new Map(tiersSnap.docs.map((d) => [d.id, (d.data().recentGames ?? []) as { date: string; state?: string }[]]));
    let playersDone = 0, lastClubLookups = 0, gameLookups = 0;
    for (const d of playersSnap.docs) {
      const p = { id: d.id, ...d.data() } as Parameters<typeof isFreeAgent>[0] & { recentGames?: { date: string; state?: string }[] };
      const prev = store.players[p.id];
      if (!FORCE && prev && Date.now() - prev.at < PLAYER_TTL_MS) continue;
      if (budget.fetches <= 0 || Date.now() > budget.deadline) break;
      const tmId = tmPlayerId(p.tmProfile);
      const free = isFreeAgent(p);
      let clubId = free ? null : tmClubId(p.currentClub?.clubTmProfile);
      let clubName = free ? null : p.currentClub?.clubName ?? null;
      if (!clubId && tmId) {
        lastClubLookups++;
        budget.fetches--;
        const lc = await lastClubOf(tmId).catch(() => null);
        if (lc) { clubId = lc.id; clubName = lc.name; }
      }
      const games = (p.recentGames?.length ? p.recentGames : tierGames.get(p.id)) ?? [];
      let lastPlayed = games.filter((g) => g.state === 'played').map((g) => g.date).sort().pop() ?? null;
      if (!lastPlayed && p.tmProfile && (free || !games.length)) {
        gameLookups++;
        budget.fetches--;
        const g = await fetchRecentGames(p.tmProfile, 40).catch(() => []);
        lastPlayed = g.filter((x) => x.state === 'played').map((x) => x.date).sort().pop() ?? null;
      }
      if (clubId) await ensureStrength(clubId, store, budget);
      store.players[p.id] = { clubId, clubName, lastPlayed, at: Date.now() };
      playersDone++;
      if (playersDone % 50 === 0) {
        await saveStore(db, store);
        log(`  players ${playersDone} · last-club lookups ${lastClubLookups} · game lookups ${gameLookups} · fetches left ${budget.fetches}`);
      }
    }
    // drop players that left the roster
    const ids = new Set(playersSnap.docs.map((d) => d.id));
    for (const k of Object.keys(store.players)) if (!ids.has(k)) delete store.players[k];
    log(`players updated: ${playersDone} (last-club lookups ${lastClubLookups}, game lookups ${gameLookups})`);
  }
  await saveStore(db, store);
  log(`done in ${Math.round((Date.now() - t0) / 1000)}s · clubs built ${built} · strengths ${Object.keys(store.strength).length} · TM fetches used ${MAX_FETCHES - budget.fetches}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
