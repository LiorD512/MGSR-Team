#!/usr/bin/env node
/**
 * FM Intelligence Cache Crawler
 *
 * Crawls fminside.net from your LOCAL machine (residential IP) and writes
 * CA/PA/attributes to the Firestore "FmIntelligenceCache" collection.
 * The Vercel API then reads from this cache instead of scraping fminside live.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/mgsr-64e4b-firebase-adminsdk-*.json
 *   node scripts/crawl-fminside-cache.js
 *
 * Options:
 *   --collection=PlayersWomen   (default: Players — which collection to crawl)
 *   --limit=10                  (default: all — process only N players)
 *   --skip-cached               (skip players already in cache less than 30 days old)
 *   --dry-run                   (scrape + print, don't write to Firestore)
 *
 * What it does:
 *   1. Reads all players from Firestore (Players/PlayersWomen/PlayersYouth)
 *   2. For each player: searches fminside.net via search.php, fetches detail page
 *   3. Parses CA, PA, attributes, position fit, foot, height
 *   4. Writes results to Firestore "FmIntelligenceCache" collection
 *
 * The cache document ID = normalized player name (lowercase, no diacritics).
 * Each document contains the full FM intelligence JSON + metadata.
 */

const https = require("https");
const { URL } = require("url");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const FMINSIDE_BASE = "https://fminside.net";
const CACHE_COLLECTION = "FmIntelligenceCache";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DELAY_BETWEEN_REQUESTS_MS = 2000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/* ─── CLI args ─────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const getArg = (name) => {
  const a = args.find((a) => a.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

const COLLECTION = getArg("collection") || "Players";
const LIMIT = getArg("limit") ? parseInt(getArg("limit"), 10) : 0;
const SKIP_CACHED = hasFlag("skip-cached");
const DRY_RUN = hasFlag("dry-run");

/* ─── HTTP fetch ───────────────────────────────────────────────── */
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOpts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": UA,
        Accept: options.accept || "text/html",
        "Accept-Language": "en-US,en;q=0.9",
        ...(options.headers || {}),
      },
    };
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  return fetchUrl(url, {
    method: "POST",
    accept: "text/html",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─── Name normalization ───────────────────────────────────────── */
function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function nameMatchScore(searchName, resultName) {
  const s = normalize(searchName);
  const r = normalize(resultName);
  if (s === r) return 100;
  const sWords = s.split(/\s+/).filter(Boolean);
  const rWords = r.split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const w of sWords) {
    if (rWords.some((rw) => rw.includes(w) || w.includes(rw))) matches++;
  }
  return sWords.length > 0 ? (matches / sWords.length) * 100 : 0;
}

function makeCacheKey(name) {
  return normalize(name).replace(/\s+/g, "_");
}

/* ─── FMInside search (search.php — simple, no session) ──────── */
async function searchFmInside(name, playerAge) {
  const searchName = name.trim().split(/\s+/).slice(0, 3).join(" ");
  if (!searchName || searchName.length < 2) return null;

  try {
    const res = await postForm(
      `${FMINSIDE_BASE}/resources/inc/ajax/search.php`,
      { search_phrase: searchName, database_id: "7" }
    );
    if (res.status !== 200) return null;
    const html = res.body;

    // Parse results: <a title="Name" href="/players/7-fm-26/ID-slug">
    const blocks = html.split(/<ul class="player">/i).slice(1);
    const hits = [];

    for (const block of blocks) {
      const linkMatch = block.match(
        /<a\s+title="([^"]+)"\s+href="(\/players\/7-fm-26\/\d+-[^"]+)"/i
      );
      if (!linkMatch) continue;
      const displayName = linkMatch[1].trim();
      const path = linkMatch[2];
      const nScore = nameMatchScore(name, displayName);
      if (nScore < 50) continue;

      // Age from <li class="age">24</li>
      const ageM = block.match(/<li class="age">(\d+)<\/li>/i);
      const rowAge = ageM ? ageM[1] : "";

      // Boost score if age matches the player we're looking for
      let ageBonus = 0;
      if (playerAge && rowAge) {
        const diff = Math.abs(parseInt(playerAge, 10) - parseInt(rowAge, 10));
        if (diff === 0) ageBonus = 20;
        else if (diff <= 1) ageBonus = 10;
        else if (diff > 3) ageBonus = -20; // Penalize large age mismatch
      }

      hits.push({
        url: `${FMINSIDE_BASE}${path}`,
        name: displayName,
        age: rowAge,
        score: nScore + ageBonus,
      });
    }

    hits.sort((a, b) => b.score - a.score);
    return hits[0] || null;
  } catch (err) {
    console.error(`  Search error for "${name}":`, err.message);
    return null;
  }
}

/* ─── FMInside detail page scraping ──────────────────────────── */
function verifyPlayerNameOnPage(html, expectedName) {
  const n = normalize(expectedName);
  if (!n) return true;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const textNorm = normalize(
    [titleMatch?.[1], h1Match?.[1]].filter(Boolean).join(" ")
  );
  const words = n.split(/\s+/).filter(Boolean);
  const matchCount = words.filter((w) => textNorm.includes(w)).length;
  return (
    matchCount >= Math.min(2, words.length) ||
    (words.length === 1 && matchCount === 1)
  );
}

async function fetchPlayerDetail(url, expectedName) {
  const res = await fetchUrl(url);
  if (res.status !== 200) return null;
  const html = res.body;

  if (expectedName && !verifyPlayerNameOnPage(html, expectedName)) return null;

  // CA and PA
  const metaMatch = html.match(
    /class="meta"[^>]*>[\s\S]*?<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>/i
  );
  let ca = 0,
    pa = 0;
  if (metaMatch) {
    ca = parseInt(metaMatch[1], 10) || 0;
    pa = parseInt(metaMatch[2], 10) || 0;
    if (ca > 200) ca = 0;
    if (pa > 200) pa = 0;
  }
  // Dynamic PA
  if (pa === 0) {
    const dynamicPaMatch = html.match(
      /class="meta"[^>]*>[\s\S]*?<span[^>]*class="[^"]*card[^"]*"[^>]*>(\d{1,3})<\/span>\s*<span[^>]*data-title="Potential between (\d+) and (\d+)/i
    );
    if (dynamicPaMatch) {
      if (ca === 0) ca = parseInt(dynamicPaMatch[1], 10) || 0;
      const paLow = parseInt(dynamicPaMatch[2], 10) || 0;
      const paHigh = parseInt(dynamicPaMatch[3], 10) || 0;
      pa = paHigh > 0 ? Math.round((paLow + paHigh) / 2) : paLow;
    }
  }

  // Attributes
  const attributes = [];
  const seen = new Set();
  const attrRe =
    /<td\s+class="name"[^>]*>(?:<acronym[^>]*>)?([^<]+)<\/[^>]+>\s*<\/td>\s*<td[^>]*>(\d{1,3})<\/td>/gi;
  let am;
  while ((am = attrRe.exec(html)) !== null) {
    const raw = (am[1] || "").trim();
    if (raw === "---" || raw.length < 2) continue;
    const attrName = raw
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const val = parseInt(am[2], 10);
    if (
      attrName.length >= 2 &&
      !seen.has(attrName) &&
      !isNaN(val) &&
      val >= 0 &&
      val <= 100
    ) {
      seen.add(attrName);
      attributes.push({ name: attrName, value: val });
    }
  }

  // Position fit
  const positionFit = {};
  const roleToPos = {
    "Centre Forward": "ST", "Channel Forward": "ST", Poacher: "ST",
    "Target Forward": "ST", "False Nine": "ST", "Advanced Forward": "ST",
    "Attacking Midfielder": "AM", "Advanced Playmaker": "AM",
    "Shadow Striker": "ST", "Central Midfielder": "CM", "Box to Box": "CM",
    "Defensive Midfielder": "DM", Winger: "AM", "Inside Forward": "AM",
    "Full Back": "RB", "Wing Back": "RB", "Centre Back": "CB",
    Sweeper: "CB", Goalkeeper: "GK",
  };
  const validPositions = new Set(["GK","CB","RB","LB","DM","CM","AM","ST","LW","RW"]);
  const roleKeyRe =
    /<span class="key">([^<]+)<\/span><span class="value">(\d+(?:\.\d)?)<\/span>/gi;
  const skipKeys = new Set(["value","age","name","wage","contract","likes","rating"]);
  let rm;
  while ((rm = roleKeyRe.exec(html)) !== null) {
    const roleName = (rm[1] || "").trim();
    if (skipKeys.has(roleName.toLowerCase())) continue;
    const fitVal = parseFloat(rm[2] || "0");
    const key =
      roleToPos[roleName] ||
      (roleName.length >= 2 ? roleName.slice(0, 2).toUpperCase() : "ST");
    if (
      !isNaN(fitVal) && fitVal > 0 && fitVal <= 100 && validPositions.has(key)
    ) {
      if (!positionFit[key] || fitVal > positionFit[key])
        positionFit[key] = Math.round(fitVal);
    }
  }

  // Height
  const heightMatch =
    html.match(
      /<span class="key">Height<\/span><span class="value">(\d+)\s*CM<\/span>/i
    ) || html.match(/Height[^<]*<\/[^>]+>\s*<[^>]*>(\d+)\s*CM/i);
  const heightCm = heightMatch ? parseInt(heightMatch[1], 10) : 0;

  // Best position
  let bestPosition = "";
  const posAttrMatch = html.match(/position="([a-z]{2,3})"/i);
  if (posAttrMatch) bestPosition = posAttrMatch[1].toUpperCase().slice(0, 2);

  // Foot
  let footLeft = 50,
    footRight = 50;
  const leftFootMatch = html.match(
    /<span class="key">Left foot<\/span><span class="value"><span[^>]*>(\d{1,3})<\/span>/i
  );
  const rightFootMatch = html.match(
    /<span class="key">Right foot<\/span><span class="value"><span[^>]*>(\d{1,3})<\/span>/i
  );
  if (leftFootMatch) footLeft = Math.min(100, parseInt(leftFootMatch[1], 10) || 50);
  if (rightFootMatch) footRight = Math.min(100, parseInt(rightFootMatch[1], 10) || 50);

  return { ca, pa, attributes, positionFit, bestPosition, heightCm, foot: { left: footLeft, right: footRight } };
}

/* ─── Tier classification ──────────────────────────────────────── */
function classifyTier(ca) {
  if (ca <= 0) return "unknown";
  if (ca >= 90) return "world_class";
  if (ca >= 80) return "elite";
  if (ca >= 70) return "top_league";
  if (ca >= 60) return "solid_pro";
  if (ca >= 50) return "lower_league";
  return "prospect";
}

/* ─── Build full FM Intelligence document ──────────────────────── */
function buildFmDoc(hit, detail, originalName) {
  const tier = classifyTier(detail.ca);
  const sortedAttrs = [...detail.attributes].sort((a, b) => b.value - a.value);
  const topAttributes = sortedAttrs.slice(0, 6);
  const weakAttributes = [...detail.attributes]
    .sort((a, b) => a.value - b.value)
    .slice(0, 4);

  const dimensionScores = {};
  const tech = detail.attributes.filter((a) =>
    ["dribbling","passing","first_touch","technique","finishing","crossing"].includes(a.name)
  );
  const mental = detail.attributes.filter((a) =>
    ["decisions","composure","vision","anticipation","off_the_ball","work_rate"].includes(a.name)
  );
  const physical = detail.attributes.filter((a) =>
    ["pace","acceleration","stamina","strength","agility","balance"].includes(a.name)
  );
  if (tech.length)
    dimensionScores.technical = Math.round(
      tech.reduce((s, a) => s + a.value, 0) / tech.length
    );
  if (mental.length)
    dimensionScores.mental = Math.round(
      mental.reduce((s, a) => s + a.value, 0) / mental.length
    );
  if (physical.length)
    dimensionScores.physical = Math.round(
      physical.reduce((s, a) => s + a.value, 0) / physical.length
    );
  dimensionScores.overall =
    detail.ca > 0 ? Math.min(100, Math.round(detail.ca)) : 50;

  const bestPos = Object.entries(detail.positionFit).sort(
    ([, a], [, b]) => b - a
  )[0];

  return {
    player_name: hit.name,
    original_query_name: originalName,
    ca: detail.ca,
    pa: detail.pa,
    potential_gap: Math.max(0, detail.pa - detail.ca),
    tier,
    dimension_scores: dimensionScores,
    top_attributes: topAttributes,
    weak_attributes: weakAttributes,
    all_attributes: Object.fromEntries(
      detail.attributes.map((a) => [a.name, a.value])
    ),
    position_fit: detail.positionFit,
    best_position: {
      position: detail.bestPosition || (bestPos?.[0] ?? "—"),
      fit: bestPos?.[1] ?? 80,
    },
    foot: detail.foot,
    height_cm: detail.heightCm,
    fminside_url: hit.url,
    fmi_matched: true,
    cached_at: Date.now(),
    source_collection: COLLECTION,
  };
}

/* ─── Main ─────────────────────────────────────────────────────── */
async function main() {
  console.log(`\n=== FMInside Cache Crawler ===`);
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Skip cached: ${SKIP_CACHED}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Limit: ${LIMIT || "all"}\n`);

  // 1. Read all players from Firestore
  console.log(`Reading players from ${COLLECTION}...`);
  const snap = await db.collection(COLLECTION).get();
  let players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`  Found ${players.length} players total.`);

  // Filter to players with a name
  players = players.filter((p) => p.fullName && p.fullName.trim().length >= 2);
  console.log(`  ${players.length} players with valid names.`);

  if (LIMIT > 0) {
    players = players.slice(0, LIMIT);
    console.log(`  Limited to ${players.length} players.`);
  }

  // 2. Optionally skip already-cached players
  let skipSet = new Set();
  if (SKIP_CACHED) {
    const cacheSnap = await db.collection(CACHE_COLLECTION).get();
    const now = Date.now();
    for (const doc of cacheSnap.docs) {
      const data = doc.data();
      if (data.cached_at && now - data.cached_at < CACHE_MAX_AGE_MS) {
        skipSet.add(doc.id);
      }
    }
    console.log(`  ${skipSet.size} players already cached (< 30 days).`);
  }

  // 3. Crawl each player
  let success = 0,
    notFound = 0,
    skipped = 0,
    errors = 0;

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const name = p.fullName.trim();
    const cacheKey = makeCacheKey(name);

    if (SKIP_CACHED && skipSet.has(cacheKey)) {
      skipped++;
      continue;
    }

    process.stdout.write(
      `  [${i + 1}/${players.length}] ${name} ... `
    );

    try {
      // Search — pass age for disambiguation
      const playerAge = p.age || "";
      let hit = await searchFmInside(name, playerAge);
      if (!hit) {
        // Try last name only
        const lastName = name.split(/\s+/).pop();
        if (lastName && lastName.length >= 3) {
          await sleep(1000);
          hit = await searchFmInside(lastName, playerAge);
        }
      }

      if (!hit) {
        console.log("NOT FOUND");
        notFound++;
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
        continue;
      }

      await sleep(1000); // Brief pause between search and detail

      // Fetch detail page
      const detail = await fetchPlayerDetail(hit.url, name);
      if (!detail || detail.ca === 0) {
        console.log(`NO DATA (ca=0) from ${hit.url}`);
        notFound++;
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
        continue;
      }

      // Build document
      const doc = buildFmDoc(hit, detail, name);
      console.log(`CA=${doc.ca} PA=${doc.pa} tier=${doc.tier}`);

      if (!DRY_RUN) {
        await db.collection(CACHE_COLLECTION).doc(cacheKey).set(doc, { merge: true });
      }
      success++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    await sleep(DELAY_BETWEEN_REQUESTS_MS);
  }

  console.log(`\n=== Done ===`);
  console.log(`  Success: ${success}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Skipped (cached): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total: ${players.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
