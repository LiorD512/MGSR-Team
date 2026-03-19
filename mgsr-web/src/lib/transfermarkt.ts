/**
 * Transfermarkt scraping logic (ported from mgsr-backend).
 * Used by Next.js API routes.
 */
import * as cheerio from 'cheerio';

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

const FETCH_TIMEOUT_MS = 60000;

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': getRandomUserAgent(),
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchHtmlWithRetry(url: string, maxRetries = 2): Promise<string> {
  let lastErr: Error | undefined;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

export function makeAbsoluteUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return TRANSFERMARKT_BASE + url;
  if (url.startsWith('http')) return url;
  return url;
}

export function convertPosition(s: string): string {
  const map: Record<string, string> = {
    Goalkeeper: 'GK',
    'Left Back': 'LB',
    'Centre Back': 'CB',
    'Right Back': 'RB',
    'Defensive Midfield': 'DM',
    'Central Midfield': 'CM',
    'Attacking Midfield': 'AM',
    'Right Winger': 'RW',
    'Left Winger': 'LW',
    'Centre Forward': 'CF',
    'Second Striker': 'SS',
    'Left Midfield': 'LM',
    'Right Midfield': 'RM',
  };
  return map[s] || s || '';
}

export function extractPlayerIdFromUrl(url: string | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const parts = url.trim().split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]?.toLowerCase();
    if (p === 'spieler' || p === 'player') {
      const id = parts[i + 1];
      return id && /^\d+$/.test(id) ? id : null;
    }
  }
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

/** Parse market value string to euros (number). Returns 0 for empty or "-". */
function parseValueToEuros(s: string | undefined): number {
  if (!s?.trim() || s.includes('-')) return 0;
  const t = s.replace(/[€\s]/g, '').toLowerCase();
  if (t.includes('k')) return (parseFloat(t.replace('k', '')) || 0) * 1000;
  if (t.includes('m')) return (parseFloat(t.replace('m', '')) || 0) * 1_000_000;
  return parseFloat(t) || 0;
}

/** Parse transfer fee string to euros. Handles "free transfer", "loan transfer", "?", "Loan fee:€45k", "End of loan..." etc. */
function parseFeeToEuros(s: string | null): number {
  if (!s) return 0;
  const t = s.trim().toLowerCase();
  if (!t || t === '-' || t === '?' || t.startsWith('free') || t.startsWith('loan transfer') || t.startsWith('end of loan')) return 0;
  // Extract euro amount from strings like "Loan fee:€45k" or "€1.50m"
  const match = t.match(/€([\d.,]+)\s*(k|m)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(',', '.')) || 0;
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'm') return num * 1_000_000;
  if (unit === 'k') return num * 1_000;
  return num;
}

/**
 * League config: competition code -> slug for startseite URL.
 * Used for getLeagueAvgMarketValue.
 */
const LEAGUE_SLUGS: Record<string, string> = {
  ISR1: 'ligat-haal',
  PL1: 'pko-bp-ekstraklasa',
  GR1: 'super-league-1',
  BE1: 'jupiler-pro-league',
  NL1: 'eredivisie',
  PO1: 'liga-portugal',
  SER1: 'super-liga-srbije',
  SE1: 'allsvenskan',
  TR1: 'super-lig',
  A1: 'bundesliga',
  C1: 'super-league',
  TS1: 'chance-liga',
  RO1: 'superliga',
  BU1: 'efbet-liga',
  UNG1: 'nemzeti-bajnoksag',
  ZYP1: 'cyprus-league',
  SLO1: 'nike-liga',
  GB1: 'premier-league',
  GB2: 'championship',
  IT1: 'serie-a',
  ES1: 'laliga',
  L2: '2-bundesliga',
  FR1: 'ligue-1',
};

/**
 * Get league average market value (ONLY players with market value; excludes players without value).
 * Returns average in euros (number). Cached per league+season for 24h to avoid repeated scraping.
 */
