/**
 * Test script: verifies TM scraping works from the current machine/environment.
 * Makes 5 real TM requests using the same header-generator + rate limiter
 * used in production. Reports success/failure for each.
 *
 * Usage: npx tsx _test_tm_fetch.ts
 */
import { fetchHtmlWithRetry } from './src/lib/transfermarkt';
import * as cheerio from 'cheerio';

const TEST_URLS = [
  {
    label: 'Search (Messi)',
    url: 'https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=messi',
    validate: (html: string) => html.includes('Messi') || html.includes('messi'),
  },
  {
    label: 'Player profile (Mbappe)',
    url: 'https://www.transfermarkt.com/kylian-mbappe/profil/spieler/342229',
    validate: (html: string) => html.includes('Mbappé') || html.includes('Mbappe'),
  },
  {
    label: 'Contract finishers page 1',
    url: 'https://www.transfermarkt.com/transfers/endendevertraege/statistik?plus=1&jahr=2026&land_id=0&ausrichtung=alle&spielerposition_id=alle&altersklasse=alle&page=1',
    validate: (html: string) => {
      const $ = cheerio.load(html);
      const rows = $('table.items tr.odd, table.items tr.even');
      return rows.length > 0;
    },
  },
  {
    label: 'Club page (Real Madrid)',
    url: 'https://www.transfermarkt.com/real-madrid/startseite/verein/418',
    validate: (html: string) => html.includes('Real Madrid'),
  },
  {
    label: 'Returnees (Premier League)',
    url: 'https://www.transfermarkt.com/premier-league/rueckkehrer/wettbewerb/GB1',
    validate: (html: string) => html.length > 5000,
  },
];

async function main() {
  console.log('=== TM Fetch Test ===');
  console.log(`Environment: ${process.env.CI ? 'GitHub Actions' : 'Local'}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('');

  let passed = 0;
  let failed = 0;

  for (const test of TEST_URLS) {
    const start = Date.now();
    try {
      const html = await fetchHtmlWithRetry(test.url, 2);
      const elapsed = Date.now() - start;
      const isValid = test.validate(html);
      
      if (isValid) {
        console.log(`✅ ${test.label} — ${html.length} bytes, ${elapsed}ms`);
        passed++;
      } else {
        console.log(`❌ ${test.label} — Got ${html.length} bytes but validation FAILED (blocked/captcha?), ${elapsed}ms`);
        // Print first 500 chars to debug
        console.log(`   First 500 chars: ${html.slice(0, 500).replace(/\n/g, ' ')}`);
        failed++;
      }
    } catch (err: any) {
      const elapsed = Date.now() - start;
      console.log(`❌ ${test.label} — ERROR: ${err.message}, ${elapsed}ms`);
      failed++;
    }
  }

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${TEST_URLS.length} tests`);
  
  if (failed > 0) {
    console.log('⚠️  TM scraping is NOT reliable from this environment');
    process.exit(1);
  } else {
    console.log('✅ TM scraping works from this environment!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
