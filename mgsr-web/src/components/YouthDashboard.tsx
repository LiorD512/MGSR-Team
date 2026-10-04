'use client';

/**
 * Youth platform dashboard — "Light Management Room" (teal) redesign.
 *
 * Presentational / prop-fed, mirroring MenDashboard. The dashboard page owns the
 * youth subscriptions and passes the derived data in. Renders the teal editorial
 * shell with age-group as the organizing motif (a U-13 → U-21 ladder), prospect
 * review, and a recent-activity feed.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage, translateType } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import type { YouthPlayer } from '@/lib/playersYouth';

export interface YouthDashboardFeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerYouthId?: string;
  timestamp?: number;
  createdAt?: number;
  agentName?: string;
}
export interface YouthDashboardRequest {
  id: string;
  clubName?: string;
  position?: string;
}

interface YouthDashboardProps {
  userName: string;
  greeting: string;
  youthPlayers: YouthPlayer[];
  events?: YouthDashboardFeedEvent[];
  requests?: YouthDashboardRequest[];
  contactsCount?: number;
  shortlistCount?: number;
}

const AGE_GROUPS = ['U-13', 'U-14', 'U-15', 'U-17', 'U-19', 'U-21'] as const;
const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function YouthDashboard({
  userName,
  greeting,
  youthPlayers,
  events = [],
  requests = [],
  contactsCount = 0,
  shortlistCount = 0,
}: YouthDashboardProps) {
  const { t, lang, setLang, isRtl } = useLanguage();
  const router = useRouter();

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // Age-group distribution for the ladder.
  const ladder = useMemo(() => {
    const counts = new Map<string, number>();
    youthPlayers.forEach((p) => { if (p.ageGroup) counts.set(p.ageGroup, (counts.get(p.ageGroup) ?? 0) + 1); });
    const max = Math.max(1, ...Array.from(counts.values()));
    const peak = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    return AGE_GROUPS.map((ag) => ({ ag, n: counts.get(ag) ?? 0, pct: Math.round(((counts.get(ag) ?? 0) / max) * 100), peak: ag === peak }));
  }, [youthPlayers]);

  const callupCount = useMemo(
    () => youthPlayers.filter((p) => (p.notes || '').toLowerCase().includes('national') || (p.noteList ?? []).some((n) => (n.notes || '').toLowerCase().includes('national'))).length,
    [youthPlayers]
  );
  const mandateCount = useMemo(() => youthPlayers.filter((p) => p.haveMandate).length, [youthPlayers]);

  // Prospects needing a look: guardian contact missing, or no IFA stats yet.
  const toReview = useMemo(
    () => youthPlayers.filter((p) => !p.parentContact?.parentPhoneNumber || !p.ifaStats).slice(0, 3),
    [youthPlayers]
  );

  const [showAllActivity, setShowAllActivity] = useState(false);

  const withToken = (key: string, value: string | number) => t(key).replace('{n}', String(value));

  // Newest first; same 4-then-reveal behaviour as the men dashboard.
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => ((b.timestamp ?? b.createdAt ?? 0) - (a.timestamp ?? a.createdAt ?? 0))),
    [events]
  );
  const recentActivity = useMemo(
    () => (showAllActivity ? sortedEvents : sortedEvents.slice(0, 4)),
    [sortedEvents, showAllActivity]
  );

  // Resolve a feed event to the youth prospect route when we have an id.
  const feedLink = (ev: YouthDashboardFeedEvent): string | null =>
    ev.playerYouthId ? `/players/youth/${ev.playerYouthId}?from=/dashboard` : null;

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="dashboard"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value_youth')}</strong>
              {t('youth_sig_prospects')}
              <strong>{youthPlayers.length}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_dashboard')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <button onClick={() => router.push('/players')}>{t('room_search')}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('youth_room_kicker')}</p>
                <h1>
                  {greeting.replace(/,\s*$/, '')}
                  <br />
                  <span>{userName}.</span>
                </h1>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals">
              <div className="brit-signal">
                <label>{t('youth_sig_prospects')}</label>
                <strong>{String(youthPlayers.length).padStart(2, '0')}</strong>
                <small>U-13 → U-21</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_sig_callups')}</label>
                <strong className="brit-gold">{String(callupCount).padStart(2, '0')}</strong>
                <small>{t('youth_ifa_form')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_sig_mandates')}</label>
                <strong>{String(mandateCount).padStart(2, '0')}</strong>
                <small>{youthPlayers.length - mandateCount} —</small>
              </div>
              <div className="brit-signal">
                <label>{t('shortlist')}</label>
                <strong className="brit-gold">{String(shortlistCount).padStart(2, '0')}</strong>
                <small>{contactsCount} {t('nav_contacts')}</small>
              </div>
            </section>

            <div className="brit-grid">
              <div>
                {/* Age-group ladder */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('youth_roster_by_age')}</h2>
                    <span>{youthPlayers.length} {t('youth_sig_prospects')}</span>
                  </div>
                  <div className="brit-ladder">
                    {ladder.map((r) => (
                      <div className={`brit-rung${r.peak ? ' peak' : ''}`} key={r.ag}>
                        <span className="ag">{r.ag}</span>
                        <div className="track"><div className="fill" style={{ width: `${r.pct}%` }} /></div>
                        <span className="c">{String(r.n).padStart(2, '0')}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Prospects to review */}
                <section className="brit-black-module">
                  <div className="brit-module-head">
                    <h2>{t('youth_review')}</h2>
                    <span>{toReview.length} —</span>
                  </div>
                  {toReview.map((p) => (
                    <div className="brit-approval" key={p.id} onClick={() => router.push(`/players/youth/${p.id}?from=/dashboard`)} style={{ cursor: 'pointer' }}>
                      {p.profileImage ? (
                        <img src={p.profileImage} alt="" />
                      ) : (
                        <div className="brit-avatar-box">{initials(p.fullName)}</div>
                      )}
                      <div>
                        <h3>{p.fullName}</h3>
                        <p>{(p.positions?.filter(Boolean).join(', ') || '—')} · {p.currentClub?.clubName || '—'}</p>
                      </div>
                      {p.ageGroup && <span className="brit-agtag">{p.ageGroup}</span>}
                    </div>
                  ))}
                </section>
              </div>

              <aside>
                {/* Recent activity — same feed as the men dashboard, youth-scoped */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('room_recent_activity')}</h2>
                    <span>
                      {withToken('room_activity_showing', recentActivity.length).replace('{total}', String(events.length))}
                    </span>
                  </div>
                  {recentActivity.length > 0 ? (
                    recentActivity.map((ev) => {
                      const href = feedLink(ev);
                      const ts = ev.timestamp ?? ev.createdAt;
                      const body = (
                        <>
                          {ev.playerImage ? (
                            <img className="brit-feed-thumb" src={ev.playerImage} alt={ev.playerName || ''} />
                          ) : (
                            <div className="brit-feed-thumb brit-feed-thumb-fallback">
                              {(ev.playerName || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <p>
                            {translateType(ev.type || '', t, 'youth')}
                            {ev.playerName ? <strong>{ev.playerName}</strong> : null}
                          </p>
                          <span>
                            <time className="brit-feed-time">
                              {ts ? (
                                <>
                                  <span className="brit-feed-date">
                                    {new Date(ts).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: '2-digit', month: 'short' })}
                                  </span>
                                  <span className="brit-feed-hour">
                                    {new Date(ts).toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </time>
                          </span>
                        </>
                      );
                      return href ? (
                        <Link key={ev.id} href={href} className="brit-feed-row brit-feed-activity">
                          {body}
                        </Link>
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
                        {showAllActivity ? t('room_activity_collapse') : withToken('room_activity_reveal', events.length)}
                        <em className={`brit-reveal-caret${showAllActivity ? ' up' : ''}`} aria-hidden>↓</em>
                      </span>
                      <span className="brit-reveal-line" aria-hidden />
                    </button>
                  )}
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
