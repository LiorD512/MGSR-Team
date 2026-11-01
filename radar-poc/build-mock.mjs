#!/usr/bin/env node
/**
 * Builds docs/transfer-radar-mock.html from REAL PoC output (radar-poc/mockdata.json, run 41282935761).
 *  - Every headline, URL, date, source, AI label and evidence quote is real PoC output.
 *  - Human review step (stands in for the future DB/target-profile filter + entity resolution): items I judged to be
 *    false positives are NOT shown as opportunities; they appear in "Removed by review" with the reason.
 *  - Scores are computed by a PROTOTYPE of the spec's scoring rules (see scoreOf) from those reports only.
 *    Contract, age, position, photo are "unknown" because the PoC has no football-database join yet.
 *  - Source tiers and origin groups are mock assumptions (marked as such in the UI).
 */
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(new URL('./mockdata.json', import.meta.url)));
const NOW = Date.parse('2026-11-01T08:00:00Z');
const I = data.items;

// ---------- source tier priors (mock) ----------
const TIER = { 'gsp.ro': 'B', 'fanatik.ro': 'B', 'digisport.ro': 'B', Ruik: 'C', 'Flashscore.sk': 'C', Sportnet: 'B', 'Transfery.info': 'C', 'weszlo.com': 'B', 'SportSport.ba': 'C',
  'Football24.bg': 'C', 'bgdnes.bg': 'C', Maisfutebol: 'B', 'Nerikes Allehanda': 'B', 'Google News': 'B', 'Antena Sport': 'C', 'FCUpdate.nl': 'C' };
const TIERF = { A: 1, B: 0.85, C: 0.65, D: 0.4 };
const VERF = { CONFIRMED: 1, REPORTED: 0.85, RUMOR: 0.5 };
const HALF = { availability: 21, exclusion: 14, relationship: 30 };
const MAXP = { availability: 25, exclusion: 15, relationship: 15 };
const COMP = { PLAYER_SEEKING_CLUB: 'availability', CLUB_WANTS_TO_SELL: 'availability', CLUB_WANTS_TO_RELEASE: 'availability', AVAILABLE_ON_LOAN: 'availability', REQUESTED_TO_LEAVE: 'availability',
  EXCLUDED_FROM_SQUAD: 'exclusion', NOT_PLAYING: 'exclusion', OUT_OF_FAVOR: 'exclusion', DISCIPLINARY_ISSUE: 'relationship', CONFLICT_WITH_COACH: 'relationship' };
const CAT = { availability: 'B · Transfer availability', exclusion: 'A · Sporting status', relationship: 'C · Relationship issues' };

// ---------- curated players: indexes point to REAL PoC items ----------
const P = [
  { id: 'chory', name: 'Chorý', club: 'Slavia (Prague)', country: 'Czech Republic', flag: '🇨🇿', r: [102, 112, 113, 116], origin: { 102: 'cz-own', 112: 'sk-rewrite', 113: 'sk-rewrite', 116: 'sk-rewrite' }, note: 'Name as written in the headlines (first name not stated).' },
  { id: 'cordea', name: 'Andrei Cordea', club: 'CFR Cluj', country: 'Romania', flag: '🇷🇴', r: [279, 223, 284, 245, 171, 254], origin: { 279: 'digi', 223: 'fanatik', 284: 'gsp', 245: 'fanatik', 171: 'gsp', 254: 'digi' }, closed: true },
  { id: 'abdallah', name: 'Hakim Abdallah', club: 'Dinamo (Bucharest)', country: 'Romania', flag: '🇷🇴', r: [206], origin: { 206: 'fanatik' } },
  { id: 'wjunnyk', name: 'Bohdan Wjunnyk', club: 'Legia Warszawa', country: 'Poland', flag: '🇵🇱', r: [43], origin: { 43: 'ti' } },
  { id: 'guzman', name: 'Jorge Guzman', club: 'Željezničar', country: 'Bosnia & Herzegovina', flag: '🇧🇦', r: [10], origin: { 10: 'ss' } },
  { id: 'simms', name: 'Ellis Simms', club: 'Coventry', country: 'England', flag: '🏴', r: [55], origin: { 55: 'wes' } },
  { id: 'heverton', name: 'Heverton', club: 'Levski Sofia', country: 'Bulgaria', flag: '🇧🇬', r: [57], origin: { 57: 'f24' } },
  { id: 'perea', name: 'Perea', club: 'Levski Sofia', country: 'Bulgaria', flag: '🇧🇬', r: [69], origin: { 69: 'bgd' } },
  { id: 'fonseca', name: 'Sérgio Fonseca', club: 'AVS', country: 'Portugal', flag: '🇵🇹', r: [123], origin: { 123: 'mf' } },
  { id: 'kusu', name: 'Manasse Kusu', club: 'Club not stated in headline', country: 'Sweden', flag: '🇸🇪', r: [148], origin: { 148: 'na' }, unresolvedClub: true },
  { id: 'rygaard', name: 'Mikkel Rygaard', club: 'Häcken', country: 'Sweden', flag: '🇸🇪', r: [149], origin: { 149: 'gp' } },
  { id: 'icardi', name: 'Mauro Icardi', club: 'Free agent (4 months)', country: '—', flag: '🌐', r: [33], origin: { 33: 'as' }, rumor: true },
];
// leads: real items where the player is not named in the headline -> needs article read (planned: body fetch)
const LEADS = [52, 49, 106, 138, 128, 156, 63];
// removed in review (real PoC output judged not a recruitable opportunity)
const REMOVED = [
  { idx: 1, why: 'Other sport (volleyball club)' }, { idx: 126, why: 'Other sport / not football' },
];
function find(host, sub) { return I.findIndex((x) => x.host === host && x.title.includes(sub)); }
const removedFinal = I.map((x, i) => ({ x, i })).filter(({ x }) => x.final).filter(({ i }) => !P.some((p) => p.r.includes(i)));

