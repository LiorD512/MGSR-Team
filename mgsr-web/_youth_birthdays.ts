/**
 * Read-only report: the next upcoming birthdays in PlayersYouth (or any players collection).
 * Uses the same DOB parsing / days-until logic as the dashboard birthdays module (src/lib/birthdays.ts).
 *
 * Local: cd mgsr-web && npx tsx _youth_birthdays.ts            (top 15, PlayersYouth)
 *        npx tsx _youth_birthdays.ts --limit=30 --collection=Players
 * Credentials: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (env or .env.local), same as _backfill_dob.ts.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { parseDob, daysUntilBirthday } from './src/lib/birthdays';

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

const arg = (name: string) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const LIMIT = parseInt(arg('limit') ?? '15', 10);
const COLLECTION = arg('collection') ?? 'PlayersYouth';

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing Firebase credentials (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY or .env.local)');
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

async function main() {
  const snap = await db.collection(COLLECTION).get();
  let noDob = 0, badDob = 0;
  const rows: { name: string; dob: string; date: string; days: number; turns: number; club: string; ageGroup: string; phone: boolean }[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const d of snap.docs) {
    const p = d.data();
    const raw: string | undefined = p.dateOfBirth || p.passportDetails?.dateOfBirth;
    if (!raw) { noDob++; continue; }
    const parsed = parseDob(raw);
    if (!parsed) { badDob++; continue; }
    const days = daysUntilBirthday(parsed);
    const next = new Date(today.getTime() + days * 86_400_000);
    rows.push({
      name: p.fullName || d.id, dob: raw, days,
      date: next.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      turns: next.getFullYear() - parsed.year,
      club: p.currentClub?.clubName || '—', ageGroup: p.ageGroup || '—', phone: !!p.playerPhoneNumber,
    });
  }
  rows.sort((a, b) => a.days - b.days);
  console.log(`${COLLECTION}: ${snap.size} players · ${rows.length} with a usable DOB · ${noDob} without DOB · ${badDob} unparseable DOB`);
  console.log(`Within 30 days (what the dashboard shows): ${rows.filter((r) => r.days <= 30).length}\n`);
  console.table(rows.slice(0, LIMIT).map((r) => ({ Date: r.date, 'In (days)': r.days, Player: r.name, Turns: r.turns, Group: r.ageGroup, Club: r.club, Phone: r.phone ? 'yes' : 'no' })));
}
main().catch((e) => { console.error(e); process.exit(1); });
