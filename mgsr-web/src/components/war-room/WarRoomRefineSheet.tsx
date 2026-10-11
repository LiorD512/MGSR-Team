'use client';

/**
 * WarRoomRefineSheet — keeps the War Room search screens (Ask, Successors)
 * short on mobile by moving the secondary search parameters out of the main
 * console into an on-demand bottom sheet.
 *
 * - Desktop (> 700px): renders `children` inline, exactly where they sat before
 *   (the inline filter rows are unchanged).
 * - Mobile (≤ 700px): renders a compact "Refine" summary bar; tapping it opens a
 *   viewport-anchored bottom sheet (portaled to <body> so its fixed positioning
 *   escapes the scrollable `.brit-room` shell) containing the same `children`,
 *   plus a sticky Reset / Apply footer.
 *
 * The parent owns all the actual param state; this component is purely the
 * mobile presentation wrapper, so a screen passes its real controls once.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  /** Sheet + summary-bar heading, e.g. "Refine search". */
  title: string;
  /** One-line summary of current params shown in the trigger bar (mobile). */
  summary: string;
  /** The real param controls (chip rows, selects, sliders, examples…). */
  children: ReactNode;
  /** Optional: reset handler → shows a Reset button in the sheet footer. */
  onReset?: () => void;
  /** Labels (localised by the parent via its own t()); sensible EN fallbacks. */
  resetLabel?: string;
  applyLabel?: string;
}

export default function WarRoomRefineSheet({
  title,
  summary,
  children,
  onReset,
  resetLabel,
  applyLabel,
}: Props) {
  const { isRtl } = useLanguage();
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(max-width: 700px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Desktop (or pre-hydration): keep the params inline, unchanged.
  if (!mounted || !isMobile) return <>{children}</>;

  const sheet = (
    <div
      className="brit-room wr-refine-portal"
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={isRtl ? 'he' : 'en'}
      style={{ position: 'static', inset: 'auto', overflow: 'visible', zIndex: 'auto', background: 'none' }}
    >
      <div className={`wr-rf-scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden />
      <section className={`wr-rf-sheet${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="wr-rf-head">
          <h3>{title}</h3>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>
        <div className="wr-rf-body">{children}</div>
        <div className="wr-rf-foot">
          {onReset && (
            <button type="button" className="reset" onClick={onReset}>{resetLabel || 'Reset'}</button>
          )}
          <button type="button" className="apply" onClick={() => setOpen(false)}>{applyLabel || 'Done'}</button>
        </div>
      </section>
    </div>
  );

  return (
    <>
      <button type="button" className="wr-refine-bar" onClick={() => setOpen(true)} aria-expanded={open}>
        <span className="l">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 4h18M6 12h12M10 20h4" />
          </svg>
          <span className="sum">
            <b>{title}</b>
            <small>{summary}</small>
          </span>
        </span>
        <span className="chev" aria-hidden>{isRtl ? '‹' : '›'}</span>
      </button>
      {mounted && typeof document !== 'undefined' ? createPortal(sheet, document.body) : null}
    </>
  );
}
