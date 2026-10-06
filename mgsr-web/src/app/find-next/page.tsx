'use client';

/**
 * /find-next → redirect to the new War Room "Successors" screen.
 * (Old target was /ai-scout?tab=find-next, part of the retired dark design.)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BritLoader from '@/components/BritLoader';

export default function FindNextRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/war-room/successors');
  }, [router]);
  return <BritLoader fullPage />;
}
