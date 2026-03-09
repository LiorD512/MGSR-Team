'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';
import { useIsMobileOrTablet } from '@/hooks/useMediaQuery';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomTabBar from '@/components/mobile/MobileBottomTabBar';
import NotificationBell from '@/components/NotificationBell';
import NotificationPrompt from '@/components/NotificationPrompt';

const navItems = [
  { href: '/dashboard', labelKey: 'nav_dashboard' },
  { href: '/tasks', labelKey: 'nav_tasks' },
  { href: '/players', labelKey: 'nav_players' },
  { href: '/shortlist', labelKey: 'nav_shortlist' },
  { href: '/shadow-teams', labelKey: 'nav_shadow_teams' },
  { href: '/releases', labelKey: 'nav_releases' },
  { href: '/contract-finisher', labelKey: 'nav_contract_finisher' },
  { href: '/returnees', labelKey: 'nav_returnee' },
  { href: '/news', labelKey: 'nav_news' },
  { href: '/war-room', labelKey: 'nav_war_room' },
  { href: '/portfolio', labelKey: 'nav_portfolio' },
  { href: '/contacts', labelKey: 'nav_contacts' },
  { href: '/requests', labelKey: 'nav_requests' },
];

const womenNavItems = [
  { href: '/dashboard', labelKey: 'nav_dashboard' },
  { href: '/tasks', labelKey: 'nav_tasks' },
  { href: '/players', labelKey: 'nav_players_women' },
  { href: '/shortlist', labelKey: 'nav_shortlist' },
  { href: '/contacts', labelKey: 'nav_contacts' },
  { href: '/requests', labelKey: 'nav_requests' },
  { href: '/portfolio', labelKey: 'nav_portfolio' },
];

const youthNavItems = [
  { href: '/dashboard', labelKey: 'nav_dashboard' },
  { href: '/tasks', labelKey: 'nav_tasks' },
  { href: '/players', labelKey: 'nav_players_youth' },
  { href: '/shortlist', labelKey: 'nav_shortlist' },
  { href: '/contacts', labelKey: 'nav_contacts' },
  { href: '/requests', labelKey: 'nav_requests' },
  { href: '/portfolio', labelKey: 'nav_portfolio' },
];

/* ── Desktop sidebar nav content (unchanged) ── */
function NavContent({
  pathname,
  t,
  isRtl,
  setLang,
  user,
  signOut,
  onNavClick,
  platform,
  items,
  platformSwitcher,
}: {
  pathname: string;
  t: (k: string) => string;
  isRtl: boolean;
  setLang: () => void;
  user: { email?: string | null } | null;
  signOut: () => void;
  onNavClick?: () => void;
  platform: 'men' | 'women' | 'youth';
  items: { href: string; labelKey: string }[];
  platformSwitcher: React.ReactNode;
}) {
  const brandName = platform === 'youth' ? 'MGSR Youth' : platform === 'women' ? 'MGSR Women' : 'MGSR Team';
  const logo = platform === 'youth' ? '/logo.svg' : platform === 'women' ? '/logo-women.svg' : '/logo.svg';
  const accentClass = platform === 'youth' ? 'text-[var(--youth-cyan)]' : platform === 'women' ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-accent)]';
  const activeClass = platform === 'youth' ? 'bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)]' : platform === 'women' ? 'bg-[var(--women-rose)]/15 text-[var(--women-rose)]' : 'bg-[var(--mgsr-accent-dim)] text-[var(--mgsr-accent)]';
  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavClick}
        className={`p-4 border-b border-mgsr-border flex items-center gap-3 ${platform === 'women' ? 'justify-end' : ''}`}
      >
        <img src={logo} alt="MGSR" className="w-10 h-10 shrink-0" />
        <span className={`text-xl font-bold font-display ${accentClass}`}>{brandName}</span>
      </Link>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavClick}
            className={`block px-4 py-3 rounded-lg transition min-h-[44px] flex items-center ${
              pathname === item.href
                ? activeClass
                : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-card/80'
            }`}
          >
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-mgsr-border space-y-2 shrink-0">
        {platformSwitcher}
        <NotificationBell />
        <button
          onClick={() => {
            setLang();
            onNavClick?.();
          }}
          className="text-sm text-mgsr-muted hover:text-[var(--mgsr-accent)] transition min-h-[44px] flex items-center"
        >
          {isRtl ? 'English' : 'עברית'}
        </button>
        <p className="text-sm text-mgsr-muted truncate py-2">{user?.email}</p>
        <button
          onClick={() => {
            signOut();
            onNavClick?.();
          }}
          className="block text-sm text-[var(--mgsr-accent)] hover:underline min-h-[44px] flex items-center"
        >
          {t('sign_out')}
        </button>
      </div>
    </>
  );
}

