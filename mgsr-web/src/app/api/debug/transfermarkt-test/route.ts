import { fetchHtmlWithRetry } from '@/lib/transfermarkt';

export async function GET(): Promise<Response> {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  try {
    // Test 1: Fetch homepage
    console.log('[TM Debug] Test 1: Fetching Transfermarkt homepage...');
    const homeHtml = await fetchHtmlWithRetry('https://www.transfermarkt.com');
    results.tests.push({
      test: 'homepage',
      success: true,
      htmlLength: homeHtml.length,
      preview: homeHtml.substring(0, 200),
    });

    // Test 2: Fetch Maccabi Tel Aviv club page
    console.log('[TM Debug] Test 2: Fetching Maccabi Tel Aviv club page...');
    const clubUrl = 'https://www.transfermarkt.com/startseite/verein/14/saison_id/2026';
    const clubHtml = await fetchHtmlWithRetry(clubUrl);
    results.tests.push({
      test: 'maccabi-tel-aviv-club',
      success: true,
      htmlLength: clubHtml.length,
      preview: clubHtml.substring(0, 200),
    });

    // Test 3: Fetch Maccabi Tel Aviv transfers page
    console.log('[TM Debug] Test 3: Fetching Maccabi Tel Aviv transfers page...');
    const transfersUrl = 'https://www.transfermarkt.com/transfers/verein/14/saison_id/2026';
    const transfersHtml = await fetchHtmlWithRetry(transfersUrl);
    results.tests.push({
      test: 'maccabi-tel-aviv-transfers',
      success: true,
      htmlLength: transfersHtml.length,
      // Count tables in HTML
      tableCount: (transfersHtml.match(/<table/gi) || []).length,
      hasArrivalsTable: transfersHtml.includes('table.items') || transfersHtml.includes('<table class="items'),
      preview: transfersHtml.substring(0, 400),
    });

    results.status = 'All tests passed';
  } catch (error: any) {
    results.status = 'Test failed';
    results.error = {
      message: error?.message || String(error),
      stack: error?.stack,
    };
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
