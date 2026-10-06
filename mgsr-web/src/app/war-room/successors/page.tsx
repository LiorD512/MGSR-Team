'use client';

/**
 * War Room → Successors (Find the Next…)
 *
 * Wraps the existing FindNextTab inside the Brit room shell.
 */

import WarRoomGuard from '@/components/WarRoomGuard';
import WarRoomShell from '@/components/WarRoomShell';
import FindNextTab from '@/components/FindNextTab';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SuccessorsPage() {
  const { t } = useLanguage();

  return (
    <WarRoomGuard>
      <WarRoomShell active="war-room-successors" crumb={t('nav_war_room_successors')}>
        <FindNextTab />
      </WarRoomShell>
    </WarRoomGuard>
  );
}
