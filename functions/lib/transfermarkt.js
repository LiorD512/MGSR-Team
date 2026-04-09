/**
 * Transfermarkt scraping — Node.js port of Kotlin LatestReleases logic.
 * Uses Node built-in https + cheerio (no axios/undici to avoid Firebase deploy issues).
 */

const https = require("https");
const cheerio = require("cheerio");
const { makeAbsoluteUrl, TRANSFERMARKT_BASE_URL } = require("./utils");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildReleasesUrl(minValue, maxValue, page = 1) {
  return `${TRANSFERMARKT_BASE_URL}/transfers/neuestetransfers/statistik?land_id=0&wettbewerb_id=alle&minMarktwert=${minValue}&maxMarktwert=${maxValue}&plus=1&page=${page}`;
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const ua = getRandomUserAgent();
    const req = https.get(
      url,
      { headers: { "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9" } },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

/**
 * Fetch TM HTML — always through Render proxy when configured.
 * Direct fetch only used when proxy env vars are missing (local dev).
 */
async function fetchHtmlWithFallback(url) {
  const proxyUrl = process.env.SCOUT_TM_PROXY_URL;
  const secret = process.env.SCOUT_ENRICH_SECRET;

  if (proxyUrl && secret) {
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, url }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    return res.text();
  }

  // Fallback: direct fetch (local dev only)
  return fetchHtml(url);
}

async function fetchDocument(url) {
  const html = await fetchHtmlWithFallback(url);
  return cheerio.load(html);
}

const WITHOUT_CLUB_VARIANTS = new Set([
  "without club",
  "ohne verein",
  "sans club",
  "sin club",
  "senza squadra",
  "sem clube",
  "geen club",
  "bez klubu",
  "klubsuz",
  "free agent",
]);

function convertLongPositionToShort(pos) {
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
  return map[pos] || pos || "";
}

function isWithoutClub(row) {
  const tables = row.find("table.inline-table");
  if (tables.length < 3) return false;
  const newClubCell = tables.eq(2);
  const imgAlt = newClubCell.find("img").attr("alt")?.trim().toLowerCase() || "";
  const cellText = newClubCell.text().trim().toLowerCase();
  return [...WITHOUT_CLUB_VARIANTS].some(
    (v) => imgAlt.includes(v) || cellText.includes(v)
  );
}

function extractNationalityAndFlag(row) {
  let img = row.find("td.zentriert img[title]").first();
  if (!img.length) {
    const imgs = row.find("img[alt]");
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs.eq(i);
      const alt = el.attr("alt") || "";
      if (alt.length >= 2 && alt.length <= 50) {
        img = el;
        break;
      }
    }
  }
  if (!img.length) return [null, null];
  const nationality = (img.attr("title") || img.attr("alt") || "").trim() || null;
  let flagSrc = img.attr("data-src") || img.attr("src") || null;
  if (flagSrc) {
    flagSrc = makeAbsoluteUrl(flagSrc)
      .replace("verysmall", "head")
      .replace("tiny", "head");
  }
  return [nationality, flagSrc];
}

