'use client';

/**
 * BritContactPicker — a bottom-sheet picker for choosing a phone number from the
 * user's existing Contacts, used by the add-to-roster and edit-player flows so a
 * player/agent phone can be filled from contacts instead of typed by hand.
 *
 * Rendered as a viewport-anchored bottom sheet (portaled to <body> inside a
 * neutral `.brit-room` scope, mirroring BritFilterSheetPortal) so it works
 * inside the right-side add drawer and the player profile page alike without
 * being trapped by a scrollable/positioned ancestor.
 *
 * `kind` tunes defaults only:
 *   - 'agent'  → agency / agent-role contacts are grouped first
 *   - 'player' → there is no "player" contact type, so all contacts are shown
 * Either way the full contact list is searchable; only contacts that actually
 * have a phone number are selectable.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useContacts } from '@/hooks/useContacts';
import type { Contact } from '@/app/contacts/AddContactSheet';
import type { Platform } from '@/contexts/PlatformContext';

const AGENT_ROLES = new Set(['AGENT', 'INTERMEDIARY', 'AGENCY_DIRECTOR']);

function isAgencyContact(c: Contact): boolean {
  return c.contactType === 'AGENCY' || (!!c.role && AGENT_ROLES.has(c.role));
}

interface Props {
  open: boolean;
  kind: 'player' | 'agent';
  platform?: Platform;
  onClose: () => void;
  /** Called with the chosen contact's phone number. */
  onPick: (phoneNumber: string, contact: Contact) => void;
}

export default function BritContactPicker({ open, kind, platform = 'men', onClose, onPick }: Props) {
  const { t, isRtl } = useLanguage();
  const { contacts } = useContacts(platform);
  const [query, setQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  // Reset the search each time the sheet opens.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  // Only contacts with a usable phone number can be picked.
  const withPhone = useMemo(
    () => contacts.filter((c) => (c.phoneNumber || '').trim().length > 0),
    [contacts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? withPhone.filter(
          (c) =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phoneNumber || '').toLowerCase().includes(q) ||
            (c.clubName || '').toLowerCase().includes(q) ||
            (c.agencyName || '').toLowerCase().includes(q),
        )
      : withPhone;

    // For the agent field, surface agencies/agent-role contacts first.
    if (kind === 'agent') {
      const agencies = base.filter(isAgencyContact);
      const rest = base.filter((c) => !isAgencyContact(c));
      return { agencies, rest };
    }
    return { agencies: [] as Contact[], rest: base };
  }, [withPhone, query, kind]);

  if (!open || !mounted || typeof document === 'undefined') return null;

  const subtitle = (c: Contact) =>
    [c.agencyName || c.clubName, c.role ? c.role.replace(/_/g, ' ') : null].filter(Boolean).join(' · ');

  const row = (c: Contact) => (
    <button
      key={c.id}
      type="button"
      className="brit-cpick-row"
      onClick={() => {
        const num = (c.phoneNumber || '').trim();
        if (num) onPick(num, c);
        onClose();
      }}
    >
      <span className="nm">
        <b>{c.name || '—'}</b>
        {subtitle(c) && <small>{subtitle(c)}</small>}
      </span>
      <span className="ph" dir="ltr">{c.phoneNumber}</span>
    </button>
  );

  const hasAgencies = filtered.agencies.length > 0;
  const hasRest = filtered.rest.length > 0;
  const empty = !hasAgencies && !hasRest;

  const sheet = (
    <div
      className="brit-room"
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={isRtl ? 'he' : 'en'}
      style={{ position: 'static', inset: 'auto', overflow: 'visible', zIndex: 'auto', background: 'none' }}
    >
      <div className="brit-cpick-scrim open" onClick={onClose} aria-hidden />
      <section className="brit-cpick" role="dialog" aria-modal="true" aria-label={kind === 'agent' ? t('contact_pick_title_agent') : t('contact_pick_title_player')}>
        <div className="brit-cpick-head">
          <h3>{kind === 'agent' ? t('contact_pick_title_agent') : t('contact_pick_title_player')}</h3>
          <button type="button" onClick={onClose} aria-label={t('common_close') || 'Close'}>×</button>
        </div>
        <label className="brit-cpick-search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('contact_pick_search')}
            aria-label={t('contact_pick_search')}
          />
        </label>
        <div className="brit-cpick-list">
          {empty ? (
            <div className="brit-cpick-empty">
              {withPhone.length === 0 ? t('contact_pick_empty') : t('contact_pick_no_results')}
            </div>
          ) : (
            <>
              {hasAgencies && (
                <>
                  <div className="brit-cpick-group">{t('contact_pick_agencies_first')}</div>
                  {filtered.agencies.map(row)}
                </>
              )}
              {hasRest && (
                <>
                  {hasAgencies && <div className="brit-cpick-group">{t('contact_pick_all_contacts')}</div>}
                  {filtered.rest.map(row)}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(sheet, document.body);
}
