'use client';

import { useParams } from 'next/navigation';
import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarWorkspace from '@/components/transfer-radar/RadarWorkspace';

/** Deep link: the same workspace with the player pre-selected (old /players/<id> links keep working). */
export default function TransferRadarPlayerPage() {
  const params = useParams<{ id: string }>();
  return (
    <TransferRadarShell active="transfer-radar">
      <RadarWorkspace initialId={String(params.id)} />
    </TransferRadarShell>
  );
}
