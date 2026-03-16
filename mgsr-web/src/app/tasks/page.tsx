'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import {
  collection,
  onSnapshot,
  updateDoc,
  addDoc,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { usePlatform } from '@/contexts/PlatformContext';
import AppLayout from '@/components/AppLayout';
import { requestCalendarAccess, syncTasksToCalendar, type SyncResult } from '@/lib/googleCalendar';

interface AgentTask {
  id: string;
  title?: string;
  notes?: string;
  dueDate?: number;
  isCompleted?: boolean;
  priority?: number;
  agentId?: string;
  agentName?: string;
  playerId?: string;
  playerName?: string;
  playerTmProfile?: string;
  playerWomenId?: string;
  templateId?: string;
  createdAt?: number;
  createdByAgentId?: string;
  createdByAgentName?: string;
  linkedAgentContactId?: string;
  linkedAgentContactName?: string;
  linkedAgentContactPhone?: string;
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

const AGENT_COLORS = [
  '#4DB6AC',
  '#5C6BC0',
  '#FF7043',
  '#66BB6A',
  '#EC407A',
  '#AB47BC',
  '#42A5F5',
  '#8D6E63',
];

const AGENT_COLORS_WOMEN = [
  '#E8A0BF',
  '#C9B1BD',
  '#D4A5A5',
  '#E8B4C4',
  '#D4A5B5',
  '#C9A5BD',
  '#E8C0CF',
  '#D4B5A5',
];

const AGENT_COLORS_YOUTH = [
  '#00D4FF',
  '#A855F7',
  '#06B6D4',
  '#8B5CF6',
  '#22D3EE',
  '#C084FC',
  '#67E8F9',
  '#D8B4FE',
];

const PRIORITY_COLORS = {
  0: { bg: 'rgba(77, 182, 172, 0.25)', accent: '#4DB6AC', label: 'low' },
  1: { bg: 'rgba(255, 112, 67, 0.25)', accent: '#FF7043', label: 'medium' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935', label: 'high' },
};

const PRIORITY_COLORS_WOMEN = {
  0: { bg: 'rgba(232, 160, 191, 0.25)', accent: '#E8A0BF', label: 'low' },
  1: { bg: 'rgba(212, 165, 165, 0.35)', accent: '#D4A5A5', label: 'medium' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935', label: 'high' },
};

const PRIORITY_COLORS_YOUTH = {
  0: { bg: 'rgba(0, 212, 255, 0.20)', accent: '#00D4FF', label: 'low' },
  1: { bg: 'rgba(168, 85, 247, 0.25)', accent: '#A855F7', label: 'medium' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935', label: 'high' },
};

const getDisplayName = (a: Account, isRtl: boolean) =>
  isRtl ? a.hebrewName || a.name || a.email || '—' : a.name || a.hebrewName || a.email || '—';

interface TasksCache {
  tasks: AgentTask[];
  accounts: Account[];
  filter: 'all' | 'mine';
}

const TASKS_COLLECTIONS = { men: 'AgentTasks', women: 'AgentTasksWomen', youth: 'AgentTasksYouth' } as const;

export default function TasksPage() {
  const { user, loading } = useAuth();
  const { platform } = usePlatform();
  const { lang, setLang, t, isRtl } = useLanguage();
  const router = useRouter();
  const taskCollection = TASKS_COLLECTIONS[platform];
  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';

  // Platform-aware accent helpers
  const accentText = isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal';
  const accentBg = isYouth ? 'bg-[var(--youth-cyan)]' : isWomen ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal';
  const accentBg20 = isYouth ? 'bg-[var(--youth-cyan)]/20' : isWomen ? 'bg-[var(--women-rose)]/20' : 'bg-mgsr-teal/20';
  const accentHoverBg30 = isYouth ? 'hover:bg-[var(--youth-cyan)]/30' : isWomen ? 'hover:bg-[var(--women-rose)]/30' : 'hover:bg-mgsr-teal/30';
  const focusBorder = isYouth ? 'focus:border-[var(--youth-cyan)]/50' : isWomen ? 'focus:border-[var(--women-rose)]/50' : 'focus:border-mgsr-teal';
  const borderAccent = isYouth ? 'border-[var(--youth-cyan)]' : isWomen ? 'border-[var(--women-rose)]' : 'border-mgsr-teal';
  const hoverBorderAccent = isYouth ? 'hover:border-[var(--youth-cyan)]' : isWomen ? 'hover:border-[var(--women-rose)]' : 'hover:border-mgsr-teal';
  const cached = getScreenCache<TasksCache>('tasks');
  const [tasks, setTasks] = useState<AgentTask[]>(cached?.tasks ?? []);
  const [accounts, setAccounts] = useState<Account[]>(cached?.accounts ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [filter, setFilter] = useState<'all' | 'mine'>(cached?.filter ?? 'all');
  const [activeCompletedTab, setActiveCompletedTab] = useState<'active' | 'completed'>('active');
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addPriority, setAddPriority] = useState(0);
  const [addAgentId, setAddAgentId] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState(0);
  const [editAgentId, setEditAgentId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`mgsr_calendar_sync_${platform}`);
    if (stored) setLastSyncTime(Number(stored));
  }, [platform]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, taskCollection), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentTask));
      list.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
      setTasks(list);
      setLoadingList(false);
    }, (err) => {
      console.error('Tasks snapshot error:', err);
      setLoadingList(false);
    });
    return () => unsub();
  }, [taskCollection]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Accounts'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
      setAccounts(list);
      if (!addAgentId && user && list.length > 0) {
        const me = list.find((a) => a.id === user.uid);
        setAddAgentId(me?.id || list[0].id);
      }
    });
    return () => unsub();
  }, [user, addAgentId]);

  useEffect(() => {
    setScreenCache<TasksCache>('tasks', { tasks, accounts, filter });
  }, [tasks, accounts, filter]);

  const myAgentIds = useMemo(() => {
    if (!user) return new Set<string>();
    const ids = new Set<string>([user.uid]);
    const byEmail = accounts.find(
      (a) => a.email?.toLowerCase() === user.email?.toLowerCase()
    );
    if (byEmail?.id) ids.add(byEmail.id);
    return ids;
  }, [user, accounts]);

  const tasksByAgent = useMemo(() => {
    const byAgent: Record<string, { account: Account; tasks: AgentTask[] }> = {};
    accounts.forEach((a) => {
      byAgent[a.id] = { account: a, tasks: [] };
    });
    const showCompleted = activeCompletedTab === 'completed';
    tasks.forEach((task) => {
      const matchesTab = showCompleted ? task.isCompleted : !task.isCompleted;
      if (!matchesTab) return;
      const key = task.agentId || 'unknown';
      if (!byAgent[key]) {
        byAgent[key] = {
          account: { id: key, name: task.agentName || '—' },
          tasks: [],
        };
      }
      const isMine = filter === 'mine' && user && (task.agentId && myAgentIds.has(task.agentId));
      if (filter === 'all' || isMine) byAgent[key].tasks.push(task);
    });
    const isMyAccount = (accountId: string) => accountId === user?.uid || myAgentIds.has(accountId);
    return Object.entries(byAgent)
      .filter(([, data]) => filter === 'all' || data.tasks.length > 0 || isMyAccount(data.account.id))
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.tasks.filter((t) => !t.isCompleted).length - a.tasks.filter((t) => !t.isCompleted).length);
  }, [tasks, accounts, filter, user, myAgentIds, activeCompletedTab]);

  const stats = useMemo(() => {
    const pending = tasks.filter((t) => !t.isCompleted);
    const overdue = pending.filter((t) => t.dueDate && t.dueDate < new Date().setHours(0, 0, 0, 0));
    const agentIds = new Set(tasks.map((t) => t.agentId).filter(Boolean));
    return { pending: pending.length, overdue: overdue.length, agents: agentIds.size };
  }, [tasks]);

  const myTasks = useMemo(
    () => tasks.filter((t) => t.agentId && myAgentIds.has(t.agentId)),
    [tasks, myAgentIds]
  );

  const myTasksStats = useMemo(() => {
    const pending = myTasks.filter((t) => !t.isCompleted);
    const completed = myTasks.filter((t) => t.isCompleted);
    const overdue = pending.filter((t) => t.dueDate && t.dueDate < new Date().setHours(0, 0, 0, 0));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = today.getTime() + 86400000;
    const dueToday = pending.filter((t) => t.dueDate && t.dueDate >= today.getTime() && t.dueDate < todayEnd);
    return {
      pending: pending.length,
      completed: completed.length,
      overdue: overdue.length,
      dueToday: dueToday.length,
      total: myTasks.length,
      progress: myTasks.length > 0 ? Math.round((completed.length / myTasks.length) * 100) : 0,
    };
  }, [myTasks]);

  const myTasksBySection = useMemo(() => {
    if (activeCompletedTab === 'completed') {
      const completed = myTasks.filter((t) => t.isCompleted);
      if (completed.length === 0) return [];
      return [{ key: 'done', label: 'tasks_section_completed', tasks: completed }];
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayStart = now.getTime();
    const todayEnd = todayStart + 86400000;
    const weekEnd = todayStart + 7 * 86400000;

    const sections: { key: string; label: string; tasks: AgentTask[] }[] = [
      { key: 'overdue', label: 'tasks_section_overdue', tasks: [] },
      { key: 'today', label: 'tasks_section_today', tasks: [] },
      { key: 'tomorrow', label: 'tasks_section_tomorrow', tasks: [] },
      { key: 'week', label: 'tasks_section_this_week', tasks: [] },
      { key: 'later', label: 'tasks_section_later', tasks: [] },
      { key: 'nodate', label: 'tasks_section_no_date', tasks: [] },
    ];

    myTasks.forEach((task) => {
      if (task.isCompleted) return;
      const ts = task.dueDate || 0;
      if (ts < todayStart) sections[0].tasks.push(task);
      else if (ts < todayEnd) sections[1].tasks.push(task);
      else if (ts < todayEnd + 86400000) sections[2].tasks.push(task);
      else if (ts < weekEnd) sections[3].tasks.push(task);
      else if (ts > 0) sections[4].tasks.push(task);
      else sections[5].tasks.push(task);
    });

    return sections.filter((s) => s.tasks.length > 0);
  }, [myTasks, activeCompletedTab]);

  const toggleComplete = async (task: AgentTask) => {
    await updateDoc(doc(db, taskCollection, task.id), {
      isCompleted: !task.isCompleted,
      completedAt: task.isCompleted ? 0 : Date.now(),
    });
  };

  const deleteTask = async (task: AgentTask) => {
    if (!confirm(t('tasks_delete_confirm'))) return;
    await deleteDoc(doc(db, taskCollection, task.id));
  };

  const openEditTask = (task: AgentTask) => {
    setEditTaskId(task.id);
    setEditTitle(task.title || '');
    setEditNotes(task.notes || '');
    setEditDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '');
    setEditPriority((task.priority ?? 0) as 0 | 1 | 2);
    setEditAgentId(task.agentId || user?.uid || accounts[0]?.id || '');
  };

  const updateTask = async () => {
    if (!editTaskId || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const selected = accounts.find((a) => a.id === editAgentId);
      const agentName = selected ? getDisplayName(selected, isRtl) : '';
      const dueTs = editDueDate ? new Date(editDueDate).getTime() : 0;
      await updateDoc(doc(db, taskCollection, editTaskId), {
        title: editTitle.trim(),
        notes: editNotes.trim() || '',
        dueDate: dueTs,
        priority: editPriority,
        agentId: editAgentId || undefined,
        agentName: agentName || undefined,
      });
      setEditTaskId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const createTask = async () => {
    if (!user || !addTitle.trim()) return;
    setAddSaving(true);
    try {
      const selected = accounts.find((a) => a.id === addAgentId);
      const agentName = selected ? getDisplayName(selected, isRtl) : '';
      const dueTs = addDueDate ? new Date(addDueDate).getTime() : 0;
      const creatorAccount = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
      const creatorName = creatorAccount ? getDisplayName(creatorAccount, isRtl) : (user.displayName || user.email || '');
      await addDoc(collection(db, taskCollection), {
        agentId: addAgentId || user.uid,
        agentName: agentName || user.displayName || user.email,
        title: addTitle.trim(),
        notes: addNotes.trim() || '',
        dueDate: dueTs,
        priority: addPriority,
        isCompleted: false,
        createdAt: Date.now(),
        createdByAgentId: user.uid,
        createdByAgentName: creatorName,
      });
      setShowAdd(false);
      setAddTitle('');
      setAddNotes('');
      setAddDueDate('');
      setAddPriority(0);
    } finally {
      setAddSaving(false);
    }
  };

  const formatDue = (ts?: number) => {
    if (!ts) return t('tasks_no_date');
    const d = new Date(ts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < today.getTime()) return t('tasks_overdue');
    if (d.getTime() === today.getTime()) return t('tasks_due_today');
    if (d.getTime() === tomorrow.getTime()) return t('tasks_due_tomorrow');
    return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const isOverdue = (ts?: number) => ts && ts < new Date().setHours(0, 0, 0, 0);

  const handleSyncCalendar = async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID;
    if (!clientId) {
      setSyncToast({ message: 'Google Calendar Client ID not configured', isError: true });
      setTimeout(() => setSyncToast(null), 4000);
      return;
    }

    setSyncing(true);
    setSyncToast(null);

    try {
      const token = await requestCalendarAccess(clientId);
      const tasksToSync = myTasks;
      const result = await syncTasksToCalendar(tasksToSync, token);

      if (result.created === 0 && result.total === 0) {
        setSyncToast({ message: t('tasks_sync_no_tasks') });
      } else {
        const msg = t('tasks_sync_success').replace('{created}', String(result.created))
          + (result.skipped > 0 ? ' ' + t('tasks_sync_skipped').replace('{skipped}', String(result.skipped)) : '');
        setSyncToast({ message: msg });
      }
      const now = Date.now();
      setLastSyncTime(now);
      localStorage.setItem(`mgsr_calendar_sync_${platform}`, String(now));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('denied') || message.includes('access_denied')) {
        setSyncToast({ message: t('tasks_sync_denied'), isError: true });
      } else {
        setSyncToast({ message: t('tasks_sync_error'), isError: true });
        console.error('Calendar sync error:', err);
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  const priorityColors = isYouth ? PRIORITY_COLORS_YOUTH : isWomen ? PRIORITY_COLORS_WOMEN : PRIORITY_COLORS;

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${accentText}`}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div
        className={`w-full max-w-7xl ${isRtl ? 'text-right' : 'text-left'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Hero stats strip */}
        <div className={`relative overflow-hidden mb-8 ${isYouth ? 'rounded-2xl shadow-[0_0_40px_rgba(0,212,255,0.12)]' : isWomen ? 'rounded-2xl shadow-[0_0_40px_rgba(232,160,191,0.12)]' : 'rounded-2xl'}`}>
          <div
            className="absolute inset-0 opacity-30"
            style={
              isYouth
                ? { background: 'linear-gradient(135deg, #00D4FF 0%, #1A2736 45%, #A855F7 100%)' }
                : isWomen
                ? { background: 'linear-gradient(135deg, #E8A0BF 0%, #1A2736 45%, #C9B1BD 100%)' }
                : { background: 'linear-gradient(135deg, #4DB6AC 0%, #1A2736 50%, #5C6BC0 100%)' }
            }
          />
          <div
            className="absolute inset-0"
            style={
              isYouth
                ? { background: 'radial-gradient(ellipse at top right, rgba(0,212,255,0.2) 0%, transparent 50%)' }
                : isWomen
                ? { background: 'radial-gradient(ellipse at top right, rgba(232,160,191,0.2) 0%, transparent 50%)' }
                : { background: 'radial-gradient(ellipse_at_top_right, rgba(77,182,172,0.15) 0%, transparent 50%)' }
            }
          />
          <div
            className="absolute inset-0"
            style={
              isYouth
                ? { background: 'radial-gradient(ellipse at bottom left, rgba(168,85,247,0.12) 0%, transparent 50%)' }
                : isWomen
                ? { background: 'radial-gradient(ellipse at bottom left, rgba(212,165,165,0.12) 0%, transparent 50%)' }
                : { background: 'radial-gradient(ellipse_at_bottom_left, rgba(92,107,192,0.1) 0%, transparent 50%)' }
            }
          />
          <div className="relative flex flex-wrap items-center justify-between gap-3 sm:gap-6 p-4 sm:p-6 md:p-8">
            <div className="flex items-center gap-3 sm:gap-4 lg:gap-6">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-4xl font-bold text-mgsr-text font-display tracking-tight">
                {isYouth ? t('tasks_title') : isWomen ? t('tasks_title_women') : t('tasks_title')}
              </h1>
              <button
                onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
                className="hidden lg:block px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-mgsr-text/90 hover:bg-white/10 transition text-sm font-medium"
              >
                {lang === 'en' ? 'עברית' : 'English'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-6">
              <div className="flex items-center gap-2">
                <span className={`text-lg sm:text-xl lg:text-3xl font-bold font-display ${accentText}`}>
                  {stats.pending}
                </span>
                <span className="text-mgsr-muted text-sm lg:text-base">{t('tasks_filter_pending')}</span>
              </div>
              <div className="w-px h-6 lg:h-8 bg-mgsr-border" />
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl lg:text-3xl font-bold text-mgsr-red font-display">
                  {stats.overdue}
                </span>
                <span className="text-mgsr-muted text-sm lg:text-base">{t('tasks_overdue_count')}</span>
              </div>
              <div className="w-px h-6 lg:h-8 bg-mgsr-border" />
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl lg:text-3xl font-bold text-mgsr-text font-display">
                  {stats.agents}
                </span>
                <span className="text-mgsr-muted">{t('tasks_agents')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className={`flex overflow-hidden border border-mgsr-border bg-mgsr-card/60 p-0.5 ${isYouth || isWomen ? 'rounded-2xl' : 'rounded-xl'}`}>
            {(['all', 'mine'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-5 py-2.5 text-sm font-medium transition ${
                  filter === f
                    ? `${accentBg} text-mgsr-dark`
                    : 'text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {f === 'all' ? (isWomen ? t('tasks_all_agents_women') : t('tasks_all_agents')) : (isWomen ? t('tasks_my_tasks_women') : t('tasks_my_tasks'))}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleSyncCalendar}
              disabled={syncing}
              className={`flex items-center gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition border ${
                isYouth
                  ? 'rounded-2xl border-[var(--youth-cyan)]/30 bg-[var(--youth-cyan)]/10 text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/20'
                  : isWomen
                  ? 'rounded-2xl border-[var(--women-rose)]/30 bg-[var(--women-rose)]/10 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/20'
                  : 'rounded-xl border-mgsr-teal/30 bg-mgsr-teal/10 text-mgsr-teal hover:bg-mgsr-teal/20'
              } ${syncing ? 'opacity-60 cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
            >
              {syncing ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              )}
              {syncing ? t('tasks_syncing') : t('tasks_sync_calendar')}
              {lastSyncTime && !syncing && (
                <span className="hidden sm:inline text-[10px] opacity-60 font-normal">
                  {t('tasks_last_sync')}{' '}
                  {new Date(lastSyncTime).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}{' '}
                  {new Date(lastSyncTime).toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold transition ${
                isYouth
                  ? 'rounded-2xl bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-mgsr-dark shadow-lg shadow-[var(--youth-cyan)]/25 hover:opacity-90 hover:-translate-y-0.5'
                  : isWomen
                  ? 'rounded-2xl bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90 hover:-translate-y-0.5'
                  : 'rounded-xl bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90 shadow-lg shadow-mgsr-teal/25 hover:shadow-mgsr-teal/40 hover:-translate-y-0.5'
              }`}
            >
              <span className="text-xl leading-none">+</span>
              {isWomen ? t('tasks_add_women') : t('tasks_add')}
            </button>
          </div>
        </div>

        {/* Calendar sync toast */}
        {syncToast && (
          <div className={`mb-6 px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all ${
            syncToast.isError
              ? 'bg-red-500/15 text-red-400 border border-red-500/20'
              : isYouth
              ? 'bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)] border border-[var(--youth-cyan)]/20'
              : isWomen
              ? 'bg-[var(--women-rose)]/15 text-[var(--women-rose)] border border-[var(--women-rose)]/20'
              : 'bg-mgsr-teal/15 text-mgsr-teal border border-mgsr-teal/20'
          }`}>
            {syncToast.isError ? (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            ) : (
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            )}
            {syncToast.message}
          </div>
        )}

        {/* Content: My tasks (personal view) vs All agents (team lanes) */}
        {loadingList ? (
          <div className={`flex items-center gap-3 py-20 text-mgsr-muted`}>
            <div className={`w-3 h-3 rounded-full animate-pulse ${isYouth ? 'bg-[var(--youth-cyan)]/50' : isWomen ? 'bg-[var(--women-rose)]/50' : 'bg-mgsr-teal/50'}`} />
            {t('tasks_loading')}
          </div>
        ) : filter === 'mine' ? (
          /* ─── My tasks: personal, informative, grouped by time ─── */
          myTasks.length === 0 ? (
            <div className={`relative overflow-hidden py-24 px-8 text-center ${isYouth ? 'rounded-2xl border border-[var(--youth-cyan)]/20 bg-mgsr-card/30 shadow-[0_0_30px_rgba(0,212,255,0.06)] backdrop-blur-sm' : isWomen ? 'rounded-2xl border border-mgsr-border bg-mgsr-card/30 shadow-[0_0_30px_rgba(232,160,191,0.06)]' : 'rounded-2xl border border-mgsr-border bg-mgsr-card/30'}`}>
              <div className={`absolute inset-0 ${isYouth ? 'bg-gradient-to-b from-[var(--youth-cyan)]/5 to-transparent' : isWomen ? 'bg-gradient-to-b from-[var(--women-rose)]/5 to-transparent' : 'bg-gradient-to-b from-mgsr-teal/5 to-transparent'}`} />
              <p className="relative text-mgsr-muted text-xl">{isWomen ? t('tasks_empty_women') : t('tasks_empty')}</p>
              <p className="relative text-mgsr-muted/80 text-sm mt-2">{isWomen ? t('tasks_empty_hint_women') : t('tasks_empty_hint')}</p>
              <button
                onClick={() => setShowAdd(true)}
                className={`relative mt-8 px-8 py-4 font-semibold transition rounded-2xl ${accentBg20} ${accentText} ${accentHoverBg30}`}
              >
                {isWomen ? t('tasks_add_women') : t('tasks_add')}
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Personal stats & progress */}
              <div className={`relative overflow-hidden rounded-2xl border border-mgsr-border ${isYouth ? 'shadow-[0_0_30px_rgba(0,212,255,0.08)]' : isWomen ? 'shadow-[0_0_30px_rgba(232,160,191,0.08)]' : ''}`}>
                <div
                  className="absolute inset-0 opacity-20"
                  style={
                    isYouth
                      ? { background: 'linear-gradient(120deg, #00D4FF 0%, transparent 40%, #A855F7 100%)' }
                      : isWomen
                      ? { background: 'linear-gradient(120deg, #E8A0BF 0%, transparent 40%, #C9B1BD 100%)' }
                      : { background: 'linear-gradient(120deg, #4DB6AC 0%, transparent 40%, #5C6BC0 100%)' }
                  }
                />
                <div className="relative p-6 md:p-8">
                  <div className="flex flex-wrap items-center gap-8 mb-6">
                    <div>
                      <p className="text-sm text-mgsr-muted mb-1">{t('tasks_progress')}</p>
                      <p className={`text-4xl font-bold font-display ${accentText}`}>
                        {myTasksStats.completed}/{myTasksStats.total}
                      </p>
                      <p className="text-sm text-mgsr-muted">{t('tasks_completed_count')}</p>
                    </div>
                    <div className="h-12 w-px bg-mgsr-border" />
                    <div className="flex flex-wrap gap-6">
                      <div>
                        <p className="text-2xl font-bold text-mgsr-text font-display">
                          {myTasksStats.pending}
                        </p>
                        <p className="text-xs text-mgsr-muted">{t('tasks_filter_pending')}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-mgsr-red font-display">
                          {myTasksStats.overdue}
                        </p>
                        <p className="text-xs text-mgsr-muted">{t('tasks_overdue_count')}</p>
                      </div>
                      <div>
                        <p className={`text-2xl font-bold font-display ${accentText}`}>
                          {myTasksStats.dueToday}
                        </p>
                        <p className="text-xs text-mgsr-muted">{t('tasks_due_today_count')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="h-2 bg-mgsr-dark rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${accentBg}`}
                      style={{ width: `${myTasksStats.progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Active / Completed tabs */}
              <div className={`flex overflow-hidden border border-mgsr-border bg-mgsr-card/60 p-0.5 w-fit rounded-2xl`}>
                {(['active', 'completed'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveCompletedTab(tab)}
                    className={`px-5 py-2.5 text-sm font-medium transition rounded-xl ${
                      activeCompletedTab === tab
                        ? `${accentBg} text-mgsr-dark`
                        : 'text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    {tab === 'active' ? t('tasks_tab_active') : t('tasks_section_completed')}
                  </button>
                ))}
              </div>

              {/* Tasks grouped by section */}
              <div className="space-y-8">
                {myTasksBySection.length === 0 ? (
                  <div className={`py-12 px-6 text-center rounded-2xl border border-mgsr-border ${isWomen ? 'bg-mgsr-card/30' : 'bg-mgsr-card/30'}`}>
                    <p className="text-mgsr-muted">
                      {activeCompletedTab === 'completed' ? t('tasks_no_completed') : t('tasks_no_active')}
                    </p>
                  </div>
                ) : (
                  <>
                    {myTasksBySection.map((section, sectionIdx) => (
                  <div key={section.key} className="animate-slide-up" style={{ animationDelay: `${sectionIdx * 40}ms` }}>
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider">
                        {t(section.label)}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-mgsr-card border border-mgsr-border text-mgsr-muted">
                        {section.tasks.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {section.tasks.map((task) => {
                        const priority = priorityColors[(task.priority ?? 0) as 0 | 1 | 2] || priorityColors[0];
                        const overdue = isOverdue(task.dueDate);
                        const isDone = section.key === 'done';
                        return (
                          <div
                            key={task.id}
                            className={`group relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                              isDone
                                ? 'bg-mgsr-card/30 border-mgsr-border/50'
                                : isYouth
                                  ? 'bg-mgsr-card/70 border-mgsr-border hover:border-[var(--youth-cyan)]/30 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)]'
                                  : isWomen
                                    ? 'bg-mgsr-card/70 border-mgsr-border hover:border-[var(--women-rose)]/30 hover:shadow-[0_0_20px_rgba(232,160,191,0.1)]'
                                    : 'bg-mgsr-card/70 border-mgsr-border hover:border-mgsr-teal/30 hover:shadow-lg'
                            }`}
                          >
                            <div
                              className="absolute top-0 bottom-0 w-1 rounded-full"
                              style={{
                                left: isRtl ? 'auto' : 0,
                                right: isRtl ? 0 : 'auto',
                                backgroundColor: priority.accent,
                                opacity: isDone ? 0.3 : 0.9,
                              }}
                            />
                            <button
                              onClick={() => toggleComplete(task)}
                              className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition ${
                                task.isCompleted
                                  ? `${borderAccent} ${accentBg}`
                                  : `border-mgsr-muted ${hoverBorderAccent}`
                              }`}
                            >
                              {task.isCompleted && (
                                <span className="text-mgsr-dark text-sm font-bold">✓</span>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`font-semibold ${
                                  task.isCompleted ? 'line-through text-mgsr-muted' : 'text-mgsr-text'
                                }`}
                              >
                                {task.title || '—'}
                              </p>
                              {task.notes && (
                                <p className="text-sm text-mgsr-muted mt-1.5">{task.notes}</p>
                              )}
                              {/* Creator & assignee info */}
                              {task.createdByAgentName && (
                                <p className="text-xs text-mgsr-muted mt-1.5">
                                  {t('tasks_opened_by')} <span className={accentText}>{task.createdByAgentName}</span>
                                  {task.agentName && task.agentName !== task.createdByAgentName && <> · {t('tasks_assigned_to_label')} <span className="text-mgsr-text">{task.agentName}</span></>}
                                </p>
                              )}
                              {/* Linked agent contact */}
                              {task.linkedAgentContactName && (
                                <p className="text-xs text-mgsr-muted mt-1">
                                  {t('tasks_linked_agent')}: <span className="text-mgsr-text">{task.linkedAgentContactName}</span>
                                  {task.linkedAgentContactPhone && (
                                    <a href={`tel:${task.linkedAgentContactPhone}`} className={`ms-1.5 ${accentText} hover:underline`}>{task.linkedAgentContactPhone}</a>
                                  )}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-3">
                                <span
                                  className="text-xs px-2.5 py-1 rounded-lg font-medium"
                                  style={{
                                    backgroundColor: priority.bg,
                                    color: priority.accent,
                                  }}
                                >
                                  {t(`tasks_priority_${priority.label}`)}
                                </span>
                                {task.createdAt && (
                                  <span className="text-xs px-2.5 py-1 rounded-lg bg-mgsr-dark/60 text-mgsr-muted">
                                    {t('tasks_created_on')} {new Date(task.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                                <span
                                  className={`text-xs px-2.5 py-1 rounded-lg ${
                                    overdue && !task.isCompleted
                                      ? 'bg-mgsr-red/20 text-mgsr-red font-medium'
                                      : 'bg-mgsr-dark/60 text-mgsr-muted'
                                  }`}
                                >
                                  {task.dueDate ? `${t('tasks_due_label')} ${formatDue(task.dueDate)}` : formatDue(task.dueDate)}
                                </span>
                                {task.playerId && task.playerName && (
                                  <Link
                                    href={platform === 'youth' ? `/players/youth/${task.playerId}?from=/tasks` : platform === 'women' ? `/players/women/${task.playerId}?from=/tasks` : `/players/${task.playerId}?from=/tasks`}
                                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${accentBg20} ${accentText} ${accentHoverBg30}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {task.playerName}
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditTask(task); }}
                                className="p-2 rounded-lg text-mgsr-muted hover:text-mgsr-teal hover:bg-mgsr-teal/10 transition"
                                title={t('tasks_edit')}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteTask(task); }}
                                className="p-2 rounded-lg text-mgsr-muted hover:text-mgsr-red hover:bg-mgsr-red/10 transition"
                                title={t('tasks_delete')}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        ) : tasksByAgent.length === 0 ? (
          <div className={`relative overflow-hidden py-24 px-8 text-center ${isYouth ? 'rounded-2xl border border-[var(--youth-cyan)]/20 bg-mgsr-card/30 shadow-[0_0_30px_rgba(0,212,255,0.06)] backdrop-blur-sm' : isWomen ? 'rounded-2xl border border-mgsr-border bg-mgsr-card/30 shadow-[0_0_30px_rgba(232,160,191,0.06)]' : 'rounded-2xl border border-mgsr-border bg-mgsr-card/30'}`}>
            <div className={`absolute inset-0 ${isYouth ? 'bg-gradient-to-b from-[var(--youth-cyan)]/5 to-transparent' : isWomen ? 'bg-gradient-to-b from-[var(--women-rose)]/5 to-transparent' : 'bg-gradient-to-b from-mgsr-teal/5 to-transparent'}`} />
            <p className="relative text-mgsr-muted text-xl">{isWomen ? t('tasks_empty_women') : t('tasks_empty')}</p>
            <p className="relative text-mgsr-muted/80 text-sm mt-2">{isWomen ? t('tasks_empty_hint_women') : t('tasks_empty_hint')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className={`relative mt-8 px-8 py-4 font-semibold transition rounded-2xl ${accentBg20} ${accentText} ${accentHoverBg30}`}
            >
              {isWomen ? t('tasks_add_women') : t('tasks_add')}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active / Completed tabs for All agents view */}
            <div className={`flex overflow-hidden border border-mgsr-border bg-mgsr-card/60 p-0.5 w-fit rounded-2xl`}>
              {(['active', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveCompletedTab(tab)}
                  className={`px-5 py-2.5 text-sm font-medium transition rounded-xl ${
                    activeCompletedTab === tab
                      ? `${accentBg} text-mgsr-dark`
                      : 'text-mgsr-muted hover:text-mgsr-text'
                  }`}
                >
                  {tab === 'active' ? t('tasks_tab_active') : t('tasks_section_completed')}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {tasksByAgent.map(({ id, account, tasks: agentTasks }, agentIdx) => {
              const colors = isYouth ? AGENT_COLORS_YOUTH : isWomen ? AGENT_COLORS_WOMEN : AGENT_COLORS;
              const color = colors[agentIdx % colors.length];
              const pending = agentTasks.filter((t) => !t.isCompleted).length;
              const isMe = account.id === user?.uid;
              return (
                <div
                  key={id}
                  className="flex flex-col rounded-2xl border border-mgsr-border bg-mgsr-card/50 overflow-hidden animate-slide-up"
                  style={{ animationDelay: `${agentIdx * 50}ms` }}
                >
                  {/* Agent header */}
                  <div
                    className="relative p-4"
                    style={{
                      background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
                      borderBottom: `2px solid ${color}40`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold font-display text-white"
                        style={{ backgroundColor: color }}
                      >
                        {(getDisplayName(account, isRtl) || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-mgsr-text truncate">
                          {getDisplayName(account, isRtl)}
                          {isMe && (
                            <span className={`text-xs ms-2 ${accentText}`}>({isWomen ? t('tasks_my_tasks_women') : t('tasks_my_tasks')})</span>
                          )}
                        </p>
                        <p className="text-sm text-mgsr-muted">
                          {pending} {t('tasks_filter_pending')} · {agentTasks.length} {t('tasks_filter_all')}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Task cards */}
                  <div className="flex-1 p-4 space-y-3 min-h-[120px]">
                    {agentTasks.length === 0 ? (
                      <p className="text-sm text-mgsr-muted mt-4 text-center">
                        {t('tasks_empty')}
                      </p>
                    ) : (
                      agentTasks.map((task) => {
                        const priority = priorityColors[(task.priority ?? 0) as 0 | 1 | 2] || priorityColors[0];
                        const overdue = isOverdue(task.dueDate);
                        return (
                          <div
                            key={task.id}
                            className={`group relative flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 hover:shadow-lg ${
                              task.isCompleted
                                ? 'bg-mgsr-card/30 border-mgsr-border/50 opacity-75'
                                : isYouth
                                  ? 'bg-mgsr-card/80 border-mgsr-border hover:border-[var(--youth-cyan)]/30'
                                  : isWomen
                                    ? 'bg-mgsr-card/80 border-mgsr-border hover:border-[var(--women-rose)]/30'
                                    : 'bg-mgsr-card/80 border-mgsr-border hover:border-mgsr-teal/30'
                            }`}
                          >
                            <div
                              className="absolute top-0 bottom-0 w-1 rounded-full"
                              style={{
                                left: isRtl ? 'auto' : 0,
                                right: isRtl ? 0 : 'auto',
                                backgroundColor: priority.accent,
                                opacity: task.isCompleted ? 0.4 : 0.9,
                              }}
                            />
                            <button
                              onClick={() => toggleComplete(task)}
                              className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition ${
                                task.isCompleted
                                  ? `${borderAccent} ${accentBg}`
                                  : `border-mgsr-muted ${hoverBorderAccent}`
                              }`}
                            >
                              {task.isCompleted && (
                                <span className="text-mgsr-dark text-xs font-bold">✓</span>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`font-medium ${
                                  task.isCompleted ? 'line-through text-mgsr-muted' : 'text-mgsr-text'
                                }`}
                              >
                                {task.title || '—'}
                              </p>
                              {task.notes && (
                                <p className="text-sm text-mgsr-muted mt-1 line-clamp-2">{task.notes}</p>
                              )}
                              {/* Creator info when different from assignee */}
                              {task.createdByAgentName && (
                                <p className="text-[10px] text-mgsr-muted mt-1">
                                  {t('tasks_opened_by')} <span className={accentText}>{task.createdByAgentName}</span>
                                </p>
                              )}
                              {/* Linked agent contact */}
                              {task.linkedAgentContactName && (
                                <p className="text-[10px] text-mgsr-muted mt-0.5">
                                  {t('tasks_linked_agent')}: <span className="text-mgsr-text">{task.linkedAgentContactName}</span>
                                  {task.linkedAgentContactPhone && (
                                    <a href={`tel:${task.linkedAgentContactPhone}`} className={`ms-1 ${accentText} hover:underline`}>{task.linkedAgentContactPhone}</a>
                                  )}
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-2">
                                <span
                                  className="text-[10px] px-2 py-0.5 rounded font-medium"
                                  style={{
                                    backgroundColor: priority.bg,
                                    color: priority.accent,
                                  }}
                                >
                                  {t(`tasks_priority_${priority.label}`)}
                                </span>
                                {task.createdAt && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-mgsr-dark/50 text-mgsr-muted">
                                    {t('tasks_created_on')} {new Date(task.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded ${
                                    overdue && !task.isCompleted
                                      ? 'bg-mgsr-red/20 text-mgsr-red'
                                      : 'bg-mgsr-dark/50 text-mgsr-muted'
                                  }`}
                                >
                                  {task.dueDate ? `${t('tasks_due_label')} ${formatDue(task.dueDate)}` : formatDue(task.dueDate)}
                                </span>
                                {task.playerId && task.playerName && (
                                  <Link
                                    href={platform === 'youth' ? `/players/youth/${task.playerId}?from=/tasks` : platform === 'women' ? `/players/women/${task.playerId}?from=/tasks` : `/players/${task.playerId}?from=/tasks`}
                                    className={`text-[10px] px-2 py-0.5 rounded font-medium transition ${accentBg20} ${accentText} ${accentHoverBg30}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {task.playerName}
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditTask(task); }}
                                className={`p-1.5 rounded-lg text-mgsr-muted transition ${isYouth ? 'hover:text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/10' : isWomen ? 'hover:text-[var(--women-rose)] hover:bg-[var(--women-rose)]/10' : 'hover:text-mgsr-teal hover:bg-mgsr-teal/10'}`}
                                title={t('tasks_edit')}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteTask(task); }}
                                className="p-1.5 rounded-lg text-mgsr-muted hover:text-mgsr-red hover:bg-mgsr-red/10 transition"
                                title={t('tasks_delete')}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Add task modal */}
        {showAdd && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isYouth ? 'bg-black/70 backdrop-blur-md animate-fade-in' : isWomen ? 'women-dialog-backdrop' : 'bg-black/70 backdrop-blur-md animate-fade-in'}`}
            onClick={() => !addSaving && setShowAdd(false)}
          >
            <div
              className={`w-full max-w-md rounded-2xl bg-mgsr-card animate-slide-up overflow-hidden ${isYouth ? 'border border-[var(--youth-cyan)]/20 shadow-[0_0_40px_rgba(0,212,255,0.15)]' : isWomen ? 'women-dialog-content' : 'border border-mgsr-border shadow-2xl'}`}
              onClick={(e) => e.stopPropagation()}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {isYouth && <div className="h-1 w-full bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)]" />}
              {isWomen && <div className="women-dialog-accent" />}
              <div className={`p-6 ${isWomen ? 'border-b border-mgsr-border/50' : 'border-b border-mgsr-border'}`}>
                <h2 className="text-xl font-bold text-mgsr-text font-display">
                  {t('tasks_new_task')}
                </h2>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-mgsr-muted mb-2">
                    {t('tasks_what_needs_done')}
                  </label>
                  <input
                    type="text"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder={t('tasks_what_needs_done')}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none ${focusBorder}`}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-mgsr-muted mb-2">
                    {t('tasks_due_date')}
                  </label>
                  <input
                    type="date"
                    value={addDueDate}
                    onChange={(e) => setAddDueDate(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${focusBorder}`}
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
                        onClick={() => setAddPriority(p)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                          addPriority === p ? 'border-2' : 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-muted hover:text-mgsr-text'
                        }`}
                        style={
                          addPriority === p
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
                    value={addAgentId}
                    onChange={(e) => setAddAgentId(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${focusBorder}`}
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
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    placeholder={t('tasks_notes_hint')}
                    rows={3}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none resize-none ${focusBorder}`}
                  />
                </div>
              </div>
              <div className="p-6 pt-0 flex gap-3">
                <button
                  onClick={() => setShowAdd(false)}
                  disabled={addSaving}
                  className={`flex-1 py-3 rounded-xl border transition disabled:opacity-50 ${isYouth ? 'border-mgsr-border text-mgsr-muted hover:bg-[var(--youth-cyan)]/10 hover:text-[var(--youth-cyan)] hover:border-[var(--youth-cyan)]/30' : isWomen ? 'border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30' : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80'}`}
                >
                  {t('tasks_cancel')}
                </button>
                <button
                  onClick={createTask}
                  disabled={addSaving || !addTitle.trim()}
                  className={`flex-1 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${isYouth ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.25)] hover:opacity-95' : isWomen ? 'bg-[var(--women-gradient)] text-white shadow-[0_0_20px_rgba(232,160,191,0.25)] hover:opacity-95' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
                >
                  {addSaving ? '...' : t('tasks_create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit task modal */}
        {editTaskId && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isYouth ? 'bg-black/70 backdrop-blur-md animate-fade-in' : isWomen ? 'women-dialog-backdrop' : 'bg-black/70 backdrop-blur-md animate-fade-in'}`}
            onClick={() => !editSaving && setEditTaskId(null)}
          >
            <div
              className={`w-full max-w-md rounded-2xl bg-mgsr-card animate-slide-up overflow-hidden ${isYouth ? 'border border-[var(--youth-cyan)]/20 shadow-[0_0_40px_rgba(0,212,255,0.15)]' : isWomen ? 'women-dialog-content' : 'border border-mgsr-border shadow-2xl'}`}
              onClick={(e) => e.stopPropagation()}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {isYouth && <div className="h-1 w-full bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)]" />}
              {isWomen && <div className="women-dialog-accent" />}
              <div className={`p-6 ${isWomen ? 'border-b border-mgsr-border/50' : 'border-b border-mgsr-border'}`}>
                <h2 className="text-xl font-bold text-mgsr-text font-display">
                  {t('tasks_edit')}
                </h2>
              </div>
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-mgsr-muted mb-2">
                    {t('tasks_what_needs_done')}
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder={t('tasks_what_needs_done')}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none ${focusBorder}`}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-mgsr-muted mb-2">
                    {t('tasks_due_date')}
                  </label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${focusBorder}`}
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
                        onClick={() => setEditPriority(p)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                          editPriority === p ? 'border-2' : 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-muted hover:text-mgsr-text'
                        }`}
                        style={
                          editPriority === p
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
                    value={editAgentId}
                    onChange={(e) => setEditAgentId(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${focusBorder}`}
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
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder={t('tasks_notes_hint')}
                    rows={3}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none resize-none ${focusBorder}`}
                  />
                </div>
              </div>
              <div className="p-6 pt-0 flex gap-3">
                <button
                  onClick={() => setEditTaskId(null)}
                  disabled={editSaving}
                  className={`flex-1 py-3 rounded-xl border transition disabled:opacity-50 ${isYouth ? 'border-mgsr-border text-mgsr-muted hover:bg-[var(--youth-cyan)]/10 hover:text-[var(--youth-cyan)] hover:border-[var(--youth-cyan)]/30' : isWomen ? 'border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30' : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80'}`}
                >
                  {t('tasks_cancel')}
                </button>
                <button
                  onClick={updateTask}
                  disabled={editSaving || !editTitle.trim()}
                  className={`flex-1 py-3 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${isYouth ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.25)] hover:opacity-95' : isWomen ? 'bg-[var(--women-gradient)] text-white shadow-[0_0_20px_rgba(232,160,191,0.25)] hover:opacity-95' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
                >
                  {editSaving ? '...' : t('tasks_save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