function parseTransferList($) {
  const rows = $("table.items")
    .find("tr.odd, tr.even")
    .filter((i, el) => isWithoutClub($(el)))
    .get();

  return rows.map((el) => {
    try {
      const row = $(el);
      const td = row.find("td");
      const tables = td.find("table.inline-table");
      const firstTable = tables.eq(0);
      const playerImage = firstTable
        .find("img")
        .attr("data-src")
        ?.replace("medium", "big") || "";
      const playerName = firstTable.find("img").attr("title") || "";
      const href = firstTable.find("a").attr("href") || "";
      const playerUrl = `https://www.transfermarkt.com${href}`;
      const positionText = firstTable.find("tr").eq(1).text().replace(/-/g, " ");
      const playerPosition = convertLongPositionToShort(positionText.trim());
      const zentriert = row.find("td.zentriert");
      const playerAge = zentriert.eq(0).text().trim();
      const transferDate = zentriert.eq(2).text().trim();
      const marketValue = row.find("td.rechts").eq(0).text().trim();
      const [playerNationality, playerNationalityFlag] = extractNationalityAndFlag(row);

      return {
        playerImage,
        playerName,
        playerUrl,
        playerPosition,
        playerAge,
        playerNationality,
        playerNationalityFlag,
        playerFoot: null,
        clubJoinedLogo: null,
        clubJoinedName: null,
        transferDate,
        marketValue,
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function getTotalPages($) {
  const paginationSelectors = [
    "div.pager li.tm-pagination__list-item",
    "li.tm-pagination__list-item",
    "ul.tm-pagination li",
    "div.pager li",
  ];
  for (const sel of paginationSelectors) {
    const nums = $(sel)
      .map((i, el) => parseInt($(el).text().trim(), 10))
      .get()
      .filter((n) => !isNaN(n));
    const max = Math.max(0, ...nums);
    if (max >= 1) return max;
  }
  const pageLinks = $("a[href*='page=']");
  let maxPage = 1;
  pageLinks.each((i, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/page=(\d+)/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > maxPage) maxPage = p;
    }
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
        const el = elements.eq(i);
        const text = (
          el.attr("title")?.trim() || el.text().trim()
        ).toLowerCase();
        if (
          text &&
          text.length < 80 &&
          !text.includes("transfermarkt")
        ) {
          clubName = text;
          break;
        }
      }
      if (clubName) break;
    }
    if (!clubName) {
      $("dt, span.info-table__content--bold, td").each((i, el) => {
        const label = $(el).text().trim().toLowerCase();
        if (
          label.includes("current club") ||
          label === "verein" ||
          label.includes("aktueller verein")
        ) {
          const link =
            $(el).next().find("a[href*='verein/']").first()[0] ||
            $(el).parent().find("a[href*='verein/']").first()[0];
          if (link) {
            const l = $(link);
            clubName = (l.attr("title")?.trim() || l.text().trim()).toLowerCase();
          }
        }
      });
    }
    if (
      clubName &&
      ![...WITHOUT_CLUB_VARIANTS].some((v) => clubName.includes(v))
    ) {
      return null;
    }
    let marketValue =
      model.marketValue?.trim() ||
      $("div.data-header__box--small")
        .text()
        .split("Last")[0]
        .trim() ||
      null;
    // Info-table Citizenship row has ALL citizenships; header itemprop only has primary
    const citizenshipLabel = $('span.info-table__content--regular').filter(function() {
      return $(this).text().trim().startsWith('Citizenship');
    });
    const citizenshipContent = citizenshipLabel.next('.info-table__content--bold');
    let nationalityEls = citizenshipContent.find('img');
    if (!nationalityEls.length) nationalityEls = $("[itemprop=nationality] img");
    const allNationalities = [];
    const allFlags = [];
    nationalityEls.each((_, el) => {
      const title = $(el).attr("title");
      if (title) allNationalities.push(title.trim());
      const src = $(el).attr("src");
      if (src) allFlags.push(src.replace("tiny", "head").replace("verysmall", "head"));
    });
    const nationality =
      model.playerNationality?.trim() ||
      allNationalities[0] ||
      null;
    let flagSrc =
      model.playerNationalityFlag?.trim() ||
      allFlags[0];
    const playerNationalityFlag = flagSrc ? makeAbsoluteUrl(flagSrc) : null;

    return {
      ...model,
      marketValue: marketValue || model.marketValue,
      playerNationality: nationality || model.playerNationality,
      playerNationalities: allNationalities.length ? allNationalities : (model.playerNationalities || []),
      playerNationalityFlag: playerNationalityFlag || model.playerNationalityFlag,
    };
  } catch (e) {
    return model;
  }
}

async function getLatestReleasesForRange(minValue, maxValue, forceEnrichAll = true) {
  const url = buildReleasesUrl(minValue, maxValue, 1);
  const $ = await fetchDocument(url);
  const pageCount = getTotalPages($);
  const all = [];

  const parsePage = async (page) => {
    const u = page === 1 ? url : buildReleasesUrl(minValue, maxValue, page);
    const $p = await fetchDocument(u);
    return parseTransferList($p);
  };

  const firstPage = await parsePage(1);
  for (const model of firstPage) {
    const needsEnrich =
      forceEnrichAll ||
      (!model.marketValue?.trim() || !model.playerNationality?.trim());
    if (needsEnrich && model.playerUrl) {
      const enriched = await enrichFromProfile(model);
      if (enriched) all.push(enriched);
    } else {
      all.push(model);
    }
  }

  for (let page = 2; page <= pageCount; page++) {
    const items = await parsePage(page);
    for (const model of items) {
      const needsEnrich =
        forceEnrichAll ||
        (!model.marketValue?.trim() || !model.playerNationality?.trim());
      if (needsEnrich && model.playerUrl) {
        const enriched = await enrichFromProfile(model);
        if (enriched) all.push(enriched);
      } else {
        all.push(model);
      }
    }
  }

  return all;
}

module.exports = {
  fetchDocument,
  getLatestReleasesForRange,
  buildReleasesUrl,
  TRANSFERMARKT_BASE_URL,
};
