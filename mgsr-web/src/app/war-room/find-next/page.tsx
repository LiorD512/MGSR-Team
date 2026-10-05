'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import FindNextTab from '@/components/FindNextTab';
import { WarRoomMasthead } from '../_shared';

export default function WarRoomFindNextPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const router = useRouter();
  const isHe = lang === 'he';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-[var(--mgsr-gold)] font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-[78rem] mx-auto">
        <WarRoomMasthead
          kicker={isHe ? 'מצא את הבא / התאמת חתימה' : 'Find next / Signature match'}
          titleLead={isHe ? 'מצא' : 'Find'}
          titleAccent={isHe ? 'את הבא.' : 'next.'}
          sub={
            isHe
              ? 'חיפוש יורש מבוסס דנ"א של כוכב — מצא את ההתאמה הבאה לפי חתימת שחקן.'
              : 'Signature-based star successor search — find the next match from a player DNA profile.'
          }
        />
        <FindNextTab />
      </div>
    </AppLayout>
  );
}
