#!/usr/bin/env node
/**
 * One-time LOCAL backfill of player date-of-birth from Transfermarkt.
 *
 * Does the exact same thing as the `backfillPlayerDob` Cloud Function, but runs
 * from your machine via the Admin SDK (no auth/login needed). It scans
 * Players / PlayersWomen / PlayersYouth, and for every player that has a
 * `tmProfile` URL but no `dateOfBirth`, scrapes the DOB from TM and writes it.
 *
 * It reuses:
 *   - the real TM fetcher (../lib/transfermarkt → fetchDocument) with realistic
 *     headers + rate limiting + circuit breaker, and
 *   - the SAME bulletproof extractor logic as functions/index.js
 *     (extractDobFromTmPage), kept in sync here.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HOW TO RUN
 *
 *   1. Get a service-account key JSON:
 *      Firebase console → Project settings → Service accounts →
 *      "Generate new private key". Save it somewhere safe.
 *
 *   2. From the repo root:
 *        cd functions
 *        npm install            # if you haven't already
 *        GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json \
 *          node scripts/backfill-dob-local.js
 *
 *   Optional flags:
 *     --dry-run                 Show what WOULD change, write nothing.
 *     --collection=Players      Only one collection (Players | PlayersWomen | PlayersYouth).
 *     --player=<docId>          Only one specific player document id.
 *     --project=mgsr-64e4b      Override project id (defaults to the key's project).
 *
 *   Examples:
 *     # whole roster, for real
 *     GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/backfill-dob-local.js
 *
 *     # preview only, men collection
 *     GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *       node scripts/backfill-dob-local.js --dry-run --collection=Players
 *
 *     # just one player
 *     GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *       node scripts/backfill-dob-local.js --player=<amadou-doc-id>
 * ──────────────────────────────────────────────────────────────────────────
 */

const admin = require("firebase-admin");
const { fetchDocument } = require("../lib/transfermarkt");

// ── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const DRY_RUN = Boolean(getArg("dry-run"));
const ONLY_COLLECTION = getArg("collection");
const ONLY_PLAYER = getArg("player");
const PROJECT_ID = getArg("project");

// ── Init Admin SDK (uses GOOGLE_APPLICATION_CREDENTIALS) ─────────────────────
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    "\n✖ GOOGLE_APPLICATION_CREDENTIALS is not set.\n" +
      "  Point it at your service-account key JSON, e.g.:\n" +
      "    GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \\\n" +
      "      node scripts/backfill-dob-local.js\n"
  );
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  ...(PROJECT_ID ? { projectId: PROJECT_ID } : {}),
});
const db = admin.firestore();

// ── Bulletproof DOB extractor — kept in sync with functions/index.js ─────────
const MONTH_NAME_TO_NUM = (() => {
  const m = {};
  const add = (num, ...names) => names.forEach((n) => (m[n.toLowerCase()] = num));
  add(1, "jan", "january", "januar", "jänner", "janvier", "enero", "ene", "gennaio", "gen", "janeiro", "januari");
  add(2, "feb", "february", "februar", "février", "fevrier", "febrero", "febbraio", "fevereiro", "fev", "februari");
  add(3, "mar", "march", "märz", "maerz", "mars", "marzo", "março", "marco", "maart", "mrt");
  add(4, "apr", "april", "avril", "abril", "abr", "aprile", "aprilie");
  add(5, "may", "mai", "mayo", "maggio", "mag", "maio", "mei");
  add(6, "jun", "june", "juni", "juin", "junio", "giugno", "giu", "junho");
  add(7, "jul", "july", "juli", "juillet", "julio", "luglio", "lug", "julho");
  add(8, "aug", "august", "août", "aout", "agosto", "ago", "augustus");
  add(9, "sep", "sept", "september", "septembre", "septiembre", "settembre", "set", "setembro", "sett");
  add(10, "oct", "october", "oktober", "octobre", "octubre", "ottobre", "ott", "outubro", "out", "okt");
  add(11, "nov", "november", "novembre", "noviembre", "novembro");
  add(12, "dec", "december", "dezember", "décembre", "decembre", "diciembre", "dic", "dicembre", "dezembro", "dez");
  return m;
})();

