/**
 * Releases Cleaner — GitHub Actions weekly worker (MEN platform / FeedEvents).
 *
 * PURPOSE
 *   Keeps the men's "Latest Releases" screen (/release-notifications) clean by
 *   hiding players who were released but have since SIGNED A NEW CLUB — so the
 *   screen only shows players who are genuinely still without a club.
 *
 * NON-DESTRUCTIVE
 *   This worker NEVER deletes FeedEvents. It only toggles a boolean field
 *   `hiddenFromReleases` on NEW_RELEASE_FROM_CLUB events:
 *     - sets it to true  when the player is no longer a free agent on TM
 *     - sets it back to false (self-heal) if the player reappears as a free agent
 *   The men's screen filters out events where hiddenFromReleases === true.
 *
 * SCOPE
 *   Men platform only — operates exclusively on the `FeedEvents` collection.
 *   Does NOT touch FeedEventsWomen / FeedEventsYouth, and does NOT touch the
 *   releases refresh workers (workers-job/releasesRefresh.js, _releases_refresh.ts).
 *
 * ANTI-BLOCK
 *   Reuses the exact TM scraping stack proven by _releases_refresh.ts and the
 *   weekly returnees/finishers GitHub Actions jobs: header-generator realistic
 *   headers, randomized gaps, and a circuit breaker. Only scrapes LIST pages
 *   (not per-player profiles) once a week — low, safe volume.
 *
 * SAFETY GUARDS (so a flaky TM scrape never wrongly hides a still-free player)
 *   1. Health gate  — aborts (changes nothing) if the scrape looks degraded.
 *   2. Grace period — a player must be absent from the free-agent list for
 *                     RELEASE_MISS_THRESHOLD consecutive healthy runs before
 *                     being hidden (miss counters live in WorkerState).
 *   Because hiding is reversible, any rare mistake auto-corrects next run.
 *
 * STATE
 *   WorkerState/ReleasesCleanerWorker  — releaseMissCounts + lastRunSuccess
 *   WorkerRuns/ReleasesCleanerWorker   — status/summary for observability
 *   (Separate docs from the refresh worker — zero interference.)
 *
 * USAGE
 *   Dry run (prints what it WOULD hide/unhide, writes nothing):
 *     cd mgsr-web && npx tsx _releases_cleaner.ts --dry-run
 *   Apply:
 *     cd mgsr-web && npx tsx _releases_cleaner.ts
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

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('[ReleasesCleaner] Missing Firebase credentials (set env vars or .env.local)');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

// ── Constants (match the refresh worker exactly) ──
const TRANSFERMARKT_BASE_URL = 'https://www.transfermarkt.com';
const FEED_EVENTS_TABLE = 'FeedEvents'; // MEN platform collection
const WORKER_STATE_COLLECTION = 'WorkerState';
const WORKER_RUNS_COLLECTION = 'WorkerRuns';
const WORKER_STATE_DOC = 'ReleasesCleanerWorker';
const FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB = 'NEW_RELEASE_FROM_CLUB';

const RELEASE_RANGES: [number, number][] = [
  [150000, 250000],
  [250001, 400000],
  [400001, 600000],
  [600001, 800000],
  [800001, 1000000],
  [1000001, 1200000],
  [1200001, 1400000],
  [1400001, 1600000],
  [1600001, 1800000],
  [1800001, 2000000],
  [2000001, 2200000],
  [2200001, 2500000],
  [2500001, 3000000],
  [3000001, 3500000],
  [3500001, 4000000],
];

const DELAY_BETWEEN_RANGES_MS = 6000;
const RANGE_RETRY_ATTEMPTS = 3;
const RANGE_RETRY_DELAY_MS = 4000;

// ── Safety-guard tunables (env-overridable) ──
// A player must be absent from the free-agent list for this many consecutive
// healthy runs before being hidden. Weekly cadence => default 1 is already a
// stable observation window; set to 2 for extra caution.
const RELEASE_MISS_THRESHOLD = Number(process.env.RELEASE_MISS_THRESHOLD || 1);
// Minimum free agents a healthy scrape must yield. Below this we assume the
// scrape is degraded and refuse to hide anyone (fail-safe = keep showing).
const RELEASE_HEALTHY_FLOOR = Number(process.env.RELEASE_HEALTHY_FLOOR || 100);

// ── TM fetching strategy ──
// Plain https.get / fetch from GitHub Actions IPs gets challenged by TM
// (HTTP 202 bot wall), so we fetch through the shared HTML proxy that the
// Cloud Run workers rely on (browser-grade egress that bypasses the block).
// A direct fetch with realistic headers is kept as a secondary fallback.
const TM_HTML_PROXY_URL =
  process.env.TM_HTML_PROXY_URL ||
  'https://management.britsportgroup.com/api/transfermarkt/html-proxy';

const headerGen = new HeaderGenerator({
  browsers: [{ name: 'chrome', minVersion: 128, maxVersion: 135 }],
  devices: ['desktop'],
  operatingSystems: ['windows', 'macos'],
  locales: ['en-US'],
});

// ── Circuit breaker ──
let _consecutiveBlocks = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN = 5 * 60 * 1000;
let _lastFetchTime = 0;
const MIN_FETCH_GAP_MS = 1500;
const MAX_FETCH_GAP_MS = 4000;
const FETCH_TIMEOUT_MS = 30000;

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

/** HTML looks like a real TM transfer/free-agent list page (not a bot wall). */
function looksLikeTransferList(html: string): boolean {
  if (!html) return false;
  return /class=["'][^"']*\bitems\b/i.test(html) && /tr\s+class=["'](odd|even)/i.test(html);
}

