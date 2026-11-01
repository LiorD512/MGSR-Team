'use client';

import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarSources from '@/components/transfer-radar/RadarSources';

export default function TransferRadarSourcesPage() {
  return (
    <TransferRadarShell active="transfer-radar-sources">
      <RadarSources />
    </TransferRadarShell>
  );
}
