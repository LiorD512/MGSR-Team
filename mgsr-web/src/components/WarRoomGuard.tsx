'use client';

/**
 * Auth + platform guard for War Room pages.
 *
 * War Room is men-only. Unauthenticated → /login. Women/youth → /dashboard.
 * While loading or redirecting, shows BritLoader full-page.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatform } from '@/contexts/PlatformContext';
import BritLoader from '@/components/BritLoader';

interface WarRoomGuardProps {
  children: React.ReactNode;
}

export default function WarRoomGuard({ children }: WarRoomGuardProps) {
  const { user, loading } = useAuth();
  const { platform } = usePlatform();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (platform === 'women' || platform === 'youth') router.replace('/dashboard');
  }, [platform, router]);

  if (loading || !user) return <BritLoader fullPage />;
  if (platform !== 'men') return <BritLoader fullPage />;

  return <>{children}</>;
}
