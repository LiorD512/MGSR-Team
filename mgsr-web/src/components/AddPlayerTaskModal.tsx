'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  PLAYER_TASK_TEMPLATES,
  getTemplateTitle,
  type PlayerTaskTemplate,
} from '@/lib/playerTaskTemplates';
import { addDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

interface AgentContact {
  id: string;
  name?: string;
  phoneNumber?: string;
  role?: string;
  agencyName?: string;
  agencyUrl?: string;
  clubName?: string;
  contactType?: string;
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
    playerWomenId?: string;
    playerImage?: string;
    playerClub?: string;
    playerPosition?: string;
    playerAgency?: string;
    playerAgencyUrl?: string;
  };
  accounts: Account[];
  currentUserId: string;
  currentUserEmail?: string;
  getDisplayName: (a: Account, isRtl: boolean) => string;
  /** Firestore collection for tasks (AgentTasks or AgentTasksWomen or AgentTasksYouth) */
  taskCollection?: 'AgentTasks' | 'AgentTasksWomen' | 'AgentTasksYouth';
}

const PRIORITY_COLORS = {
  0: { bg: 'rgba(77, 182, 172, 0.25)', accent: '#4DB6AC' },
  1: { bg: 'rgba(255, 112, 67, 0.25)', accent: '#FF7043' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935' },
};

const PRIORITY_COLORS_WOMEN = {
  0: { bg: 'rgba(232, 160, 191, 0.25)', accent: '#E8A0BF' },
  1: { bg: 'rgba(212, 165, 165, 0.35)', accent: '#D4A5A5' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935' },
};

export default function AddPlayerTaskModal({
  open,
  onClose,
  onSuccess,
  playerContext,
  accounts,
  currentUserId,
  currentUserEmail,
  getDisplayName,
  taskCollection = 'AgentTasks',
}: AddPlayerTaskModalProps) {
  const { t, isRtl, lang } = useLanguage();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<0 | 1 | 2>(0);
  const [agentId, setAgentId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<PlayerTaskTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [agentContacts, setAgentContacts] = useState<AgentContact[]>([]);
  const [selectedAgentContact, setSelectedAgentContact] = useState<AgentContact | null>(null);

  const isWomen = taskCollection === 'AgentTasksWomen';
  const isYouth = taskCollection === 'AgentTasksYouth';
  const contactsCollectionName = isYouth ? 'ContactsYouth' : isWomen ? 'ContactsWomen' : 'Contacts';

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
      setSelectedAgentContact(null);
    }
  }, [open]);

  // Fetch agent contacts when modal opens (men only), filtered by player's agency
  const isMen = !isWomen && !isYouth;
  useEffect(() => {
    if (!open || !isMen) return;
    const unsub = onSnapshot(collection(db, contactsCollectionName), (snap) => {
      const allAgentContacts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as AgentContact))
        .filter((c) => c.role === 'AGENT' || c.role === 'INTERMEDIARY' || c.contactType === 'AGENCY');

      // If the player has a known agency, show only contacts from that agency
      const agency = playerContext?.playerAgency?.trim().toLowerCase();
      const agencyUrl = playerContext?.playerAgencyUrl?.trim().toLowerCase();
      if (agency || agencyUrl) {
        const matched = allAgentContacts.filter((c) => {
          const cAgency = c.agencyName?.trim().toLowerCase();
          const cUrl = c.agencyUrl?.trim().toLowerCase();
          return (agency && cAgency && cAgency.includes(agency)) ||
                 (agency && cAgency && agency.includes(cAgency)) ||
                 (agencyUrl && cUrl && (cUrl === agencyUrl || agencyUrl.includes(cUrl) || cUrl.includes(agencyUrl)));
        });
        // If we found matching contacts, show only those; otherwise fallback to all
        setAgentContacts(matched.length > 0 ? matched : allAgentContacts);
      } else {
        setAgentContacts(allAgentContacts);
      }
    });
    return () => unsub();
  }, [open, isMen, contactsCollectionName, playerContext?.playerAgency, playerContext?.playerAgencyUrl]);

  const handleTemplateSelect = (template: PlayerTaskTemplate) => {
    setSelectedTemplate(template);
    const month = dueDate ? new Date(dueDate).getMonth() : new Date().getMonth();
    setTitle(getTemplateTitle(template, lang, template.hasMonthPlaceholder ? month : undefined, isWomen));
    // Reset agent contact when switching templates
    if (template.id !== 'call_agent') {
      setSelectedAgentContact(null);
    }
  };

  const handleDueDateChange = (val: string) => {
    setDueDate(val);
    if (selectedTemplate?.hasMonthPlaceholder && val) {
      const month = new Date(val).getMonth();
      setTitle(getTemplateTitle(selectedTemplate, lang, month, isWomen));
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !currentUserId) return;
    setSaving(true);
    try {
      const selected = accounts.find((a) => a.id === agentId);
      const agentName = selected ? getDisplayName(selected, isRtl) : '';
      const dueTs = dueDate ? new Date(dueDate).getTime() : 0;
      const createdBy = accounts.find((a) => a.email?.toLowerCase() === currentUserEmail?.toLowerCase());
      const createdByName = createdBy ? getDisplayName(createdBy, isRtl) : (currentUserEmail || '');
      const taskData: Record<string, unknown> = {
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
      };
      if (selectedAgentContact) {
        taskData.linkedAgentContactId = selectedAgentContact.id;
        taskData.linkedAgentContactName = selectedAgentContact.name || '';
        taskData.linkedAgentContactPhone = selectedAgentContact.phoneNumber || '';
      }
      if (playerContext) {
        taskData.playerId = playerContext.playerId;
        taskData.playerName = playerContext.playerName;
        taskData.templateId = selectedTemplate?.id;
        if (taskCollection === 'AgentTasks') {
          taskData.playerTmProfile = playerContext.playerTmProfile ?? '';
        } else {
          taskData.playerWomenId = playerContext.playerWomenId ?? playerContext.playerId;
        }
      }
      await addDoc(collection(db, taskCollection), taskData);
      onClose();
      onSuccess?.();
    } finally {
      setSaving(false);
    }
  };

  const priorityColors = isWomen ? PRIORITY_COLORS_WOMEN : PRIORITY_COLORS;

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${isWomen ? 'women-dialog-backdrop' : 'bg-black/70 backdrop-blur-md'}`}
      onClick={() => !saving && onClose()}
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className={`relative w-full sm:max-w-lg bg-mgsr-card rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col ${isWomen ? 'women-dialog-content' : 'border border-mgsr-border shadow-2xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {isWomen && <div className="women-dialog-accent shrink-0" />}
        <div className={`p-6 shrink-0 ${isWomen ? 'border-b border-mgsr-border/50' : 'border-b border-mgsr-border'}`}>
          <h2 className="text-xl font-bold text-mgsr-text font-display">
            {t(isWomen ? 'tasks_new_task_women' : 'tasks_new_task')}
          </h2>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          {playerContext && (
            <div className={`flex items-center gap-3 p-3 rounded-xl ${isWomen ? 'bg-[var(--women-rose)]/10 border border-[var(--women-rose)]/25' : 'bg-mgsr-teal/10 border border-mgsr-teal/25'}`}>
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
                {t(isWomen ? 'player_tasks_choose_template_women' : 'player_tasks_choose_template')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PLAYER_TASK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleTemplateSelect(tpl)}
                    className={`px-3 py-2.5 rounded-lg text-right text-sm transition ${
                      selectedTemplate?.id === tpl.id
                        ? isWomen
                          ? 'border-2 border-[var(--women-rose)] bg-[var(--women-rose)]/15 text-[var(--women-rose)]'
                          : 'border-2 border-mgsr-teal bg-mgsr-teal/15 text-mgsr-teal'
                        : isWomen
                          ? 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-text hover:border-[var(--women-rose)]/50'
                          : 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-text hover:border-mgsr-teal/50'
                    }`}
                  >
                    {getTemplateTitle(tpl, lang, undefined, isWomen)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Agent contact picker — shown when call_agent template is selected (men only) */}
          {isMen && playerContext && selectedTemplate?.id === 'call_agent' && agentContacts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-mgsr-muted uppercase mb-2">
                {t('tasks_select_agent_contact')}
              </label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {agentContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => setSelectedAgentContact(selectedAgentContact?.id === contact.id ? null : contact)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                      selectedAgentContact?.id === contact.id
                        ? isWomen
                          ? 'border-2 border-[var(--women-rose)] bg-[var(--women-rose)]/15'
                          : 'border-2 border-mgsr-teal bg-mgsr-teal/15'
                        : 'border border-mgsr-border bg-mgsr-dark/50 hover:border-mgsr-border/80'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                        isWomen ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal'
                      }`}
                    >
                      {(contact.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className={`flex-1 min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                      <p className="text-mgsr-text font-medium truncate">{contact.name || '—'}</p>
                      <p className="text-xs text-mgsr-muted truncate">
                        {[contact.agencyName || contact.clubName, contact.phoneNumber].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {selectedAgentContact?.id === contact.id && (
                      <span className={`text-sm font-bold ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>✓</span>
                    )}
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
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none ${isWomen ? 'focus:border-[var(--women-rose)]/50' : 'focus:border-mgsr-teal'}`}
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
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${isWomen ? 'focus:border-[var(--women-rose)]/50' : 'focus:border-mgsr-teal'}`}
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
                          borderColor: priorityColors[p].accent,
                          backgroundColor: priorityColors[p].bg,
                          color: priorityColors[p].accent,
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
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${isWomen ? 'focus:border-[var(--women-rose)]/50' : 'focus:border-mgsr-teal'}`}
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
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none resize-none ${isWomen ? 'focus:border-[var(--women-rose)]/50' : 'focus:border-mgsr-teal'}`}
            />
          </div>
        </div>
        <div className="p-6 pt-0 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`flex-1 py-3 rounded-xl border transition disabled:opacity-50 ${isWomen ? 'border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30' : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80'}`}
          >
            {t('tasks_cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className={`flex-1 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${isWomen ? 'bg-[var(--women-gradient)] text-white shadow-[0_0_20px_rgba(232,160,191,0.25)] hover:opacity-95' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
          >
            {saving ? '...' : t('tasks_create')}
          </button>
        </div>
      </div>
    </div>
  );
}
