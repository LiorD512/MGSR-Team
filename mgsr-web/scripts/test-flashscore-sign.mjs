#!/usr/bin/env node
/**
 * Pins the invariants the self-healing `x-fsign` mechanism depends on.
 *
 *   node scripts/test-flashscore-sign.mjs      (or: npm run test:fsign)
 *
 * Network-dependent by design — this is a manual pre-flight check, not
 * something to gate a build on. Exits 1 on failure, 0 with loud warnings if the
 * only problem is that the committed seed has gone stale (which is the expected
 * end state after a rotation, and must not read as a break).
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGN_MODULE = join(HERE, '..', 'src', 'lib', 'flashscoreSign.ts');

const MOBI = 'https://www.flashscore.mobi/';
const FEED = 'https://local-global.flashscore.ninja/2/x/feed';
const TEAM_PAGE = 'https://www.flashscore.com/team/maccabi-tel-aviv/req5XE5Q/';

/* Kept byte-identical to flashscoreSign.ts; assertion 8 enforces that. */
const SIGN_PATTERN = /"feed_?[sS]ign":"([A-Za-z0-9_-]{6,24})"/;
const SIGN_SHAPE = /^[A-Za-z0-9_-]{6,24}$/;

const HEADERS = {
  accept: 'text/html,application/xhtml+xml,*/*',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
};

const failures = [];
const warnings = [];
let passed = 0;

function pass(label, detail = '') {
  passed++;
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label, detail) {
  failures.push(label);
  console.log(`  FAIL  ${label} — ${detail}`);
}
function warn(label, detail) {
  warnings.push(label);
  console.log(`  WARN  ${label} — ${detail}`);
}

function extractSign(html) {
  const found = html.match(SIGN_PATTERN)?.[1];
  return found && SIGN_SHAPE.test(found) ? found : null;
}

async function feedStatus(matchId, sign) {
  const headers = sign === null ? { ...HEADERS } : { ...HEADERS, 'x-fsign': sign };
  const response = await fetch(`${FEED}/df_sui_1_${matchId}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.text() };
}

console.log('\nflashscore x-fsign invariants\n');

// ── 1. The signature source is reachable ──────────────────────────────────
let mobiHtml = '';
try {
  const response = await fetch(MOBI, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
  mobiHtml = await response.text();
  if (response.status !== 200) fail('mobi reachable', `HTTP ${response.status}`);
  else if (mobiHtml.length < 10_000) fail('mobi reachable', `body only ${mobiHtml.length} bytes`);
  else pass('mobi reachable', `${(mobiHtml.length / 1024).toFixed(0)} KB`);
} catch (error) {
  fail('mobi reachable', error.message);
}

// ── 2. Extraction yields a well-formed signature ──────────────────────────
const liveSign = mobiHtml ? extractSign(mobiHtml) : null;
if (liveSign) pass('extract from mobi', liveSign);
else fail('extract from mobi', 'no signature matched — page shape may have changed');

// ── 3. The tournament-id false positive is avoided (pure, cannot flake) ───
{
  const decoy = 'cjs.defaultTopLeagues = ["6_100_SW9D1eZo","9_42_abcdefgh"];';
  if (extractSign(decoy) === null) pass('decoy alone extracts null');
  else fail('decoy alone extracts null', `got ${extractSign(decoy)}`);

  const decoyThenReal = `${decoy} window.config={"feedSign":"QQQQQQQQ"}`;
  const got = extractSign(decoyThenReal);
  if (got === 'QQQQQQQQ') pass('real key wins over earlier decoy');
  else fail('real key wins over earlier decoy', `got ${got}`);
}

// ── 4. Discover a live match id at runtime (hardcoding one guarantees rot) ─
let matchId = null;
try {
  const response = await fetch(TEAM_PAGE, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  const html = await response.text();
  const feed =
    html.match(/initialFeeds\[\s*["']summary-fixtures["']\s*\]\s*=\s*\{\s*data\s*:\s*`([\s\S]*?)`/)?.[1] ??
    '';
  // Records are separated by `¬~` and fields within a record by `¬`, so the
  // field anchor only holds once the feed is split — same as `field()` in
  // src/lib/flashscore.ts.
  for (const chunk of feed.split('¬~')) {
    const found = chunk.match(/(?:^|¬)AA÷([^¬~]+)/)?.[1]?.trim();
    if (found) {
      matchId = found;
      break;
    }
  }
  if (matchId) pass('discover live match id', matchId);
  else fail('discover live match id', 'no AA÷ field in summary-fixtures');
} catch (error) {
  fail('discover live match id', error.message);
}

// ── 5-7. The feed's accept/reject contract ────────────────────────────────
if (matchId && liveSign) {
  try {
    const { status, body } = await feedStatus(matchId, liveSign);
    if (status !== 200) fail('live signature accepted', `expected 200, got ${status}`);
    else if (!body.includes('÷')) fail('live signature accepted', 'body is not a feed payload');
    else pass('live signature accepted', `200, ${body.length} bytes`);
  } catch (error) {
    fail('live signature accepted', error.message);
  }

  // Assert the exact code: the whole design branches on 401 meaning rejection,
  // so a move to 403 or to 200-with-error must turn this red.
  try {
    const { status } = await feedStatus(matchId, 'x'.repeat(8));
    if (status === 401) pass('garbage signature rejected with 401');
    else fail('garbage signature rejected with 401', `got ${status} — update the rejected branch`);
  } catch (error) {
    fail('garbage signature rejected with 401', error.message);
  }

  try {
    const { status } = await feedStatus(matchId, null);
    if (status === 401) pass('absent signature rejected with 401');
    else fail('absent signature rejected with 401', `got ${status}`);
  } catch (error) {
    fail('absent signature rejected with 401', error.message);
  }
} else {
  fail('feed contract', 'skipped — need both a match id and a live signature');
}

// ── 8. Drift guard: the TS module must agree with this script ─────────────
let seed = null;
try {
  const source = await readFile(SIGN_MODULE, 'utf8');
  seed = source.match(/FLASHSCORE_FSIGN_SEED\s*=\s*'([^']+)'/)?.[1] ?? null;

  if (source.includes(SIGN_PATTERN.source)) pass('module regex matches this script');
  else fail('module regex matches this script', 'flashscoreSign.ts has diverged from SIGN_PATTERN');

  if (seed) pass('module seed readable', seed);
  else fail('module seed readable', 'could not parse FLASHSCORE_FSIGN_SEED');
} catch (error) {
  fail('read flashscoreSign.ts', error.message);
}

// ── 9. A stale seed is a warning, not a failure ───────────────────────────
if (matchId && seed) {
  try {
    const { status } = await feedStatus(matchId, seed);
    if (status === 200) pass('committed seed still valid', seed);
    else
      warn(
        'committed seed is stale',
        `seed ${seed} got ${status}${liveSign ? ` — live value is ${liveSign}` : ''}; self-healing covers this, but update FLASHSCORE_FSIGN_SEED`
      );
  } catch (error) {
    warn('committed seed check', error.message);
  }
}

console.log(
  `\n${passed} passed, ${failures.length} failed, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n`
);
if (failures.length) console.log(`failed: ${failures.join(', ')}\n`);
process.exitCode = failures.length ? 1 : 0;
