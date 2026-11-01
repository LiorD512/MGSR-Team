#!/usr/bin/env node
/**
 * B.S.G. Transfer Radar — feasibility PoC (throwaway, no database, no UI).
 *
 * Pipeline: local-outlet RSS/Atom feeds -> 30-day window -> football gate -> batched LLM extraction
 * (English only) -> evidence-quote validation -> markdown report in the Actions run summary.
 *
 * Safety:
 *  - Needs only RADAR_GEMINI_KEY (never logged). Hard caps: MAX_REQUESTS and MAX_USD.
 *  - Reads public feeds only; honors robots.txt Disallow for the feed path; 1 homepage + 1 feed request per host.
 *  - Output = public headline + URL + AI label. No full article text is stored or printed.
 * Spec: .kiro/specs/transfer-radar/
 */
import fs from 'node:fs';

const KEY = process.env.RADAR_GEMINI_KEY;
const MODEL = process.env.RADAR_MODEL || 'gemini-2.5-flash-lite';
const PRICE_IN = Number(process.env.PRICE_IN_PER_M || 0.10);   // USD / 1M input tokens (verify current price)
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_M || 0.40); // USD / 1M output tokens
const INTAKE_DAYS = Number(process.env.INTAKE_DAYS || 30);
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 240);
const BATCH = Number(process.env.BATCH || 8);
const MAX_REQUESTS = Number(process.env.MAX_REQUESTS || 40);
const MAX_USD = Number(process.env.MAX_USD || 0.25);
const UA = 'Mozilla/5.0 (compatible; BSG-Radar-PoC/0.1; +https://github.com/LiorD512/MGSR-Team)';

if (!KEY) { console.error('RADAR_GEMINI_KEY is not set'); process.exit(1); }

// ---------------------------------------------------------------- sources
const SITES = [
  ['RS', 'sr', 'telegraf.rs'], ['RS', 'sr', 'mondo.rs'], ['RS', 'sr', 'sportklub.rs'],
  ['HR', 'hr', 'index.hr'], ['HR', 'hr', 'sportske.jutarnji.hr'], ['HR', 'hr', 'tportal.hr'], ['HR', 'hr', 'sportnet.hr'],
  ['GR', 'el', 'gazzetta.gr'], ['GR', 'el', 'novasports.gr'], ['GR', 'el', 'sport24.gr'],
  ['CY', 'el', 'philenews.com'], ['CY', 'el', 'sigmalive.com'], ['CY', 'el', 'protathlima.com'], ['CY', 'el', 'kerkida.net'],
  ['RO', 'ro', 'gsp.ro'], ['RO', 'ro', 'prosport.ro'], ['RO', 'ro', 'digisport.ro'], ['RO', 'ro', 'fanatik.ro'],
  ['PL', 'pl', 'weszlo.com'], ['PL', 'pl', 'sportowefakty.wp.pl'], ['PL', 'pl', 'przegladsportowy.onet.pl'],
  ['BG', 'bg', 'sportal.bg'], ['BG', 'bg', 'gong.bg'],
  ['TR', 'tr', 'fotomac.com.tr'],
  ['PT', 'pt', 'maisfutebol.iol.pt'],
  ['LT', 'lt', '15min.lt'], ['LV', 'lv', 'sportacentrs.com'], ['EE', 'et', 'sport.err.ee'],
];

// football-relevance gate (recall oriented, multilingual stems)
const FOOTBALL = ['football', 'soccer', 'fudbal', 'nogomet', 'ποδόσφαιρ', 'ποδοσφαιρ', 'μεταγραφ', 'superliga', 'fotbal', 'piłk', 'pilk', 'ekstraklasa', 'футбол', 'futbol', 'futebol',
  'jalgpall', 'futbolo', 'futbolininkas', 'futbola', 'transfer', 'liga', 'lig ', 'club', 'klub', 'fc ', 'cf ', 'παίκτ', 'ποδοσφαιριστ', 'igrač', 'igrac', 'jucător', 'jucator', 'zawodnik', 'piłkarz', 'oyuncu', 'jogador', 'играч'];
