'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders overlays (player file drawer, filtered list, toast) at <body> level.
 * Same reason as BritFilterSheetPortal: inside the room, `.brit-canvas` keeps a transform from its entry animation and `.brit-room`
 * is a fixed scroll container, so `position: fixed` children would be sized/positioned against the canvas (gap on the right, opening
 * mid-page) instead of the viewport. A neutral `.brit-room` scope keeps the scoped styles and direction.
 */
export default function RadarPortal({ isRtl, children }: { isRtl: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}
      style={{ position: 'static', inset: 'auto', overflow: 'visible', zIndex: 'auto', background: 'none' }}>
      {children}
    </div>,
    document.body,
  );
}
