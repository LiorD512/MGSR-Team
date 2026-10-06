'use client';

/**
 * War Room → Scout Agents page.
 */

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
