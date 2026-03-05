/**
 * Seed script: writes the EU countries list to Firestore at Config/euCountries.
 * Run once (or whenever the list changes):
 *   npx ts-node --esm scripts/seed-eu-countries.ts
 *
 * All platforms (web, Android, iOS) read from this single source of truth.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : undefined;

  initializeApp(
    serviceAccount
      ? { credential: cert(serviceAccount) }
      : { projectId: process.env.FIREBASE_PROJECT_ID || 'mgsrteam' }
  );
}

const db = getFirestore();

/** Current EU member states (27 countries as of 2025). */
const EU_COUNTRIES: string[] = [
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Ireland',
  'Italy',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
];

async function main() {
  console.log(`Writing ${EU_COUNTRIES.length} EU countries to Config/euCountries…`);
  await db.doc('Config/euCountries').set({
    countries: EU_COUNTRIES,
    updatedAt: Date.now(),
  });
  console.log('Done ✓');
}

main().catch(console.error);
