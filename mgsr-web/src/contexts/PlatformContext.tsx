'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type Platform = 'men' | 'women';

interface PlatformContextValue {
  platform: Platform;
  setPlatform: (p: Platform) => void;
  isWomen: boolean;
  isMen: boolean;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

const STORAGE_KEY = 'mgsr-platform';

function getStoredPlatform(): Platform {
  if (typeof window === 'undefined') return 'men';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'women' || stored === 'men') return stored;
  } catch {
    /* ignore */
  }
  return 'men';
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [platform, setPlatformState] = useState<Platform>(getStoredPlatform);

  const setPlatform = useCallback((p: Platform) => {
    setPlatformState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      platform,
      setPlatform,
      isWomen: platform === 'women',
      isMen: platform === 'men',
    }),
    [platform, setPlatform]
  );

  return (
    <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
  );
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform must be used within PlatformProvider');
  }
  return ctx;
}