const WOMEN_ALLOWED_PATHS = ['/dashboard', '/tasks', '/players', '/players/add', '/portfolio', '/shortlist', '/contacts', '/requests'];
function isWomenAllowedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/dashboard' || pathname === '/tasks') return true;
  if (pathname === '/players' || pathname === '/players/add') return true;
  if (pathname === '/portfolio') return true;
  if (pathname === '/shortlist' || pathname === '/contacts' || pathname === '/requests') return true;
  if (pathname.startsWith('/players/women/')) return true;
  return false;
}

const YOUTH_ALLOWED_PATHS = ['/dashboard', '/tasks', '/players', '/players/add', '/portfolio', '/shortlist', '/contacts', '/requests'];
function isYouthAllowedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/dashboard' || pathname === '/tasks') return true;
  if (pathname === '/players' || pathname === '/players/add') return true;
  if (pathname === '/portfolio') return true;
  if (pathname === '/shortlist' || pathname === '/contacts' || pathname === '/requests') return true;
  if (pathname.startsWith('/players/youth/')) return true;
  return false;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, isRtl, setLang } = useLanguage();
  const { platform, setPlatform } = usePlatform();
  const isMobileOrTablet = useIsMobileOrTablet();

  // Route guard: when women/youth platform, only allow specific paths
  useEffect(() => {
    if (platform === 'women' && !isWomenAllowedPath(pathname)) {
      router.replace('/dashboard');
    }
    if (platform === 'youth' && !isYouthAllowedPath(pathname)) {
      router.replace('/dashboard');
    }
  }, [platform, pathname, router]);

  const toggleLang = () => setLang(isRtl ? 'en' : 'he');
  const currentItems = platform === 'youth' ? youthNavItems : platform === 'women' ? womenNavItems : navItems;

  /* ═══════════════════════════════════════════════════════════
   *  MOBILE / TABLET layout (< 1024px)
   *  — MobileHeader (top) + content + MobileBottomTabBar (bottom)
   *  — No sidebar, no hamburger
   * ═══════════════════════════════════════════════════════════ */
  if (isMobileOrTablet) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen min-h-[100dvh] bg-mgsr-dark flex flex-col">
        {/* Fixed header */}
        <MobileHeader />

        {/* Main content — scroll area between header and tab bar */}
        <main className="flex-1 overflow-auto pt-14 pb-[calc(52px+env(safe-area-inset-bottom,0px))] px-4 min-w-0">
          {children}
        </main>

        {/* Fixed bottom tab bar */}
        <MobileBottomTabBar />
        <NotificationPrompt />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
   *  DESKTOP layout (≥ 1024px) — completely unchanged
   * ═══════════════════════════════════════════════════════════ */
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-mgsr-dark flex min-h-[100dvh]">
      <aside
        className={`
          w-56 bg-mgsr-card flex flex-col shrink-0 static inset-y-0
          ${isRtl ? 'border-l' : 'border-r'} border-mgsr-border
        `}
      >
        <NavContent
          pathname={pathname}
          t={t}
          isRtl={isRtl}
          setLang={toggleLang}
          user={user}
          signOut={signOut}
          platform={platform}
          items={currentItems}
          platformSwitcher={<PlatformSwitcher variant="compact" />}
        />
      </aside>

      <main className="flex-1 overflow-auto p-6 min-w-0">{children}</main>
      <NotificationPrompt />
    </div>
  );
}
