'use client';

/**
 * /ai-scout → redirect to the new War Room "Ask" screen.
 *
 * The old standalone AI-Scout page (AppLayout dark design) has been retired.
 * Natural-language scouting now lives at /war-room/ask (BritRail light design),
 * and "find the next…" lives at /war-room/successors.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BritLoader from '@/components/BritLoader';

export default function AiScoutRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    // Preserve the old deep-link to the "find next" tab.
    const dest = params.get('tab') === 'find-next' ? '/war-room/successors' : '/war-room/ask';
    router.replace(dest);
  }, [router, params]);

  return <BritLoader fullPage />;
}
