/**
 * Releases Refresh — GitHub Actions version.
 * Replaces the Cloud Function releasesRefreshWorker which gets TM HTTP 405 blocks.
 * GitHub Actions IPs are not blocked by Transfermarkt.
 *
 * Runs daily at 03:00 Israel time via GH Actions scheduler.
 * Fetches releases from Transfermarkt, detects new free agents, writes FeedEvents.
 *
 * Local:  cd mgsr-web && npx tsx _releases_refresh.ts
 * GH Actions: env vars FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as https from 'https';
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

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials (set env vars or .env.local)');
  process.exit(1);
}

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

// ── Constants (match Cloud Function version exactly) ──
const TRANSFERMARKT_BASE_URL = 'https://www.transfermarkt.com';
const PLAYERS_TABLE = 'Players';
const FEED_EVENTS_TABLE = 'FeedEvents';
const WORKER_STATE_COLLECTION = 'WorkerState';
const WORKER_RUNS_COLLECTION = 'WorkerRuns';
const FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB = 'NEW_RELEASE_FROM_CLUB';

const RELEASE_RANGES: [number, number][] = [
  [125000, 250000],
  [250001, 400000],
  [400001, 600000],
  [600001, 800000],
  [800001, 1000000],
  [1000001, 1200000],
  [1200001, 1400000],
  [1400001, 1600000],
  [1600001, 1800000],
  [1800000, 2000000],
  [2000000, 2200000],
];

const DELAY_BETWEEN_RANGES_MS = 6000;

// ── Header Generator (same as Cloud Function) ──
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

function randomDelay(): number {
  return MIN_FETCH_GAP_MS + Math.floor(Math.random() * (MAX_FETCH_GAP_MS - MIN_FETCH_GAP_MS));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getRealisticHeaders(): Record<string, string> {
  const h = headerGen.getHeaders();
  h['referer'] = 'https://www.transfermarkt.com/';
  if (!h['accept-language']) h['accept-language'] = 'en-US,en;q=0.9';
  return h;
}

function makeAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${TRANSFERMARKT_BASE_URL}${url}`;
  if (url.startsWith('http')) return url;
  return url;
}

// ── Java hashCode (must match Kotlin) ──
function javaHashCode(str: string): number {
  if (str == null || str === undefined) str = '';
  str = String(str);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash | 0;
  }
  return hash >>> 0;
}

function feedEventDocIdForRelease(playerTmProfile: string): string {
  const profileHash = javaHashCode(playerTmProfile || '');
  return `NEW_RELEASE_FROM_CLUB_${profileHash}`;
}

// ── TM HTML fetching ──
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (_circuitOpenUntil > Date.now()) {
      reject(new Error('TM circuit breaker open — cooling down'));
      return;
    }
    const headers = getRealisticHeaders();
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode === 429 || res.statusCode === 403 || res.statusCode === 503 || res.statusCode === 405) {
        _consecutiveBlocks++;
        if (_consecutiveBlocks >= CIRCUIT_THRESHOLD) {
          _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN;
          console.warn(`[TM] Circuit breaker TRIPPED after ${_consecutiveBlocks} blocks. Cooling down 5 min.`);
        }
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      _consecutiveBlocks = 0;
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function fetchHtmlWithFallback(url: string): Promise<string> {
  const now = Date.now();
  const gap = randomDelay();
  const wait = gap - (now - _lastFetchTime);
  if (wait > 0) await sleep(wait);
  _lastFetchTime = Date.now();
  return fetchHtml(url);
}

async function fetchDocument(url: string): Promise<cheerio.Root> {
  const html = await fetchHtmlWithFallback(url);
  return cheerio.load(html);
}

// ── TM parsing ──
const WITHOUT_CLUB_VARIANTS = [
  'without club', 'ohne verein', 'sans club', 'sin club',
  'senza squadra', 'sem clube', 'geen club', 'bez klubu',
  'klubsuz', 'free agent',
];

function convertLongPositionToShort(pos: string): string {
  const map: Record<string, string> = {
    Goalkeeper: 'GK', 'Left Back': 'LB', 'Centre Back': 'CB', 'Right Back': 'RB',
    'Defensive Midfield': 'DM', 'Central Midfield': 'CM', 'Attacking Midfield': 'AM',
    'Right Winger': 'RW', 'Left Winger': 'LW', 'Centre Forward': 'CF',
    'Second Striker': 'SS', 'Left Midfield': 'LM', 'Right Midfield': 'RM',
  };
  return map[pos] || pos || '';
}

interface ReleaseModel {
  playerImage: string;
  playerName: string;
  playerUrl: string;
  playerPosition: string;
  playerAge: string;
  playerNationality: string | null;
  playerNationalities?: string[];
  playerNationalityFlag: string | null;
  playerFoot: string | null;
  clubJoinedLogo: string | null;
  clubJoinedName: string | null;
  transferDate: string;
  marketValue: string;
}

function isWithoutClub($: cheerio.Root, row: cheerio.Cheerio): boolean {
  const tables = row.find('table.inline-table');
  if (tables.length < 3) return false;
  const newClubCell = tables.eq(2);
  const imgAlt = newClubCell.find('img').attr('alt')?.trim().toLowerCase() || '';
  const cellText = newClubCell.text().trim().toLowerCase();
  return WITHOUT_CLUB_VARIANTS.some((v) => imgAlt.includes(v) || cellText.includes(v));
}

function extractNationalityAndFlag($: cheerio.Root, row: cheerio.Cheerio): [string | null, string | null] {
  let img = row.find('td.zentriert img[title]').first();
  if (!img.length) {
    const imgs = row.find('img[alt]');
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs.eq(i);
      const alt = el.attr('alt') || '';
      if (alt.length >= 2 && alt.length <= 50) {
        img = el;
        break;
      }
    }
  }
  if (!img.length) return [null, null];
  const nationality = (img.attr('title') || img.attr('alt') || '').trim() || null;
  let flagSrc = img.attr('data-src') || img.attr('src') || null;
  if (flagSrc) {
    flagSrc = makeAbsoluteUrl(flagSrc).replace('verysmall', 'head').replace('tiny', 'head');
  }
  return [nationality, flagSrc];
}

function parseTransferList($: cheerio.Root): ReleaseModel[] {
  const rows = $('table.items')
    .find('tr.odd, tr.even')
    .filter((_i, el) => isWithoutClub($, $(el)))
    .get();

  return rows.map((el) => {
    try {
      const row = $(el);
      const td = row.find('td');
      const tables = td.find('table.inline-table');
      const firstTable = tables.eq(0);
      const playerImage = firstTable.find('img').attr('data-src')?.replace('medium', 'big') || '';
      const playerName = firstTable.find('img').attr('title') || '';
      const href = firstTable.find('a').attr('href') || '';
      const playerUrl = `https://www.transfermarkt.com${href}`;
      const positionText = firstTable.find('tr').eq(1).text().replace(/-/g, ' ');
      const playerPosition = convertLongPositionToShort(positionText.trim());
      const zentriert = row.find('td.zentriert');
      const playerAge = zentriert.eq(0).text().trim();
      const transferDate = zentriert.eq(2).text().trim();
      const marketValue = row.find('td.rechts').eq(0).text().trim();
      const [playerNationality, playerNationalityFlag] = extractNationalityAndFlag($, row);

      return {
        playerImage, playerName, playerUrl, playerPosition,
        playerAge, playerNationality, playerNationalityFlag,
        playerFoot: null, clubJoinedLogo: null, clubJoinedName: null,
        transferDate, marketValue,
      };
    } catch {
      return null;
    }
  }).filter(Boolean) as ReleaseModel[];
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

async function enrichFromProfile(model: ReleaseModel): Promise<ReleaseModel | null> {
  try {
    const $ = await fetchDocument(model.playerUrl);
    const clubSelectors = [
      'span.data-header__club a',
      'span.data-header__club',
      "div.data-header a[href*='/startseite/verein/']",
      "div.info-table__content--bold a[href*='/startseite/verein/']",
    ];
    let clubName = '';
    for (const sel of clubSelectors) {
      const elements = $(sel);
      for (let i = 0; i < elements.length; i++) {
        const el = elements.eq(i);
        const text = (el.attr('title')?.trim() || el.text().trim()).toLowerCase();
        if (text && text.length < 80 && !text.includes('transfermarkt')) {
          clubName = text;
          break;
        }
      }
      if (clubName) break;
    }
    if (!clubName) {
      $('dt, span.info-table__content--bold, td').each((_i, el) => {
        const label = $(el).text().trim().toLowerCase();
        if (label.includes('current club') || label === 'verein' || label.includes('aktueller verein')) {
          const link = $(el).next().find("a[href*='verein/']").first()[0] ||
                       $(el).parent().find("a[href*='verein/']").first()[0];
          if (link) {
            const l = $(link as any);
            clubName = (l.attr('title')?.trim() || l.text().trim()).toLowerCase();
          }
        }
      });
    }
    if (clubName && !WITHOUT_CLUB_VARIANTS.some((v) => clubName.includes(v))) {
      return null;
    }

    const marketValue = model.marketValue?.trim() ||
      $('div.data-header__box--small').text().split('Last')[0].trim() || undefined;

    const citizenshipLabel = $('span.info-table__content--regular').filter(function(this: any) {
      return $(this).text().trim().startsWith('Citizenship');
    });
    const citizenshipContent = citizenshipLabel.next('.info-table__content--bold');
    let nationalityEls = citizenshipContent.find('img');
    if (!nationalityEls.length) nationalityEls = $('[itemprop=nationality] img');
    const allNationalities: string[] = [];
    const allFlags: string[] = [];
    nationalityEls.each((_: number, el: any) => {
      const title = $(el).attr('title');
      if (title) allNationalities.push(title.trim());
      const src = $(el).attr('src');
      if (src) allFlags.push(src.replace('tiny', 'head').replace('verysmall', 'head'));
    });

    const nationality = model.playerNationality?.trim() || allNationalities[0] || null;
    const flagSrc = model.playerNationalityFlag?.trim() || allFlags[0];
    const playerNationalityFlag = flagSrc ? makeAbsoluteUrl(flagSrc) : null;

    return {
      ...model,
      marketValue: marketValue || model.marketValue,
      playerNationality: nationality || model.playerNationality,
      playerNationalities: allNationalities.length ? allNationalities : (model.playerNationalities || []),
      playerNationalityFlag: playerNationalityFlag || model.playerNationalityFlag,
    };
  } catch {
    return model;
  }
}

async function getLatestReleasesForRange(minValue: number, maxValue: number): Promise<ReleaseModel[]> {
  const url = buildReleasesUrl(minValue, maxValue, 1);
  const $ = await fetchDocument(url);
  const pageCount = getTotalPages($);
  const all: ReleaseModel[] = [];

  // ── Diagnostic: log what TM actually returned ──
  const totalRows = $('table.items').find('tr.odd, tr.even').length;
  const hasItems = $('table.items').length;
  const titleTag = $('title').text().trim().slice(0, 80);
  console.log(`[ReleasesRefresh]   DEBUG: title="${titleTag}" tables=${hasItems} totalRows=${totalRows} pages=${pageCount}`);

  const parsePage = async (page: number) => {
    const u = page === 1 ? url : buildReleasesUrl(minValue, maxValue, page);
    const $p = page === 1 ? $ : await fetchDocument(u);
    return parseTransferList($p);
  };

  const firstPage = await parsePage(1);
  for (const model of firstPage) {
    if (model.playerUrl) {
      const enriched = await enrichFromProfile(model);
      if (enriched) all.push(enriched);
    } else {
      all.push(model);
    }
  }

  for (let page = 2; page <= pageCount; page++) {
    const items = await parsePage(page);
    for (const model of items) {
      if (model.playerUrl) {
        const enriched = await enrichFromProfile(model);
        if (enriched) all.push(enriched);
      } else {
        all.push(model);
      }
    }
  }

  return all;
}

// ── Firestore helpers (match Cloud Function WorkerState/WorkerRuns) ──
async function getKnownReleaseUrls(db: Firestore): Promise<Set<string>> {
  const doc = await db.collection(WORKER_STATE_COLLECTION).doc('ReleasesRefreshWorker').get();
  const data = doc.exists ? doc.data() : {};
  const urls = data?.knownReleaseUrls || [];
  return new Set(Array.isArray(urls) ? urls : []);
}

async function saveKnownReleaseUrls(db: Firestore, urls: Set<string>): Promise<void> {
  await db.collection(WORKER_STATE_COLLECTION).doc('ReleasesRefreshWorker').set({
    knownReleaseUrls: Array.from(urls),
    lastRefreshSuccess: Date.now(),
    updatedAt: Date.now(),
  }, { merge: true });
}

async function recordSuccess(db: Firestore, summary: string, durationMs: number): Promise<void> {
  const now = Date.now();
  await db.collection(WORKER_RUNS_COLLECTION).doc('ReleasesRefreshWorker').set({
    workerName: 'ReleasesRefreshWorker',
    status: 'success',
    lastRunAt: now,
    durationMs,
    summary,
    error: null,
    updatedAt: now,
  }, { merge: true });
}

async function recordFailure(db: Firestore, error: string, durationMs: number): Promise<void> {
  const now = Date.now();
  await db.collection(WORKER_RUNS_COLLECTION).doc('ReleasesRefreshWorker').set({
    workerName: 'ReleasesRefreshWorker',
    status: 'failed',
    lastRunAt: now,
    durationMs,
    summary: null,
    error,
    updatedAt: now,
  }, { merge: true });
}

// ── Main ──
async function main() {
  const startTime = Date.now();
  const log = (msg: string) => console.log(`[ReleasesRefresh] ${msg}`);

  try {
    log('Starting releases refresh (GitHub Actions)');

    const knownUrls = await getKnownReleaseUrls(db);
    log(`Previously known releases: ${knownUrls.size}`);

    const allReleases: ReleaseModel[] = [];
    let rangesFailed = 0;

    for (let i = 0; i < RELEASE_RANGES.length; i++) {
      const [minVal, maxVal] = RELEASE_RANGES[i];
      log(`Fetching range ${i + 1}/${RELEASE_RANGES.length}: ${minVal}-${maxVal}`);
      try {
        const releases = await getLatestReleasesForRange(minVal, maxVal);
        allReleases.push(...releases);
        log(`  ✅ ${releases.length} releases`);
      } catch (err: any) {
        rangesFailed++;
        log(`  ❌ Failed: ${err.message}`);
      }
      if (i < RELEASE_RANGES.length - 1) {
        await sleep(DELAY_BETWEEN_RANGES_MS);
      }
    }

    if (rangesFailed === RELEASE_RANGES.length) {
      const durationMs = Date.now() - startTime;
      const errMsg = `All ${RELEASE_RANGES.length} ranges failed — TM may be blocking`;
      log(errMsg);
      await recordFailure(db, errMsg, durationMs);
      process.exit(1);
    }

    // Deduplicate
    const distinctByUrl = new Map<string, ReleaseModel>();
    allReleases.forEach((r) => {
      if (r.playerUrl) distinctByUrl.set(r.playerUrl, r);
    });
    const distinctReleases = Array.from(distinctByUrl.values());
    const currentUrls = new Set(distinctReleases.map((r) => r.playerUrl).filter(Boolean));
    const newReleases = distinctReleases.filter((r) => !knownUrls.has(r.playerUrl || ''));

    log(`Total releases: ${distinctReleases.length}, new: ${newReleases.length}`);

    // Bootstrap: first run has empty knownUrls — avoid 100+ duplicate events
    const isBootstrap = knownUrls.size === 0 && distinctReleases.length > 50;
    if (isBootstrap) {
      log('Bootstrap mode: saving known URLs without creating events (first run)');
      await saveKnownReleaseUrls(db, currentUrls);
      const durationMs = Date.now() - startTime;
      await recordSuccess(db, `Bootstrap: ${currentUrls.size} URLs saved, no events created`, durationMs);
      log(`Done in ${durationMs}ms`);
      return;
    }

    // Check which releases already have FeedEvents
    const newReleaseUrls = newReleases.map((r) => r.playerUrl).filter(Boolean);
    const alreadyHaveEvents = new Set<string>();
    const feedRef = db.collection(FEED_EVENTS_TABLE);

    for (let i = 0; i < newReleaseUrls.length; i += 30) {
      const chunk = newReleaseUrls.slice(i, i + 30);
      const snapshot = await feedRef
        .where('type', '==', FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB)
        .where('playerTmProfile', 'in', chunk)
        .get();
      snapshot.docs.forEach((d) => {
        const tm = d.get('playerTmProfile');
        if (tm) alreadyHaveEvents.add(tm);
      });
    }

    const releasesToCreate = newReleases.filter((r) => !alreadyHaveEvents.has(r.playerUrl || ''));
    log(`Already in feed: ${alreadyHaveEvents.size}, creating events for: ${releasesToCreate.length}`);

    // Batch player lookups
    const playersRef = db.collection(PLAYERS_TABLE);
    const playersInDb = new Set<string>();
    const urlsToCheck = releasesToCreate.map((r) => r.playerUrl).filter(Boolean);
    for (let i = 0; i < urlsToCheck.length; i += 30) {
      const chunk = urlsToCheck.slice(i, i + 30);
      const snapshot = await playersRef.where('tmProfile', 'in', chunk).get();
      snapshot.docs.forEach((d) => {
        const tm = d.data()?.tmProfile;
        if (tm) playersInDb.add(tm);
      });
    }

    // Write FeedEvents
    const now = Date.now();
    for (const release of releasesToCreate) {
      const playerUrl = release.playerUrl;
      if (!playerUrl) continue;

      const isInDatabase = playersInDb.has(playerUrl);
      const docId = feedEventDocIdForRelease(playerUrl);

      try {
        await feedRef.doc(docId).set({
          type: FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB,
          playerName: release.playerName || 'Unknown',
          playerImage: release.playerImage || null,
          playerTmProfile: playerUrl,
          oldValue: null,
          newValue: 'Without club',
          extraInfo: isInDatabase ? 'IN_DATABASE' : 'NOT_IN_DATABASE',
          timestamp: now,
        });
        log(`New release: ${release.playerName} (in DB: ${isInDatabase})`);
      } catch (err: any) {
        log(`Failed to write feed event for ${release.playerName}: ${err.message}`);
      }
    }

    await saveKnownReleaseUrls(db, currentUrls);

    const durationMs = Date.now() - startTime;
    await recordSuccess(db, `${releasesToCreate.length} new events, ${currentUrls.size} total known`, durationMs);
    log(`Complete — ${releasesToCreate.length} new events created, ${currentUrls.size} total known in ${durationMs}ms`);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await recordFailure(db, err.message || String(err), durationMs);
    log(`FAILED: ${err.message}`);
    console.error('[ReleasesRefresh] Fatal error:', err);
    process.exit(1);
  }
}

main();
