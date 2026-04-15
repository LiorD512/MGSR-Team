/**
 * Shared Transfermarkt fetching — impit-based browser impersonation.
 * Used by both PlayerRefresh and ReleasesRefresh workers.
 *
 * impit (Rust-based) provides Chrome-grade TLS fingerprinting that bypasses
 * Transfermarkt's bot detection (which blocks plain https.get / header-generator).
 */

const cheerio = require("cheerio");

// ── impit: browser impersonation (Rust-based TLS fingerprint matching) ──
let _Impit = null;
let _impit = null;
async function getImpit() {
  if (!_impit) {
    if (!_Impit) _Impit = (await import("impit")).Impit;
    _impit = new _Impit({ browser: "chrome131" });
  }
  return _impit;
}

// ── Realistic header profiles ──
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
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "Referer": "https://www.transfermarkt.com/",
  };
}

// ── Circuit breaker ──
let _consecutiveBlocks = 0;
let _circuitOpenUntil = 0;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN = 5 * 60 * 1000;
const MIN_FETCH_GAP_MS = 1500;
const MAX_FETCH_GAP_MS = 4000;
let _lastFetchTime = 0;

function randomFetchDelay() {
  return MIN_FETCH_GAP_MS + Math.floor(Math.random() * (MAX_FETCH_GAP_MS - MIN_FETCH_GAP_MS));
}

/**
 * Fetch a TM page using impit (browser-grade TLS) and return a Cheerio document.
 * Includes rate limiting, circuit breaker, and realistic headers.
 */
async function fetchDocument(url) {
  if (_circuitOpenUntil > Date.now()) {
    throw new Error("TM circuit breaker open — cooling down");
  }
  // Rate limiter: randomized gap
  const now = Date.now();
  const gap = randomFetchDelay();
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
      console.warn(`[TM] Circuit breaker TRIPPED. Cooling down 5 min.`);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  _consecutiveBlocks = 0;
  const html = await res.text();
  return cheerio.load(html);
}

module.exports = { fetchDocument };
