'use client';

import { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { openWhatsAppWithMessage } from '@/lib/whatsapp';
import type { WomanPlayer } from '@/lib/playersWomen';
import type { YouthPlayer } from '@/lib/playersYouth';

export interface MenPlayerForBirthday {
  id: string;
  fullName?: string;
  profileImage?: string;
  currentClub?: { clubName?: string };
  playerPhoneNumber?: string;
  agentInChargeName?: string;
  dateOfBirth?: string;
  passportDetails?: { dateOfBirth?: string };
}

interface BirthdayPlayer {
  id: string;
  fullName: string;
  profileImage?: string;
  club?: string;
  phone: string;
  turnsAge: number;
  /** ageGroup for youth, e.g. "U-17" */
  ageGroup?: string;
  /** Agent in charge name */
  agentInChargeName?: string;
  /** day-of-month + month for upcoming sorting */
  daysUntil: number;
  dateLabel: string;
  platform: 'men' | 'women' | 'youth';
}

/** Parse dateOfBirth strings in common formats → { month (0-based), day, year } */
function parseDob(dob: string | undefined): { month: number; day: number; year: number } | null {
  if (!dob) return null;
  // YYYY-MM-DD
  const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: +iso[1]!, month: +iso[2]! - 1, day: +iso[3]! };
  // DD.MM.YYYY or DD/MM/YYYY
  const dmy = dob.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return { year: +dmy[3]!, month: +dmy[2]! - 1, day: +dmy[1]! };
  return null;
}

function daysUntilBirthday(parsed: { month: number; day: number }): number {
  const today = new Date();
  const thisYear = today.getFullYear();
  let next = new Date(thisYear, parsed.month, parsed.day);
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    next = new Date(thisYear + 1, parsed.month, parsed.day);
  }
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86_400_000);
}

function computeAge(year: number): number {
  return new Date().getFullYear() - year;
}

interface Props {
  menPlayers?: MenPlayerForBirthday[];
  womenPlayers: WomanPlayer[];
  youthPlayers: YouthPlayer[];
  userName: string;
  userNameEn: string;
}

