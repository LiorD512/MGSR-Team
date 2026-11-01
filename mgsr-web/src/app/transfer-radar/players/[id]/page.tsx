'use client';

import { useParams } from 'next/navigation';
import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarProfile from '@/components/transfer-radar/RadarProfile';

export default function TransferRadarPlayerPage() {
  const params = useParams<{ id: string }>();
  return (
    <TransferRadarShell active="transfer-radar">
      <RadarProfile id={String(params.id)} />
    </TransferRadarShell>
  );
}
