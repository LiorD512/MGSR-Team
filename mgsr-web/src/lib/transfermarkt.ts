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

  const natEl = $('[itemprop=nationality] img').first();
  const nationality = natEl.attr('title') || 'Unknown';
  const nationalityFlag = (natEl.attr('src') || '').replace('verysmall', 'head').replace('tiny', 'head');

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

  return {
    tmProfile: url,
    fullName,
    height,
    age,
    positions,
    profileImage: makeAbsoluteUrl(profileImage),
    nationality,
    nationalityFlag: makeAbsoluteUrl(nationalityFlag),
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
        assists = nums[2] ?? 0;
        const last = nums[nums.length - 1];
        if (last != null && last > 100) minutes = last;
        else if (nums.length >= 6) minutes = nums[5] ?? 0;
        else if (nums.length >= 4) minutes = nums[3] ?? 0;
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

export async function handleTeammates(urlParam: string) {
  let url = (urlParam || '').trim();
  if (!url) throw new Error('Missing url parameter');
  if (!url.startsWith('http')) {
    url = url.startsWith('/') ? TRANSFERMARKT_BASE + url : TRANSFERMARKT_BASE + '/' + url;
  }
  const teammatesUrl = buildTeammatesUrl(url);
  if (!teammatesUrl) throw new Error('Invalid player URL');

  const html = await fetchHtmlWithRetry(teammatesUrl);
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

  return { teammates: teammates.slice(0, 200) };
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
