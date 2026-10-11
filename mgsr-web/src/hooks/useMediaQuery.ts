'use client';

import { useState, useEffect, useCallback } from 'react';

export type DeviceType = 'phone' | 'tablet' | 'desktop';

/**
 * Returns 'phone' | 'tablet' | 'desktop' based on viewport width.
 * Phone: ≤767px, Tablet: 768-1023px, Desktop: ≥1024px
 * Aligns with Tailwind's md (768) and lg (1024) breakpoints.
 */
export function useDeviceType(): DeviceType {
  const [device, setDevice] = useState<DeviceType>('desktop'); // SSR default

  useEffect(() => {
    const mqPhone = window.matchMedia('(max-width: 767px)');
    const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');

    const update = () => {
      if (mqPhone.matches) setDevice('phone');
      else if (mqTablet.matches) setDevice('tablet');
      else setDevice('desktop');
    };

    update();
    mqPhone.addEventListener('change', update);
    mqTablet.addEventListener('change', update);
    return () => {
      mqPhone.removeEventListener('change', update);
      mqTablet.removeEventListener('change', update);
    };
  }, []);

  return device;
}

/**
 * Generic media-query hook. Returns true when the given CSS media query
 * currently matches. SSR-safe (defaults to false until mounted).
 *
 * Use this when a component needs to mirror a specific CSS breakpoint exactly
 * (e.g. the men "Light Management Room" filter sheet uses `max-width: 900px`,
 * which does not line up with the phone/tablet/desktop buckets above).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false); // SSR default

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/**
 * Backward-compatible: returns true when viewport < 768px.
 */
export function useIsMobile(): boolean {
  const device = useDeviceType();
  return device === 'phone';
}

/**
 * Returns true for phone or tablet (< 1024px) — everything that should show
 * the mobile/tablet shell (bottom tab bar, mobile header, etc.)
 */
export function useIsMobileOrTablet(): boolean {
  const device = useDeviceType();
  return device === 'phone' || device === 'tablet';
}
