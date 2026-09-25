'use client';

/**
 * Full-screen light loader for the men "Light Management Room".
 *
 * Replaces the old dark `bg-mgsr-dark` auth/loading flash so navigating between
 * men screens (or waiting on auth) never shows the old dark design. Standalone,
 * fixed, paper-toned, with the BRIT mark + an indeterminate progress track.
 */

import { useLanguage } from '@/contexts/LanguageContext';

export default function MenLoading({ label }: { label?: string }) {
  const { t, isRtl } = useLanguage();
  return (
    <div className="brit-loader-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'} role="status" aria-live="polite">
      <div className="brit-loader-inner">
        <div className="brit-loader-mark">B</div>
        <div className="brit-loader-track"><span /></div>
        <div className="brit-loader-label">{label ?? t('room_loading')}</div>
      </div>
    </div>
  );
}