const LEAGUE_AVG_CACHE = new Map<string, { avg: number; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getLeagueAvgMarketValue(
  competitionCode: string,
  seasonYear: number = 2025
): Promise<number | null> {
  const cacheKey = `${competitionCode}:${seasonYear}`;
  const cached = LEAGUE_AVG_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.avg;

  const slug = LEAGUE_SLUGS[competitionCode] || competitionCode.toLowerCase();
  const startseiteUrl = `${TRANSFERMARKT_BASE}/${slug}/startseite/wettbewerb/${competitionCode}/saison_id/${seasonYear}`;

  try {
    const html = await fetchHtmlWithRetry(startseiteUrl);
    const $ = cheerio.load(html);

    const kaderUrls: string[] = [];
    $('table.items a[href*="/kader/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const full = href.startsWith('http') ? href : TRANSFERMARKT_BASE + href;
        if (!kaderUrls.includes(full)) kaderUrls.push(full);
      }
    });

    if (kaderUrls.length === 0) return null;

    let totalValue = 0;
    let playerCount = 0;

    for (const url of kaderUrls) {
      try {
        await new Promise((r) => setTimeout(r, 200));
        const kaderHtml = await fetchHtmlWithRetry(url);
        const $k = cheerio.load(kaderHtml);

        $k('table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even').each(
          (_, kRow) => {
            const valueCell = $k(kRow).find('td.rechts a[href*="marktwertverlauf"]').first();
            const valueTxt = valueCell.text().trim() || valueCell.parent().text().trim();
            const value = parseValueToEuros(valueTxt);
            if (value > 0) {
              totalValue += value;
              playerCount++;
            }
          }
        );
      } catch {
        // skip club on error
      }
    }

    if (playerCount === 0) return null;
    const avg = Math.round(totalValue / playerCount);
    LEAGUE_AVG_CACHE.set(cacheKey, { avg, ts: Date.now() });
    return avg;
  } catch {
    return null;
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────
export async function handleSearch(q: string) {
  const query = q.trim();
  if (!query) return { players: [] };

  const encoded = encodeURIComponent(query);
  const url = `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encoded}`;
  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  const players: Record<string, unknown>[] = [];
  const playerSection = $('div.box')
    .filter((_, el) => $(el).find('h2.content-box-headline').text().toLowerCase().includes('players'))
    .first();

  playerSection.find('table.items tr.odd, table.items tr.even').each((_, row) => {
    try {
      const $row = $(row);
      const img = $row.find('img').first();
      const playerImage = (img.attr('src') || '').replace('small', 'big');
      const playerName = img.attr('alt') || '';
      const link = $row.find('td.hauptlink a').attr('href') || '';
      const tmProfile = link.includes('profil') ? TRANSFERMARKT_BASE + link : null;
      if (!tmProfile) return;

      const tds = $row.find('td.zentriert');
      const playerPosition = tds.eq(0).text().trim() || '';
      const currentClub = $row.find('td.zentriert a img').attr('title') || '';
      const currentClubLogo = ($row.find('td.zentriert a img').attr('src') || '').replace('tiny', 'head');
      const playerAge = tds.eq(2).text().trim() || '';
      const natImg = tds.eq(3).find('img').first();
      const nationality = natImg.attr('title') || natImg.attr('alt') || '';
      const nationalityFlag = (natImg.attr('data-src') || natImg.attr('src') || '')
        .replace('verysmall', 'head')
        .replace('tiny', 'head');
      const playerValue = $row.find('td.rechts.hauptlink').text().trim() || '';

      players.push({
        tmProfile,
        playerImage: makeAbsoluteUrl(playerImage),
        playerName,
        playerPosition,
        playerAge,
        playerValue,
        nationality,
        nationalityFlag: makeAbsoluteUrl(nationalityFlag),
        currentClub,
        currentClubLogo: makeAbsoluteUrl(currentClubLogo),
      });
    } catch {
      // skip row
    }
  });

  return { players };
}

// ─── Club search ────────────────────────────────────────────────────────────
export async function handleClubSearch(q: string) {
  const query = q.trim();
  if (query.length < 2) return { clubs: [] };

  const encoded = encodeURIComponent(query);
  const url = `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encoded}`;
  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  const clubs: Record<string, unknown>[] = [];
  const clubSection = $('div.box')
    .filter((_, el) => {
      const headline = $(el).find('h2.content-box-headline').text().toLowerCase();
      return headline.includes('verein') || headline.includes('club') || headline.includes('clubs');
    })
    .first();

  if (!clubSection.length) return { clubs: [] };

  clubSection.find('table.items tr.odd, table.items tr.even').each((_, row) => {
    try {
      const $row = $(row);
      const clubImg = $row.find('img').first();
      const clubLogo = (clubImg.attr('src') || '').replace('tiny', 'head').replace('small', 'head');
      const mainLink = $row.find('td.hauptlink a').first();
      const href = mainLink.attr('href') || '';
      const clubTmProfile = href ? (href.startsWith('http') ? href : TRANSFERMARKT_BASE + href) : null;
      const clubName =
        mainLink.text().trim() ||
        clubImg.attr('alt') ||
        clubImg.attr('title') ||
        $row.find('td.hauptlink').text().trim();
      if (!clubName) return;

      const tds = $row.find('td.zentriert');
      const lastTdImg = tds.last().find('img').first();
      const countryImg = lastTdImg.length ? lastTdImg : $row.find('td.zentriert img').last();
      const clubCountry = countryImg.attr('title') || countryImg.attr('alt') || tds.last().text().trim() || '';
      const clubCountryFlag = (countryImg.attr('data-src') || countryImg.attr('src') || '')
        .replace('tiny', 'head')
        .replace('verysmall', 'head');

      clubs.push({
        clubName: clubName.trim(),
        clubLogo: makeAbsoluteUrl(clubLogo),
        clubTmProfile,
        clubCountry: clubCountry.trim() || null,
        clubCountryFlag: clubCountryFlag ? makeAbsoluteUrl(clubCountryFlag) : null,
      });
    } catch {
      // skip row
    }
  });

  return { clubs };
}

// ─── Player details ──────────────────────────────────────────────────────────
export async function handlePlayer(urlParam: string) {
  let url = (urlParam || '').trim();
  if (!url) throw new Error('Missing url parameter');
  if (!url.startsWith('http')) {
    url = url.startsWith('/') ? TRANSFERMARKT_BASE + url : TRANSFERMARKT_BASE + '/' + url;
  }

  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  // Info-table Citizenship row has ALL citizenships; header itemprop only has primary
  const citizenshipLabel = $('span.info-table__content--regular').filter(function(this: cheerio.Element) {
    return $(this).text().trim().startsWith('Citizenship');
  });
  const citizenshipContent = citizenshipLabel.next('.info-table__content--bold');
  let natEls = citizenshipContent.find('img');
  if (!natEls.length) natEls = $('[itemprop=nationality] img');
  const nationalities: string[] = [];
  const nationalityFlags: string[] = [];
  natEls.each((_: number, el: cheerio.Element) => {
    const title = $(el).attr('title');
    if (title) nationalities.push(title);
    const src = ($(el).attr('src') || '').replace('verysmall', 'head').replace('tiny', 'head');
    if (src) nationalityFlags.push(src);
  });
  const nationality = nationalities[0] || 'Unknown';
  const nationalityFlag = nationalityFlags[0] || '';

  const height = $('[itemprop=height]').text().trim() || 'Unknown';
  const marketValueBox = $('div[class*="data-header__box--small"]').text();
  const marketValue = marketValueBox.substring(0, marketValueBox.indexOf('Last')).trim() || '';

  const contractLabel = $('span.data-header__label').text();
  const contractExpires = contractLabel.includes(':') ? contractLabel.split(':').pop()?.trim() || '' : '';

  let positions: string[] = [];
  $('div.detail-position__box dd').each((_, el) => {
    const p = $(el).text().replace(/-/g, ' ').trim();
    positions.push(convertPosition(p) || p);
  });
  if (positions.length === 0) {
    const fallback = $('ul.data-header__items').eq(1).text();
    const afterColon = fallback.split(':').pop()?.trim();
    if (afterColon) positions = [convertPosition(afterColon) || afterColon];
  }

  const clubLink = $('span.data-header__club a');
  const clubName = clubLink.attr('title') || '';
  const clubHref = clubLink.attr('href') || '';
  const clubTmProfile = clubHref ? TRANSFERMARKT_BASE + clubHref : '';
  const clubLogoEl = $('div.data-header__box--big img');
  const clubLogo =
    (clubLogoEl.attr('srcset') || '').split('1x')[0]?.trim() || clubLogoEl.attr('src') || '';
  const clubCountry = $('div.data-header__club-info span.data-header__label img').attr('title') || '';

  const fullName =
    $('h1.data-header__headline').text().trim() ||
    $('div.data-header__headline-wrapper h1').text().trim() ||
    ($('meta[property="og:title"]').attr('content') || '').split(' - ')[0].trim() ||
    '';

  const profileImage =
    $('div.data-header__profile-container img').first().attr('src') ||
    $('div.data-header__profile-container img').attr('src') ||
    '';

  const ageEl = $('span[itemprop=birthDate]').first().text();
  const age = ageEl ? (ageEl.match(/\((\d+)\)/) || [])[1] || ageEl.trim() : '';

  const ribbon = $('div[class*="ribbon"]').first().text().toLowerCase();
  const loanLink = $('a[title*="on loan from"]').attr('title') || '';
  const isOnLoan =
    ribbon.includes('on loan') ||
    ribbon.includes('leihe') ||
    ribbon.includes('ausgeliehen') ||
    loanLink.includes('on loan');
  const onLoanFromClub = isOnLoan ? (loanLink.split('from')[1] || '').trim() : null;

  let foot = '';
  $('span.info-table__content--regular').each((_, el) => {
    const t = $(el).text().toLowerCase();
    if (t.includes('foot') || t.includes('preferred foot')) {
      foot = $(el).next().text().trim() || '';
      return false;
    }
  });

  // Extract Instagram handle from social-media links on the profile page
  let instagramHandle: string | null = null;
  let instagramUrl: string | null = null;
  const tmOwnedHandles = new Set(['transfermarkt_official', 'transfermarkt', 'transfermarkt.de']);
  $('a[href*="instagram.com"]').each((_: number, el: cheerio.Element) => {
    const href = $(el).attr('href');
    if (href && !instagramUrl) {
      const match = href.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
      if (match && !tmOwnedHandles.has(match[1].toLowerCase())) {
        instagramUrl = href.startsWith('http') ? href : 'https://' + href.replace(/^\/\//, '');
        instagramHandle = match[1];
        return false;
      }
    }
  });

  return {
    tmProfile: url,
    fullName,
    height,
    age,
    positions,
    profileImage: makeAbsoluteUrl(profileImage),
    nationality,
    nationalities,
    nationalityFlag: makeAbsoluteUrl(nationalityFlag),
    nationalityFlags: nationalityFlags.map(makeAbsoluteUrl),
    contractExpires,
    marketValue,
    currentClub: {
      clubName,
      clubLogo: makeAbsoluteUrl(clubLogo),
      clubTmProfile,
      clubCountry,
    },
    isOnLoan: !!isOnLoan,
    onLoanFromClub: onLoanFromClub || null,
    foot: foot || null,
    instagramHandle,
    instagramUrl,
  };
}

/**
 * Get the most recent transfer fee (in euros) for a player.
 * Used to filter out players bought for big money (e.g. >€2.5M) who are not realistic for Ligat Ha'Al.
 * Returns null if free transfer, loan, or parse error.
 */
export async function getLastTransferFee(profileUrl: string): Promise<{ fee: number; date?: string } | null> {
  const id = extractPlayerIdFromUrl(profileUrl);
  if (!id) return null;
  const transfersUrl = profileUrl
    .replace(/\/profil\//, '/transfers/')
    .replace(/\/player\//, '/transfers/')
    .replace(/\/leistungsdaten\//, '/transfers/');
  const url = transfersUrl.includes('/transfers/') ? transfersUrl : `${profileUrl.replace(/\/$/, '')}/transfers`;
  try {
    const html = await fetchHtmlWithRetry(url);
    const $ = cheerio.load(html);
    let lastFee: number | null = null;
    let lastDate: string | undefined;
    $('table.items tbody tr, div.responsive-table table.items tbody tr').each((_, row) => {
      const $row = $(row);
      const tds = $row.find('td');
      if (tds.length < 4) return;
      const rechts = $row.find('td.rechts');
      let feeCell = (rechts.last().length ? rechts.last() : rechts.first()).text().trim();
      if (!feeCell) feeCell = tds.last().text().trim();
      const dateCell = tds.eq(1).text().trim() || tds.eq(0).text().trim();
      const feeLower = feeCell.toLowerCase();
      if (feeLower.includes('free') || feeLower.includes('loan') || feeLower.includes('-') || !feeCell || feeLower === '?') return;
      const normalized = feeCell.replace(/,/g, '.');
      const parsed = parseValueToEuros(normalized);
      if (parsed > 0) {
        lastFee = parsed;
        lastDate = dateCell || undefined;
        return false;
      }
    });
    return lastFee != null ? { fee: lastFee, date: lastDate } : null;
  } catch {
    return null;
  }
}

/** Last season stats: goals, assists, appearances, minutes. Season 2024 = 2024/25. */
export interface PlayerPerformanceStats {
  season: string;
  appearances: number;
  goals: number;
  assists: number;
  minutes: number;
  club?: string;
}

/** Current European season start year (Aug→next year = current year, Jan–Jul = previous year). */
function getCurrentSeasonYear(): number {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return month >= 8 ? year : year - 1;
}

/**
 * Scrape performance stats from Transfermarkt leistungsdaten page.
 * Uses current season by default (e.g. March 2025 → 2024/25, Sep 2025 → 2025/26).
 */
export async function getPlayerPerformanceStats(
  profileUrl: string,
  seasonYear: number = getCurrentSeasonYear()
): Promise<PlayerPerformanceStats | null> {
  const id = extractPlayerIdFromUrl(profileUrl);
  if (!id) return null;

  const perfUrl = profileUrl
    .replace(/\/profil\//, '/leistungsdaten/')
    .replace(/\/player\//, '/leistungsdaten/');
  const urlWithSeason = perfUrl.includes('saison')
    ? perfUrl
    : `${perfUrl.replace(/\/$/, '')}/saison/${seasonYear}`;

  try {
    const html = await fetchHtmlWithRetry(urlWithSeason);
    const $ = cheerio.load(html);

    let appearances = 0;
    let goals = 0;
    let assists = 0;
    let minutes = 0;

    const rows = $('table.items tbody tr, table.items tr');
    rows.each((_, row) => {
      const $row = $(row);
      const firstCell = $row.find('td').first().text().trim().toLowerCase();
      if (!firstCell.includes('total') && !firstCell.includes('gesamt')) return;

      const tds = $row.find('td');
      if (tds.length < 4) return;

      const nums: number[] = [];
      tds.slice(1).each((__, td) => {
        const raw = $(td).text().trim();
        const t = raw.replace(/['\s]/g, '').replace(/\./g, '').replace(/,/g, '');
        const n = parseInt(t, 10);
        if (!isNaN(n)) nums.push(n);
      });

      if (nums.length >= 3) {
        appearances = nums[0] ?? 0;
        goals = nums[1] ?? 0;
        // Compact view: Spiele, Tore, Minuten (no Vorlagen). Extended: Spiele, Tore, Vorlagen, Minuten.
        if (nums.length === 3) {
          assists = 0;
          minutes = nums[2] ?? 0;
        } else {
          assists = nums[2] ?? 0;
          const last = nums[nums.length - 1];
          if (last != null && last > 100) minutes = last;
          else if (nums.length >= 6) minutes = nums[5] ?? 0;
          else if (nums.length >= 4) minutes = nums[3] ?? 0;
        }
      }
      return false;
    });

    if (appearances === 0 && goals === 0 && assists === 0) return null;

    return {
      season: `${seasonYear}/${String(seasonYear + 1).slice(-2)}`,
      appearances,
      goals,
      assists,
      minutes,
    };
  } catch {
    return null;
  }
}

// ─── Releases (free agents from vertragslosespieler page) ─────────────────────
// Uses the dedicated free agents page instead of latest transfers - yields many more results.
export async function handleReleases(minVal = 0, maxVal = 50000000, page = 1) {
  const url = `${TRANSFERMARKT_BASE}/transfers/vertragslosespieler/statistik?ausrichtung=&spielerposition_id=0&land_id=&wettbewerb_id=alle&seit=0&altersklasse=&minMarktwert=${minVal}&maxMarktwert=${maxVal}&plus=1&page=${page}`;
  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  const players: Record<string, unknown>[] = [];
  $('table.items tr.odd, table.items tr.even').each((_, row) => {
    try {
      const tables = $(row).find('table.inline-table');
      if (tables.length === 0) return;
      const t0 = tables.eq(0);
      const playerImage = (t0.find('img').attr('data-src') || t0.find('img').attr('src') || '').replace(
        'medium',
        'big'
      );
      const playerName = t0.find('img').attr('title') || '';
      const playerUrl = t0.find('a').attr('href') || '';
      const fullUrl = playerUrl.startsWith('http') ? playerUrl : TRANSFERMARKT_BASE + playerUrl;
      const playerPosition = (t0.find('tr').eq(1).text() || '').replace(/-/g, ' ').trim();
      const playerAge = $(row).find('td.zentriert').eq(1).text().trim() || '';
      const rechts = $(row).find('td.rechts');
      const transferDate = rechts.eq(0).text().trim() || '';
      const marketValue = rechts.eq(1).text().trim() || '';
      const natImg = $(row).find('td.zentriert img[title]').first();
      const playerNationality = natImg.attr('title') || natImg.attr('alt') || '';
      const playerNationalityFlag = (natImg.attr('data-src') || natImg.attr('src') || '')
        .replace('verysmall', 'head')
        .replace('tiny', 'head');

      players.push({
        playerImage: makeAbsoluteUrl(playerImage),
        playerName,
        playerUrl: fullUrl,
        playerPosition: convertPosition(playerPosition) || playerPosition,
        playerAge,
        playerNationality,
        playerNationalityFlag: makeAbsoluteUrl(playerNationalityFlag),
        transferDate,
        marketValue,
      });
    } catch {
      // skip
    }
  });

  return { players };
}

// ─── Free Agent Fallback Search (for AI Scout) ──────────────────────────────
// When the scout server returns 0 free agents, fall back to Transfermarkt's
// dedicated free agents page + contract finishers (≤6 months), then enrich
// top candidates with profile data (foot, positions, etc.).

/** Map scout position code → TM position IDs for URL filtering */
const POSITION_TO_TM_IDS: Record<string, number[]> = {
  GK: [1],
  CB: [3],
  LB: [4],
  RB: [5],
  DM: [6],
  CM: [7],
  AM: [10],
  RW: [11],
  LW: [12],
  SS: [13],
  CF: [14],
};

const FA_MAX_PAGES = 5;
const FA_ENRICH_BATCH = 5;
const FA_MAX_RESULTS = 25;

/**
 * Search Transfermarkt for free agents + contract expiring (≤6 months)
 * matching a position and optionally a preferred foot.
 * Returns results in the same shape as the scout server so the search route
 * can merge them seamlessly.
 */
export async function searchFreeAgentsFallback(opts: {
  position?: string;
  foot?: string;
  nationality?: string;
  ageMax?: number;
  valueMax?: number;
}): Promise<Record<string, unknown>[]> {
  const { position, foot, nationality, ageMax, valueMax = 3_000_000 } = opts;
  const tmPosIds = position ? (POSITION_TO_TM_IDS[position] ?? []) : [];
  const candidates: Record<string, unknown>[] = [];
  const seenUrls = new Set<string>();

  // ── Source 1: Free agents (no club at all) ──
  const posParam = tmPosIds.length === 1 ? tmPosIds[0] : 0;
  for (let page = 1; page <= FA_MAX_PAGES; page++) {
    try {
      const { players } = await handleReleases(0, valueMax, page);
      if (players.length === 0) break;
      for (const p of players) {
        const url = (p.playerUrl as string) || '';
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        // Position pre-filter (from TM's own position text)
        if (position && p.playerPosition !== position) continue;
        // Age pre-filter
        const age = parseInt(String(p.playerAge), 10);
        if (ageMax && !isNaN(age) && age > ageMax) continue;
        candidates.push({ ...p, source: 'free_agent' });
      }
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // ── Source 2: Contract expiring within 6 months ──
  const now = new Date();
  const sixMonthsLater = new Date(now.getTime() + 6 * 30 * 24 * 60 * 60 * 1000);
  const expiryYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const cfMaxPages = 10;
  for (let page = 1; page <= cfMaxPages; page++) {
    try {
      const url = `${TRANSFERMARKT_BASE}/transfers/endendevertraege/statistik?plus=1&jahr=${expiryYear}&land_id=0&ausrichtung=alle&spielerposition_id=${posParam || 'alle'}&altersklasse=alle&page=${page}`;
      const html = await fetchHtmlWithRetry(url);
      const $ = cheerio.load(html);
      const rows = $('table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even');
      if (rows.length === 0) break;

      rows.each((_, row) => {
        try {
          const playerLink = $(row).find('a[href*="/profil/spieler/"], a[href*="/profile/player/"]').first();
          const href = playerLink.attr('href');
          if (!href) return;
          const playerUrl = href.startsWith('http') ? href : TRANSFERMARKT_BASE + href;
          if (seenUrls.has(playerUrl)) return;

          const tables = $(row).find('table.inline-table');
          const playerTable = tables.first();
          const playerName = (playerLink.attr('title') || playerTable.find('img').attr('title') || playerLink.text().trim() || '').trim();
          const posText = playerTable.find('tr').eq(1).text().replace(/-/g, ' ').trim();
          const playerPosition = convertPosition(posText) || posText;
          if (position && playerPosition !== position) return;

          const ageTd = $(row).find('td.zentriert').first().text().trim();
          const ageMatch = ageTd.match(/\((\d+)\)/);
          const playerAge = ageMatch ? ageMatch[1] : (parseInt(ageTd, 10) || '').toString();
          const ageNum = parseInt(playerAge, 10);
          if (ageMax && !isNaN(ageNum) && ageNum > ageMax) return;

          let marketValue: string | null = null;
          $(row).find('td').each((__, td) => {
            const t = $(td).text().trim();
            if (t.includes('€')) { marketValue = t; return false; }
          });
          const valNum = parseMarketValueCF(marketValue);
          if (valNum > valueMax || valNum < 50_000) return;

          seenUrls.add(playerUrl);
          const { nationality: nat, flag } = extractNationalityAndFlagCF($, row);
          const playerImageRaw = playerTable.find('img').attr('data-src') || playerTable.find('img').attr('src') || '';

          candidates.push({
            playerImage: makeAbsoluteUrl(playerImageRaw.replace('medium', 'big')),
            playerName,
            playerUrl,
            playerPosition,
            playerAge,
            playerNationality: nat,
            playerNationalityFlag: flag,
            marketValue: marketValue || '',
            source: 'contract_expiring',
          });
        } catch { /* skip */ }
      });
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[TM Fallback] Candidates before enrichment: ${candidates.length} (position=${position || 'any'}, foot=${foot || 'any'})`);

  // ── Enrich top candidates with foot + full positions from player profiles ──
  // If foot filter requested, we MUST enrich to get the foot field.
  // If no foot filter, skip enrichment (faster).
  let enrichedResults: Record<string, unknown>[];

  if (foot) {
    const toEnrich = candidates.slice(0, FA_MAX_RESULTS * 3); // Over-fetch to filter down
    const enriched: Record<string, unknown>[] = [];

    for (let i = 0; i < toEnrich.length; i += FA_ENRICH_BATCH) {
      if (enriched.length >= FA_MAX_RESULTS) break;
      const batch = toEnrich.slice(i, i + FA_ENRICH_BATCH);
      const profiles = await Promise.all(
        batch.map(async (c) => {
          try {
            const profile = await handlePlayer(c.playerUrl as string);
            return { candidate: c, profile };
          } catch {
            return { candidate: c, profile: null };
          }
        })
      );
      for (const { candidate, profile } of profiles) {
        if (!profile) continue;
        const playerFoot = (profile.foot || '').toLowerCase();
        if (foot && playerFoot !== foot.toLowerCase()) continue;
        // Check nationality if requested
        if (nationality) {
          const natLower = (profile.nationality || '').toLowerCase();
          if (!natLower.includes(nationality.toLowerCase())) continue;
        }
        enriched.push({
          ...candidate,
          foot: profile.foot,
          contractExpires: profile.contractExpires,
          positions: profile.positions,
        });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    enrichedResults = enriched;
  } else {
    enrichedResults = candidates.slice(0, FA_MAX_RESULTS);
  }

  // ── Convert to scout-server-compatible format ──
  return enrichedResults.map((p) => ({
    name: p.playerName,
    position: p.playerPosition,
    age: String(p.playerAge),
    market_value: p.marketValue,
    url: p.playerUrl,
    club: p.source === 'free_agent' ? 'Without Club' : undefined,
    citizenship: p.playerNationality,
    profile_image: p.playerImage,
    foot: p.foot || undefined,
    contract: p.contractExpires || (p.source === 'free_agent' ? 'Free Agent' : undefined),
    _source: 'transfermarkt_fallback',
    _tm_source: p.source,
  }));
}

// ─── Contract Finishers ──────────────────────────────────────────────────────
const CF_MIN_VALUE = 150000;
const CF_MAX_VALUE = 3000000;
const CF_MAX_AGE = 31;
const CF_MAX_PAGES = 80;
const CF_BATCH_SIZE = 3;

function getContractFinisherWindow(): { window: string; yearsToQuery: number[] } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = Math.max(now.getFullYear(), 2026);
  if (month >= 2 && month <= 9) {
    return { window: 'Summer', yearsToQuery: [year] };
  }
  return { window: 'Winter', yearsToQuery: [year, year + 1] };
}

function parseMarketValueCF(val: string | null): number {
  if (!val || val.includes('-')) return 0;
  const s = val.replace(/[€\s]/g, '').toLowerCase();
  if (s.includes('k')) return (parseFloat(s.replace('k', '')) || 0) * 1000;
  if (s.includes('m')) return (parseFloat(s.replace('m', '')) || 0) * 1000000;
  return parseFloat(s) || 0;
}

function formatContractExpiryDate(window: string, year: number, isFirstYear: boolean): string {
  if (window === 'Summer') return `30.06.${year}`;
  return isFirstYear ? `31.12.${year}` : `31.01.${year}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractNationalityAndFlagCF($: any, row: cheerio.Element): { nationality: string | null; flag: string | null } {
  const img = $(row).find('td.zentriert img[title]').first();
  const natImg = img.length
    ? img
    : $(row)
        .find('img[alt]')
        .filter((_: number, el: cheerio.Element) => {
          const alt = $(el).attr('alt') || '';
          return alt.length >= 2 && alt.length <= 50;
        })
        .first();
  const nationality = (natImg.attr('title') || natImg.attr('alt') || '').trim() || null;
  let flag = natImg.attr('data-src') || natImg.attr('src') || '';
  if (flag) {
    flag = makeAbsoluteUrl(flag).replace(/verysmall|tiny/g, 'head');
  }
  return { nationality, flag: flag || null };
}

export async function handleContractFinishers() {
  const config = getContractFinisherWindow();
  const seenUrls = new Set<string>();
  const all: Record<string, unknown>[] = [];

  for (const jahr of config.yearsToQuery) {
    let page = 1;
    let batchShouldBreak = false;

    while (page <= CF_MAX_PAGES && !batchShouldBreak) {
      const batchEnd = Math.min(page + CF_BATCH_SIZE - 1, CF_MAX_PAGES);
      const batch: { html: string | null; page: number }[] = [];

      for (let p = page; p <= batchEnd; p++) {
        const url = `${TRANSFERMARKT_BASE}/transfers/endendevertraege/statistik?plus=1&jahr=${jahr}&land_id=0&ausrichtung=alle&spielerposition_id=alle&altersklasse=alle&page=${p}`;
        try {
          const html = await fetchHtmlWithRetry(url);
          batch.push({ html, page: p });
        } catch {
          batch.push({ html: null, page: p });
        }
      }

      for (const { html } of batch) {
        if (!html) continue;
        const $ = cheerio.load(html);
        const rows = $(
          'table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even'
        );
        let rawRowCount = 0;
        let maxValueOnPage = 0;

        rows.each((_, row) => {
          try {
            const playerLink = $(row).find(
              'a[href*="/profil/spieler/"], a[href*="/profile/player/"]'
            ).first();
            const href = playerLink.attr('href');
            if (!href) return;
            rawRowCount++;

            const playerUrl = href.startsWith('http') ? href : TRANSFERMARKT_BASE + href;
            if (seenUrls.has(playerUrl)) return;

            const tables = $(row).find('table.inline-table');
            const playerTable = tables.first();
            const playerName =
              (
                playerLink.attr('title') ||
                playerTable.find('img').attr('title') ||
                playerLink.text().trim() ||
                ''
              ).trim() || null;
            const posText = playerTable.find('tr').eq(1).text().replace(/-/g, ' ').trim();
            const playerPosition = convertPosition(posText) || posText || null;

            const ageTd = $(row).find('td.zentriert').first().text().trim();
            const ageMatch = ageTd.match(/\((\d+)\)/);
            const playerAge = ageMatch ? ageMatch[1] : (parseInt(ageTd, 10) || '').toString() || null;

            let marketValue: string | null = null;
            $(row)
              .find('td')
              .each((__, td) => {
                const t = $(td).text().trim();
                if (t.includes('€')) {
                  marketValue = t;
                  return false;
                }
              });

            const valueNum = parseMarketValueCF(marketValue);
            const ageNum = parseInt(playerAge || '', 10);
            if (valueNum > maxValueOnPage) maxValueOnPage = valueNum;

            if (
              Number.isNaN(ageNum) ||
              ageNum > CF_MAX_AGE ||
              valueNum < CF_MIN_VALUE ||
              valueNum > CF_MAX_VALUE
            )
              return;
            seenUrls.add(playerUrl);

            const { nationality, flag } = extractNationalityAndFlagCF($, row);
            const clubTable = tables.eq(1);
            const clubName =
              (
                clubTable.find('a[href*="/startseite/verein/"]').attr('title') ||
                clubTable.find('img').attr('title') ||
                ''
              ).trim() || null;
            const clubLogoRaw = clubTable.find('img').attr('data-src') || clubTable.find('img').attr('src') || '';
            const clubJoinedLogo = clubLogoRaw ? makeAbsoluteUrl(clubLogoRaw) : null;
            const playerImageRaw =
              playerTable.find('img').attr('data-src') || playerTable.find('img').attr('src') || '';
            const playerImage = playerImageRaw
              ? makeAbsoluteUrl(playerImageRaw.replace('medium', 'big'))
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
              marketValue: marketValue || '',
            });
          } catch {
            // skip
          }
        });

        if (rawRowCount === 0) batchShouldBreak = true;
        if (maxValueOnPage > 0 && maxValueOnPage < CF_MIN_VALUE) batchShouldBreak = true;
      }

      page += CF_BATCH_SIZE;
      if (batchShouldBreak) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  all.sort(
    (a, b) =>
      parseMarketValueCF((b.marketValue as string) || '') - parseMarketValueCF((a.marketValue as string) || '')
  );
  return { players: all, windowLabel: config.window };
}

export async function* handleContractFinishersStream(): AsyncGenerator<
  { players: Record<string, unknown>[]; windowLabel: string; isLoading: boolean; error?: string }
> {
  const config = getContractFinisherWindow();
  yield { windowLabel: config.window, players: [], isLoading: true };
  const seenUrls = new Set<string>();
  const all: Record<string, unknown>[] = [];

  for (const jahr of config.yearsToQuery) {
    let page = 1;
    let batchShouldBreak = false;

    while (page <= CF_MAX_PAGES && !batchShouldBreak) {
      const batchEnd = Math.min(page + CF_BATCH_SIZE - 1, CF_MAX_PAGES);
      const batch: { html: string | null }[] = [];

      for (let p = page; p <= batchEnd; p++) {
        const url = `${TRANSFERMARKT_BASE}/transfers/endendevertraege/statistik?plus=1&jahr=${jahr}&land_id=0&ausrichtung=alle&spielerposition_id=alle&altersklasse=alle&page=${p}`;
        try {
          const html = await fetchHtmlWithRetry(url);
          batch.push({ html });
        } catch {
          batch.push({ html: null });
        }
      }

      const batchPlayers: Record<string, unknown>[] = [];
      for (const { html } of batch) {
        if (!html) continue;
        const $ = cheerio.load(html);
        const rows = $(
          'table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even'
        );
        let rawRowCount = 0;
        let maxValueOnPage = 0;

        rows.each((_, row) => {
          try {
            const playerLink = $(row).find(
              'a[href*="/profil/spieler/"], a[href*="/profile/player/"]'
            ).first();
            const href = playerLink.attr('href');
            if (!href) return;
            rawRowCount++;

            const playerUrl = href.startsWith('http') ? href : TRANSFERMARKT_BASE + href;
            if (seenUrls.has(playerUrl)) return;

            const tables = $(row).find('table.inline-table');
            const playerTable = tables.first();
            const playerName =
              (
                playerLink.attr('title') ||
                playerTable.find('img').attr('title') ||
                playerLink.text().trim() ||
                ''
              ).trim() || null;
            const posText = playerTable.find('tr').eq(1).text().replace(/-/g, ' ').trim();
            const playerPosition = convertPosition(posText) || posText || null;

            const ageTd = $(row).find('td.zentriert').first().text().trim();
            const ageMatch = ageTd.match(/\((\d+)\)/);
            const playerAge = ageMatch ? ageMatch[1] : (parseInt(ageTd, 10) || '').toString() || null;

            let marketValue: string | null = null;
            $(row)
              .find('td')
              .each((__, td) => {
                const t = $(td).text().trim();
                if (t.includes('€')) {
                  marketValue = t;
                  return false;
                }
              });

            const valueNum = parseMarketValueCF(marketValue);
            const ageNum = parseInt(playerAge || '', 10);
            if (valueNum > maxValueOnPage) maxValueOnPage = valueNum;

            if (
              Number.isNaN(ageNum) ||
              ageNum > CF_MAX_AGE ||
              valueNum < CF_MIN_VALUE ||
              valueNum > CF_MAX_VALUE
            )
              return;
            seenUrls.add(playerUrl);

            const { nationality, flag } = extractNationalityAndFlagCF($, row);
            const clubTable = tables.eq(1);
            const clubName =
              (
                clubTable.find('a[href*="/startseite/verein/"]').attr('title') ||
                clubTable.find('img').attr('title') ||
                ''
              ).trim() || null;
            const clubLogoRaw = clubTable.find('img').attr('data-src') || clubTable.find('img').attr('src') || '';
            const clubJoinedLogo = clubLogoRaw ? makeAbsoluteUrl(clubLogoRaw) : null;
            const playerImageRaw =
              playerTable.find('img').attr('data-src') || playerTable.find('img').attr('src') || '';
            const playerImage = playerImageRaw
              ? makeAbsoluteUrl(playerImageRaw.replace('medium', 'big'))
              : null;

            const contractExpiry = formatContractExpiryDate(
              config.window,
              jahr,
              config.yearsToQuery[0] === jahr
            );
            const p = {
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
              marketValue: marketValue || '',
            };
            all.push(p);
            batchPlayers.push(p);
          } catch {
            // skip
          }
        });

        if (rawRowCount === 0) batchShouldBreak = true;
        if (maxValueOnPage > 0 && maxValueOnPage < CF_MIN_VALUE) batchShouldBreak = true;
      }

      if (batchPlayers.length > 0) {
        const sorted = [...all].sort(
          (a, b) =>
            parseMarketValueCF((b.marketValue as string) || '') -
            parseMarketValueCF((a.marketValue as string) || '')
        );
        yield { players: sorted, windowLabel: config.window, isLoading: true };
      }

      page += CF_BATCH_SIZE;
      if (batchShouldBreak) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const sorted = [...all].sort(
    (a, b) =>
      parseMarketValueCF((b.marketValue as string) || '') - parseMarketValueCF((a.marketValue as string) || '')
  );
  yield { players: sorted, windowLabel: config.window, isLoading: false };
}

// ─── Teammates ───────────────────────────────────────────────────────────────
function buildTeammatesUrl(profileUrl: string): string | null {
  const url = profileUrl.trim().split('?')[0];
  if (!url) return null;
  const base = url
    .replace(/\/profil\/spieler\//i, '/gemeinsameSpiele/spieler/')
    .replace(/\/profile\/player\//i, '/gemeinsameSpiele/spieler/');
  if (base !== url) {
    return `${base}/plus/0/galerie/0?gegner=0&kriterium=0&wettbewerb=&liga=&verein=&pos=&status=1`;
  }
  const playerId = extractPlayerIdFromUrl(url);
  if (!playerId) return null;
  const slugMatch = url.match(/transfermarkt\.(?:com|co\.uk|de|es|fr|it|nl|pt|tr)\/([^/]+)/i);
  const slug = slugMatch ? slugMatch[1] : 'spieler';
  return `${TRANSFERMARKT_BASE}/${slug}/gemeinsameSpiele/spieler/${playerId}/plus/0/galerie/0?gegner=0&kriterium=0&wettbewerb=&liga=&verein=&pos=&status=1`;
}

function parseTeammatesFromHtml(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html);
  const teammates: Record<string, unknown>[] = [];
  const gegnerLinks = $('a[href*="/gegner/"]');
  if (gegnerLinks.length > 0) {
    gegnerLinks.each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/gegner\/(\d+)/);
      if (!match || match[1] === '0') return;
      const teammateId = match[1];
      const matchesText = $(el).text().trim().replace(/,/g, '').replace(/\./g, '');
      const matchesPlayedTogether = parseInt(matchesText, 10);
      if (matchesPlayedTogether >= 1 && matchesPlayedTogether <= 2000) {
        teammates.push({
          tmProfileUrl: `${TRANSFERMARKT_BASE}/profil/spieler/${teammateId}`,
          playerName: null,
          position: null,
          matchesPlayedTogether,
          minutesTogether: null,
        });
      }
    });
  } else {
    $(
      'table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even'
    ).each((_, row) => {
      try {
        const playerLink = $(row).find(
          'td.hauptlink a[href*="/profil/spieler/"], td.hauptlink a[href*="/profile/player/"], td a[href*="/profil/spieler/"], td a[href*="/profile/player/"]'
        ).first();
        const href = playerLink.attr('href');
        if (!href) return;
        const tmProfileUrl = makeAbsoluteUrl(href);
        const playerName = playerLink.attr('title') || playerLink.text().trim() || null;
        const hauptlinkText = $(row).find('td.hauptlink').text().trim();
        let position: string | null = null;
        if (playerName && hauptlinkText) {
          const after = hauptlinkText.split(playerName).pop?.()?.trim?.();
          if (after && after.length >= 2 && after.length <= 30) position = convertPosition(after) || after;
        }
        const cells = $(row).find('td');
        let matchesPlayedTogether = 0;
        for (let i = 1; i <= Math.min(3, cells.length - 1); i++) {
          const t = $(cells[i]).text().trim().replace(/,/g, '').replace(/\./g, '');
          const n = parseInt(t, 10);
          if (n >= 1 && n <= 2000) {
            matchesPlayedTogether = n;
            break;
          }
        }
        if (matchesPlayedTogether > 0) {
          teammates.push({
            tmProfileUrl,
            playerName,
            position,
            matchesPlayedTogether,
            minutesTogether: null,
          });
        }
      } catch {
        // skip
      }
    });
  }
  return teammates;
}

function getTotalPagesFromHtml(html: string): number {
  const $ = cheerio.load(html);
  const pages: number[] = [];
  $('div.pager li.tm-pagination__list-item, li.tm-pagination__list-item').each((_, el) => {
    const n = parseInt($(el).text().trim(), 10);
    if (!isNaN(n)) pages.push(n);
  });
  return pages.length > 0 ? Math.max(...pages) : 1;
}

function buildTeammatesPageUrl(baseUrl: string, page: number): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}page=${page}`;
}

export async function handleTeammates(urlParam: string) {
  let url = (urlParam || '').trim();
  if (!url) throw new Error('Missing url parameter');
  if (!url.startsWith('http')) {
    url = url.startsWith('/') ? TRANSFERMARKT_BASE + url : TRANSFERMARKT_BASE + '/' + url;
  }
  const teammatesUrl = buildTeammatesUrl(url);
  if (!teammatesUrl) throw new Error('Invalid player URL');

  // Fetch page 1 and detect total pages
  const firstHtml = await fetchHtmlWithRetry(teammatesUrl);
  const firstPageTeammates = parseTeammatesFromHtml(firstHtml);
  const totalPages = getTotalPagesFromHtml(firstHtml);

  let allTeammates = firstPageTeammates;
  if (totalPages > 1) {
    const MAX_CONCURRENT = 10;
    const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    for (let i = 0; i < remainingPages.length; i += MAX_CONCURRENT) {
      const batch = remainingPages.slice(i, i + MAX_CONCURRENT);
      const results = await Promise.all(
        batch.map((page) => fetchHtmlWithRetry(buildTeammatesPageUrl(teammatesUrl, page))
          .then((html) => parseTeammatesFromHtml(html))
          .catch(() => []))
      );
      for (const pageTeammates of results) {
        allTeammates = allTeammates.concat(pageTeammates);
      }
    }
    // Deduplicate by tmProfileUrl
    const seen = new Set<string>();
    allTeammates = allTeammates.filter((t) => {
      const url = t.tmProfileUrl as string;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  return { teammates: allTeammates.slice(0, 200) };
}

// ─── Transfer Windows ────────────────────────────────────────────────────────
const COUNTRY_TO_CONF: Record<string, string> = {
  'gb-eng': 'UEFA',
  de: 'UEFA',
  es: 'UEFA',
  it: 'UEFA',
  fr: 'UEFA',
  nl: 'UEFA',
  pt: 'UEFA',
  be: 'UEFA',
  tr: 'UEFA',
  ru: 'UEFA',
  il: 'UEFA',
  'gb-sct': 'UEFA',
  gr: 'UEFA',
  at: 'UEFA',
  ch: 'UEFA',
  pl: 'UEFA',
  ua: 'UEFA',
  cz: 'UEFA',
  dk: 'UEFA',
  se: 'UEFA',
  no: 'UEFA',
  ro: 'UEFA',
  bg: 'UEFA',
  hr: 'UEFA',
  rs: 'UEFA',
  hu: 'UEFA',
  sk: 'UEFA',
  si: 'UEFA',
  cy: 'UEFA',
  fi: 'UEFA',
  is: 'UEFA',
  ba: 'UEFA',
  mk: 'UEFA',
  al: 'UEFA',
  me: 'UEFA',
  lu: 'UEFA',
  mt: 'UEFA',
  ie: 'UEFA',
  'gb-wls': 'UEFA',
  'gb-nir': 'UEFA',
  by: 'UEFA',
  ge: 'UEFA',
  am: 'UEFA',
  az: 'UEFA',
  kz: 'UEFA',
  md: 'UEFA',
  lt: 'UEFA',
  ee: 'UEFA',
  lv: 'UEFA',
  xk: 'UEFA',
  ad: 'UEFA',
  fo: 'UEFA',
  li: 'UEFA',
  sm: 'UEFA',
  gi: 'UEFA',
  sa: 'AFC',
  ae: 'AFC',
  qa: 'AFC',
  cn: 'AFC',
  jp: 'AFC',
  kr: 'AFC',
  ir: 'AFC',
  in: 'AFC',
  au: 'AFC',
  th: 'AFC',
  my: 'AFC',
  vn: 'AFC',
  id: 'AFC',
  uz: 'AFC',
  iq: 'AFC',
  kw: 'AFC',
  om: 'AFC',
  bh: 'AFC',
  jo: 'AFC',
  sy: 'AFC',
  lb: 'AFC',
  ph: 'AFC',
  sg: 'AFC',
  hk: 'AFC',
  tw: 'AFC',
  bd: 'AFC',
  np: 'AFC',
  lk: 'AFC',
  ps: 'AFC',
  ye: 'AFC',
  tj: 'AFC',
  tm: 'AFC',
  kg: 'AFC',
  mm: 'AFC',
  mv: 'AFC',
  af: 'AFC',
  br: 'CONMEBOL',
  ar: 'CONMEBOL',
  co: 'CONMEBOL',
  cl: 'CONMEBOL',
  pe: 'CONMEBOL',
  ec: 'CONMEBOL',
  uy: 'CONMEBOL',
  py: 'CONMEBOL',
  bo: 'CONMEBOL',
  ve: 'CONMEBOL',
  mx: 'CONCACAF',
  us: 'CONCACAF',
  ca: 'CONCACAF',
  cr: 'CONCACAF',
  hn: 'CONCACAF',
  pa: 'CONCACAF',
  jm: 'CONCACAF',
  tt: 'CONCACAF',
  gt: 'CONCACAF',
  sv: 'CONCACAF',
  ni: 'CONCACAF',
  cu: 'CONCACAF',
  do: 'CONCACAF',
  ht: 'CONCACAF',
  cw: 'CONCACAF',
  sr: 'CONCACAF',
  eg: 'CAF',
  ma: 'CAF',
  tn: 'CAF',
  za: 'CAF',
  ng: 'CAF',
  dz: 'CAF',
  gh: 'CAF',
  sn: 'CAF',
  ci: 'CAF',
  cm: 'CAF',
  ke: 'CAF',
  zw: 'CAF',
  zm: 'CAF',
  ao: 'CAF',
  cd: 'CAF',
  ml: 'CAF',
  tz: 'CAF',
  et: 'CAF',
  ly: 'CAF',
  sd: 'CAF',
  ug: 'CAF',
  tg: 'CAF',
  bj: 'CAF',
  bf: 'CAF',
  ne: 'CAF',
  gn: 'CAF',
  mg: 'CAF',
  mu: 'CAF',
  bw: 'CAF',
  na: 'CAF',
  mz: 'CAF',
  rw: 'CAF',
  nz: 'OFC',
  fj: 'OFC',
  pg: 'OFC',
  sb: 'OFC',
};

const WINTER_MD: [string, string, number, number][] = [
  ['England', 'gb-eng', 2, 3],
  ['Germany', 'de', 2, 3],
  ['Spain', 'es', 2, 3],
  ['Italy', 'it', 2, 3],
  ['France', 'fr', 2, 3],
  ['Netherlands', 'nl', 2, 3],
  ['Portugal', 'pt', 2, 3],
  ['Belgium', 'be', 2, 3],
  ['Turkey', 'tr', 2, 7],
  ['Russia', 'ru', 2, 21],
  ['Israel', 'il', 2, 3],
  ['Scotland', 'gb-sct', 2, 3],
  ['Greece', 'gr', 2, 3],
  ['Austria', 'at', 2, 3],
  ['Switzerland', 'ch', 2, 3],
  ['Poland', 'pl', 2, 28],
  ['Ukraine', 'ua', 2, 28],
  ['Czech Republic', 'cz', 2, 28],
  ['Denmark', 'dk', 2, 3],
  ['Sweden', 'se', 3, 31],
  ['Norway', 'no', 3, 31],
  ['Romania', 'ro', 2, 28],
  ['Croatia', 'hr', 2, 17],
  ['Serbia', 'rs', 2, 28],
  ['Hungary', 'hu', 2, 28],
  ['Saudi Arabia', 'sa', 2, 18],
  ['UAE', 'ae', 2, 18],
  ['Qatar', 'qa', 1, 31],
  ['China', 'cn', 2, 28],
  ['Japan', 'jp', 3, 14],
  ['South Korea', 'kr', 3, 14],
  ['Australia', 'au', 2, 14],
  ['Brazil', 'br', 4, 7],
  ['Argentina', 'ar', 2, 19],
  ['Colombia', 'co', 2, 28],
  ['Mexico', 'mx', 2, 7],
  ['United States', 'us', 3, 26],
  ['Canada', 'ca', 3, 26],
  ['Egypt', 'eg', 2, 28],
  ['Morocco', 'ma', 2, 28],
  ['South Africa', 'za', 2, 28],
  ['Nigeria', 'ng', 2, 28],
  ['New Zealand', 'nz', 3, 31],
];

const SUMMER_MD: [string, string, number, number][] = [
  ['England', 'gb-eng', 9, 1],
  ['Germany', 'de', 9, 1],
  ['Spain', 'es', 9, 1],
  ['Italy', 'it', 8, 31],
  ['France', 'fr', 9, 1],
  ['Netherlands', 'nl', 9, 1],
  ['Portugal', 'pt', 9, 22],
  ['Belgium', 'be', 9, 1],
  ['Turkey', 'tr', 9, 8],
  ['Russia', 'ru', 9, 1],
  ['Israel', 'il', 9, 1],
  ['Scotland', 'gb-sct', 9, 1],
  ['Greece', 'gr', 9, 1],
  ['Austria', 'at', 9, 1],
  ['Switzerland', 'ch', 9, 1],
  ['Poland', 'pl', 9, 1],
  ['Ukraine', 'ua', 9, 1],
  ['Czech Republic', 'cz', 9, 1],
  ['Denmark', 'dk', 9, 1],
  ['Sweden', 'se', 8, 31],
  ['Norway', 'no', 8, 31],
  ['Romania', 'ro', 9, 8],
  ['Croatia', 'hr', 9, 1],
  ['Serbia', 'rs', 9, 1],
  ['Hungary', 'hu', 9, 1],
  ['Saudi Arabia', 'sa', 9, 15],
  ['UAE', 'ae', 9, 15],
  ['Qatar', 'qa', 9, 15],
  ['China', 'cn', 7, 31],
  ['Japan', 'jp', 8, 28],
  ['South Korea', 'kr', 8, 28],
  ['Australia', 'au', 10, 15],
  ['Brazil', 'br', 8, 4],
  ['Argentina', 'ar', 8, 31],
  ['Colombia', 'co', 8, 31],
  ['Mexico', 'mx', 9, 8],
  ['United States', 'us', 9, 2],
  ['Canada', 'ca', 9, 2],
  ['Egypt', 'eg', 9, 15],
  ['Morocco', 'ma', 9, 15],
  ['South Africa', 'za', 9, 1],
  ['Nigeria', 'ng', 9, 1],
  ['New Zealand', 'nz', 8, 31],
];

function buildTransferWindows(): Record<string, unknown>[] {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const list =
    (month >= 1 && month <= 4) || month >= 10
      ? WINTER_MD.map(([name, code, m, d]) => {
          const closeYear = month >= 10 ? year + 1 : year;
          const closing = new Date(closeYear, m - 1, d);
          return [name, code, closing] as const;
        })
      : SUMMER_MD.map(([name, code, m, d]) => {
          const closing = new Date(year, m - 1, d);
          return [name, code, closing] as const;
        });
  const result: Record<string, unknown>[] = [];
  for (const [countryName, countryCode, closing] of list) {
    const daysLeft = Math.ceil((closing.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) continue;
    const conf = COUNTRY_TO_CONF[countryCode] || 'UEFA';
    result.push({
      countryName,
      countryCode,
      flagUrl: `https://flagcdn.com/w40/${countryCode}.png`,
      confederation: conf,
      daysLeft,
    });
  }
  return result.sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));
}

export function handleTransferWindows() {
  return { windows: buildTransferWindows() };
}

// ─── Returnees (players returning from loan) ─────────────────────────────────
const SAISON_ID_REGEX = /\/saison_id\/\d+/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTeamTransferUrls($: any): string[] {
  const urls: string[] = [];
  $('table.items tbody tr').each((_: number, row: cheerio.Element) => {
    const linkEl = $(row).find('td:nth-child(2) a[href]').first();
    const href = linkEl.attr('href') || '';
    if (!href.includes('/startseite/verein/')) return;
    const transferPath = href
      .replace('/startseite/', '/transfers/')
      .replace(SAISON_ID_REGEX, '');
    urls.push(TRANSFERMARKT_BASE + transferPath);
  });
  return Array.from(new Set(urls));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseReturneeRow(
  $: any,
  row: cheerio.Element,
  departureUrls: Set<string>,
  teamClub: { clubJoinedName: string | null; clubJoinedLogo: string | null }
): Record<string, unknown> | null {
  const rowText = $(row).text();
  const isLoanReturn =
    rowText.includes('End of loan') ||
    rowText.includes('Loan return') ||
    rowText.includes('end of loan');

  if (!isLoanReturn) return null;

  const img = $(row).find('img').first();
  const imageUrl = (img.attr('data-src') || img.attr('src') || '').replace('tiny', 'big');

  const nameEl = $(row).find('td.hauptlink a').first();
  const playerName = nameEl.text().trim() || img.attr('title') || '';
  const playerHref = nameEl.attr('href') || '';
  const playerUrl = playerHref ? (playerHref.startsWith('http') ? playerHref : TRANSFERMARKT_BASE + playerHref) : null;

  if (playerUrl && departureUrls.has(playerUrl)) return null;

  const tds = $(row).find('td');
  const age = tds.eq(5).text().trim() || null;
  const posText = (tds.eq(4).text() || '').replace(/-/g, ' ').trim();
  const playerPosition = convertPosition(posText) || posText || null;

  let marketValue: string | null = null;
  $(row)
    .find('td')
    .each((_: number, td: cheerio.Element) => {
      const t = $(td).text().trim();
      if (t.includes('€') && !t.toLowerCase().includes('loan') && !t.includes('End of loan') && !t.includes('Loan return')) {
        marketValue = t;
        return false;
      }
    });
  if (!marketValue) {
    $(row)
      .find('td.rechts')
      .each((_: number, td: cheerio.Element) => {
        const t = $(td).text().trim();
        if (t.includes('€')) {
          marketValue = t;
          return false;
        }
      });
  }

  let transferDate: string | null = null;
  const rowHtml = $(row).html() || '';
  const dateInTitle = rowHtml.match(/date:\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
  if (dateInTitle) {
    transferDate = dateInTitle[1];
  }
  if (!transferDate) {
    const zentriert = $(row).find('td.zentriert');
    for (let i = 0; i < Math.min(zentriert.length, 5); i++) {
      const t = $(zentriert[i]).text().trim();
      if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) {
        transferDate = t;
        break;
      }
    }
  }
  if (!transferDate) {
    $(row)
      .find('td')
      .each((_: number, td: cheerio.Element) => {
        const t = $(td).text().trim();
        if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) {
          transferDate = t;
          return false;
        }
      });
  }

  const natImg =
    $(row).find('td.zentriert img[title]').first()[0] ||
    $(row)
      .find('td img[alt]')
      .filter((_: number, el: cheerio.Element) => {
        const alt = $(el).attr('alt') || '';
        return alt.length >= 2 && alt.length <= 50;
      })
      .first()[0];
  const playerNationality = natImg ? ($(natImg).attr('title') || $(natImg).attr('alt') || '').trim() || null : null;
  const flagSrc = natImg ? $(natImg).attr('data-src') || $(natImg).attr('src') || '' : '';
  const playerNationalityFlag = flagSrc
    ? makeAbsoluteUrl(flagSrc).replace(/verysmall|tiny/g, 'head')
    : null;

  return {
    playerImage: imageUrl ? makeAbsoluteUrl(imageUrl) : null,
    playerName: playerName || null,
    playerUrl,
    playerAge: age,
    playerPosition,
    playerNationality,
    playerNationalityFlag,
    marketValue: marketValue || null,
    transferDate,
    clubJoinedName: teamClub.clubJoinedName,
    clubJoinedLogo: teamClub.clubJoinedLogo,
  };
}

const TEAM_FETCH_CONCURRENCY = 10;

async function scrapeTeamReturnees(
  teamUrl: string
): Promise<Record<string, unknown>[]> {
  const teamHtml = await fetchHtmlWithRetry(teamUrl);
  const $team = cheerio.load(teamHtml);
  const tables = $team('table.items');

  let clubJoinedName: string | null = null;
  let clubJoinedLogo: string | null = null;
  const clubSection = $team('span.data-header__club, div.data-header__club').first();
  if (clubSection.length) {
    const clubLink = clubSection.find('a[href*="/startseite/verein/"]').first();
    clubJoinedName = (clubLink.attr('title') || clubLink.text() || '').trim() || null;
    const clubImg = clubSection.find('img').first();
    const clubLogoRaw = clubImg.attr('data-src') || clubImg.attr('src') || '';
    clubJoinedLogo = clubLogoRaw ? makeAbsoluteUrl(clubLogoRaw) : null;
  }
  if (!clubJoinedName) {
    clubJoinedName = $team('h1.data-header__headline, div.data-header__headline-wrapper h1').first().text().trim() || null;
  }
  if (!clubJoinedName) {
    const mainHeadline = $team('.main .content-box-headline, .box-headline, h1').first().text().trim();
    if (mainHeadline && !mainHeadline.toLowerCase().includes('transfer')) {
      clubJoinedName = mainHeadline;
    }
  }

  const teamClub = { clubJoinedName, clubJoinedLogo };

  const arrivalsTbody = tables.eq(0).find('tbody');
  const departureTbody = tables.eq(1).find('tbody');

  const departureUrls = new Set<string>();
  departureTbody.find('tr').each((_: number, r: cheerio.Element) => {
    const href = $team(r).find('td.hauptlink a').attr('href') || '';
    if (href) departureUrls.add(TRANSFERMARKT_BASE + href);
  });

  const teamPlayers: Record<string, unknown>[] = [];
  arrivalsTbody.find('tr').each((_: number, row: cheerio.Element) => {
    const p = parseReturneeRow($team, row, departureUrls, teamClub);
    if (p && p.playerUrl) teamPlayers.push(p);
  });
  return teamPlayers;
}

export async function handleReturnees(leagueUrl: string): Promise<{ players: Record<string, unknown>[] }> {
  const html = await fetchHtmlWithRetry(leagueUrl);
  const $ = cheerio.load(html);

  const teamUrls = extractTeamTransferUrls($);
  const all: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < teamUrls.length; i += TEAM_FETCH_CONCURRENCY) {
    const chunk = teamUrls.slice(i, i + TEAM_FETCH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((url) =>
        scrapeTeamReturnees(url).catch(() => [] as Record<string, unknown>[])
      )
    );
    for (const teamPlayers of results) {
      for (const p of teamPlayers) {
        const url = p.playerUrl as string;
        if (url && !seen.has(url)) {
          seen.add(url);
          all.push(p);
        }
      }
    }
  }

  const ENRICH_CONCURRENCY = 5;
  for (let i = 0; i < all.length; i += ENRICH_CONCURRENCY) {
    const chunk = all.slice(i, i + ENRICH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (p) => {
        const url = p.playerUrl as string;
        if (!url) return;
        try {
          const enriched = await enrichReturneeFromProfile(p);
          if (enriched) {
            Object.assign(p, enriched);
          }
        } catch {
          // keep original
        }
      })
    );
    if (i + ENRICH_CONCURRENCY < all.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  all.sort(
    (a, b) =>
      parseMarketValueCF((b.marketValue as string) || '') - parseMarketValueCF((a.marketValue as string) || '')
  );
  return { players: all };
}

const RETURN_DATE_REGEX = /date:\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i;

async function enrichReturneeFromProfile(
  p: Record<string, unknown>
): Promise<Partial<Record<string, unknown>> | null> {
  const url = p.playerUrl as string;
  if (!url) return null;
  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  const result: Partial<Record<string, unknown>> = {};

  // Transfer date: from ribbon title (e.g. "Returnee date: 01/07/2025")
  const ribbon = $('div.data-header_ribbon, div.data-header__ribbon').first();
  const ribbonTitle = ribbon.find('a').attr('title') || ribbon.text() || '';
  const dateMatch = ribbonTitle.match(RETURN_DATE_REGEX);
  if (dateMatch) {
    result.transferDate = dateMatch[1];
  }

  // Market value: always in profile header, regardless of ribbon
  const mvBox = $('div[class*="data-header__box--small"]').text();
  const lastIdx = mvBox.toLowerCase().indexOf('last');
  const marketValue = (lastIdx >= 0 ? mvBox.substring(0, lastIdx) : mvBox).trim();
  if (marketValue && marketValue.includes('€')) {
    result.marketValue = marketValue;
  }

  // Club: from profile header
  const clubSection = $('span.data-header__club, div.data-header__club').first();
  if (clubSection.length) {
    const clubLink = clubSection.find('a[href*="/startseite/verein/"]').first();
    const clubName = (clubLink.attr('title') || clubLink.text() || '').trim();
    if (clubName) result.clubJoinedName = clubName;
    const clubImg = clubSection.find('img').first();
    const clubLogoRaw = clubImg.attr('data-src') || clubImg.attr('src') || '';
    if (clubLogoRaw) result.clubJoinedLogo = makeAbsoluteUrl(clubLogoRaw);
  }

  return Object.keys(result).length ? result : null;
}

const RETURNEES_STREAM_LEAGUES = [
  'https://www.transfermarkt.com/jupiler-pro-league/startseite/wettbewerb/BE1',
  'https://www.transfermarkt.com/eredivisie/startseite/wettbewerb/NL1',
  'https://www.transfermarkt.com/liga-portugal/startseite/wettbewerb/PO1',
  'https://www.transfermarkt.com/super-liga-srbije/startseite/wettbewerb/SER1',
  'https://www.transfermarkt.com/super-league-1/startseite/wettbewerb/GR1',
  'https://www.transfermarkt.com/allsvenskan/startseite/wettbewerb/SE1',
  'https://www.transfermarkt.com/pko-bp-ekstraklasa/startseite/wettbewerb/PL1',
  'https://www.transfermarkt.com/premier-liga/startseite/wettbewerb/UKR1',
  'https://www.transfermarkt.com/liga-portugal-2/startseite/wettbewerb/PO2',
  'https://www.transfermarkt.com/super-lig/startseite/wettbewerb/TR1',
  'https://www.transfermarkt.com/super-league/startseite/wettbewerb/C1',
  'https://www.transfermarkt.com/bundesliga/startseite/wettbewerb/A1',
  'https://www.transfermarkt.com/chance-liga/startseite/wettbewerb/TS1',
  'https://www.transfermarkt.com/superliga/startseite/wettbewerb/RO1',
  'https://www.transfermarkt.com/efbet-liga/startseite/wettbewerb/BU1',
  'https://www.transfermarkt.com/nemzeti-bajnoksag/startseite/wettbewerb/UNG1',
  'https://www.transfermarkt.com/cyprus-league/startseite/wettbewerb/ZYP1',
  'https://www.transfermarkt.com/nike-liga/startseite/wettbewerb/SLO1',
  'https://www.transfermarkt.com/premyer-liqa/startseite/wettbewerb/AZ1',
  'https://www.transfermarkt.com/championship/startseite/wettbewerb/GB2',
  'https://www.transfermarkt.com/serie-a/startseite/wettbewerb/IT1',
  'https://www.transfermarkt.com/serie-b/startseite/wettbewerb/IT2',
  'https://www.transfermarkt.com/2-bundesliga/startseite/wettbewerb/L2',
  'https://www.transfermarkt.com/laliga/startseite/wettbewerb/ES1',
  'https://www.transfermarkt.com/laliga2/startseite/wettbewerb/ES2',
  'https://www.transfermarkt.com/ligue-2/startseite/wettbewerb/FR2',
  'https://www.transfermarkt.com/1-lig/startseite/wettbewerb/TR2',
];

const LEAGUE_PARALLEL = 2;

export async function* handleReturneesStream(): AsyncGenerator<{
  players: Record<string, unknown>[];
  loadedLeagues: number;
  totalLeagues: number;
  isLoading: boolean;
  error?: string;
}> {
  const total = RETURNEES_STREAM_LEAGUES.length;
  const seen = new Set<string>();
  const all: Record<string, unknown>[] = [];

  yield { players: [], loadedLeagues: 0, totalLeagues: total, isLoading: true };

  for (let i = 0; i < total; i += LEAGUE_PARALLEL) {
    const chunk = RETURNEES_STREAM_LEAGUES.slice(i, i + LEAGUE_PARALLEL);
    const results = await Promise.all(
      chunk.map((url) => handleReturnees(url).catch(() => ({ players: [] as Record<string, unknown>[] })))
    );
    for (const { players } of results) {
      for (const p of players) {
        const url = p.playerUrl as string;
        if (url && !seen.has(url)) {
          seen.add(url);
          all.push(p);
        }
      }
    }
    const sorted = [...all].sort(
      (a, b) =>
        parseMarketValueCF((b.marketValue as string) || '') - parseMarketValueCF((a.marketValue as string) || '')
    );
    const loadedCount = Math.min(i + LEAGUE_PARALLEL, total);
    yield { players: sorted, loadedLeagues: loadedCount, totalLeagues: total, isLoading: loadedCount < total };
  }

  const sorted = [...all].sort(
    (a, b) =>
      parseMarketValueCF((b.marketValue as string) || '') - parseMarketValueCF((a.marketValue as string) || '')
  );
  yield { players: sorted, loadedLeagues: total, totalLeagues: total, isLoading: false };
}

/* ═══════════════════════════════════════════════════════════════════════
   NEWS & RUMORS — Transfermarkt rumours + league news scraping
   ═══════════════════════════════════════════════════════════════════════ */

export interface TmRumour {
  playerName: string;
  playerUrl: string;
  playerImage: string;
  position: string;
  age: number;
  nationality: string[];
  currentClub: string;
  currentClubUrl: string;
  currentClubImage: string;
  interestedClub: string;
  interestedClubUrl: string;
  interestedClubImage: string;
  interestedClubLeague: string;
  probability: number | null;
  marketValue: string;
  rumouredDate: string;
  source: 'rumour';
}

const RUMOURS_CACHE: { data: TmRumour[]; ts: number } = { data: [], ts: 0 };
const RUMOURS_CACHE_TTL = 15 * 60 * 1000; // 15 min
const RUMOURS_MAX_PAGES = 15; // fetch up to 15 pages = ~225 rumours

async function scrapeSingleRumoursPage(page: number): Promise<TmRumour[]> {
  const url = `${TRANSFERMARKT_BASE}/geruechte/aktuellegeruechte/statistik/plus/1//page/${page}`;
  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  const rumours: TmRumour[] = [];

  // Rows have class "odd" or "even" directly inside <tbody>
  $('tbody tr.odd, tbody tr.even').each((_i, row) => {
    try {
      const $row = $(row);
      const tds = $row.children('td');
      if (tds.length < 6) return;

      // Col 0: Player cell — nested inline-table with image, name link, position
      const playerCell = $(tds[0]);
      const playerLink = playerCell.find('td.hauptlink a').first();
      const playerName = playerLink.text().trim();
      const playerUrl = makeAbsoluteUrl(playerLink.attr('href') || '');
      // Image uses data-src (lazy) or src
      const imgEl = playerCell.find('img.bilderrahmen-fixed');
      const playerImage = makeAbsoluteUrl(imgEl.attr('data-src') || imgEl.attr('src') || '');
      // Position is in the second <tr> of the inline-table
      const posText = playerCell.find('table.inline-table tr').eq(1).find('td').text().trim();
      const position = convertPosition(posText) || posText;

      // Col 1: Age (zentriert)
      const age = parseInt($(tds[1]).text().trim(), 10) || 0;

      // Col 2: Nationality flags (zentriert)
      const nationality: string[] = [];
      $(tds[2]).find('img.flaggenrahmen').each((_j, img) => {
        const title = $(img).attr('title');
        if (title) nationality.push(title);
      });

      // Col 3: Current club (zentriert, has club badge img with title)
      const curClubImg = $(tds[3]).find('img').first();
      const currentClub = curClubImg.attr('title') || curClubImg.attr('alt') || '';
      const currentClubUrl = makeAbsoluteUrl($(tds[3]).find('a').first().attr('href') || '');
      const currentClubImage = curClubImg.attr('src') || curClubImg.attr('data-src') || '';

      // Col 4: Interested club — nested inline-table with club name + league
      const intCell = $(tds[4]);
      const intClubLink = intCell.find('td.hauptlink a').first();
      const interestedClub = intClubLink.text().trim();
      const interestedClubUrl = makeAbsoluteUrl(intClubLink.attr('href') || '');
      const intClubImg = intCell.find('img').first();
      const interestedClubImage = intClubImg.attr('src') || intClubImg.attr('data-src') || '';
      // League is in the second <tr> of the inline-table
      const leagueLink = intCell.find('table.inline-table tr').eq(1).find('a').first();
      const interestedClubLeague = leagueLink.text().trim();

      // Col 5: Last reply date (rechts)
      const rumouredDate = $(tds[5]).text().trim();

      // Col 6: User assessment — no numeric probability, just "?" symbol
      const probability: number | null = null;

      // No market value in the rumours table
      const marketValue = '';

      // Filter: skip players older than 32
      if (!playerName || age > 32) return;

      rumours.push({
        playerName, playerUrl, playerImage, position, age,
        nationality, currentClub, currentClubUrl, currentClubImage,
        interestedClub, interestedClubUrl, interestedClubImage, interestedClubLeague,
        probability, marketValue, rumouredDate, source: 'rumour',
      });
    } catch { /* skip malformed row */ }
  });

  return rumours;
}

/** Parse market value string like "€3.50m" or "€500k" to numeric euros. Returns 0 on failure. */
function parseMarketValueToEuros(mv: string): number {
  if (!mv) return 0;
  const cleaned = mv.replace(/[^0-9.mkMK€]/g, '');
  const num = parseFloat(cleaned.replace(/[mkMK€]/g, ''));
  if (isNaN(num)) return 0;
  if (/m/i.test(mv)) return num * 1_000_000;
  if (/k/i.test(mv)) return num * 1_000;
  return num;
}

/** Fetch a player's market value from their TM profile page (lightweight). */
async function fetchPlayerMarketValue(playerUrl: string): Promise<string> {
  try {
    const html = await fetchHtmlWithRetry(playerUrl);
    const $ = cheerio.load(html);
    const box = $('div[class*="data-header__box--small"]').text();
    return box.substring(0, box.indexOf('Last')).trim() || '';
  } catch {
    return '';
  }
}

const MAX_MV_EUROS = 4_000_000; // Filter out players above €4M

export async function handleRumours(maxPages = RUMOURS_MAX_PAGES): Promise<TmRumour[]> {
  const now = Date.now();
  if (RUMOURS_CACHE.data.length && now - RUMOURS_CACHE.ts < RUMOURS_CACHE_TTL) {
    return RUMOURS_CACHE.data;
  }

  const pages = Math.min(Math.max(maxPages, 1), 20);
  // Fetch all pages in parallel (batches of 8 to avoid rate-limiting)
  const allPages = Array.from({ length: pages }, (_, i) => i + 1);
  const BATCH = 8;
  const rawRumours: TmRumour[] = [];
  for (let i = 0; i < allPages.length; i += BATCH) {
    const batch = allPages.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(p => scrapeSingleRumoursPage(p)));
    for (const r of results) {
      if (r.status === 'fulfilled') rawRumours.push(...r.value);
    }
  }
  if (!rawRumours.length) {
    RUMOURS_CACHE.data = [];
    RUMOURS_CACHE.ts = now;
    return [];
  }

  // Deduplicate across pages: same player + same interested club = same rumour
  const seenKeys = new Set<string>();
  const allRumours = rawRumours.filter(r => {
    const key = `${r.playerUrl}||${r.interestedClubUrl}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Enrich with market value from player profiles (batches of 20)
  const MV_BATCH = 20;
  for (let i = 0; i < allRumours.length; i += MV_BATCH) {
    const batch = allRumours.slice(i, i + MV_BATCH);
    const mvResults = await Promise.allSettled(
      batch.map(r => fetchPlayerMarketValue(r.playerUrl))
    );
    for (let j = 0; j < mvResults.length; j++) {
      if (mvResults[j].status === 'fulfilled') {
        allRumours[i + j].marketValue = (mvResults[j] as PromiseFulfilledResult<string>).value;
      }
    }
  }

  // Filter out players with market value above €4M (keep those without a value)
  const filtered = allRumours.filter(r => {
    if (!r.marketValue) return true;
    const euros = parseMarketValueToEuros(r.marketValue);
    return euros === 0 || euros <= MAX_MV_EUROS;
  });

  RUMOURS_CACHE.data = filtered;
  RUMOURS_CACHE.ts = now;
  return filtered;
}

/* ── Transfermarkt league news ── */

export interface TmLeagueNewsItem {
  headline: string;
  url: string;
  excerpt: string;
  imageUrl: string | null;
  date: string;
  leagueCode: string;
  leagueName: string;
  country: string;
  countryFlag: string;
  source: 'tm-news';
}

const LEAGUE_NEWS_CONFIG: { code: string; slug: string; name: string; country: string; flag: string }[] = [
  { code: 'ISR1', slug: 'ligat-haal', name: 'Ligat Ha\'al', country: 'Israel', flag: '🇮🇱' },
];

export function getLeagueNewsConfig() {
  return LEAGUE_NEWS_CONFIG;
}

const NEWS_CACHE = new Map<string, { items: TmLeagueNewsItem[]; ts: number }>();
const NEWS_CACHE_TTL = 15 * 60 * 1000;

async function scrapeLeagueNews(league: typeof LEAGUE_NEWS_CONFIG[number]): Promise<TmLeagueNewsItem[]> {
  const url = `${TRANSFERMARKT_BASE}/${league.slug}/news/wettbewerb/${league.code}`;
  const html = await fetchHtmlWithRetry(url);
  const $ = cheerio.load(html);

  const items: TmLeagueNewsItem[] = [];

  // TM news pages use .newsticker__box elements containing a .newsticker__link <a>
  $('.newsticker__box').each((_i, el) => {
    const $el = $(el);
    const linkEl = $el.find('a.newsticker__link').first();
    const href = makeAbsoluteUrl(linkEl.attr('href') || '');
    if (!href) return;

    // Headline: big items use __headline-big, small use __headline
    const headline = ($el.find('.newsticker__headline-big').text().trim()
      || $el.find('.newsticker__headline').text().trim());

    // Date from boxheader (strip any suffix text like "Done Deal")
    const boxheader = $el.find('.newsticker__boxheader, .newsticker__boxheader-big').first();
    // Date is the text directly in the boxheader, not inside the suffix span
    const suffixText = boxheader.find('.newsticker__boxheader-suffix').text().trim();
    let rawDate = boxheader.text().trim();
    if (suffixText) rawDate = rawDate.replace(suffixText, '').trim();

    // Excerpt: big items have teasertext, small have subline  
    const excerpt = ($el.find('.newsticker__teasertext').text().trim()
      || $el.find('.newsticker__subline-big, .newsticker__subline').text().trim());

    // Image from emblem or image containers
    const imageUrl = makeAbsoluteUrl(
      $el.find('.newsticker__emblem-big img, .newsticker__emblem img').first().attr('src') || ''
    ) || null;

    if (headline && !items.some(n => n.url === href)) {
      items.push({
        headline, url: href, excerpt: excerpt || '',
        imageUrl, date: rawDate || '',
        leagueCode: league.code, leagueName: league.name,
        country: league.country, countryFlag: league.flag,
        source: 'tm-news',
      });
    }
  });

  // Filter to last 14 days only
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return items.filter(item => {
    if (!item.date) return false;
    // TM dates look like "07.03.2026 - 14:22"
    const m = item.date.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!m) return true; // keep items we can't parse
    const ts = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`).getTime();
    return !isNaN(ts) && ts >= cutoff;
  });
}

export async function handleLeagueNews(leagueCodes?: string[]): Promise<TmLeagueNewsItem[]> {
  const targetLeagues = leagueCodes?.length
    ? LEAGUE_NEWS_CONFIG.filter(l => leagueCodes.includes(l.code))
    : LEAGUE_NEWS_CONFIG;

  const now = Date.now();
  const toFetch: typeof LEAGUE_NEWS_CONFIG = [];
  const cached: TmLeagueNewsItem[] = [];

  for (const league of targetLeagues) {
    const c = NEWS_CACHE.get(league.code);
    if (c && now - c.ts < NEWS_CACHE_TTL) {
      cached.push(...c.items);
    } else {
      toFetch.push(league);
    }
  }

  // Fetch uncached leagues in parallel (batches of 5 to be polite)
  const BATCH = 5;
  const fresh: TmLeagueNewsItem[] = [];
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(l => scrapeLeagueNews(l)));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value.length) {
        NEWS_CACHE.set(batch[j].code, { items: r.value, ts: now });
        fresh.push(...r.value);
      }
    }
  }

  return [...cached, ...fresh];
}

/* ── Google News RSS feed ── */

export interface GoogleNewsItem {
  headline: string;
  originalHeadline?: string;
  url: string;
  sourceName: string;
  date: string;
  leagueCode: string;
  leagueName: string;
  country: string;
  countryFlag: string;
  source: 'google-news';
}

const GOOGLE_NEWS_QUERIES: { query: string; code: string; name: string; country: string; flag: string; hl?: string; gl?: string; ceid?: string }[] = [
  // English transfer-focused queries — Israel only
  { query: '"Ligat Ha\'al" OR "Israeli Premier League" (transfer OR signing OR loan OR deal)', code: 'ISR1', name: 'Ligat Ha\'al', country: 'Israel', flag: '🇮🇱' },

  // Hebrew Israeli transfer news — site-specific for best quality, "כדורגל" added to reduce basketball/other sport noise
  { query: 'site:sport5.co.il כדורגל (העברה OR חתימה OR חיזוק OR רכש OR השאלה OR מצטרף OR עסקה)', code: 'ISR1', name: 'ליגת העל', country: 'Israel', flag: '🇮🇱', hl: 'he', gl: 'IL', ceid: 'IL:he' },
  { query: 'site:one.co.il כדורגל (העברה OR חתימה OR חיזוק OR רכש OR השאלה OR מצטרף)', code: 'ISR1', name: 'ליגת העל', country: 'Israel', flag: '🇮🇱', hl: 'he', gl: 'IL', ceid: 'IL:he' },
  { query: 'site:sport1.maariv.co.il כדורגל (העברה OR חתימה OR חיזוק OR רכש OR מצטרף OR עסקה)', code: 'ISR1', name: 'ליגת העל', country: 'Israel', flag: '🇮🇱', hl: 'he', gl: 'IL', ceid: 'IL:he' },
  { query: '"ליגת העל" OR "הליגה הלאומית" (חתימה OR חיזוק OR רכש OR מצטרף OR עסקה OR החתימה OR התחזק OR העברה)', code: 'ISR1', name: 'ליגת העל', country: 'Israel', flag: '🇮🇱', hl: 'he', gl: 'IL', ceid: 'IL:he' },
];

const GNEWS_CACHE = new Map<string, { items: GoogleNewsItem[]; ts: number }>();
const GNEWS_CACHE_TTL = 20 * 60 * 1000; // 20 min
const GNEWS_RESULT_CACHE = new Map<string, { items: GoogleNewsItem[]; ts: number }>();

/** Headline relevance filter — keeps only transfer/market related articles */
const TRANSFER_KEYWORDS_EN = /\btransfer|sign(s|ed|ing)|loan(s|ed)?|deal|fee|target|move[sd]?|join[sd]?|buy|sell|contract|free agent|release[sd]?|depart|arriv(e|al)|recruit|bid|offer|swap|scout|reinforce|market value|window|deadline|summer|january|winter\b/i;
const TRANSFER_KEYWORDS_HE = /העברה|חתימה|חיזוק|רכש|השאלה|מצטרף|עסקה|מעוניינת|החתימה|התחזק|שחקן חדש|חלון ההעברות|שוק ההעברות|שחרור|עוזב|שמוע|פיצויים|חוזה|סוכן|ניהול משא/;
const NOISE_KEYWORDS = /\b(ted lasso|video game|fifa (2[0-9]|mobile)|esports?|fantasy football|betting|odds|podcast|recap|highlight|goal of the week|table standing|fixture|schedule|results? round|preview round|matchday|rankings?)\b/i;

/** Big-club headline filter — reject articles where the headline is primarily about a top-5 league giant */
const BIG_CLUB_HEADLINE = /\b(liverpool|arsenal|chelsea|man(chester)?\s*(city|united|utd)|tottenham|spurs|barcelona|barca|real madrid|psg|paris saint.germain|juventus|juve|bayern munich|bayern|inter milan|ac milan|napoli|atletico madrid|newcastle|aston villa|west ham|everton|wolves|bournemouth|crystal palace|brentford|fulham|nottingham forest|leicester|ipswich|southampton|roma|lazio|fiorentina|atalanta|dortmund|borussia|rb leipzig|leverkusen|lyon|marseille|monaco|lille|sociedad|athletic bilbao|villarreal|sevilla|betis|benfica|sporting cp|porto)\b/i;

/** Hebrew big-club filter — same clubs in Hebrew transliteration + global star players */
const BIG_CLUB_HEADLINE_HE = /ב[א]?רצלונה|ב[א]?רסה|ריאל מדריד|צ'?לסי|ליברפול|ארסנל|מנצ'?סטר (סיטי|יונייטד)|טוטנהאם|פ\.?ס\.?ג|פריז סן ז'רמן|יובנטוס|באיירן|אינטר מילאן|מילאן|נאפולי|אתלטיקו מדריד|ניוקאסל|אסטון וילה|ווסטהאם|דורטמונד|לייפציג|לברקוזן|ליון|מארסיי|מונאקו|ליל|סביליה|בנפיקה|פורטו|סלטיק|ריינג'רס|מסי|רונאלדו|CR7|נייאר|אמבפה|הולנד|סאלאח|דה בריינה/;

/** Hebrew non-football noise — basketball, baseball, general sports noise, politics */
const NOISE_KEYWORDS_HE = /כדורסל|יורוליג|NBA|NFL|MLB|גארד מה|סנטר מה|פורוורד מה|ג.י.?ליג|ליגת המשנה|טקסס ריינג.רס|בייסבול|אמריקן פוטבול|כדוריד|טניס|שחייה|אתלטיקה קלה|אולימפי(אדה)?|KSI|יוטיוב(ר)?|טיקטוק(ר)?|אירוויזיון|חמינאי|איראני(ו)?ת|פארסה של האיראני/;

/** Israeli football club names — to verify Hebrew articles are about Israeli football */
const ISRAELI_FOOTBALL_CLUBS = /מכבי (תל.?אביב|חיפה|נתניה|פ\.?ת|הרצליה|בני ריינה)|הפועל (תל.?אביב|באר.?שבע|חיפה|ירושלים|חדרה|רעננה|נוף הגליל|עפולה|פ\.?ת|ראשון|אשקלון|כפר.?שלם|הרצליה|עכו|מרמורק|קטמון)|בית"?ר ירושלים|בני (יהודה|סכנין)|עירוני (טבריה|קריית שמונה|אשדוד|ראשון)|סקציה נס ציונה|הכח|אשדוד|נתניה|ליגת העל|לאומית|ליגה לאומית/;

function isTransferRelevant(headline: string, isLocalSiteQuery = false): boolean {
  if (NOISE_KEYWORDS.test(headline)) return false;
  // Hebrew headlines
  if (/[\u0590-\u05FF]/.test(headline)) {
    // Reject Hebrew non-football noise (basketball, etc.)
    if (NOISE_KEYWORDS_HE.test(headline)) return false;
    // Must have transfer keywords
    if (!TRANSFER_KEYWORDS_HE.test(headline)) return false;
    // If headline mentions a big foreign club but NO Israeli club — reject
    if (BIG_CLUB_HEADLINE_HE.test(headline) && !ISRAELI_FOOTBALL_CLUBS.test(headline)) return false;
    return true;
  }
  // Local-language site queries (Dutch, Turkish, Greek, etc.) — trust the query's own filtering
  // These queries already contain site: restriction + local transfer keywords, so just check English big-club filter
  if (isLocalSiteQuery) {
    if (BIG_CLUB_HEADLINE.test(headline)) return false;
    return true;
  }
  // English headlines: must have transfer keywords AND must NOT be primarily about a big club
  if (!TRANSFER_KEYWORDS_EN.test(headline)) return false;
  if (BIG_CLUB_HEADLINE.test(headline)) return false;
  return true;
}

/** Translate headlines using Google Translate free endpoint (batched + concurrency-limited) */
async function translateHeadlines(texts: string[], targetLang = 'en'): Promise<string[]> {
  if (!texts.length) return [];
  // Batch texts into groups of 15, joined by newline — Google Translate handles multi-line
  const BATCH_SIZE = 15;
  const CONCURRENCY = 5;
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const translateBatch = async (batch: string[]): Promise<string[]> => {
    const joined = batch.join('\n');
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(joined)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return batch;
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map((seg: unknown[]) => seg[0]).join('');
        return translated.split('\n');
      }
      return batch;
    } catch {
      return batch;
    }
  };

  // Run with concurrency limit
  const results: string[][] = new Array(batches.length);
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const res = await Promise.allSettled(chunk.map(b => translateBatch(b)));
    for (let j = 0; j < res.length; j++) {
      const r = res[j];
      results[i + j] = r.status === 'fulfilled' ? r.value : chunk[j];
    }
  }

  const flat = results.flat();
  // Ensure we return exactly the same length as input
  while (flat.length < texts.length) flat.push(texts[flat.length]);
  return flat.slice(0, texts.length);
}

