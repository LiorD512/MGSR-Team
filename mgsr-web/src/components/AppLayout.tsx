'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

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

function NavContent({
  pathname,
  t,
  isRtl,
  setLang,
  user,
  signOut,
  onNavClick,
}: {
  pathname: string;
  t: (k: string) => string;
  isRtl: boolean;
  setLang: () => void;
  user: { email?: string | null } | null;
  signOut: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavClick}
        className="p-4 border-b border-mgsr-border flex items-center gap-3"
      >
        <img src="/logo.svg" alt="MGSR" className="w-10 h-10 shrink-0" />
        <span className="text-xl font-bold text-mgsr-teal font-display">MGSR Team</span>
      </Link>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavClick}
            className={`block px-4 py-3 rounded-lg transition min-h-[44px] flex items-center ${
              pathname === item.href
                ? 'bg-mgsr-teal/20 text-mgsr-teal'
                : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-card/80'
            }`}
          >
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-mgsr-border space-y-2 shrink-0">
        <button
          onClick={() => {
            setLang();
            onNavClick?.();
          }}
          className="text-sm text-mgsr-muted hover:text-mgsr-teal transition min-h-[44px] flex items-center"
        >
          {isRtl ? 'English' : 'עברית'}
        </button>
        <p className="text-sm text-mgsr-muted truncate py-2">{user?.email}</p>
        <button
          onClick={() => {
            signOut();
            onNavClick?.();
          }}
          className="block text-sm text-mgsr-teal hover:underline min-h-[44px] flex items-center"
        >
          {t('sign_out')}
        </button>
      </div>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { t, isRtl, setLang } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

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

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-mgsr-dark flex min-h-[100dvh]">
      {/* Mobile: hamburger + header */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-mgsr-card border-b border-mgsr-border flex items-center justify-between px-4">
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 -m-2 text-mgsr-muted hover:text-mgsr-teal transition"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/dashboard" className="flex items-center gap-2">
          <img src="/logo.svg" alt="MGSR" className="w-8 h-8" />
          <span className="font-bold text-mgsr-teal font-display">MGSR Team</span>
        </Link>
        <div className="w-10" />
      </header>

      {/* Mobile: overlay when menu open */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: hidden on mobile, drawer when open */}
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
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 md:p-6 pt-20 md:pt-6 min-w-0">{children}</main>
    </div>
  );
}
