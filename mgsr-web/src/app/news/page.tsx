// TEMPORARILY DISABLED — Vercel cost optimization (May 2026)
// Original code preserved in page.original.tsx
// To re-enable: delete this file and rename page.original.tsx → page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';

export default function NewsPageDisabled() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/dashboard'), 2500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <AppLayout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-4xl">🔧</div>
        <h2 className="text-xl font-semibold text-white">News & Rumours — Under Maintenance</h2>
        <p className="text-white/50 text-sm max-w-md">
          This feature is temporarily disabled while we optimize performance.
          Redirecting to dashboard...
        </p>
      </div>
    </AppLayout>
  );
}
