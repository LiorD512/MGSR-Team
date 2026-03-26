/**
 * PlaymakerStats scraping logic.
 * Extracts career stats, match ratings, transfer history, and profile data.
 * Same pattern as transfermarkt.ts — cheerio-based server-side HTML parsing.
 */
import * as cheerio from 'cheerio';

const PM_BASE = 'https://www.playmakerstats.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const FETCH_TIMEOUT_MS = 30_000;

/** Render backend with Playwright — bypasses Cloudflare JS challenges */
const SCOUT_SERVER_URL =
  (process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com').trim();

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Direct fetch — works from local dev, blocked by Cloudflare on Vercel */
async function fetchPmHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': getRandomUA(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  // Detect Cloudflare challenge page
  if (text.includes('Just a moment') && text.includes('cf_chl')) {
    throw new Error('Cloudflare challenge detected');
  }
  return text;
}

/** Fetch via Render backend Playwright proxy — bypasses Cloudflare */
async function fetchViaBackendProxy(url: string): Promise<string> {
  const proxyUrl = `${SCOUT_SERVER_URL}/api/playmakerstats/html?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    signal: AbortSignal.timeout(45_000), // Playwright needs more time
  });
  if (!res.ok) throw new Error(`Backend proxy HTTP ${res.status}`);
  const text = await res.text();
  if (text.includes('Just a moment') && text.includes('cf_chl')) {
    throw new Error('Cloudflare challenge on proxy');
  }
  return text;
}

async function fetchWithRetry(url: string, maxRetries = 2): Promise<string> {
  let lastErr: Error | undefined;
  // Try direct fetch first (fast, works locally)
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchPmHtml(url);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // Fallback: Render backend Playwright proxy (bypasses Cloudflare)
  try {
    return await fetchViaBackendProxy(url);
  } catch {
    /* proxy also failed — throw original error */
  }
  throw lastErr;
}

/* ── Types ── */

export interface PmMatchRating {
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  result: 'W' | 'D' | 'L';
  rating: number | null;
  minutes?: string;
}

export interface PmCareerSeason {
  season: string;
  club: string;
  games: number | null;
  goals: number | null;
  assists: number | null;
  isLoan: boolean;
}

export interface PmTransfer {
  season: string;
  club: string;
  country: string;
  type: string;
}

export interface PmMarketValueEntry {
  date: string;
  club: string;
  value: string;
  valueEuro: number;
}

export interface PmPlayerData {
  found: true;
  pmUrl: string;
  fullName: string;
  dateOfBirth: string | null;
  age: number | null;
  nationality: string | null;
  position: string | null;
  subPositions: string[];
  preferredFoot: string | null;
  height: string | null;
  weight: string | null;
  currentClub: string | null;
  marketValue: string | null;
  profileImage: string | null;
  careerTotals: {
    games: number;
    goals: number;
    assists: number;
    goalsPerGame: number;
    starts: number;
  };
  careerSeasons: PmCareerSeason[];
  matchRatings: PmMatchRating[];
  averageRating: number | null;
  ratingCount: number;
  transfers: PmTransfer[];
  marketValueHistory: PmMarketValueEntry[];
  nationalTeam: {
    country: string | null;
    caps: number;
    goals: number;
  };
  isWomen: boolean;
}

export interface PmPlayerNotFound {
  found: false;
  message: string;
}

export type PmPlayerResult = PmPlayerData | PmPlayerNotFound;

/* ── Helpers ── */

function parseEuroValue(text: string): number {
  const clean = text.replace(/\s/g, '').toLowerCase();
  const match = clean.match(/([\d.,]+)\s*(m|k)?\s*€/);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(',', '.'));
  if (match[2] === 'm') return num * 1_000_000;
  if (match[2] === 'k') return num * 1_000;
  return num;
}

function normalizeResult(text: string): 'W' | 'D' | 'L' {
  const t = text.trim().toUpperCase();
  if (t === 'W') return 'W';
  if (t === 'D') return 'D';
  return 'L';
}

/* ── Search by name ── */

export async function searchPlayer(name: string): Promise<{ url: string; name: string; id: string }[]> {
  const encoded = encodeURIComponent(name.trim());
  const url = `${PM_BASE}/pesquisa?search_txt=${encoded}`;
  const html = await fetchWithRetry(url);
  const $ = cheerio.load(html);

  const results: { url: string; name: string; id: string }[] = [];

  // Search results are in .zz-search-item.player divs
  $('.zz-search-item.player').each((_, el) => {
    const dataId = $(el).attr('data-id') || '';
    const titleLink = $(el).find('a.title');
    const href = titleLink.attr('href') || '';
    const playerName = titleLink.text().replace(/^\d+/, '').trim();
    if (!href || !playerName || !dataId) return;
    const full = href.startsWith('http') ? href : PM_BASE + href.replace(/\?search=1$/, '');
    results.push({ url: full, name: playerName, id: dataId });
  });

  return results;
}

/* ── Main player scraper ── */

export async function scrapePlayer(urlOrSlug: string): Promise<PmPlayerResult> {
  let url = urlOrSlug.trim();
  if (!url) return { found: false, message: 'Missing URL' };
  if (!url.startsWith('http')) {
    url = url.startsWith('/') ? PM_BASE + url : PM_BASE + '/player/' + url;
  }

  try {
    const html = await fetchWithRetry(url);
    const $ = cheerio.load(html);
    const bodyHtml = $('body').html() || '';

    /* ── Structured data from JSON-LD ── */
    let jsonLd: Record<string, string> = {};
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html() || '{}');
        if (parsed['@type'] === 'Person') jsonLd = parsed;
      } catch { /* skip malformed JSON-LD */ }
    });

    /* ── Profile basics from header ── */
    const h1 = $('h1').first();
    const fullName = h1.find('.name').text().replace(/^\d+\.?\s*/, '').trim() || jsonLd.name || '';
    if (!fullName) return { found: false, message: 'Player page not found or empty' };

    // Age from header info
    let age: number | null = null;
    const ageMatch = bodyHtml.match(/(\d{1,2})\s*-yrs-old/i);
    if (ageMatch) age = parseInt(ageMatch[1], 10);

    // Position from header info
    let position: string | null = null;
    const headerInfo = $('.zz-enthdr-info .info').text();
    const posMatch = headerInfo.match(/(?:Forward|Midfielder|Defender|Goalkeeper|Striker)/i);
    if (posMatch) position = posMatch[0];

    // Market value from hero header (.value span)
    let marketValue: string | null = null;
    const mvEl = $('div.value span').filter((_, el) => {
      const style = $(el).attr('style') || '';
      return style.includes('color:white') || style.includes('color: white');
    }).first();
    if (mvEl.length) {
      marketValue = mvEl.text().trim() || null;
    }

    // Profile image
    let profileImage: string | null = null;
    const heroImg = $('.zz-enthdr-media img, .zz-likeheader-wrapper img').first();
    if (heroImg.length) {
      const src = heroImg.attr('src') || '';
      profileImage = src.startsWith('http') ? src : PM_BASE + src;
    }

    // Current club from header
    const currentClub = $('.zz-enthdr-club span').first().text().trim() || null;

    /* ── Bio panel (.card-data.bio) ── */
    const bioLabels = new Map<string, string>();
    $('.card-data.bio .card-data__row').each((_, row) => {
      const label = $(row).find('.card-data__label').text().trim().toLowerCase();
      // Use first .card-data__value only (some rows have multiple for dual nationality etc.)
      const value = $(row).find('.card-data__value').first().text().trim();
      if (label && value) bioLabels.set(label, value);
    });

    // DOB from bio or JSON-LD
    let dateOfBirth = bioLabels.get('date of birth')?.replace(/\s*\(.*\)/, '').trim() || jsonLd.birthDate || null;

    // Nationality
    let nationality: string | null = null;
    const natRow = bioLabels.get('nationality / dual nationality') || bioLabels.get('nationality');
    if (natRow) nationality = natRow.split(/\n/)[0].trim();
    else nationality = jsonLd.nationality || null;

    // Preferred foot
    const preferredFoot = bioLabels.get('preferred foot') || null;

    // Height / Weight
    let height: string | null = jsonLd.height || null;
    let weight: string | null = jsonLd.weight || null;
    const hwStr = bioLabels.get('height / weight');
    if (hwStr) {
      const parts = hwStr.split('/').map((s) => s.trim());
      height = parts[0] || height;
      weight = parts[1] || weight;
    }

    // Position from bio
    const subPositions: string[] = [];
    const bioPos = bioLabels.get('position');
    if (bioPos) {
      subPositions.push(...bioPos.split(/[,\n]/).map((s) => s.trim()).filter(Boolean));
      if (!position) position = subPositions[0] || null;
    }

    // Detect women
    const isWomen = /Women|Feminino|Femmes|Frauen/i.test(bodyHtml);

    // National team from bio
    let ntCountry = nationality;
    let ntCaps = 0;
    let ntGoals = 0;
    const capsStr = bioLabels.get('caps');
    if (capsStr) {
      const capsMatch = capsStr.match(/(\d+)\s*Matches?\s*Played/i);
      const goalsMatch = capsStr.match(/(\d+)\s*Goals/i);
      if (capsMatch) ntCaps = parseInt(capsMatch[1]);
      if (goalsMatch) ntGoals = parseInt(goalsMatch[1]);
    }

    /* ── Season summary (games_totals_hp) ── */
    let totalGames = 0, totalGoals = 0, totalAssists = 0, totalStarts = 0;
    const summaryNums = $('.games_totals_hp .fl-c');
    summaryNums.each((_, el) => {
      const num = parseInt($(el).find('.number').text().trim());
      const label = $(el).find('.label').text().trim().toLowerCase();
      if (isNaN(num)) return;
      if (label.includes('game')) totalGames = num;
      else if (label.includes('goal')) totalGoals = num;
      else if (label.includes('assist')) totalAssists = num;
    });

    /* ── Stats table (zztable stats) — season breakdown ── */
    const careerSeasons: PmCareerSeason[] = [];
    const summaryTable = $('table.zztable.stats').first();
    summaryTable.find('tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const isTotal = $(row).find('td.totals').length > 0;
      if (isTotal) {
        // Parse totals row for assist count if available
        const totalsCells = cells.toArray().map((c) => $(c).text().trim());
        // totals format: [label, G, M, GS, AST]
        const numCells = totalsCells.filter((t) => /^\d+$/.test(t));
        if (numCells.length >= 4) {
          totalAssists = parseInt(numCells[3]) || totalAssists;
        }
        return;
      }
      const compLink = $(row).find('.micrologo_and_text .text a');
      const compName = compLink.text().trim();
      const cellTexts = cells.toArray().map((c) => $(c).text().trim());
      // Format: [competition, G, M, GS, AST]
      const gIdx = 1; // Games column
      const gsIdx = 3; // Goals scored
      const astIdx = 4; // Assists
      if (compName) {
        careerSeasons.push({
          season: $('select#epoca_id option[selected]').text().trim() || '',
          club: compName,
          games: parseInt(cellTexts[gIdx]) || null,
          goals: parseInt(cellTexts[gsIdx]) || null,
          assists: cellTexts[astIdx] ? (parseInt(cellTexts[astIdx]) || null) : null,
          isLoan: false,
        });
      }
    });

    /* ── Match ratings from Games table ── */
    const matchRatings: PmMatchRating[] = [];
    // Games section: each row has sign (W/D/L), date, competition, home, logo, score, logo, away, icons, minutes, rating
    $('table.zztable.stats').each((_, table) => {
      const $table = $(table);
      // Only parse the "Games" table (the one with .sign divs)
      if ($table.find('.sign').length === 0) return;
      $table.find('tbody tr').each((__, row) => {
        const cells = $(row).find('td');
        if (cells.length < 8) return;

        // Result from .sign div
        const signDiv = $(row).find('.sign');
        if (!signDiv.length) return;
        const signText = signDiv.text().trim().toUpperCase();
        let result: 'W' | 'D' | 'L' = 'D';
        if (signText === 'W' || signText === 'V') result = 'W';
        else if (signText === 'L' || signText === 'D') result = signText === 'D' ? 'D' : 'L';
        if (signDiv.hasClass('win')) result = 'W';
        else if (signDiv.hasClass('lost')) result = 'L';
        else if (signDiv.hasClass('draw')) result = 'D';

        // Date (cell index 1)
        const dateStr = cells.eq(1).text().trim();

        // Home team (td.text.home a)
        const homeLink = $(row).find('td.text.home a, td.home a');
        const awayLink = $(row).find('td.text.away a, td.away a');
        const homeTeam = homeLink.last().text().trim();
        const awayTeam = awayLink.last().text().trim();

        // Score from td.result a
        const scoreLink = $(row).find('td.result a');
        const score = scoreLink.text().trim();

        // Rating from last span with background color
        let rating: number | null = null;
        $(row).find('span').each((___, span) => {
          const style = $(span).attr('style') || '';
          if (style.includes('background:#') || style.includes('background:rgb')) {
            const text = $(span).text().trim();
            const parsed = parseFloat(text);
            if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
              rating = parsed;
            }
          }
        });

        // Minutes
        let minutes: string | undefined;
        $(row).find('td.right').each((___, td) => {
          const text = $(td).text().trim();
          if (/\d+'?$/.test(text) && !text.includes('.')) {
            minutes = text;
          }
        });

        if (dateStr && (homeTeam || awayTeam)) {
          matchRatings.push({ date: dateStr, homeTeam, awayTeam, score, result, rating, minutes });
        }
      });
    });

    // Calculate average rating
    const rated = matchRatings.filter((m) => m.rating !== null);
    const averageRating = rated.length > 0
      ? Math.round((rated.reduce((s, m) => s + m.rating!, 0) / rated.length) * 10) / 10
      : null;

    const goalsPerGame = totalGames > 0 ? Math.round((totalGoals / totalGames) * 100) / 100 : 0;

    /* ── Transfers: not on main page, skipped for now (career sub-page) ── */
    const transfers: PmTransfer[] = [];

    /* ── Market value history: not on main page, needs sub-page ── */
    const marketValueHistory: PmMarketValueEntry[] = [];

    return {
      found: true,
      pmUrl: url,
      fullName,
      dateOfBirth,
      age,
      nationality,
      position,
      subPositions,
      preferredFoot,
      height,
      weight,
      currentClub,
      marketValue,
      profileImage,
      careerTotals: {
        games: totalGames,
        goals: totalGoals,
        assists: totalAssists,
        goalsPerGame,
        starts: totalStarts,
      },
      careerSeasons,
      matchRatings,
      averageRating,
      ratingCount: rated.length,
      transfers,
      marketValueHistory,
      nationalTeam: { country: ntCountry, caps: ntCaps, goals: ntGoals },
      isWomen,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { found: false, message: `Failed to scrape PlaymakerStats: ${msg}` };
  }
}

/**
 * Scrape the market-value sub-page for richer history data.
 * Call this separately if main page MV history is sparse.
 */
export async function scrapeMarketValueHistory(playerUrl: string): Promise<PmMarketValueEntry[]> {
  const mvUrl = playerUrl.replace(/\/$/, '') + '/market-value';
  try {
    const html = await fetchWithRetry(mvUrl);
    const $ = cheerio.load(html);
    const entries: PmMarketValueEntry[] = [];

    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;
      const cellTexts = cells.toArray().map((c) => $(c).text().trim());
      const dateStr = cellTexts[0] || '';
      const club = cellTexts[1] || cellTexts[2] || '';
      const valueStr = cellTexts[cellTexts.length - 1] || '';
      if (dateStr && /\d/.test(valueStr)) {
        entries.push({ date: dateStr, club, value: valueStr, valueEuro: parseEuroValue(valueStr) });
      }
    });

    return entries;
  } catch {
    return [];
  }
}

/**
 * Scrape the /results sub-page for full match-by-match data with ratings.
 * The main player page only shows ~5 recent games — the results page has ALL.
 *
 * Row structure:
 *   <td class="form"><div class="sign win/lost/draw">W/L/D</div></td>
 *   <td>YYYY/MM/DD</td>                        — date
 *   <td> competition micrologo </td>             — comp
 *   <td>round</td>                              — round
 *   <td class="text"><a...>Team A</a></td>      — home (bold if player's team)
 *   <td>(H/A/N)</td>                            — venue
 *   <td class="text"><a...>Team B</a></td>      — away
 *   <td><a href="/jogo...">1-2</a></td>         — score
 *   <td>90</td>                                 — minutes
 *   ...event cols...
 *   <td><div>6.3</div></td>                     — rating (last non-multimedia td with a float)
 */
export async function scrapeResults(playerUrl: string): Promise<PmMatchRating[]> {
  const resultsUrl = playerUrl.replace(/\?.*$/, '').replace(/\/$/, '') + '/results';
  try {
    const html = await fetchWithRetry(resultsUrl);
    const $ = cheerio.load(html);
    const matches: PmMatchRating[] = [];

    $('tr').each((_, row) => {
      const signDiv = $(row).find('.sign');
      if (!signDiv.length) return;
      const cells = $(row).find('td');
      if (cells.length < 8) return;

      // Result
      let result: 'W' | 'D' | 'L' = 'D';
      if (signDiv.hasClass('win')) result = 'W';
      else if (signDiv.hasClass('lost')) result = 'L';
      else if (signDiv.hasClass('draw')) result = 'D';

      // Date — second td
      const dateStr = cells.eq(1).text().trim();

      // Competition (3rd td)
      const comp = cells.eq(2).find('.text a').text().trim();

      // Teams — first td.text = player's team, second = opponent
      const textCells = cells.filter('.text');
      let homeTeam = '', awayTeam = '';
      if (textCells.length >= 2) {
        homeTeam = textCells.eq(0).text().trim();
        awayTeam = textCells.eq(1).text().trim();
      }

      // Venue — (H)ome, (A)way or (N)eutral for player's team
      let venue = '';
      cells.each((_i, cell) => {
        const text = $(cell).text().trim();
        if (/^\([HAN]\)$/.test(text)) venue = text;
      });

      // Score — from <a> inside a td that matches a score pattern
      // Score on PM is always home_goals-away_goals regardless of display order
      let score = '';
      cells.each((_i, td) => {
        const link = $(td).find('a');
        const href = link.attr('href') || '';
        if (href.includes('/jogo.php') || href.includes('/match/')) {
          const text = link.text().trim();
          if (/^\d+-\d+$/.test(text)) score = text;
        }
      });

      // When player's team is away (A) or neutral (N), the score is opponent-player.
      // Swap so it reads player_goals-opponent_goals to match display order.
      if (score && (venue === '(A)' || venue === '(N)')) {
        const parts = score.split('-');
        if (parts.length === 2) score = parts[1] + '-' + parts[0];
      }

      // Minutes — first td with just a number (after score)
      let minutes: string | undefined;
      const minutesCell = cells.eq(8); // typically column 8
      const minText = minutesCell.text().trim();
      if (/^\d+$/.test(minText)) minutes = minText + "'";

      // Rating — check last few cells for a float 1-10
      let rating: number | null = null;
      // Ratings on the results page are in a <div> inside a <td>, not styled spans
      for (let i = cells.length - 2; i >= cells.length - 5 && i >= 0; i--) {
        const cellText = cells.eq(i).find('div').text().trim() || cells.eq(i).text().trim();
        // Also check for colored background spans (some pages have them)
        const styledSpan = cells.eq(i).find('span[style*="background"]');
        if (styledSpan.length) {
          const parsed = parseFloat(styledSpan.text().trim());
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
            rating = parsed;
            break;
          }
        }
        const parsed = parseFloat(cellText);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
          rating = parsed;
          break;
        }
      }

      if (dateStr && (homeTeam || awayTeam)) {
        matches.push({ date: dateStr, homeTeam, awayTeam, score, result, rating, minutes });
      }
    });

    return matches;
  } catch {
    return [];
  }
}

/**
 * Scrape career sub-page for comprehensive season-by-season stats.
 */
export async function scrapeCareerStats(playerUrl: string): Promise<{ seasons: PmCareerSeason[]; totals: { games: number; goals: number; assists: number; starts: number } }> {
  const careerUrl = playerUrl.replace(/\/$/, '') + '/career';
  try {
    const html = await fetchWithRetry(careerUrl);
    const $ = cheerio.load(html);
    const pageText = $.html() || '';

    const seasons: PmCareerSeason[] = [];
    // Parse CLUB [SENIORS] table
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 4) return;
      const textCells = cells.toArray().map((c) => $(c).text().trim());
      const seasonCol = textCells.find((t) => /\d{4}\/\d{2,4}/.test(t));
      const clubCol = textCells.find((t) => t.length > 2 && !/^\d/.test(t) && !/^[-–]$/.test(t));
      if (!seasonCol || !clubCol) return;
      const isLoan = /\(L\)|\(loan\)/i.test(clubCol);
      const club = clubCol.replace(/\s*\(L\).*$|\s*\(loan\).*$/i, '').trim();
      const nums = textCells.filter((t) => /^\d+$/.test(t));
      seasons.push({
        season: seasonCol,
        club,
        games: nums[0] ? parseInt(nums[0]) : null,
        goals: nums[1] ? parseInt(nums[1]) : null,
        assists: nums[2] ? parseInt(nums[2]) : null,
        isLoan,
      });
    });

    // Career totals
    let games = 0, goals = 0, starts = 0;
    const totMatch = pageText.match(/(\d+)\s*FIXTURES[\s\S]*?(\d+)\s*S\s*\([\s\S]*?(\d+)\s*GOALS SCORED/i);
    if (totMatch) {
      games = parseInt(totMatch[1]);
      starts = parseInt(totMatch[2]);
      goals = parseInt(totMatch[3]);
    }

    return { seasons, totals: { games, goals, assists: 0, starts } };
  } catch {
    return { seasons: [], totals: { games: 0, goals: 0, assists: 0, starts: 0 } };
  }
}
