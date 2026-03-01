'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';

const navItems = [
  { href: '/dashboard', labelKey: 'nav_dashboard' },
  { href: '/tasks', labelKey: 'nav_tasks' },
  { href: '/players', labelKey: 'nav_players' },
  { href: '/shortlist', labelKey: 'nav_shortlist' },
  { href: '/shadow-teams', labelKey: 'nav_shadow_teams' },
  { href: '/releases', labelKey: 'nav_releases' },
  { href: '/contract-finisher', labelKey: 'nav_contract_finisher' },
  { href: '/returnees', labelKey: 'nav_returnee' },
  { href: '/ai-scout', labelKey: 'nav_ai_scout' },
  { href: '/war-room', labelKey: 'nav_war_room' },
  { href: '/portfolio', labelKey: 'nav_portfolio' },
  { href: '/contacts', labelKey: 'nav_contacts' },
  { href: '/requests', labelKey: 'nav_requests' },
];

const womenNavItems = [
  { href: '/dashboard', labelKey: 'nav_dashboard' },
  { href: '/tasks', labelKey: 'nav_tasks' },
  { href: '/players', labelKey: 'nav_players_women' },
  { href: '/portfolio', labelKey: 'nav_portfolio' },
];

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
  platform: 'men' | 'women';
  items: { href: string; labelKey: string }[];
  platformSwitcher: React.ReactNode;
}) {
  const brandName = platform === 'women' ? 'MGSR Women' : 'MGSR Team';
  const logo = platform === 'women' ? '/logo-women.svg' : '/logo.svg';
  const accentClass = platform === 'women' ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-accent)]';
  const activeClass = platform === 'women' ? 'bg-[var(--women-rose)]/15 text-[var(--women-rose)]' : 'bg-[var(--mgsr-accent-dim)] text-[var(--mgsr-accent)]';
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

const WOMEN_ALLOWED_PATHS = ['/dashboard', '/tasks', '/players', '/players/add', '/portfolio'];
function isWomenAllowedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/dashboard' || pathname === '/tasks') return true;
  if (pathname === '/players' || pathname === '/players/add') return true;
  if (pathname === '/portfolio') return true;
  if (pathname.startsWith('/players/women/')) return true;
  return false;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, isRtl, setLang } = useLanguage();
  const { platform, setPlatform } = usePlatform();
  const [menuOpen, setMenuOpen] = useState(false);

  // Route guard: when women platform, only allow dashboard, tasks, players
  useEffect(() => {
    if (platform === 'women' && !isWomenAllowedPath(pathname)) {
      router.replace('/dashboard');
    }
  }, [platform, pathname, router]);

  // Close menu on route change (mobile)
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu open on mobile
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const toggleLang = () => setLang(isRtl ? 'en' : 'he');

  // MGSR Women: original layout — sidebar only (logo once), platform switch near language in sidebar
  if (platform === 'women') {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-mgsr-dark flex min-h-[100dvh]">
        {/* Mobile: hamburger only */}
        <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-mgsr-card border-b border-mgsr-border flex items-center px-4">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 -m-2 text-mgsr-muted hover:text-[var(--mgsr-accent)] transition"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>

        {menuOpen && (
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`
          w-56 bg-mgsr-card flex flex-col shrink-0
          fixed md:static inset-y-0 z-50
          ${isRtl ? 'right-0 border-l' : 'left-0 border-r'} border-mgsr-border
          transform transition-transform duration-200 ease-out
          md:transform-none
          ${menuOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}
          md:translate-x-0
          pt-14 md:pt-0
        `}
        >
          <NavContent
            pathname={pathname}
            t={t}
            isRtl={isRtl}
            setLang={toggleLang}
            user={user}
            signOut={signOut}
            onNavClick={() => setMenuOpen(false)}
            platform="women"
            items={womenNavItems}
            platformSwitcher={<PlatformSwitcher variant="compact" />}
          />
        </aside>

        <main className="flex-1 overflow-auto p-4 md:p-6 pt-14 md:pt-6 min-w-0">{children}</main>
      </div>
    );
  }

  // MGSR Team: original layout — sidebar only (logo once), platform switch near language in sidebar
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-mgsr-dark flex min-h-[100dvh]">
      {/* Mobile: hamburger only */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-mgsr-card border-b border-mgsr-border flex items-center px-4">
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 -m-2 text-mgsr-muted hover:text-mgsr-teal transition"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          w-56 bg-mgsr-card flex flex-col shrink-0
          fixed md:static inset-y-0 z-50
          ${isRtl ? 'right-0 border-l' : 'left-0 border-r'} border-mgsr-border
          transform transition-transform duration-200 ease-out
          md:transform-none
          ${menuOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'}
          md:translate-x-0
          pt-14 md:pt-0
        `}
      >
        <NavContent
          pathname={pathname}
          t={t}
          isRtl={isRtl}
          setLang={toggleLang}
          user={user}
          signOut={signOut}
          onNavClick={() => setMenuOpen(false)}
          platform="men"
          items={navItems}
          platformSwitcher={<PlatformSwitcher variant="compact" />}
        />
      </aside>

      <main className="flex-1 overflow-auto p-4 md:p-6 pt-14 md:pt-6 min-w-0">{children}</main>
    </div>
  );
}
