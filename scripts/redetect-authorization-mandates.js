/**
 * One-time script: Re-detect MANDATE documents that are actually AUTHORIZATION docs.
 * These documents (e.g. from LOVE PLAYERS e.o.o.d.) use "AUTHORIZATION" title and
 * "valid as from ... until ..." pattern instead of "FOOTBALL AGENT MANDATE" / "ends on".
 *
 * What it does:
 * 1. Queries all MANDATE docs in PlayerDocuments that are missing expiresAt or validLeagues
 * 2. Also queries OTHER docs (may have been misclassified)
 * 3. Downloads each document from Firebase Storage
 * 4. Sends to Gemini 2.5 Flash for re-detection
 * 5. Updates Firestore with extracted expiresAt and validLeagues
 *
 * Usage:
 *   cd /Users/lior.dahan/AndroidStudioProjects/MGSRTeam
 *   GEMINI_API_KEY=AIza... node scripts/redetect-authorization-mandates.js
 *
 * Or with the key from mgsr-web/.env.local:
 *   source <(grep GEMINI_API_KEY mgsr-web/.env.local | head -1) && node scripts/redetect-authorization-mandates.js
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS or firebase default app credentials
 *   - GEMINI_API_KEY env var
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const https = require("https");
const http = require("http");

initializeApp({ storageBucket: "mgsrteam.firebasestorage.app" });
const db = getFirestore();
const bucket = getStorage().bucket();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const PLAYER_DOCUMENTS = "PlayerDocuments";

if (!GEMINI_API_KEY) {
  console.error("ERROR: Set GEMINI_API_KEY environment variable");
  process.exit(1);
}

/**
 * Download file from a Firebase Storage URL (gs:// or https://).
 * Returns { buffer, mimeType }.
 */
async function downloadDocument(storageUrl) {
  // If it's a gs:// path, download from the bucket directly
  if (storageUrl.startsWith("gs://")) {
    const path = storageUrl.replace(/^gs:\/\/[^/]+\//, "");
    const file = bucket.file(path);
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    return { buffer, mimeType: metadata.contentType || "application/octet-stream" };
  }

  // HTTPS download URL
  return new Promise((resolve, reject) => {
    const client = storageUrl.startsWith("https") ? https : http;
    client.get(storageUrl, { headers: { "User-Agent": "MGSR-Script/1.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        client.get(res.headers.location, (res2) => {
          const chunks = [];
          res2.on("data", (c) => chunks.push(c));
          res2.on("end", () => resolve({
            buffer: Buffer.concat(chunks),
            mimeType: res2.headers["content-type"] || "application/octet-stream",
          }));
          res2.on("error", reject);
        }).on("error", reject);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        buffer: Buffer.concat(chunks),
        mimeType: res.headers["content-type"] || "application/octet-stream",
      }));
      res.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Send document to Gemini for mandate/authorization detection.
 */
async function detectWithGemini(base64Data, mimeType) {
  const prompt = `Analyze this document. Determine if it is a FOOTBALL AGENT MANDATE or an AUTHORIZATION document (where one agent authorizes another to represent a player before specific clubs).

If it IS a mandate or authorization, extract:
1. mandateExpiresAt: The end/expiry date. Look for "ends on DD/MM/YYYY", "until DD.MM.YYYY", "valid as from ... until DD.MM.YYYY". Return as DD/MM/YYYY string.
2. validLeagues: Array of league/country names from "Valid Leagues" section. If the document is club-specific (authorization for specific clubs), return the club name(s) as the array.
3. isMandate: true if this is a mandate or authorization document.

Return ONLY a JSON object:
{"isMandate": true/false, "mandateExpiresAt": "DD/MM/YYYY" or null, "validLeagues": ["string"] or []}`;

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseMimeType: "application/json" },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString());
          if (json.error) {
            if (json.error.code === 429) {
              // Rate limited — extract retry delay
              const retryMatch = JSON.stringify(json.error).match(/"retryDelay":"(\d+)s?"/);
              const waitSec = retryMatch ? parseInt(retryMatch[1], 10) + 2 : 20;
              console.error(`  Rate limited — waiting ${waitSec}s then retrying...`);
              resolve({ __retry: true, waitSec });
            } else {
              console.error("  Gemini API error:", JSON.stringify(json.error));
              resolve(null);
            }
            return;
          }
          const parts = json.candidates?.[0]?.content?.parts;
          if (!parts) {
            console.error("  Gemini: no candidates/parts. Finish reason:", json.candidates?.[0]?.finishReason);
            resolve(null);
            return;
          }
          const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim()
            || parts.map((p) => p.text || "").join("").trim();
          let parsed = text;
          const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (match) parsed = match[1].trim();
          if (!parsed.startsWith("{")) {
            const idx = parsed.indexOf("{");
            if (idx >= 0) parsed = parsed.slice(idx);
          }
          resolve(JSON.parse(parsed));
        } catch (e) {
          console.error("  Gemini parse error:", e.message);
          resolve(null);
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseExpiryDate(raw) {
  if (!raw) return null;
  if (typeof raw === "number") return raw;
  const m = String(raw).match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10), 23, 59, 59, 999).getTime();
}

