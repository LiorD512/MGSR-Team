/**
 * Request-matching audit (men platform) — READ-ONLY. Phase 0 of docs/REQUEST_MATCHING_PLAN.md.
 *
 *   1. Data coverage: how often each matching field is filled on roster players and open requests.
 *   2. Values: every distinct tier / foot / position string and whether the engine can parse it.
 *   3. Old vs new: per open request, legacy matcher count vs engine v2 Strong / Good / Stretch counts,
 *      and how many legacy matches only came from the mandate shortcut (any position).
 *   3b. Club-level backtest (§8): for every requesting club with level data, how many of its OWN real signings pass its
 *      level gate (leave-one-out), and how well its level score separates its signings from weaker clubs' (AUC).
 *   4. Accuracy vs the golden set: agents' "good fit" / "not a fit" verdicts (RequestMatchFeedback) →
 *      precision@5 / @10 and how many good fits land in the top 5 / 10.
 *
 * Local: cd mgsr-web && npx tsx _matching_audit.ts [--request=<id>] [--json]
 * Credentials: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (env or .env.local).
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateMatch, mandateCoversClub, rankPlayersForRequest, resolveWeights, tmClubId, tmPlayerId,
  type FeedbackVerdict, type MatchContext, type MatchPlayer, type MatchRequest, type RecentGameLite,
} from './src/lib/matching/engine';
import { normalizePosition } from './src/lib/matching/positions';
import { assessLevel, formatEurShort, type ClubLevel, type ClubStrength, type PlayerLevelInfo } from './src/lib/matching/level';
import { parseEuros, parseFeeBand, parseSalaryBand } from './src/lib/matching/tiers';
import { matchRequestToPlayers, type ClubRequest, type RosterPlayer } from './src/lib/requestMatcher';

// ── env ──
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).replace(/^"|"$/g, '');
  }
}
const arg = (name: string) => process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const ONLY_REQUEST = arg('request')?.split('=')[1];
const AS_JSON = !!arg('json');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY or .env.local)');
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
const filled = (v: unknown) => v != null && !(typeof v === 'string' && (!v.trim() || v.trim() === '-' || v.trim() === 'N/A')) && !(Array.isArray(v) && v.filter(Boolean).length === 0);
const toMs = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' && 'toMillis' in v ? (v as { toMillis: () => number }).toMillis() : null;

async function main() {
  const [playersSnap, reqSnap, mandSnap, offersSnap, tiersSnap, fbSnap, euDoc, wDoc, clubSnap] = await Promise.all([
    db.collection('Players').get(),
    db.collection('ClubRequests').get(),
    db.collection('PlayerDocuments').where('type', '==', 'MANDATE').get(),
    db.collection('PlayerOffers').get(),
    db.collection('PlayerTiers').get(),
    db.collection('RequestMatchFeedback').get(),
    db.collection('Config').doc('euCountries').get(),
    db.collection('Config').doc('matchingWeights').get(),
    db.collection('MatchingClubLevels').get(),
  ]);
  const [strengthDoc, playerLevelsDoc] = await Promise.all([
    db.collection('MatchingData').doc('clubStrength').get(),
    db.collection('MatchingData').doc('playerLevels').get(),
  ]);

  const players = playersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as MatchPlayer & Record<string, unknown>);
  const allRequests = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as MatchRequest & Record<string, unknown>);
  let pending = allRequests.filter((r) => (r.status || 'pending') === 'pending');
  if (ONLY_REQUEST) pending = pending.filter((r) => r.id === ONLY_REQUEST);

  // ── context (same inputs as the web hook) ──
  const now = Date.now();
  const mandatesByTmId = new Map<string, string[][]>();
  for (const d of mandSnap.docs) {
    const m = d.data();
    if (m.expired === true) continue;
    const exp = toMs(m.expiresAt);
    if (exp != null && exp < now) continue;
    const leagues = ((m.validLeagues as string[] | undefined) ?? []).filter(Boolean);
    const id = tmPlayerId(m.playerTmProfile);
    if (id && leagues.length) mandatesByTmId.set(id, [...(mandatesByTmId.get(id) ?? []), leagues]);
  }
  const signalsByPlayerId: Record<string, string[]> = {};
  const gamesByPlayerId: Record<string, RecentGameLite[]> = {};
  for (const d of tiersSnap.docs) {
    const t = d.data();
    const kinds = ((t.intel?.signals ?? []) as { kind?: string }[]).map((s) => s.kind).filter((k): k is string => !!k);
    if (kinds.length) signalsByPlayerId[d.id] = kinds;
    if (Array.isArray(t.recentGames) && t.recentGames.length) gamesByPlayerId[d.id] = t.recentGames;
  }
  const clubLevels: Record<string, ClubLevel | null> = {};
  for (const d of clubSnap.docs) clubLevels[d.id] = d.data() as ClubLevel;
  const clubStrength = (strengthDoc.data()?.clubs ?? {}) as Record<string, ClubStrength>;
  const playerLevels = (playerLevelsDoc.data()?.players ?? {}) as Record<string, PlayerLevelInfo>;
  const feedback: Record<string, FeedbackVerdict> = {};
  for (const d of fbSnap.docs) { const f = d.data(); feedback[`${f.requestId}_${f.playerId}`] = f.verdict; }
  const euList = (euDoc.data()?.countries as string[] | undefined) ?? [];
  const euCountries = new Set(euList.map((c) => c.trim().toLowerCase()));
  const ctx: MatchContext = {
    euCountries, mandatesByTmId, offers: offersSnap.docs.map((d) => d.data()), clubLevels, clubStrength, playerLevels, signalsByPlayerId, gamesByPlayerId,
    feedback, weights: resolveWeights(wDoc.exists ? wDoc.data() : null), now,
  };

  // ── 1. coverage ──
  const pFields: [string, (p: Record<string, unknown>) => unknown][] = [
    ['positions', (p) => p.positions], ['age', (p) => p.age], ['foot', (p) => p.foot], ['marketValue', (p) => (parseEuros(p.marketValue as string) > 0 ? 1 : null)],
    ['transferFee (asking)', (p) => p.transferFee], ['salaryRange', (p) => p.salaryRange], ['nationalities', (p) => p.nationalities ?? p.nationality],
    ['contractExpired', (p) => p.contractExpired], ['currentClub.clubTmProfile', (p) => (p.currentClub as { clubTmProfile?: string } | undefined)?.clubTmProfile],
    ['recentGames (doc or PlayerTiers)', (p) => (Array.isArray(p.recentGames) && p.recentGames.length ? 1 : gamesByPlayerId[p.id as string] ? 1 : null)],
    ['tmProfile', (p) => p.tmProfile],
    ['level club (worker)', (p) => playerLevels[p.id as string]?.clubId],
    ['level club strength known', (p) => { const id = playerLevels[p.id as string]?.clubId; return id && clubStrength[id]?.m ? 1 : null; }],
    ['last game played known', (p) => playerLevels[p.id as string]?.lastPlayed],
  ];
  const rFields: [string, (r: Record<string, unknown>) => unknown][] = [
    ['position', (r) => r.position], ['age range', (r) => (r.ageDoesntMatter ? null : r.minAge || r.maxAge || null)],
    ['transferFee', (r) => r.transferFee], ['salaryRange', (r) => r.salaryRange], ['dominateFoot', (r) => r.dominateFoot],
    ['euOnly', (r) => (r.euOnly ? 1 : null)], ['clubTmProfile', (r) => r.clubTmProfile], ['clubCountry', (r) => r.clubCountry],
    ['club level data (worker)', (r) => { const id = tmClubId(r.clubTmProfile as string); return id && clubLevels[id] ? 1 : null; }],
    ['club level ≥10 signings', (r) => { const id = tmClubId(r.clubTmProfile as string); const l = id ? clubLevels[id] : null; return l && l.signings.filter((x) => x.mv > 0).length >= 10 ? 1 : null; }],
  ];
  const coverage = {
    players: Object.fromEntries(pFields.map(([k, f]) => [k, pct(players.filter((p) => filled(f(p))).length, players.length)])),
    openRequests: Object.fromEntries(rFields.map(([k, f]) => [k, pct(pending.filter((r) => filled(f(r))).length, pending.length)])),
  };

  // ── 2. values ──
  const count = (vals: (string | undefined | null)[]) => {
    const m = new Map<string, number>();
    for (const v of vals) { const k = (v ?? '').toString().trim() || '(empty)'; m.set(k, (m.get(k) ?? 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  };
  const unparsed = (vals: [string, number][], parse: (s: string) => unknown) => vals.filter(([v]) => v !== '(empty)' && v !== 'N/A' && parse(v) == null);
  const reqFee = count(pending.map((r) => r.transferFee));
  const reqSal = count(pending.map((r) => r.salaryRange));
  const plFee = count(players.map((p) => p.transferFee));
  const plSal = count(players.map((p) => p.salaryRange));
  const plPos = count(players.flatMap((p) => (p.positions ?? []).map((x) => x ?? '')));
  const values = {
    requestFee: reqFee, requestSalary: reqSal, requestFoot: count(pending.map((r) => r.dominateFoot)), requestPosition: count(pending.map((r) => r.position)),
    playerFee: plFee, playerSalary: plSal, playerFoot: count(players.map((p) => p.foot)),
    unparseable: {
      requestFee: unparsed(reqFee, parseFeeBand), requestSalary: unparsed(reqSal, parseSalaryBand),
      playerFee: unparsed(plFee, parseFeeBand), playerSalary: unparsed(plSal, parseSalaryBand),
      positions: plPos.filter(([v]) => v !== '(empty)' && !normalizePosition(v)),
      requestPositions: count(pending.map((r) => r.position)).filter(([v]) => v !== '(empty)' && !normalizePosition(v)),
    },
    primaryPositionDistribution: count(players.map((p) => normalizePosition(p.positions?.[0] ?? undefined) ?? '(none)')),
  };

  // ── 3. old vs new ──
  const gateTotals: Record<string, number> = {};
  const perRequest = pending.map((r) => {
    const legacy = matchRequestToPlayers(r as unknown as ClubRequest, players as unknown as RosterPlayer[], euCountries);
    const legacyIds = new Set(legacy.map((p) => p.id));
    const ranked = rankPlayersForRequest(r, players, ctx);
    for (const p of players) {
      const e = evaluateMatch(r, p, ctx);
      if (!e.ok) gateTotals[e.gate] = (gateTotals[e.gate] ?? 0) + 1;
    }
    // legacy server shortcut: an active mandate covering the club matched the player for ANY position / criteria
    const mandateOnly = players.filter((p) => {
      const id = tmPlayerId(p.tmProfile);
      if (!id || legacyIds.has(p.id)) return false;
      const covers = (mandatesByTmId.get(id) ?? []).some((l) => mandateCoversClub(l, r));
      return covers && !evaluateMatch(r, p, ctx).ok;
    }).length;
    const levelGated = players.filter((p) => { const e = evaluateMatch(r, p, ctx); return !e.ok && e.gate === 'level'; }).length;
    return {
      id: r.id, club: r.clubName, position: r.position, fee: r.transferFee ?? '', legacy: legacy.length, levelGated,
      strong: ranked.filter((m) => m.bucket === 'strong').length, good: ranked.filter((m) => m.bucket === 'good').length,
      stretch: ranked.filter((m) => m.bucket === 'stretch').length,
      legacyMandateShortcut: mandateOnly,
      top5: ranked.slice(0, 5).map((m) => `${players.find((p) => p.id === m.playerId)?.fullName ?? m.playerId} (${m.score}, lvl ${m.level?.score ?? '?'})`).join(', '),
    };
  });

  // ── 3b. club-level backtest (same method as the proof run in docs §8) ──
  const lvlList = Object.values(clubLevels).filter((l): l is ClubLevel => !!l && l.signings.filter((x) => x.mv > 0).length >= ctx.weights.levelMinSignings);
  const params = { gateFactor: ctx.weights.levelGateFactor, minSignings: ctx.weights.levelMinSignings };
  const levelBacktest = lvlList.map((l) => {
    const own = l.signings.filter((x) => x.mv > 0);
    let pass = 0;
    own.forEach((sg, i) => {
      const loo = { ...l, signings: own.filter((_, j) => j !== i) };
      if (assessLevel(loo, sg.mv, sg.src, params)?.pass !== false) pass++;
    });
    // AUC vs signings of clubs at least 2× weaker
    const weaker = lvlList.filter((o) => o.id !== l.id && o.squadMedian && l.squadMedian && o.squadMedian * 2 <= l.squadMedian).flatMap((o) => o.signings.filter((x) => x.mv > 0));
    let auc: string = '-';
    if (weaker.length >= 10) {
      const sOwn = own.map((sg, i) => assessLevel({ ...l, signings: own.filter((_, j) => j !== i) }, sg.mv, sg.src, params)?.pct ?? 0.5);
      const sW = weaker.map((sg) => assessLevel(l, sg.mv, sg.src, params)?.pct ?? 0.5);
      let wins = 0, n = 0;
      for (const a of sOwn) for (const b of sW) { n++; wins += a > b ? 1 : a === b ? 0.5 : 0; }
      auc = (wins / n).toFixed(2);
    }
    return { club: l.name, squadMedian: formatEurShort(l.squadMedian), signings: own.length, ownSigningsPassGate: pct(pass, own.length), aucVsWeakerClubs: auc };
  });

  // ── 4. golden set ──
  const labelled = pending.filter((r) => Object.keys(feedback).some((k) => k.startsWith(`${r.id}_`)));
  let p5n = 0, p5d = 0, p10n = 0, p10d = 0, fits = 0, fitsTop5 = 0, fitsTop10 = 0, fitsGated = 0;
  for (const r of labelled) {
    const ranked = rankPlayersForRequest(r, players, { ...ctx, feedback: {} }); // rank blind to the labels
    ranked.forEach((m, i) => {
      const v = feedback[`${r.id}_${m.playerId}`];
      if (!v) return;
      if (i < 5) { p5d++; if (v === 'fit') p5n++; }
      if (i < 10) { p10d++; if (v === 'fit') p10n++; }
    });
    for (const [k, v] of Object.entries(feedback)) {
      if (!k.startsWith(`${r.id}_`) || v !== 'fit') continue;
      fits++;
      const pid = k.slice(r.id.length + 1);
      const idx = ranked.findIndex((m) => m.playerId === pid);
      if (idx < 0) fitsGated++;
      else { if (idx < 5) fitsTop5++; if (idx < 10) fitsTop10++; }
    }
  }
  const golden = {
    labelledRequests: labelled.length,
    verdicts: Object.keys(feedback).length,
    'precision@5 (labelled in top 5 that are "fit")': pct(p5n, p5d),
    'precision@10': pct(p10n, p10d),
    'good fits in top 5': pct(fitsTop5, fits),
    'good fits in top 10': pct(fitsTop10, fits),
    'good fits wrongly gated': `${fitsGated}/${fits}`,
  };

  const out = {
    summary: { players: players.length, openRequests: pending.length, activeMandates: mandatesByTmId.size, offers: offersSnap.size, clubLevels: Object.keys(clubLevels).length, clubStrengths: Object.keys(clubStrength).length, playerLevels: Object.keys(playerLevels).length },
    coverage, values, gateTotals, perRequest, levelBacktest, golden,
  };
  if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); return; }

  console.log('\n=== Summary ===');
  console.table(out.summary);
  console.log('\n=== 1. Coverage — roster players ===');
  console.table(coverage.players);
  console.log('\n=== 1. Coverage — open requests ===');
  console.table(coverage.openRequests);
  console.log('\n=== 2. Values (request fee / salary / foot / position) ===');
  console.table(Object.fromEntries(values.requestFee));
  console.table(Object.fromEntries(values.requestSalary));
  console.table(Object.fromEntries(values.requestFoot));
  console.log('Player foot values:'); console.table(Object.fromEntries(values.playerFoot));
  console.log('Primary position distribution (positions[0]):'); console.table(Object.fromEntries(values.primaryPositionDistribution));
  console.log('Unparseable values (should all be empty):'); console.log(JSON.stringify(values.unparseable, null, 2));
  console.log('\n=== 3. Old vs new per open request ===');
  console.table(perRequest);
  console.log('Why players were excluded (all requests × players):'); console.table(gateTotals);
  console.log('\n=== 3b. Club-level backtest (own signings should pass ≈95-100%; AUC near 1.0 = level score separates clubs well) ===');
  console.table(levelBacktest);
  if (!levelBacktest.length) console.log('No club level data yet — run `npx tsx _matching_worker.ts` (or the "Request matching — club level data" GitHub Action) first.');
  console.log('\n=== 4. Golden set (agents\' verdicts) ===');
  console.table(golden);
  if (!labelled.length) console.log('No verdicts yet — mark "Good fit" / "Not a fit" on /requests/<id> to build the golden set.');
}
main().catch((e) => { console.error(e); process.exit(1); });