// draft signal lexicon (recall aid only; ordering priority, never the final decision)
const SIGNAL = ['transfer lista', 'ne računa', 'otpis', 'prekomandovan', 'raskid', 'raskin', 'napušta', 'napusta', 'izlazn', 'nije u planovima', 'odbio', 'ističe ugovor', 'pozajm', 'posudb', 'posuđen',
  'εκτός πλάνων', 'εκτός ομάδας', 'λύση συνεργασίας', 'λύση συμβολαίου', 'δανεισμ', 'αποχωρ', 'δεν υπολογίζ', 'θέλει να φύγει', 'διαθέσιμος', 'ελεύθερος',
  'exclus din lot', 'neplătit', 'salarii restante', 'reziliere', 'împrumut', 'liber de contract', 'nu mai intră', 'vrea să plece', 'conflict cu', 'contract expir', 'transferabil', 'pus pe lista',
  'lista transferowa', 'odsunięt', 'na wylocie', 'rozwiązani', 'wypożycz', 'nie ma przyszłości', 'konflikt z', 'chce odejść', 'kończy mu się kontrakt', 'poza kadrą', 'poza składem',
  'разтрогва', 'извън групата', 'под наем', 'свободен агент', 'напуска', 'конфликт с', 'иска да напусне',
  'kadro dışı', 'kiralık', 'fesih', 'ayrılmak', 'transfer listesi', 'sözleşmesi bitiyor',
  'fora dos planos', 'rescisão', 'emprestad', 'dispensad', 'quer sair', 'conflito com',
  'nepriklauso', 'paskolin', 'nutraukia', 'nutraukė', 'išeina', 'palieka', 'iznomā', 'atstāj', 'līgums beidzas', 'lahkub', 'laenule',
  'out of plans', 'frozen out', 'on loan', 'released', 'contract expires', 'wants to leave', 'transfer list', 'terminate', 'free agent'];

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s || '').normalize('NFC').toLowerCase();
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const clean = (s) => decode((s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function get(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,application/rss+xml,*/*' }, signal: ctl.signal, redirect: 'follow' });
    const text = (await r.text()).slice(0, 2_500_000);
    return { status: r.status, text, url: r.url };
  } finally { clearTimeout(t); }
}

function robotsAllows(robots, path) {
  // minimal parser: rules for User-agent: *
  let applies = false; const dis = [];
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') applies = v === '*';
    else if (applies && k === 'disallow' && v) dis.push(v);
  }
  return !dis.some((d) => path.startsWith(d));
}

function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const tag = (n) => { const r = b.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, 'i')); return r ? r[1] : ''; };
    let link = clean(tag('link'));
    if (!link) { const h = b.match(/<link[^>]+href=["']([^"']+)["']/i); link = h ? h[1] : ''; }
    const date = clean(tag('pubDate') || tag('published') || tag('dc:date') || tag('updated'));
    items.push({ title: clean(tag('title')), link, date, snippet: clean(tag('description') || tag('summary') || tag('content:encoded')).slice(0, 300) });
  }
  return items;
}

async function discoverFeeds(host) {
  const found = [];
  try {
    const home = await get(`https://${host}/`);
    for (const lm of home.text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
      const h = lm[0].match(/href=["']([^"']+)["']/i); if (h) found.push(new URL(h[1], `https://${host}/`).href);
    }
  } catch { /* ignore */ }
  for (const p of ['/feed', '/rss', '/rss.xml', '/feed/']) found.push(`https://${host}${p}`);
  return [...new Set(found)];
}

async function collect([cc, lang, host]) {
  const out = { cc, lang, host, status: 'NO_FEED', items: [] };
  try {
    try {
      const rb = await get(`https://${host}/robots.txt`, 8000);
      if (rb.status === 200 && !robotsAllows(rb.text, '/feed')) { out.status = 'ROBOTS_DENY'; return out; }
    } catch { /* no robots => allowed */ }
    for (const f of (await discoverFeeds(host)).slice(0, 4)) {
      try {
        const r = await get(f);
        if (r.status !== 200) continue;
        const items = parseFeed(r.text);
        if (items.length) { out.items = items; out.status = 'FEED'; out.feed = f; break; }
      } catch { /* try next */ }
    }
  } catch (e) { out.status = 'ERROR'; }
  return out;
}

// ---------------------------------------------------------------- LLM
const SIGNALS = ['NOT_PLAYING', 'EXCLUDED_FROM_SQUAD', 'LOSING_STARTING_PLACE', 'OUT_OF_FAVOR', 'REDUCED_MINUTES', 'NOT_REGISTERED', 'POSITION_REPLACED_BY_SIGNING',
  'CLUB_WANTS_TO_SELL', 'CLUB_WANTS_TO_RELEASE', 'AVAILABLE_ON_LOAN', 'CLUB_OPEN_TO_TERMINATE', 'PLAYER_SEEKING_CLUB', 'CONTRACT_TALKS_FAILED', 'CONTRACT_EXPIRING',
  'CONFLICT_WITH_COACH', 'DISAGREEMENT_WITH_MANAGEMENT', 'DISCIPLINARY_ISSUE', 'UNHAPPY_PLAYING_TIME', 'PUBLIC_DISSATISFACTION', 'REQUESTED_TO_LEAVE',
  'CLUB_FINANCIAL_PROBLEMS', 'SALARY_REDUCTION', 'CLUB_NEEDS_TO_SELL', 'UNPAID_SALARY', 'REPLACEMENT_BEING_RECRUITED', 'SAME_POSITION_SIGNING', 'AGENT_OR_JOURNALIST_DEPARTURE_REPORT',
  'DENIED_BY_CLUB', 'INJURED', 'SUSPENDED', 'RENEWED_CONTRACT', 'RETURNED_TO_SQUAD', 'TRANSFER_COMPLETED'];

const schema = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'INTEGER' },
      football: { type: 'BOOLEAN' },
      squadType: { type: 'STRING', enum: ['CLUB', 'NATIONAL_TEAM', 'YOUTH', 'WOMEN', 'UNKNOWN'] },
      role: { type: 'STRING', enum: ['PLAYER', 'COACH', 'OTHER', 'NONE'] },
      player: { type: 'STRING' },
      club: { type: 'STRING' },
      starPlayer: { type: 'BOOLEAN' },
      signals: { type: 'ARRAY', items: { type: 'STRING', enum: SIGNALS } },
      claimType: { type: 'STRING', enum: ['FACT', 'SPECULATION', 'OPINION', 'RUMOR', 'NONE'] },
      evidenceQuote: { type: 'STRING' },
      historical: { type: 'BOOLEAN' },
      actionable: { type: 'BOOLEAN' },
      titleEn: { type: 'STRING' },
      why: { type: 'STRING' },
    },
    required: ['id', 'football', 'squadType', 'role', 'player', 'club', 'starPlayer', 'signals', 'claimType', 'evidenceQuote', 'historical', 'actionable', 'titleEn', 'why'],
  },
};

