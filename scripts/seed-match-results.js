#!/usr/bin/env node
/**
 * One-time seed: run recalculateAllMatches for all platforms
 * to populate RequestMatchResults and PlayerMatchResults collections.
 * Run this once after deploying the Cloud Functions to backfill data.
 */
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();

// Load the matcher directly (no deploy needed for seed)
const { recalculateAllMatches } = require("../functions/callables/requestMatcher");

async function main() {
  for (const platform of ["men", "women", "youth"]) {
    console.log(`\n📊 Recalculating matches for platform: ${platform}...`);
    try {
      const result = await recalculateAllMatches(platform);
      console.log(`  ✅ Done: ${result.requestsProcessed} requests × ${result.playersProcessed} players → ${result.docsWritten} docs written (${result.writesSkipped} unchanged, skipped)`);
    } catch (err) {
      console.error(`  ❌ Error for ${platform}:`, err.message);
    }
  }
  console.log("\n🎯 Seed complete!");
  process.exit(0);
}

main();
