'use client';

/**
 * Shared "Light Management Room" rail used by the men dashboard, players,
 * and player-profile screens. Keeps navigation consistent in one place.
 *
 * The Players entry is an expandable group revealing Roster + Shortlist.
 */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

export type BritRailActive =
  | 'dashboard'
  | 'players'
  | 'shortlist'
  | 'requests'
  | 'contacts'
  | 'release'
  | 'club-change'
  | 'returnees'
  | 'contract-finisher';

interface BritRailProps {
  active: BritRailActive;
  footer?: ReactNode;
}

export default function BritRail({ active, footer }: BritRailProps) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const playersActive = active === 'players' || active === 'shortlist';
  const [playersOpen, setPlayersOpen] = useState(playersActive);

  const signalsActive =
    active === 'release' || active === 'club-change' || active === 'returnees' || active === 'contract-finisher';
  const [signalsOpen, setSignalsOpen] = useState(signalsActive);

  const isRoster = pathname === '/players' || pathname.startsWith('/players/');
  const isShortlist = pathname === '/shortlist';
  const isRelease = pathname === '/release-notifications';
  const isClubChange = pathname === '/club-change-notifications';
  const isReturnees = pathname === '/returnees';
  const isContractFinisher = pathname === '/contract-finisher';

  return (
    <aside className="brit-rail">
      <Link className="brit-lockup" href="/dashboard" aria-label="BRIT Sport Group home">
        <img src="/brit_circle_black_gold.svg" alt="BRIT Sport Group logo" />
        <div>
          <strong>BRIT SPORT GROUP</strong>
          <small>{t('room_lockup_sub')}</small>
        </div>
      </Link>

      <nav className="brit-nav" aria-label="Navigation">
        <Link href="/dashboard" className={active === 'dashboard' ? 'active' : ''}>
          <span>{t('nav_dashboard')}</span>
        </Link>

        {/* Players group — expandable */}
        <button
          type="button"
          className={`brit-nav-group${playersActive ? ' active' : ''}`}
          aria-expanded={playersOpen}
          onClick={() => setPlayersOpen((v) => !v)}
        >
          <span>{t('nav_players')}</span>
          <em>{playersOpen ? '−' : '+'}</em>
        </button>
        {playersOpen && (
          <div className="brit-nav-sub">
            <Link href="/players" className={active === 'players' || isRoster ? 'active' : ''}>
              <span>{t('nav_roster')}</span>
            </Link>
            <Link href="/shortlist" className={active === 'shortlist' || isShortlist ? 'active' : ''}>
              <span>{t('nav_shortlist')}</span>
            </Link>
          </div>
        )}

        <Link href="/requests" className={active === 'requests' ? 'active' : ''}>
          <span>{t('nav_requests')}</span>
        </Link>
        <Link href="/contacts" className={active === 'contacts' ? 'active' : ''}>
          <span>{t('nav_contacts')}</span>
        </Link>

        {/* Signals group — expandable */}
        <button
          type="button"
          className={`brit-nav-group${signalsActive ? ' active' : ''}`}
          aria-expanded={signalsOpen}
          onClick={() => setSignalsOpen((v) => !v)}
        >
          <span>{t('nav_signals')}</span>
          <em>{signalsOpen ? '−' : '+'}</em>
        </button>
        {signalsOpen && (
          <div className="brit-nav-sub">
            <Link href="/release-notifications" className={active === 'release' || isRelease ? 'active' : ''}>
              <span>{t('nav_release_notifications')}</span>
            </Link>
            <Link href="/club-change-notifications" className={active === 'club-change' || isClubChange ? 'active' : ''}>
              <span>{t('nav_club_change_notifications')}</span>
            </Link>
            <Link href="/returnees" className={active === 'returnees' || isReturnees ? 'active' : ''}>
              <span>{t('nav_returnee')}</span>
            </Link>
            <Link href="/contract-finisher" className={active === 'contract-finisher' || isContractFinisher ? 'active' : ''}>
              <span>{t('nav_contract_finisher')}</span>
            </Link>
          </div>
        )}
      </nav>

      {footer !== undefined ? (
        footer
      ) : (
        <div className="brit-rail-footer">
          {t('room_footer_platform_label')}
          <strong>{t('room_footer_platform_value')}</strong>
        </div>
      )}
    </aside>
  );
}
