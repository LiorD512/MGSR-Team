import { redirect } from 'next/navigation';

/**
 * War Room → Scout Agents is DROPPED FOR NOW (per product decision).
 *
 * The screen and its component (`WarRoomScoutAgents`) are intentionally not
 * rendered. Visiting this route redirects to the Alpha Board so no stale/empty
 * screen is reachable. The underlying scout-agent worker is also disabled
 * (see functions/index.js). To re-enable, restore the implementation below and
 * un-comment the nav link in BritRail.tsx + the schedulers in functions/index.js.
 */
export default function ScoutAgentsPage() {
  redirect('/war-room/alpha-board');
}

/* ──────────────────────────────────────────────────────────────────────────
   ORIGINAL IMPLEMENTATION (preserved for easy restore)

import WarRoomGuard from '@/components/WarRoomGuard';
import WarRoomShell from '@/components/WarRoomShell';
import WarRoomScoutAgents from '@/components/war-room/WarRoomScoutAgents';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ScoutAgentsPage() {
  const { t } = useLanguage();
  return (
    <WarRoomGuard>
      <WarRoomShell active="war-room-agents" crumb={t('nav_war_room_agents')}>
        <WarRoomScoutAgents />
      </WarRoomShell>
    </WarRoomGuard>
  );
}
   ────────────────────────────────────────────────────────────────────────── */
