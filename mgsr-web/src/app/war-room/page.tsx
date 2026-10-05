'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WarRoomRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/war-room/discovery');
  }, [router]);
  return (
    <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
      <div className="animate-pulse text-[var(--mgsr-gold)] font-display">Redirecting...</div>
    </div>
  );
}
