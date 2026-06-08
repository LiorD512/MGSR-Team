#!/usr/bin/env node
/**
 * Releases Refresh — Local Machine Worker
 *
 * Scrapes ALL recent releases (transfers to "Without Club") from Transfermarkt
 * using the same multi-range approach as the Cloud Run worker.
 * Writes results to Firestore ScrapingCache for instant web page loading.
 *
 * Run manually:  cd workers-local && node releases-refresh.js
 * Or via launchd (registered alongside contract-finishers-refresh)
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");

// ── Firebase init (reuse from contract-finishers-refresh.js) ─────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const vars = {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    vars[key] = val;
  }
  return vars;
}

function initFirebase() {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, "service-account.json");

  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));
    const app = initializeApp({ credential: cert(sa) });
    return getFirestore(app);
  }

  const envPath = path.join(__dirname, "..", "mgsr-web", ".env.local");
  const env = loadEnvFile(envPath);
  const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    const app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
    return getFirestore(app);
  }

  console.error("[Releases Worker] No credentials found.");
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────

const TRANSFERMARKT_BASE = "https://www.transfermarkt.com";
const CACHE_KEY = "releases-all";
const CHUNK_SIZE = 2000;

// Value buckets are required because TM paginates each query; one wide range misses many players.
const RELEASE_RANGES = [
  [0, 125000],
  [125001, 250000],
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
  [4000001, 50000000],
];

const DELAY_BETWEEN_RANGES_MS = 5000;

const WITHOUT_CLUB_VARIANTS = [
  "without club", "ohne verein", "sans club", "sin club",
  "senza squadra", "sem clube", "geen club", "bez klubu",
  "klubsuz", "free agent",
];

// ── TM fetching (impit) ─────────────────────────────────────────────────────

let _Impit = null;
let _impit = null;
async function getImpit() {
  if (!_impit) {
    if (!_Impit) _Impit = (await import("impit")).Impit;
    _impit = new _Impit({ browser: "chrome131" });
  }
  return _impit;
}

const HEADER_PROFILES = [
  {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  },
  {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
  },
];

function getRandomHeaders() {
  const profile = HEADER_PROFILES[Math.floor(Math.random() * HEADER_PROFILES.length)];
  return {
    ...profile,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    Referer: "https://www.transfermarkt.com/",
  };
}

const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 1500;
const MAX_FETCH_GAP_MS = 4000;
let _consecutiveBlocks = 0;
let _circuitOpenUntil = 0;
let _lastFetchTime = 0;

function randomDelay() {
  return MIN_FETCH_GAP_MS + Math.floor(Math.random() * (MAX_FETCH_GAP_MS - MIN_FETCH_GAP_MS));
}

async function fetchDocument(url) {
  if (_circuitOpenUntil > Date.now()) {
    throw new Error("TM circuit breaker open — cooling down");
  }
  const now = Date.now();
  const gap = randomDelay();
  const wait = gap - (now - _lastFetchTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _lastFetchTime = Date.now();

  const impit = await getImpit();
  const res = await impit.fetch(url, {
    headers: getRandomHeaders(),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 429 || res.status === 403 || res.status === 503) {
    _consecutiveBlocks++;
    if (_consecutiveBlocks >= CIRCUIT_THRESHOLD) {
      _circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN;
      log(`Circuit breaker TRIPPED. Cooling down 5 min.`);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  _consecutiveBlocks = 0;
  const html = await res.text();
  return cheerio.load(html);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAbsoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return TRANSFERMARKT_BASE + url;
  return url;
}

function convertPosition(s) {
  const map = {
    Goalkeeper: "GK", "Left Back": "LB", "Centre Back": "CB", "Right Back": "RB",
    "Defensive Midfield": "DM", "Central Midfield": "CM", "Attacking Midfield": "AM",
    "Right Winger": "RW", "Left Winger": "LW", "Centre Forward": "CF",
    "Second Striker": "SS", "Left Midfield": "LM", "Right Midfield": "RM",
  };
  return map[s] || s || "";
}

function isWithoutClub($, row) {
  const tables = row.find("table.inline-table");
  if (tables.length < 3) return false;
  const newClubCell = tables.eq(2);
  const imgAlt = (newClubCell.find("img").attr("alt") || "").trim().toLowerCase();
  const cellText = newClubCell.text().trim().toLowerCase();
  return WITHOUT_CLUB_VARIANTS.some((v) => imgAlt.includes(v) || cellText.includes(v));
}

function extractNationalityAndFlag($, row) {
  let img = row.find("td.zentriert img[title]").first();
  if (!img.length) {
    const imgs = row.find("img[alt]");
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs.eq(i);
      const alt = el.attr("alt") || "";
      if (alt.length >= 2 && alt.length <= 50) { img = el; break; }
    }
  }
  if (!img.length) return [null, null];
  const nationality = (img.attr("title") || img.attr("alt") || "").trim() || null;
  let flagSrc = img.attr("data-src") || img.attr("src") || null;
  if (flagSrc) flagSrc = makeAbsoluteUrl(flagSrc).replace("verysmall", "head").replace("tiny", "head");
  return [nationality, flagSrc];
}

function buildReleasesUrl(minValue, maxValue, page = 1) {
  return `${TRANSFERMARKT_BASE}/transfers/neuestetransfers/statistik?land_id=0&wettbewerb_id=alle&minMarktwert=${minValue}&maxMarktwert=${maxValue}&plus=1&page=${page}`;
}

function buildFreeAgentsUrl(minValue, maxValue, page = 1) {
  return `${TRANSFERMARKT_BASE}/transfers/vertragslosespieler/statistik?ausrichtung=&spielerposition_id=0&land_id=&wettbewerb_id=alle&seit=0&altersklasse=&minMarktwert=${minValue}&maxMarktwert=${maxValue}&plus=1&page=${page}`;
}

function getTotalPages($) {
  const selectors = [
    "div.pager li.tm-pagination__list-item",
    "li.tm-pagination__list-item",
    "ul.tm-pagination li",
    "div.pager li",
  ];
  for (const sel of selectors) {
    const nums = $(sel)
      .map((_, el) => parseInt($(el).text().trim(), 10))
      .get()
      .filter((n) => !isNaN(n));
    const max = Math.max(0, ...nums);
    if (max >= 1) return max;
  }
  const pageLinks = $("a[href*='page=']");
  let maxPage = 1;
  pageLinks.each((_, el) => {
    const m = ($(el).attr("href") || "").match(/page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1], 10));
  });
  return Math.max(1, maxPage);
}

function parseTransferList($) {
  const rows = $("table.items")
    .find("tr.odd, tr.even")
    .filter((_, el) => isWithoutClub($, $(el)))
    .get();

  return rows.map((el) => {
    try {
      const row = $(el);
      const tables = row.find("td").find("table.inline-table");
      const firstTable = tables.eq(0);
      const playerImage = (firstTable.find("img").attr("data-src") || "").replace("medium", "big");
      const playerName = firstTable.find("img").attr("title") || "";
      const href = firstTable.find("a").attr("href") || "";
      const playerUrl = `${TRANSFERMARKT_BASE}${href}`;
      const positionText = firstTable.find("tr").eq(1).text().replace(/-/g, " ").trim();
      const playerPosition = convertPosition(positionText);
      const zentriert = row.find("td.zentriert");
      const playerAge = zentriert.eq(0).text().trim();
      const transferDate = zentriert.eq(2).text().trim();
      const marketValue = row.find("td.rechts").eq(0).text().trim();
      const [playerNationality, playerNationalityFlag] = extractNationalityAndFlag($, row);

      return {
        playerImage: makeAbsoluteUrl(playerImage),
        playerName,
        playerUrl,
        playerPosition,
        playerAge,
        playerNationality,
        playerNationalityFlag,
        transferDate,
        marketValue,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function parseFreeAgentsList($) {
  const rows = $("table.items").find("tr.odd, tr.even").get();

  return rows.map((el) => {
    try {
      const row = $(el);
      const tables = row.find("td").find("table.inline-table");
      const firstTable = tables.eq(0);
      const playerImage = (firstTable.find("img").attr("data-src") || firstTable.find("img").attr("src") || "").replace("medium", "big");
      const playerName = firstTable.find("img").attr("title") || "";
      const href = firstTable.find("a").attr("href") || "";
      if (!href) return null;
      const playerUrl = `${TRANSFERMARKT_BASE}${href}`;
      const positionText = firstTable.find("tr").eq(1).text().replace(/-/g, " ").trim();
      const playerPosition = convertPosition(positionText);
      const zentriert = row.find("td.zentriert");
      const playerAge = zentriert.eq(0).text().trim() || zentriert.eq(1).text().trim();
      const marketValue = row.find("td.rechts").eq(0).text().trim();
      const [playerNationality, playerNationalityFlag] = extractNationalityAndFlag($, row);

      return {
        playerImage: makeAbsoluteUrl(playerImage),
        playerName,
        playerUrl,
        playerPosition,
        playerAge,
        playerNationality,
        playerNationalityFlag,
        transferDate: "",
        marketValue,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ── Cache write ──────────────────────────────────────────────────────────────

async function setCacheChunked(db, key, items) {
  const col = db.collection("ScrapingCache");
  const totalChunks = Math.ceil(items.length / CHUNK_SIZE);
  const now = Date.now();
  const batch = db.batch();
  for (let i = 0; i < totalChunks; i++) {
    const chunk = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const doc = col.doc(`${key}-chunk-${i}`);
    batch.set(doc, {
      payload: chunk,
      cachedAt: now,
      ...(i === 0 ? { totalChunks } : {}),
    });
  }
  await batch.commit();
  log(`Cached ${items.length} players in ${totalChunks} chunks`);
}

// ── Main scraping ────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [Releases Worker] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getReleasesForRange(minValue, maxValue) {
  const all = [];

  // Source 1: newest transfers where destination is Without Club
  const url = buildReleasesUrl(minValue, maxValue, 1);
  const $ = await fetchDocument(url);
  const pageCount = getTotalPages($);

  const totalRows = $("table.items").find("tr.odd, tr.even").length;
  const hasItems = $("table.items").length;
  log(`  newest-transfers page 1: ${hasItems} table(s), ${totalRows} row(s), ${pageCount} page(s)`);

  all.push(...parseTransferList($));

  for (let page = 2; page <= pageCount; page++) {
    try {
      const $p = await fetchDocument(buildReleasesUrl(minValue, maxValue, page));
      all.push(...parseTransferList($p));
    } catch (err) {
      log(`  newest-transfers page ${page} failed: ${err.message}`);
    }
  }

  // Source 2: dedicated free agents list (vertragslosespieler)
  try {
    const freeUrl = buildFreeAgentsUrl(minValue, maxValue, 1);
    const $free = await fetchDocument(freeUrl);
    const freePageCount = getTotalPages($free);
    const freeRows = $free("table.items").find("tr.odd, tr.even").length;
    log(`  free-agents page 1: ${freeRows} row(s), ${freePageCount} page(s)`);

    all.push(...parseFreeAgentsList($free));

    for (let page = 2; page <= freePageCount; page++) {
      try {
        const $p = await fetchDocument(buildFreeAgentsUrl(minValue, maxValue, page));
        all.push(...parseFreeAgentsList($p));
      } catch (err) {
        log(`  free-agents page ${page} failed: ${err.message}`);
      }
    }
  } catch (err) {
    log(`  free-agents source failed: ${err.message}`);
  }

  return all;
}

async function scrapeAllReleases() {
  log(`Starting scrape — ${RELEASE_RANGES.length} value ranges`);
  const allReleases = [];
  let rangesFailed = 0;

  for (let i = 0; i < RELEASE_RANGES.length; i++) {
    const [minVal, maxVal] = RELEASE_RANGES[i];
    log(`Fetching range ${i + 1}/${RELEASE_RANGES.length}: ${minVal}-${maxVal}`);
    try {
      const releases = await getReleasesForRange(minVal, maxVal);
      allReleases.push(...releases);
      log(`  ✅ ${releases.length} releases`);
    } catch (err) {
      rangesFailed++;
      log(`  ❌ Failed: ${err.message}`);
      // Reset circuit breaker and wait
      if (err.message.includes("circuit breaker") || err.message.includes("HTTP 429")) {
        _consecutiveBlocks = 0;
        _circuitOpenUntil = 0;
        log(`  Waiting 5 min for cooldown...`);
        await sleep(CIRCUIT_COOLDOWN + 30000);
      }
    }
    if (i < RELEASE_RANGES.length - 1) {
      await sleep(DELAY_BETWEEN_RANGES_MS);
    }
  }

  if (rangesFailed === RELEASE_RANGES.length) {
    throw new Error(`All ${RELEASE_RANGES.length} ranges failed — TM may be blocking`);
  }

  // Deduplicate by playerUrl
  const distinctByUrl = new Map();
  allReleases.forEach((r) => {
    if (r.playerUrl) distinctByUrl.set(r.playerUrl, r);
  });
  const distinct = Array.from(distinctByUrl.values());

  // Sort by market value descending
  distinct.sort((a, b) => {
    const va = parseValue(a.marketValue);
    const vb = parseValue(b.marketValue);
    return vb - va;
  });

  return distinct;
}

function parseValue(val) {
  if (!val) return 0;
  const s = val.replace(/[€\s]/g, "").toLowerCase();
  if (s.includes("k")) return (parseFloat(s.replace("k", "")) || 0) * 1000;
  if (s.includes("m")) return (parseFloat(s.replace("m", "")) || 0) * 1000000;
  return parseFloat(s) || 0;
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  log("=== Releases Refresh Worker ===");

  const db = initFirebase();
  log("Firebase initialized");

  try {
    const players = await scrapeAllReleases();
    log(`Scraping complete: ${players.length} unique releases`);

    if (players.length > 0) {
      await setCacheChunked(db, CACHE_KEY, players);
    } else {
      log("WARNING: No releases scraped — cache NOT updated");
    }
  } catch (err) {
    console.error("[Releases Worker] FATAL ERROR:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  log(`Done in ${elapsed}s`);
  process.exit(0);
}

main();
