'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePlatform } from '@/contexts/PlatformContext';

const btnGrouped =
  'px-4 py-2 rounded-lg text-mgsr-muted hover:text-mgsr-teal transition text-sm font-medium flex items-center justify-center gap-1.5';

export function PlatformSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' | 'grouped' }) {
  const { platform, setPlatform } = usePlatform();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isCompact = variant === 'compact';
  const isGrouped = variant === 'grouped';
  const buttonClass = isCompact
    ? 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/80 transition-colors'
    : isGrouped
      ? btnGrouped
      : 'px-4 py-2 rounded-lg border border-mgsr-border bg-mgsr-card text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition text-sm font-medium flex items-center justify-center gap-1.5';

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className={platform === 'men' ? 'text-[var(--mgsr-accent)]' : 'text-[var(--women-rose)]'}>
          {platform === 'men' ? 'MGSR Team' : 'MGSR Women'}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className={`absolute py-1 min-w-[160px] rounded-xl bg-mgsr-card border border-mgsr-border shadow-xl z-50 ${
            isCompact ? 'top-full right-0 mt-1' : 'top-full end-0 mt-1'
          }`}
        >
          <Link
            href="/dashboard"
            onClick={() => {
              setPlatform('men');
              setOpen(false);
            }}
            className={`block px-4 py-2.5 text-sm transition ${
              platform === 'men'
                ? 'text-[var(--mgsr-accent)] font-medium bg-mgsr-accent-dim/30'
                : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/60'
            }`}
          >
            MGSR Team
          </Link>
          <Link
            href="/dashboard"
            onClick={() => {
              setPlatform('women');
              setOpen(false);
            }}
            className={`block px-4 py-2.5 text-sm transition ${
              platform === 'women'
                ? 'text-[var(--women-rose)] font-medium bg-[var(--women-rose)]/10'
                : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/60'
            }`}
          >
            MGSR Women
          </Link>
        </div>
      )}
    </div>
  );
}