async function fetchGoogleNewsRss(q: typeof GOOGLE_NEWS_QUERIES[number]): Promise<GoogleNewsItem[]> {
  // Add when:30d to restrict results to last 30 days
  const hl = q.hl || 'en';
  const gl = q.gl || 'US';
  const ceid = q.ceid || 'US:en';
  // Detect local-language site queries (site: + non-English locale)
  const isLocalSiteQuery = q.query.startsWith('site:') && hl !== 'en' && hl !== 'he';
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q.query + ' when:14d')}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  const res = await fetch(rssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MGSR-Bot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items: GoogleNewsItem[] = [];
  $('item').each((_i, el) => {
    const $el = $(el);
    const headline = $el.find('title').text().trim();
    const url = $el.find('link').text().trim();
    const sourceName = $el.find('source').text().trim();
    const pubDate = $el.find('pubDate').text().trim();

    // Format date to shorter form
    let date = '';
    if (pubDate) {
      try {
        const d = new Date(pubDate);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        date = `${dd}.${mm}.${d.getFullYear()} · ${hh}:${min}`;
      } catch { date = pubDate; }
    }

    if (headline && url) {
      // Also filter by parsed date — only keep items from last 14 days
      if (pubDate) {
        const age = Date.now() - new Date(pubDate).getTime();
        if (age > 14 * 24 * 60 * 60 * 1000) return; // skip old articles
      }
      // Filter headline for transfer relevance
      if (!isTransferRelevant(headline, isLocalSiteQuery)) return;
      items.push({
        headline, url, sourceName: sourceName || 'Google News',
        date, leagueCode: q.code, leagueName: q.name,
        country: q.country, countryFlag: q.flag,
        source: 'google-news',
      });
    }
  });

  const sliced = items.slice(0, 15);

  return sliced;
}

