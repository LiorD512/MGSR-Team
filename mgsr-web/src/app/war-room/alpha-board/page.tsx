'use client';

/**
 * War Room → Alpha Board page.
 *
 * War Room is men-only. The page wraps in <AppLayout> so the mobile shell and
 * women/youth platform guards keep working, but for the men platform it renders
 * the full-bleed <AlphaBoardMen/> component which supplies its own .brit-room
 * chrome (same approach MenShortlist uses). Women/youth are redirected to the
 * dashboard. Unauthenticated users are sent to /login.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatform } from '@/contexts/PlatformContext';
import AppLayout from '@/components/AppLayout';
import BritLoader from '@/components/BritLoader';
import AlphaBoardMen from '@/components/AlphaBoardMen';

export default function AlphaBoardPage() {
  const { user, loading } = useAuth();
  const { platform } = usePlatform();
  const router = useRouter();

  // Auth guard → /login
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // War Room is men-only — send women/youth back to the dashboard.
  useEffect(() => {
    if (platform === 'women' || platform === 'youth') router.replace('/dashboard');
  }, [platform, router]);

  if (loading || !user) return <BritLoader fullPage />;

  // Men: full-bleed board (replaces AppLayout's chrome, like MenShortlist).
  if (platform === 'men') {
    return <AlphaBoardMen />;
  }

  // Women / youth: show the loader while the redirect above kicks in.
  return (
    <AppLayout>
      <BritLoader fullPage />
    </AppLayout>
  );
}
