'use client';

import { useRouter } from 'next/navigation';
import { usePlatform, type Platform } from '@/contexts/PlatformContext';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Editorial platform switch for the men "Light Management Room" (.brit-room) topbar.
 *
 * A sliding-pill toggle between the Men and Youth platforms (Women is intentionally
 * out of scope here — the standard AppLayout shell still exposes all three). Styling
 * lives under `.brit-platform-switch` in globals.css so it matches the paper/ink
 * editorial theme.
 *
 * Selecting a platform updates the shared PlatformContext (persisted to localStorage
 * and mirrored to `data-platform` by PlatformSync) and returns to the dashboard —
 * switching to Youth unmounts this men shell and mounts the youth workspace, exactly
 * like the existing PlatformSwitcher.
 */

const OPTIONS: Platform[] = ['men', 'youth'];

export default function BritPlatformSwitch() {
  const { platform, setPlatform } = usePlatform();
  const { t } = useLanguage();
  const router = useRouter();

  // Only meaningful on the men shell; guard against rendering in women mode.
  const active: Platform = platform === 'youth' ? 'youth' : 'men';

  const select = (p: Platform) => {
    if (p === active) return;
    setPlatform(p);
    router.push('/dashboard');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const isRtlDir = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const goYouth = isRtlDir ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
      select(goYouth ? 'youth' : 'men');
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(active === 'men' ? 'youth' : 'men');
    }
  };

  const label = (p: Platform) =>
    p === 'youth' ? t('platform_switch_youth') : t('platform_switch_men');

  return (
    <div
      className={`brit-platform-switch${active === 'youth' ? ' is-youth' : ''}`}
      role="tablist"
      aria-label={t('platform_switch_aria')}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <span className="brit-ps-thumb" aria-hidden="true" />
      {OPTIONS.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={active === p}
          className={active === p ? 'is-on' : ''}
          onClick={() => select(p)}
        >
          <span className="brit-ps-dot" aria-hidden="true" />
          <span>{label(p)}</span>
        </button>
      ))}
    </div>
  );
}
