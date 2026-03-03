const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const https = require('https');
const { URL } = require('url');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 8080;
const TRANSFERMARKT_BASE = 'https://www.transfermarkt.com';

// CORS first - must run before any routes
app.use(cors({ origin: true }));
app.use(express.json());

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const FETCH_TIMEOUT_MS = 60000; // 60s - Transfermarkt can be slow

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

async function fetchHtmlWithRetry(url, maxRetries = 2) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

function makeAbsoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return TRANSFERMARKT_BASE + url;
  if (url.startsWith('http')) return url;
  return url;
}

function convertPosition(s) {
  const map = {
    'Goalkeeper': 'GK', 'Left Back': 'LB', 'Centre Back': 'CB', 'Right Back': 'RB',
    'Defensive Midfield': 'DM', 'Central Midfield': 'CM', 'Attacking Midfield': 'AM',
    'Right Winger': 'RW', 'Left Winger': 'LW', 'Centre Forward': 'CF', 'Second Striker': 'SS',
    'Left Midfield': 'LM', 'Right Midfield': 'RM',
  };
  return map[s] || s || '';
}

// ─── Search ────────────────────────────────────────────────────────────────
app.get('/api/transfermarkt/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json({ players: [] });
    }
    const encoded = encodeURIComponent(q);
    const url = `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encoded}`;
    const html = await fetchHtmlWithRetry(url);
    const $ = cheerio.load(html);

    const players = [];
    const playerSection = $('div.box').filter((_, el) => {
      return $(el).find('h2.content-box-headline').text().toLowerCase().includes('players');
    }).first();

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
          .replace('verysmall', 'head').replace('tiny', 'head');
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
      } catch (e) {
        // skip row
      }
    });

    res.json({ players });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

// ─── IFA club search (for Youth Add Request) ───────────────────────────────────
const IFA_BASE = 'https://www.football.org.il';
const IFA_CURRENT_SEASON_ID = '27';

function extractTeamIdFromLink(link) {
  if (!link || !link.includes('team-details') || !link.includes('team_id=')) return null;
  const m = link.match(/team_id=(\d+)/);
  const id = m ? m[1] : null;
  if (!id || id === '0') return null;
  return id;
}

function extractClubNameFromTitle(title) {
  if (!title) return '';
  const trimmed = (title.split('|')[0] || '')
    .replace(/\s*-\s*football\.org\.il.*$/i, '')
    .replace(/\s*\|\s*התאחדות.*$/i, '')
    .replace(/\s*-\s*ההתאחדות.*$/i, '')
    .trim();
  return trimmed || title;
}

function isIFAGenericPage(clubName) {
  if (!clubName || !clubName.trim()) return true;
  const t = clubName.trim();
  if (t.includes('ההתאחדות לכדורגל בישראל') && !t.match(/מכבי|הפועל|בני|ביתר|חרות|סקציה|הכח|עירוני|פתח|תקווה|חיפה|תל אביב|ירושלים|באר שבע|נתניה|אשדוד|ראשון|פתח תקווה/i)) return true;
  if (/^ההתאחדות לכדורגל בישראל\s*[-–]\s*(פרטי קבוצה|מועדונים)\s*$/i.test(t)) return true;
  if (/^פרטי קבוצה\s*$/i.test(t) || /^מועדונים\s*$/i.test(t)) return true;
  if (/^Israel Football Association\s*[-–]\s*(Team Details|Clubs)\s*$/i.test(t)) return true;
  if (/^Israel Football Association\s*$/i.test(t)) return true;
  if (/^Team Details\s*$/i.test(t) || /^Clubs\s*$/i.test(t)) return true;
  return false;
}

function titleMatchesQuery(clubName, query) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return true;
  const lower = clubName.toLowerCase();
  const hebrewQuery = query.replace(/[a-z]/gi, '').trim();
  for (const w of words) {
    if (lower.includes(w)) return true;
  }
  if (hebrewQuery && clubName.includes(hebrewQuery)) return true;
  return false;
}

