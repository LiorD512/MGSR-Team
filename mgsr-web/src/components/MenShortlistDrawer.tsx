'use client';

/**
 * Men Shortlist Target Intelligence Drawer — "Light Management Room" redesign.
 *
 * Smooth-sliding drawer that opens when clicking a player on the shortlist.
 * Unifies target evaluation:
 * 1. Visual continuity hero with monochrome nationality flag background
 * 2. Key market and contract metrics
 * 3. Locker room connection (roster teammates who played with this target) + WhatsApp
 * 4. Active club requests matching
 * 5. Outreach & Instagram DM / Pitch copy
 * 6. Agency notes timeline
 * 7. Action suite: Sign to roster (pre-filled drawer), Share, TM, Remove
 */

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries } from '@/hooks/useEuCountries';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { getTeammates, extractPlayerIdFromUrl } from '@/lib/api';
import { matchingRequestsForPlayer, type ClubRequest, type RosterPlayer } from '@/lib/requestMatcher';
import { getInstagramDmUrl, getInstagramProfileUrl, resolveTemplate } from '@/lib/outreach';
import { openWhatsAppShare } from '@/lib/whatsapp';
import { computeValueChangePercent, isFreeAgent } from '@/lib/shortlistIntelligence';

export interface ShortlistNote {
  text: string;
  createdBy?: string;
  createdByHebrewName?: string;
  createdById?: string;
  createdAt?: number;
}

export interface ShortlistDrawerEntry {
  tmProfileUrl: string;
  addedAt?: number;
  playerImage?: string;
  playerName?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalities?: string[];
  clubJoinedName?: string;
  marketValue?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  contractExpires?: string;
  positions?: string[];
  addedByAgentId?: string;
  addedByAgentName?: string;
  addedByAgentHebrewName?: string;
  notes?: ShortlistNote[];
  currentClub?: { clubName?: string; clubLogo?: string };
  instagramHandle?: string;
  instagramUrl?: string;
}

interface RosterTeammateMatch {
  player: RosterPlayer;
  matchesPlayedTogether: number;
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
  cyprus: 'cy', 'faroe islands': 'fo', luxembourg: 'lu', malta: 'mt', georgia: 'ge',
  armenia: 'am', azerbaijan: 'az', kazakhstan: 'kz', 'saudi arabia': 'sa',
  'united arab emirates': 'ae', qatar: 'qa', kuwait: 'kw', bahrain: 'bh', oman: 'om',
  jordan: 'jo', lebanon: 'lb', syria: 'sy', iraq: 'iq', iran: 'ir', egypt: 'eg',
  morocco: 'ma', algeria: 'dz', tunisia: 'tn', libya: 'ly', nigeria: 'ng', ghana: 'gh',
  senegal: 'sn', 'ivory coast': 'ci', "cote d'ivoire": 'ci', cameroon: 'cm', mali: 'ml',
  'burkina faso': 'bf', guinea: 'gn', 'dr congo': 'cd', 'congo dr': 'cd', congo: 'cg',
  'democratic republic of the congo': 'cd', 'democratic republic of congo': 'cd',
  'congo, democratic republic of the': 'cd', 'congo, dr': 'cd',
  'south africa': 'za', angola: 'ao', gabon: 'ga', zambia: 'zm', 'cape verde': 'cv',
  'united states': 'us', usa: 'us', canada: 'ca', mexico: 'mx', 'costa rica': 'cr',
  honduras: 'hn', panama: 'pa', jamaica: 'jm', colombia: 'co', uruguay: 'uy',
  chile: 'cl', peru: 'pe', ecuador: 'ec', paraguay: 'py', venezuela: 've', bolivia: 'bo',
  japan: 'jp', 'south korea': 'kr', 'korea, south': 'kr', china: 'cn', australia: 'au',
  'new zealand': 'nz', india: 'in', thailand: 'th', indonesia: 'id',
};

const flagUrlFromNationality = (nationality?: string): string | null => {
  if (!nationality) return null;
  const code = NATIONALITY_TO_ISO[nationality.trim().toLowerCase()];
  return code ? `https://flagcdn.com/w640/${code}.png` : null;
};

