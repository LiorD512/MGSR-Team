'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  PLAYER_TASK_TEMPLATES,
  getTemplateTitle,
  type PlayerTaskTemplate,
} from '@/lib/playerTaskTemplates';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

interface AddPlayerTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** When adding from player page */
  playerContext?: {
    playerId: string;
    playerName: string;
    playerTmProfile?: string;
    playerImage?: string;
    playerClub?: string;
    playerPosition?: string;
  };
  accounts: Account[];
  currentUserId: string;
  getDisplayName: (a: Account, isRtl: boolean) => string;
}

const PRIORITY_COLORS = {
  0: { bg: 'rgba(77, 182, 172, 0.25)', accent: '#4DB6AC' },
  1: { bg: 'rgba(255, 112, 67, 0.25)', accent: '#FF7043' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935' },
};

export default function AddPlayerTaskModal({
  open,
  onClose,
  onSuccess,
  playerContext,
  accounts,
  currentUserId,
  getDisplayName,
}: AddPlayerTaskModalProps) {
  const { t, isRtl, lang } = useLanguage();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<0 | 1 | 2>(0);
  const [agentId, setAgentId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<PlayerTaskTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && accounts.length > 0 && !agentId) {
      const me = accounts.find((a) => a.id === currentUserId);
      setAgentId(me?.id || accounts[0].id);
    }
  }, [open, accounts, currentUserId, agentId]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setNotes('');
      setDueDate('');
      setPriority(0);
      setSelectedTemplate(null);
    }
  }, [open]);

  const handleTemplateSelect = (template: PlayerTaskTemplate) => {
    setSelectedTemplate(template);
    const month = dueDate ? new Date(dueDate).getMonth() : new Date().getMonth();
    setTitle(getTemplateTitle(template, lang, template.hasMonthPlaceholder ? month : undefined));
  };

  const handleDueDateChange = (val: string) => {
    setDueDate(val);
    if (selectedTemplate?.hasMonthPlaceholder && val) {
      const month = new Date(val).getMonth();
      setTitle(getTemplateTitle(selectedTemplate, lang, month));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !currentUserId) return;
    setSaving(true);
    try {
      const selected = accounts.find((a) => a.id === agentId);
      const agentName = selected ? getDisplayName(selected, isRtl) : '';
      const dueTs = dueDate ? new Date(dueDate).getTime() : 0;
      const createdBy = accounts.find((a) => a.id === currentUserId);
      const createdByName = createdBy ? getDisplayName(createdBy, isRtl) : '';
      await addDoc(collection(db, 'AgentTasks'), {
        agentId: agentId || currentUserId,
        agentName: agentName || '',
        title: title.trim(),
        notes: notes.trim() || '',
        dueDate: dueTs,
        priority,
        isCompleted: false,
        createdAt: Date.now(),
        createdByAgentId: currentUserId,
        createdByAgentName: createdByName,
        ...(playerContext && {
          playerId: playerContext.playerId,
          playerName: playerContext.playerName,
          playerTmProfile: playerContext.playerTmProfile ?? '',
          templateId: selectedTemplate?.id,
        }),
      });
      onClose();
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md"
      onClick={() => !saving && onClose()}
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="relative w-full sm:max-w-lg bg-mgsr-card border border-mgsr-border rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-mgsr-border">
          <h2 className="text-xl font-bold text-mgsr-text font-display">
            {t('tasks_new_task')}
          </h2>
        </div>
        <div className="p-6 space-y-5">
          {playerContext && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-mgsr-teal/10 border border-mgsr-teal/25">
              {playerContext.playerImage && (
                <img
                  src={playerContext.playerImage}
                  alt=""
                  className="w-10 h-10 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-mgsr-text">{playerContext.playerName}</p>
                {(playerContext.playerClub || playerContext.playerPosition) && (
                  <p className="text-sm text-mgsr-muted">
                    {[playerContext.playerClub, playerContext.playerPosition].filter(Boolean).join(' • ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {playerContext && (
            <div>
              <label className="block text-xs font-semibold text-mgsr-muted uppercase mb-2">
                {t('player_tasks_choose_template')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PLAYER_TASK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleTemplateSelect(tpl)}
                    className={`px-3 py-2.5 rounded-lg text-right text-sm transition ${
                      selectedTemplate?.id === tpl.id
                        ? 'border-2 border-mgsr-teal bg-mgsr-teal/15 text-mgsr-teal'
                        : 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-text hover:border-mgsr-teal/50'
                    }`}
                  >
                    {getTemplateTitle(tpl, lang)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('tasks_what_needs_done')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('tasks_what_needs_done')}
              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:border-mgsr-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('tasks_due_date')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => handleDueDateChange(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:border-mgsr-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('tasks_priority')}
            </label>
            <div className="flex gap-2">
              {([0, 1, 2] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                    priority === p ? 'border-2' : 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-muted hover:text-mgsr-text'
                  }`}
                  style={
                    priority === p
                      ? {
                          borderColor: PRIORITY_COLORS[p].accent,
                          backgroundColor: PRIORITY_COLORS[p].bg,
                          color: PRIORITY_COLORS[p].accent,
                        }
                      : {}
                  }
                >
                  {t(`tasks_priority_${['low', 'medium', 'high'][p]}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('tasks_assign_to')}
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:border-mgsr-teal focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {getDisplayName(a, isRtl)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('tasks_notes_hint')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('tasks_notes_hint')}
              rows={2}
              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:border-mgsr-teal focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="p-6 pt-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 rounded-xl border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80 transition disabled:opacity-50"
          >
            {t('tasks_cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="flex-1 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '...' : t('tasks_create')}
          </button>
        </div>
      </div>
    </div>
  );
}
