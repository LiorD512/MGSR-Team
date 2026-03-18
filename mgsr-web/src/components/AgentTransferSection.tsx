'use client';

import React, { useState } from 'react';
import { AgentTransferRequest } from '@/lib/agentTransfer';

/* ── SVG Icons ── */
const UserTransferIcon = ({ className = '' }: { className?: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

interface AgentTransferSectionProps {
  player: { agentInChargeId?: string; agentInChargeName?: string; fullName?: string };
  pendingTransfer: AgentTransferRequest | null;
  currentUserAccountId: string | undefined;
  currentUserAuthUid: string | undefined;
  currentUserAccountName: string | undefined;
  onRequestTransfer: () => void;
  onApproveTransfer: () => Promise<void> | void;
  onRejectTransfer: () => Promise<void> | void;
  onCancelTransfer: () => void;
  resolveAgentName: (name: string | undefined, agentId?: string) => string;
  t: (key: string) => string;
}

export default function AgentTransferSection({
  player,
  pendingTransfer,
  currentUserAccountId,
  currentUserAuthUid,
  currentUserAccountName,
  onRequestTransfer,
  onApproveTransfer,
  onRejectTransfer,
  onCancelTransfer,
  resolveAgentName,
  t,
}: AgentTransferSectionProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);

  const hasAgent = !!player.agentInChargeId || !!player.agentInChargeName;
  const idMatch = !!player.agentInChargeId &&
    (player.agentInChargeId === currentUserAuthUid || player.agentInChargeId === currentUserAccountId);
  const nameMatch = !!currentUserAccountName && !!player.agentInChargeName &&
    currentUserAccountName.trim().toLowerCase() === player.agentInChargeName.trim().toLowerCase();
  const isCurrentUserAgent = hasAgent && (idMatch || nameMatch);

  /* ── STATE: Approval box for current agent ── */
  if (pendingTransfer && isCurrentUserAgent) {
    const requesterName = resolveAgentName(pendingTransfer.toAgentName, pendingTransfer.toAgentId);
    return (
      <div className="mt-4 relative overflow-hidden rounded-2xl border border-blue-500/20" style={{ background: 'linear-gradient(135deg, rgba(91,138,245,0.10) 0%, rgba(139,92,246,0.05) 100%)' }}>
        <div className="absolute top-0 end-0 w-24 h-24 rounded-full opacity-30 blur-[40px] pointer-events-none" style={{ background: 'rgba(91,138,245,0.3)' }} />
        <div className="relative p-4">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(91,138,245,0.12)', border: '1px solid rgba(91,138,245,0.2)' }}>📨</div>
            <span className="text-xs font-bold text-blue-400 tracking-wide">{t('agent_transfer_approval_title')}</span>
          </div>
          <p className="text-xs text-mgsr-muted mb-4 leading-relaxed">
            {t('agent_transfer_approval_desc').replace('%s', requesterName)}
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={async () => { setActionLoading('approve'); try { await onApproveTransfer(); } finally { setActionLoading(null); } }}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold text-[#080b12] bg-emerald-400 hover:bg-emerald-300 transition-all disabled:opacity-50 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)]"
            >
              {actionLoading === 'approve' ? (
                <span className="inline-block w-4 h-4 border-2 border-black/15 border-t-[#080b12] rounded-full animate-spin" />
              ) : t('agent_transfer_approve')}
            </button>
            <button
              onClick={async () => { setActionLoading('reject'); try { await onRejectTransfer(); } finally { setActionLoading(null); } }}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 px-3 rounded-xl text-xs font-bold text-red-400 border border-red-500/25 hover:bg-red-500/15 transition-all disabled:opacity-50"
              style={{ background: 'rgba(244,63,94,0.06)' }}
            >
              {actionLoading === 'reject' ? (
                <span className="inline-block w-4 h-4 border-2 border-red-400/25 border-t-red-400 rounded-full animate-spin" />
              ) : t('agent_transfer_reject')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STATE: Pending / waiting for approval ── */
  if (pendingTransfer &&
    (pendingTransfer.toAgentId === currentUserAccountId ||
     pendingTransfer.toAgentId === currentUserAuthUid ||
     (!!currentUserAccountName && !!pendingTransfer.toAgentName &&
      currentUserAccountName.trim().toLowerCase() === pendingTransfer.toAgentName.trim().toLowerCase()))) {
    const currentAgentName = resolveAgentName(pendingTransfer.fromAgentName, pendingTransfer.fromAgentId);
    return (
      <div className="mt-4 relative overflow-hidden rounded-2xl border border-amber-500/15" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(251,191,36,0.03) 100%)' }}>
        <div className="absolute top-0 end-0 w-24 h-24 rounded-full opacity-25 blur-[40px] pointer-events-none" style={{ background: 'rgba(245,158,11,0.3)' }} />
        <div className="relative p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.15)' }}>⏳</div>
            <span className="text-xs font-bold text-amber-400 tracking-wide">{t('agent_transfer_pending_title')}</span>
          </div>
          <p className="text-xs text-mgsr-muted mb-3 leading-relaxed">
            {t('agent_transfer_pending_desc').replace('%s', currentAgentName)}
          </p>
          <button
            onClick={onCancelTransfer}
            className="py-1.5 px-3 rounded-lg text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
            style={{ background: 'rgba(244,63,94,0.05)' }}
          >
            {t('agent_transfer_cancel')}
          </button>
        </div>
      </div>
    );
  }

  /* ── STATE: Request button ── */
  if (!pendingTransfer && !isCurrentUserAgent && hasAgent) {
    return (
      <>
        <button
          onClick={() => setShowConfirmDialog(true)}
          className="group mt-4 w-full p-3.5 rounded-2xl border border-dashed border-blue-500/25 flex items-center justify-center gap-2.5 transition-all hover:border-solid hover:border-blue-500/35 hover:shadow-[0_0_30px_rgba(91,138,245,0.1)]"
          style={{ background: 'rgba(91,138,245,0.05)' }}
        >
          <UserTransferIcon className="text-blue-400 transition-transform group-hover:scale-110" />
          <span className="text-xs font-bold text-blue-400">{t('agent_transfer_request_button')}</span>
        </button>

        {showConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setShowConfirmDialog(false)}>
            <div
              className="relative bg-mgsr-card border border-white/[0.06] rounded-2xl p-8 max-w-[380px] w-full mx-4 text-center shadow-[0_24px_80px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full opacity-20 blur-[60px]" style={{ background: 'rgba(91,138,245,0.4)' }} />
              </div>
              <div className="relative">
                <div className="w-16 h-16 rounded-[18px] flex items-center justify-center mx-auto mb-5 text-3xl border" style={{ background: 'linear-gradient(135deg, rgba(91,138,245,0.10), rgba(139,92,246,0.08))', borderColor: 'rgba(91,138,245,0.15)' }}>🔄</div>
                <h3 className="text-lg font-bold text-mgsr-text mb-2">{t('agent_transfer_confirm_title')}</h3>
                <p className="text-sm text-mgsr-muted mb-7 leading-relaxed">
                  {t('agent_transfer_confirm_body')
                    .replace('%1$s', player.fullName || '—')
                    .replace('%2$s', resolveAgentName(player.agentInChargeName, player.agentInChargeId))}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirmDialog(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-mgsr-muted border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={() => { setShowConfirmDialog(false); onRequestTransfer(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#080b12] bg-[#38e8c6] hover:bg-[#4df0d0] transition-all hover:shadow-[0_0_30px_rgba(56,232,198,0.25)]"
                  >
                    {t('agent_transfer_send_request')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