function isValidYmd(y, mo, d) {
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return false;
  const currentYear = new Date().getFullYear();
  if (y < 1900 || y > currentYear) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toIsoDob(y, mo, d) {
  if (!isValidYmd(y, mo, d)) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDobText(text) {
  if (!text) return null;
  const str = text.replace(/\s*\(\s*\d+\s*\)\s*$/, "").trim();
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
    let day = null, month = null;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    if (day !== null && month !== null) { const d = toIsoDob(y, month, day); if (d) return d; }
  }
  const yFirst = str.match(/\b(\d{4})[./](\d{1,2})[./](\d{1,2})\b/);
  if (yFirst) { const d = toIsoDob(+yFirst[1], +yFirst[2], +yFirst[3]); if (d) return d; }
  return null;
}

function extractDobFromTmPage($) {
  const ldNodes = $('script[type="application/ld+json"]');
  for (let i = 0; i < ldNodes.length; i++) {
    const raw = $(ldNodes[i]).contents().text();
    if (!raw || !raw.includes("birthDate")) continue;
    const iso = raw.match(/"birthDate"\s*:\s*"(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  }
  const birthNodes = $("[itemprop=birthDate]");
  for (let i = 0; i < birthNodes.length; i++) {
    const c = $(birthNodes[i]).attr("content") || "";
    const iso = c.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  }
  const datumLinks = $('a[href*="datum/"]');
  for (let i = 0; i < datumLinks.length; i++) {
    const href = $(datumLinks[i]).attr("href") || "";
    const iso = href.match(/datum\/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) { const d = toIsoDob(+iso[1], +iso[2], +iso[3]); if (d) return d; }
  }
  const birthSpan = $("span[itemprop=birthDate]").first();
  const birthText = (birthSpan.length ? birthSpan.text() : "").trim();
  return parseDobText(birthText);
}

// ── Backfill loop — mirrors the Cloud Function exactly ───────────────────────
const BATCH_SIZE = 5;
const BATCH_DELAY = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const collections = ONLY_COLLECTION
    ? [ONLY_COLLECTION]
    : ["Players", "PlayersWomen", "PlayersYouth"];

  const results = { updated: 0, skipped: 0, failed: 0, errors: [] };

  console.log(
    `\n▶ DOB backfill ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE)"}  ` +
      `collections=[${collections.join(", ")}]` +
      `${ONLY_PLAYER ? `  player=${ONLY_PLAYER}` : ""}\n`
  );

  for (const collName of collections) {
    console.log(`[${collName}] reading…`);
    const snap = await db.collection(collName).get();

    const candidates = [];
    snap.forEach((doc) => {
      if (ONLY_PLAYER && doc.id !== ONLY_PLAYER) return;
      const d = doc.data();
      if (d.tmProfile && !d.dateOfBirth) {
        candidates.push({ ref: doc.ref, tmProfile: d.tmProfile, name: d.fullName || doc.id });
      }
    });

    console.log(
      `[${collName}] ${candidates.length} player(s) need DOB (of ${snap.size} total)`
    );

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      if (i > 0) await sleep(BATCH_DELAY);
      const batch = candidates.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (player) => {
          try {
            const $ = await fetchDocument(player.tmProfile);
            const dob = extractDobFromTmPage($);
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
            results.errors.push(`${player.name}: ${err.message}`);
            console.error(`  ✖ fail  ${player.name}: ${err.message}`);
          }
        })
      );
    }
  }

  console.log(
    `\n✔ Done. ${DRY_RUN ? "Would update" : "Updated"}: ${results.updated}, ` +
      `Skipped: ${results.skipped}, Failed: ${results.failed}`
  );
  if (results.errors.length) {
    console.log("\nErrors:");
    results.errors.forEach((e) => console.log("  - " + e));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  });
