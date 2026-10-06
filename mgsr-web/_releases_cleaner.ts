/**
 * Releases Cleaner — GitHub Actions weekly worker (MEN platform / FeedEvents).
 *
 * PURPOSE
 *   Keeps the men's "Latest Releases" screen (/release-notifications) clean by
 *   hiding players who were released but have since SIGNED A NEW CLUB — so the
 *   screen only shows players who are genuinely still without a club.
 *
 * HOW IT DECIDES (per-player, from the player's own TM profile)
 *   For every NEW_RELEASE_FROM_CLUB event currently on the screen, fetch the
 *   player's TM profile and classify:
 *     - STILL FREE  → current club is a "without club" variant, OR the profile
 *                     carries a "Joining: Without Club" / "To leave" marker
 *                     (contract ending into no club — e.g. a player still rostered
 *                     this season but leaving for free). These stay visible.
 *     - SIGNED      → a real current club AND no "joining without club" marker.
 *                     These get hidden.
 *     - UNKNOWN     → profile fetch failed / unparseable → leave as-is (fail-safe).
 *   The list-based "free agent" sources are NOT authoritative here: TM's
 *   free-agent lists don't cover the whole released population and ignore the
 *   value filter, so only the player's own profile reliably answers "signed?".
 *
 * NON-DESTRUCTIVE
 *   NEVER deletes FeedEvents. Only toggles a boolean field `hiddenFromReleases`:
 *     - true  when the player has signed a new club
 *     - false (self-heal) if a previously-hidden player is free again
 *   The men's screen filters out events where hiddenFromReleases === true.
 *
 * SCOPE
 *   Men platform only — operates exclusively on the `FeedEvents` collection.
 *   Does NOT touch FeedEventsWomen / FeedEventsYouth, and does NOT touch the
 *   releases refresh workers (workers-job/releasesRefresh.js, _releases_refresh.ts).
 *
 * ANTI-BLOCK
 *   TM challenges plain requests from GitHub Actions IPs (HTTP 202), so fetches
 *   go through the shared HTML proxy the Cloud Run workers use, with a direct
 *   header-generator fetch as fallback and per-URL retries. Runs weekly.
 *
 * STATE
 *   WorkerRuns/ReleasesCleanerWorker — status/summary for observability.
 *
 * USAGE
 *   Dry run (prints what it WOULD hide/unhide, writes nothing):
 *     cd mgsr-web && npx tsx _releases_cleaner.ts --dry-run
 *   Apply:
 *     cd mgsr-web && npx tsx _releases_cleaner.ts
 *   Options:
 *     --limit=N   only process the first N screen players (debug)
 *   GH Actions: env FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as cheerio from 'cheerio';
import { HeaderGenerator } from 'header-generator';
import * as fs from 'fs';
import * as path from 'path';

// ── .env.local support (local dev) ──
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

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  if (!arg) return 0;
  const n = Number.parseInt(arg.split('=')[1], 10);
  return Number.isNaN(n) ? 0 : n;
})();

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('[ReleasesCleaner] Missing Firebase credentials (set env vars or .env.local)');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

// ── Constants ──
const TM_HTML_PROXY_URL =
  process.env.TM_HTML_PROXY_URL ||
  'https://management.britsportgroup.com/api/transfermarkt/html-proxy';
const FEED_EVENTS_TABLE = 'FeedEvents'; // MEN platform collection
const WORKER_RUNS_COLLECTION = 'WorkerRuns';
const WORKER_STATE_DOC = 'ReleasesCleanerWorker';
const FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB = 'NEW_RELEASE_FROM_CLUB';

const WITHOUT_CLUB_VARIANTS = [
  'without club', 'ohne verein', 'sans club', 'sin club',
  'senza squadra', 'sem clube', 'geen club', 'bez klubu',
  'klubsuz', 'free agent', 'vereinslos', 'retired', 'career break',
];

// Max profiles to classify per run (safety cap on TM volume).
const MAX_PROFILES_PER_RUN = Number(process.env.MAX_PROFILES_PER_RUN || 1500);
// Health gate: if fewer than this fraction of profiles classified successfully,
// treat the run as degraded and skip all writes (fail-safe = keep showing).
const MIN_SUCCESS_RATE = Number(process.env.MIN_SUCCESS_RATE || 0.6);

// ── Fetch pacing / per-URL retry (no global circuit breaker — see note) ──
let _lastFetchTime = 0;
const MIN_FETCH_GAP_MS = Number(process.env.TM_MIN_GAP_MS || 1200);
const MAX_FETCH_GAP_MS = Number(process.env.TM_MAX_GAP_MS || 2800);
const FETCH_TIMEOUT_MS = 30000;
const FETCH_URL_ATTEMPTS = Number(process.env.TM_FETCH_ATTEMPTS || 4);
const FETCH_RETRY_BASE_MS = Number(process.env.TM_FETCH_RETRY_MS || 3000);

const headerGen = new HeaderGenerator({
  browsers: [{ name: 'chrome', minVersion: 128, maxVersion: 135 }],
  devices: ['desktop'],
  operatingSystems: ['windows', 'macos'],
  locales: ['en-US'],
});

function log(msg: string) {
  console.log(`[ReleasesCleaner] ${msg}`);
}

function randomDelay(): number {
  return MIN_FETCH_GAP_MS + Math.floor(Math.random() * (MAX_FETCH_GAP_MS - MIN_FETCH_GAP_MS));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getRealisticHeaders(): Record<string, string> {
  const h = headerGen.getHeaders() as Record<string, string>;
  h['referer'] = 'https://www.transfermarkt.com/';
  if (!h['accept-language']) h['accept-language'] = 'en-US,en;q=0.9';
  return h;
}

/** HTML looks like a real TM player profile (has the data-header section). */
function looksLikeProfile(html: string): boolean {
  if (!html) return false;
  return /data-header/i.test(html) && /<h1/i.test(html);
}

