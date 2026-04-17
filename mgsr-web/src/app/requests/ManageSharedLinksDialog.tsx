'use client';

import { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';

interface SharedLinkItem {
  token: string;
  platform: string;
  showClubs: boolean;
  recipientLabel: string | null;
  createdAt: number;
  revoked: boolean;
  revokedAt: number | null;
  viewCount: number;
  lastViewedAt: number | null;
}

export default function ManageSharedLinksDialog({
  isHebrew,
  isRtl,
  isWomen,
  isYouth,
  user,
  onClose,
}: {
  isHebrew: boolean;
  isRtl: boolean;
  isWomen: boolean;
  isYouth: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<SharedLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/shared-requests/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { links: data } = await res.json();
        setLinks(data || []);
      }
    } catch (e) {
      console.error('Failed to fetch shared links:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleRevoke = async (linkToken: string) => {
    if (!user) return;
    setRevokingToken(linkToken);
    try {
      const authToken = await user.getIdToken();
      const res = await fetch('/api/shared-requests/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ token: linkToken }),
      });
      if (res.ok) {
        setLinks((prev) =>
          prev.map((l) =>
            l.token === linkToken ? { ...l, revoked: true, revokedAt: Date.now() } : l,
          ),
        );
      }
    } catch (e) {
      console.error('Revoke failed:', e);
    } finally {
      setRevokingToken(null);
    }
  };

  const handleCopyLink = async (linkToken: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/shared/requests/${linkToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(linkToken);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // fallback
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(isHebrew ? 'he-IL' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeLinks = links.filter((l) => !l.revoked);
  const revokedLinks = links.filter((l) => l.revoked);

  const accentClass = isYouth
    ? 'text-[var(--youth-cyan)]'
    : isWomen
    ? 'text-[var(--women-rose)]'
    : 'text-mgsr-teal';

  const accentBorderClass = isYouth
    ? 'border-[var(--youth-cyan)]/30'
    : isWomen
    ? 'border-[var(--women-rose)]/30'
    : 'border-mgsr-teal/30';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mgsr-card border border-mgsr-border rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl max-h-[80vh] flex flex-col"
        dir={isRtl ? 'rtl' : 'ltr'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-display font-bold text-mgsr-text">
            {isHebrew ? 'ניהול קישורים משותפים' : 'Manage Shared Links'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-mgsr-muted hover:text-mgsr-text transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className={`w-6 h-6 border-2 ${accentBorderClass} border-t-transparent rounded-full animate-spin`} />
          </div>
        ) : links.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-mgsr-muted text-sm">
              {isHebrew ? 'לא שיתפת קישורי בקשות עדיין.' : "You haven't shared any request links yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-2">
            {/* Active links */}
            {activeLinks.length > 0 && (
              <>
                <p className={`text-xs font-semibold uppercase tracking-wider ${accentClass} mb-2`}>
                  {isHebrew ? `פעילים (${activeLinks.length})` : `Active (${activeLinks.length})`}
                </p>
                {activeLinks.map((link) => (
                  <LinkCard
                    key={link.token}
                    link={link}
                    isHebrew={isHebrew}
                    accentClass={accentClass}
                    accentBorderClass={accentBorderClass}
                    onRevoke={() => handleRevoke(link.token)}
                    onCopy={() => handleCopyLink(link.token)}
                    revoking={revokingToken === link.token}
                    copied={copiedToken === link.token}
                    formatDate={formatDate}
                  />
                ))}
              </>
            )}

            {/* Revoked links */}
            {revokedLinks.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-mgsr-muted mt-4 mb-2">
                  {isHebrew ? `בוטלו (${revokedLinks.length})` : `Revoked (${revokedLinks.length})`}
                </p>
                {revokedLinks.map((link) => (
                  <LinkCard
                    key={link.token}
                    link={link}
                    isHebrew={isHebrew}
                    accentClass={accentClass}
                    accentBorderClass={accentBorderClass}
                    onRevoke={() => {}}
                    onCopy={() => {}}
                    revoking={false}
                    copied={false}
                    formatDate={formatDate}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LinkCard({
  link,
  isHebrew,
  accentClass,
  accentBorderClass,
  onRevoke,
  onCopy,
  revoking,
  copied,
  formatDate,
}: {
  link: SharedLinkItem;
  isHebrew: boolean;
  accentClass: string;
  accentBorderClass: string;
  onRevoke: () => void;
  onCopy: () => void;
  revoking: boolean;
  copied: boolean;
  formatDate: (ts: number) => string;
}) {
  const platformLabels: Record<string, string> = {
    men: isHebrew ? 'גברים' : 'Men',
    women: isHebrew ? 'נשים' : 'Women',
    youth: isHebrew ? 'נוער' : 'Youth',
  };

  return (
    <div
      className={`rounded-xl border p-3 ${
        link.revoked ? 'border-mgsr-border/50 opacity-60' : `border-mgsr-border`
      }`}
      style={{ background: link.revoked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Recipient label or default */}
          <p className="text-sm font-semibold text-mgsr-text truncate">
            {link.recipientLabel || (isHebrew ? 'ללא שם' : 'Unnamed recipient')}
          </p>
          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] text-mgsr-muted">
              {formatDate(link.createdAt)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-mgsr-muted font-medium">
              {platformLabels[link.platform] || link.platform}
            </span>
            {link.showClubs && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-mgsr-muted font-medium">
                {isHebrew ? 'עם מועדונים' : 'With clubs'}
              </span>
            )}
            {link.viewCount > 0 && (
              <span className="text-[10px] text-mgsr-muted">
                {link.viewCount} {isHebrew ? 'צפיות' : 'views'}
              </span>
            )}
          </div>
        </div>

        {/* Status badge */}
        {link.revoked ? (
          <span className="text-[10px] px-2 py-1 rounded-lg bg-red-500/10 text-red-400 font-semibold shrink-0">
            {isHebrew ? 'בוטל' : 'Revoked'}
          </span>
        ) : (
          <span className={`text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold shrink-0`}>
            {isHebrew ? 'פעיל' : 'Active'}
          </span>
        )}
      </div>

      {/* Actions */}
      {!link.revoked && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-mgsr-border/50">
          <button
            type="button"
            onClick={onCopy}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-mgsr-muted hover:text-mgsr-text transition flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {isHebrew ? 'הועתק' : 'Copied'}
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                {isHebrew ? 'העתק קישור' : 'Copy link'}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRevoke}
            disabled={revoking}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {revoking ? (
              <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {isHebrew ? 'בטל גישה' : 'Revoke'}
          </button>
        </div>
      )}
    </div>
  );
}