const dateOf = (s) => Date.parse(s);
const ageD = (ts) => Math.max(0, (NOW - ts) / 86400000);

function reportsOf(p) {
  return p.r.map((i) => {
    const x = I[i]; const a = x.ai; const tier = TIER[x.host] || 'C';
    const completed = (a.signals || []).includes('TRANSFER_COMPLETED');
    let ver = a.claimType === 'RUMOR' || a.claimType === 'SPECULATION' ? 'RUMOR' : 'REPORTED';
    if (/confirm/i.test(a.titleEn || '') && /clubul a confirmat/i.test(a.evidenceQuote || '')) ver = 'CONFIRMED';
    if (p.rumor) ver = 'RUMOR';
    return { idx: i, ts: dateOf(x.date), host: x.host, tier, ver, title: x.title, en: a.titleEn || '', quote: a.evidenceQuote || '', link: x.link, signals: a.signals || [], claim: a.claimType, completed, origin: p.origin[i] || x.host, direct: a.strength };
  }).sort((a, b) => b.ts - a.ts);
}

function scoreOf(p, reps) {
  // prototype of spec §8: component = weight x strength x confidence x recency ; independence from distinct origins; guards
  const comps = {}; const drivers = {};
  const live = reps.filter((r) => r.signals.some((s) => COMP[s]) && !(p.closed && false));
  for (const r of live) {
    const conf = 0.4 + 0.6 * TIERF[r.tier] * VERF[r.ver];
    for (const s of r.signals) {
      const c = COMP[s]; if (!c) continue;
      const rec = 0.5 + 0.5 * Math.pow(0.5, ageD(r.ts) / HALF[c]);
      const val = MAXP[c] * 1 * conf * rec;
      if (!comps[c] || val > comps[c].pts) { comps[c] = { pts: val, max: MAXP[c], from: r, signal: s, conf, rec }; }
    }
  }
  const origins = new Set(live.map((r) => r.origin));
  const indep = origins.size >= 4 ? 10 : origins.size === 3 ? 8 : origins.size === 2 ? 5 : 0;
  let total = Object.values(comps).reduce((a, c) => a + c.pts, 0) + indep;
  const caps = [];
  const bestTier = live.some((r) => r.tier === 'A') ? 'A' : live.some((r) => r.tier === 'B') ? 'B' : 'C';
  if (origins.size < 2 && bestTier !== 'A' && total > 59) { total = 59; caps.push('Single independent origin -> capped at 59'); }
  if (origins.size < 2 && ['C', 'D'].includes(bestTier)) { caps.push('Single origin, tier C source -> needs a 2nd independent source to rise'); }
  const closed = reps.some((r) => r.completed);
  const raw = Math.round(total);
  let score = raw;
  if (closed) { score = Math.min(raw, 12); caps.push('Transfer confirmed in later reports -> opportunity likely closed (score set low, archived)'); }
  return { score, raw, comps, indep, origins: origins.size, caps, closed };
}
const level = (s) => (s >= 85 ? 'Exceptional' : s >= 70 ? 'High priority' : s >= 50 ? 'Potential' : s >= 30 ? 'Monitor' : 'Low');

