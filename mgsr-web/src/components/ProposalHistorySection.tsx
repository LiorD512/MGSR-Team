'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ProposalOffer {
  id: string;
  playerTmProfile?: string;
  playerName?: string;
  requestId?: string;
  clubName?: string;
  clubLogo?: string;
  position?: string;
  offeredAt?: number;
  clubFeedback?: string;
  markedByAgentName?: string;
  requestStatus?: string;
  requestSnapshot?: string;
  historySummary?: string;
}

interface ProposalHistorySectionProps {
  offers: ProposalOffer[];
  accounts: { id: string; name?: string; hebrewName?: string; email?: string }[];
}

const POSITION_DISPLAY: Record<string, { en: string; he: string }> = {
  GK: { en: 'Goalkeeper', he: 'שוער' },
  CB: { en: 'Center Back', he: 'בלם' },
  RB: { en: 'Right Back', he: 'מגן ימני' },
  LB: { en: 'Left Back', he: 'מגן שמאלי' },
  DM: { en: 'Defensive Midfielder', he: 'קשר אחורי' },
  CM: { en: 'Central Midfielder', he: 'קשר מרכזי' },
  AM: { en: 'Attacking Midfielder', he: 'קשר התקפי' },
  LM: { en: 'Left Midfielder', he: 'קשר שמאלי' },
  RM: { en: 'Right Midfielder', he: 'קשר ימני' },
  LW: { en: 'Left Winger', he: 'כנף שמאל' },
  RW: { en: 'Right Winger', he: 'כנף ימין' },
  CF: { en: 'Center Forward', he: 'חלוץ מרכזי' },
  ST: { en: 'Striker', he: 'חלוץ' },
  SS: { en: 'Second Striker', he: 'חלוץ שני' },
};

const COLLAPSED_MAX = 3;

function statusInfo(status: string | undefined, t: (k: string) => string): { label: string; color: string; bgColor: string; icon: string } {
  switch (status) {
    case 'deleted': return { label: t('proposal_history_status_deleted'), color: 'text-amber-400', bgColor: 'bg-amber-400/15', icon: '⊘' };
    case 'fulfilled': return { label: t('proposal_history_status_fulfilled'), color: 'text-blue-400', bgColor: 'bg-blue-400/15', icon: '✓' };
    case 'active': return { label: t('proposal_history_status_active'), color: 'text-green-400', bgColor: 'bg-green-400/15', icon: '✓' };
    default: return { label: t('proposal_history_status_legacy'), color: 'text-mgsr-muted', bgColor: 'bg-mgsr-border/30', icon: '' };
  }
}

function dotColor(status: string | undefined): string {
  switch (status) {
    case 'deleted': return 'bg-amber-400';
    case 'fulfilled': return 'bg-blue-400';
    case 'active': return 'bg-green-400';
    default: return 'bg-gray-500';
  }
}