export async function handleGoogleNews(leagueCodes?: string[], targetLang = 'en'): Promise<GoogleNewsItem[]> {
  // Check result cache first (includes translations)
  const resultKey = `${(leagueCodes || ['all']).join(',')}:${targetLang}`;
  const resultCached = GNEWS_RESULT_CACHE.get(resultKey);
  if (resultCached && Date.now() - resultCached.ts < GNEWS_CACHE_TTL) {
    return resultCached.items;
  }

  const targets = leagueCodes?.length
    ? GOOGLE_NEWS_QUERIES.filter(q => leagueCodes.includes(q.code))
    : GOOGLE_NEWS_QUERIES;

  const now = Date.now();
  const toFetch: typeof GOOGLE_NEWS_QUERIES = [];
  const cached: GoogleNewsItem[] = [];

  for (const q of targets) {
    const cacheKey = `${q.code}:${q.hl || 'en'}:${q.query.slice(0, 30)}`;
    const c = GNEWS_CACHE.get(cacheKey);
    if (c && now - c.ts < GNEWS_CACHE_TTL) {
      cached.push(...c.items);
    } else {
      toFetch.push(q);
    }
  }

  // Fetch RSS in parallel batches of 8 (no translation yet — fast)
  const BATCH = 8;
  const fresh: GoogleNewsItem[] = [];
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(q => fetchGoogleNewsRss(q)));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value.length) {
        const cacheKey = `${batch[j].code}:${batch[j].hl || 'en'}:${batch[j].query.slice(0, 30)}`;
        GNEWS_CACHE.set(cacheKey, { items: r.value, ts: now });
        fresh.push(...r.value);
      }
    }
  }

  // Deduplicate by URL (multiple queries for same league may return same articles)
  const seen = new Set<string>();
  const deduped = [...cached, ...fresh].filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Translate headlines that aren't already in the target language
  const HE_CHARS = /[\u0590-\u05FF]/;
  const needTranslation = deduped.filter(item => {
    if (item.originalHeadline) return false; // already translated (from cache)
    if (targetLang === 'he' && HE_CHARS.test(item.headline)) return false; // already Hebrew
    return true;
  });

  if (needTranslation.length > 0) {
    try {
      const translated = await translateHeadlines(needTranslation.map(it => it.headline), targetLang);
      for (let i = 0; i < needTranslation.length; i++) {
        if (translated[i] && translated[i] !== needTranslation[i].headline) {
          needTranslation[i].originalHeadline = needTranslation[i].headline;
          needTranslation[i].headline = translated[i];
        }
      }
    } catch { /* keep originals on translation failure */ }
  }

  GNEWS_RESULT_CACHE.set(resultKey, { items: deduped, ts: Date.now() });
  return deduped;
}

