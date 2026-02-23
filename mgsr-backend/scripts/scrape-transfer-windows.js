#!/usr/bin/env node
/**
 * Scrapes open transfer windows from Transfermarkt.
 * Used by GitHub Actions daily. Output: mgsr-web/public/transfer-windows.json
 * Run from mgsr-backend: node scripts/scrape-transfer-windows.js
 */
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const TRANSFERMARKT_BASE = 'https://www.transfermarkt.com';
const URL = TRANSFERMARKT_BASE + '/statistik/transferfenster?status=open';

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

const NAME_TO_CODE = {
  England: 'gb-eng', Germany: 'de', Spain: 'es', Italy: 'it', France: 'fr', Netherlands: 'nl',
  Portugal: 'pt', Belgium: 'be', Turkey: 'tr', Russia: 'ru', Israel: 'il', Scotland: 'gb-sct',
  Greece: 'gr', Austria: 'at', Switzerland: 'ch', Poland: 'pl', Ukraine: 'ua', 'Czech Republic': 'cz',
  Denmark: 'dk', Sweden: 'se', Norway: 'no', Romania: 'ro', Croatia: 'hr', Serbia: 'rs',
  Hungary: 'hu', 'Saudi Arabia': 'sa', UAE: 'ae', 'United Arab Emirates': 'ae', Qatar: 'qa',
  China: 'cn', Japan: 'jp', 'South Korea': 'kr', 'Korea, South': 'kr', 'Korea Republic': 'kr', Korea: 'kr', Australia: 'au',
  Brazil: 'br', Argentina: 'ar', Colombia: 'co', Mexico: 'mx', 'United States': 'us', Canada: 'ca',
  Egypt: 'eg', Morocco: 'ma', 'South Africa': 'za', Nigeria: 'ng', 'New Zealand': 'nz',
  Bulgaria: 'bg', Slovakia: 'sk', Slovenia: 'si', Cyprus: 'cy', Finland: 'fi', Iceland: 'is',
  'Bosnia-Herzegovina': 'ba', 'North Macedonia': 'mk', Albania: 'al', Montenegro: 'me',
  Luxembourg: 'lu', Malta: 'mt', Ireland: 'ie', Wales: 'gb-wls', 'Northern Ireland': 'gb-nir',
  Belarus: 'by', Georgia: 'ge', Armenia: 'am', Azerbaijan: 'az', Kazakhstan: 'kz', Moldova: 'md',
  Lithuania: 'lt', Estonia: 'ee', Latvia: 'lv', Kosovo: 'xk', Andorra: 'ad', 'Faroe Islands': 'fo',
  Liechtenstein: 'li', 'San Marino': 'sm', Gibraltar: 'gi', Iran: 'ir', India: 'in', Thailand: 'th',
  Malaysia: 'my', Vietnam: 'vn', Indonesia: 'id', Uzbekistan: 'uz', Iraq: 'iq', Kuwait: 'kw',
  Oman: 'om', Bahrain: 'bh', Jordan: 'jo', Syria: 'sy', Lebanon: 'lb', Philippines: 'ph',
  Singapore: 'sg', 'Hong Kong': 'hk', 'Chinese Taipei': 'tw', Bangladesh: 'bd', Nepal: 'np',
  'Sri Lanka': 'lk', Palestine: 'ps', Yemen: 'ye', Tajikistan: 'tj', Turkmenistan: 'tm',
  Kyrgyzstan: 'kg', Myanmar: 'mm', Maldives: 'mv', Afghanistan: 'af', Chile: 'cl', Peru: 'pe',
  Ecuador: 'ec', Uruguay: 'uy', Paraguay: 'py', Bolivia: 'bo', Venezuela: 've', 'Costa Rica': 'cr',
  Honduras: 'hn', Panama: 'pa', Jamaica: 'jm', 'Trinidad and Tobago': 'tt', Guatemala: 'gt',
  'El Salvador': 'sv', Nicaragua: 'ni', Cuba: 'cu', 'Dominican Republic': 'do', Haiti: 'ht',
  'Curaçao': 'cw', Suriname: 'sr', Tunisia: 'tn', Algeria: 'dz', Ghana: 'gh', Senegal: 'sn',
  'Ivory Coast': 'ci', Cameroon: 'cm', Kenya: 'ke', Zimbabwe: 'zw', Zambia: 'zm', Angola: 'ao',
  'DR Congo': 'cd', Mali: 'ml', Tanzania: 'tz', Ethiopia: 'et', Libya: 'ly', Sudan: 'sd', Uganda: 'ug',
  Togo: 'tg', Benin: 'bj', 'Burkina Faso': 'bf', Niger: 'ne', Guinea: 'gn', Madagascar: 'mg',
  Mauritius: 'mu', Botswana: 'bw', Namibia: 'na', Mozambique: 'mz', Rwanda: 'rw',
  Fiji: 'fj', 'Papua New Guinea': 'pg', 'Solomon Islands': 'sb',
};

async function scrape() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  await page.setViewportSize({ width: 1920, height: 3000 });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('table.transfer-window tbody tr', { timeout: 10000 }).catch(() => null);

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

  const $ = cheerio.load(html);
  const rows = $('table.transfer-window tbody tr');
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

    let countryCode = NAME_TO_CODE[currentCountry] || '';
    if (!countryCode && /korea.*south|south.*korea|korea\s*republic/i.test(currentCountry)) {
      countryCode = 'kr';
    }
    const code = countryCode || currentCountry.toLowerCase().replace(/\s+/g, '-').replace(/,/g, '').slice(0, 12);
    if (seen.has(code)) return;
    seen.add(code);

    let conf = COUNTRY_TO_CONF[countryCode] || 'UEFA';
    if (conf === 'UEFA' && /korea.*south|south.*korea|korea\s*republic/i.test(currentCountry)) {
      conf = 'AFC';
    }
    windows.push({
      countryName: currentCountry.trim(),
      countryCode: countryCode || code,
      flagUrl: currentCountryImg || `https://flagcdn.com/w40/${countryCode || code}.png`,
      confederation: conf,
      daysLeft,
    });
  });

  return windows.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
}

const outPath = path.join(__dirname, '../../mgsr-web/public/transfer-windows.json');
scrape()
  .then((windows) => {
    const data = { windows, updatedAt: new Date().toISOString() };
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
    console.log('Wrote', windows.length, 'transfer windows to', outPath);
  })
  .catch((err) => {
    console.error('Scrape failed:', err.message);
    process.exit(1);
  });