const SYSTEM = `You analyze football (soccer) news headlines+snippets from local media in many languages for a football AGENCY that recruits MEN'S CLUB players (typically mid-level: not global superstars).
For EACH input item return one JSON object. Rules:
- football: true only if the item is about association football.
- squadType: CLUB for a club squad; NATIONAL_TEAM for national-team call-ups/squads (these are NOT opportunities); YOUTH; WOMEN; UNKNOWN.
- role: PLAYER if the main subject is a player; COACH; OTHER; NONE.
- player/club: exactly as written in the item (original script ok); empty string if absent. Never invent.
- starPlayer: true if the player is a global superstar at an elite club (e.g. top-5-league giants), who an agency like this cannot realistically recruit.
- signals: choose ONLY codes clearly supported by the text. Do NOT infer "wants to leave" from "not playing". A rumor may still list the signal but must use claimType RUMOR or SPECULATION.
- claimType: FACT (stated as fact / official), SPECULATION, OPINION, RUMOR (unattributed), NONE.
- evidenceQuote: a SHORT verbatim fragment (<= 20 words) copied from the item text that supports the signals; empty if none. Never paraphrase here.
- historical: true if the item describes something that happened long ago (not a current situation).
- actionable: true ONLY if squadType=CLUB, role=PLAYER, football=true, starPlayer=false, signals non-empty (not only counter-signals like INJURED/RENEWED_CONTRACT/TRANSFER_COMPLETED), and the situation is current.
- titleEn: short English translation of the headline.
- why: <= 15 words, English, explaining the decision.
Return a JSON array with one object per input id, in order.`;

