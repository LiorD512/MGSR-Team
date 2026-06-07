#!/usr/bin/env node

/**
 * Integration check for AI Scout diversity behavior.
 * Runs repeated searches and validates that discovery mode with novelty memory
 * produces significantly more unique players than strict mode.
 */

const BASE_URL = process.env.MGSR_WEB_URL || 'http://127.0.0.1:3010';
const QUERY = process.env.SCOUT_QUERY || 'find me 10 fast african center backs with max market value of 1m';

function playerKey(player) {
  const url = (player?.url || player?.transfermarktUrl || '').toString();
  const match = url.match(/\/(spieler|player)\/(\d+)/i);
  if (match?.[2]) return `tm:${match[2]}`;
  if (url) return `url:${url.toLowerCase()}`;
  return `name:${(player?.name || '').toString().trim().toLowerCase()}`;
}

async function runSearch({ mode, runIndex, seenKeys = [] }) {
  const body = {
    query: QUERY,
    lang: 'en',
    initial: false,
    diversityMode: mode,
    seed: `test-${mode}-${runIndex}`,
    seenKeys,
  };

  const res = await fetch(`${BASE_URL}/api/scout/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const results = Array.isArray(json.results) ? json.results : [];
  const keys = results.map(playerKey).filter(Boolean);
  return { keys, count: results.length };
}

async function collectSeries(mode, runs, useSeenMemory) {
  const byKey = new Map();
  const seenKeys = [];
  const perRunCounts = [];

  for (let i = 1; i <= runs; i += 1) {
    const { keys, count } = await runSearch({ mode, runIndex: i, seenKeys: useSeenMemory ? seenKeys : [] });
    perRunCounts.push(count);
    for (const key of keys) {
      byKey.set(key, (byKey.get(key) || 0) + 1);
      if (useSeenMemory && !seenKeys.includes(key)) seenKeys.push(key);
    }
  }

  const unique = byKey.size;
  const repeated2Plus = [...byKey.values()].filter((v) => v >= 2).length;
  return { unique, repeated2Plus, perRunCounts };
}

function runScore(r) {
  return r.unique - r.repeated2Plus;
}

(async () => {
  const RUNS = 10;

  const strict = await collectSeries('strict', RUNS, false);
  const discovery = await collectSeries('discovery', RUNS, true);

  console.log('=== Diversity Integration Test ===');
  console.log(`Query: ${QUERY}`);
  console.log(`Strict mode unique players: ${strict.unique}`);
  console.log(`Discovery mode unique players: ${discovery.unique}`);
  console.log(`Strict mode repeated>=2 players: ${strict.repeated2Plus}`);
  console.log(`Discovery mode repeated>=2 players: ${discovery.repeated2Plus}`);
  console.log(`Strict per-run counts: ${strict.perRunCounts.join(', ')}`);
  console.log(`Discovery per-run counts: ${discovery.perRunCounts.join(', ')}`);

  if (strict.perRunCounts.some((n) => n <= 0) || discovery.perRunCounts.some((n) => n <= 0)) {
    throw new Error('One or more runs returned zero results.');
  }

  if (discovery.unique <= strict.unique) {
    throw new Error(`Expected discovery unique (${discovery.unique}) to be greater than strict unique (${strict.unique}).`);
  }

  if (runScore(discovery) <= runScore(strict)) {
    throw new Error(`Expected discovery diversity score (${runScore(discovery)}) to exceed strict (${runScore(strict)}).`);
  }

  if (discovery.unique < 15) {
    throw new Error(`Discovery unique (${discovery.unique}) is unexpectedly low.`);
  }

  console.log('PASS: discovery mode produced broader result diversity than strict mode.');
})().catch((err) => {
  console.error('FAIL:', err.message || err);
  process.exit(1);
});
