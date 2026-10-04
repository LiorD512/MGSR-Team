'use client';

/**
 * Global player search overlay for the dashboard header.
 *
 * Opens from the header "Search" action. Types a name and searches across the
 * two player sources — Roster (OUR players) and Shortlist (tracked targets) —
 * showing each result with a source badge. Selecting a result navigates to the
 * relevant screen with that player highlighted for a few seconds:
 *   • Roster    → /players?highlight=<playerId>
 *   • Shortlist → /shortlist?highlight=<tmProfileUrl>
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

export interface RosterSearchItem {
  id: string;
  fullName?: string;
  profileImage?: string;
  currentClub?: { clubName?: string };
  positions?: string[];
}

export interface ShortlistSearchItem {
  tmProfileUrl: string;
  playerName?: string;
  playerImage?: string;
  clubName?: string;
  positions?: string[];
}

interface SearchResult {
  key: string;
  source: 'roster' | 'shortlist';
  name: string;
  club: string;
  position: string;
  image?: string;
  href: string;
}

interface Props {
  roster: RosterSearchItem[];
  shortlist: ShortlistSearchItem[];
  onClose: () => void;
}

function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const MAX_RESULTS = 8;

export default function GlobalPlayerSearch({ roster, shortlist, onClose }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const results = useMemo<SearchResult[]>(() => {
    const q = normalize(query);
    if (q.length < 2) return [];

    const rosterHits: SearchResult[] = roster
      .filter((p) => normalize(p.fullName || '').includes(q) || normalize(p.currentClub?.clubName || '').includes(q))
      .map((p) => ({
        key: `roster:${p.id}`,
        source: 'roster' as const,
        name: p.fullName || '—',
        club: p.currentClub?.clubName || '—',
        position: (p.positions || []).filter(Boolean).slice(0, 2).join(' / ') || '—',
        image: p.profileImage,
        href: `/players?highlight=${encodeURIComponent(p.id)}`,
      }));

    const shortlistHits: SearchResult[] = shortlist
      .filter((p) => normalize(p.playerName || '').includes(q) || normalize(p.clubName || '').includes(q))
      .map((p) => ({
        key: `shortlist:${p.tmProfileUrl}`,
        source: 'shortlist' as const,
        name: p.playerName || '—',
        club: p.clubName || '—',
        position: (p.positions || []).filter(Boolean).slice(0, 2).join(' / ') || '—',
        image: p.playerImage,
        href: `/shortlist?highlight=${encodeURIComponent(p.tmProfileUrl)}`,
      }));

    // Prefix matches (name starts with query) rank first, then the rest.
    const scored = [...rosterHits, ...shortlistHits].sort((a, b) => {
      const aStarts = normalize(a.name).startsWith(q) ? 0 : 1;
      const bStarts = normalize(b.name).startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });
    return scored.slice(0, MAX_RESULTS);
  }, [query, roster, shortlist]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = (r: SearchResult | undefined) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[activeIndex]);
    }
  };

  return (
    <div
      className="brit-gsearch-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('gsearch_title')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="brit-gsearch">
        <div className="brit-gsearch-field">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('gsearch_placeholder')}
            aria-label={t('gsearch_placeholder')}
          />
          <button type="button" className="brit-gsearch-esc" onClick={onClose} aria-label={t('room_close')}>
            ESC
          </button>
        </div>

        {query.trim().length >= 2 && (
          <div className="brit-gsearch-results" role="listbox">
            {results.length === 0 ? (
              <div className="brit-gsearch-empty">{t('gsearch_no_results')}</div>
            ) : (
              results.map((r, i) => (
                <button
                  type="button"
                  key={r.key}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`brit-gsearch-row${i === activeIndex ? ' active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(r)}
                >
                  <span className="brit-gsearch-avatar">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="" loading="lazy" onError={(e) => ((e.currentTarget as HTMLElement).style.display = 'none')} />
                    ) : (
                      <span className="brit-gsearch-initials">
                        {(r.name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="brit-gsearch-info">
                    <strong>{r.name}</strong>
                    <small>
                      {r.club}
                      {r.position !== '—' ? ` · ${r.position}` : ''}
                    </small>
                  </span>
                  <span className={`brit-gsearch-badge ${r.source}`}>
                    {r.source === 'roster' ? t('gsearch_source_roster') : t('gsearch_source_shortlist')}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {query.trim().length < 2 && (
          <div className="brit-gsearch-hint">{t('gsearch_hint')}</div>
        )}
      </div>
    </div>
  );
}