// ─── Ligat Ha'al Foreign Arrivals Analysis ──────────────────────────────────

interface LigatHaalClub {
  name: string;
  slug: string;
  id: string;
}

/** Fallback clubs for ISR1 if dynamic extraction fails */
const LIGAT_HAAL_CLUBS_FALLBACK: LigatHaalClub[] = [
  { name: 'Maccabi Tel Aviv', slug: 'maccabi-tel-aviv', id: '119' },
  { name: 'Maccabi Haifa', slug: 'maccabi-haifa', id: '1064' },
  { name: 'Hapoel Beer Sheva', slug: 'hapoel-beer-sheva', id: '2976' },
  { name: 'Beitar Jerusalem', slug: 'beitar-jerusalem', id: '3793' },
  { name: 'Hapoel Tel Aviv', slug: 'hapoel-tel-aviv', id: '1017' },
  { name: 'Maccabi Netanya', slug: 'maccabi-netanya', id: '5223' },
  { name: 'Hapoel Haifa', slug: 'hapoel-haifa', id: '810' },
  { name: 'FC Ashdod', slug: 'fc-ashdod', id: '6105' },
  { name: 'Hapoel Jerusalem', slug: 'hapoel-jerusalem', id: '43119' },
  { name: 'Hapoel Petah Tikva', slug: 'hapoel-petah-tikva', id: '262' },
  { name: 'Ironi Kiryat Shmona', slug: 'ironi-kiryat-shmona', id: '6028' },
  { name: 'Ironi Tiberias', slug: 'ironi-tiberias', id: '51070' },
  { name: 'Ihud Bnei Sakhnin', slug: 'ihud-bnei-sachnin', id: '4769' },
  { name: 'Maccabi Bnei Reineh', slug: 'maccabi-bnei-reineh', id: '70178' },
];

