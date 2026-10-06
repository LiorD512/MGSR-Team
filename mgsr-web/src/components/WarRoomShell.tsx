'use client';

/**
 * Shared War Room page shell.
 *
 * Provides the full-bleed .brit-room chrome (BritRail sidebar, topbar,
 * canvas) so every War Room sub-page has a consistent layout. Children
 * are rendered inside <main className="brit-canvas">.
 */

import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail, { type BritRailActive } from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';

interface WarRoomShellProps {
  active: BritRailActive;
  /** Breadcrumb segment shown after "War Room /" */
  crumb: string;
  children: React.ReactNode;
}

export default function WarRoomShell({ active, crumb, children }: WarRoomShellProps) {
  const { t, isRtl, lang } = useLanguage();

  const dateStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [lang]);

  const timeStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jerusalem',
    });
  }, []);

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active={active} />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / {crumb} / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
