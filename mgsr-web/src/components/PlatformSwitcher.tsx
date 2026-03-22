'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePlatform } from '@/contexts/PlatformContext';

const btnGrouped =
  'px-4 py-2 rounded-lg text-mgsr-muted hover:text-mgsr-teal transition text-sm font-medium flex items-center justify-center gap-1.5';

export function PlatformSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' | 'grouped' }) {
  const { platform, setPlatform } = usePlatform();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Calculate dropdown position from the trigger button
  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropdownWidth = 160;
    // Ensure dropdown doesn't overflow off-screen
    let left = rect.right - dropdownWidth;
    if (left < 8) left = 8;
    if (left + dropdownWidth > window.innerWidth - 8) left = window.innerWidth - dropdownWidth - 8;
    setPos({
      top: rect.bottom + 4,
      left,
      width: dropdownWidth,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    // Reposition on scroll / resize
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const isCompact = variant === 'compact';
  const isGrouped = variant === 'grouped';
  const buttonClass = isCompact
    ? 'flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-sm font-medium text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/80 transition-colors min-h-[44px]'
    : isGrouped
      ? btnGrouped
      : 'px-4 py-2 rounded-lg border border-mgsr-border bg-mgsr-card text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition text-sm font-medium flex items-center justify-center gap-1.5';

  const dropdown = open && pos ? (
    <div
      ref={dropdownRef}
      className="fixed py-1.5 min-w-[160px] rounded-xl bg-mgsr-card border border-mgsr-border shadow-xl"
      style={{ top: pos.top, left: pos.left, zIndex: 99999 }}
    >
      <Link
        href="/dashboard"
        onClick={() => {
          setPlatform('men');
          setOpen(false);
        }}
        className={`block px-4 py-3 text-sm transition ${
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
        className={`block px-4 py-3 text-sm transition ${
          platform === 'women'
            ? 'text-[var(--women-rose)] font-medium bg-[var(--women-rose)]/10'
            : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/60'
        }`}
      >
        MGSR Women
      </Link>
      <Link
        href="/dashboard"
        onClick={() => {
          setPlatform('youth');
          setOpen(false);
        }}
        className={`block px-4 py-3 text-sm transition ${
          platform === 'youth'
            ? 'text-[var(--youth-cyan)] font-medium bg-[var(--youth-cyan)]/10'
            : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/60'
        }`}
      >
        MGSR Youth
      </Link>
    </div>
  ) : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={buttonClass}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className={platform === 'youth' ? 'text-[var(--youth-cyan)]' : platform === 'men' ? 'text-[var(--mgsr-accent)]' : 'text-[var(--women-rose)]'}>
          {platform === 'youth' ? 'MGSR Youth' : platform === 'men' ? 'MGSR Team' : 'MGSR Women'}
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
      {typeof document !== 'undefined' && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