function formatDate(ts: number, isHebrew: boolean): string {
  return new Date(ts).toLocaleDateString(isHebrew ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeAgo(ts: number, isHebrew: boolean): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  if (minutes < 1) return isHebrew ? 'עכשיו' : 'just now';
  if (minutes < 60) return isHebrew ? `לפני ${minutes} דק׳` : `${minutes} min ago`;
  if (hours < 24) return isHebrew ? `לפני ${hours} שעות` : `${hours} hours ago`;
  if (days < 30) return isHebrew ? `לפני ${days} ימים` : `${days} days ago`;
  if (months < 12) return isHebrew ? `לפני ${months} חודשים` : `${months} months ago`;
  return formatDate(ts, isHebrew);
}

export default function ProposalHistorySection({ offers, accounts }: ProposalHistorySectionProps) {
  const { t, isRtl } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  if (offers.length === 0) return null;

  const visible = expanded ? offers : offers.slice(0, COLLAPSED_MAX);

  const resolveAgentName = (name: string | undefined): string => {
    if (!name) return '';
    const account = accounts.find(
      (a) => a.name?.toLowerCase() === name.toLowerCase() || a.hebrewName?.toLowerCase() === name.toLowerCase()
    );
    return isRtl ? (account?.hebrewName ?? name) : (account?.name ?? name);
  };

  const getPositionName = (pos: string | undefined): string => {
    if (!pos?.trim()) return '';
    const entry = POSITION_DISPLAY[pos.trim().toUpperCase()];
    return entry ? (isRtl ? entry.he : entry.en) : pos;
  };

  return (
    <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-mgsr-text flex-1">{t('proposal_history_title')}</h3>
        <span className="text-xs text-mgsr-muted bg-mgsr-border/50 px-2 py-0.5 rounded-lg">{offers.length}</span>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {visible.map((offer, index) => {
          const isLast = index === visible.length - 1 && (expanded || offers.length <= COLLAPSED_MAX);
          return (
            <HistoryCard
              key={offer.id}
              offer={offer}
              resolveAgentName={resolveAgentName}
              getPositionName={getPositionName}
              showConnector={!isLast}
            />
          );
        })}
      </div>

      {/* Show more / less */}
      {offers.length > COLLAPSED_MAX && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full py-2.5 rounded-xl bg-purple-500/8 text-purple-400 text-xs font-medium hover:bg-purple-500/15 transition flex items-center justify-center gap-1"
        >
          {expanded ? t('proposal_history_show_less') : t('proposal_history_show_all').replace('%s', String(offers.length))}
          <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}

function HistoryCard({
  offer,
  resolveAgentName,
  getPositionName,
  showConnector,
}: {
  offer: ProposalOffer;
  resolveAgentName: (name: string | undefined) => string;
  getPositionName: (pos: string | undefined) => string;
  showConnector: boolean;
}) {
  const { t, isRtl } = useLanguage();
  const status = statusInfo(offer.requestStatus, t);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(offer.historySummary ?? '');
  const [savingSummary, setSavingSummary] = useState(false);

  const handleSaveSummary = async () => {
    if (!offer.id) return;
    setSavingSummary(true);
    try {
      await updateDoc(doc(db, 'PlayerOffers', offer.id), { historySummary: summaryDraft || '' });
      setEditingSummary(false);
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <div className="flex gap-2">
      {/* Timeline track */}
      <div className="flex flex-col items-center w-5 shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full mt-5 ${dotColor(offer.requestStatus)}`} />
        {showConnector && <div className="w-0.5 flex-1 bg-mgsr-border/60 mt-1" />}
      </div>

      {/* Card */}
      <div className="flex-1 rounded-xl border border-mgsr-border bg-mgsr-dark/30 p-4 mb-2">
        {/* Header: club + position */}
        <div className="flex items-center gap-2">
          {offer.clubLogo ? (
            <img src={offer.clubLogo} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-mgsr-border flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-mgsr-muted">{(offer.clubName || '?').slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-mgsr-text text-sm">{offer.clubName || '—'}</span>
              {offer.position && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">
                  {getPositionName(offer.position)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="mt-2">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${status.color} ${status.bgColor}`}>
            {status.icon && <span>{status.icon}</span>}
            {status.label}
          </span>
        </div>

        {/* Request snapshot chips */}
        {offer.requestSnapshot && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {offer.requestSnapshot.split(' • ').map((chip, i) => (
              <span key={i} className="text-xs text-mgsr-muted bg-mgsr-border/40 px-2 py-0.5 rounded-md">{chip}</span>
            ))}
          </div>
        )}

        {/* Club feedback */}
        <div className="mt-3 rounded-lg bg-mgsr-border/25 p-3">
          <p className="text-xs text-purple-400 mb-1">{t('proposal_history_feedback')}</p>
          {offer.clubFeedback?.trim() ? (
            <p className="text-sm text-mgsr-text">&quot;{offer.clubFeedback}&quot;</p>
          ) : (
            <p className="text-xs text-mgsr-muted/60">{t('proposal_history_no_feedback')}</p>
          )}
        </div>

        {/* Agent summary */}
        <div className="mt-2 rounded-lg bg-orange-500/10 p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-orange-400">{t('proposal_history_summary')}</p>
            <button
              type="button"
              onClick={() => { setEditingSummary(!editingSummary); setSummaryDraft(offer.historySummary ?? ''); }}
              className="text-orange-400/70 hover:text-orange-400 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
          {editingSummary ? (
            <>
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                placeholder={t('proposal_history_summary_hint')}
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-sm text-mgsr-text placeholder-mgsr-muted/50 focus:outline-none focus:border-orange-400 resize-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveSummary(); } }}
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={handleSaveSummary}
                  disabled={savingSummary}
                  className="text-xs font-semibold text-orange-400 bg-orange-400/15 hover:bg-orange-400/25 px-3 py-1 rounded-md transition disabled:opacity-50"
                >
                  {savingSummary ? '…' : t('proposal_history_summary_save')}
                </button>
              </div>
            </>
          ) : offer.historySummary?.trim() ? (
            <p className="text-sm text-mgsr-text">&quot;{offer.historySummary}&quot;</p>
          ) : (
            <button
              type="button"
              onClick={() => setEditingSummary(true)}
              className="text-xs text-mgsr-muted/60 hover:text-mgsr-muted transition"
            >
              {t('proposal_history_add_summary')}
            </button>
          )}
        </div>

        {/* Meta: agent + date */}
        <div className="mt-3 pt-2 border-t border-mgsr-border/40 flex items-center justify-between text-xs text-mgsr-muted">
          {offer.markedByAgentName && (
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-mgsr-teal/15 flex items-center justify-center">
                <span className="text-[9px] font-bold text-mgsr-teal">{resolveAgentName(offer.markedByAgentName).charAt(0)}</span>
              </div>
              <span>{t('proposal_history_by_agent').replace('%s', resolveAgentName(offer.markedByAgentName))}</span>
            </div>
          )}
          {offer.offeredAt && (
            <div className="text-end">
              <div>{formatDate(offer.offeredAt, isRtl)}</div>
              <div className="text-purple-400">{formatTimeAgo(offer.offeredAt, isRtl)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
