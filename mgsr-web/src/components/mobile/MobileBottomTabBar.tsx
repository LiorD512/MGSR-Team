'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlatform } from '@/contexts/PlatformContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useState } from 'react';
import { MoreSheet } from './MoreSheet';

/* ── Icon SVGs (inline, no icon library) ── */
function IconDashboard({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
    </svg>
  );
}
function IconPlayers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
function IconAIScout({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5m-4.75-11.396c.251.023.501.05.75.082M12 21a8.966 8.966 0 005.982-2.275M12 21a8.966 8.966 0 01-5.982-2.275M12 21V14.5" />
    </svg>
  );
}
function IconTasks({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}
function IconMore({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function IconPortfolio({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

/* ── Tab definitions per platform ── */
interface TabItem {
  href: string;
  labelKey: string;
  icon: (props: { className?: string }) => React.ReactNode;
  matchPrefixes?: string[]; // for matching sub-routes
}

const menTabs: TabItem[] = [
  { href: '/dashboard', labelKey: 'nav_dashboard', icon: IconDashboard },
  { href: '/players', labelKey: 'nav_players', icon: IconPlayers, matchPrefixes: ['/players'] },
  { href: '/ai-scout', labelKey: 'nav_ai_scout', icon: IconAIScout },
  { href: '/tasks', labelKey: 'nav_tasks', icon: IconTasks },
];

const womenTabs: TabItem[] = [
  { href: '/dashboard', labelKey: 'nav_dashboard', icon: IconDashboard },
  { href: '/players', labelKey: 'nav_players_women', icon: IconPlayers, matchPrefixes: ['/players'] },
  { href: '/tasks', labelKey: 'nav_tasks', icon: IconTasks },
  { href: '/portfolio', labelKey: 'nav_portfolio', icon: IconPortfolio },
];

/* ── The remaining nav items that go to the "More" sheet ── */
export const menMoreItems = [
  { href: '/shortlist', labelKey: 'nav_shortlist' },
  { href: '/shadow-teams', labelKey: 'nav_shadow_teams' },
  { href: '/releases', labelKey: 'nav_releases' },
  { href: '/contract-finisher', labelKey: 'nav_contract_finisher' },
  { href: '/returnees', labelKey: 'nav_returnee' },
  { href: '/war-room', labelKey: 'nav_war_room' },
  { href: '/portfolio', labelKey: 'nav_portfolio' },
  { href: '/contacts', labelKey: 'nav_contacts' },
  { href: '/requests', labelKey: 'nav_requests' },
];

function isTabActive(tab: TabItem, pathname: string): boolean {
  if (tab.href === pathname) return true;
  if (tab.matchPrefixes) {
    return tab.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  }
  return false;
}

function isMoreActive(pathname: string, platform: 'men' | 'women'): boolean {
  if (platform === 'women') return false;
  const tabHrefs = menTabs.map((t) => t.href);
  return !tabHrefs.some((href) => pathname === href || pathname.startsWith(href + '/'));
}

export default function MobileBottomTabBar() {
  const pathname = usePathname();
  const { platform } = usePlatform();
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = platform === 'women' ? womenTabs : menTabs;
  const showMore = platform === 'men';
  const moreActive = isMoreActive(pathname, platform);

  const accentColor = platform === 'women' ? 'var(--women-rose)' : 'var(--mgsr-accent)';

  return (
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-mgsr-card/95 backdrop-blur-md border-t border-mgsr-border lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch justify-around max-w-lg mx-auto">
          {tabs.map((tab) => {
            const active = isTabActive(tab, pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center justify-center py-2 px-1 min-w-[64px] min-h-[52px] transition-colors relative"
                style={{ color: active ? accentColor : 'var(--mgsr-muted)' }}
              >
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                    style={{ background: accentColor }}
                  />
                )}
                <tab.icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-medium leading-tight truncate max-w-[72px]">
                  {t(tab.labelKey)}
                </span>
              </Link>
            );
          })}

          {showMore && (
            <button
              onClick={() => setMoreOpen(true)}
              className="flex flex-col items-center justify-center py-2 px-1 min-w-[64px] min-h-[52px] transition-colors relative"
              style={{ color: moreActive ? accentColor : 'var(--mgsr-muted)' }}
            >
              {moreActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: accentColor }}
                />
              )}
              <IconMore className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-medium leading-tight">{t('nav_more') || 'More'}</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
    </>
  );
}
