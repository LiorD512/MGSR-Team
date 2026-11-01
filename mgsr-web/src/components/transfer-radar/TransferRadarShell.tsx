'use client';

/**
 * Transfer Radar page shell: men-only guard + the shared "brit-room" chrome (BritRail, top bar) with the dark radar canvas.
 * Unauthenticated -> /login. Women/Youth -> /dashboard (same rule as War Room).
 */
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { useLanguage } from '@/contexts/LanguageContext';
import BritLoader from '@/components/BritLoader';
import BritRail, { type BritRailActive } from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import { TRANSFER_RADAR_ENABLED } from '@/lib/featureFlags';
import { useRadarT } from '@/lib/transferRadar/i18n';
import '@/app/transfer-radar/transfer-radar.css';

export default function TransferRadarShell({ active, crumb, children }: { active: Extract<BritRailActive, 'transfer-radar' | 'transfer-radar-sources'>; crumb?: string; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { platform } = usePlatform();
  const { lang, setLang } = useLanguage();
  const { tr, isRtl } = useRadarT();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [user, loading, router]);
  useEffect(() => { if (platform === 'women' || platform === 'youth') router.replace('/dashboard'); }, [platform, router]);
  useEffect(() => { if (!TRANSFER_RADAR_ENABLED) router.replace('/dashboard'); }, [router]);

  const dateStr = useMemo(() => new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), [lang]);
  const timeStr = useMemo(() => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }), []);

  if (loading || !user || platform !== 'men' || !TRANSFER_RADAR_ENABLED) return <BritLoader fullPage />;

  return (
    <div className="brit-room tr-dark" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active={active} />
        <div className="brit-main">
          <header className="brit-topbar">
            <div>BRIT / <strong>{tr('crumb')}</strong> / {crumb ?? tr('nav')} / {dateStr}</div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>
          <main className="brit-canvas">{children}</main>
        </div>
      </div>
    </div>
  );
}