let requests = 0, tokIn = 0, tokOut = 0;
const cost = () => (tokIn * PRICE_IN + tokOut * PRICE_OUT) / 1e6;

async function analyze(batch) {
  if (requests >= MAX_REQUESTS) throw new Error('MAX_REQUESTS reached');
  if (cost() >= MAX_USD) throw new Error('MAX_USD reached');
  const input = batch.map((x, i) => `#${i} | country=${x.cc} lang=${x.lang} source=${x.host} date=${x.date.slice(0, 10)}\nTITLE: ${x.title}\nSNIPPET: ${x.snippet || '(none)'}`).join('\n\n');
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    requests++;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (attempt + 1)); if (requests >= MAX_REQUESTS) break; continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${JSON.stringify(j).slice(0, 300).replace(KEY, '***')}`);
    tokIn += j.usageMetadata?.promptTokenCount || 0;
    tokOut += j.usageMetadata?.candidatesTokenCount || 0;
    const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '[]';
    return JSON.parse(txt);
  }
  throw new Error('Gemini failed after retries');
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
const results = [];
const queue = [...SITES];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) results.push(await collect(queue.shift())); }));

const now = Date.now();
const minTs = now - INTAKE_DAYS * 86400000;
const stats = { sites: results.length, withFeed: 0, items: 0, dated: 0, inWindow: 0, noDate: 0, tooOld: 0, football: 0 };
const bySite = [];
let pool = [];
for (const r of results) {
  if (r.status === 'FEED') stats.withFeed++;
  let inw = 0;
  for (const it of r.items) {
    stats.items++;
    const ts = Date.parse(it.date);
    if (!ts) { stats.noDate++; continue; }
    stats.dated++;
    if (ts < minTs || ts > now + 3600000) { stats.tooOld++; continue; }
    inw++; stats.inWindow++;
    pool.push({ ...it, cc: r.cc, lang: r.lang, host: r.host, ts });
  }
  bySite.push(`| ${r.cc} | ${r.host} | ${r.status} | ${r.items.length} | ${inw} |`);
}
// dedupe by link/title
const seen = new Set();
pool = pool.filter((x) => { const k = x.link || x.title; if (seen.has(k)) return false; seen.add(k); return true; });
const footballItems = pool.filter((x) => { const t = norm(`${x.title} ${x.snippet} ${x.link}`); return FOOTBALL.some((k) => t.includes(k)); });
stats.football = footballItems.length;
for (const x of footballItems) x.lex = SIGNAL.filter((k) => norm(`${x.title} ${x.snippet}`).includes(k)).length;
const lexHits = footballItems.filter((x) => x.lex > 0);
const others = footballItems.filter((x) => !x.lex).sort(() => Math.random() - 0.5);
const selected = [...lexHits, ...others].slice(0, MAX_ITEMS);
// balance: ensure no single country dominates the selection beyond 25%
const perCc = {}; const balanced = [];
for (const x of selected) { perCc[x.cc] = (perCc[x.cc] || 0) + 1; if (perCc[x.cc] <= Math.ceil(MAX_ITEMS * 0.25)) balanced.push(x); }

console.log(`sites=${stats.sites} feeds=${stats.withFeed} items=${stats.items} inWindow=${stats.inWindow} football=${stats.football} lexHits=${lexHits.length} selected=${balanced.length}`);

const analyzed = []; let failed = 0; let stopReason = '';
for (let i = 0; i < balanced.length; i += BATCH) {
  const batch = balanced.slice(i, i + BATCH);
  try {
    const out = await analyze(batch);
    batch.forEach((x, idx) => { const o = out.find((q) => q.id === idx) || out[idx]; analyzed.push({ ...x, ai: o || null }); if (!o) failed++; });
  } catch (e) { stopReason = e.message; batch.forEach((x) => analyzed.push({ ...x, ai: null })); failed += batch.length; if (/MAX_|failed after/.test(e.message)) break; }
  await sleep(1200);
}

// evidence validation
const nfc = (s) => norm(s).replace(/[\s\u00a0]+/g, ' ').replace(/[“”„"«»'’`]/g, '').trim();
for (const a of analyzed) {
  if (!a.ai) continue;
  const q = nfc(a.ai.evidenceQuote || '');
  a.evidenceOk = !q || nfc(`${a.title} ${a.snippet}`).includes(q);
}
const ok = analyzed.filter((a) => a.ai);
const flagged = ok.filter((a) => a.ai.actionable);
const withSignals = ok.filter((a) => (a.ai.signals || []).length);
const badEvidence = ok.filter((a) => a.ai.evidenceQuote && !a.evidenceOk);
const usd = cost();

