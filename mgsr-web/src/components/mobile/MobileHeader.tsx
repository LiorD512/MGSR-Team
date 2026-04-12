'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlatform } from '@/contexts/PlatformContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';
import NotificationBell from '@/components/NotificationBell';

/* ── Route → page title mapping ── */
const pageTitleKeys: Record<string, string> = {
  '/dashboard': 'nav_dashboard',
  '/players': 'nav_players',
  '/players/add': 'nav_players',
  '/ai-scout': 'nav_ai_scout',
  '/tasks': 'nav_tasks',
  '/shortlist': 'nav_shortlist',
  '/shadow-teams': 'nav_shadow_teams',
  '/releases': 'nav_releases',
  '/contract-finisher': 'nav_contract_finisher',
  '/returnees': 'nav_returnee',
  '/war-room': 'nav_war_room',
  '/portfolio': 'nav_portfolio',
  '/contacts': 'nav_contacts',
  '/requests': 'nav_requests',
  '/jewish-finder': 'nav_jewish_finder',
  '/chat-room': 'nav_chat_room',
  '/news': 'nav_news',
};

function getPageTitleKey(pathname: string): string {
  // Exact match first
  if (pageTitleKeys[pathname]) return pageTitleKeys[pathname];
  // Player detail
  if (pathname.startsWith('/players/women/')) return 'nav_players_women';
  if (pathname.startsWith('/players/')) return 'nav_players';
  return 'nav_dashboard';
}

export default function MobileHeader() {
  const pathname = usePathname();
  const { platform } = usePlatform();
  const { t, isRtl, setLang } = useLanguage();

  const titleKey = getPageTitleKey(pathname);
  const title = t(titleKey);
  const isWomen = platform === 'women';
  const logo = isWomen ? '/logo-women.svg' : '/logo.svg';

  // Show back button on detail pages
  const isDetailPage = pathname.startsWith('/players/') && pathname !== '/players' && pathname !== '/players/add';

  return (
    <header
      className="fixed top-0 inset-x-0 z-40 bg-mgsr-card/95 backdrop-blur-md border-b border-mgsr-border lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center h-14 px-3 gap-2">
        {/* Left: Logo or back button */}
        {isDetailPage ? (
          <Link
            href="/players"
            className="flex items-center justify-center w-10 h-10 -ml-1 rounded-lg hover:bg-mgsr-dark/50 transition"
            aria-label="Back"
          >
            <svg
              className={`w-5 h-5 text-mgsr-muted ${isRtl ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        ) : (
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="MGSR" className="w-8 h-8" />
          </Link>
        )}

        {/* Center: Page title */}
        <h1 className="flex-1 text-sm font-semibold text-mgsr-text truncate text-center">{title}</h1>

        {/* Right: notification bell + platform switch + language */}
        <div className="flex items-center gap-1 shrink-0">
          <NotificationBell />
          <PlatformSwitcher variant="compact" />
          <button
            onClick={() => setLang(isRtl ? 'en' : 'he')}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-xs font-medium text-mgsr-muted hover:text-[var(--mgsr-accent)] hover:bg-mgsr-dark/50 transition"
          >
            {isRtl ? 'EN' : 'עב'}
          </button>
        </div>
      </div>
    </header>
  );
}