export default function BirthdaysSection({ menPlayers = [], womenPlayers, youthPlayers, userName, userNameEn }: Props) {
  const { t, isRtl } = useLanguage();
  const { isWomen, isYouth } = usePlatform();
  const [showUpcoming, setShowUpcoming] = useState(false);

  const { todayBirthdays, upcomingBirthdays } = useMemo(() => {
    const all: BirthdayPlayer[] = [];


    // Men players
    for (const p of menPlayers) {
      if (!p.playerPhoneNumber) continue;
      const dob = p.dateOfBirth || p.passportDetails?.dateOfBirth;
      const parsed = parseDob(dob);
      if (!parsed) continue;
      const days = daysUntilBirthday(parsed);
      all.push({
        id: p.id,
        fullName: p.fullName || 'Unknown',
        profileImage: p.profileImage,
        club: p.currentClub?.clubName,
        phone: p.playerPhoneNumber,
        turnsAge: computeAge(parsed.year),
        agentInChargeName: p.agentInChargeName,
        daysUntil: days === 0 ? 0 : days,
        dateLabel: new Date(new Date().getFullYear(), parsed.month, parsed.day)
          .toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }),
        platform: 'men',
      });
    }

    // Women players
    for (const p of womenPlayers) {
      if (!p.playerPhoneNumber) continue;
      const dob = (p as unknown as { dateOfBirth?: string }).dateOfBirth || p.passportDetails?.dateOfBirth;
      const parsed = parseDob(dob);
      if (!parsed) continue;
      const days = daysUntilBirthday(parsed);
      all.push({
        id: p.id,
        fullName: p.fullName,
        profileImage: p.profileImage,
        club: p.currentClub?.clubName,
        phone: p.playerPhoneNumber,
        turnsAge: computeAge(parsed.year),
        agentInChargeName: p.agentInChargeName,
        daysUntil: days === 0 ? 0 : days,
        dateLabel: new Date(new Date().getFullYear(), parsed.month, parsed.day)
          .toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }),
        platform: 'women',
      });
    }

    // Youth players
    for (const p of youthPlayers) {
      if (!p.playerPhoneNumber) continue;
      const dob = p.dateOfBirth || (p.passportDetails as { dateOfBirth?: string } | undefined)?.dateOfBirth;
      const parsed = parseDob(dob);
      if (!parsed) continue;
      const days = daysUntilBirthday(parsed);
      all.push({
        id: p.id,
        fullName: p.fullName,
        profileImage: p.profileImage,
        club: p.currentClub?.clubName,
        phone: p.playerPhoneNumber,
        turnsAge: computeAge(parsed.year),
        ageGroup: p.ageGroup,
        agentInChargeName: p.agentInChargeName,
        daysUntil: days === 0 ? 0 : days,
        dateLabel: new Date(new Date().getFullYear(), parsed.month, parsed.day)
          .toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }),
        platform: 'youth',
      });
    }

    const today = all.filter((p) => p.daysUntil === 0);
    const upcoming = all.filter((p) => p.daysUntil > 0 && p.daysUntil <= 7).sort((a, b) => a.daysUntil - b.daysUntil);
    return { todayBirthdays: today, upcomingBirthdays: upcoming };
  }, [menPlayers, womenPlayers, youthPlayers, isRtl]);

  // Hide entire section when nothing to show
  if (todayBirthdays.length === 0 && upcomingBirthdays.length === 0) return null;

  const firstName = (name: string) => name.split(' ')[0] || name;

  const sendWishes = (player: BirthdayPlayer) => {
    const msg = `Happy Birthday ${firstName(player.fullName)}!\nWishing you a wonderful year ahead, full of success on and off the pitch!\n${userNameEn}`;
    openWhatsAppWithMessage(player.phone, msg);
  };

  const accentColor = isYouth ? 'var(--youth-cyan)' : isWomen ? 'var(--women-rose)' : 'var(--mgsr-accent)';

  const cardClass = isYouth
    ? 'bg-mgsr-card/40 border-[var(--youth-cyan)]/15 hover:border-[var(--youth-cyan)]/40'
    : isWomen
    ? 'bg-mgsr-card/50 border-[var(--women-rose)]/15 hover:border-[var(--women-rose)]/40'
    : 'bg-mgsr-card/80 border-mgsr-border hover:border-[var(--mgsr-accent)]/40';

  const iconBg = isYouth
    ? 'bg-[rgba(0,212,255,0.15)]'
    : isWomen
    ? 'bg-[rgba(232,160,191,0.15)]'
    : 'bg-[rgba(77,182,172,0.15)]';

  const badgeBg = isYouth
    ? 'bg-[rgba(0,212,255,0.2)] text-[var(--youth-cyan)]'
    : isWomen
    ? 'bg-[rgba(232,160,191,0.2)] text-[var(--women-rose)]'
    : 'bg-[rgba(77,182,172,0.2)] text-[var(--mgsr-accent)]';

  const ageBadge = isYouth
    ? 'bg-[rgba(0,212,255,0.12)] text-[var(--youth-cyan)]'
    : isWomen
    ? 'bg-[rgba(232,160,191,0.12)] text-[var(--women-rose)]'
    : 'bg-[rgba(77,182,172,0.12)] text-[var(--mgsr-accent)]';

  return (
    <div className={`mb-6 sm:mb-10 p-5 sm:p-6 border rounded-2xl backdrop-blur-sm transition-all duration-300 ${cardClass}`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center text-lg`}>
          🎂
        </div>
        <h3 className="text-base font-bold text-white font-display">
          {t('birthdays_title')}
        </h3>
        {todayBirthdays.length > 0 && (
          <span className={`ms-auto text-[0.65rem] font-bold px-2.5 py-1 rounded-full ${badgeBg}`}>
            {todayBirthdays.length} {t('birthdays_today_badge')}
          </span>
        )}
      </div>

      {/* Today's birthdays */}
      {todayBirthdays.length > 0 ? (
        <div className="space-y-2">
          {todayBirthdays.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/40 transition-all duration-200 hover:bg-mgsr-dark/80"
            >
              <div className="w-10 h-10 rounded-full bg-mgsr-border/20 border-2 border-mgsr-border/60 shrink-0 overflow-hidden flex items-center justify-center">
                {player.profileImage ? (
                  <img src={player.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-5 h-5 text-mgsr-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{player.fullName}</p>
                <div className="flex items-center gap-1.5 mt-0.5 text-xs text-mgsr-muted">
                  {player.club && <span className="truncate">{player.club}</span>}
                  {player.club && player.ageGroup && <span>·</span>}
                  {player.ageGroup && <span>{player.ageGroup}</span>}
                  {(player.club || player.ageGroup) && <span>·</span>}
                  <span className={`font-bold px-1.5 py-px rounded ${ageBadge}`}>
                    {t(player.platform === 'women' ? 'birthdays_turns_female' : 'birthdays_turns_male')} {player.turnsAge}
                  </span>
                </div>
                {player.agentInChargeName && (
                  <p className="text-[0.65rem] text-mgsr-muted/60 mt-0.5 truncate">
                    {t('birthdays_agent')}: {player.agentInChargeName}
                  </p>
                )}
              </div>
              <button
                onClick={() => sendWishes(player)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[rgba(37,211,102,0.15)] text-[#25D366] hover:bg-[rgba(37,211,102,0.3)] transition-all shrink-0"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 0 0 .611.611l4.458-1.495A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.319 0-4.465-.768-6.194-2.064l-.432-.336-3.2 1.072 1.072-3.2-.336-.432A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                {t('birthdays_send_wishes')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 px-4 rounded-xl bg-mgsr-dark/30 border border-dashed border-mgsr-border/40 text-center">
          <p className="text-2xl mb-1">🎈</p>
          <p className="text-sm text-mgsr-muted">{t('birthdays_none_today')}</p>
        </div>
      )}

      {/* Upcoming toggle */}
      {upcomingBirthdays.length > 0 && (
        <>
          <button
            onClick={() => setShowUpcoming(!showUpcoming)}
            className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-mgsr-border/40 text-xs text-mgsr-muted hover:bg-mgsr-card/50 hover:text-mgsr-text transition-all"
          >
            📅 {t('birthdays_upcoming')} — {upcomingBirthdays.length} {t('birthdays_players')}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${showUpcoming ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showUpcoming && (
            <div className="mt-3 pt-3 border-t border-mgsr-border/30 space-y-2">
              <p className="text-[0.65rem] font-semibold text-mgsr-muted uppercase tracking-wider mb-2">
                {t('birthdays_upcoming')}
              </p>
              {upcomingBirthdays.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-mgsr-dark/30 border border-dashed border-mgsr-border/30 opacity-70 hover:opacity-100 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-mgsr-border/20 border-2 border-mgsr-border/60 shrink-0 overflow-hidden flex items-center justify-center">
                    {player.profileImage ? (
                      <img src={player.profileImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-5 h-5 text-mgsr-muted" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{player.fullName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-mgsr-muted">
                      {player.club && <span className="truncate">{player.club}</span>}
                      {player.club && <span>·</span>}
                      <span>{player.dateLabel}</span>
                    </div>
                    {player.agentInChargeName && (
                      <p className="text-[0.65rem] text-mgsr-muted/60 mt-0.5 truncate">
                        {t('birthdays_agent')}: {player.agentInChargeName}
                      </p>
                    )}
                  </div>
                  <span className="text-[0.65rem] font-semibold px-2 py-0.5 rounded-md bg-[rgba(255,165,0,0.12)] text-[#ffa500] whitespace-nowrap">
                    {t('birthdays_in_days').replace('%d', String(player.daysUntil))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
