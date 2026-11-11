import { useCallback, useEffect } from 'react';

/**
 * Remember the window scroll position when the user leaves for a detail page, and put them back there on return.
 * Call the returned `save()` right before navigating (e.g. in a link's onClick). The saved position is consumed once
 * `ready` turns true (content rendered), so a fresh visit to the screen still starts at the top.
 */
export function useScrollRestore(key: string, ready: boolean) {
  const storageKey = `scroll:${key}`;
  const save = useCallback(() => {
    try { sessionStorage.setItem(storageKey, String(Math.round(window.scrollY))); } catch { /* storage unavailable */ }
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    let y: number;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw == null) return;
      sessionStorage.removeItem(storageKey);
      y = parseInt(raw, 10);
    } catch { return; }
    if (!Number.isFinite(y) || y <= 0) return;
    // wait for the grid to lay out before jumping
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [ready, storageKey]);

  return save;
}
