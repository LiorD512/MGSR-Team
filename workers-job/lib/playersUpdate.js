/**
 * PlayersUpdate — Node.js port of Kotlin PlayersUpdate.
 * Fetches a Transfermarkt player profile and extracts update values.
 */

const axios = require("axios");
const cheerio = require("cheerio");
const { TRANSFERMARKT_BASE_URL } = require("./utils");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchDocument(url) {
  const res = await axios.get(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept-Language": "en-US,en;q=0.9",
    },
    timeout: 12000,
    validateStatus: (s) => s === 200,
  });
  return cheerio.load(res.data);
}

const LOAN_FROM_UNTIL = /(?:on loan from|leihe von|ausgeliehen von)\s*:?\s*(.+?)\s+(?:contract|until|bis)/i;
const LOAN_FROM_EOL = /(?:on loan from|leihe von|ausgeliehen von)\s*:?\s*(.+?)(?:\s*$|\s*;)/i;

function detectLoanStatus($, clubName) {
  const ribbon =
    $("div.data-header_ribbon, div.data-header__ribbon").first()[0] ||
    $("div[class*='ribbon']").first()[0];
  const ribbonLinkTitleRaw = ribbon
    ? $(ribbon).find("a").first().attr("title") || ""
    : $("a[title*='on loan from']").first().attr("title") || "";
  const ribbonText = ribbon ? $(ribbon).text().trim().toLowerCase() : "";
  const clubSectionText = $("span.data-header__club, div.data-header__club-info").text().toLowerCase();
  const infoBoxText = $("div.data-header__info-box").text().toLowerCase();
  const headerText = $("div.data-header").text().toLowerCase();
  const combined = `${ribbonLinkTitleRaw} ${ribbonText} ${clubSectionText} ${infoBoxText} ${headerText}`.toLowerCase();

  const hasLoanIndicator =
    ribbonLinkTitleRaw.toLowerCase().includes("on loan from") ||
    combined.includes("on loan") ||
    combined.includes("leihe") ||
    combined.includes("ausgeliehen") ||
    combined.includes("leihe von") ||
    combined.includes("ausgeliehen von") ||
    combined.includes("prêt") ||
    combined.includes("en préstamo") ||
    combined.includes("in prestito") ||
    (combined.includes("loan") &&
      !combined.includes("end of loan") &&
      !combined.includes("loan return") &&
      !combined.includes("loan spell"));
  const isReturnee =
    combined.includes("returnee") || combined.includes("returned after loan");
  const isOnLoan = hasLoanIndicator && !isReturnee;

  let onLoanFromClub = null;
  if (isOnLoan) {
    const headerTextRaw = $("div.data-header").text();
    const infoBoxTextRaw = $("div.data-header__info-box").text();
    const searchText = ribbonLinkTitleRaw || headerTextRaw || infoBoxTextRaw;
    const m1 = LOAN_FROM_UNTIL.exec(searchText);
    const m2 = LOAN_FROM_EOL.exec(searchText);
    onLoanFromClub =
      (m1 && m1[1]?.trim()) ||
      (m2 && m2[1]?.trim()) ||
      null;
    if (!onLoanFromClub) {
      const vereinLinks = $("div.data-header a[href*='/verein/']");
      vereinLinks.each((i, el) => {
        const $el = $(el);
        const title = $el.attr("title")?.trim();
        const text = $el.text().trim();
        const val = title || text;
        if (val && val !== clubName) onLoanFromClub = val;
        return !onLoanFromClub;
      });
    }
  }

  return { isOnLoan, onLoanFromClub };
}

const FOOT_REGEX = /(?:Foot|Fuss|Preferred\s+foot)\s*:?\s*(\w+)/i;
const VALID_FOOT = new Set(["left", "right", "both", "links", "rechts", "beide", "l", "r", "b"]);