/** Fetch via the shared HTML proxy (primary — bypasses the GH Actions block). */
async function fetchViaProxy(url: string): Promise<string> {
  const proxyUrl = `${TM_HTML_PROXY_URL}?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 202) throw new Error('HTTP 202');
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  return res.text();
}

/** Direct fetch with realistic headers (secondary fallback). */
async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: getRealisticHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if ([202, 403, 429, 503].includes(res.status)) throw new Error(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Fetch a TM profile page as a Cheerio doc. Retries the same URL up to
 * FETCH_URL_ATTEMPTS times (proxy first, direct fallback), with backoff.
 * Only a page that looks like a real profile is accepted.
 */
async function fetchProfile(url: string): Promise<cheerio.Root | null> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= FETCH_URL_ATTEMPTS; attempt++) {
    const gap = randomDelay();
    const since = Date.now() - _lastFetchTime;
    if (since < gap) await sleep(gap - since);
    _lastFetchTime = Date.now();

    for (const fetcher of [fetchViaProxy, fetchDirect]) {
      try {
        const html = await fetcher(url);
        if (looksLikeProfile(html)) return cheerio.load(html);
        lastErr = new Error('response did not look like a profile');
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (attempt < FETCH_URL_ATTEMPTS) {
      await sleep(FETCH_RETRY_BASE_MS * attempt + Math.floor(Math.random() * 1500));
    }
  }
  if (lastErr) log(`  fetch failed for ${url}: ${lastErr.message}`);
  return null;
}

// ── Profile classification ──
type Verdict = 'STILL_FREE' | 'SIGNED' | 'UNKNOWN';

function isWithoutClubText(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return WITHOUT_CLUB_VARIANTS.some((variant) => v.includes(variant));
}

/**
 * Decide whether a player, by their profile, is still effectively without a club.
 *
 * KEEP (STILL_FREE) when ANY of:
 *   - current club (data-header__club) is a "without club" variant, OR
 *   - the header carries a "Joining: Without Club" marker (title) or links to
 *     TM's "without-club" squad page (href contains /without-club/ or
 *     /vereinslos/), i.e. a "To leave → Without Club" player such as a contract
 *     expiring into no next club.
 * HIDE (SIGNED) when: a real current club AND none of the above markers.
 */
function classifyProfile($: cheerio.Root): Verdict {
  // Current club in the header.
  const clubLink = $('span.data-header__club a').first();
  const clubName = (clubLink.attr('title') || clubLink.text() || '').trim();

  // Any "Joining: Without Club" marker anywhere in the header.
  let hasJoiningWithoutClub = false;
  $('span.data-header__club a, div.data-header a, a[title^="Joining"]').each((_i, el) => {
    const title = ($(el).attr('title') || '').toLowerCase();
    const href = ($(el).attr('href') || '').toLowerCase();
    if (title.includes('joining') && title.includes('without club')) hasJoiningWithoutClub = true;
    if (href.includes('/without-club/') || href.includes('/vereinslos/')) hasJoiningWithoutClub = true;
  });

  // "To leave" ribbon text (localized variants) also means leaving — keep if it
  // points at without-club (already captured by the href/title checks above),
  // but we treat a bare "to leave" conservatively as KEEP only when paired with
  // a without-club destination to avoid keeping players leaving FOR another club.

  const currentClubIsFree = isWithoutClubText(clubName);

  if (currentClubIsFree) return 'STILL_FREE';
  if (hasJoiningWithoutClub) return 'STILL_FREE';
  if (clubName) return 'SIGNED';
  return 'UNKNOWN';
}

// ── Firestore helpers ──
async function recordSuccess(dbRef: Firestore, summary: string, durationMs: number): Promise<void> {
  const now = Date.now();
  await dbRef.collection(WORKER_RUNS_COLLECTION).doc(WORKER_STATE_DOC).set(
    {
      workerName: WORKER_STATE_DOC,
      status: 'success',
      lastRunAt: now,
      durationMs,
      summary,
      error: null,
      updatedAt: now,
    },
    { merge: true }
  );
  log(`[WorkerRuns] SUCCESS — ${summary} (${durationMs}ms)`);
}

async function recordFailure(dbRef: Firestore, error: string, durationMs: number): Promise<void> {
  const now = Date.now();
  await dbRef.collection(WORKER_RUNS_COLLECTION).doc(WORKER_STATE_DOC).set(
    {
      workerName: WORKER_STATE_DOC,
      status: 'failed',
      lastRunAt: now,
      durationMs,
      summary: null,
      error,
      updatedAt: now,
    },
    { merge: true }
  );
  log(`[WorkerRuns] FAILED — ${error}`);
}

interface ScreenEvent {
  id: string;
  playerUrl: string;
  playerName: string;
  hidden: boolean;
}

/** Load all NEW_RELEASE_FROM_CLUB events: profile URL + current hidden flag + doc id. */
async function getScreenReleaseEvents(dbRef: Firestore): Promise<ScreenEvent[]> {
  const snap = await dbRef
    .collection(FEED_EVENTS_TABLE)
    .where('type', '==', FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB)
    .get();

  const events: ScreenEvent[] = [];
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const playerUrl = typeof data.playerTmProfile === 'string' ? data.playerTmProfile : '';
    if (!playerUrl) return;
    events.push({
      id: doc.id,
      playerUrl,
      playerName: typeof data.playerName === 'string' ? data.playerName : '',
      hidden: data.hiddenFromReleases === true,
    });
  });
  return events;
}

/** Commit hiddenFromReleases flag changes in batches (merge; never deletes). */
async function applyHiddenFlag(dbRef: Firestore, docIds: string[], hidden: boolean): Promise<void> {
  const feedRef = dbRef.collection(FEED_EVENTS_TABLE);
  for (let i = 0; i < docIds.length; i += 400) {
    const chunk = docIds.slice(i, i + 400);
    const batch = dbRef.batch();
    for (const id of chunk) {
      batch.set(feedRef.doc(id), { hiddenFromReleases: hidden }, { merge: true });
    }
    await batch.commit();
  }
}

// ── Main ──
async function main() {
  const startTime = Date.now();
  log(`Starting releases cleaner (men / FeedEvents, per-profile)${DRY_RUN ? ' — DRY RUN' : ''}`);

  try {
    // 1) Current men's screen population (unique by player URL — one event per player).
    const allEvents = await getScreenReleaseEvents(db);
    const byUrl = new Map<string, ScreenEvent[]>();
    for (const ev of allEvents) {
      if (!byUrl.has(ev.playerUrl)) byUrl.set(ev.playerUrl, []);
      byUrl.get(ev.playerUrl)!.push(ev);
    }
    let playerUrls = Array.from(byUrl.keys());
    log(`Screen release events: ${allEvents.length} (unique players: ${playerUrls.length})`);

    if (playerUrls.length === 0) {
      const durationMs = Date.now() - startTime;
      if (!DRY_RUN) await recordSuccess(db, 'No release events on screen; nothing to clean', durationMs);
      log('No NEW_RELEASE_FROM_CLUB events found — done');
      return;
    }

    if (LIMIT > 0) {
      playerUrls = playerUrls.slice(0, LIMIT);
      log(`--limit active: processing first ${playerUrls.length} players`);
    } else if (playerUrls.length > MAX_PROFILES_PER_RUN) {
      playerUrls = playerUrls.slice(0, MAX_PROFILES_PER_RUN);
      log(`Capped to MAX_PROFILES_PER_RUN=${MAX_PROFILES_PER_RUN} this run`);
    }

    // 2) Classify each player by their profile.
    const toHideDocIds: string[] = [];
    const toUnhideDocIds: string[] = [];
    let signed = 0;
    let stillFree = 0;
    let unknown = 0;
    let processed = 0;

    for (const url of playerUrls) {
      const events = byUrl.get(url)!;
      const anyHidden = events.some((e) => e.hidden);
      const $ = await fetchProfile(url);
      processed++;

      let verdict: Verdict = 'UNKNOWN';
      if ($) verdict = classifyProfile($);

      if (verdict === 'SIGNED') {
        signed++;
        if (!anyHidden) toHideDocIds.push(...events.map((e) => e.id));
      } else if (verdict === 'STILL_FREE') {
        stillFree++;
        // Self-heal: a previously-hidden player who is free again.
        toUnhideDocIds.push(...events.filter((e) => e.hidden).map((e) => e.id));
      } else {
        unknown++;
        // UNKNOWN → leave as-is (fail-safe).
      }

      if (processed % 50 === 0) {
        log(`  progress ${processed}/${playerUrls.length} — signed=${signed}, free=${stillFree}, unknown=${unknown}`);
      }
    }

    const successRate = processed > 0 ? (processed - unknown) / processed : 0;
    log(
      `Classified ${processed}: SIGNED=${signed}, STILL_FREE=${stillFree}, UNKNOWN=${unknown} ` +
        `(success rate ${(successRate * 100).toFixed(1)}%)`
    );
    log(`Newly hiding events: ${toHideDocIds.length} | unhiding (self-heal): ${toUnhideDocIds.length}`);

    // 3) HEALTH GATE — if too many profiles failed to classify, don't write.
    if (successRate < MIN_SUCCESS_RATE) {
      const durationMs = Date.now() - startTime;
      const msg =
        `Degraded run: only ${(successRate * 100).toFixed(1)}% of ${processed} profiles classified ` +
        `(min ${(MIN_SUCCESS_RATE * 100).toFixed(0)}%) — skipping all writes to avoid wrong hides`;
      log(msg);
      if (!DRY_RUN) await recordFailure(db, msg, durationMs);
      return;
    }

    if (DRY_RUN) {
      log('DRY RUN — no writes performed.');
      log(`Would hide ${toHideDocIds.length} event(s); would unhide ${toUnhideDocIds.length} event(s).`);
      const sampleSigned = playerUrls
        .filter((u) => {
          const evs = byUrl.get(u)!;
          return evs.some((e) => toHideDocIds.includes(e.id));
        })
        .slice(0, 15);
      log('Sample players that would be hidden (SIGNED):');
      for (const u of sampleSigned) log(`   - ${byUrl.get(u)![0].playerName || u} (${u})`);
      return;
    }

    // 4) Apply (non-destructive).
    if (toHideDocIds.length) await applyHiddenFlag(db, toHideDocIds, true);
    if (toUnhideDocIds.length) await applyHiddenFlag(db, toUnhideDocIds, false);

    const durationMs = Date.now() - startTime;
    const summary =
      `hidden=${toHideDocIds.length}, unhidden=${toUnhideDocIds.length}, ` +
      `signed=${signed}, stillFree=${stillFree}, unknown=${unknown}, processed=${processed}`;
    await recordSuccess(db, summary, durationMs);
    log(`Complete — ${summary} in ${durationMs}ms`);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const msg = err?.message || String(err);
    log(`FAILED: ${msg}`);
    if (!DRY_RUN) await recordFailure(db, msg, durationMs);
    console.error('[ReleasesCleaner] Fatal error:', err);
    process.exit(1);
  }
}

main();
