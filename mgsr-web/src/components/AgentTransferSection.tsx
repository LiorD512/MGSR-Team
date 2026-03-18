'use client';

import React, { useState } from 'react';
import { AgentTransferRequest } from '@/lib/agentTransfer';

interface AgentTransferSectionProps {
  player: { agentInChargeId?: string; agentInChargeName?: string; fullName?: string };
  pendingTransfer: AgentTransferRequest | null;
  currentUserAccountId: string | undefined;
  currentUserAuthUid: string | undefined;
  currentUserAccountName: string | undefined;
  onRequestTransfer: () => void;
  onApproveTransfer: () => void;
  onRejectTransfer: () => void;
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

  // Check if current user is the agent in charge — by ID or by name fallback
  const hasAgent = !!player.agentInChargeId || !!player.agentInChargeName;
  const idMatch = !!player.agentInChargeId &&
    (player.agentInChargeId === currentUserAuthUid || player.agentInChargeId === currentUserAccountId);
  const nameMatch = !!currentUserAccountName && !!player.agentInChargeName &&
    currentUserAccountName.trim().toLowerCase() === player.agentInChargeName.trim().toLowerCase();
  const isCurrentUserAgent = hasAgent && (idMatch || nameMatch);

  // Current user IS the agent and there's a pending transfer TO review
  if (pendingTransfer && isCurrentUserAgent) {
    const requesterName = resolveAgentName(pendingTransfer.toAgentName, pendingTransfer.toAgentId);
    return (
      <div className="mt-3 p-4 rounded-xl border border-blue-500/25 bg-blue-500/8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">📨</span>
          <span className="text-xs font-bold text-blue-400">{t('agent_transfer_approval_title')}</span>
        </div>
        <p className="text-xs text-mgsr-muted mb-3">
          {t('agent_transfer_approval_desc').replace('%s', requesterName)}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onApproveTransfer}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
          >
            {t('agent_transfer_approve')}
          </button>
          <button
            onClick={onRejectTransfer}
            className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-red-400 bg-red-500/12 border border-red-500/30 hover:bg-red-500/20 transition-colors"
          >
            {t('agent_transfer_reject')}
          </button>
        </div>
      </div>
    );
  }

  // Current user requested a transfer — show pending/waiting state
  if (pendingTransfer &&
    (pendingTransfer.toAgentId === currentUserAccountId ||
     pendingTransfer.toAgentId === currentUserAuthUid ||
     (!!currentUserAccountName && !!pendingTransfer.toAgentName &&
      currentUserAccountName.trim().toLowerCase() === pendingTransfer.toAgentName.trim().toLowerCase()))) {
    const currentAgentName = resolveAgentName(pendingTransfer.fromAgentName, pendingTransfer.fromAgentId);
    return (
      <div className="mt-3 p-4 rounded-xl border border-yellow-500/25 bg-yellow-500/8">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">⏳</span>
          <span className="text-xs font-bold text-yellow-400">{t('agent_transfer_pending_title')}</span>
        </div>
        <p className="text-xs text-mgsr-muted mb-2">
          {t('agent_transfer_pending_desc').replace('%s', currentAgentName)}
        </p>
        <button
          onClick={onCancelTransfer}
          className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
        >
          {t('agent_transfer_cancel')}
        </button>
      </div>
    );
  }

  // No pending transfer, current user is NOT the agent — show request button
  if (!pendingTransfer && !isCurrentUserAgent && hasAgent) {
    return (
      <>
        <button
          onClick={() => setShowConfirmDialog(true)}
          className="mt-3 w-full p-3 rounded-xl border border-dashed border-blue-500/30 bg-blue-500/8 flex items-center justify-center gap-2 hover:bg-blue-500/15 transition-colors"
        >
          <span className="text-sm">🙋</span>
          <span className="text-xs font-bold text-blue-400">{t('agent_transfer_request_button')}</span>
        </button>

        {showConfirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-mgsr-card border border-mgsr-border rounded-2xl p-6 max-w-sm w-full mx-4 text-center">
              <span className="text-4xl block mb-3">🔄</span>
              <h3 className="text-base font-bold text-mgsr-text mb-2">
                {t('agent_transfer_confirm_title')}
              </h3>
              <p className="text-sm text-mgsr-muted mb-5">
                {t('agent_transfer_confirm_body')
                  .replace('%1$s', player.fullName || '—')
                  .replace('%2$s', resolveAgentName(player.agentInChargeName, player.agentInChargeId))}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-mgsr-muted bg-mgsr-bg hover:bg-mgsr-border transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={() => {
                    setShowConfirmDialog(false);
                    onRequestTransfer();
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors"
                >
                  {t('agent_transfer_send_request')}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
