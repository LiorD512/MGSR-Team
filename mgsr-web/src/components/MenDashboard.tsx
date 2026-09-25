'use client';

/**
 * Men platform dashboard — "Light Management Room" redesign.
 *
 * A self-contained, full-bleed light-themed layout (paper background, Oswald /
 * Manrope / DM Mono type, gold + red accents) that replaces the standard
 * AppLayout shell FOR THE MEN PLATFORM ONLY. All visual styling lives under the
 * `.brit-room` scope in globals.css so nothing leaks into other pages/platforms.
 *
 * Every panel is wired to the same real Firestore data the previous dashboard
 * used — the parent `DashboardPage` owns the subscriptions and passes the
 * derived data in as props. Buttons/links point to real routes.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage, translateType } from '@/contexts/LanguageContext';
import { parseMarketValue, formatMarketValue } from '@/lib/releases';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
import { openWhatsAppWithMessage } from '@/lib/whatsapp';
import BritRail from '@/components/BritRail';

// ── Shared shapes (kept structurally compatible with dashboard/page.tsx) ──
export interface MenFeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  timestamp?: number;
  agentName?: string;
}

export interface MenRosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  currentClub?: { clubName?: string };
  tmProfile?: string;
  positions?: string[];
  marketValue?: string;
  agencyUrl?: string;
  haveMandate?: boolean;
  nationality?: string;
  nationalities?: string[];
  dateOfBirth?: string;
  passportDetails?: { dateOfBirth?: string };
  playerPhoneNumber?: string;
  agentInChargeName?: string;
}

export interface MenExpiringMandate extends MenRosterPlayer {
  daysLeft: number;
}

export interface MenClubRequest {
  id: string;
  clubName?: string;
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  euOnly?: boolean;
  createdAt?: number;
  status?: string;
}

interface MenDashboardProps {
  userName: string;
  greeting: string;
  rosterPlayers: MenRosterPlayer[];
  events: MenFeedEvent[];
  requests: MenClubRequest[];
  expiringMandates: MenExpiringMandate[];
}

// (rail navigation now lives in the shared BritRail component)

function positionLabel(positions: string[] | undefined): string {
  const list = (positions ?? []).filter(Boolean);
  return list.length ? list.slice(0, 2).join(' / ') : '—';
}

function ageRangeLabel(r: MenClubRequest): string {
  if (r.ageDoesntMatter !== false && !r.minAge && !r.maxAge) return '';
  if (r.minAge && r.maxAge) return ` / ${r.minAge}–${r.maxAge}`;
  if (r.minAge) return ` / ${r.minAge}+`;
  if (r.maxAge) return ` / ≤${r.maxAge}`;
  return '';
}

const BRIT_SPORT_GROUP_AGENCY_URL = 'https://www.transfermarkt.com/brit-sport-group/beraterfirma/berater/6448';

function normalizeAgencyUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return value.trim().toLowerCase().replace(/\/$/, '');
  }
}

/** Parse dateOfBirth strings in common formats → { month (0-based), day, year }. */
function parseDob(dob: string | undefined): { month: number; day: number; year: number } | null {
  if (!dob) return null;
  const iso = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { year: +iso[1]!, month: +iso[2]! - 1, day: +iso[3]! };
  const dmy = dob.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) return { year: +dmy[3]!, month: +dmy[2]! - 1, day: +dmy[1]! };
  return null;
}

/** Whole days from today until the next occurrence of a birthday (0 = today). */
function daysUntilBirthday(parsed: { month: number; day: number }): number {
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), parsed.month, parsed.day);
  if (next < todayMidnight) next = new Date(today.getFullYear() + 1, parsed.month, parsed.day);
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86_400_000);
}

interface BirthdayEntry {
  id: string;
  fullName: string;
  club?: string;
  phone?: string;
  agent?: string;
  turnsAge: number;
  daysUntil: number;
  dateLabel: string;
}

