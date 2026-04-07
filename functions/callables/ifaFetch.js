/**
 * IFA (football.org.il) player profile fetch — Cloud Function.
 * Replaces Playwright on Render server for fetching IFA profiles.
 * Uses cheerio for HTML parsing (same logic as mgsr-web/src/lib/ifa.ts).
 *
 * Note: football.org.il uses Cloudflare that hard-blocks datacenter IPs.
 * A headless browser does NOT help — it's IP-based, not JS-challenge-based.
 * This function tries direct fetch + multiple proxy fallbacks.
 */

const cheerio = require("cheerio");

const IFA_BASE = "https://www.football.org.il";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getIfaHeaders(ua) {
  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": `${IFA_BASE}/`,
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
  };
}

/** Fetch HTML from football.org.il with retries + proxy fallbacks */
async function fetchIfaHtml(url) {
  // Strategy 1: Direct fetch with browser-like headers
  const ua = getRandomUA();
  const controller1 = new AbortController();
  const t1 = setTimeout(() => controller1.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: getIfaHeaders(ua),
      signal: controller1.signal,
    });
    clearTimeout(t1);
    if (res.ok) return await res.text();

    if (res.status === 403) {
      // Retry with different UA
      const ua2 = USER_AGENTS.find((a) => a !== ua) || ua;
      const controller2 = new AbortController();
      const t2 = setTimeout(() => controller2.abort(), 15000);
      try {
        const res2 = await fetch(url, {
          headers: getIfaHeaders(ua2),
          signal: controller2.signal,
        });
        clearTimeout(t2);
        if (res2.ok) return await res2.text();
      } catch { clearTimeout(t2); }

      // Proxy fallback: AllOrigins
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const controller3 = new AbortController();
      const t3 = setTimeout(() => controller3.abort(), 20000);
      try {
        const res3 = await fetch(proxyUrl, { signal: controller3.signal });
        clearTimeout(t3);
        if (res3.ok) {
          const text = await res3.text();
          if (text.includes("player_id") || text.includes("football.org.il")) {
            return text;
          }
        }
      } catch { clearTimeout(t3); }

      // Proxy fallback 2: corsproxy.io
      try {
        const proxyUrl2 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const controller4 = new AbortController();
        const t4 = setTimeout(() => controller4.abort(), 20000);
        const res4 = await fetch(proxyUrl2, { signal: controller4.signal });
        clearTimeout(t4);
        if (res4.ok) {
          const text = await res4.text();
          if (text.includes("player_id") || text.includes("football.org.il")) {
            return text;
          }
        }
      } catch { /* ignore */ }
    }

    throw new Error(`IFA HTTP ${res.status}`);
  } catch (err) {
    clearTimeout(t1);
    if (err.name === "AbortError") throw new Error("IFA fetch timeout");
    throw err;
  }
}

const POS_MAP = {
  "שוער": "GK", "בלם מרכזי": "CB", "מגן ימני": "RB", "מגן שמאלי": "LB",
  "קשר הגנתי": "DM", "קשר מרכזי": "CM", "קשר התקפי": "AM",
  "כנף ימני": "RW", "כנף שמאלי": "LW", "חלוץ מרכזי": "CF", "חלוץ": "ST",
  "חלוץ משני": "SS", "בלם": "CB", "מגן": "CB", "קשר": "CM", "כנף": "RW",
};

function mapHebrewPosition(raw) {
  const lower = (raw || "").trim();
  if (POS_MAP[lower]) return [POS_MAP[lower]];
  const positions = [];
  for (const [he, code] of Object.entries(POS_MAP)) {
    if (lower.includes(he) && !positions.includes(code)) positions.push(code);
  }
  return positions.length > 0 ? positions : [raw];
}

