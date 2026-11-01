'use client';

import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarWorkspace from '@/components/transfer-radar/RadarWorkspace';

export default function TransferRadarPage() {
  return (
    <TransferRadarShell active="transfer-radar">
      <RadarWorkspace />
    </TransferRadarShell>
  );
}
