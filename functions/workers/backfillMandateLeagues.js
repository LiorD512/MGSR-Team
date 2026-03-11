/**
 * Backfill validLeagues for existing mandate documents.
 *
 * Scans all PlayerDocuments where type == "MANDATE" and validLeagues is missing.
 * Downloads the PDF from Firebase Storage, extracts text with pdf-parse,
 * parses the "Valid Leagues" section, and writes the result back.
 *
 * Designed to be called once via `onCall` — safe to re-run (skips already-filled docs).
 */

const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const pdfParse = require("pdf-parse");

const PLAYER_DOCUMENTS_TABLE = "PlayerDocuments";

async function runBackfillMandateLeagues() {
  const db = getFirestore();
  const bucket = getStorage().bucket();

  const snapshot = await db
    .collection(PLAYER_DOCUMENTS_TABLE)
    .where("type", "==", "MANDATE")
    .get();

  console.log(`[BackfillLeagues] Found ${snapshot.size} mandate documents total`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Skip if already has validLeagues
    if (data.validLeagues && Array.isArray(data.validLeagues) && data.validLeagues.length > 0) {
      skipped++;
      continue;
    }

    const storageUrl = data.storageUrl;
    if (!storageUrl) {
      console.log(`[BackfillLeagues] Skipping ${doc.id} — no storageUrl`);
      skipped++;
      continue;
    }

    try {
      const pdfBytes = await downloadFromStorageUrl(bucket, storageUrl);
      if (!pdfBytes) {
        console.log(`[BackfillLeagues] Skipping ${doc.id} — could not download`);
        skipped++;
        continue;
      }

      const pdfText = await extractTextFromPdf(pdfBytes);
      const leagues = extractLeaguesFromText(pdfText);

      if (leagues && leagues.length > 0) {
        await doc.ref.update({ validLeagues: leagues });
        console.log(`[BackfillLeagues] Updated ${doc.id}: ${leagues.join(", ")}`);
        updated++;
      } else {
        console.log(`[BackfillLeagues] No leagues found in ${doc.id}`);
        skipped++;
      }
    } catch (err) {
      console.error(`[BackfillLeagues] Error processing ${doc.id}:`, err.message);
      failed++;
    }
  }

  const result = { success: true, total: snapshot.size, updated, skipped, failed };
  console.log("[BackfillLeagues] Done:", JSON.stringify(result));
  return result;
}

/**
 * Downloads a file from Firebase Storage given its download URL.
 */
async function downloadFromStorageUrl(bucket, storageUrl) {
  try {
    const match = storageUrl.match(/\/o\/([^?]+)/);
    if (!match) {
      const response = await fetch(storageUrl);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    }
    const filePath = decodeURIComponent(match[1]);
    const file = bucket.file(filePath);
    const [contents] = await file.download();
    return contents;
  } catch (err) {
    console.error(`[BackfillLeagues] Download error for ${storageUrl}:`, err.message);
    try {
      const response = await fetch(storageUrl);
      if (!response.ok) return null;
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch {
      return null;
    }
  }
}

/**
 * Extracts raw text from a PDF buffer using pdf-parse.
 */
async function extractTextFromPdf(pdfBytes) {
  const result = await pdfParse(pdfBytes);
  return result.text;
}

/**
 * Parses the "Valid Leagues" section from extracted PDF text.
 * The mandate PDF format is:
 *   Valid Leagues for this mandate:
 *   - League 1
 *   - League 2
 *   • League 2 (Android format)
 */
function extractLeaguesFromText(text) {
  const marker = "Valid Leagues for this mandate:";
  const idx = text.indexOf(marker);
  if (idx === -1) return [];

  const afterMarker = text.substring(idx + marker.length);
  const lines = afterMarker.split("\n");
  const leagues = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
      leagues.push(trimmed.substring(2).trim());
    } else if (trimmed.startsWith("•")) {
      // bullet without space
      leagues.push(trimmed.substring(1).trim());
    } else if (trimmed.length === 0) {
      // skip empty lines
      continue;
    } else if (leagues.length > 0) {
      // Stop at the next non-bullet section
      break;
    } else if (/^[A-Z]/.test(trimmed) && trimmed.length > 2) {
      // Might be a section heading — stop
      break;
    } else if (trimmed.length > 0 && trimmed.length < 100 && !trimmed.includes(".")) {
      // Could be a league name without bullet prefix (e.g. from PDF text extraction)
      leagues.push(trimmed);
    }
  }

  return leagues.filter((l) => l.length > 0);
}

module.exports = { runBackfillMandateLeagues };
