'use client';

import { useEffect } from 'react';
import { usePlatform } from '@/contexts/PlatformContext';

export default function PlatformSync() {
  const { platform } = usePlatform();

  useEffect(() => {
    document.body.setAttribute('data-platform', platform);
  }, [platform]);

  return null;
}
