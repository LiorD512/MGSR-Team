'use client';

/**
 * Manage shared request links — "Light Management Room" version of the old
 * ManageSharedLinksDialog. Lists every link the agent created (recipient, date,
 * platform, clubs shown/hidden, countries, views) with Copy and Revoke.
 */

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

interface SharedLinkItem {
  token: string;
  platform: string;
  showClubs: boolean;
  recipientLabel: string | null;
  allowedCountries?: string[];
  createdAt: number;
  revoked: boolean;
  revokedAt: number | null;
  viewCount: number;
  lastViewedAt: number | null;
}

function getShareBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export default function MenManageSharedLinks({
  user,
  isRtl,
  onClose,
}: {
  user: User | null;
  isRtl: boolean;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<SharedLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/shared-requests/list', { headers: { Authorization: `Bearer ${idToken}` } });
      if (!res.ok) throw new Error('Failed');
      const { links: data } = await res.json();
      setLinks(data || []);
    } catch (e) {
      console.error('Failed to fetch shared links:', e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (token: string) => {
    if (!user) return;
    setRevoking(token);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/shared-requests/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setLinks((prev) => prev.map((l) => (l.token === token ? { ...l, revoked: true, revokedAt: Date.now() } : l)));
      }
    } catch (e) {
      console.error('Revoke failed:', e);
    } finally {
      setRevoking(null);
      setConfirming(null);
    }
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${getShareBaseUrl()}/shared/requests/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const platformLabel = (p: string) =>
    ({ men: isRtl ? 'גברים' : 'Men', women: isRtl ? 'נשים' : 'Women', youth: isRtl ? 'נוער' : 'Youth' } as Record<string, string>)[p] || p;

  const active = links.filter((l) => !l.revoked);
  const revoked = links.filter((l) => l.revoked);

  const renderLink = (l: SharedLinkItem) => {
    const countries = l.allowedCountries ?? [];
    return (
      <div key={l.token} className={`brit-links-item${l.revoked ? ' revoked' : ''}`}>
        <div className="top">
          <div className="who">
            <strong>{l.recipientLabel || (isRtl ? 'ללא שם' : 'Unnamed recipient')}</strong>
            <span>{fmt(l.createdAt)}</span>
          </div>
          <span className={`state ${l.revoked ? 'off' : 'on'}`}>
            {l.revoked ? (isRtl ? 'בוטל' : 'Revoked') : (isRtl ? 'פעיל' : 'Active')}
          </span>
        </div>
        <div className="tags">
          <i>{platformLabel(l.platform)}</i>
          <i>{l.showClubs ? (isRtl ? 'עם מועדונים' : 'Clubs shown') : (isRtl ? 'מועדונים מוסתרים' : 'Clubs hidden')}</i>
          <i>
            {countries.length === 0
              ? (isRtl ? 'כל המדינות' : 'All countries')
              : countries.length <= 2
                ? countries.join(', ')
                : `${countries.length} ${isRtl ? 'מדינות' : 'countries'}`}
          </i>
          <i>{l.viewCount} {isRtl ? 'צפיות' : 'views'}</i>
        </div>
        {!l.revoked && (
          <div className="ops">
            <button onClick={() => copy(l.token)}>
              {copied === l.token ? `✓ ${isRtl ? 'הועתק' : 'Copied'}` : (isRtl ? 'העתק קישור' : 'Copy link')}
            </button>
            {confirming === l.token ? (
              <>
                <button className="danger" disabled={revoking === l.token} onClick={() => revoke(l.token)}>
                  {revoking === l.token ? '…' : (isRtl ? 'אשר ביטול' : 'Confirm revoke')}
                </button>
                <button onClick={() => setConfirming(null)}>{isRtl ? 'ביטול' : 'Cancel'}</button>
              </>
            ) : (
              <button className="del" onClick={() => setConfirming(l.token)}>{isRtl ? 'בטל גישה' : 'Revoke'}</button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="brit-sl-modal-scrim" onClick={onClose}>
      <div className="brit-sl-modal brit-links-modal" onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="brit-sl-modal-head">
          <h3>{isRtl ? 'ניהול קישורים משותפים' : 'Manage shared links'}</h3>
          <button onClick={onClose} aria-label={isRtl ? 'סגור' : 'Close'}>×</button>
        </div>

        {loading ? (
          <div className="brit-links-empty">{isRtl ? 'טוען…' : 'Loading…'}</div>
        ) : failed ? (
          <div className="brit-links-empty">{isRtl ? 'לא ניתן לטעון את הקישורים' : 'Could not load your links'}</div>
        ) : links.length === 0 ? (
          <div className="brit-links-empty">{isRtl ? 'עוד לא שיתפת קישורי בקשות.' : "You haven't shared any request links yet."}</div>
        ) : (
          <div className="brit-links-list">
            {active.length > 0 && (
              <>
                <p className="brit-links-h">{isRtl ? `פעילים (${active.length})` : `Active (${active.length})`}</p>
                {active.map(renderLink)}
              </>
            )}
            {revoked.length > 0 && (
              <>
                <p className="brit-links-h muted">{isRtl ? `בוטלו (${revoked.length})` : `Revoked (${revoked.length})`}</p>
                {revoked.map(renderLink)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