async function run() {
  console.log("=== Re-detect AUTHORIZATION / incomplete MANDATE documents ===\n");

  // Step 1: Find mandate docs missing expiresAt or validLeagues
  console.log("Step 1: Finding MANDATE docs without expiresAt or validLeagues...");
  const mandateSnap = await db.collection(PLAYER_DOCUMENTS).where("type", "==", "MANDATE").get();
  const incompleteMandates = mandateSnap.docs.filter((d) => {
    const data = d.data();
    return !data.expiresAt || !data.validLeagues || data.validLeagues.length === 0;
  });
  console.log(`  Found ${incompleteMandates.length} incomplete mandate docs (of ${mandateSnap.size} total).`);

  // Step 2: Also find OTHER docs (might be misclassified authorization docs)
  console.log("Step 2: Finding OTHER docs that might be authorization docs...");
  const otherSnap = await db.collection(PLAYER_DOCUMENTS).where("type", "==", "OTHER").get();
  console.log(`  Found ${otherSnap.size} OTHER docs.`);

  const docsToProcess = [
    ...incompleteMandates.map((d) => ({ doc: d, reason: "incomplete_mandate" })),
    ...otherSnap.docs.map((d) => ({ doc: d, reason: "other_type" })),
  ];

  console.log(`\nTotal docs to re-detect: ${docsToProcess.length}\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let reclassified = 0;

  for (const { doc: docSnap, reason } of docsToProcess) {
    const data = docSnap.data();
    const name = data.name || docSnap.id;
    const url = data.storageUrl;

    if (!url) {
      console.log(`  ⏭  ${name} — no storageUrl, skipping`);
      skipped++;
      continue;
    }

    console.log(`  📄 Processing: ${name} (${reason})`);
    console.log(`     Player TM: ${data.playerTmProfile || "N/A"}`);

    try {
      // Download
      const { buffer, mimeType: rawMime } = await downloadDocument(url);
      // Fix mime type: Storage often returns application/octet-stream for PDFs
      let mimeType = rawMime;
      if (mimeType === "application/octet-stream" || !mimeType) {
        if (name.toLowerCase().endsWith(".pdf") || buffer.slice(0, 5).toString() === "%PDF-") {
          mimeType = "application/pdf";
        } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
          mimeType = "image/jpeg";
        } else if (buffer[0] === 0x89 && buffer.slice(1, 4).toString() === "PNG") {
          mimeType = "image/png";
        }
      }
      const base64 = buffer.toString("base64");
      console.log(`     Downloaded: ${(buffer.length / 1024).toFixed(0)} KB, type: ${mimeType}`);

      // Detect (with retry on rate limit)
      let result = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const geminiResult = await detectWithGemini(base64, mimeType);
        if (geminiResult && geminiResult.__retry) {
          console.log(`     ⏳ Waiting ${geminiResult.waitSec}s...`);
          await new Promise((r) => setTimeout(r, geminiResult.waitSec * 1000));
          continue;
        }
        result = geminiResult;
        break;
      }
      if (!result) {
        console.log(`     ❌ Gemini returned null`);
        errors++;
        continue;
      }

      console.log(`     Gemini result: ${JSON.stringify(result)}`);

      if (!result.isMandate) {
        console.log(`     ⏭  Not a mandate/authorization — skipping`);
        skipped++;
        continue;
      }

      const expiresAt = parseExpiryDate(result.mandateExpiresAt);
      const validLeagues = Array.isArray(result.validLeagues)
        ? result.validLeagues.map((s) => String(s).trim()).filter(Boolean)
        : [];

      const updates = {};
      if (reason === "other_type") {
        updates.type = "MANDATE";
        reclassified++;
      }
      if (expiresAt) updates.expiresAt = expiresAt;
      if (validLeagues.length > 0) updates.validLeagues = validLeagues;

      if (Object.keys(updates).length === 0) {
        console.log(`     ⏭  No new data to update`);
        skipped++;
        continue;
      }

      // Check if expired
      if (expiresAt && expiresAt < Date.now()) {
        updates.expired = true;
      }

      console.log(`     ✅ Updating: ${JSON.stringify(updates)}`);
      await db.collection(PLAYER_DOCUMENTS).doc(docSnap.id).update(updates);
      updated++;

      // Rate limit: wait 1s between Gemini calls
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`     ❌ Error: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Updated:       ${updated}`);
  console.log(`  Reclassified:  ${reclassified} (OTHER → MANDATE)`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Errors:        ${errors}`);
  console.log(`  Total:         ${docsToProcess.length}`);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
