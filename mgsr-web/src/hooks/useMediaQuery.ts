'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true when viewport is below the md breakpoint (768px).
 * Matches Tailwind's md: prefix.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mq.matches);
    handler(); // initial
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
