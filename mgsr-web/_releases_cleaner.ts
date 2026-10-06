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
const SCRAPING_CACHE_COLLECTION = 'ScrapingCache';
const RELEASES_ALL_CACHE_KEY = 'releases-all';
const WORKER_RUNS_COLLECTION = 'WorkerRuns';
const WORKER_STATE_DOC = 'ReleasesCleanerWorker';
const FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB = 'NEW_RELEASE_FROM_CLUB';

const WITHOUT_CLUB_VARIANTS = [
  'without club', 'ohne verein', 'sans club', 'sin club',
  'senza squadra', 'sem clube', 'geen club', 'bez klubu',
  'klubsuz', 'free agent', 'vereinslos', 'retired', 'career break',
];

// Visibility gate — MUST match the men's screen (release-notifications/page.tsx
// `filteredPlayers`). The screen only shows events with market value in
// [150k, 4M] and age <= 33, so the cleaner only needs to check those players.
const NOTIFICATION_MIN_MARKET_VALUE = 150000;
const NOTIFICATION_MAX_MARKET_VALUE = 4000000;
const NOTIFICATION_MAX_AGE = 33;

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

// ── Visibility gate parsing (mirror the screen's releases.ts helpers) ──
/** Parse a market-value string (e.g. "€1.5m", "€500k") to EUR. Matches the screen. */
function parseMarketValue(value?: string | null): number {
  if (!value || value.includes('-')) return 0;
  const cleaned = String(value).replace(/[€\s]/g, '').toLowerCase();
  if (cleaned.includes('k')) return (parseFloat(cleaned.replace('k', '')) || 0) * 1000;
  if (cleaned.includes('m')) return (parseFloat(cleaned.replace('m', '')) || 0) * 1_000_000;
  return parseFloat(cleaned) || 0;
}

function parsePlayerAge(value?: string | null): number | null {
  if (!value) return null;
  const match = String(value).match(/\d{1,2}/);
  if (!match) return null;
  const age = Number.parseInt(match[0], 10);
  return Number.isNaN(age) ? null : age;
}

/**
 * True when an event is visible on the screen. Mirrors the screen's
 * `filteredPlayers` exactly: it REQUIRES a known market value in [150k, 4M] and
 * a known age ≤ 33 (`value >= MIN && value <= MAX && age !== null && age <= MAX`).
 * A player with no resolvable value/age is NOT shown by the screen, so we treat
 * missing data as not-visible here too. Value/age should be resolved from the
 * event doc first and the `releases-all` cache second (same sources as screen).
 */
function isVisibleOnScreen(marketValue?: string, playerAge?: string): boolean {
  const value = parseMarketValue(marketValue);
  const age = parsePlayerAge(playerAge);
  return (
    value >= NOTIFICATION_MIN_MARKET_VALUE &&
    value <= NOTIFICATION_MAX_MARKET_VALUE &&
    age !== null &&
    age <= NOTIFICATION_MAX_AGE
  );
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

/**
 * Load the `releases-all` chunked ScrapingCache that the screen uses to enrich
 * value/age. Returns a map playerUrl -> { marketValue, playerAge }.
 * Chunk format (see src/lib/scrapingCache.ts): docs `releases-all-chunk-0..N`,
 * each with a `payload` array; chunk-0 also has `totalChunks`.
 */
async function loadReleasesAllCache(
  dbRef: Firestore
): Promise<Map<string, { marketValue?: string; playerAge?: string }>> {
  const map = new Map<string, { marketValue?: string; playerAge?: string }>();
  try {
    const col = dbRef.collection(SCRAPING_CACHE_COLLECTION);
    const first = await col.doc(`${RELEASES_ALL_CACHE_KEY}-chunk-0`).get();
    if (!first.exists) return map;
    const firstData = first.data() || {};
    const totalChunks = Number(firstData.totalChunks) || 1;

    const payloads: any[] = [...((firstData.payload as any[]) || [])];
    if (totalChunks > 1) {
      const snaps = await Promise.all(
        Array.from({ length: totalChunks - 1 }, (_v, i) =>
          col.doc(`${RELEASES_ALL_CACHE_KEY}-chunk-${i + 1}`).get()
        )
      );
      for (const s of snaps) if (s.exists) payloads.push(...(((s.data() || {}).payload as any[]) || []));
    }

    for (const p of payloads) {
      const url = typeof p?.playerUrl === 'string' ? p.playerUrl : '';
      if (!url) continue;
      map.set(url, {
        marketValue: typeof p?.marketValue === 'string' ? p.marketValue : undefined,
        playerAge: typeof p?.playerAge === 'string' ? p.playerAge : undefined,
      });
    }
  } catch (err) {
    log(`Warning: failed to load ${RELEASES_ALL_CACHE_KEY} cache: ${err instanceof Error ? err.message : err}`);
  }
  return map;
}

interface ScreenEvent {
  id: string;
  playerUrl: string;
  playerName: string;
  marketValue: string;
  playerAge: string;
  hidden: boolean;
}

/** Load all NEW_RELEASE_FROM_CLUB events: profile URL + value/age + hidden flag + doc id. */
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
      marketValue: typeof data.marketValue === 'string' ? data.marketValue : '',
      playerAge: typeof data.playerAge === 'string' ? data.playerAge : '',
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
    // 1) Current men's screen population (unique by player URL — one card per player).
    const allEvents = await getScreenReleaseEvents(db);
    const byUrl = new Map<string, ScreenEvent[]>();
    for (const ev of allEvents) {
      if (!byUrl.has(ev.playerUrl)) byUrl.set(ev.playerUrl, []);
      byUrl.get(ev.playerUrl)!.push(ev);
    }

    // The FeedEvent docs often have blank marketValue/playerAge — the screen
    // enriches those from the `releases-all` ScrapingCache. Load that cache and
    // use it as the authoritative value/age source for the visibility gate,
    // exactly like the screen does.
    const metaCache = await loadReleasesAllCache(db);
    log(`Loaded releases-all cache entries: ${metaCache.size}`);

    const valueFor = (ev: ScreenEvent): string =>
      ev.marketValue || metaCache.get(ev.playerUrl)?.marketValue || '';
    const ageFor = (ev: ScreenEvent): string =>
      ev.playerAge || metaCache.get(ev.playerUrl)?.playerAge || '';

    // Diagnostic: where does value/age data come from? (pinpoints empty sources)
    let docHasVA = 0;
    let cacheHasVA = 0;
    let noVA = 0;
    for (const url of Array.from(byUrl.keys())) {
      const ev = byUrl.get(url)![0];
      const docVA = !!(ev.marketValue && ev.playerAge);
      const cacheVA = !!(metaCache.get(url)?.marketValue && metaCache.get(url)?.playerAge);
      if (docVA) docHasVA++;
      else if (cacheVA) cacheHasVA++;
      else noVA++;
    }
    log(`Value/age source — doc: ${docHasVA}, cache: ${cacheHasVA}, neither: ${noVA}`);

    // Only consider players actually VISIBLE on the screen: the screen filters
    // to market value 150k–4M and age ≤ 33 (release-notifications `filteredPlayers`).
    // A player is visible if any of their events passes that gate.
    const allPlayerCount = byUrl.size;
    let playerUrls = Array.from(byUrl.keys()).filter((url) =>
      byUrl.get(url)!.some((e) => isVisibleOnScreen(valueFor(e), ageFor(e)))
    );
    log(
      `Screen release events: ${allEvents.length} | unique players: ${allPlayerCount} | ` +
        `visible (value 150k–4M, age ≤ 33): ${playerUrls.length}`
    );

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
