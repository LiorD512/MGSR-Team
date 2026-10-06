'use client';

/**
 * War Room → Ask (AI Search) page.
 */

import WarRoomGuard from '@/components/WarRoomGuard';
import WarRoomShell from '@/components/WarRoomShell';
import WarRoomAsk from '@/components/war-room/WarRoomAsk';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AskPage() {
  const { t } = useLanguage();
  return (
    <WarRoomGuard>
      <WarRoomShell active="war-room-ask" crumb={t('nav_war_room_ask')}>
        <WarRoomAsk />
      </WarRoomShell>
    </WarRoomGuard>
  );
}
