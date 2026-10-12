/**
 * DOB Backfill — GitHub Actions version.
 *
 * Transfermarkt blocks Google / Cloud Shell IPs (HTTP 202), so this runs on a
 * GitHub Actions runner and fetches TM through the shared HTML proxy
 * (TM_HTML_PROXY_URL) exactly like the other cron scripts here. For every
 * player that has a `tmProfile` but no `dateOfBirth`, it scrapes the TM page
 * and writes an ISO `dateOfBirth` (YYYY-MM-DD) using the same bulletproof
 * extractor shipped in functions/index.js.
 *
 * Processes Players / PlayersWomen / PlayersYouth, paginated to avoid a single
 * huge Firestore read.
 *
 * Local:      cd mgsr-web && npx tsx _backfill_dob.ts --dry-run
 * GH Actions: env vars FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL,
 *             FIREBASE_PRIVATE_KEY, TM_HTML_PROXY_URL
 *
 * Flags:
 *   --dry-run              Show what WOULD change, write nothing.
 *   --collection=Players   Only one collection.
 *   --player=<docId>       Only one player document id.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { fetchHtmlWithRetry } from './src/lib/transfermarkt';

// ── .env.local support (local dev) ──
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── CLI args ──
const argv = process.argv.slice(2);
const getArg = (name: string): string | boolean | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const DRY_RUN = Boolean(getArg('dry-run'));
const ONLY_COLLECTION = getArg('collection') as string | undefined;
const ONLY_PLAYER = getArg('player') as string | undefined;

// ── Firebase admin (same pattern as the other cron scripts) ──
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials (set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY or .env.local)');
  process.exit(1);
}
const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db: Firestore = getFirestore(app);

// ── Bulletproof DOB extractor — kept in sync with functions/index.js ──
const MONTH_NAME_TO_NUM: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  const add = (num: number, ...names: string[]) => names.forEach((n) => (m[n.toLowerCase()] = num));
  add(1, 'jan', 'january', 'januar', 'jänner', 'janvier', 'enero', 'ene', 'gennaio', 'gen', 'janeiro', 'januari');
  add(2, 'feb', 'february', 'februar', 'février', 'fevrier', 'febrero', 'febbraio', 'fevereiro', 'fev', 'februari');
  add(3, 'mar', 'march', 'märz', 'maerz', 'mars', 'marzo', 'março', 'marco', 'maart', 'mrt');
  add(4, 'apr', 'april', 'avril', 'abril', 'abr', 'aprile', 'aprilie');
  add(5, 'may', 'mai', 'mayo', 'maggio', 'mag', 'maio', 'mei');
  add(6, 'jun', 'june', 'juni', 'juin', 'junio', 'giugno', 'giu', 'junho');
  add(7, 'jul', 'july', 'juli', 'juillet', 'julio', 'luglio', 'lug', 'julho');
  add(8, 'aug', 'august', 'août', 'aout', 'agosto', 'ago', 'augustus');
  add(9, 'sep', 'sept', 'september', 'septembre', 'septiembre', 'settembre', 'set', 'setembro', 'sett');
  add(10, 'oct', 'october', 'oktober', 'octobre', 'octubre', 'ottobre', 'ott', 'outubro', 'out', 'okt');
  add(11, 'nov', 'november', 'novembre', 'noviembre', 'novembro');
  add(12, 'dec', 'december', 'dezember', 'décembre', 'decembre', 'diciembre', 'dic', 'dicembre', 'dezembro', 'dez');
  return m;
})();

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return false;
  const currentYear = new Date().getFullYear();
  if (y < 1900 || y > currentYear) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toIsoDob(y: number, mo: number, d: number): string | null {
  if (!isValidYmd(y, mo, d)) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDobText(text: string): string | null {
  if (!text) return null;
  const str = text.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();
  if (!str) return null;
  const iso = str.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  const monthWord = str.match(/[a-zA-Zà-üÀ-Ü]{3,}/);
  if (monthWord) {
    const nums = str.match(/\d+/g) || [];
    const year = nums.find((n) => n.length === 4);
    const dayCand = nums.find((n) => n.length <= 2 && +n >= 1 && +n <= 31);
    const mo = MONTH_NAME_TO_NUM[monthWord[0].toLowerCase()];
    if (year && dayCand && mo) { const d = toIsoDob(+year, mo, +dayCand); if (d) return d; }
  }
  const num = str.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (num) {
    const a = +num[1], b = +num[2], y = +num[3];
    let day: number | null = null, month: number | null = null;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    if (day !== null && month !== null) { const d = toIsoDob(y, month, day); if (d) return d; }
  }
  const yFirst = str.match(/\b(\d{4})[./](\d{1,2})[./](\d{1,2})\b/);
  if (yFirst) { const d = toIsoDob(+yFirst[1], +yFirst[2], +yFirst[3]); if (d) return d; }
  return null;
}

function extractDobFromTmPage($: ReturnType<typeof cheerio.load>): string | null {
  const ldNodes = $('script[type="application/ld+json"]');
  for (let i = 0; i < ldNodes.length; i++) {
    const raw = $(ldNodes[i]).contents().text();
    if (!raw || !raw.includes('birthDate')) continue;
    const iso = raw.match(/"birthDate"\s*:\s*"(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  }
  const birthNodes = $('[itemprop=birthDate]');
  for (let i = 0; i < birthNodes.length; i++) {
    const c = $(birthNodes[i]).attr('content') || '';
    const iso = c.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  }
  const datumLinks = $('a[href*="datum/"]');
  for (let i = 0; i < datumLinks.length; i++) {
    const href = $(datumLinks[i]).attr('href') || '';
    const iso = href.match(/datum\/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  }
  const birthSpan = $('span[itemprop=birthDate]').first();
  const birthText = (birthSpan.length ? birthSpan.text() : '').trim();
  return parseDobText(birthText);
}

// ── Backfill loop ──
const PAGE_SIZE = 300;
const BATCH_SIZE = 5;
const BATCH_DELAY = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Candidate { ref: FirebaseFirestore.DocumentReference; tmProfile: string; name: string; }

async function collectCandidates(collName: string): Promise<{ candidates: Candidate[]; scanned: number }> {
  const candidates: Candidate[] = [];
  if (ONLY_PLAYER) {
    const doc = await db.collection(collName).doc(ONLY_PLAYER).get();
    if (doc.exists) {
      const d = doc.data()!;
      if (d.tmProfile && !d.dateOfBirth) {
        candidates.push({ ref: doc.ref, tmProfile: d.tmProfile, name: d.fullName || doc.id });
      }
    }
    return { candidates, scanned: doc.exists ? 1 : 0 };
  }
  let scanned = 0;
  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const base = db.collection(collName).orderBy('__name__').limit(PAGE_SIZE);
  for (;;) {
    const snap: FirebaseFirestore.QuerySnapshot = await (last ? base.startAfter(last) : base).get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      scanned++;
      const d = doc.data();
      if (d.tmProfile && !d.dateOfBirth) {
        candidates.push({ ref: doc.ref, tmProfile: d.tmProfile, name: d.fullName || doc.id });
      }
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return { candidates, scanned };
}

async function run() {
  const collections = ONLY_COLLECTION ? [ONLY_COLLECTION] : ['Players', 'PlayersWomen', 'PlayersYouth'];
  const results = { updated: 0, skipped: 0, failed: 0, errors: [] as string[] };

  console.log(
    `\n▶ DOB backfill ${DRY_RUN ? '(DRY RUN — no writes)' : '(LIVE)'}  ` +
      `collections=[${collections.join(', ')}]${ONLY_PLAYER ? `  player=${ONLY_PLAYER}` : ''}\n`
  );

  for (const collName of collections) {
    console.log(`[${collName}] reading (paged, ${PAGE_SIZE}/page)…`);
    const { candidates, scanned } = await collectCandidates(collName);
    console.log(`[${collName}] ${candidates.length} player(s) need DOB (of ${scanned} scanned)`);

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      if (i > 0) await sleep(BATCH_DELAY);
      const batch = candidates.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (player) => {
          try {
            const html = await fetchHtmlWithRetry(player.tmProfile);
            const dob = extractDobFromTmPage(cheerio.load(html));
            if (!dob) {
              results.skipped++;
              console.log(`  · skip  ${player.name} (no reliable DOB found)`);
              return;
            }
            if (DRY_RUN) {
              console.log(`  ⚑ would set  ${player.name} -> ${dob}`);
            } else {
              await player.ref.update({ dateOfBirth: dob });
              console.log(`  ✓ set   ${player.name} -> ${dob}`);
            }
            results.updated++;
          } catch (err) {
            results.failed++;
            const msg = err instanceof Error ? err.message : String(err);
            results.errors.push(`${player.name}: ${msg}`);
            console.error(`  ✖ fail  ${player.name}: ${msg}`);
          }
        })
      );
    }
  }

  console.log(
    `\n✔ Done. ${DRY_RUN ? 'Would update' : 'Updated'}: ${results.updated}, ` +
      `Skipped: ${results.skipped}, Failed: ${results.failed}`
  );
  if (results.errors.length) {
    console.log('\nErrors:');
    results.errors.forEach((e) => console.log('  - ' + e));
  }
}

run().then(() => process.exit(0)).catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
