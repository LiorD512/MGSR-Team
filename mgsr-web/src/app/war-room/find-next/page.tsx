'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import BritLoader from '@/components/BritLoader';
import FindNextTab from '@/components/FindNextTab';

export default function WarRoomFindNextPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang, setLang } = useLanguage();
  const router = useRouter();
  const isHe = lang === 'he';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return <BritLoader fullPage />;
  }

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="war-room" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / <strong>{t('nav_find_next')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{isHe ? 'מצא את הבא / התאמת חתימה' : 'Find next / Signature match'}</p>
                <h1>
                  {isHe ? 'מצא את' : 'Find'} <span>{isHe ? 'הבא.' : 'next.'}</span>
                </h1>
                <p className="brit-ra-sub">
                  {isHe
                    ? 'חיפוש יורש מבוסס דנ"א של כוכב — מצא את ההתאמה הבאה לפי חתימת שחקן.'
                    : 'Signature-based star successor search — find the next match from a player DNA profile.'}
                </p>
              </div>
            </header>

            <FindNextTab />
          </main>
        </div>
      </div>
    </div>
  );
}
