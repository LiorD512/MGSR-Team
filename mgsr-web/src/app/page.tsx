'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace('/dashboard');
    else router.replace('/login');
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
      <div className="animate-pulse text-mgsr-teal">Loading...</div>
    </div>
  );
}