/** Parse IFA profile HTML with cheerio — mirrors ifa.ts parseIFAProfile */
function parseIFAProfile(html, url) {
  const $ = cheerio.load(html);
  const profile = { fullName: "", ifaUrl: url };

  const pidMatch = url.match(/player_id=(\d+)/);
  if (pidMatch) profile.ifaPlayerId = pidMatch[1];

  // Name
  const cardTitle = $(".new-player-card_title").first().text().trim();
  const h1 = cardTitle || $("h1").first().text().trim();
  if (h1) {
    profile.fullNameHe = h1;
    const parts = h1.split(/\s*[-–]\s*/);
    const hePart = parts.find((p) => /[\u0590-\u05FF]/.test(p));
    const enPart = parts.find((p) => /^[A-Za-z\s]+$/.test(p.trim()));
    if (hePart) profile.fullNameHe = hePart.trim();
    if (enPart) profile.fullName = enPart.trim();
    else profile.fullName = h1;
  }

  if (!profile.fullName || profile.fullName === "") {
    const nameEl = $(".player-name, .player-header-name").first().text().trim();
    if (nameEl) {
      profile.fullName = nameEl;
      if (/[\u0590-\u05FF]/.test(nameEl)) profile.fullNameHe = nameEl;
    }
  }

  // Image
  const imgSrc =
    $(".new-player-card_img-container img").first().attr("src") ||
    $(".player-image img, .player-photo img, .player-header img").first().attr("src");
  if (imgSrc && imgSrc.trim()) {
    profile.profileImage = imgSrc.startsWith("http") ? imgSrc : `${IFA_BASE}${imgSrc}`;
  }

  // Structured data list
  $(".new-player-card_data-list li").each(function () {
    const text = $(this).text().trim();
    const dobMatch = text.match(/תאריך לידה[:\s]*(\d{1,2}\/\d{4}|\d{1,2}[./]\d{1,2}[./]\d{4})/);
    if (dobMatch) {
      profile.dateOfBirth = dobMatch[1];
      const slashParts = dobMatch[1].split("/");
      if (slashParts.length === 2) {
        profile.age = String(new Date().getFullYear() - parseInt(slashParts[1], 10));
      } else if (slashParts.length === 3) {
        profile.age = String(new Date().getFullYear() - parseInt(slashParts[2], 10));
      }
    }
    const natMatch = text.match(/אזרחות[:\s]*(.+)/);
    if (natMatch) profile.nationality = natMatch[1].trim();
  });

  // Fallback: regex on body text
  const infoText = $("body").text();

  if (!profile.dateOfBirth) {
    const dobMatch =
      infoText.match(/תאריך לידה[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})/) ||
      infoText.match(/תאריך לידה[:\s]*(\d{1,2}\/\d{4})/);
    if (dobMatch) {
      profile.dateOfBirth = dobMatch[1];
      const parts = dobMatch[1].split(/[./]/);
      if (parts.length >= 2) {
        profile.age = String(new Date().getFullYear() - parseInt(parts[parts.length - 1], 10));
      }
    }
  }

  if (!profile.nationality) {
    const natMatch = infoText.match(/אזרחות[:\s]*([^\n,]+)/);
    if (natMatch) profile.nationality = natMatch[1].trim();
  }

  // Club
  const teamSpan = $(".new-player-data_title .js-container-title span, .new-player-data_title span").first().text().trim();
  if (teamSpan) profile.currentClub = teamSpan;
  if (!profile.currentClub) {
    const clubMatch = infoText.match(/קבוצה[:\s]*([^\n,]+)/);
    if (clubMatch) profile.currentClub = clubMatch[1].trim();
  }

  // Academy / Division
  const divMatch = infoText.match(/מחלקה[:\s]*([^\n,]+)/) || infoText.match(/מסגרת[:\s]*([^\n,]+)/);
  if (divMatch) profile.academy = divMatch[1].trim();

  // Position
  const posMatch = infoText.match(/תפקיד[:\s]*([^\n,]+)/) || infoText.match(/עמדה[:\s]*([^\n,]+)/);
  if (posMatch) profile.positions = mapHebrewPosition(posMatch[1].trim());

  // Foot
  const footMatch = infoText.match(/רגל[:\s]*(ימין|שמאל|שתיים)/);
  if (footMatch) {
    const map = { "ימין": "Right", "שמאל": "Left", "שתיים": "Both" };
    profile.foot = map[footMatch[1]] || footMatch[1];
  }

  // Height
  const heightMatch = infoText.match(/גובה[:\s]*(\d{2,3})/);
  if (heightMatch) profile.height = `${heightMatch[1]} cm`;

  // Stats table
  const stats = {};
  const statsTable = $("table").filter(function () {
    return $(this).text().includes("משחקים") || $(this).text().includes("שערים");
  }).first();
  if (statsTable.length) {
    const cells = statsTable.find("tr").eq(1).find("td");
    if (cells.length >= 3) {
      stats.matches = parseInt(cells.eq(0).text().trim(), 10) || 0;
      stats.goals = parseInt(cells.eq(1).text().trim(), 10) || 0;
      stats.assists = parseInt(cells.eq(2).text().trim(), 10) || 0;
      if (cells.length >= 4) stats.yellowCards = parseInt(cells.eq(3).text().trim(), 10) || 0;
      if (cells.length >= 5) stats.redCards = parseInt(cells.eq(4).text().trim(), 10) || 0;
    }
  }
  if (!stats.matches) {
    const m = infoText.match(/משחקים[:\s]*(\d+)/);
    const g = infoText.match(/שערים[:\s]*(\d+)/);
    const a = infoText.match(/בישולים[:\s]*(\d+)/) || infoText.match(/מסירות מכריעות[:\s]*(\d+)/);
    if (m) stats.matches = parseInt(m[1], 10);
    if (g) stats.goals = parseInt(g[1], 10);
    if (a) stats.assists = parseInt(a[1], 10);
  }
  if (stats.matches || stats.goals) profile.stats = stats;

  return profile;
}

/**
 * Cloud Function: Fetch and parse an IFA player profile.
 * Called from Vercel route /api/youth-players/fetch-profile.
 */
async function ifaFetchProfile(req) {
  const url = (req.data && req.data.url) || "";
  if (!url || !url.includes("football.org.il") || !url.includes("player_id=")) {
    const { HttpsError } = require("firebase-functions/v2/https");
    throw new HttpsError("invalid-argument", "Invalid IFA profile URL");
  }

  // Normalize: strip /en/ prefix for reliable Hebrew scraping
  const normalized = url.replace("football.org.il/en/players/", "football.org.il/players/");

  console.log(`[ifaFetchProfile] Fetching: ${normalized}`);
  const html = await fetchIfaHtml(normalized);
  const profile = parseIFAProfile(html, normalized);
  console.log(`[ifaFetchProfile] Parsed: ${profile.fullName || profile.fullNameHe || "unknown"}`);
  return profile;
}

module.exports = { ifaFetchProfile };