function extractFoot($) {
  let result = null;
  $("span.info-table__content--regular").each((i, el) => {
    const label = $(el).text().trim().toLowerCase();
    if (label.includes("foot") || label.includes("fuss")) {
      const next = $(el).next();
      const val = next.text().trim().toLowerCase();
      if (val && (VALID_FOOT.has(val) || val.startsWith("left") || val.startsWith("right"))) {
        if (val.startsWith("left") || val === "l") result = "Left";
        else if (val.startsWith("right") || val === "r") result = "Right";
        else if (val.includes("both") || val === "b") result = "Both";
        else result = val;
        return false;
      }
    }
  });
  if (result) return result;
  const bodyText = $("body").text();
  const m = FOOT_REGEX.exec(bodyText);
  if (m && m[1]) {
    const v = m[1].toLowerCase();
    if (VALID_FOOT.has(v) || v.startsWith("left") || v.startsWith("right")) {
      if (v.startsWith("left")) return "Left";
      if (v.startsWith("right")) return "Right";
      return "Both";
    }
  }
  return null;
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

async function updatePlayerByTmProfile(tmProfile) {
  const url = (tmProfile || "").trim();
  if (!url) return { success: false, error: "Profile URL is null or blank" };

  try {
    const $ = await fetchDocument(url);

    // Info-table Citizenship row has ALL citizenships; header itemprop only has primary
    const citizenshipLabel = $('span.info-table__content--regular').filter(function() {
      return $(this).text().trim().startsWith('Citizenship');
    });
    const citizenshipContent = citizenshipLabel.next('.info-table__content--bold');
    let natEls = citizenshipContent.find('img');
    if (!natEls.length) natEls = $("[itemprop=nationality] img");
    const citizenships = [];
    const citizenshipFlags = [];
    natEls.each((_, el) => {
      const title = $(el).attr("title");
      if (title) citizenships.push(title);
      let src = $(el).attr("src") || "";
      if (src) citizenshipFlags.push(src.replace("tiny", "head").replace("verysmall", "head"));
    });
    const citizenship = citizenships[0] || "";
    let flag = citizenshipFlags[0] || "";

    const contractText = $("span.data-header__label").text();
    const contract = contractText.split(":").pop()?.trim() || "";

    const playerImage =
      $("div.data-header__profile-container img").first().attr("src") || "";

    const marketValueBox = $("div.data-header__box--small").text();
    const marketValue = marketValueBox.split("Last")[0].trim();

    const positionsList = [];
    $("div.detail-position__box dd").each((i, el) => {
      const t = $(el).text().replace(/-/g, " ").trim();
      if (t) positionsList.push(convertPosition(t));
    });
    if (positionsList.length === 0) {
      const fallback = $("div.data-header__info-box ul.data-header__items").eq(1).text();
      const p = fallback.split(":").pop()?.trim();
      if (p) positionsList.push(convertPosition(p));
    }

    const birthEl = $("span[itemprop=birthDate]").first().text();
    const age = birthEl ? birthEl.replace(/.*\(([^)]+)\).*/, "$1") : "";

    const clubLink = $("span.data-header__club a");
    const clubName = clubLink.attr("title") || "";
    const clubLogoEl = $("div.data-header__box--big img").first().attr("srcset") || "";
    const clubLogo = clubLogoEl.split("1x")[0].trim();
    const clubHref = clubLink.attr("href") || "";
    const clubTmProfile = clubHref.startsWith("http") ? clubHref : TRANSFERMARKT_BASE_URL + clubHref;
    const clubCountry = $("div.data-header__club-info span.data-header__label img").attr("title") || "";

    const loanInfo = detectLoanStatus($, clubName);
    const foot = extractFoot($);

    let agency = null;
    let agencyUrl = null;
    $("span.info-table__content--regular").each((i, el) => {
      const label = $(el).text().trim().toLowerCase();
      if (label.includes("player agent") || label.includes("agent")) {
        const next = $(el).next();
        const link = next.find("a").first();
        agency = link.text().trim() || next.text().trim();
        const href = link.attr("href");
        if (href) {
          agencyUrl = href.startsWith("http") ? href : TRANSFERMARKT_BASE_URL + href;
        }
      }
    });

    return {
      success: true,
      data: {
        marketValue,
        profileImage: playerImage,
        nationalityFlag: flag,
        citizenship,
        citizenships,
        citizenshipFlags,
        age,
        contract,
        positions: positionsList,
        currentClub: {
          clubName,
          clubLogo,
          clubTmProfile,
          clubCountry,
        },
        isOnLoan: loanInfo.isOnLoan,
        onLoanFromClub: loanInfo.onLoanFromClub,
        foot,
        agency,
        agencyUrl,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}

module.exports = { updatePlayerByTmProfile };
