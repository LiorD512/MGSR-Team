'use client';

/** "Player birthdays" module of the Light Management Room dashboards — shared by men and youth so both stay identical. */
import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { openWhatsAppWithMessage } from '@/lib/whatsapp';
import { upcomingBirthdays, type BirthdayEntry, type BirthdayPlayerLike } from '@/lib/birthdays';

interface Props<P extends BirthdayPlayerLike> {
  players: P[];
  userName: string;
  onOpen: (player: P) => void;
}

export default function BritBirthdaysModule<P extends BirthdayPlayerLike>({ players, userName, onOpen }: Props<P>) {
  const { t, isRtl } = useLanguage();
  const birthdays = useMemo(() => upcomingBirthdays(players, isRtl), [players, isRtl]);
  const withToken = (key: string, value: string | number) => t(key).replace('{n}', String(value));

  const sendBirthdayWish = (b: BirthdayEntry<P>) => {
    if (!b.phone) return;
    const first = b.fullName.split(' ')[0] || b.fullName;
    const msg = `Happy Birthday ${first}!\nWishing you a wonderful year ahead, full of success on and off the pitch!\n${userName}`;
    openWhatsAppWithMessage(b.phone, msg);
  };

  return (
    <section className="brit-module">
      <div className="brit-module-head">
        <h2>{t('room_birthdays')}</h2>
        <span>{withToken('room_birthdays_count', birthdays.length)}</span>
      </div>
      {birthdays.length > 0 ? (
        birthdays.map((b) => {
          const isToday = b.daysUntil === 0;
          return (
            <div className="brit-deadline" key={b.id} onClick={() => onOpen(b.player)} style={{ cursor: 'pointer' }}>
              <div className="brit-code">{isToday ? t('room_birthdays_today_code') : b.dateLabel}</div>
              <div>
                <h3>{b.fullName}</h3>
                <p>
                  {(b.club || '—')} / {withToken('room_birthdays_turns', b.turnsAge)}
                </p>
                {b.agent && (
                  <p className="brit-birthday-agent">
                    {t('room_birthdays_agent')} <em>{b.agent}</em>
                  </p>
                )}
              </div>
              <div className="brit-birthday-action" onClick={(e) => e.stopPropagation()}>
                {isToday && b.phone && (
                  <button type="button" className="brit-birthday-btn" onClick={() => sendBirthdayWish(b)} aria-label={t('room_birthdays_wish')}>
                    {t('room_birthdays_wish')}
                  </button>
                )}
                {isToday && !b.phone && (
                  <span className="brit-birthday-nonum" aria-label={t('room_birthdays_no_number')}>
                    <span className="brit-birthday-nonum-bar" aria-hidden />
                    <span className="brit-birthday-nonum-txt">
                      <b>{t('room_birthdays_no_number')}</b>
                      <span>{t('room_birthdays_no_number_sub')}</span>
                    </span>
                  </span>
                )}
                <time className={isToday ? 'brit-red' : ''}>
                  {isToday ? t('room_birthdays_today') : withToken('room_window_days', b.daysUntil)}
                </time>
              </div>
            </div>
          );
        })
      ) : (
        <div className="brit-empty">{t('room_birthdays_empty')}</div>
      )}
    </section>
  );
}
