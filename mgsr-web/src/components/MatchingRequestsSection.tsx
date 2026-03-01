'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import type { ClubRequest } from '@/lib/requestMatcher';

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

function getPositionDisplayName(position: string | undefined, isHebrew: boolean): string {
  if (!position?.trim()) return position || '';
  const key = position.trim().toUpperCase();
  const entry = POSITION_DISPLAY[key];
  if (!entry) return position.trim();
  return isHebrew ? entry.he : entry.en;
}

export interface PlayerOffer {
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
}

export interface MatchingRequestUiState {
  request: ClubRequest & { clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string };
  offer?: PlayerOffer;
}

interface MatchingRequestsSectionProps {
  matchingRequests: MatchingRequestUiState[];
  playerProfileUrl: string;
  accounts: { id: string; name?: string; hebrewName?: string; email?: string }[];
  currentUserEmail?: string | null;
  onMarkAsOffered: (requestId: string, clubName?: string, clubLogo?: string, position?: string, feedback?: string) => Promise<void>;
  onUpdateFeedback: (offerId: string, feedback: string) => Promise<void>;
  isWomen?: boolean;
}

function buildRequestDetailsText(request: MatchingRequestUiState['request'], t: (k: string) => string): string {
  const parts: string[] = [];
  if (request.ageDoesntMatter !== true && request.minAge != null && request.maxAge != null && request.minAge > 0 && request.maxAge > 0) {
    parts.push(`${request.minAge}–${request.maxAge}`);
  }
  if (request.salaryRange?.trim()) {
    parts.push(`${t('requests_salary')}: ${request.salaryRange}`);
  }
  if (request.transferFee?.trim()) {
    const fee = request.transferFee === 'Free/Free loan' ? t('requests_fee_free_loan') : request.transferFee;
    parts.push(`${t('requests_fee')}: ${fee}`);
  }
  return parts.join(' • ');
}