interface MenShortlistDrawerProps {
  entry: ShortlistDrawerEntry | null;
  onClose: () => void;
  onSignToRoster: (entry: ShortlistDrawerEntry) => void;
  onRemove: (entry: ShortlistDrawerEntry) => void;
  onOpenAddNote: (entry: ShortlistDrawerEntry) => void;
  rosterPlayers: RosterPlayer[];
  clubRequests: ClubRequest[];
}

export default function MenShortlistDrawer({
  entry,
  onClose,
  onSignToRoster,
  onRemove,
  onOpenAddNote,
  rosterPlayers,
  clubRequests,
}: MenShortlistDrawerProps) {
  const { t, isRtl } = useLanguage();
  const euCountries = useEuCountries();

  const [teammates, setTeammates] = useState<RosterTeammateMatch[]>([]);
  const [loadingTeammates, setLoadingTeammates] = useState(false);
  const [pitchCopied, setPitchCopied] = useState(false);

  // Fetch teammates when target changes
  useEffect(() => {
    if (!entry?.tmProfileUrl) {
      setTeammates([]);
      setLoadingTeammates(false);
      return;
    }
    let cancelled = false;
    setLoadingTeammates(true);

    getTeammates(entry.tmProfileUrl)
      .then((items) => {
        if (cancelled) return;
        const rosterIds = new Set(
          rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean)
        );
        const matches: RosterTeammateMatch[] = items
          .filter((tm) => rosterIds.has(extractPlayerIdFromUrl(tm.tmProfileUrl) ?? ''))
          .map((tm) => {
            const id = extractPlayerIdFromUrl(tm.tmProfileUrl);
            const rosterPlayer = rosterPlayers.find(
              (p) => extractPlayerIdFromUrl(p.tmProfile) === id
            );
            return rosterPlayer
              ? { player: rosterPlayer, matchesPlayedTogether: tm.matchesPlayedTogether }
              : null;
          })
          .filter((m): m is RosterTeammateMatch => m != null)
          .sort((a, b) => b.matchesPlayedTogether - a.matchesPlayedTogether);

        setTeammates(matches);
      })
      .catch(() => {
        if (!cancelled) setTeammates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTeammates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entry?.tmProfileUrl, rosterPlayers]);

  // Compute matching club requests
  const matchedRequests = useMemo(() => {
    if (!entry) return [];
    const playerAdapter: RosterPlayer = {
      id: entry.tmProfileUrl,
      fullName: entry.playerName,
      age: entry.playerAge,
      positions: entry.positions ?? (entry.playerPosition ? [entry.playerPosition] : []),
      marketValue: entry.marketValue,
      nationality: entry.playerNationality,
      nationalities: entry.playerNationalities,
    };
    return matchingRequestsForPlayer(playerAdapter, clubRequests, euCountries);
  }, [entry, clubRequests, euCountries]);

  if (!entry) return null;

  const flagBg = flagUrlFromNationality(entry.playerNationality);
  const flagSmall = flagUrlFromNationality(entry.playerNationality);

  const nationalityDisplay = entry.playerNationality
    ? getCountryDisplayName(entry.playerNationality, isRtl)
    : (isRtl ? 'לא ידוע' : 'Unknown');

  const positionsStr =
    (entry.positions?.filter(Boolean) ?? (entry.playerPosition ? [entry.playerPosition] : []))
      .slice(0, 3)
      .join(' / ') || '—';

  const clubStr = (entry.clubJoinedName ?? entry.currentClub?.clubName)?.trim() || t('without_club');

  const valueChangePct = (() => {
    const hist = entry.marketValueHistory;
    const prev = hist && hist.length >= 2 ? hist[1]?.value : undefined;
    return computeValueChangePercent(prev, entry.marketValue);
  })();

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

  const copyOutreachPitch = () => {
    const pitch = resolveTemplate({
      playerName: entry.playerName,
      playerPosition: positionsStr,
      agentName: 'BRIT Sport Group',
    });
    navigator.clipboard?.writeText(pitch);
    setPitchCopied(true);
    setTimeout(() => setPitchCopied(false), 2000);
  };

  const handleShare = () => {
    openWhatsAppShare(
      `${entry.playerName || 'Player'} (${positionsStr}, ${clubStr}) — ${entry.marketValue || '—'}\n${entry.tmProfileUrl}`
    );
  };

  return (
    <>
      <div className="brit-scrim open" onClick={onClose} aria-hidden="true" />
      <aside className="brit-drawer open" aria-label={t('shortlist_drawer_title')}>
        {/* Hero header */}
        <div className="brit-drawer-hero">
          {flagBg ? (
            <img className="brit-drawer-flagbg" src={flagBg} alt="" aria-hidden="true" />
          ) : (
            <div className="brit-drawer-flagbg-ph" aria-hidden="true" />
          )}
          <button className="brit-drawer-close" onClick={onClose} aria-label={t('room_close')}>
            ×
          </button>
          <div className="brit-drawer-hero-copy">
            <small style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {flagSmall && (
                <img
                  src={flagSmall}
                  alt=""
                  style={{ width: '14px', height: '10px', objectFit: 'cover' }}
                />
              )}
              {nationalityDisplay} · {clubStr} / {positionsStr}
            </small>
            <h2>{entry.playerName || '—'}</h2>
          </div>
        </div>

        {/* Drawer body */}
        <div className="brit-drawer-body">
          {/* Key facts grid */}
          <div className="brit-facts" style={{ margin: '0 0 16px' }}>
            <div>
              <label>{t('shortlist_drawer_market_value')}</label>
              <strong>
                {entry.marketValue || '—'}
                {valueChangePct !== null && (
                  <span
                    style={{
                      fontSize: '11px',
                      marginInlineStart: '6px',
                      color: valueChangePct >= 0 ? '#1c8b47' : '#b64235',
                    }}
                  >
                    {valueChangePct >= 0 ? `▲ +${valueChangePct}%` : `▼ ${valueChangePct}%`}
                  </span>
                )}
              </strong>
            </div>
            <div>
              <label>{t('shortlist_drawer_age')}</label>
              <strong>{entry.playerAge || '—'}</strong>
            </div>
            <div>
              <label>{t('shortlist_drawer_position')}</label>
              <strong>{positionsStr}</strong>
            </div>
            <div>
              <label>{t('shortlist_drawer_contract')}</label>
              <strong>{entry.contractExpires || (isFreeAgent(clubStr) ? t('shortlist_filter_free_agent') : '—')}</strong>
            </div>
            <div>
              <label>{t('shortlist_drawer_nationality')}</label>
              <strong>{nationalityDisplay}</strong>
            </div>
            <div>
              <label>{t('shortlist_th_scout')}</label>
              <strong>
                {agentName}
                {addedAgo && <small style={{ fontSize: '10px', display: 'block', color: 'var(--muted)', fontWeight: 400 }}>{addedAgo}</small>}
              </strong>
            </div>
          </div>

          {/* ⚡ Locker Room Connection ("Who Knows Him?") */}
          <section className="brit-drawer-sec">
            <div className="brit-drawer-sec-head">
              <label>⚡ {t('shortlist_drawer_locker_room')}</label>
              {teammates.length > 0 && <span className="badge">{teammates.length}</span>}
            </div>
            {loadingTeammates ? (
              <p className="brit-drawer-sec-empty">{t('shortlist_drawer_searching_network')}</p>
            ) : teammates.length === 0 ? (
              <p className="brit-drawer-sec-empty">{t('shortlist_drawer_no_network')}</p>
            ) : (
              teammates.map((m) => {
                const firstName = (m.player.fullName || '').split(' ')[0] || '';
                const waText = `Hey ${firstName},\nHope everything is well at your side.\nI need your help with something.\nAny chance you have ${entry.playerName || ''} contact number or some thoughts on him?\nThank you!`;
                const cleanPhone = m.player.playerPhoneNumber?.replace(/[^0-9+]/g, '');
                const waHref = cleanPhone
                  ? `https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(waText)}`
                  : null;

                return (
                  <div className="brit-drawer-mate" key={m.player.id}>
                    <img src={m.player.profileImage || 'https://via.placeholder.com/40'} alt="" />
                    <div className="mi">
                      <b>{m.player.fullName}</b>
                      <span>{t('shortlist_drawer_played_together').replace('{count}', String(m.matchesPlayedTogether))}</span>
                    </div>
                    {waHref && (
                      <a
                        className="brit-drawer-wa-btn"
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`WhatsApp ${m.player.fullName}`}
                      >
                        {t('shortlist_drawer_ask_teammate').replace('{name}', firstName || 'Player')}
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </section>

          {/* 🎯 Matches Live Requests */}
          <section className="brit-drawer-sec">
            <div className="brit-drawer-sec-head">
              <label>🎯 {t('shortlist_drawer_live_requests')}</label>
              {matchedRequests.length > 0 && <span className="badge">{matchedRequests.length}</span>}
            </div>
            {matchedRequests.length === 0 ? (
              <p className="brit-drawer-sec-empty">{t('shortlist_drawer_no_requests')}</p>
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

          {/* 📱 Outreach & Social */}
          {entry.instagramHandle && (
            <section className="brit-drawer-sec">
              <div className="brit-drawer-sec-head">
                <label>📱 {t('shortlist_drawer_social_outreach')}</label>
              </div>
              <div className="brit-drawer-outreach-row">
                <a
                  className="brit-drawer-outreach-handle"
                  href={getInstagramProfileUrl(entry.instagramHandle)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{entry.instagramHandle.replace(/^@/, '')} ↗
                </a>
                <div className="brit-drawer-outreach-btns">
                  <a
                    className="brit-drawer-sm-btn"
                    href={getInstagramDmUrl(entry.instagramHandle)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('shortlist_drawer_open_dm')} ↗
                  </a>
                  <button type="button" className="brit-drawer-sm-btn" onClick={copyOutreachPitch}>
                    {pitchCopied ? t('shortlist_drawer_pitch_copied') : t('shortlist_drawer_copy_pitch')}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 💬 Agency Notes Timeline */}
          <section className="brit-drawer-sec">
            <div className="brit-drawer-sec-head">
              <label>💬 {t('shortlist_notes_title')}</label>
              <button
                type="button"
                className="brit-drawer-sm-btn"
                onClick={() => onOpenAddNote(entry)}
              >
                + {t('shortlist_notes_add')}
              </button>
            </div>
            {entry.notes && entry.notes.length > 0 ? (
              entry.notes.map((n, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 0',
                    borderTop: idx > 0 ? '1px dashed var(--line)' : 'none',
                    fontSize: '11px',
                  }}
                >
                  <p style={{ margin: '0 0 4px', color: 'var(--ink)' }}>{n.text}</p>
                  <span style={{ fontSize: '9px', color: 'var(--muted)', textTransform: 'uppercase' }}>
                    {isRtl ? (n.createdByHebrewName || n.createdBy || '—') : (n.createdBy || n.createdByHebrewName || '—')}
                    {n.createdAt && ` · ${new Date(n.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US')}`}
                  </span>
                </div>
              ))
            ) : (
              <p className="brit-drawer-sec-empty">{t('room_empty_notes') || 'No agency notes recorded yet'}</p>
            )}
          </section>

          {/* ── Action Grid ── */}
          <div className="brit-drawer-actions-grid">
            <button
              type="button"
              className="primary"
              onClick={() => onSignToRoster(entry)}
            >
              {t('shortlist_drawer_sign_to_roster')}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={handleShare}
            >
              ↗ {t('player_info_share')}
            </button>
            {entry.tmProfileUrl && (
              <a
                className="ghost"
                href={entry.tmProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('shortlist_drawer_open_tm')}
              </a>
            )}
            <button
              type="button"
              className="danger"
              onClick={() => onRemove(entry)}
            >
              {t('shortlist_drawer_remove_target')}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
