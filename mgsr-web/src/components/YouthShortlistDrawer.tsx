'use client';

/**
 * Youth Shortlist Target Intelligence Drawer — "Light Management Room" (teal).
 *
 * Opens when clicking a prospect on the youth shortlist. Mirrors the Men
 * target-intelligence drawer (MenShortlistDrawer) UX/UI — same sliding
 * brit-drawer shell, hero, facts grid, info boxes and action grid, all
 * auto-retinted teal under body[data-platform="youth"] .brit-room — but
 * adapted to the YOUTH platform:
 *
 *   1. Hero header            — player image, name, nationality, club / positions
 *   2. Key facts grid         — age group, age, positions, club, nationality, scout
 *   3. IFA season form        — apps / goals / assists (matched from the roster
 *                               YouthPlayer by ifaUrl, when the prospect is already
 *                               registered); omitted when no IFA form is available
 *   4. Matching club requests — ClubRequestsYouth via matchingRequestsForPlayer
 *   5. Agency notes timeline  — view + add (opens the shared note modal)
 *   6. Action grid            — Sign to academy / Share / Open IFA profile / Remove
 *
 * Deliberately OMITS the Men drawer's Instagram DM / social-outreach section:
 * youth prospects are minors and the platform does not provide direct-outreach
 * tooling for them. The Transfermarkt "Locker Room" teammates section is also
 * omitted (no youth teammate data source) and replaced by the IFA season-form box.
 */

import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries } from '@/hooks/useEuCountries';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { matchingRequestsForPlayer, type ClubRequest, type RosterPlayer } from '@/lib/requestMatcher';
import { openWhatsAppShare } from '@/lib/whatsapp';
import type { YouthPlayer } from '@/lib/playersYouth';

export interface YouthShortlistNote {
  text: string;
  createdBy?: string;
  createdByHebrewName?: string;
  createdById?: string;
  createdAt?: number;
}

export interface YouthShortlistDrawerEntry {
  tmProfileUrl: string; // IFA profile URL (doc id) for youth
  addedAt?: number;
  playerImage?: string;
  playerName?: string;
  playerNameHe?: string;
  playerPosition?: string;
  positions?: string[];
  playerAge?: string;
  ageGroup?: string;
  playerNationality?: string;
  clubJoinedName?: string;
  currentClub?: { clubName?: string };
  addedByAgentName?: string;
  addedByAgentHebrewName?: string;
  notes?: YouthShortlistNote[];
}

const NATIONALITY_TO_ISO: Record<string, string> = {
  israel: 'il', germany: 'de', brazil: 'br', argentina: 'ar', france: 'fr',
  spain: 'es', italy: 'it', portugal: 'pt', netherlands: 'nl', belgium: 'be',
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir',
  'great britain': 'gb', 'united kingdom': 'gb', ireland: 'ie',
  croatia: 'hr', serbia: 'rs', slovenia: 'si', 'bosnia-herzegovina': 'ba',
  'bosnia and herzegovina': 'ba', montenegro: 'me', 'north macedonia': 'mk', macedonia: 'mk',
  albania: 'al', kosovo: 'xk', greece: 'gr', turkey: 'tr', türkiye: 'tr',
  switzerland: 'ch', austria: 'at', poland: 'pl', ukraine: 'ua', russia: 'ru',
  'czech republic': 'cz', czechia: 'cz', slovakia: 'sk', hungary: 'hu', romania: 'ro',
  bulgaria: 'bg', sweden: 'se', norway: 'no', denmark: 'dk', finland: 'fi', iceland: 'is',
  cyprus: 'cy', luxembourg: 'lu', malta: 'mt', georgia: 'ge', armenia: 'am', azerbaijan: 'az',
  'united states': 'us', usa: 'us', canada: 'ca', mexico: 'mx', colombia: 'co', uruguay: 'uy',
  chile: 'cl', peru: 'pe', ecuador: 'ec', paraguay: 'py', venezuela: 've',
  nigeria: 'ng', ghana: 'gh', senegal: 'sn', 'ivory coast': 'ci', cameroon: 'cm',
  'south africa': 'za', japan: 'jp', 'south korea': 'kr', china: 'cn', australia: 'au',
};

const flagUrlFromNationality = (nationality?: string): string | null => {
  if (!nationality) return null;
  const code = NATIONALITY_TO_ISO[nationality.trim().toLowerCase()];
  return code ? `https://flagcdn.com/w640/${code}.png` : null;
};

const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

