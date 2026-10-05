'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AiScoutRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/war-room/ai-scout');
  }, [router]);
  return (
    <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
      <div className="animate-pulse text-[var(--mgsr-gold)] font-display">Redirecting...</div>
    </div>
  );
}