// ---------------------------------------------------------------- report
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 140);
const L = [];
L.push(`# Transfer Radar PoC — ${new Date().toISOString().slice(0, 10)}`);
L.push(`Model \`${MODEL}\` · window ${INTAKE_DAYS} d · requests ${requests}/${MAX_REQUESTS} · tokens in ${tokIn} / out ${tokOut} · **cost ≈ $${usd.toFixed(4)}** · runtime ${Math.round((Date.now() - t0) / 1000)}s${stopReason ? ` · stopped: ${stopReason}` : ''}`);
L.push(`\n## Funnel\n| Stage | Count |\n|---|---|\n| Sites tried | ${stats.sites} |\n| Sites with working feed | ${stats.withFeed} |\n| Feed items | ${stats.items} |\n| Items with usable date | ${stats.dated} (no date: ${stats.noDate}) |\n| Within ${INTAKE_DAYS}-day window | ${stats.inWindow} (too old: ${stats.tooOld}) |\n| After football gate | ${stats.football} |\n| …with signal-lexicon hit | ${lexHits.length} |\n| Sent to LLM | ${balanced.length} (analyzed ${ok.length}, failed ${failed}) |\n| LLM: has ≥1 signal | ${withSignals.length} |\n| **LLM: actionable** | **${flagged.length}** |\n| Evidence quote not found in text | ${badEvidence.length} |`);
L.push(`\nProjected cost per 1,000 analyzed articles ≈ **$${ok.length ? (usd / ok.length * 1000).toFixed(3) : 'n/a'}**`);
L.push(`\n## Source availability\n| Country | Host | Status | Items | In window |\n|---|---|---|---|---|\n${bySite.join('\n')}`);
L.push(`\n## A. Flagged ACTIONABLE (label each: ✅ truly actionable / ❌ false positive)\n| # | Ctry | Source | Date | Headline (English) | Player | Club | Signals | Claim | Evidence ok | Why |\n|---|---|---|---|---|---|---|---|---|---|---|`);
flagged.forEach((a, i) => L.push(`| A${i + 1} | ${a.cc} | ${a.host} | ${a.date.slice(0, 10)} | [${esc(a.ai.titleEn || a.title)}](${a.link}) | ${esc(a.ai.player)} | ${esc(a.ai.club)} | ${(a.ai.signals || []).join(', ')} | ${a.ai.claimType} | ${a.evidenceOk ? 'yes' : 'NO'} | ${esc(a.ai.why)} |`));
const rest = ok.filter((a) => !a.ai.actionable);
L.push(`\n## B. NOT flagged (label any that SHOULD have been actionable: 🔴 missed)\n| # | Ctry | Source | Headline (English) | football | squad | role | star | signals | Why not |\n|---|---|---|---|---|---|---|---|---|---|`);
rest.forEach((a, i) => L.push(`| B${i + 1} | ${a.cc} | ${a.host} | [${esc(a.ai.titleEn || a.title)}](${a.link}) | ${a.ai.football ? 'Y' : 'N'} | ${a.ai.squadType} | ${a.ai.role} | ${a.ai.starPlayer ? 'Y' : ''} | ${(a.ai.signals || []).join(', ')} | ${esc(a.ai.why)} |`));
const md = L.join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