interface YouthShortlistDrawerProps {
  entry: YouthShortlistDrawerEntry | null;
  onClose: () => void;
  onSignToRoster: (entry: YouthShortlistDrawerEntry) => void;
  onRemove: (entry: YouthShortlistDrawerEntry) => void;
  onOpenAddNote: (entry: YouthShortlistDrawerEntry) => void;
  /** Roster youth players — used to surface IFA season form when the prospect is already registered. */
  youthPlayers: YouthPlayer[];
  clubRequests: ClubRequest[];
}

export default function YouthShortlistDrawer({
  entry,
  onClose,
  onSignToRoster,
  onRemove,
  onOpenAddNote,
  youthPlayers,
  clubRequests,
}: YouthShortlistDrawerProps) {
  const { t, isRtl } = useLanguage();
  const euCountries = useEuCountries();

  const positionsStr = useMemo(
    () =>
      (entry?.positions?.filter(Boolean) ?? (entry?.playerPosition ? [entry.playerPosition] : []))
        .slice(0, 3)
        .join(' / ') || '—',
    [entry]
  );

  // Match a roster YouthPlayer by IFA url to surface season form (if registered).
  const rosterMatch = useMemo(() => {
    if (!entry?.tmProfileUrl) return undefined;
    return youthPlayers.find((p) => p.ifaUrl && p.ifaUrl === entry.tmProfileUrl);
  }, [entry?.tmProfileUrl, youthPlayers]);

  // Compute matching youth club requests (position-driven for youth).
  const matchedRequests = useMemo(() => {
    if (!entry) return [];
    const playerAdapter: RosterPlayer = {
      id: entry.tmProfileUrl,
      fullName: entry.playerName,
      age: entry.ageGroup || entry.playerAge,
      positions: entry.positions ?? (entry.playerPosition ? [entry.playerPosition] : []),
      nationality: entry.playerNationality,
    };
    return matchingRequestsForPlayer(playerAdapter, clubRequests, euCountries);
  }, [entry, clubRequests, euCountries]);

  if (!entry) return null;

  const flagSmall = flagUrlFromNationality(entry.playerNationality);
  const nationalityDisplay = entry.playerNationality
    ? getCountryDisplayName(entry.playerNationality, isRtl)
    : (isRtl ? 'לא ידוע' : 'Unknown');
  const clubStr = (entry.clubJoinedName ?? entry.currentClub?.clubName)?.trim() || t('without_club');
  const agentName = isRtl
    ? (entry.addedByAgentHebrewName || entry.addedByAgentName || '—')
    : (entry.addedByAgentName || entry.addedByAgentHebrewName || '—');

  const addedAgo = (() => {
    if (!entry.addedAt) return '';
    const days = Math.floor((Date.now() - entry.addedAt) / (24 * 60 * 60 * 1000));
    if (days <= 0) return t('shortlist_date_today');
    if (days === 1) return t('shortlist_date_yesterday');
    if (days < 7) return t('shortlist_date_days_ago').replace('{n}', String(days));
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return t('shortlist_date_weeks_ago').replace('{n}', String(weeks));
    return t('shortlist_date_months_ago').replace('{n}', String(Math.floor(days / 30)));
  })();

  const stats = rosterMatch?.ifaStats;
  const hasForm = !!stats && ((stats.matches ?? 0) + (stats.goals ?? 0) + (stats.assists ?? 0) > 0);

  const isIfaUrl = entry.tmProfileUrl.includes('football.org.il');

  const handleShare = () => {
    openWhatsAppShare(
      `${entry.playerName || 'Prospect'} (${positionsStr}, ${clubStr})${entry.ageGroup ? ` — ${entry.ageGroup}` : ''}\n${entry.tmProfileUrl}`
    );
  };

  return (
    <>
      <div className="brit-scrim open" onClick={onClose} aria-hidden="true" />
      <aside className="brit-drawer open" aria-label={t('shortlist_drawer_title')}>
        {/* Hero header */}
        <div className="brit-drawer-hero">
          {entry.playerImage ? (
            <img src={entry.playerImage} alt={entry.playerName || ''} aria-hidden="true" style={{ objectPosition: 'center 20%' }} />
          ) : (
            <div className="brit-drawer-flagbg-ph" aria-hidden="true" />
          )}
          <button className="brit-drawer-close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="brit-drawer-hero-copy">
            <small style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {flagSmall && (
                <img src={flagSmall} alt="" style={{ width: '14px', height: '10px', objectFit: 'cover', filter: 'none', opacity: 1, borderRadius: '1px' }} />
              )}
              {nationalityDisplay} · {clubStr} / {positionsStr}
            </small>
            <h2>{entry.playerName || '—'}</h2>
          </div>
        </div>

        {/* Drawer body */}
        <div className="brit-drawer-body">
          {/* Key facts grid */}
          <div className="brit-facts">
            <div>
              <label>{t('youth_age_group')}</label>
              <strong>{entry.ageGroup || '—'}</strong>
            </div>
            <div>
              <label>{t('players_th_age')}</label>
              <strong>{entry.playerAge || '—'}</strong>
            </div>
            <div>
              <label>{t('room_th_position')}</label>
              <strong>{positionsStr}</strong>
            </div>
            <div>
              <label>{t('room_th_club')}</label>
              <strong>{clubStr}</strong>
            </div>
            <div>
              <label>{t('players_drawer_nationality')}</label>
              <strong>{nationalityDisplay}</strong>
            </div>
            <div>
              <label>{t('shortlist_th_scout')}</label>
              <strong>
                {agentName}
                {addedAgo && <small style={{ fontSize: '10px', display: 'block', color: 'var(--muted)', fontWeight: 400, marginTop: '2px' }}>{addedAgo}</small>}
              </strong>
            </div>
          </div>

          {/* IFA season form (when the prospect is already in the roster) */}
          {hasForm && (
            <section className="brit-drawer-box">
              <div className="brit-drawer-box-head">
                <label>{t('youth_ifa_form')}</label>
                {stats?.season && <span className="badge">{stats.season}</span>}
              </div>
              <div className="brit-ifa-form" style={{ padding: '4px 2px' }}>
                <span><b>{stats?.matches ?? 0}</b> {t('youth_ifa_apps')}</span>
                <span><b>{stats?.goals ?? 0}</b> {t('youth_ifa_goals')}</span>
                <span><b>{stats?.assists ?? 0}</b> {t('youth_ifa_assists')}</span>
              </div>
            </section>
          )}

          {/* Matching live club requests */}
          <section className="brit-drawer-box">
            <div className="brit-drawer-box-head">
              <label>{t('shortlist_drawer_live_requests')}</label>
              {matchedRequests.length > 0 && <span className="badge">{matchedRequests.length}</span>}
            </div>
            {matchedRequests.length === 0 ? (
              <p className="brit-drawer-box-empty">{t('shortlist_drawer_no_requests')}</p>
            ) : (
              matchedRequests.slice(0, 3).map((req) => (
                <div className="brit-drawer-req-item" key={req.id}>
                  <div>
                    <div className="brit-drawer-req-club">
                      <b>{(req as { clubName?: string }).clubName || 'Club Request'}</b>
                    </div>
                    <div className="brit-drawer-req-info">
                      {req.position || 'Any position'}
                      {req.minAge && req.maxAge ? ` · ${req.minAge}–${req.maxAge}y` : ''}
                    </div>
                  </div>
                  <span className="brit-drawer-req-badge">MATCH</span>
                </div>
              ))
            )}
          </section>

          {/* Agency notes timeline */}
          <section className="brit-drawer-box">
            <div className="brit-drawer-box-head">
              <label>{t('shortlist_notes_title')}</label>
              <button type="button" className="brit-drawer-sm-btn" onClick={() => onOpenAddNote(entry)}>
                + {t('shortlist_notes_add')}
              </button>
            </div>
            {entry.notes && entry.notes.length > 0 ? (
              entry.notes.map((n, idx) => (
                <div className="brit-drawer-note-item" key={idx}>
                  <p>{n.text}</p>
                  <span>
                    {isRtl ? (n.createdByHebrewName || n.createdBy || '—') : (n.createdBy || n.createdByHebrewName || '—')}
                    {n.createdAt && ` · ${new Date(n.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US')}`}
                  </span>
                </div>
              ))
            ) : (
              <p className="brit-drawer-box-empty">{t('shortlist_drawer_no_notes')}</p>
            )}
          </section>

          {/* Action grid */}
          <div className="brit-drawer-actions">
            <button type="button" className="primary" onClick={() => onSignToRoster(entry)}>
              {t('youth_drawer_sign_to_academy')}
            </button>
            <button type="button" className="ghost" onClick={handleShare}>
              ↗ {t('player_info_share')}
            </button>
            {entry.tmProfileUrl && isIfaUrl && (
              <a className="ghost" href={entry.tmProfileUrl} target="_blank" rel="noopener noreferrer">
                {t('youth_drawer_open_ifa')}
              </a>
            )}
            <button type="button" className="ghost danger" onClick={() => onRemove(entry)}>
              {t('shortlist_drawer_remove_target')}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
