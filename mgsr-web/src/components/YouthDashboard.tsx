'use client';

/**
 * Youth platform dashboard — "Light Management Room" (teal) redesign.
 *
 * Presentational / prop-fed, mirroring MenDashboard. The dashboard page owns the
 * youth subscriptions and passes the derived data in. Renders the teal editorial
 * shell with age-group as the organizing motif (a U-13 → U-21 ladder), prospect
 * review, and a recent-activity feed.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import type { YouthPlayer } from '@/lib/playersYouth';

export interface YouthDashboardFeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  createdAt?: number;
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

  const recent = useMemo(
    () => [...events].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 5),
    [events]
  );

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
                {/* Recent activity feed */}
                <section className="brit-module">
                  <div className="brit-module-head">
                    <h2>{t('youth_ifa_form')}</h2>
                    <span>{youthPlayers.length} {t('youth_sig_prospects')}</span>
                  </div>
                  <div>
                    {recent.map((ev) => (
                      <div className="brit-feed-row" key={ev.id}>
                        <time>{ev.createdAt ? new Date(ev.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }) : ''}</time>
                        <p><strong>{ev.playerName || '—'}</strong></p>
                        <span>IFA</span>
                      </div>
                    ))}
                    {recent.length === 0 && (
                      <div className="brit-feed-row"><time /><p><strong>—</strong></p><span /></div>
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
