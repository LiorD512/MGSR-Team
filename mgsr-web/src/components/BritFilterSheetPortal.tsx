'use client';

/**
 * BritFilterSheetPortal — renders the men "Light Management Room" filter tray
 * either inline (desktop) or as a viewport-anchored bottom sheet (mobile).
 *
 * WHY THIS EXISTS
 * The men screens live inside the `.brit-room` shell, which is
 * `position: fixed; inset: 0; overflow-y: auto` — i.e. a *scrollable, positioned*
 * container. Per the CSS containing-block rules, that makes `.brit-room` the
 * containing block for ANY `position: fixed` descendant. So the filter tray's
 * mobile sheet styles (`position: fixed; bottom: 0`) anchored to the bottom of
 * the room's full scroll height, not the viewport. Once the user scrolled the
 * roster even slightly, the sheet rendered hundreds of pixels below the fold and
 * was effectively invisible — the "filters screen not showing" bug.
 *
 * THE FIX
 * On mobile, portal the sheet (scrim + tray) to <body>, wrapped in a
 * `position: static` `.brit-room` scope so the scoped `.brit-room .brit-*`
 * styles still match while the fixed positioning now resolves against the real
 * viewport. On desktop the tray stays inline in normal flow (unchanged).
 *
 * `active` MUST mirror the CSS breakpoint used by the sheet styles
 * (`max-width: 900px`) so the DOM location and the styling never disagree.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** True on mobile (viewport ≤900px) — portal to <body>; false → render inline. */
  active: boolean;
  /** RTL flag so the portaled scope matches the room's direction. */
  isRtl: boolean;
  /** The scrim + <section className="brit-tray"> markup. */
  children: ReactNode;
}

export default function BritFilterSheetPortal({ active, isRtl, children }: Props) {
  // Guard SSR / first paint: createPortal needs document, which isn't available
  // during server render. Render inline until mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!active || !mounted || typeof document === 'undefined') {
    return <>{children}</>;
  }

  // A neutral `.brit-room` scope keeps the scoped selectors valid, but
  // `position: static` removes the containing-block trap so the sheet's
  // `position: fixed` anchors to the viewport.
  return createPortal(
    <div
      className="brit-room"
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={isRtl ? 'he' : 'en'}
      style={{ position: 'static', inset: 'auto', overflow: 'visible', zIndex: 'auto', background: 'none' }}
    >
      {children}
    </div>,
    document.body,
  );
}
