import { fetchHtmlWithRetry } from '@/lib/transfermarkt';

export async function GET(): Promise<Response> {
  const results: any = {
    timestamp: new Date().toISOString(),
    urlTests: [],
  };

  const clubId = '14'; // Maccabi Tel Aviv
  const urlFormats = [
    `https://www.transfermarkt.com/startseite/verein/${clubId}/saison_id/2026`,
    `https://www.transfermarkt.com/startseite/verein/${clubId}`,
    `https://www.transfermarkt.com/maccabi-tel-aviv/startseite/verein/${clubId}`,
    `https://www.transfermarkt.com/transfers/verein/${clubId}`,
    `https://www.transfermarkt.com/transfers/verein/${clubId}/saison_id/2026`,
    `https://www.transfermarkt.com/club/maccabi-tel-aviv`,
    `https://www.transfermarkt.com/maccabi-tel-aviv/transfers`,
  ];

  for (const url of urlFormats) {
    try {
      console.log(`[TM Debug] Testing URL: ${url}`);
      const html = await fetchHtmlWithRetry(url);
      results.urlTests.push({
        url,
        success: true,
        htmlLength: html.length,
        hasTransferTable: html.includes('table.items') || html.includes('class="items'),
        hasPlayerLinks: html.includes('/spieler/') || html.includes('/player/'),
      });
    } catch (error: any) {
      results.urlTests.push({
        url,
        success: false,
        error: error?.message || String(error),
      });
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