function registerBlock(): void {
  _consecutiveBlocks++;
  if (_consecutiveBlocks >= CIRCUIT_THRESHOLD) {
    _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN;
    console.warn(`[TM] Circuit breaker TRIPPED after ${_consecutiveBlocks} blocks. Cooling down 5 min.`);
  }
}

/** Fetch via the shared HTML proxy (primary — bypasses the GH Actions block). */
async function fetchViaProxy(url: string): Promise<string> {
  const proxyUrl = `${TM_HTML_PROXY_URL}?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
  return res.text();
}

/** Direct fetch with realistic headers (secondary fallback). */
async function fetchDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: getRealisticHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // 202 = TM bot challenge; 403/429/503 = rate/forbidden — all treated as blocks.
  if ([202, 403, 429, 503].includes(res.status)) throw new Error(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchDocument(url: string): Promise<cheerio.Root> {
  if (_circuitOpenUntil > Date.now()) {
    throw new Error('TM circuit breaker open — cooling down');
  }
  // Rate limiter: randomized gap between requests.
  const now = Date.now();
  const gap = randomDelay();
  const wait = gap - (now - _lastFetchTime);
  if (wait > 0) await sleep(wait);
  _lastFetchTime = Date.now();

  let html = '';
  let lastErr: Error | null = null;

  // 1) Primary: HTML proxy.
  try {
    const proxyHtml = await fetchViaProxy(url);
    if (looksLikeTransferList(proxyHtml)) {
      _consecutiveBlocks = 0;
      return cheerio.load(proxyHtml);
    }
    html = proxyHtml; // keep as last resort if direct also fails
  } catch (err) {
    lastErr = err instanceof Error ? err : new Error(String(err));
  }

  // 2) Fallback: direct fetch with realistic headers.
  try {
    const directHtml = await fetchDirect(url);
    if (looksLikeTransferList(directHtml)) {
      _consecutiveBlocks = 0;
      return cheerio.load(directHtml);
    }
    if (!html) html = directHtml;
  } catch (err) {
    lastErr = err instanceof Error ? err : new Error(String(err));
    // A block from the direct path still counts toward the circuit breaker.
    if (/HTTP (202|403|429|503)/.test(lastErr.message)) registerBlock();
  }

  // Neither source produced a real list page.
  if (!looksLikeTransferList(html)) {
    registerBlock();
    throw lastErr || new Error('TM returned no usable list HTML (possible block)');
  }
  _consecutiveBlocks = 0;
  return cheerio.load(html);
}

// ── TM list parsing (free-agent detection) — mirrors _releases_refresh.ts ──
const WITHOUT_CLUB_VARIANTS = [
  'without club', 'ohne verein', 'sans club', 'sin club',
  'senza squadra', 'sem clube', 'geen club', 'bez klubu',
  'klubsuz', 'free agent',
];

function isWithoutClub($: cheerio.Root, row: cheerio.Cheerio): boolean {
  const tables = row.find('table.inline-table');
  if (tables.length < 3) return false;
  const newClubCell = tables.eq(2);
  const imgAlt = newClubCell.find('img').attr('alt')?.trim().toLowerCase() || '';
  const cellText = newClubCell.text().trim().toLowerCase();
  return WITHOUT_CLUB_VARIANTS.some((v) => imgAlt.includes(v) || cellText.includes(v));
}

/** Extract player profile URLs from a "newest transfers → without club" page. */
function parseWithoutClubUrls($: cheerio.Root): string[] {
  const rows = $('table.items')
    .find('tr.odd, tr.even')
    .filter((_i, el) => isWithoutClub($, $(el)))
    .get();

  return rows
    .map((el) => {
      const firstTable = $(el).find('td').find('table.inline-table').eq(0);
      const href = firstTable.find('a').attr('href') || '';
      return href ? `${TRANSFERMARKT_BASE_URL}${href}` : '';
    })
    .filter(Boolean);
}

/** Extract player profile URLs from the dedicated free-agents list page. */
function parseFreeAgentUrls($: cheerio.Root): string[] {
  const rows = $('table.items').find('tr.odd, tr.even').get();
  return rows
    .map((el) => {
      const firstTable = $(el).find('td').find('table.inline-table').eq(0);
      const href = firstTable.find('a').attr('href') || '';
      return href ? `${TRANSFERMARKT_BASE_URL}${href}` : '';
    })
    .filter(Boolean);
}

function getTotalPages($: cheerio.Root): number {
  const paginationSelectors = [
    'div.pager li.tm-pagination__list-item',
    'li.tm-pagination__list-item',
    'ul.tm-pagination li',
    'div.pager li',
  ];
  for (const sel of paginationSelectors) {
    const nums = $(sel)
      .map((_i, el) => parseInt($(el).text().trim(), 10))
      .get()
      .filter((n: number) => !isNaN(n));
    const max = Math.max(0, ...nums);
    if (max >= 1) return max;
  }
  const pageLinks = $("a[href*='page=']");
  let maxPage = 1;
  pageLinks.each((_i, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/page=(\d+)/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > maxPage) maxPage = p;
    }
  });
  return Math.max(1, maxPage);
}

function buildReleasesUrl(minValue: number, maxValue: number, page = 1): string {
  return `${TRANSFERMARKT_BASE_URL}/transfers/neuestetransfers/statistik?land_id=0&wettbewerb_id=alle&minMarktwert=${minValue}&maxMarktwert=${maxValue}&plus=1&page=${page}`;
}

function buildFreeAgentsUrl(minValue: number, maxValue: number, page = 1): string {
  return `${TRANSFERMARKT_BASE_URL}/transfers/vertragslosespieler/statistik?ausrichtung=&spielerposition_id=0&land_id=&wettbewerb_id=alle&seit=0&altersklasse=&minMarktwert=${minValue}&maxMarktwert=${maxValue}&plus=1&page=${page}`;
}

/** All still-free-agent profile URLs in a value range (both TM sources). */
async function getFreeAgentUrlsForRange(minValue: number, maxValue: number): Promise<string[]> {
  const urls: string[] = [];

  // Source 1: newest transfers where destination is "Without Club".
  const firstUrl = buildReleasesUrl(minValue, maxValue, 1);
  const $first = await fetchDocument(firstUrl);
  const releasePages = getTotalPages($first);
  urls.push(...parseWithoutClubUrls($first));
  for (let page = 2; page <= releasePages; page++) {
    const $p = await fetchDocument(buildReleasesUrl(minValue, maxValue, page));
    urls.push(...parseWithoutClubUrls($p));
  }

  // Source 2: dedicated free-agents (vertragslosespieler) list.
  const firstFreeUrl = buildFreeAgentsUrl(minValue, maxValue, 1);
  const $free = await fetchDocument(firstFreeUrl);
  const freePages = getTotalPages($free);
  urls.push(...parseFreeAgentUrls($free));
  for (let page = 2; page <= freePages; page++) {
    const $p = await fetchDocument(buildFreeAgentsUrl(minValue, maxValue, page));
    urls.push(...parseFreeAgentUrls($p));
  }

  return urls;
}

// ── Firestore state helpers (dedicated ReleasesCleaner docs) ──
async function getMissCounts(dbRef: Firestore): Promise<Record<string, number>> {
  const snap = await dbRef.collection(WORKER_STATE_COLLECTION).doc(WORKER_STATE_DOC).get();
  const data = snap.exists ? snap.data() : {};
  const counts = data?.releaseMissCounts;
  return counts && typeof counts === 'object' ? (counts as Record<string, number>) : {};
}

async function saveMissCounts(dbRef: Firestore, counts: Record<string, number>): Promise<void> {
  await dbRef.collection(WORKER_STATE_COLLECTION).doc(WORKER_STATE_DOC).set(
    {
      releaseMissCounts: counts,
      lastRunSuccess: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

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

/** Load all NEW_RELEASE_FROM_CLUB events: profile URL + current hidden flag + doc id. */
async function getScreenReleaseEvents(
  dbRef: Firestore
): Promise<Array<{ id: string; playerUrl: string; hidden: boolean }>> {
  const snap = await dbRef
    .collection(FEED_EVENTS_TABLE)
    .where('type', '==', FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB)
    .get();

  const events: Array<{ id: string; playerUrl: string; hidden: boolean }> = [];
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const playerUrl = typeof data.playerTmProfile === 'string' ? data.playerTmProfile : '';
    if (!playerUrl) return;
    events.push({ id: doc.id, playerUrl, hidden: data.hiddenFromReleases === true });
  });
  return events;
}

/** Commit hiddenFromReleases flag changes in batches (merge; never deletes). */
async function applyHiddenFlag(
  dbRef: Firestore,
  docIds: string[],
  hidden: boolean
): Promise<void> {
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
  log(`Starting releases cleaner (men / FeedEvents)${DRY_RUN ? ' — DRY RUN' : ''}`);

  try {
    // 1) Current men's screen population.
    const screenEvents = await getScreenReleaseEvents(db);
    const screenUrls = new Set(screenEvents.map((e) => e.playerUrl));
    log(`Screen release events: ${screenEvents.length} (unique players: ${screenUrls.size})`);

    if (screenEvents.length === 0) {
      const durationMs = Date.now() - startTime;
      if (!DRY_RUN) await recordSuccess(db, 'No release events on screen; nothing to clean', durationMs);
      log('No NEW_RELEASE_FROM_CLUB events found — done');
      return;
    }

    // 2) Who is still a free agent on TM today.
    const freeAgentUrls = new Set<string>();
    let rangesFailed = 0;

    for (let i = 0; i < RELEASE_RANGES.length; i++) {
      const [minVal, maxVal] = RELEASE_RANGES[i];
      log(`Fetching range ${i + 1}/${RELEASE_RANGES.length}: ${minVal}-${maxVal}`);
      let success = false;
      for (let attempt = 1; attempt <= RANGE_RETRY_ATTEMPTS; attempt++) {
        try {
          const urls = await getFreeAgentUrlsForRange(minVal, maxVal);
          urls.forEach((u) => freeAgentUrls.add(u));
          log(`  ✅ ${urls.length} free-agent URLs`);
          success = true;
          break;
        } catch (err: any) {
          log(`  ❌ Attempt ${attempt}/${RANGE_RETRY_ATTEMPTS} failed: ${err.message}`);
          if (attempt < RANGE_RETRY_ATTEMPTS) await sleep(RANGE_RETRY_DELAY_MS);
        }
      }
      if (!success) rangesFailed++;
      if (i < RELEASE_RANGES.length - 1) await sleep(DELAY_BETWEEN_RANGES_MS);
    }

    log(`Live free agents collected: ${freeAgentUrls.size}, ranges failed: ${rangesFailed}`);

    // 3) HEALTH GATE — refuse to hide anything on a degraded scrape.
    const scrapeHealthy = rangesFailed === 0 && freeAgentUrls.size >= RELEASE_HEALTHY_FLOOR;
    if (!scrapeHealthy) {
      const durationMs = Date.now() - startTime;
      const msg =
        `Degraded scrape (rangesFailed=${rangesFailed}, freeAgents=${freeAgentUrls.size} < floor ${RELEASE_HEALTHY_FLOOR}) ` +
        '— skipping all hide/unhide to avoid wrongly hiding free agents';
      log(msg);
      if (!DRY_RUN) await recordFailure(db, msg, durationMs);
      // Do NOT exit non-zero: a skipped-for-safety run is not a crash.
      return;
    }

    // 4) GRACE PERIOD — update per-player miss counters.
    const missCounts = await getMissCounts(db);
    const nextMissCounts: Record<string, number> = {};

    for (const url of Array.from(screenUrls)) {
      if (freeAgentUrls.has(url)) {
        nextMissCounts[url] = 0; // still a free agent → reset
      } else {
        nextMissCounts[url] = (missCounts[url] || 0) + 1; // absent → increment
      }
    }

    // 5) Decide hide / unhide (non-destructive).
    const toHideDocIds: string[] = [];
    const toUnhideDocIds: string[] = [];
    let hideCandidates = 0;

    for (const event of screenEvents) {
      const stillFree = freeAgentUrls.has(event.playerUrl);
      const misses = nextMissCounts[event.playerUrl] || 0;
      const shouldHide = !stillFree && misses >= RELEASE_MISS_THRESHOLD;

      if (shouldHide) hideCandidates++;

      if (shouldHide && !event.hidden) {
        toHideDocIds.push(event.id);
      } else if (stillFree && event.hidden) {
        // Self-heal: player is back on the free-agent list → make visible again.
        toUnhideDocIds.push(event.id);
      }
    }

    log(
      `Hide candidates (absent >= ${RELEASE_MISS_THRESHOLD} run(s)): ${hideCandidates} | ` +
        `newly hiding: ${toHideDocIds.length} | unhiding (self-heal): ${toUnhideDocIds.length}`
    );

    if (DRY_RUN) {
      log('DRY RUN — no writes performed.');
      log(`Would hide ${toHideDocIds.length} event(s); would unhide ${toUnhideDocIds.length} event(s).`);
      log('Sample hide doc ids: ' + toHideDocIds.slice(0, 20).join(', '));
      return;
    }

    // 6) Apply.
    if (toHideDocIds.length) await applyHiddenFlag(db, toHideDocIds, true);
    if (toUnhideDocIds.length) await applyHiddenFlag(db, toUnhideDocIds, false);
    await saveMissCounts(db, nextMissCounts);

    const durationMs = Date.now() - startTime;
    const summary =
      `hidden=${toHideDocIds.length}, unhidden=${toUnhideDocIds.length}, ` +
      `screen=${screenEvents.length}, freeAgents=${freeAgentUrls.size}`;
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
