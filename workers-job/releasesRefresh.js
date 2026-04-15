/**
 * ReleasesRefreshWorker — Cloud Run Job version.
 * Fetches releases (free agents) from Transfermarkt, detects new ones, writes FeedEvents.
 *
 * Uses shared tmFetch (impit) for browser-grade TLS fingerprinting that bypasses
 * TM's bot detection — the plain https.get approach used by the Cloud Function
 * and GitHub Actions versions stopped working when TM started serving empty pages.
 */

const { fetchDocument } = require("./lib/tmFetch");
const { javaHashCode, TRANSFERMARKT_BASE_URL } = require("./lib/utils");

const PLAYERS_TABLE = "Players";
const FEED_EVENTS_TABLE = "FeedEvents";
const WORKER_STATE_COLLECTION = "WorkerState";
const WORKER_RUNS_COLLECTION = "WorkerRuns";
const FEED_EVENT_TYPE = "NEW_RELEASE_FROM_CLUB";

const RELEASE_RANGES = [
  [125000, 250000],
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

const WITHOUT_CLUB_VARIANTS = [
  "without club", "ohne verein", "sans club", "sin club",
  "senza squadra", "sem clube", "geen club", "bez klubu",
  "klubsuz", "free agent",
];

function log(msg) {
  console.log(`[ReleasesRefresh] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function feedEventDocIdForRelease(playerTmProfile) {
  const profileHash = javaHashCode(playerTmProfile || "");
  return `${FEED_EVENT_TYPE}_${profileHash}`;
}

function makeAbsoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${TRANSFERMARKT_BASE_URL}${url}`;
  return url;
}

function convertPosition(pos) {
  const map = {
    Goalkeeper: "GK", "Left Back": "LB", "Centre Back": "CB", "Right Back": "RB",
    "Defensive Midfield": "DM", "Central Midfield": "CM", "Attacking Midfield": "AM",
    "Right Winger": "RW", "Left Winger": "LW", "Centre Forward": "CF",
    "Second Striker": "SS", "Left Midfield": "LM", "Right Midfield": "RM",
  };
  return map[pos] || pos || "";
}

function buildReleasesUrl(minValue, maxValue, page = 1) {
  return `${TRANSFERMARKT_BASE_URL}/transfers/neuestetransfers/statistik?land_id=0&wettbewerb_id=alle&minMarktwert=${minValue}&maxMarktwert=${maxValue}&plus=1&page=${page}`;
}

// ── HTML parsing ──

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
      const playerUrl = `${TRANSFERMARKT_BASE_URL}${href}`;
      const positionText = firstTable.find("tr").eq(1).text().replace(/-/g, " ").trim();
      const playerPosition = convertPosition(positionText);
      const zentriert = row.find("td.zentriert");
      const playerAge = zentriert.eq(0).text().trim();
      const transferDate = zentriert.eq(2).text().trim();
      const marketValue = row.find("td.rechts").eq(0).text().trim();
      const [playerNationality, playerNationalityFlag] = extractNationalityAndFlag($, row);

      return {
        playerImage, playerName, playerUrl, playerPosition,
        playerAge, playerNationality, playerNationalityFlag,
        transferDate, marketValue,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
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

async function enrichFromProfile(model) {
  try {
    const $ = await fetchDocument(model.playerUrl);
    const clubSelectors = [
      "span.data-header__club a",
      "span.data-header__club",
      "div.data-header a[href*='/startseite/verein/']",
      "div.info-table__content--bold a[href*='/startseite/verein/']",
    ];
    let clubName = "";
    for (const sel of clubSelectors) {
      const elements = $(sel);
      for (let i = 0; i < elements.length; i++) {
        const text = (elements.eq(i).attr("title")?.trim() || elements.eq(i).text().trim()).toLowerCase();
        if (text && text.length < 80 && !text.includes("transfermarkt")) { clubName = text; break; }
      }
      if (clubName) break;
    }
    // If player already signed for a new club, skip them
    if (clubName && !WITHOUT_CLUB_VARIANTS.some((v) => clubName.includes(v))) {
      return null;
    }

    const marketValue = model.marketValue?.trim() ||
      $("div.data-header__box--small").text().split("Last")[0].trim() || undefined;

    const citizenshipLabel = $("span.info-table__content--regular").filter(function () {
      return $(this).text().trim().startsWith("Citizenship");
    });
    const citizenshipContent = citizenshipLabel.next(".info-table__content--bold");
    let nationalityEls = citizenshipContent.find("img");
    if (!nationalityEls.length) nationalityEls = $("[itemprop=nationality] img");
    const allNationalities = [];
    const allFlags = [];
    nationalityEls.each((_, el) => {
      const title = $(el).attr("title");
      if (title) allNationalities.push(title.trim());
      const src = $(el).attr("src");
      if (src) allFlags.push(src.replace("tiny", "head").replace("verysmall", "head"));
    });

    return {
      ...model,
      marketValue: marketValue || model.marketValue,
      playerNationality: model.playerNationality?.trim() || allNationalities[0] || null,
      playerNationalities: allNationalities.length ? allNationalities : [],
      playerNationalityFlag: model.playerNationalityFlag?.trim() ||
        (allFlags[0] ? makeAbsoluteUrl(allFlags[0]) : null),
    };
  } catch {
    return model; // On error, keep the listing data as-is
  }
}

async function getReleasesForRange(minValue, maxValue) {
  const url = buildReleasesUrl(minValue, maxValue, 1);
  const $ = await fetchDocument(url);
  const pageCount = getTotalPages($);
  const all = [];

  const totalRows = $("table.items").find("tr.odd, tr.even").length;
  const hasItems = $("table.items").length;
  log(`  page 1: ${hasItems} table(s), ${totalRows} row(s), ${pageCount} page(s)`);

  const parsePage = async (page) => {
    const $p = page === 1 ? $ : await fetchDocument(buildReleasesUrl(minValue, maxValue, page));
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

// ── Firestore helpers ──

async function getKnownReleaseUrls(db) {
  const doc = await db.collection(WORKER_STATE_COLLECTION).doc("ReleasesRefreshWorker").get();
  const data = doc.exists ? doc.data() : {};
  const urls = data?.knownReleaseUrls || [];
  return new Set(Array.isArray(urls) ? urls : []);
}

async function saveKnownReleaseUrls(db, urls) {
  await db.collection(WORKER_STATE_COLLECTION).doc("ReleasesRefreshWorker").set({
    knownReleaseUrls: Array.from(urls),
    lastRefreshSuccess: Date.now(),
    updatedAt: Date.now(),
  }, { merge: true });
}

async function recordSuccess(db, summary, durationMs) {
  await db.collection(WORKER_RUNS_COLLECTION).doc("ReleasesRefreshWorker").set({
    workerName: "ReleasesRefreshWorker",
    status: "success",
    lastRunAt: Date.now(),
    durationMs,
    summary,
    error: null,
    updatedAt: Date.now(),
  }, { merge: true });
  log(`[WorkerRuns] SUCCESS — ${summary} (${durationMs}ms)`);
}

async function recordFailure(db, error, durationMs) {
  await db.collection(WORKER_RUNS_COLLECTION).doc("ReleasesRefreshWorker").set({
    workerName: "ReleasesRefreshWorker",
    status: "failed",
    lastRunAt: Date.now(),
    durationMs,
    summary: null,
    error: error?.message || String(error),
    updatedAt: Date.now(),
  }, { merge: true });
  log(`[WorkerRuns] FAILED — ${error?.message || error}`);
}

// ── Main ──

async function runReleasesRefresh(db) {
  const startTime = Date.now();

  try {
    log("Starting releases refresh");
    const feedRef = db.collection(FEED_EVENTS_TABLE);
    const playersRef = db.collection(PLAYERS_TABLE);

    const knownUrls = await getKnownReleaseUrls(db);
    log(`Previously known releases: ${knownUrls.size}`);

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
      }
      if (i < RELEASE_RANGES.length - 1) {
        await sleep(DELAY_BETWEEN_RANGES_MS);
      }
    }

    if (rangesFailed === RELEASE_RANGES.length) {
      const durationMs = Date.now() - startTime;
      const errMsg = `All ${RELEASE_RANGES.length} ranges failed — TM may be blocking`;
      log(errMsg);
      await recordFailure(db, new Error(errMsg), durationMs);
      process.exit(1);
    }

    // Deduplicate by URL
    const distinctByUrl = new Map();
    allReleases.forEach((r) => { if (r.playerUrl) distinctByUrl.set(r.playerUrl, r); });
    const distinctReleases = Array.from(distinctByUrl.values());
    const currentUrls = new Set(distinctReleases.map((r) => r.playerUrl).filter(Boolean));
    const newReleases = distinctReleases.filter((r) => !knownUrls.has(r.playerUrl || ""));

    log(`Total releases: ${distinctReleases.length}, new: ${newReleases.length}`);

    // Bootstrap: first run with empty knownUrls — save URLs without creating events
    const isBootstrap = knownUrls.size === 0 && distinctReleases.length > 50;
    if (isBootstrap) {
      log("Bootstrap mode: saving known URLs without creating events (first run)");
      await saveKnownReleaseUrls(db, currentUrls);
      const durationMs = Date.now() - startTime;
      await recordSuccess(db, `Bootstrap: ${currentUrls.size} URLs saved, no events created`, durationMs);
      return;
    }

    // Check which releases already have FeedEvents
    const newReleaseUrls = newReleases.map((r) => r.playerUrl).filter(Boolean);
    const alreadyHaveEvents = new Set();
    for (let i = 0; i < newReleaseUrls.length; i += 30) {
      const chunk = newReleaseUrls.slice(i, i + 30);
      const snapshot = await feedRef
        .where("type", "==", FEED_EVENT_TYPE)
        .where("playerTmProfile", "in", chunk)
        .get();
      snapshot.docs.forEach((d) => {
        const tm = d.get("playerTmProfile");
        if (tm) alreadyHaveEvents.add(tm);
      });
    }

    const releasesToCreate = newReleases.filter((r) => !alreadyHaveEvents.has(r.playerUrl || ""));
    log(`Already in feed: ${alreadyHaveEvents.size}, creating events for: ${releasesToCreate.length}`);

    // Batch player lookups (Firestore "in" max 30)
    const playersInDb = new Set();
    const urlsToCheck = releasesToCreate.map((r) => r.playerUrl).filter(Boolean);
    for (let i = 0; i < urlsToCheck.length; i += 30) {
      const chunk = urlsToCheck.slice(i, i + 30);
      const snapshot = await playersRef.where("tmProfile", "in", chunk).get();
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
          type: FEED_EVENT_TYPE,
          playerName: release.playerName || "Unknown",
          playerImage: release.playerImage || null,
          playerTmProfile: playerUrl,
          oldValue: null,
          newValue: "Without club",
          extraInfo: isInDatabase ? "IN_DATABASE" : "NOT_IN_DATABASE",
          timestamp: now,
        });
        log(`New release: ${release.playerName} (in DB: ${isInDatabase})`);
      } catch (err) {
        log(`Failed to write feed event for ${release.playerName}: ${err.message}`);
      }
    }

    await saveKnownReleaseUrls(db, currentUrls);

    const durationMs = Date.now() - startTime;
    const summary = `${releasesToCreate.length} new events, ${currentUrls.size} total known`;
    await recordSuccess(db, summary, durationMs);
    log(`Complete — ${summary} in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await recordFailure(db, err, durationMs);
    log(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

module.exports = { runReleasesRefresh };
