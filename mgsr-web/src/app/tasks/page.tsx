'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  collection,
  onSnapshot,
  updateDoc,
  addDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';

interface AgentTask {
  id: string;
  title?: string;
  notes?: string;
  dueDate?: number;
  isCompleted?: boolean;
  priority?: number;
  agentId?: string;
  agentName?: string;
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

const PRIORITY_COLORS = {
  0: { bg: 'rgba(77, 182, 172, 0.25)', accent: '#4DB6AC', label: 'low' },
  1: { bg: 'rgba(255, 112, 67, 0.25)', accent: '#FF7043', label: 'medium' },
  2: { bg: 'rgba(229, 57, 53, 0.25)', accent: '#E53935', label: 'high' },
};

const getDisplayName = (a: Account, isRtl: boolean) =>
  isRtl ? a.hebrewName || a.name || a.email || '—' : a.name || a.hebrewName || a.email || '—';

export default function TasksPage() {
  const { user, loading } = useAuth();
  const { lang, setLang, t, isRtl } = useLanguage();
  const router = useRouter();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addPriority, setAddPriority] = useState(0);
  const [addAgentId, setAddAgentId] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'AgentTasks'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentTask));
      list.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
      setTasks(list);
      setLoadingList(false);
    });
    return () => unsub();
  }, []);

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
    tasks.forEach((task) => {
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
  }, [tasks, accounts, filter, user, myAgentIds]);

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

    const completed = myTasks.filter((t) => t.isCompleted);
    if (completed.length > 0) {
      sections.push({ key: 'done', label: 'tasks_section_completed', tasks: completed });
    }

    return sections.filter((s) => s.tasks.length > 0);
  }, [myTasks]);

  const toggleComplete = async (task: AgentTask) => {
    await updateDoc(doc(db, 'AgentTasks', task.id), {
      isCompleted: !task.isCompleted,
      completedAt: task.isCompleted ? 0 : Date.now(),
    });
  };

  const createTask = async () => {
    if (!user || !addTitle.trim()) return;
    setAddSaving(true);
    try {
      const selected = accounts.find((a) => a.id === addAgentId);
      const agentName = selected ? getDisplayName(selected, isRtl) : '';
      const dueTs = addDueDate ? new Date(addDueDate).getTime() : 0;
      await addDoc(collection(db, 'AgentTasks'), {
        agentId: addAgentId || user.uid,
        agentName: agentName || user.displayName || user.email,
        title: addTitle.trim(),
        notes: addNotes.trim() || '',
        dueDate: dueTs,
        priority: addPriority,
        isCompleted: false,
        createdAt: Date.now(),
        createdByAgentId: user.uid,
        createdByAgentName: user.displayName || user.email || '',
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

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div
        className={`w-full max-w-[1600px] ${isRtl ? 'text-right' : 'text-left'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Hero stats strip */}
        <div className="relative overflow-hidden rounded-2xl mb-8">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: `linear-gradient(135deg, #4DB6AC 0%, #1A2736 50%, #5C6BC0 100%)`,
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(77,182,172,0.15)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(92,107,192,0.1)_0%,transparent_50%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 md:p-8">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl md:text-4xl font-bold text-mgsr-text font-display tracking-tight">
                {t('tasks_title')}
              </h1>
              <button
                onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
                className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-mgsr-text/90 hover:bg-white/10 transition text-sm font-medium"
              >
                {lang === 'en' ? 'עברית' : 'English'}
              </button>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-mgsr-teal font-display">
                  {stats.pending}
                </span>
                <span className="text-mgsr-muted">{t('tasks_filter_pending')}</span>
              </div>
              <div className="w-px h-8 bg-mgsr-border" />
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-mgsr-red font-display">
                  {stats.overdue}
                </span>
                <span className="text-mgsr-muted">{t('tasks_overdue_count')}</span>
              </div>
              <div className="w-px h-8 bg-mgsr-border" />
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-mgsr-text font-display">
                  {stats.agents}
                </span>
                <span className="text-mgsr-muted">{t('tasks_agents')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex rounded-xl overflow-hidden border border-mgsr-border bg-mgsr-card/60 p-0.5">
            {(['all', 'mine'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-5 py-2.5 text-sm font-medium transition ${
                  filter === f ? 'bg-mgsr-teal text-mgsr-dark' : 'text-mgsr-muted hover:text-mgsr-text'
                }`}
              >
                {f === 'all' ? t('tasks_all_agents') : t('tasks_my_tasks')}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition shadow-lg shadow-mgsr-teal/25 hover:shadow-mgsr-teal/40 hover:-translate-y-0.5"
          >
            <span className="text-xl leading-none">+</span>
            {t('tasks_add')}
          </button>
        </div>

        {/* Content: My tasks (personal view) vs All agents (team lanes) */}
        {loadingList ? (
          <div className="flex items-center gap-3 py-20 text-mgsr-muted">
            <div className="w-3 h-3 rounded-full bg-mgsr-teal/50 animate-pulse" />
            {t('tasks_loading')}
          </div>
        ) : filter === 'mine' ? (
          /* ─── My tasks: personal, informative, grouped by time ─── */
          myTasks.length === 0 ? (
            <div className="relative overflow-hidden py-24 px-8 rounded-2xl border border-mgsr-border bg-mgsr-card/30 text-center">
              <div className="absolute inset-0 bg-gradient-to-b from-mgsr-teal/5 to-transparent" />
              <p className="relative text-mgsr-muted text-xl">{t('tasks_empty')}</p>
              <p className="relative text-mgsr-muted/80 text-sm mt-2">{t('tasks_empty_hint')}</p>
              <button
                onClick={() => setShowAdd(true)}
                className="relative mt-8 px-8 py-4 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-semibold hover:bg-mgsr-teal/30 transition"
              >
                {t('tasks_add')}
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Personal stats & progress */}
              <div className="relative overflow-hidden rounded-2xl border border-mgsr-border">
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    background: 'linear-gradient(120deg, #4DB6AC 0%, transparent 40%, #5C6BC0 100%)',
                  }}
                />
                <div className="relative p-6 md:p-8">
                  <div className="flex flex-wrap items-center gap-8 mb-6">
                    <div>
                      <p className="text-sm text-mgsr-muted mb-1">{t('tasks_progress')}</p>
                      <p className="text-4xl font-bold text-mgsr-teal font-display">
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
                        <p className="text-2xl font-bold text-mgsr-teal font-display">
                          {myTasksStats.dueToday}
                        </p>
                        <p className="text-xs text-mgsr-muted">{t('tasks_due_today_count')}</p>
                      </div>
                    </div>
                  </div>
                  <div className="h-2 bg-mgsr-dark rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-mgsr-teal transition-all duration-700"
                      style={{ width: `${myTasksStats.progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Tasks grouped by section */}
              <div className="space-y-8">
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
                        const priority = PRIORITY_COLORS[(task.priority ?? 0) as 0 | 1 | 2] || PRIORITY_COLORS[0];
                        const overdue = isOverdue(task.dueDate);
                        const isDone = section.key === 'done';
                        return (
                          <div
                            key={task.id}
                            className={`group relative flex items-start gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                              isDone
                                ? 'bg-mgsr-card/30 border-mgsr-border/50'
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
                                  ? 'border-mgsr-teal bg-mgsr-teal'
                                  : 'border-mgsr-muted hover:border-mgsr-teal'
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
                                <span
                                  className={`text-xs px-2.5 py-1 rounded-lg ${
                                    overdue && !task.isCompleted
                                      ? 'bg-mgsr-red/20 text-mgsr-red font-medium'
                                      : 'bg-mgsr-dark/60 text-mgsr-muted'
                                  }`}
                                >
                                  {formatDue(task.dueDate)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : tasksByAgent.length === 0 ? (
          <div className="relative overflow-hidden py-24 px-8 rounded-2xl border border-mgsr-border bg-mgsr-card/30 text-center">
            <div className="absolute inset-0 bg-gradient-to-b from-mgsr-teal/5 to-transparent" />
            <p className="relative text-mgsr-muted text-xl">{t('tasks_empty')}</p>
            <p className="relative text-mgsr-muted/80 text-sm mt-2">{t('tasks_empty_hint')}</p>
            <button
              onClick={() => setShowAdd(true)}
              className="relative mt-8 px-8 py-4 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-semibold hover:bg-mgsr-teal/30 transition"
            >
              {t('tasks_add')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {tasksByAgent.map(({ id, account, tasks: agentTasks }, agentIdx) => {
              const color = AGENT_COLORS[agentIdx % AGENT_COLORS.length];
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
                            <span className="text-xs text-mgsr-teal ms-2">({t('tasks_my_tasks')})</span>
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
                        const priority = PRIORITY_COLORS[(task.priority ?? 0) as 0 | 1 | 2] || PRIORITY_COLORS[0];
                        const overdue = isOverdue(task.dueDate);
                        return (
                          <div
                            key={task.id}
                            className={`group relative p-4 rounded-xl border transition-all duration-200 hover:shadow-lg ${
                              task.isCompleted
                                ? 'bg-mgsr-card/30 border-mgsr-border/50 opacity-75'
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
                            <div className="flex items-start gap-3">
                              <button
                                onClick={() => toggleComplete(task)}
                                className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition ${
                                  task.isCompleted
                                    ? 'border-mgsr-teal bg-mgsr-teal'
                                    : 'border-mgsr-muted hover:border-mgsr-teal'
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
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded ${
                                      overdue && !task.isCompleted
                                        ? 'bg-mgsr-red/20 text-mgsr-red'
                                        : 'bg-mgsr-dark/50 text-mgsr-muted'
                                    }`}
                                  >
                                    {formatDue(task.dueDate)}
                                  </span>
                                </div>
                              </div>
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
        )}

        {/* Add task modal */}
        {showAdd && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={() => !addSaving && setShowAdd(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-mgsr-border bg-mgsr-card shadow-2xl animate-slide-up"
              onClick={(e) => e.stopPropagation()}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div className="p-6 border-b border-mgsr-border">
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
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:border-mgsr-teal focus:outline-none"
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
                        onClick={() => setAddPriority(p)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                          addPriority === p ? 'border-2' : 'border border-mgsr-border bg-mgsr-dark/50 text-mgsr-muted hover:text-mgsr-text'
                        }`}
                        style={
                          addPriority === p
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
                    value={addAgentId}
                    onChange={(e) => setAddAgentId(e.target.value)}
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
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    placeholder={t('tasks_notes_hint')}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:border-mgsr-teal focus:outline-none resize-none"
                  />
                </div>
              </div>
              <div className="p-6 pt-0 flex gap-3">
                <button
                  onClick={() => setShowAdd(false)}
                  disabled={addSaving}
                  className="flex-1 py-3 rounded-xl border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-border/80 transition disabled:opacity-50"
                >
                  {t('tasks_cancel')}
                </button>
                <button
                  onClick={createTask}
                  disabled={addSaving || !addTitle.trim()}
                  className="flex-1 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addSaving ? '...' : t('tasks_create')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
