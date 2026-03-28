'use client';

import { useEffect } from 'react';
import { appConfig } from '@/lib/appConfig';

/**
 * Invisible component that triggers remote-config loading on mount.
 * Place in the root layout alongside DirSync / PlatformSync.
 */
export default function AppConfigInit() {
  useEffect(() => {
    appConfig.initialize();
  }, []);
  return null;
}
