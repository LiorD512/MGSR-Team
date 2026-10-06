'use client';

/**
 * /war-room → redirect to the default War Room screen (Alpha Board).
 *
 * The War Room is now a group of focused screens, each on its own route:
 *   /war-room/alpha-board   — ranked signable board (default)
 *   /war-room/scout-agents  — AI scout persona picks
 *   /war-room/ask           — natural-language search
 *   /war-room/successors    — "find the next…" signature search
 *
 * (The old multi-tab War Room incl. the Discovery feed has been retired.)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BritLoader from '@/components/BritLoader';

export default function WarRoomIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/war-room/alpha-board');
  }, [router]);

  return <BritLoader fullPage />;
}
