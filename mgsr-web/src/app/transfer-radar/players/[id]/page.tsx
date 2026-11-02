'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import TransferRadarShell from '@/components/transfer-radar/TransferRadarShell';
import RadarFeed from '@/components/transfer-radar/RadarFeed';

/** Deep link: the radar with this player's file open (old /transfer-radar/players/<id> links keep working). */
export default function TransferRadarPlayerPage() {
  const params = useParams<{ id: string }>();
  return (
    <TransferRadarShell active="transfer-radar">
      <Suspense><RadarFeed initialId={String(params.id)} /></Suspense>
    </TransferRadarShell>
  );
}
