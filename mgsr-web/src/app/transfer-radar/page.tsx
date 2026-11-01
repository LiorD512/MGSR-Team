'use client';

import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarDashboard from '@/components/transfer-radar/RadarDashboard';

export default function TransferRadarPage() {
  return (
    <TransferRadarShell active="transfer-radar">
      <RadarDashboard />
    </TransferRadarShell>
  );
}
