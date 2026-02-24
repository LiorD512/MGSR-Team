#!/usr/bin/env node
/**
 * Test direct connection to Render scout server - NO Next.js.
 * Run: node scripts/test-scout-direct.js
 * If this works → network OK, issue is elsewhere.
 * If this fails → your machine can't reach Render (firewall/VPN/proxy).
 */

const url = 'https://football-scout-server-l38w.onrender.com/recruitment?position=CF&limit=2&lang=en';

console.log('Testing direct connection to Render scout server...');
console.log('URL:', url);
console.log('');

const start = Date.now();

fetch(url, {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(120000),
})
  .then((res) => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    return res.json().then((data) => ({ res, data, elapsed }));
  })
  .then(({ res, data, elapsed }) => {
    const count = data?.results?.length ?? 0;
    console.log('SUCCESS in', elapsed, 'seconds');
    console.log('Status:', res.status);
    console.log('Results:', count);
    if (count > 0) {
      console.log('First player:', data.results[0]?.name);
    }
    process.exit(0);
  })
  .catch((err) => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error('FAILED after', elapsed, 'seconds');
    console.error('Error:', err.message);
    if (/timeout|aborted/i.test(err.message)) {
      console.error('\n→ Timeout = Render server cold start (60-90s). Try running again.');
    }
    process.exit(1);
  });
