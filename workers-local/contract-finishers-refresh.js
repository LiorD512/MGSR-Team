#!/usr/bin/env node
/**
 * Contract Finishers Refresh — Local Machine Worker
 *
 * Scrapes ALL contract finisher pages from Transfermarkt (no time limit),
 * then writes results to Firestore ScrapingCache in chunked format.
 *
 * Runs on macOS via launchd every 3 days. Can also be run manually:
 *   cd workers-local && node contract-finishers-refresh.js
 *
 * Requires:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON
 *     OR a service-account.json file in this directory
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");

// ── Firebase init ────────────────────────────────────────────────────────────

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
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    vars[key] = val;
  }
  return vars;
}

function initFirebase() {
  // Option 1: service-account.json in this directory
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, "service-account.json");

  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, "utf8"));
    const app = initializeApp({ credential: cert(sa) });
    return getFirestore(app);
  }

  // Option 2: Read from mgsr-web/.env.local (shares Vercel credentials)
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

  console.error(
    `[CF Worker] No credentials found.\n` +
      `  Option A: Place service-account.json in workers-local/\n` +
      `  Option B: Ensure mgsr-web/.env.local has FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY`
  );
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────

const TRANSFERMARKT_BASE = "https://www.transfermarkt.com";
const CF_MIN_VALUE = 150000;
const CF_MAX_VALUE = 5000000;
const CF_MAX_AGE = 31;
const CF_MAX_PAGES = 400;
const CF_BATCH_SIZE = 5; // bigger batch for local (no Vercel timeout)
const CF_MAX_COOLDOWN_RETRIES = 5;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 1500;
const MAX_FETCH_GAP_MS = 4000;
const CACHE_KEY = "contract-finishers";
const CHUNK_SIZE = 2000;

// ── TM fetching (impit-based) ────────────────────────────────────────────────

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
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "sec-ch-ua":
      '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  },
  {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "sec-ch-ua":
      '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
  },
];

function getRandomHeaders() {
  const profile =
    HEADER_PROFILES[Math.floor(Math.random() * HEADER_PROFILES.length)];
  return {
    ...profile,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    Referer: "https://www.transfermarkt.com/",
  };
}

let _consecutiveBlocks = 0;
let _circuitOpenUntil = 0;
let _lastFetchTime = 0;

function randomDelay() {
  return (
    MIN_FETCH_GAP_MS +
    Math.floor(Math.random() * (MAX_FETCH_GAP_MS - MIN_FETCH_GAP_MS))
  );
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
      console.warn(
        `[CF Worker] Circuit breaker TRIPPED. Cooling down 5 min.`
      );
    }
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  _consecutiveBlocks = 0;
  const html = await res.text();
  return cheerio.load(html);
}

async function fetchHtml(url) {
  const $ = await fetchDocument(url);
  return $.html();
}

async function fetchHtmlWithRetry(url, maxRetries = 3) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err;
      if (err.message.includes("circuit breaker")) throw err;
      if (i < maxRetries - 1)
        await new Promise((r) => setTimeout(r, 3000 + i * 2000));
    }
  }
  throw lastErr;
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
    Goalkeeper: "GK",
    "Left Back": "LB",
    "Centre Back": "CB",
    "Right Back": "RB",
    "Defensive Midfield": "DM",
    "Central Midfield": "CM",
    "Attacking Midfield": "AM",
    "Right Winger": "RW",
    "Left Winger": "LW",
    "Centre Forward": "CF",
    "Second Striker": "SS",
    "Left Midfield": "LM",
    "Right Midfield": "RM",
  };
  return map[s] || s || "";
}

function parseMarketValueCF(val) {
  if (!val || val.includes("-")) return 0;
  const s = val.replace(/[€\s]/g, "").toLowerCase();
  if (s.includes("k")) return (parseFloat(s.replace("k", "")) || 0) * 1000;
  if (s.includes("m")) return (parseFloat(s.replace("m", "")) || 0) * 1000000;
  return parseFloat(s) || 0;
}

function getContractFinisherWindow() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = Math.max(now.getFullYear(), 2026);
  if (month >= 2 && month <= 9) {
    return { window: "Summer", yearsToQuery: [year] };
  }
  return { window: "Winter", yearsToQuery: [year, year + 1] };
}

function formatContractExpiryDate(window, year, isFirstYear) {
  if (window === "Summer") return `30.06.${year}`;
  return isFirstYear ? `31.12.${year}` : `31.01.${year}`;
}

function extractNationalityAndFlag($, row) {
  const img = $(row).find("td.zentriert img[title]").first();
  const natImg = img.length
    ? img
    : $(row)
        .find("img[alt]")
        .filter((_, el) => {
          const alt = $(el).attr("alt") || "";
          return alt.length >= 2 && alt.length <= 50;
        })
        .first();
  if (!natImg.length) return { nationality: null, flag: null };
  const nationality = natImg.attr("title") || natImg.attr("alt") || null;
  const flag =
    natImg.attr("data-src") || natImg.attr("src") || null;
  return { nationality, flag: flag ? makeAbsoluteUrl(flag) : null };
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

// ── Main scraping logic ──────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [CF Worker] ${msg}`);
}

async function scrapeContractFinishers() {
  const config = getContractFinisherWindow();
  log(
    `Starting scrape — window: ${config.window}, years: ${config.yearsToQuery.join(", ")}`
  );
  log(
    `Params: maxPages=${CF_MAX_PAGES}, batchSize=${CF_BATCH_SIZE}, valueRange=${CF_MIN_VALUE}-${CF_MAX_VALUE}, maxAge=${CF_MAX_AGE}`
  );

  const seenUrls = new Set();
  const all = [];

  for (const jahr of config.yearsToQuery) {
    let page = 1;
    let batchShouldBreak = false;
    let cooldownRetries = 0;

    log(`Scraping year ${jahr}...`);

    while (page <= CF_MAX_PAGES && !batchShouldBreak) {
      const batchEnd = Math.min(page + CF_BATCH_SIZE - 1, CF_MAX_PAGES);
      const batch = [];
      let batchFetchFails = 0;

      for (let p = page; p <= batchEnd; p++) {
        const url = `${TRANSFERMARKT_BASE}/transfers/endendevertraege/statistik?plus=1&jahr=${jahr}&land_id=0&ausrichtung=alle&spielerposition_id=alle&altersklasse=alle&page=${p}`;
        try {
          const html = await fetchHtmlWithRetry(url);
          batch.push({ html });
        } catch {
          batch.push({ html: null });
          batchFetchFails++;
        }
      }

      // If every fetch failed, wait and retry
      if (batchFetchFails === batch.length) {
        cooldownRetries++;
        if (cooldownRetries > CF_MAX_COOLDOWN_RETRIES) {
          log(
            `Giving up after ${CF_MAX_COOLDOWN_RETRIES} cooldown retries (page ${page}, year ${jahr})`
          );
          break;
        }
        const waitMs = CIRCUIT_COOLDOWN + 30000;
        log(
          `Batch failed (pages ${page}-${batchEnd}). Waiting ${Math.round(waitMs / 1000)}s before retry ${cooldownRetries}/${CF_MAX_COOLDOWN_RETRIES}...`
        );
        _consecutiveBlocks = 0;
        _circuitOpenUntil = 0;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      cooldownRetries = 0;

      let batchNewPlayers = 0;
      for (const { html } of batch) {
        if (!html) continue;
        const $ = cheerio.load(html);
        const rows = $(
          "table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even"
        );
        let rawRowCount = 0;
        let maxValueOnPage = 0;

        rows.each((_, row) => {
          try {
            const playerLink = $(row)
              .find('a[href*="/profil/spieler/"], a[href*="/profile/player/"]')
              .first();
            const href = playerLink.attr("href");
            if (!href) return;
            rawRowCount++;

            const playerUrl = href.startsWith("http")
              ? href
              : TRANSFERMARKT_BASE + href;
            if (seenUrls.has(playerUrl)) return;

            const tables = $(row).find("table.inline-table");
            const playerTable = tables.first();
            const playerName =
              (
                playerLink.attr("title") ||
                playerTable.find("img").attr("title") ||
                playerLink.text().trim() ||
                ""
              ).trim() || null;
            const posText = playerTable
              .find("tr")
              .eq(1)
              .text()
              .replace(/-/g, " ")
              .trim();
            const playerPosition = convertPosition(posText) || posText || null;

            const ageTd = $(row).find("td.zentriert").first().text().trim();
            const ageMatch = ageTd.match(/\((\d+)\)/);
            const playerAge = ageMatch
              ? ageMatch[1]
              : (parseInt(ageTd, 10) || "").toString() || null;

            let marketValue = null;
            $(row)
              .find("td")
              .each((__, td) => {
                const t = $(td).text().trim();
                if (t.includes("€")) {
                  marketValue = t;
                  return false;
                }
              });

            const valueNum = parseMarketValueCF(marketValue);
            const ageNum = parseInt(playerAge || "", 10);
            if (valueNum > maxValueOnPage) maxValueOnPage = valueNum;

            if (
              Number.isNaN(ageNum) ||
              ageNum > CF_MAX_AGE ||
              valueNum < CF_MIN_VALUE ||
              valueNum > CF_MAX_VALUE
            )
              return;
            seenUrls.add(playerUrl);

            const { nationality, flag } = extractNationalityAndFlag($, row);
            const clubTable = tables.eq(1);
            const clubName =
              (
                clubTable.find('a[href*="/startseite/verein/"]').attr("title") ||
                clubTable.find("img").attr("title") ||
                ""
              ).trim() || null;
            const clubLogoRaw =
              clubTable.find("img").attr("data-src") ||
              clubTable.find("img").attr("src") ||
              "";
            const clubJoinedLogo = clubLogoRaw
              ? makeAbsoluteUrl(clubLogoRaw)
              : null;
            const playerImageRaw =
              playerTable.find("img").attr("data-src") ||
              playerTable.find("img").attr("src") ||
              "";
            const playerImage = playerImageRaw
              ? makeAbsoluteUrl(playerImageRaw.replace("medium", "big"))
              : null;

            const contractExpiry = formatContractExpiryDate(
              config.window,
              jahr,
              config.yearsToQuery[0] === jahr
            );
            all.push({
              playerImage,
              playerName,
              playerUrl,
              playerPosition,
              playerAge,
              playerNationality: nationality,
              playerNationalityFlag: flag,
              clubJoinedLogo,
              clubJoinedName: clubName,
              transferDate: contractExpiry,
              marketValue: marketValue || "",
            });
            batchNewPlayers++;
          } catch {
            // skip malformed row
          }
        });

        if (rawRowCount === 0) batchShouldBreak = true;
        if (maxValueOnPage > 0 && maxValueOnPage < CF_MIN_VALUE)
          batchShouldBreak = true;
      }

      if (page % 20 === 1 || batchNewPlayers > 0) {
        log(
          `Year ${jahr} | Pages ${page}-${batchEnd} | +${batchNewPlayers} new | Total: ${all.length}`
        );
      }

      page += CF_BATCH_SIZE;
      if (batchShouldBreak) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Sort by market value descending
  all.sort(
    (a, b) =>
      parseMarketValueCF(b.marketValue || "") -
      parseMarketValueCF(a.marketValue || "")
  );

  return { players: all, windowLabel: config.window };
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  log("=== Contract Finishers Refresh Worker ===");

  const db = initFirebase();
  log("Firebase initialized");

  try {
    const { players, windowLabel } = await scrapeContractFinishers();
    log(
      `Scraping complete: ${players.length} players (window: ${windowLabel})`
    );

    if (players.length > 0) {
      await setCacheChunked(db, CACHE_KEY, players);
    } else {
      log("WARNING: No players scraped — cache NOT updated");
    }
  } catch (err) {
    console.error("[CF Worker] FATAL ERROR:", err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  log(`Done in ${elapsed}s`);
  process.exit(0);
}

main();
