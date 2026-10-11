'use client';

/**
 * useBackDismiss — makes the hardware/browser Back button (esp. Android) close
 * an open overlay (drawer, bottom sheet, modal) instead of navigating the page.
 *
 * Problem: an overlay toggled purely by React state adds no history entry, so
 * pressing Android's back button navigates away (e.g. back to the dashboard)
 * rather than closing the overlay.
 *
 * Fix: when the overlay opens, push a throwaway history entry. A back press
 * then fires `popstate` (consuming that entry) — we intercept it and call
 * `onClose()`, so the page stays put and the overlay just closes. When the
 * overlay is closed by other means (close button, backdrop, save), we pop our
 * own entry back off so the history stack stays balanced and a later back press
 * behaves normally.
 *
 * Usage:
 *   useBackDismiss(open, onClose);
 */

import { useEffect, useRef } from 'react';

export function useBackDismiss(active: boolean, onClose: () => void): void {
  // Keep the latest onClose without re-running the effect each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // True while OUR sentinel history entry is on the stack.
  const pushedRef = useRef(false);
  // True while we are programmatically popping (so popstate doesn't re-close).
  const selfPoppingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (active) {
      // Push a sentinel entry so the next Back press targets it, not the page.
      if (!pushedRef.current) {
        window.history.pushState({ __backDismiss: true }, '');
        pushedRef.current = true;
      }

      const onPop = () => {
        // The sentinel was consumed by the back press → close the overlay.
        pushedRef.current = false;
        if (selfPoppingRef.current) {
          selfPoppingRef.current = false;
          return; // our own history.back(), don't double-close
        }
        onCloseRef.current();
      };

      window.addEventListener('popstate', onPop);
      return () => {
        window.removeEventListener('popstate', onPop);
        // Overlay was closed by other means (× / backdrop / save / unmount)
        // while our sentinel is still current → remove it to keep history tidy.
        if (pushedRef.current) {
          pushedRef.current = false;
          selfPoppingRef.current = true;
          window.history.back();
        }
      };
    }
    return undefined;
  }, [active]);
}
