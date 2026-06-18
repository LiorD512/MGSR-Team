'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';
import { useIsMobileOrTablet } from '@/hooks/useMediaQuery';
import { useChatUnread } from '@/hooks/useChatUnread';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomTabBar from '@/components/mobile/MobileBottomTabBar';
import NotificationPrompt from '@/components/NotificationPrompt';

type NavItem = { href: string; labelKey: string; badge?: 'chat' | 'new' };
type NavSection = { id: string; titleKey: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    id: 'core',
    titleKey: 'app_shell_section_core_ops',
    items: [
      { href: '/dashboard', labelKey: 'nav_dashboard' },
      { href: '/tasks', labelKey: 'nav_tasks' },
      { href: '/players', labelKey: 'nav_players' },
      { href: '/shortlist', labelKey: 'nav_shortlist' },
      { href: '/requests', labelKey: 'nav_requests' },
      { href: '/contacts', labelKey: 'nav_contacts' },
      // TEMP HIDDEN (user request): { href: '/portfolio', labelKey: 'nav_portfolio' },
    ],
  },
  {
    id: 'market',
    titleKey: 'app_shell_section_market_radar',
    items: [
      { href: '/releases', labelKey: 'nav_releases' },
      { href: '/release-notifications', labelKey: 'nav_release_notifications', badge: 'new' },
      { href: '/contract-finisher', labelKey: 'nav_contract_finisher' },
      { href: '/returnees', labelKey: 'nav_returnee' },
      // TEMP HIDDEN (user request): { href: '/shadow-teams', labelKey: 'nav_shadow_teams' },
    ],
  },
  {
    id: 'intel',
    titleKey: 'app_shell_section_intelligence',
    items: [
      { href: '/war-room', labelKey: 'nav_war_room' },
      // TEMP HIDDEN (user request): { href: '/chat-room', labelKey: 'nav_chat_room', badge: 'chat' },
    ],
  },
];

const womenNavSections: NavSection[] = [
  {
    id: 'core',
    titleKey: 'app_shell_section_core_ops',
    items: [
      { href: '/dashboard', labelKey: 'nav_dashboard' },
      { href: '/tasks', labelKey: 'nav_tasks' },
      { href: '/players', labelKey: 'nav_players_women' },
      { href: '/shortlist', labelKey: 'nav_shortlist' },
      { href: '/requests', labelKey: 'nav_requests' },
      { href: '/contacts', labelKey: 'nav_contacts' },
      // TEMP HIDDEN (user request): { href: '/portfolio', labelKey: 'nav_portfolio' },
    ],
  },
];

const youthNavSections: NavSection[] = [
  {
    id: 'core',
    titleKey: 'app_shell_section_core_ops',
    items: [
      { href: '/dashboard', labelKey: 'nav_dashboard' },
      { href: '/tasks', labelKey: 'nav_tasks' },
      { href: '/players', labelKey: 'nav_players_youth' },
      { href: '/shortlist', labelKey: 'nav_shortlist' },
      { href: '/requests', labelKey: 'nav_requests' },
      { href: '/contacts', labelKey: 'nav_contacts' },
      // TEMP HIDDEN (user request): { href: '/portfolio', labelKey: 'nav_portfolio' },
    ],
  },
];

function isNavItemActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

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
  sections,
  platformSwitcher,
  chatUnreadCount,
}: {
  pathname: string;
  t: (k: string) => string;
  isRtl: boolean;
  setLang: () => void;
  user: { email?: string | null } | null;
  signOut: () => void;
  onNavClick?: () => void;
  platform: 'men' | 'women' | 'youth';
  sections: NavSection[];
  platformSwitcher: React.ReactNode;
  chatUnreadCount: number;
}) {
  const brandName = platform === 'youth' ? 'BRIT Sport Group Youth' : platform === 'women' ? 'BRIT Sport Group Women' : 'BRIT Sport Group';
  const logo = '/brit_circle_black_gold.svg';
  const accentClass = platform === 'youth' ? 'text-[var(--youth-cyan)]' : platform === 'women' ? 'text-[var(--women-rose)]' : 'text-[var(--mgsr-gold)]';
  const activeClass = platform === 'youth' ? 'bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)] border-[var(--youth-cyan)]/30' : platform === 'women' ? 'bg-[var(--women-rose)]/15 text-[var(--women-rose)] border-[var(--women-rose)]/30' : 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border-[var(--mgsr-gold)]/30';
  const platformLabel =
    platform === 'men'
      ? t('app_shell_platform_men')
      : platform === 'women'
        ? t('app_shell_platform_women')
        : t('app_shell_platform_youth');
  return (
    <>
      <Link
        href="/dashboard"
        onClick={onNavClick}
        className={`mx-4 mt-4 rounded-[22px] border border-white/8 bg-[linear-gradient(145deg,rgba(18,25,35,0.95),rgba(10,14,21,0.92))] p-4 flex items-center gap-3 ${platform === 'women' ? 'justify-end' : ''}`}
      >
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(200,169,104,0.25),transparent_70%)] blur-md" />
          <img src={logo} alt="BRIT Sport Group" className="relative w-12 h-12 shrink-0" />
        </div>
        <div className="min-w-0 flex h-12 items-center">
          <span className={`block truncate text-lg font-bold font-display ${accentClass}`} style={platform === 'men' ? { color: '#f5c874', textShadow: '0 0 18px rgba(245, 200, 116, 0.18)' } : undefined}>{brandName}</span>
        </div>
      </Link>
      <nav className="flex-1 px-4 pb-4 pt-5 space-y-5 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.id} className="space-y-2">
            <div className="px-3 text-[10px] uppercase tracking-[0.24em] text-mgsr-muted/80">{t(section.titleKey)}</div>
            <div className="space-y-1.5">
              {section.items.map((item) => {
                const isActive = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavClick}
                    className={`group block rounded-2xl border px-4 py-3 transition min-h-[48px] flex items-center justify-between ${
                      isActive
                        ? activeClass
                        : 'border-white/5 text-mgsr-muted hover:text-mgsr-text hover:border-white/10 hover:bg-white/[0.03]'
                    }`}
                  >
                    <span className="font-medium tracking-[0.01em]">{t(item.labelKey)}</span>
                    <div className="flex items-center gap-2">
                      {item.badge === 'new' && (
                        <span className="rounded-full border border-[var(--mgsr-gold)]/25 bg-[var(--mgsr-gold-dim)] px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-[var(--mgsr-gold)]">
                          {t('app_shell_badge_new')}
                        </span>
                      )}
                      {item.badge === 'chat' && chatUnreadCount > 0 && (
                        <span
                          className="flex items-center justify-center text-[10px] font-bold leading-none"
                          style={{
                            minWidth: 20,
                            height: 20,
                            padding: '0 6px',
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, var(--mgsr-teal), var(--mgsr-gold))',
                            color: '#0a0d13',
                            boxShadow: '0 0 18px rgba(85, 231, 214, 0.3)',
                            animation: 'chat-unread-pop 0.3s ease-out',
                          }}
                        >
                          {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-4 mt-0 rounded-[22px] border border-white/8 bg-white/[0.03] p-4 space-y-3 shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-mgsr-muted">{t('app_shell_workspace_label')}</div>
          <div className="mt-1 text-sm font-semibold text-mgsr-text">{platformLabel}</div>
        </div>
        {platformSwitcher}
        <button
          onClick={() => {
            setLang();
            onNavClick?.();
          }}
          className="w-full rounded-2xl border border-white/8 bg-black/10 px-4 py-3 text-sm text-mgsr-muted hover:text-[var(--mgsr-gold)] transition min-h-[44px] flex items-center justify-center"
        >
          {isRtl ? 'English' : 'עברית'}
        </button>
        <p className="text-sm text-mgsr-muted truncate px-1">{user?.email}</p>
        <button
          onClick={() => {
            signOut();
            onNavClick?.();
          }}
          className="w-full rounded-2xl border border-[var(--mgsr-gold)]/15 bg-[var(--mgsr-gold-dim)] px-4 py-3 text-sm text-[var(--mgsr-gold)] hover:underline min-h-[44px] flex items-center justify-center"
        >
          {t('sign_out')}
        </button>
      </div>
    </>
  );
}

const WOMEN_ALLOWED_PATHS = ['/dashboard', '/tasks', '/players', '/players/add', '/portfolio', '/shortlist', '/contacts', '/requests' /* , '/jewish-finder' — DISABLED */];
function isWomenAllowedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/dashboard' || pathname === '/tasks') return true;
  if (pathname === '/players' || pathname === '/players/add') return true;
  if (pathname === '/portfolio') return true;
  if (pathname === '/shortlist' || pathname === '/contacts' || pathname === '/requests') return true;
  // DISABLED — Vercel cost optimization (May 2026)
  // if (pathname === '/jewish-finder') return true;
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
  const currentSections = platform === 'youth' ? youthNavSections : platform === 'women' ? womenNavSections : navSections;
  const chatUnreadCount = useChatUnread();

  /* ═══════════════════════════════════════════════════════════
   *  MOBILE / TABLET layout (< 1024px)
   *  — MobileHeader (top) + content + MobileBottomTabBar (bottom)
   *  — No sidebar, no hamburger
   * ═══════════════════════════════════════════════════════════ */
  if (isMobileOrTablet) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen min-h-[100dvh] bg-mgsr-dark flex flex-col app-shell-bg">
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
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-mgsr-dark flex min-h-[100dvh] app-shell-bg">
      <aside
        className={`
          w-[320px] bg-[rgba(9,12,18,0.82)] backdrop-blur-2xl flex flex-col shrink-0 static inset-y-0
          ${isRtl ? 'border-l' : 'border-r'} border-white/6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]
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
          sections={currentSections}
          platformSwitcher={<PlatformSwitcher variant="compact" />}
          chatUnreadCount={chatUnreadCount}
        />
      </aside>

      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-6 xl:p-8">
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <NotificationPrompt />
    </div>
  );
}
