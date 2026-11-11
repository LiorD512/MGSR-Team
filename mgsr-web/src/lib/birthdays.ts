/** Shared birthday logic for the "Light Management Room" dashboards (men + youth). */

/** Parse dateOfBirth strings in common formats → { month (0-based), day, year }. */
export function parseDob(dob: string | undefined): { month: number; day: number; year: number } | null {
  if (!dob) return null;
  const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: +iso[1]!, month: +iso[2]! - 1, day: +iso[3]! };
  const dmy = dob.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return { year: +dmy[3]!, month: +dmy[2]! - 1, day: +dmy[1]! };
  return null;
}

/** Whole days from today until the next occurrence of a birthday (0 = today). */
export function daysUntilBirthday(parsed: { month: number; day: number }): number {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), parsed.month, parsed.day);
  if (next < todayMidnight) next = new Date(today.getFullYear() + 1, parsed.month, parsed.day);
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86_400_000);
}

export interface BirthdayPlayerLike {
  id: string;
  fullName?: string;
  currentClub?: { clubName?: string };
  playerPhoneNumber?: string;
  agentInChargeName?: string;
  dateOfBirth?: string;
  passportDetails?: { dateOfBirth?: string };
}

export interface BirthdayEntry<P extends BirthdayPlayerLike = BirthdayPlayerLike> {
  id: string;
  player: P;
  fullName: string;
  club?: string;
  phone?: string;
  agent?: string;
  turnsAge: number;
  daysUntil: number;
  dateLabel: string;
}

/**
 * Upcoming player birthdays (today + next 30 days), soonest first.
 * Capped at 5 — unless MORE than 5 players have a birthday today, in which case all of today's are shown (and nothing else).
 */
export function upcomingBirthdays<P extends BirthdayPlayerLike>(players: P[], isRtl: boolean): BirthdayEntry<P>[] {
  const list: BirthdayEntry<P>[] = [];
  for (const p of players) {
    const parsed = parseDob(p.dateOfBirth || p.passportDetails?.dateOfBirth);
    if (!parsed) continue;
    const daysUntil = daysUntilBirthday(parsed);
    if (daysUntil > 30) continue;
    // Year of the next birthday occurrence → age they will turn.
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const thisYearBday = new Date(todayMidnight.getFullYear(), parsed.month, parsed.day);
    const nextBdayYear = thisYearBday < todayMidnight ? todayMidnight.getFullYear() + 1 : todayMidnight.getFullYear();
    list.push({
      id: p.id,
      player: p,
      fullName: p.fullName || '—',
      club: p.currentClub?.clubName,
      phone: p.playerPhoneNumber,
      agent: p.agentInChargeName?.trim() || undefined,
      turnsAge: nextBdayYear - parsed.year,
      daysUntil,
      dateLabel: new Date(todayMidnight.getFullYear(), parsed.month, parsed.day).toLocaleDateString(
        isRtl ? 'he-IL' : 'en-US',
        { month: 'short', day: 'numeric' }
      ),
    });
  }
  const sorted = list.sort((a, b) => a.daysUntil - b.daysUntil);
  const today = sorted.filter((b) => b.daysUntil === 0);
  return today.length > 5 ? today : sorted.slice(0, 5);
}