const players = P.map((p) => {
  const reps = reportsOf(p); const sc = scoreOf(p, reps);
  const last = Math.max(...reps.map((r) => r.ts));
  const hrs = (NOW - last) / 3600000;
  const urgency = sc.closed ? 'Closed' : hrs <= 48 ? 'High' : hrs <= 168 ? 'Medium' : 'Low';
  const sigs = [...new Set(reps.flatMap((r) => r.signals))];
  const cats = [...new Set(sigs.map((s) => COMP[s]).filter(Boolean))].map((c) => CAT[c]);
  const top = reps.find((r) => r.signals.some((s) => COMP[s])) || reps[0];
  const bestVer = reps.some((r) => r.ver === 'CONFIRMED') ? 'CONFIRMED' : reps.some((r) => r.ver === 'REPORTED') ? 'REPORTED' : 'RUMOR';
  const bestTier = reps.some((r) => r.tier === 'B') ? 'B' : 'C';
  const loan = sigs.includes('AVAILABLE_ON_LOAN');
  let action = 'Watch — wait for a second independent source.';
  const avail = sc.comps.availability;
  if (sc.closed) action = 'Do not contact — later reports say the move is agreed/announced. Keep in archive; re-open only if it collapses.';
  else if (sc.score >= 40 && sc.origins >= 2) action = 'Verify with a local contact today, then approach the agent.';
  else if (loan) action = 'Ask the club/agent about loan terms; verify before outreach.';
  else if (avail && p.rumor) action = 'Rumor only — verify before any outreach.';
  else if (avail) action = 'Single report — verify with a local contact before outreach.';
  return { id: p.id, name: p.name, club: p.club, country: p.country, flag: p.flag, note: p.note || '', unresolvedClub: !!p.unresolvedClub, closed: !!p.closed, score: sc.score, raw: sc.raw, level: sc.closed ? 'Closed' : level(sc.score),
    origins: sc.origins, indep: sc.indep, caps: sc.caps, comps: Object.fromEntries(Object.entries(sc.comps).map(([k, v]) => [k, { pts: +v.pts.toFixed(1), max: v.max, signal: v.signal, host: v.from.host, tier: v.from.tier, ver: v.from.ver, conf: +v.conf.toFixed(2), rec: +v.rec.toFixed(2) }])),
    last, urgency, cats, top: { en: top.en, host: top.host, tier: top.tier }, bestVer, bestTier, loan, action, reports: reps };
}).sort((a, b) => (a.closed - b.closed) || b.score - a.score || b.last - a.last);

const leads = LEADS.map((i) => ({ host: I[i].host, ts: dateOf(I[i].date), title: I[i].title, en: I[i].ai.titleEn || '', club: I[i].ai.club, link: I[i].link, sig: I[i].ai.signals }));
const removed = [
  ...removedFinal.map(({ x, i }) => ({ host: x.host, title: x.ai.titleEn || x.title, player: x.ai.player, club: x.ai.club, link: x.link,
    why: /Semeniuk/.test(x.ai.player) ? 'Other sport — volleyball club (AI error)' : /Mońka|Wiśniewski/.test(x.ai.player) ? 'National-team squad, not a club (AI error)' : /Vasco/.test(x.ai.player) ? 'Coach, not a player (AI error)' :
      /Gjokaj|Γκιόκερες|Garnacho|Courtois|Grealish|Perisic|Šín/.test(x.ai.player + x.title) ? 'Star / outside target profile or not an opportunity' : /Bakayoko/.test(x.ai.player) ? 'Real signal, but value likely above target range (needs DB value)' : 'Duplicate / not recruitable' })),
  ...I.map((x, i) => ({ x, i })).filter(({ x }) => x.ai.actionable && !x.final && /Grealish|Martínez|Endrick|Gyökeres|Palmer|Sancho|Richarlison|Trent|Rashford/.test(x.ai.player || '')).map(({ x }) => ({ host: x.host, title: x.ai.titleEn || x.title, player: x.ai.player, club: x.ai.club, link: x.link, why: 'Auto-filtered: ' + x.dropReason })),
];
{ const seenR = new Set(); for (let k = removed.length - 1; k >= 0; k--) { const key = (removed[k].player || removed[k].title).replace(/[^A-Za-zÀ-ž]/g, '').slice(0, 7).toLowerCase(); if (seenR.has(key)) removed.splice(k, 1); else seenR.add(key); } }
const siteCount = {};
for (const x of I) if (x.final) siteCount[x.host] = (siteCount[x.host] || 0) + 1;
const SRC = data.sites.map((s) => ({ ...s, tier: TIER[s.host] || 'C', relevant: I.filter((x) => x.src === 'feed' && x.host === s.host && (x.ai.signals || []).length).length }));
const OUT = { generatedAt: data.generatedAt, usd: data.usd, stats: data.stats, requests: data.requests, tokIn: data.tokIn, tokOut: data.tokOut, analyzed: I.length, signals: I.filter((x) => (x.ai.signals || []).length).length,
  players, leads, removed, sources: SRC, now: NOW };
fs.writeFileSync(new URL('./mockview.json', import.meta.url), JSON.stringify(OUT));

const html = fs.readFileSync(new URL('./mock-template.html', import.meta.url), 'utf8').replace('/*__DATA__*/', 'const DATA=' + JSON.stringify(OUT).replace(/</g, '\\u003c') + ';');
fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/transfer-radar-mock.html', import.meta.url), html);
console.log('players', players.map((p) => `${p.name}:${p.score}(${p.level})`).join(' | '));
console.log('leads', leads.length, 'removed', removed.length);