async function fetchLigatHaalClubs(): Promise<LigatHaalClub[]> {
  try {
    const html = await fetchHtmlWithRetry(`${TRANSFERMARKT_BASE}/ligat-haal/startseite/wettbewerb/ISR1`);
    const $ = cheerio.load(html);
    const clubs: LigatHaalClub[] = [];
    const seen = new Set<string>();

    $('a[href*="/startseite/verein/"]').each((_, a) => {
      const href = $(a).attr('href') || '';
      const match = href.match(/^\/([^/]+)\/startseite\/verein\/(\d+)/);
      if (!match) return;

      const slug = match[1];
      const id = match[2];
      if (seen.has(id)) return;

      const name = ($(a).attr('title') || $(a).text() || '').trim();
      if (!name || name.length < 2) return;

      seen.add(id);
      clubs.push({ name, slug, id });
    });

    if (clubs.length >= 10) {
      console.log(`[Ligat Ha'al Analysis] Extracted ${clubs.length} clubs from ISR1 league page`);
      return clubs;
    }

    console.warn(`[Ligat Ha'al Analysis] Extracted only ${clubs.length} clubs from ISR1, using fallback list`);
    return LIGAT_HAAL_CLUBS_FALLBACK;
  } catch (e) {
    console.warn('[Ligat Ha\'al Analysis] Failed to load ISR1 clubs dynamically, using fallback list:', e instanceof Error ? e.message : String(e));
    return LIGAT_HAAL_CLUBS_FALLBACK;
  }
}

