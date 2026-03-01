#!/usr/bin/env node
/**
 * Test FMInside AJAX search flow for Diana Bieliakova
 */
const FMINSIDE_BASE = 'https://fminside.net';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

async function test() {
  // Step 1: Get session
  console.log('1. GET /players...');
  const r1 = await fetch(`${FMINSIDE_BASE}/players`, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  console.log('   Status:', r1.status);
  const setCookie = r1.headers.get('set-cookie');
  console.log('   Set-Cookie present:', !!setCookie);
  if (setCookie) console.log('   First 100 chars:', setCookie.slice(0, 100));

  function parseCookies(setCookieHeader) {
    if (!setCookieHeader) return '';
    return setCookieHeader
      .split(/,\s*(?=[\w-]+=)/)
      .map((c) => c.split(';')[0].trim())
      .join('; ');
  }
  const cookieHeader = parseCookies(setCookie);
  console.log('   Cookie header length:', cookieHeader.length);

  // Step 2: POST update_filter - try with Referer/Origin
  console.log('\n2. POST update_filter.php...');
  const r2 = await fetch(`${FMINSIDE_BASE}/resources/inc/ajax/update_filter.php`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${FMINSIDE_BASE}/players`,
      Origin: FMINSIDE_BASE,
      Cookie: cookieHeader,
    },
    body: 'page=players&database_version=7&gender=2&name=Diana+Bieliakova',
  });
  console.log('   Status:', r2.status);
  const updateCookie = r2.headers.get('set-cookie');
  console.log('   Set-Cookie from update:', !!updateCookie);
  const finalCookie = parseCookies(updateCookie) || cookieHeader;
  console.log('   Body from update:', (await r2.text()).slice(0, 80));

  // Step 3: GET generate-player-table
  console.log('\n3. GET generate-player-table.php...');
  const r3 = await fetch(
    `${FMINSIDE_BASE}/beheer/modules/players/resources/inc/frontend/generate-player-table.php?ajax_request=1`,
    {
      headers: { 'User-Agent': UA, Cookie: finalCookie },
    }
  );
  console.log('   Status:', r3.status);
  const html = await r3.text();
  const hasBieliakova = html.includes('diana-bieliakova');
  console.log('   Contains diana-bieliakova:', hasBieliakova);
  const match = html.match(/href="(\/players\/7-fm-26\/\d+-[^"]+)"/);
  console.log('   First player link:', match ? match[1] : 'none');
}

test().catch(console.error);
