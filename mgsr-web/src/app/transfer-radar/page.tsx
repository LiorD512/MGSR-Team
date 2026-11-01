'use client';

import { Suspense } from 'react';
import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarFeed from '@/components/transfer-radar/RadarFeed';

export default function TransferRadarPage() {
  return (
    <TransferRadarShell active="transfer-radar">
      <Suspense><RadarFeed /></Suspense>
    </TransferRadarShell>
  );
}
