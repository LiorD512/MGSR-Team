'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FindNextRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ai-scout?tab=find-next');
  }, [router]);
  return (
    <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
      <div className="animate-pulse text-mgsr-teal font-display">Redirecting...</div>
    </div>
  );
}