async function fetchTeamFullTitle(teamId) {
  try {
    const url = `${IFA_BASE}/team-details/?team_id=${teamId}&season_id=${IFA_CURRENT_SEASON_ID}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim();
    return title ? extractClubNameFromTitle(title) : null;
  } catch {
    return null;
  }
}

app.get('/api/ifa/club-search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ clubs: [] });
    }
    const serpKey = process.env.SERPAPI_KEY;
    if (!serpKey || !serpKey.trim()) {
      console.warn('[IFA] No SERPAPI_KEY — cannot search IFA clubs');
      return res.json({ clubs: [] });
    }

    const isHebrew = /[\u0590-\u05FF]/.test(q);
    const clubMap = new Map();

    const runSearch = async (searchQuery, extraParams = {}) => {
      try {
        const url = new URL('https://serpapi.com/search.json');
        url.searchParams.set('engine', 'google');
        url.searchParams.set('q', searchQuery);
        url.searchParams.set('api_key', serpKey.trim());
        url.searchParams.set('num', '15');
        url.searchParams.set('gl', 'il');
        url.searchParams.set('hl', extraParams.hl ?? (isHebrew ? 'he' : 'en'));
        for (const [k, v] of Object.entries(extraParams)) {
          if (k === 'hl') continue;
          if (v) url.searchParams.set(k, v);
        }

        const resp = await fetch(url.toString(), {
          headers: { 'User-Agent': 'MGSR/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        const data = await resp.json();
        const results = data.organic_results || [];
        for (const r of results) {
          const link = r.link || '';
          const teamId = extractTeamIdFromLink(link);
          if (!teamId) continue;
          const clubName = extractClubNameFromTitle(r.title || '');
          if (!clubName || clubName.length < 2) continue;
          if (isIFAGenericPage(clubName)) continue;
          if (!titleMatchesQuery(clubName, q)) continue;
          if (!clubMap.has(teamId)) {
            const hasAgeGroup = /under\s*\d+|עד\s*גיל|גיל\s*\d+|u\d+|u-\d+/i.test(clubName);
            clubMap.set(teamId, { clubName, fromSerp: !hasAgeGroup });
          }
        }
      } catch (err) {
        console.error('[IFA] Club search error:', err.message);
      }
    };

    const quotedQ = q.includes(' ') ? `"${q}"` : q;
    await runSearch(`site:football.org.il inurl:team_id ${quotedQ}`);
    if (clubMap.size < 5 && !isHebrew) {
      await runSearch(`site:football.org.il inurl:team_id ${quotedQ} קבוצה`, { hl: 'he' });
    }
    if (clubMap.size < 5 && isHebrew) {
      await runSearch(`site:football.org.il inurl:team_id ${quotedQ} team`);
    }
    if (clubMap.size < 5) {
      await runSearch(`site:football.org.il team-details ${quotedQ}`);
    }

    const teamIdsToEnrich = Array.from(clubMap.entries())
      .filter(([, v]) => v.fromSerp)
      .map(([teamId]) => teamId)
      .slice(0, 12);

    if (teamIdsToEnrich.length > 0) {
      const enriched = await Promise.all(
        teamIdsToEnrich.map(async (teamId) => {
          const full = await fetchTeamFullTitle(teamId);
          return { teamId, full };
        })
      );
    for (const { teamId, full } of enriched) {
      if (full && !isIFAGenericPage(full) && titleMatchesQuery(full, q)) {
        const entry = clubMap.get(teamId);
        if (entry) clubMap.set(teamId, { clubName: full, fromSerp: false });
      }
    }
  }

    const clubs = Array.from(clubMap.entries())
      .filter(([, { clubName }]) => !isIFAGenericPage(clubName) && titleMatchesQuery(clubName, q))
      .map(([teamId, { clubName }]) => ({
      clubName,
      clubCountry: 'Israel',
      clubTmProfile: `${IFA_BASE}/team-details/?team_id=${teamId}&season_id=${IFA_CURRENT_SEASON_ID}`,
    }));

    res.json({ clubs });
  } catch (err) {
    console.error('IFA club search error:', err.message);
    res.status(500).json({ error: err.message || 'IFA club search failed' });
  }
});

// ─── IFA player profile fetch (Playwright — bypasses 403 when Vercel direct fetch blocked) ───
function mapHebrewPositionIFA(raw) {
  const posMap = {
    שוער: 'GK', 'בלם מרכזי': 'CB', 'מגן ימני': 'RB', 'מגן שמאלי': 'LB',
    'קשר הגנתי': 'DM', 'קשר מרכזי': 'CM', 'קשר התקפי': 'AM',
    'כנף ימני': 'RW', 'כנף שמאלי': 'LW', 'חלוץ מרכזי': 'CF', חלוץ: 'ST',
    'חלוץ משני': 'SS', בלם: 'CB', מגן: 'CB', קשר: 'CM', כנף: 'RW',
  };
  const lower = (raw || '').trim();
  if (posMap[lower]) return [posMap[lower]];
  const positions = [];
  for (const [he, code] of Object.entries(posMap)) {
    if (lower.includes(he) && !positions.includes(code)) positions.push(code);
  }
  return positions.length ? positions : [raw];
}

function parseIFAProfileHtml(html, url) {
  const $ = cheerio.load(html);
  const profile = { fullName: '', ifaUrl: url };
  const pidMatch = url.match(/player_id=(\d+)/);
  if (pidMatch) profile.ifaPlayerId = pidMatch[1];

  const cardTitle = $('.new-player-card_title').first().text().trim();
  const h1 = cardTitle || $('h1').first().text().trim();
  if (h1) {
    profile.fullNameHe = h1;
    const parts = h1.split(/\s*[-–]\s*/);
    const hePart = parts.find((p) => /[\u0590-\u05FF]/.test(p));
    const enPart = parts.find((p) => /^[A-Za-z\s]+$/.test((p || '').trim()));
    if (hePart) profile.fullNameHe = hePart.trim();
    if (enPart) profile.fullName = enPart.trim();
    else profile.fullName = h1;
  }
  if (!profile.fullName) {
    const nameEl = $('.player-name, .player-header-name').first().text().trim();
    if (nameEl) {
      profile.fullName = nameEl;
      if (/[\u0590-\u05FF]/.test(nameEl)) profile.fullNameHe = nameEl;
    }
  }

  const imgSrc = $('.new-player-card_img-container img').first().attr('src') ||
    $('.player-image img, .player-photo img, .player-header img').first().attr('src');
  if (imgSrc && imgSrc.trim()) {
    profile.profileImage = imgSrc.startsWith('http') ? imgSrc : IFA_BASE + imgSrc;
  }

  $('.new-player-card_data-list li').each((_, el) => {
    const text = $(el).text().trim();
    const dobM = text.match(/תאריך לידה[:\s]*(\d{1,2}\/\d{4}|\d{1,2}[./]\d{1,2}[./]\d{4})/);
    if (dobM) {
      profile.dateOfBirth = dobM[1];
      const parts = dobM[1].split(/[./]/);
      if (parts.length >= 2) {
        const year = parseInt(parts[parts.length - 1], 10);
        profile.age = String(new Date().getFullYear() - year);
      }
    }
    const natM = text.match(/אזרחות[:\s]*(.+)/);
    if (natM) profile.nationality = natM[1].trim();
  });

  const infoText = $('body').text();
  if (!profile.dateOfBirth) {
    const dobM = infoText.match(/תאריך לידה[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})/) ||
      infoText.match(/תאריך לידה[:\s]*(\d{1,2}\/\d{4})/);
    if (dobM) {
      profile.dateOfBirth = dobM[1];
      const parts = dobM[1].split(/[./]/);
      if (parts.length >= 2) {
        const year = parseInt(parts[parts.length - 1], 10);
        profile.age = String(new Date().getFullYear() - year);
      }
    }
  }
  if (!profile.nationality) {
    const natM = infoText.match(/אזרחות[:\s]*([^\n,]+)/);
    if (natM) profile.nationality = natM[1].trim();
  }

  const teamSpan = $('.new-player-data_title .js-container-title span, .new-player-data_title span').first().text().trim();
  if (teamSpan) profile.currentClub = teamSpan;
  if (!profile.currentClub) {
    const clubM = infoText.match(/קבוצה[:\s]*([^\n,]+)/);
    if (clubM) profile.currentClub = clubM[1].trim();
  }
  const divM = infoText.match(/מחלקה[:\s]*([^\n,]+)/) || infoText.match(/מסגרת[:\s]*([^\n,]+)/);
  if (divM) profile.academy = divM[1].trim();
  const posM = infoText.match(/תפקיד[:\s]*([^\n,]+)/) || infoText.match(/עמדה[:\s]*([^\n,]+)/);
  if (posM) profile.positions = mapHebrewPositionIFA(posM[1]);
  const footM = infoText.match(/רגל[:\s]*(ימין|שמאל|שתיים)/);
  if (footM) profile.foot = { ימין: 'Right', שמאל: 'Left', שתיים: 'Both' }[footM[1]] || footM[1];
  const heightM = infoText.match(/גובה[:\s]*(\d{2,3})/);
  if (heightM) profile.height = heightM[1] + ' cm';

  const stats = { season: IFA_CURRENT_SEASON_ID };
  const statsTable = $('table').filter((_, t) => $(t).text().includes('משחקים') || $(t).text().includes('שערים')).first();
  if (statsTable.length) {
    const cells = statsTable.find('tr').eq(1).find('td');
    if (cells.length >= 3) {
      stats.matches = parseInt(cells.eq(0).text().trim(), 10) || 0;
      stats.goals = parseInt(cells.eq(1).text().trim(), 10) || 0;
      stats.assists = parseInt(cells.eq(2).text().trim(), 10) || 0;
      if (cells.length >= 4) stats.yellowCards = parseInt(cells.eq(3).text().trim(), 10) || 0;
      if (cells.length >= 5) stats.redCards = parseInt(cells.eq(4).text().trim(), 10) || 0;
    }
  }
  if (!stats.matches) {
    const mm = infoText.match(/משחקים[:\s]*(\d+)/);
    const gm = infoText.match(/שערים[:\s]*(\d+)/);
    const am = infoText.match(/בישולים[:\s]*(\d+)/) || infoText.match(/מסירות מכריעות[:\s]*(\d+)/);
    if (mm) stats.matches = parseInt(mm[1], 10);
    if (gm) stats.goals = parseInt(gm[1], 10);
    if (am) stats.assists = parseInt(am[1], 10);
  }
  if (stats.matches || stats.goals) profile.stats = stats;

  return profile;
}

app.post('/api/ifa/fetch-profile', async (req, res) => {
  let browser;
  try {
    const url = (req.body?.url || '').trim();
    if (!url || !/^https?:\/\/(www\.)?football\.org\.il\/(en\/)?players\/player\/\?player_id=\d+/.test(url)) {
      return res.status(400).json({ error: 'Invalid IFA profile URL' });
    }
    const normalizedUrl = url.replace(/football\.org\.il\/en\/players\//, 'football.org.il/players/');

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: { 'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8' },
    });
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const html = await page.content();
    await browser.close();
    browser = null;

    const profile = parseIFAProfileHtml(html, normalizedUrl);
    res.json(profile);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('[IFA fetch-profile]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch IFA profile' });
  }
});

// ─── Club search (for Add Request) ───────────────────────────────────────────
app.get('/api/transfermarkt/club-search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ clubs: [] });
    }
    const encoded = encodeURIComponent(q);
    const url = `${TRANSFERMARKT_BASE}/schnellsuche/ergebnis/schnellsuche?query=${encoded}`;
    const html = await fetchHtmlWithRetry(url);
    const $ = cheerio.load(html);

    const clubs = [];
    const clubSection = $('div.box').filter((_, el) => {
      const headline = $(el).find('h2.content-box-headline').text().toLowerCase();
      return headline.includes('verein') || headline.includes('club') || headline.includes('clubs');
    }).first();

    if (!clubSection.length) {
      return res.json({ clubs: [] });
    }
    clubSection.find('table.items tr.odd, table.items tr.even').each((_, row) => {
      try {
        const $row = $(row);
        const clubImg = $row.find('img').first();
        const clubLogo = (clubImg.attr('src') || '').replace('tiny', 'head').replace('small', 'head');
        const mainLink = $row.find('td.hauptlink a').first();
        const href = mainLink.attr('href') || '';
        const clubTmProfile = href ? (href.startsWith('http') ? href : TRANSFERMARKT_BASE + href) : null;
        const clubName = mainLink.text().trim() || clubImg.attr('alt') || clubImg.attr('title') || $row.find('td.hauptlink').text().trim();
        if (!clubName) return;

        const tds = $row.find('td.zentriert');
        const lastTdImg = tds.last().find('img').first();
        const countryImg = lastTdImg.length ? lastTdImg : $row.find('td.zentriert img').last();
        const clubCountry = countryImg.attr('title') || countryImg.attr('alt') || tds.last().text().trim() || '';
        const clubCountryFlag = (countryImg.attr('data-src') || countryImg.attr('src') || '')
          .replace('tiny', 'head').replace('verysmall', 'head');

        clubs.push({
          clubName: clubName.trim(),
          clubLogo: makeAbsoluteUrl(clubLogo),
          clubTmProfile,
          clubCountry: clubCountry.trim() || null,
          clubCountryFlag: clubCountryFlag ? makeAbsoluteUrl(clubCountryFlag) : null,
        });
      } catch (e) {
        // skip row
      }
    });

    res.json({ clubs });
  } catch (err) {
    console.error('Club search error:', err.message);
    res.status(500).json({ error: err.message || 'Club search failed' });
  }
});

// ─── Player details ─────────────────────────────────────────────────────────
app.get('/api/transfermarkt/player', async (req, res) => {
  try {
    let url = req.query.url || '';
    url = url.trim();
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    if (!url.startsWith('http')) {
      url = url.startsWith('/') ? TRANSFERMARKT_BASE + url : TRANSFERMARKT_BASE + '/' + url;
    }
    const html = await fetchHtmlWithRetry(url);
    const $ = cheerio.load(html);

    const natEl = $('[itemprop=nationality] img').first();
    const nationality = natEl.attr('title') || 'Unknown';
    const nationalityFlag = (natEl.attr('src') || '')
      .replace('verysmall', 'head').replace('tiny', 'head');

    const height = $('[itemprop=height]').text().trim() || 'Unknown';
    const marketValueBox = $('div[class*="data-header__box--small"]').text();
    const marketValue = marketValueBox.substring(0, marketValueBox.indexOf('Last')).trim() || '';

    const contractLabel = $('span.data-header__label').text();
    const contractExpires = contractLabel.includes(':') ? contractLabel.split(':').pop().trim() : '';

    let positions = [];
    $('div.detail-position__box dd').each((_, el) => {
      const p = $(el).text().replace(/-/g, ' ').trim();
      positions.push(convertPosition(p) || p);
    });
    if (positions.length === 0) {
      const fallback = $('ul.data-header__items').eq(1).text();
      const afterColon = fallback.split(':').pop().trim();
      if (afterColon) positions = [convertPosition(afterColon) || afterColon];
    }

    const clubLink = $('span.data-header__club a');
    const clubName = clubLink.attr('title') || '';
    const clubHref = clubLink.attr('href') || '';
    const clubTmProfile = clubHref ? TRANSFERMARKT_BASE + clubHref : '';
    const clubLogoEl = $('div.data-header__box--big img');
    const clubLogo = (clubLogoEl.attr('srcset') || '').split('1x')[0]?.trim() || clubLogoEl.attr('src') || '';
    const clubCountry = $('div.data-header__club-info span.data-header__label img').attr('title') || '';

    const fullName = $('h1.data-header__headline').text().trim()
      || $('div.data-header__headline-wrapper h1').text().trim()
      || ($('meta[property="og:title"]').attr('content') || '').split(' - ')[0].trim()
      || '';

    const profileImage = $('div.data-header__profile-container img').first().attr('src')
      || $('div.data-header__profile-container img').attr('src')
      || '';

    const ageEl = $('span[itemprop=birthDate]').first().text();
    const age = ageEl ? (ageEl.match(/\((\d+)\)/) || [])[1] || ageEl.trim() : '';

    const ribbon = $('div[class*="ribbon"]').first().text().toLowerCase();
    const loanLink = $('a[title*="on loan from"]').attr('title') || '';
    const isOnLoan = ribbon.includes('on loan') || ribbon.includes('leihe') || ribbon.includes('ausgeliehen') || loanLink.includes('on loan');
    const onLoanFromClub = isOnLoan ? (loanLink.split('from')[1] || '').trim() : null;

    let foot = '';
    $('span.info-table__content--regular').each((_, el) => {
      const t = $(el).text().toLowerCase();
      if (t.includes('foot') || t.includes('preferred foot')) {
        foot = $(el).next().text().trim() || '';
        return false;
      }
    });

    const result = {
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

    res.json(result);
  } catch (err) {
    console.error('Player details error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch player' });
  }
});

// ─── Player performance stats (leistungsdaten) ─────────────────────────────────
app.get('/api/transfermarkt/performance', async (req, res) => {
  try {
    let url = req.query.url || '';
    url = url.trim();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const currentSeason = month >= 8 ? year : year - 1;
    const seasonYear = parseInt(req.query.season, 10) || currentSeason;
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    if (!url.startsWith('http')) {
      url = url.startsWith('/') ? TRANSFERMARKT_BASE + url : TRANSFERMARKT_BASE + '/' + url;
    }
    const perfUrl = url
      .replace(/\/profil\//, '/leistungsdaten/')
      .replace(/\/player\//, '/leistungsdaten/');
    const urlWithSeason = perfUrl.includes('saison')
      ? perfUrl
      : `${perfUrl.replace(/\/$/, '')}/saison/${seasonYear}`;

    const html = await fetchHtmlWithRetry(urlWithSeason);
    const $ = cheerio.load(html);

    let appearances = 0;
    let goals = 0;
    let assists = 0;
    let minutes = 0;

    $('table.items tbody tr, table.items tr').each((_, row) => {
      const $row = $(row);
      const firstCell = $row.find('td').first().text().trim().toLowerCase();
      if (!firstCell.includes('total') && !firstCell.includes('gesamt')) return;

      const tds = $row.find('td');
      if (tds.length < 4) return;

      const nums = [];
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

    if (appearances === 0 && goals === 0 && assists === 0) {
      return res.json(null);
    }

    res.json({
      season: `${seasonYear}/${String(seasonYear + 1).slice(-2)}`,
      appearances,
      goals,
      assists,
      minutes,
    });
  } catch (err) {
    console.error('Performance stats error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch performance' });
  }
});

// ─── Releases (free agents from vertragslosespieler page) ───────────────────────
// Uses the dedicated free agents page instead of latest transfers - yields many more results.
app.get('/api/transfermarkt/releases', async (req, res) => {
  try {
    const minVal = parseInt(req.query.min, 10) || 0;
    const maxVal = parseInt(req.query.max, 10) || 50000000;
    const page = parseInt(req.query.page, 10) || 1;
    const url = `${TRANSFERMARKT_BASE}/transfers/vertragslosespieler/statistik?ausrichtung=&spielerposition_id=0&land_id=&wettbewerb_id=alle&seit=0&altersklasse=&minMarktwert=${minVal}&maxMarktwert=${maxVal}&plus=1&page=${page}`;
    const html = await fetchHtmlWithRetry(url);
    const $ = cheerio.load(html);

    const players = [];
    $('table.items tr.odd, table.items tr.even').each((_, row) => {
      try {
        const tables = $(row).find('table.inline-table');
        if (tables.length === 0) return;
        const t0 = tables.eq(0);
        const playerImage = (t0.find('img').attr('data-src') || t0.find('img').attr('src') || '').replace('medium', 'big');
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
        const playerNationalityFlag = (natImg.attr('data-src') || natImg.attr('src') || '').replace('verysmall', 'head').replace('tiny', 'head');

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
      } catch (e) {}
    });

    res.json({ players });
  } catch (err) {
    console.error('Releases error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch releases' });
  }
});

// ─── Contract Finishers (contracts expiring in next transfer window) ─────────────
const CF_MIN_VALUE = 150000;
const CF_MAX_VALUE = 3000000;
const CF_MAX_AGE = 31;
const CF_MAX_PAGES = 80;
const CF_BATCH_SIZE = 3;

function getContractFinisherWindow() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = Math.max(now.getFullYear(), 2026);
  if (month >= 2 && month <= 9) {
    return { window: 'Summer', yearsToQuery: [year] };
  }
  return { window: 'Winter', yearsToQuery: [year, year + 1] };
}

function parseMarketValueCF(val) {
  if (!val || val.includes('-')) return 0;
  const s = val.replace(/[€\s]/g, '').toLowerCase();
  if (s.includes('k')) return (parseFloat(s.replace('k', '')) || 0) * 1000;
  if (s.includes('m')) return (parseFloat(s.replace('m', '')) || 0) * 1000000;
  return parseFloat(s) || 0;
}

function formatContractExpiryDate(window, year, isFirstYear) {
  if (window === 'Summer') return `30.06.${year}`;
  return isFirstYear ? `31.12.${year}` : `31.01.${year}`;
}

function extractNationalityAndFlagCF($, row) {
  const img = $(row).find('td.zentriert img[title]').first();
  const natImg = img.length ? img : $(row).find('img[alt]').filter((_, el) => {
    const alt = $(el).attr('alt') || '';
    return alt.length >= 2 && alt.length <= 50;
  }).first();
  const nationality = (natImg.attr('title') || natImg.attr('alt') || '').trim() || null;
  let flag = natImg.attr('data-src') || natImg.attr('src') || '';
  if (flag) {
    flag = makeAbsoluteUrl(flag).replace(/verysmall|tiny/g, 'head');
  }
  return { nationality, flag: flag || null };
}

app.get('/api/transfermarkt/contract-finishers', async (req, res) => {
  try {
    const config = getContractFinisherWindow();
    const seenUrls = new Set();
    const all = [];
    let totalPagesFetched = 0;

    for (const jahr of config.yearsToQuery) {
      let page = 1;
      let batchShouldBreak = false;

      while (page <= CF_MAX_PAGES && !batchShouldBreak) {
        const batchEnd = Math.min(page + CF_BATCH_SIZE - 1, CF_MAX_PAGES);
        const batch = [];

        for (let p = page; p <= batchEnd; p++) {
          const url = `${TRANSFERMARKT_BASE}/transfers/endendevertraege/statistik?plus=1&jahr=${jahr}&land_id=0&ausrichtung=alle&spielerposition_id=alle&altersklasse=alle&page=${p}`;
          try {
            const html = await fetchHtmlWithRetry(url);
            batch.push({ html, page: p });
          } catch (e) {
            batch.push({ html: null, page: p });
          }
        }

        for (const { html, page: p } of batch) {
          if (!html) continue;
          const $ = cheerio.load(html);
          const rows = $('table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even');
          let rawRowCount = 0;
          let maxValueOnPage = 0;

          rows.each((_, row) => {
            try {
              const playerLink = $(row).find('a[href*="/profil/spieler/"], a[href*="/profile/player/"]').first();
              const href = playerLink.attr('href');
              if (!href) return;
              rawRowCount++;

              const playerUrl = href.startsWith('http') ? href : TRANSFERMARKT_BASE + href;
              if (seenUrls.has(playerUrl)) return;

              const tables = $(row).find('table.inline-table');
              const playerTable = tables.first();
              const playerName = (playerLink.attr('title') || playerTable.find('img').attr('title') || playerLink.text().trim() || '').trim() || null;
              const posText = playerTable.find('tr').eq(1).text().replace(/-/g, ' ').trim();
              const playerPosition = convertPosition(posText) || posText || null;

              const ageTd = $(row).find('td.zentriert').first().text().trim();
              const ageMatch = ageTd.match(/\((\d+)\)/);
              const playerAge = ageMatch ? ageMatch[1] : (parseInt(ageTd, 10) || '').toString() || null;

              let marketValue = null;
              $(row).find('td').each((__, td) => {
                const t = $(td).text().trim();
                if (t.includes('€')) { marketValue = t; return false; }
              });

              const valueNum = parseMarketValueCF(marketValue);
              const ageNum = parseInt(playerAge, 10);
              if (valueNum > maxValueOnPage) maxValueOnPage = valueNum;

              if (Number.isNaN(ageNum) || ageNum > CF_MAX_AGE || valueNum < CF_MIN_VALUE || valueNum > CF_MAX_VALUE) return;
              seenUrls.add(playerUrl);

              const { nationality, flag } = extractNationalityAndFlagCF($, row);
              const clubTable = tables.eq(1);
              const clubName = (clubTable.find('a[href*="/startseite/verein/"]').attr('title') || clubTable.find('img').attr('title') || '').trim() || null;
              const clubLogoRaw = clubTable.find('img').attr('data-src') || clubTable.find('img').attr('src') || '';
              const clubJoinedLogo = clubLogoRaw ? makeAbsoluteUrl(clubLogoRaw) : null;
              const playerImageRaw = playerTable.find('img').attr('data-src') || playerTable.find('img').attr('src') || '';
              const playerImage = playerImageRaw ? makeAbsoluteUrl(playerImageRaw.replace('medium', 'big')) : null;

              const contractExpiry = formatContractExpiryDate(config.window, jahr, config.yearsToQuery[0] === jahr);
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
            } catch (e) {}
          });

          totalPagesFetched++;
          if (rawRowCount === 0) batchShouldBreak = true;
          if (maxValueOnPage > 0 && maxValueOnPage < CF_MIN_VALUE) batchShouldBreak = true;
        }

        page += CF_BATCH_SIZE;
        if (batchShouldBreak) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    all.sort((a, b) => parseMarketValueCF(b.marketValue) - parseMarketValueCF(a.marketValue));
    res.json({ players: all, windowLabel: config.window });
  } catch (err) {
    console.error('Contract finishers error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch contract finishers' });
  }
});

// ─── Contract Finishers SSE (streaming – show results as they load) ─────────────
app.get('/api/transfermarkt/contract-finishers/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    const config = getContractFinisherWindow();
    send({ windowLabel: config.window, players: [], isLoading: true });
    const seenUrls = new Set();
    const all = [];

    for (const jahr of config.yearsToQuery) {
      let page = 1;
      let batchShouldBreak = false;

      while (page <= CF_MAX_PAGES && !batchShouldBreak) {
        const batchEnd = Math.min(page + CF_BATCH_SIZE - 1, CF_MAX_PAGES);
        const batch = [];

        for (let p = page; p <= batchEnd; p++) {
          const url = `${TRANSFERMARKT_BASE}/transfers/endendevertraege/statistik?plus=1&jahr=${jahr}&land_id=0&ausrichtung=alle&spielerposition_id=alle&altersklasse=alle&page=${p}`;
          try {
            const html = await fetchHtmlWithRetry(url);
            batch.push({ html, page: p });
          } catch (e) {
            batch.push({ html: null, page: p });
          }
        }

        const batchPlayers = [];
        for (const { html } of batch) {
          if (!html) continue;
          const $ = cheerio.load(html);
          const rows = $('table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even');
          let rawRowCount = 0;
          let maxValueOnPage = 0;

          rows.each((_, row) => {
            try {
              const playerLink = $(row).find('a[href*="/profil/spieler/"], a[href*="/profile/player/"]').first();
              const href = playerLink.attr('href');
              if (!href) return;
              rawRowCount++;

              const playerUrl = href.startsWith('http') ? href : TRANSFERMARKT_BASE + href;
              if (seenUrls.has(playerUrl)) return;

              const tables = $(row).find('table.inline-table');
              const playerTable = tables.first();
              const playerName = (playerLink.attr('title') || playerTable.find('img').attr('title') || playerLink.text().trim() || '').trim() || null;
              const posText = playerTable.find('tr').eq(1).text().replace(/-/g, ' ').trim();
              const playerPosition = convertPosition(posText) || posText || null;

              const ageTd = $(row).find('td.zentriert').first().text().trim();
              const ageMatch = ageTd.match(/\((\d+)\)/);
              const playerAge = ageMatch ? ageMatch[1] : (parseInt(ageTd, 10) || '').toString() || null;

              let marketValue = null;
              $(row).find('td').each((__, td) => {
                const t = $(td).text().trim();
                if (t.includes('€')) { marketValue = t; return false; }
              });

              const valueNum = parseMarketValueCF(marketValue);
              const ageNum = parseInt(playerAge, 10);
              if (valueNum > maxValueOnPage) maxValueOnPage = valueNum;

              if (Number.isNaN(ageNum) || ageNum > CF_MAX_AGE || valueNum < CF_MIN_VALUE || valueNum > CF_MAX_VALUE) return;
              seenUrls.add(playerUrl);

              const { nationality, flag } = extractNationalityAndFlagCF($, row);
              const clubTable = tables.eq(1);
              const clubName = (clubTable.find('a[href*="/startseite/verein/"]').attr('title') || clubTable.find('img').attr('title') || '').trim() || null;
              const clubLogoRaw = clubTable.find('img').attr('data-src') || clubTable.find('img').attr('src') || '';
              const clubJoinedLogo = clubLogoRaw ? makeAbsoluteUrl(clubLogoRaw) : null;
              const playerImageRaw = playerTable.find('img').attr('data-src') || playerTable.find('img').attr('src') || '';
              const playerImage = playerImageRaw ? makeAbsoluteUrl(playerImageRaw.replace('medium', 'big')) : null;

              const contractExpiry = formatContractExpiryDate(config.window, jahr, config.yearsToQuery[0] === jahr);
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
            } catch (e) {}
          });

          if (rawRowCount === 0) batchShouldBreak = true;
          if (maxValueOnPage > 0 && maxValueOnPage < CF_MIN_VALUE) batchShouldBreak = true;
        }

        if (batchPlayers.length > 0) {
          const sorted = [...all].sort((a, b) => parseMarketValueCF(b.marketValue) - parseMarketValueCF(a.marketValue));
          send({ players: sorted, isLoading: true });
        }

        page += CF_BATCH_SIZE;
        if (batchShouldBreak) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    const sorted = [...all].sort((a, b) => parseMarketValueCF(b.marketValue) - parseMarketValueCF(a.marketValue));
    send({ players: sorted, windowLabel: config.window, isLoading: false });
  } catch (err) {
    console.error('Contract finishers stream error:', err.message);
    send({ error: err.message || 'Failed to fetch', isLoading: false });
  } finally {
    res.end();
  }
});

// ─── Teammates (games played together) ────────────────────────────────────────
function extractPlayerIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const parts = url.trim().split('/');
  let spielerIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].toLowerCase() === 'spieler' || parts[i].toLowerCase() === 'player') {
      spielerIdx = i;
      break;
    }
  }
  if (spielerIdx >= 0 && spielerIdx < parts.length - 1) {
    const id = parts[spielerIdx + 1];
    return /^\d+$/.test(id) ? id : null;
  }
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

function buildTeammatesUrl(profileUrl) {
  if (!profileUrl || typeof profileUrl !== 'string') return null;
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

app.get('/api/transfermarkt/teammates', async (req, res) => {
  try {
    let url = req.query.url || '';
    url = url.trim();
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    if (!url.startsWith('http')) {
      url = url.startsWith('/') ? TRANSFERMARKT_BASE + url : TRANSFERMARKT_BASE + '/' + url;
    }
    const teammatesUrl = buildTeammatesUrl(url);
    if (!teammatesUrl) {
      return res.status(400).json({ error: 'Invalid player URL' });
    }
    const html = await fetchHtmlWithRetry(teammatesUrl);
    const $ = cheerio.load(html);

    const teammates = [];
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
      $('table.items tbody tr.odd, table.items tbody tr.even, table.items tr.odd, table.items tr.even').each((_, row) => {
        try {
          const playerLink = $(row).find('td.hauptlink a[href*="/profil/spieler/"], td.hauptlink a[href*="/profile/player/"], td a[href*="/profil/spieler/"], td a[href*="/profile/player/"]').first();
          const href = playerLink.attr('href');
          if (!href) return;
          const tmProfileUrl = makeAbsoluteUrl(href);
          const playerName = playerLink.attr('title') || playerLink.text().trim() || null;
          const hauptlinkText = $(row).find('td.hauptlink').text().trim();
          let position = null;
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
        } catch (e) {}
      });
    }

    res.json({ teammates: teammates.slice(0, 200) });
  } catch (err) {
    console.error('Teammates error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch teammates' });
  }
});

// ─── Transfer Windows (open worldwide) ────────────────────────────────────────
// Scrapes Transfermarkt with Playwright (table is JS-rendered). Falls back to static list on failure.
// Cache: 1 hour to limit requests to Transfermarkt.
const TRANSFER_WINDOW_URL = TRANSFERMARKT_BASE + '/statistik/transferfenster?status=open';
const TRANSFER_WINDOW_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
let transferWindowCache = null;
let transferWindowCacheTime = 0;

const PRIORITY_COUNTRY_CODES = new Set(['il', 'gb-eng', 'de', 'es', 'it', 'fr']);
const COUNTRY_TO_CONF = {
  'gb-eng': 'UEFA', de: 'UEFA', es: 'UEFA', it: 'UEFA', fr: 'UEFA', nl: 'UEFA', pt: 'UEFA',
  be: 'UEFA', tr: 'UEFA', ru: 'UEFA', il: 'UEFA', 'gb-sct': 'UEFA', gr: 'UEFA', at: 'UEFA',
  ch: 'UEFA', pl: 'UEFA', ua: 'UEFA', cz: 'UEFA', dk: 'UEFA', se: 'UEFA', no: 'UEFA',
  ro: 'UEFA', bg: 'UEFA', hr: 'UEFA', rs: 'UEFA', hu: 'UEFA', sk: 'UEFA', si: 'UEFA',
  cy: 'UEFA', fi: 'UEFA', is: 'UEFA', ba: 'UEFA', mk: 'UEFA', al: 'UEFA', me: 'UEFA',
  lu: 'UEFA', mt: 'UEFA', ie: 'UEFA', 'gb-wls': 'UEFA', 'gb-nir': 'UEFA', by: 'UEFA',
  ge: 'UEFA', am: 'UEFA', az: 'UEFA', kz: 'UEFA', md: 'UEFA', lt: 'UEFA', ee: 'UEFA',
  lv: 'UEFA', xk: 'UEFA', ad: 'UEFA', fo: 'UEFA', li: 'UEFA', sm: 'UEFA', gi: 'UEFA',
  sa: 'AFC', ae: 'AFC', qa: 'AFC', cn: 'AFC', jp: 'AFC', kr: 'AFC', ir: 'AFC', in: 'AFC',
  au: 'AFC', th: 'AFC', my: 'AFC', vn: 'AFC', id: 'AFC', uz: 'AFC', iq: 'AFC', kw: 'AFC',
  om: 'AFC', bh: 'AFC', jo: 'AFC', sy: 'AFC', lb: 'AFC', ph: 'AFC', sg: 'AFC', hk: 'AFC',
  tw: 'AFC', bd: 'AFC', np: 'AFC', lk: 'AFC', ps: 'AFC', ye: 'AFC', tj: 'AFC', tm: 'AFC',
  kg: 'AFC', mm: 'AFC', mv: 'AFC', af: 'AFC',
  br: 'CONMEBOL', ar: 'CONMEBOL', co: 'CONMEBOL', cl: 'CONMEBOL', pe: 'CONMEBOL',
  ec: 'CONMEBOL', uy: 'CONMEBOL', py: 'CONMEBOL', bo: 'CONMEBOL', ve: 'CONMEBOL',
  mx: 'CONCACAF', us: 'CONCACAF', ca: 'CONCACAF', cr: 'CONCACAF', hn: 'CONCACAF',
  pa: 'CONCACAF', jm: 'CONCACAF', tt: 'CONCACAF', gt: 'CONCACAF', sv: 'CONCACAF',
  ni: 'CONCACAF', cu: 'CONCACAF', do: 'CONCACAF', ht: 'CONCACAF', cw: 'CONCACAF', sr: 'CONCACAF',
  eg: 'CAF', ma: 'CAF', tn: 'CAF', za: 'CAF', ng: 'CAF', dz: 'CAF', gh: 'CAF', sn: 'CAF',
  ci: 'CAF', cm: 'CAF', ke: 'CAF', zw: 'CAF', zm: 'CAF', ao: 'CAF', cd: 'CAF', ml: 'CAF',
  tz: 'CAF', et: 'CAF', ly: 'CAF', sd: 'CAF', ug: 'CAF', tg: 'CAF', bj: 'CAF', bf: 'CAF',
  ne: 'CAF', gn: 'CAF', mg: 'CAF', mu: 'CAF', bw: 'CAF', na: 'CAF', mz: 'CAF', rw: 'CAF',
  nz: 'OFC', fj: 'OFC', pg: 'OFC', sb: 'OFC',
};
// Map country names (from Transfermarkt) to codes for confederation + flag
const NAME_TO_CODE = {
  England: 'gb-eng', Germany: 'de', Spain: 'es', Italy: 'it', France: 'fr', Netherlands: 'nl',
  Portugal: 'pt', Belgium: 'be', Turkey: 'tr', Russia: 'ru', Israel: 'il', Scotland: 'gb-sct',
  Greece: 'gr', Austria: 'at', Switzerland: 'ch', Poland: 'pl', Ukraine: 'ua', 'Czech Republic': 'cz',
  Denmark: 'dk', Sweden: 'se', Norway: 'no', Romania: 'ro', Croatia: 'hr', Serbia: 'rs',
  Hungary: 'hu', 'Saudi Arabia': 'sa', UAE: 'ae', 'United Arab Emirates': 'ae', Qatar: 'qa',
  China: 'cn', Japan: 'jp', 'South Korea': 'kr', 'Korea Republic': 'kr', Korea: 'kr', Australia: 'au', Brazil: 'br', Argentina: 'ar',
  Colombia: 'co', Mexico: 'mx', 'United States': 'us', Canada: 'ca', Egypt: 'eg', Morocco: 'ma',
  'South Africa': 'za', Nigeria: 'ng', 'New Zealand': 'nz', Bulgaria: 'bg', Slovakia: 'sk',
  Slovenia: 'si', Cyprus: 'cy', Finland: 'fi', Iceland: 'is', 'Bosnia-Herzegovina': 'ba',
  'North Macedonia': 'mk', Albania: 'al', Montenegro: 'me', Luxembourg: 'lu', Malta: 'mt',
  Ireland: 'ie', Wales: 'gb-wls', 'Northern Ireland': 'gb-nir', Belarus: 'by', Georgia: 'ge',
  Armenia: 'am', Azerbaijan: 'az', Kazakhstan: 'kz', Moldova: 'md', Lithuania: 'lt',
  Estonia: 'ee', Latvia: 'lv', Kosovo: 'xk', Andorra: 'ad', 'Faroe Islands': 'fo',
  Liechtenstein: 'li', 'San Marino': 'sm', Gibraltar: 'gi', Iran: 'ir', India: 'in',
  Thailand: 'th', Malaysia: 'my', Vietnam: 'vn', Indonesia: 'id', Uzbekistan: 'uz',
  Iraq: 'iq', Kuwait: 'kw', Oman: 'om', Bahrain: 'bh', Jordan: 'jo', Syria: 'sy',
  Lebanon: 'lb', Philippines: 'ph', Singapore: 'sg', 'Hong Kong': 'hk', 'Chinese Taipei': 'tw',
  Bangladesh: 'bd', Nepal: 'np', 'Sri Lanka': 'lk', Palestine: 'ps', Yemen: 'ye',
  Tajikistan: 'tj', Turkmenistan: 'tm', Kyrgyzstan: 'kg', Myanmar: 'mm', Maldives: 'mv',
  Afghanistan: 'af', Chile: 'cl', Peru: 'pe', Ecuador: 'ec', Uruguay: 'uy', Paraguay: 'py',
  Bolivia: 'bo', Venezuela: 've', 'Costa Rica': 'cr', Honduras: 'hn', Panama: 'pa',
  Jamaica: 'jm', 'Trinidad and Tobago': 'tt', Guatemala: 'gt', 'El Salvador': 'sv',
  Nicaragua: 'ni', Cuba: 'cu', 'Dominican Republic': 'do', Haiti: 'ht', 'Curaçao': 'cw',
  Suriname: 'sr', Tunisia: 'tn', Algeria: 'dz', Ghana: 'gh', Senegal: 'sn', 'Ivory Coast': 'ci',
  Cameroon: 'cm', Kenya: 'ke', Zimbabwe: 'zw', Zambia: 'zm', Angola: 'ao', 'DR Congo': 'cd',
  Mali: 'ml', Tanzania: 'tz', Ethiopia: 'et', Libya: 'ly', Sudan: 'sd', Uganda: 'ug',
  Togo: 'tg', Benin: 'bj', 'Burkina Faso': 'bf', Niger: 'ne', Guinea: 'gn', Madagascar: 'mg',
  Mauritius: 'mu', Botswana: 'bw', Namibia: 'na', Mozambique: 'mz', Rwanda: 'rw',
  Fiji: 'fj', 'Papua New Guinea': 'pg', 'Solomon Islands': 'sb',
};
const WINTER_MD = [
  ['England', 'gb-eng', 2, 3], ['Germany', 'de', 2, 3], ['Spain', 'es', 2, 3], ['Italy', 'it', 2, 3],
  ['France', 'fr', 2, 3], ['Netherlands', 'nl', 2, 3], ['Portugal', 'pt', 2, 3], ['Belgium', 'be', 2, 3],
  ['Turkey', 'tr', 2, 7], ['Russia', 'ru', 2, 21], ['Israel', 'il', 2, 3], ['Scotland', 'gb-sct', 2, 3],
  ['Greece', 'gr', 2, 3], ['Austria', 'at', 2, 3], ['Switzerland', 'ch', 2, 3], ['Poland', 'pl', 2, 28],
  ['Ukraine', 'ua', 2, 28], ['Czech Republic', 'cz', 2, 28], ['Denmark', 'dk', 2, 3], ['Sweden', 'se', 3, 31],
  ['Norway', 'no', 3, 31], ['Romania', 'ro', 2, 28], ['Croatia', 'hr', 2, 17], ['Serbia', 'rs', 2, 28],
  ['Hungary', 'hu', 2, 28], ['Saudi Arabia', 'sa', 2, 18], ['UAE', 'ae', 2, 18], ['Qatar', 'qa', 1, 31],
  ['China', 'cn', 2, 28], ['Japan', 'jp', 3, 14], ['South Korea', 'kr', 3, 14], ['Australia', 'au', 2, 14],
  ['Brazil', 'br', 4, 7], ['Argentina', 'ar', 2, 19], ['Colombia', 'co', 2, 28], ['Mexico', 'mx', 2, 7],
  ['United States', 'us', 3, 26], ['Canada', 'ca', 3, 26], ['Egypt', 'eg', 2, 28], ['Morocco', 'ma', 2, 28],
  ['South Africa', 'za', 2, 28], ['Nigeria', 'ng', 2, 28], ['New Zealand', 'nz', 3, 31],
];
const SUMMER_MD = [
  ['England', 'gb-eng', 9, 1], ['Germany', 'de', 9, 1], ['Spain', 'es', 9, 1], ['Italy', 'it', 8, 31],
  ['France', 'fr', 9, 1], ['Netherlands', 'nl', 9, 1], ['Portugal', 'pt', 9, 22], ['Belgium', 'be', 9, 1],
  ['Turkey', 'tr', 9, 8], ['Russia', 'ru', 9, 1], ['Israel', 'il', 9, 1], ['Scotland', 'gb-sct', 9, 1],
  ['Greece', 'gr', 9, 1], ['Austria', 'at', 9, 1], ['Switzerland', 'ch', 9, 1], ['Poland', 'pl', 9, 1],
  ['Ukraine', 'ua', 9, 1], ['Czech Republic', 'cz', 9, 1], ['Denmark', 'dk', 9, 1], ['Sweden', 'se', 8, 31],
  ['Norway', 'no', 8, 31], ['Romania', 'ro', 9, 8], ['Croatia', 'hr', 9, 1], ['Serbia', 'rs', 9, 1],
  ['Hungary', 'hu', 9, 1], ['Saudi Arabia', 'sa', 9, 15], ['UAE', 'ae', 9, 15], ['Qatar', 'qa', 9, 15],
  ['China', 'cn', 7, 31], ['Japan', 'jp', 8, 28], ['South Korea', 'kr', 8, 28], ['Australia', 'au', 10, 15],
  ['Brazil', 'br', 8, 4], ['Argentina', 'ar', 8, 31], ['Colombia', 'co', 8, 31], ['Mexico', 'mx', 9, 8],
  ['United States', 'us', 9, 2], ['Canada', 'ca', 9, 2], ['Egypt', 'eg', 9, 15], ['Morocco', 'ma', 9, 15],
  ['South Africa', 'za', 9, 1], ['Nigeria', 'ng', 9, 1], ['New Zealand', 'nz', 8, 31],
];

function buildTransferWindows() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const list = (month >= 1 && month <= 4) || month >= 10
    ? WINTER_MD.map(([name, code, m, d]) => {
        const closeYear = month >= 10 ? year + 1 : year;
        const closing = new Date(closeYear, m - 1, d);
        return [name, code, closing];
      })
    : SUMMER_MD.map(([name, code, m, d]) => {
        const closing = new Date(year, m - 1, d);
        return [name, code, closing];
      });
  const result = [];
  for (const [countryName, countryCode, closing] of list) {
    const daysLeft = Math.ceil((closing - today) / (1000 * 60 * 60 * 24));
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
  return result.sort((a, b) => a.daysLeft - b.daysLeft);
}

async function scrapeTransferWindowsWithPlaywright() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage({
      userAgent: getRandomUserAgent(),
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    await page.setViewportSize({ width: 1920, height: 3000 });
    await page.goto(TRANSFER_WINDOW_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('table.transfer-window tbody tr', { timeout: 10000 }).catch(() => null);

    // Click "More countries" repeatedly to load ALL open windows (button is below fold, use JS click)
    for (let i = 0; i < 20; i++) {
      const prevRows = await page.$$eval('table.transfer-window tbody tr', (r) => r.length);
      const clicked = await page.evaluate(() => {
        const b = document.querySelector('button.transfer-window__toggle-button-countries');
        if (!b || b.textContent?.trim() !== 'More countries') return false;
        b.scrollIntoView({ block: 'center' });
        b.click();
        return true;
      });
      if (!clicked) break;
      await new Promise((r) => setTimeout(r, 2000));
      const newRows = await page.$$eval('table.transfer-window tbody tr', (r) => r.length);
      if (newRows <= prevRows) break;
    }

    const html = await page.content();
    await browser.close();
    browser = null;

    const $ = cheerio.load(html);
    const rows = $('table.transfer-window tbody tr');
    if (rows.length === 0) return null;

    const windows = [];
    const seen = new Set();
    let currentCountry = '';
    let currentCountryImg = '';

    rows.each((_, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      if (cells.length === 1) {
        currentCountry = cells.eq(0).text().trim();
        const img = cells.eq(0).find('img');
        currentCountryImg = img.attr('data-src') || img.attr('src') || '';
        if (currentCountryImg && !currentCountryImg.startsWith('http')) {
          currentCountryImg = currentCountryImg.startsWith('//') ? 'https:' + currentCountryImg : TRANSFERMARKT_BASE + currentCountryImg;
        }
        return;
      }
      if (cells.length !== 4 || !currentCountry || currentCountry.length < 2) return;

      const status = cells.eq(3).text().trim();
      let daysLeft = null;
      const daysMatch = status.match(/(\d+)\s*(?:more\s+)?days?/i) || status.match(/open\s+for\s+(\d+)/i);
      if (daysMatch) daysLeft = parseInt(daysMatch[1], 10);
      if (status.includes('closes in') && !daysMatch) daysLeft = 0;

      const countryCode = NAME_TO_CODE[currentCountry] || '';
      const code = countryCode || currentCountry.toLowerCase().replace(/\s+/g, '-').slice(0, 12);
      if (seen.has(code)) return;
      seen.add(code);

      const conf = COUNTRY_TO_CONF[countryCode] || 'UEFA';
      windows.push({
        countryName: currentCountry.trim(),
        countryCode: countryCode || code,
        flagUrl: currentCountryImg || `https://flagcdn.com/w40/${countryCode || code}.png`,
        confederation: conf,
        daysLeft,
      });
    });

    if (windows.length === 0) return null;
    return windows.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
  } catch (err) {
    console.error('Transfer window scrape error:', err.message);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

app.get('/api/transfermarkt/transfer-windows', async (req, res) => {
  try {
    const now = Date.now();
    if (transferWindowCache && now - transferWindowCacheTime < TRANSFER_WINDOW_CACHE_MS) {
      return res.json({ windows: transferWindowCache });
    }

    const scraped = await scrapeTransferWindowsWithPlaywright();
    if (scraped && scraped.length > 0) {
      transferWindowCache = scraped;
      transferWindowCacheTime = now;
      return res.json({ windows: scraped });
    }

    const windows = buildTransferWindows();
    res.json({ windows });
  } catch (err) {
    console.error('Transfer windows error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch transfer windows' });
  }
});

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`MGSR Backend running at http://localhost:${PORT}`);
});
