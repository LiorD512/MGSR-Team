'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const navItems = [
  { href: '/dashboard', labelKey: 'nav_dashboard' },
  { href: '/tasks', labelKey: 'nav_tasks' },
  { href: '/players', labelKey: 'nav_players' },
  { href: '/players/add', labelKey: 'nav_add_player' },
  { href: '/shortlist', labelKey: 'nav_shortlist' },
  { href: '/contacts', labelKey: 'nav_contacts' },
  { href: '/releases', labelKey: 'nav_releases' },
  { href: '/requests', labelKey: 'nav_requests' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { t, isRtl, setLang } = useLanguage();

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-mgsr-dark flex">
      <aside className={`w-56 bg-mgsr-card flex flex-col ${isRtl ? 'border-l border-mgsr-border' : 'border-r border-mgsr-border'}`}>
        <div className="p-4 border-b border-mgsr-border">
          <h1 className="text-xl font-bold text-mgsr-teal font-display">MGSR Team</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2 rounded-lg transition ${
                pathname === item.href
                  ? 'bg-mgsr-teal/20 text-mgsr-teal'
                  : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-card/80'
              }`}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-mgsr-border space-y-2">
          <button
            onClick={() => setLang(isRtl ? 'en' : 'he')}
            className="text-sm text-mgsr-muted hover:text-mgsr-teal transition"
          >
            {isRtl ? 'English' : 'עברית'}
          </button>
          <p className="text-sm text-mgsr-muted truncate">{user?.email}</p>
          <button
            onClick={() => signOut()}
            className="block text-sm text-mgsr-teal hover:underline"
          >
            {t('sign_out')}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