function formatOfferDate(ts: number, isRtl: boolean): string {
  const d = new Date(ts);
  return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MatchingRequestsSection({
  matchingRequests,
  playerProfileUrl,
  accounts,
  currentUserEmail,
  onMarkAsOffered,
  onUpdateFeedback,
  isWomen = false,
}: MatchingRequestsSectionProps) {
  const { t, isRtl } = useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFeedbackSheet, setShowFeedbackSheet] = useState<MatchingRequestUiState | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  const resolveAgentDisplayName = (name: string | undefined): string => {
    if (!name) return '';
    const account = accounts.find(
      (a) => a.name?.toLowerCase() === name.toLowerCase() || a.hebrewName?.toLowerCase() === name.toLowerCase()
    );
    return isRtl ? (account?.hebrewName ?? name) : (account?.name ?? name);
  };

  const getCurrentAgentName = (): string => {
    if (!currentUserEmail) return '';
    const account = accounts.find((a) => a.email?.toLowerCase() === currentUserEmail?.toLowerCase());
    return isRtl ? (account?.hebrewName ?? account?.name ?? '') : (account?.name ?? account?.hebrewName ?? '');
  };

  const handleSaveFeedback = async () => {
    const state = showFeedbackSheet;
    if (!state) return;
    setSavingFeedback(true);
    try {
      if (state.offer?.id) {
        await onUpdateFeedback(state.offer.id, feedbackDraft);
      } else {
        await onMarkAsOffered(
          state.request.id,
          state.request.clubName,
          state.request.clubLogo,
          state.request.position,
          feedbackDraft || undefined
        );
      }
      setShowFeedbackSheet(null);
      setFeedbackDraft('');
    } finally {
      setSavingFeedback(false);
    }
  };

  const handleShareWhatsApp = (contactPhone: string) => {
    const base = toWhatsAppUrl(contactPhone);
    if (!base || !playerProfileUrl) return;
    const url = `${base}${base.includes('?') ? '&' : '?'}text=${encodeURIComponent(playerProfileUrl)}`;
    window.open(url, '_blank');
  };

  if (matchingRequests.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
        <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
          {t('player_info_matching_requests')}
        </h3>
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-mgsr-border/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-mgsr-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="font-semibold text-mgsr-text mb-1">{t('player_info_matching_requests_empty')}</p>
          <p className="text-sm text-mgsr-muted">{t('player_info_matching_requests_empty_subtitle')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
      <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
        {t('player_info_matching_requests')}
      </h3>
      <div className="space-y-3">
        {matchingRequests.map((state) => {
          const { request, offer } = state;
          const isExpanded = expandedId === request.id;
          const positionName = getPositionDisplayName(request.position, isRtl);
          const detailsText = buildRequestDetailsText(request, t);
          const hasValidContact = (request.contactPhoneNumber?.replace(/\D/g, '') ?? '').length >= 9;

          return (
            <div
              key={request.id}
              className="rounded-xl border border-mgsr-border bg-mgsr-dark/30 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : request.id)}
                className="w-full p-4 flex items-start gap-3 text-left hover:bg-mgsr-card/50 transition"
              >
                {request.clubLogo ? (
                  <img src={request.clubLogo} alt="" className="w-9 h-9 rounded-lg object-contain shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-mgsr-border flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-mgsr-muted">
                      {(request.clubName || '?').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-mgsr-text">{request.clubName || '—'}</span>
                    {offer && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isWomen ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)]' : 'bg-mgsr-teal/20 text-mgsr-teal'}`}>
                        {t('player_info_matching_requests_offered')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-mgsr-muted mt-0.5">
                    {[request.clubCountry, positionName].filter(Boolean).join(' • ')}
                  </p>
                  {detailsText && (
                    <p className="text-xs text-mgsr-muted mt-0.5">{detailsText}</p>
                  )}
                  {offer && (
                    <p className="text-xs text-mgsr-teal mt-0.5">
                      {[
                        offer.offeredAt && t('player_info_matching_requests_offered_date').replace('%s', formatOfferDate(offer.offeredAt, isRtl)),
                        offer.markedByAgentName && t('player_info_matching_requests_by_agent').replace('%s', resolveAgentDisplayName(offer.markedByAgentName)),
                      ].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
                <svg
                  className={`w-5 h-5 text-mgsr-muted shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-mgsr-border">
                  {offer ? (
                    <div className="pt-4">
                      <p className="text-xs text-mgsr-muted mb-1">{t('player_info_matching_requests_club_feedback')}</p>
                      {offer.clubFeedback ? (
                        <p className="text-sm text-mgsr-text mb-2">&quot;{offer.clubFeedback}&quot;</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setShowFeedbackSheet(state);
                          setFeedbackDraft(offer.clubFeedback || '');
                        }}
                        className={`text-sm font-medium ${isWomen ? 'text-[var(--women-rose)] hover:underline' : 'text-mgsr-teal hover:underline'}`}
                      >
                        {offer.clubFeedback ? t('player_info_matching_requests_edit_feedback') : t('player_info_matching_requests_add_feedback')}
                      </button>
                    </div>
                  ) : (
                    <div className="pt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowFeedbackSheet(state);
                          setFeedbackDraft('');
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm ${isWomen ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30' : 'bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30'}`}
                      >
                        {t('player_info_matching_requests_mark_offered')}
                      </button>
                      {hasValidContact && (
                        <button
                          type="button"
                          onClick={() => handleShareWhatsApp(request.contactPhoneNumber!)}
                          className="p-2 rounded-lg text-mgsr-teal hover:bg-mgsr-teal/10 transition"
                          title={t('player_info_share')}
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feedback modal */}
      {showFeedbackSheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={() => !savingFeedback && setShowFeedbackSheet(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-mgsr-card border border-mgsr-border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-mgsr-text mb-2">
              {showFeedbackSheet.offer?.clubFeedback
                ? t('player_info_matching_requests_edit_feedback_title')
                : t('player_info_matching_requests_add_feedback_title')}
            </h3>
            <p className="text-sm text-mgsr-muted mb-4">
              {showFeedbackSheet.request.clubName} • {getPositionDisplayName(showFeedbackSheet.request.position, isRtl)}
            </p>
            <p className="text-xs text-mgsr-muted mb-1">{t('player_info_matching_requests_offer_date')}</p>
            <p className="text-sm text-mgsr-text mb-4">
              {formatOfferDate(showFeedbackSheet.offer?.offeredAt ?? Date.now(), isRtl)}
            </p>
            <p className="text-xs text-mgsr-muted mb-2">{t('player_info_matching_requests_feedback_hint')}</p>
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              placeholder={t('player_info_matching_requests_feedback_placeholder')}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none focus:border-mgsr-teal resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => !savingFeedback && setShowFeedbackSheet(null)}
                className="flex-1 py-3 rounded-xl border border-mgsr-border text-mgsr-muted hover:text-mgsr-text transition"
              >
                {t('player_info_matching_requests_cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveFeedback}
                disabled={savingFeedback}
                className={`flex-1 py-3 rounded-xl font-semibold transition disabled:opacity-50 ${isWomen ? 'bg-[var(--women-rose)] text-white' : 'bg-mgsr-teal text-mgsr-dark'}`}
              >
                {savingFeedback ? '…' : t('player_info_save_note')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
