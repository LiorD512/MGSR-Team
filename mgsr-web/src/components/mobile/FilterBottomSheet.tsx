'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface FilterBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Reusable bottom-sheet for filter panels on mobile/tablet.
 * Renders children (filter controls) inside a slide-up sheet.
 * On desktop (lg+), renders nothing — filters stay inline.
 */
export default function FilterBottomSheet({ open, onClose, title, children }: FilterBottomSheetProps) {
  const { t } = useLanguage();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 inset-x-0 max-h-[80vh] bg-mgsr-card rounded-t-2xl border-t border-mgsr-border animate-slide-up flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-mgsr-border shrink-0">
          {/* Drag handle */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-mgsr-border" />

          <h3 className="text-base font-semibold text-mgsr-text mt-2">
            {title || t('filters') || 'Filters'}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-mgsr-dark/60 flex items-center justify-center text-mgsr-muted hover:text-mgsr-text transition mt-2"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter content — scrollable */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>

        {/* Apply button */}
        <div className="px-4 py-3 border-t border-mgsr-border shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-[var(--mgsr-accent)] text-mgsr-dark font-semibold text-sm hover:opacity-90 transition min-h-[44px]"
          >
            {t('apply') || 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