export default function MenDashboard({
  userName,
  greeting,
  rosterPlayers,
  events,
  requests,
  expiringMandates,
}: MenDashboardProps) {
  const { t, lang, setLang, isRtl } = useLanguage();
  const euCountries = useEuCountries();
  const router = useRouter();

  const [dossier, setDossier] = useState<{
    name: string;
    club: string;
    value: string;
    position: string;
    playerId?: string;
  } | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState(0);

  // ── Derived signals ──
  const valuedPlayers = useMemo(
    () => rosterPlayers.filter((p) => parseMarketValue(p.marketValue) > 0),
    [rosterPlayers]
  );

  const totalPortfolioValue = useMemo(
    () => rosterPlayers.reduce((sum, p) => sum + parseMarketValue(p.marketValue), 0),
    [rosterPlayers]
  );

  const euCount = useMemo(() => {
    if (euCountries.size === 0) return 0;
    return rosterPlayers.filter((p) =>
      isEuNational(p.nationality, euCountries, p.nationalities)
    ).length;
  }, [rosterPlayers, euCountries]);

  // Upcoming player birthdays (today + next 30 days), soonest first.
  const birthdays = useMemo<BirthdayEntry[]>(() => {
    const list: BirthdayEntry[] = [];
    for (const p of rosterPlayers) {
      const parsed = parseDob(p.dateOfBirth || p.passportDetails?.dateOfBirth);
      if (!parsed) continue;
      const daysUntil = daysUntilBirthday(parsed);
      if (daysUntil > 30) continue;
      // Year of the next birthday occurrence → age they will turn.
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const thisYearBday = new Date(todayMidnight.getFullYear(), parsed.month, parsed.day);
      const nextBdayYear =
        thisYearBday < todayMidnight ? todayMidnight.getFullYear() + 1 : todayMidnight.getFullYear();
      list.push({
        id: p.id,
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
    return list.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 5);
  }, [rosterPlayers, isRtl]);

  const topRoster = useMemo(
    () =>
      [...rosterPlayers]
        .sort((a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue))
        .slice(0, 6),
    [rosterPlayers]
  );

  const marquee = useMemo(
    () =>
      rosterPlayers
        .filter(
          (player) =>
            normalizeAgencyUrl(player.agencyUrl) === normalizeAgencyUrl(BRIT_SPORT_GROUP_AGENCY_URL)
        )
        .sort((a, b) => parseMarketValue(b.marketValue) - parseMarketValue(a.marketValue)),
    [rosterPlayers]
  );

  const marqueeLastStart = Math.max(marquee.length - 2, 0);
  const marqueeSlideIndex = Math.min(marqueeStart, marqueeLastStart);

  const openRequests = useMemo(
    () =>
      [...requests]
        .filter((r) => (r.status ?? 'open').toLowerCase() !== 'closed')
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 4),
    [requests]
  );

  const recentActivity = useMemo(
    () => (showAllActivity ? events : events.slice(0, 4)),
    [events, showAllActivity]
  );

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const initials = (userName || 'BR')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const withToken = (key: string, value: string | number) =>
    t(key).replace('{n}', String(value));

  // Resolve a feed event to a player route (falls back to external TM profile).
  const feedLink = (ev: MenFeedEvent): { href: string; external: boolean } | null => {
    if (ev.playerTmProfile) {
      const tmId = extractPlayerIdFromUrl(ev.playerTmProfile);
      const rosterPlayer = tmId
        ? rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === tmId)
        : undefined;
      if (rosterPlayer) {
        return { href: `/players/${rosterPlayer.id}?from=/dashboard`, external: false };
      }
      return { href: ev.playerTmProfile, external: true };
    }
    return null;
  };

  const rosterPlayerValue = (p: MenRosterPlayer) => p.marketValue || '—';

  const sendBirthdayWish = (b: BirthdayEntry) => {
    if (!b.phone) return;
    const first = b.fullName.split(' ')[0] || b.fullName;
    const msg = `Happy Birthday ${first}!\nWishing you a wonderful year ahead, full of success on and off the pitch!\n${userName}`;
    openWhatsAppWithMessage(b.phone, msg);
  };

  const openDossier = (p: MenRosterPlayer) =>
    setDossier({
      name: p.fullName || '—',
      club: p.currentClub?.clubName || '—',
      value: rosterPlayerValue(p),
      position: positionLabel(p.positions),
      playerId: p.id,
    });

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        {/* ── Rail ── */}
        <BritRail
          active="dashboard"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('room_footer_view_label')}
              <strong>{t('room_footer_view_value')}</strong>
            </div>
          }
        />

        {/* ── Main ── */}
        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_dashboard')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
                {lang === 'en' ? 'HE / EN' : 'EN / HE'}
              </button>
              <button onClick={() => router.push('/players')}>{t('room_search')}</button>
              <span>TLV {timeStr}</span>
              <span className="brit-avatar">{initials}</span>
            </div>
          </header>

          <main className="brit-canvas">
            {/* ── Masthead ── */}
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('room_kicker')}</p>
                <h1>
                  {greeting.replace(/,\s*$/, '')}
                  <br />
                  <span>{userName}.</span>
                </h1>
              </div>
            </header>

            {/* ── Signals ── */}
            <section className="brit-signals" aria-label={t('room_signals')}>
              <div className="brit-signal">
                <label>{t('room_signal_portfolio')}</label>
                <strong>{formatMarketValue(totalPortfolioValue)}</strong>
                <small>{withToken('room_signal_portfolio_note', valuedPlayers.length)}</small>
              </div>
              <div className="brit-signal">
                <label>{t('room_signal_roster')}</label>
                <strong>{String(rosterPlayers.length).padStart(2, '0')}</strong>
                <small>{withToken('room_signal_roster_note', euCount)}</small>
              </div>
              <div className="brit-signal">
                <label>{t('room_signal_mandates')}</label>
                <strong className={expiringMandates.length > 0 ? 'brit-red' : ''}>
                  {String(expiringMandates.length).padStart(2, '0')}
                </strong>
                <small>
                  {expiringMandates.length > 0
                    ? t('room_signal_mandates_note_action')
                    : t('room_signal_mandates_note_clear')}
                </small>
              </div>
            </section>

            <div className="brit-grid">
              {/* ── Left column ── */}
              <div>
                {/* Player birthdays */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_birthdays')}</h2>
                    <span>{withToken('room_birthdays_count', birthdays.length)}</span>
                  </div>
                  {birthdays.length > 0 ? (
                    birthdays.map((b) => {
                      const isToday = b.daysUntil === 0;
                      return (
                        <div className="brit-deadline" key={b.id}>
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
                          {isToday && b.phone ? (
                            <button
                              className="brit-birthday-btn"
                              onClick={() => sendBirthdayWish(b)}
                              aria-label={t('room_birthdays_wish')}
                            >
                              {t('room_birthdays_wish')}
                            </button>
                          ) : (
                            <time className={isToday ? 'brit-red' : ''}>
                              {isToday
                                ? t('room_birthdays_today')
                                : withToken('room_window_days', b.daysUntil)}
                            </time>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="brit-empty">{t('room_birthdays_empty')}</div>
                  )}
                </section>

                {/* Pending decisions (mandates expiring soonest) */}
                <section className="brit-module brit-black-module">
                  <div className="brit-module-head">
                    <h2>{t('room_pending')}</h2>
                    <span>
                      {withToken('room_pending_count', Math.min(expiringMandates.length, 2))}
                    </span>
                  </div>
                  {expiringMandates.length > 0 ? (
                    expiringMandates.slice(0, 2).map((p) => (
                      <div className="brit-approval" key={p.id}>
                        {p.profileImage ? (
                          <img src={p.profileImage} alt={p.fullName || ''} />
                        ) : (
                          <div className="brit-avatar-box">
                            {(p.fullName || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3>{p.fullName || '—'}</h3>
                          <p>
                            {positionLabel(p.positions)} / {rosterPlayerValue(p)}
                            <br />
                            {p.currentClub?.clubName || '—'} /{' '}
                            {p.daysLeft === 0
                              ? t('room_expires_today')
                              : withToken('room_expires_in', p.daysLeft)}
                          </p>
                        </div>
                        <Link className="brit-approve-btn" href={`/players/${p.id}?from=/dashboard`}>
                          {t('room_authorise')}
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div className="brit-empty" style={{ color: '#aaa69c' }}>
                      {t('room_pending_empty')}
                    </div>
                  )}
                </section>

                {/* Mandate watch */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_mandate_watch')}</h2>
                    <span>{t('room_mandate_watch_sub')}</span>
                  </div>
                  {expiringMandates.length > 0 ? (
                    <div className="brit-mandates">
                      {expiringMandates.slice(0, 3).map((p) => (
                        <article className="brit-mandate" key={p.id}>
                          <strong>{p.fullName || '—'}</strong>
                          <span>
                            {p.daysLeft === 0
                              ? t('room_expires_today')
                              : withToken('room_expires_in', p.daysLeft)}
                          </span>
                          <p>
                            {p.currentClub?.clubName || '—'} / {positionLabel(p.positions)} /{' '}
                            {rosterPlayerValue(p)}
                          </p>
                          <Link className="brit-mandate-link" href={`/players/${p.id}?from=/dashboard`}>
                            {t('room_initiate_renewal')}
                          </Link>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="brit-empty">{t('room_pending_empty')}</div>
                  )}
                </section>

                {/* Recent activity — moved to primary (left) column */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_recent_activity')}</h2>
                    <span>
                      {withToken(
                        'room_activity_showing',
                        recentActivity.length
                      ).replace('{total}', String(events.length))}
                    </span>
                  </div>
                  {recentActivity.length > 0 ? (
                    recentActivity.map((ev) => {
                      const link = feedLink(ev);
                      const body = (
                        <>
                          {ev.playerImage ? (
                            <img
                              className="brit-feed-thumb"
                              src={ev.playerImage}
                              alt={ev.playerName || ''}
                            />
                          ) : (
                            <div className="brit-feed-thumb brit-feed-thumb-fallback">
                              {(ev.playerName || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <p>
                            {translateType(ev.type || '', t, 'men')}
                            {ev.playerName ? <strong>{ev.playerName}</strong> : null}
                          </p>
                          <span>
                            <time className="brit-feed-time">
                              {ev.timestamp ? (
                                <>
                                  <span className="brit-feed-date">
                                    {new Date(ev.timestamp).toLocaleDateString(
                                      isRtl ? 'he-IL' : 'en-US',
                                      { day: '2-digit', month: 'short' }
                                    )}
                                  </span>
                                  <span className="brit-feed-hour">
                                    {new Date(ev.timestamp).toLocaleTimeString(
                                      isRtl ? 'he-IL' : 'en-US',
                                      { hour: '2-digit', minute: '2-digit' }
                                    )}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </time>
                          </span>
                        </>
                      );
                      return link ? (
                        link.external ? (
                          <a
                            key={ev.id}
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="brit-feed-row brit-feed-activity"
                          >
                            {body}
                          </a>
                        ) : (
                          <Link
                            key={ev.id}
                            href={link.href}
                            className="brit-feed-row brit-feed-activity"
                          >
                            {body}
                          </Link>
                        )
                      ) : (
                        <div key={ev.id} className="brit-feed-row brit-feed-activity">
                          {body}
                        </div>
                      );
                    })
                  ) : (
                    <div className="brit-empty">{t('room_activity_empty')}</div>
                  )}
                  {events.length > 4 && (
                    <button
                      className="brit-reveal"
                      onClick={() => setShowAllActivity((v) => !v)}
                      aria-expanded={showAllActivity}
                    >
                      <span className="brit-reveal-line" aria-hidden />
                      <span className="brit-reveal-label">
                        {showAllActivity
                          ? t('room_activity_collapse')
                          : withToken('room_activity_reveal', events.length)}
                        <em className={`brit-reveal-caret${showAllActivity ? ' up' : ''}`} aria-hidden>
                          ↓
                        </em>
                      </span>
                      <span className="brit-reveal-line" aria-hidden />
                    </button>
                  )}
                </section>
              </div>

              {/* ── Right column ── */}
              <aside>
                {/* Marquee assets */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>
                      <span className="brit-heading-black">{t('room_our')}</span>{' '}
                      <span className="brit-heading-gold">{t('room_assets')}</span>
                    </h2>
                    <div className="brit-focus-controls">
                      <span>{withToken('room_marquee_sub', marquee.length)}</span>
                      {marqueeSlideIndex > 0 && (
                        <button
                          type="button"
                          className="brit-focus-arrow brit-focus-arrow-previous"
                          onClick={() =>
                            setMarqueeStart((current) =>
                              Math.max(current - (current === marqueeLastStart && marqueeLastStart % 2 === 1 ? 1 : 2), 0)
                            )
                          }
                          aria-label={t('room_assets_previous')}
                          title={t('room_assets_previous')}
                        >
                          ←
                        </button>
                      )}
                      {marqueeSlideIndex < marqueeLastStart && (
                        <button
                          type="button"
                          className="brit-focus-arrow"
                          onClick={() =>
                            setMarqueeStart((current) =>
                              Math.min(current + 2, marqueeLastStart)
                            )
                          }
                          aria-label={t('room_assets_next')}
                          title={t('room_assets_next')}
                        >
                          →
                        </button>
                      )}
                    </div>
                  </div>
                  {marquee.length > 0 ? (
                    <div className="brit-focus-carousel">
                      <div
                        className="brit-focus-track"
                        style={{
                          width: `${Math.max(marquee.length - 1, 1) * 100}%`,
                          transform: `translateX(-${marqueeSlideIndex * (100 / Math.max(marquee.length - 1, 1))}%)`,
                        }}
                      >
                        {Array.from({ length: Math.max(marquee.length - 1, 1) }, (_, slideIndex) => (
                          <div
                            className="brit-focus-slide"
                            key={`marquee-slide-${slideIndex}`}
                            style={{ flexBasis: `${100 / Math.max(marquee.length - 1, 1)}%` }}
                          >
                            <div className="brit-focus">
                              {[marquee[slideIndex], marquee[slideIndex + 1]]
                                .filter((player): player is MenRosterPlayer => Boolean(player))
                                .map((p) => (
                                  <article key={p.id} onClick={() => openDossier(p)}>
                                    {p.profileImage ? (
                                      <img src={p.profileImage} alt={p.fullName || ''} />
                                    ) : (
                                      <div className="brit-focus-fallback" />
                                    )}
                                    <div className="brit-focus-copy">
                                      <small>
                                        {(p.currentClub?.clubName || '—')} / {positionLabel(p.positions)}
                                      </small>
                                      <h3>{p.fullName || '—'}</h3>
                                      <p>{rosterPlayerValue(p)}</p>
                                    </div>
                                  </article>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="brit-empty">{t('room_marquee_empty')}</div>
                  )}
                </section>

                {/* Club requests */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_club_requests')}</h2>
                    <span>{withToken('room_requests_live', requests.length)}</span>
                  </div>
                  {openRequests.length > 0 ? (
                    openRequests.map((r) => (
                      <Link
                        key={r.id}
                        href="/requests"
                        className="brit-feed-row"
                        style={{ cursor: 'pointer' }}
                      >
                        <time>
                          {r.createdAt
                            ? new Date(r.createdAt).toLocaleDateString(
                                isRtl ? 'he-IL' : 'en-US',
                                { day: '2-digit', month: 'short' }
                              )
                            : '—'}
                        </time>
                        <p>
                          {r.clubName || '—'}
                          <strong>
                            {(r.position || '—') + ageRangeLabel(r)}
                            {r.euOnly ? ' / EU' : ''}
                          </strong>
                        </p>
                        <span>
                          {(r.status ?? 'open').toLowerCase() === 'new'
                            ? t('room_status_new')
                            : t('room_status_open')}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="brit-empty">{t('room_requests_empty')}</div>
                  )}
                  <Link href="/requests" className="brit-new-request" style={{ display: 'block' }}>
                    {t('room_new_request')}
                  </Link>
                </section>

                {/* Roster intelligence — moved to secondary (right) column */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_roster_intel')}</h2>
                    <Link href="/players">{withToken('room_view_all', rosterPlayers.length)}</Link>
                  </div>
                  <div className="brit-table-wrap">
                    <table className="brit-roster">
                      <thead>
                        <tr>
                          <th>{t('room_th_player')}</th>
                          <th>{t('room_th_club')}</th>
                          <th>{t('room_th_position')}</th>
                          <th>{t('room_th_value')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topRoster.map((p) => (
                          <tr key={p.id}>
                            <td>{p.fullName || '—'}</td>
                            <td>{p.currentClub?.clubName || '—'}</td>
                            <td>{positionLabel(p.positions)}</td>
                            <td>{rosterPlayerValue(p)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>

      {/* ── Dossier modal ── */}
      <div
        className={`brit-backdrop${dossier ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('room_confidential_dossier')}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDossier(null);
        }}
      >
        {dossier && (
          <div className="brit-modal">
            <button className="brit-close" onClick={() => setDossier(null)} aria-label={t('room_close')}>
              ×
            </button>
            <div className="brit-modal-kicker">{t('room_confidential_dossier')}</div>
            <h2>{dossier.name}</h2>
            <p>
              {dossier.club} / {dossier.position}
            </p>
            <div className="brit-facts">
              <div>
                <label>{t('room_market_value')}</label>
                <strong>{dossier.value}</strong>
              </div>
              <div>
                <label>{t('room_th_position')}</label>
                <strong>{dossier.position}</strong>
              </div>
              <div>
                <label>{t('room_mandate_status')}</label>
                <strong>{t('room_mandate_active')}</strong>
              </div>
              <div>
                <label>{t('room_next_action')}</label>
                <strong>{t('room_review')}</strong>
              </div>
            </div>
            {dossier.playerId && (
              <Link className="brit-modal-action" href={`/players/${dossier.playerId}?from=/dashboard`}>
                {t('room_open_full_profile')}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