export interface LigatHaalTransferPlayer {
  playerName: string | null;
  playerAge: number | null;
  playerNationality: string | null;
  playerNationalityCode: string | null;
  playerNationalityFlag: string | null;
  marketValue: number;
  marketValueFormatted: string | null;
  playerPosition: string | null;
  clubJoinedName: string | null;
  clubJoinedLogo: string | null;
  previousClub: string | null;
  previousLeague: string | null;
  transferDate: string | null;
  transferFee: string | null;
  transferFeeValue: number;
  playerImage: string | null;
  tmProfile: string | null;
  source: 'transfer_arrival' | 'free_agent';
}

export interface LigatHaalAnalysisStats {
  totalCount: number;
  totalMarketValue: number;
  avgMarketValue: number;
  totalSpend: number;
  avgSpend: number;
  medianAge: number;
  countByCountry: Record<string, number>;
  countByPreviousLeague: Record<string, number>;
  valueByCountry: Record<string, number>;
}

export interface LigatHaalAnalysisResult {
  window: 'SUMMER_2025' | 'WINTER_2025_2026';
  players: LigatHaalTransferPlayer[];
  stats: LigatHaalAnalysisStats;
  cachedAt: string;
}

/** Parse age from "24 years" or "24" format */
function parseAge(ageStr: string | null): number | null {
  if (!ageStr) return null;
  const match = String(ageStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Extract nationality code from flag URL or use mapping */
function getNationalityCode(nationality: string | null): string | null {
  if (!nationality) return null;
  const nationalityLower = nationality.toLowerCase();
  // Map common nationalities to ISO codes
  const codeMap: Record<string, string> = {
    argentina: 'ar', brazil: 'br', france: 'fr', germany: 'de', italy: 'it',
    spain: 'es', england: 'gb-eng', portugal: 'pt', netherlands: 'nl',
    belgium: 'be', poland: 'pl', turkey: 'tr', serbia: 'rs', croatia: 'hr',
    ukraine: 'ua', romania: 'ro', bulgaria: 'bg', greece: 'gr', austria: 'at',
    sweden: 'se', denmark: 'dk', norway: 'no', finland: 'fi', iceland: 'is',
    czechia: 'cz', 'czech republic': 'cz', slovakia: 'sk', slovenia: 'si',
    hungary: 'hu', israel: 'il', egypt: 'eg', morocco: 'ma',
    'south africa': 'za', cameroon: 'cm', ghana: 'gh', senegal: 'sn',
    mexico: 'mx', colombia: 'co', chile: 'cl', peru: 'pe', uruguay: 'uy',
    paraguay: 'py', bolivia: 'bo', venezuela: 've', ecuador: 'ec',
    usa: 'us', 'united states': 'us', canada: 'ca', japan: 'jp', 'south korea': 'kr',
    korea: 'kr', china: 'cn', australia: 'au', thailand: 'th', vietnam: 'vn',
    indonesia: 'id', philippines: 'ph', 'saudi arabia': 'sa', uae: 'ae', qatar: 'qa',
    iran: 'ir', iraq: 'iq', lebanon: 'lb', palestine: 'ps', jordan: 'jo', 'new zealand': 'nz',
    albania: 'al', 'north macedonia': 'mk', 'bosnia-herzegovina': 'ba', kosovo: 'xk',
    montenegro: 'me', luxembourg: 'lu', malta: 'mt', cyprus: 'cy', ireland: 'ie',
    switzerland: 'ch', liechtenstein: 'li', moldova: 'md', belarus: 'by', georgia: 'ge',
    armenia: 'am', azerbaijan: 'az', kazakhstan: 'kz', uzbekistan: 'uz',
  };
  return codeMap[nationalityLower] || null;
}

/** Parse transfer arrivals table from club transfers page */
function parseTransferArrivals(html: string, clubName: string | null, clubLogo: string | null): LigatHaalTransferPlayer[] {
  const $ = cheerio.load(html);
  const players: LigatHaalTransferPlayer[] = [];
  const seenUrls = new Set<string>();

  // Arrivals table is typically the first table with transfer data
  const tables = $('table.items');
  if (tables.length === 0) return players;

  const arrivalsTable = tables.eq(0); // First table = arrivals
  const rows = arrivalsTable.find('tbody tr, tr.odd, tr.even');

  rows.each((_, row) => {
    try {
      const $row = $(row);
      const cells = $row.find('td');
      if (cells.length < 3) return; // Skip invalid rows

      // Player link and info - be more flexible with selectors
      let playerLink = $row.find('a[href*="/spieler/"], a[href*="/player/"]').first();
      if (!playerLink.length) playerLink = $row.find('td.hauptlink a').first();
      
      const playerHref = playerLink.attr('href') || '';
      if (!playerHref) return;

      const tmProfile = playerHref.startsWith('http') ? playerHref : TRANSFERMARKT_BASE + playerHref;
      if (seenUrls.has(tmProfile)) return;
      seenUrls.add(tmProfile);

      const playerName = playerLink.attr('title') || playerLink.text().trim() || null;
      if (!playerName) return;

      // Get player image
      const playerImg = $row.find('img').first();
      const playerImage = playerImg.attr('data-src') || playerImg.attr('src') || '';

      // Age: look for pattern in all cells
      let playerAge: number | null = null;
      cells.each((_, cell) => {
        if (playerAge) return;
        const val = $(cell).text().trim();
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 15 && parsed < 52) {
          playerAge = parsed;
          return false;
        }
      });

      // Position: look in cells for position text or in inline table
      let playerPosition: string | null = null;
      const inlineTable = $row.find('table.inline-table').first();
      if (inlineTable.length) {
        const posText = inlineTable.find('tr').eq(1).text().replace(/-/g, ' ').trim();
        playerPosition = convertPosition(posText) || posText || null;
      }
      if (!playerPosition) {
        for (let i = 0; i < cells.length; i++) {
          const text = $(cells[i]).text().trim();
          const converted = convertPosition(text);
          if (converted || (text.length > 0 && text.length < 15 && /^[A-Z]/i.test(text))) {
            playerPosition = converted || text;
            break;
          }
        }
      }

      // Nationality and flag - very selective about which img to use
      let playerNationality: string | null = null;
      let playerNationalityFlag: string | null = null;
      
      const allImages = $row.find('img');
      allImages.each((_, imgEl) => {
        if (playerNationality) return;
        const title = $(imgEl).attr('title') || '';
        const alt = $(imgEl).attr('alt') || '';
        const src = ($(imgEl).attr('data-src') || $(imgEl).attr('src') || '').toLowerCase();

        const textContent = title || alt;

        // SKIP: images that are clearly not flags
        if (
          src.includes('/portrait/') ||        // Player portrait
          src.includes('/kaderquad/') ||      // Squad photo
          src.includes('/wappen/') ||         // Team badge
          textContent.includes(' FC') ||      // Club name
          textContent.includes(' SC') ||      // Club name
          textContent.includes(' SV') ||      // Club name
          textContent.includes('U17') ||      // Youth academy
          textContent.includes('U19') ||      // Youth academy
          textContent.includes('U21') ||      // Youth academy
          /Logo|Club|logo|badge|Crest|crest|squad|youth|academy/i.test(textContent) || // Obvious non-flags
          /^\d/.test(textContent) ||          // Starts with number
          /\s\d{2,}\s/.test(textContent)      // Contains multi-digit age
        ) {
          return; // Skip this image
        }

        // Valid country flags: 2-35 chars, contains no URLs, not player/club names
        if (
          textContent.length > 1 &&
          textContent.length < 36 &&
          !textContent.includes('/') &&
          !textContent.includes('\\') &&
          !/-\d+/.test(textContent)  // Not like "Name-123"
        ) {
          playerNationality = textContent;
          const flagSrc = $(imgEl).attr('data-src') || $(imgEl).attr('src') || '';
          playerNationalityFlag = flagSrc ? makeAbsoluteUrl(flagSrc) : null;
          return false;
        }
      });

      // Skip Israeli players
      const nat = playerNationality as string | null;
      if (nat && nat.toLowerCase().includes('israel')) return;

      // Market value - look for € symbol
      let marketValueFormatted: string | null = null;
      let marketValue = 0;
      cells.each((_, cell) => {
        const text = $(cell).text().trim();
        if (text.includes('€')) {
          marketValueFormatted = text;
          marketValue = parseValueToEuros(text);
          return false;
        }
      });

      // Transfer date - very strict matching
      let transferDate: string | null = null;
      cells.each((_, cell) => {
        if (transferDate) return;
        const text = $(cell).text().trim();
        // Only match pure date strings with nothing else
        const match = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
        if (match) {
          const [_, day, month, year] = match;
          // Validate month and day
          const m = parseInt(month, 10);
          const d = parseInt(day, 10);
          if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            transferDate = text;
            return false;
          }
        }
      });

      // Fallback: parse date from descriptive transfer text
      if (!transferDate) {
        const rowText = $row.text().replace(/\s+/g, ' ').trim();
        const dateLabelMatch = rowText.match(/(?:date|started on|on)\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
        if (dateLabelMatch) {
          transferDate = dateLabelMatch[1];
        } else {
          const anyDateMatch = rowText.match(/\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/);
          if (anyDateMatch) {
            transferDate = anyDateMatch[1];
          }
        }
      }

      // Previous club - skip club links and look for source club
      let previousClub: string | null = null;
      const clubLinks = $row.find('a[href*="/startseite/verein/"], a[href*="/club/"]');
      // Skip the first link (which might be the main joined club) and look for others
      if (clubLinks.length > 1) {
        previousClub = clubLinks.eq(1).attr('title') || clubLinks.eq(1).text().trim() || null;
      } else if (clubLinks.length === 1) {
        // If only one link, check if the previous cell text contains transfer info
        const idx = cells.index(clubLinks.eq(0).closest('td')[0]);
        if (idx >= 0 && cells.length > idx) {
          const cellText = $(cells[idx]).text();
          // Look for "Joined from X" or similar patterns
          const joinedMatch = cellText.match(/Joined.+?from\s+(.*?)(?:;|date:|$)/i);
          if (joinedMatch) {
            previousClub = joinedMatch[1].trim();
          }
        }
      }

      // Extra fallback: many TM rows embed date in previous club text or HTML attributes
      if (!transferDate) {
        const inPrevClub = (previousClub || '').match(/date\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
        if (inPrevClub) {
          transferDate = inPrevClub[1];
        }
      }

      if (!transferDate) {
        const rowHtml = $row.html() || '';
        const inHtml = rowHtml.match(/(?:date|started on|on)\s*:\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i)
          || rowHtml.match(/\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/);
        if (inHtml) {
          transferDate = inHtml[1];
        }
      }

      players.push({
        playerName,
        playerAge,
        playerNationality,
        playerNationalityCode: getNationalityCode(playerNationality),
        playerNationalityFlag,
        marketValue,
        marketValueFormatted,
        playerPosition,
        clubJoinedName: clubName,
        clubJoinedLogo: clubLogo,
        previousClub,
        previousLeague: null,
        transferDate,
        playerImage: makeAbsoluteUrl(playerImage.replace('tiny', 'big').replace('medium', 'big')),
        tmProfile,
        source: 'transfer_arrival',
      });
    } catch (e) {
      // Skip malformed rows silently
    }
  });

  return players;
}

/**
 * Analyze foreign player arrivals to Ligat Ha'al in a specific transfer window.
 * Scrapes all 14 clubs' transfer pages and aggregates statistics.
 */
export async function handleLigatHaalAnalysis(
  window: 'SUMMER_2025' | 'WINTER_2025_2026'
): Promise<LigatHaalAnalysisResult> {
  console.log(`[Ligat Ha'al Analysis] Starting analysis for window: ${window}`);

  const seasonId = '2025';
  const windowSelector = window === 'WINTER_2025_2026' ? 'w' : 's';
  const leagueUrl = `${TRANSFERMARKT_BASE}/ligat-haal/transfers/wettbewerb/ISR1?saison_id=${seasonId}&s_w=${windowSelector}`;

  console.log(`[Ligat Ha'al Analysis] Fetching league transfers: ${leagueUrl}`);
  const html = await fetchHtmlWithRetry(leagueUrl);
  const $ = cheerio.load(html);

  const allPlayers: LigatHaalTransferPlayer[] = [];
  const seen = new Set<string>();

  // The ISR1 league transfers page has one section per club.
  // Each club section: h2.content-box-headline (club name) > div.box
  //   containing multiple div.responsive-table:
  //     - First table with TH "In" = arrivals
  //     - Second table with TH "Out" = departures
  // We iterate each club section, find the "In" table, and extract every
  // non-Israeli nationality player row.

  $('h2.content-box-headline').each((_i, h2El) => {
    const clubJoinedName = $(h2El).text().trim();
    if (!clubJoinedName || clubJoinedName === 'Transfer record') return;

    const box = $(h2El).closest('div.box');
    // Find the club logo from the box header area
    const clubLogo = box.find('img[src*="/header/"], img[data-src*="/header/"]').first().attr('data-src')
      || box.find('img[src*="/header/"]').first().attr('src')
      || null;

    // Iterate responsive tables inside this club's box, find the "In" table
    box.find('div.responsive-table').each((_ti, tbl) => {
      const firstTh = $(tbl).find('tr').first().find('th').first().text().trim();
      if (firstTh !== 'In') return; // skip "Out" tables

      // Get all data rows (not header rows, has multiple TDs)
      const playerRows = $(tbl).find('tr').filter((_ri, row) => {
        return $(row).find('th').length === 0 && $(row).find('td').length > 2;
      });

      playerRows.each((_ri, row) => {
        const $row = $(row);

        // TD[0]: Player name + profile link
        const playerLink = $row.find('td').first().find('a[href*="/profil/spieler/"]').first();
        const playerHref = playerLink.attr('href') || '';
        if (!playerHref) return;

        const tmProfile = playerHref.startsWith('http') ? playerHref : `${TRANSFERMARKT_BASE}${playerHref}`;

        // Dedupe by profile URL
        if (seen.has(tmProfile)) return;
        seen.add(tmProfile);

        const playerName = playerLink.text().trim() || playerLink.attr('title') || null;
        if (!playerName) return;

        // TD[2]: Nationality flag image (class nat-transfer-cell)
        const natImg = $row.find('td[class*="nat-transfer-cell"] img').first();
        const playerNationality = natImg.attr('title') || natImg.attr('alt') || null;

        // Skip Israeli nationals
        if (playerNationality && playerNationality.toLowerCase().includes('israel')) return;

        const nationalityFlag = natImg.attr('data-src') || natImg.attr('src') || '';

        // TD[1]: Age
        const ageText = $row.find('td[class*="alter-transfer-cell"]').first().text().trim();

        // TD[3]/TD[4]: Position
        const positionFull = $row.find('td[class*="pos-transfer-cell"]').first().text().trim();
        const positionShort = $row.find('td[class*="kurzpos-transfer-cell"]').first().text().trim();

        // TD[5]: Market value
        const marketValueFormatted = $row.find('td[class*="mw-transfer-cell"]').first().text().trim() || null;
        const marketValue = parseValueToEuros(marketValueFormatted || '');

        // TD[6]-TD[7]: Previous club (the "Left" column - where they came FROM)
        const prevClubLink = $row.find('td[class*="verein-flagge-transfer-cell"] a').first();
        const previousClub = (prevClubLink.attr('title') || prevClubLink.text() || '').trim() || null;

        // TD[8]: Fee (last TD in the row - class varies between windows)
        const allTds = $row.find('td');
        const feeText = allTds.last().text().trim() || null;
        const feeValue = parseFeeToEuros(feeText);

        // Player image from first TD
        const playerImg = $row.find('td').first().find('img').first().attr('data-src')
          || $row.find('td').first().find('img').first().attr('src')
          || null;

        allPlayers.push({
          playerName,
          playerAge: parseAge(ageText),
          playerNationality,
          playerNationalityCode: getNationalityCode(playerNationality),
          playerNationalityFlag: nationalityFlag ? makeAbsoluteUrl(nationalityFlag) : null,
          marketValue,
          marketValueFormatted,
          playerPosition: convertPosition(positionFull || positionShort) || positionFull || positionShort || null,
          clubJoinedName,
          clubJoinedLogo: clubLogo ? makeAbsoluteUrl(clubLogo) : null,
          previousClub,
          previousLeague: null,
          transferDate: null,
          transferFee: feeText,
          transferFeeValue: feeValue,
          playerImage: playerImg ? makeAbsoluteUrl(playerImg.replace('tiny', 'big').replace('medium', 'big')) : null,
          tmProfile,
          source: 'transfer_arrival',
        });
      });
    });
  });

  console.log(`[Ligat Ha'al Analysis] Parsed ${allPlayers.length} foreign arrivals from ISR1 league page`);

  // Calculate statistics
  const totalMV = allPlayers.reduce((sum, p) => sum + p.marketValue, 0);
  const totalFees = allPlayers.reduce((sum, p) => sum + p.transferFeeValue, 0);
  const stats: LigatHaalAnalysisStats = {
    totalCount: allPlayers.length,
    totalMarketValue: totalMV,
    avgMarketValue: allPlayers.length > 0 ? Math.round(totalMV / allPlayers.length) : 0,
    totalSpend: totalFees,
    avgSpend: allPlayers.length > 0 ? Math.round(totalFees / allPlayers.length) : 0,
    medianAge: 0,
    countByCountry: {},
    countByPreviousLeague: {},
    valueByCountry: {},
  };

  // Calculate median age
  const ages = allPlayers.filter((p) => p.playerAge).map((p) => p.playerAge as number);
  if (ages.length > 0) {
    ages.sort((a, b) => a - b);
    stats.medianAge = ages.length % 2 === 0
      ? Math.round((ages[ages.length / 2 - 1] + ages[ages.length / 2]) / 2)
      : ages[Math.floor(ages.length / 2)];
  }

  // Aggregate by country
  for (const player of allPlayers) {
    if (player.playerNationality) {
      stats.countByCountry[player.playerNationality] = (stats.countByCountry[player.playerNationality] || 0) + 1;
      stats.valueByCountry[player.playerNationality] = (stats.valueByCountry[player.playerNationality] || 0) + player.marketValue;
    }
  }

  console.log(`[Ligat Ha'al Analysis] Statistics calculated: ${stats.totalCount} arrivals, €${stats.totalMarketValue} total value`);

  return {
    window,
    players: allPlayers,
    stats,
    cachedAt: new Date().toISOString(),
  };
}
