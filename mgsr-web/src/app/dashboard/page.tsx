'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, translateType } from '@/contexts/LanguageContext';
import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface FeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  oldValue?: string;
  newValue?: string;
  extraInfo?: string;
  timestamp?: number;
  agentName?: string;
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

interface AgentTask {
  id: string;
  agentId?: string;
  agentName?: string;
  isCompleted?: boolean;
}

const CHART_COLORS = [
  '#4DB6AC',
  '#5C6BC0',
  '#FF7043',
  '#66BB6A',
  '#EC407A',
  '#AB47BC',
  '#42A5F5',
  '#8D6E63',
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  MARKET_VALUE_CHANGE: '#4DB6AC',
  CLUB_CHANGE: '#5C6BC0',
  CONTRACT_EXPIRING: '#FF7043',
  NOTE_ADDED: '#66BB6A',
  NOTE_DELETED: '#8D6E63',
  PLAYER_ADDED: '#4DB6AC',
  PLAYER_DELETED: '#E53935',
  BECAME_FREE_AGENT: '#42A5F5',
  NEW_RELEASE_FROM_CLUB: '#AB47BC',
  MANDATE_EXPIRED: '#FF7043',
  MANDATE_UPLOADED: '#66BB6A',
  MANDATE_SWITCHED_ON: '#66BB6A',
  MANDATE_SWITCHED_OFF: '#8D6E63',
  SHORTLIST_ADDED: '#4DB6AC',
  SHORTLIST_REMOVED: '#8D6E63',
  REQUEST_ADDED: '#EC407A',
  REQUEST_DELETED: '#8D6E63',
  PLAYER_OFFERED_TO_CLUB: '#5C6BC0',
};

const hashStr = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
};
const getEventColor = (type: string) =>
  EVENT_TYPE_COLORS[type] ||
  CHART_COLORS[hashStr(type || '') % CHART_COLORS.length] ||
  '#4DB6AC';

const getGreeting = (hour: number, t: (k: string) => string) => {
  if (hour >= 5 && hour < 12) return t('greeting_morning');
  if (hour >= 12 && hour < 18) return t('greeting_afternoon');
  return t('greeting_evening');
};

const formatTime = (
  ts: number | undefined,
  t: (k: string) => string,
  isRtl: boolean
) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return t('just_now');
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)}${t('minutes_ago')}`;
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)}${t('hours_ago')}`;
  return d.toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
};

const getDisplayName = (account: Account, isRtl: boolean) =>
  isRtl ? account.hebrewName || account.name || account.email || '—' : account.name || account.hebrewName || account.email || '—';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { lang, setLang, t, isRtl } = useLanguage();
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [players, setPlayers] = useState<{ id: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string }[]>([]);
  const [requests, setRequests] = useState<{ id: string; status?: string }[]>(
    []
  );
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [shortlistCount, setShortlistCount] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Accounts'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
      setAccounts(list);
      const me = list.find(
        (a) => a.email?.toLowerCase() === user.email?.toLowerCase()
      );
      setCurrentAccount(me || null);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const q = query(
      collection(db, 'FeedEvents'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      setEvents(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FeedEvent))
      );
      setEventsLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Players'), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Contacts'), (snap) => {
      setContacts(snap.docs.map((d) => ({ id: d.id })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Requests'), (snap) => {
      setRequests(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as { id: string; status?: string }))
      );
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'AgentTasks'), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentTask)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'Shortlists', user.uid),
      (snap) => {
        const entries = (snap.data()?.entries as unknown[]) || [];
        setShortlistCount(entries.length);
      },
      () => setShortlistCount(0)
    );
    return () => unsub();
  }, [user]);

  const userName =
    currentAccount
      ? getDisplayName(currentAccount, isRtl)
      : user?.displayName || user?.email?.split('@')[0] || t('agent');

  const greeting = getGreeting(new Date().getHours(), t);

  const oneWeekAgo = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, []);
  const eventsThisWeek = useMemo(
    () => events.filter((e) => (e.timestamp || 0) >= oneWeekAgo),
    [events, oneWeekAgo]
  );

  const activityByDay = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      byDay[d.toISOString().slice(0, 10)] = 0;
    }
    eventsThisWeek.forEach((e) => {
      if (!e.timestamp) return;
      const key = new Date(e.timestamp).toISOString().slice(0, 10);
      if (byDay[key] !== undefined) byDay[key]++;
    });
    const locale = isRtl ? 'he-IL' : 'en-US';
    return Object.entries(byDay).map(([date, count]) => ({
      date: new Date(date).toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      count,
    }));
  }, [eventsThisWeek, isRtl]);

  const eventsByType = useMemo(() => {
    const byType: Record<string, number> = {};
    eventsThisWeek.forEach((e) => {
      const tpe = e.type || 'other';
      byType[tpe] = (byType[tpe] || 0) + 1;
    });
    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    return Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({
        type,
        name: translateType(type, t),
        value: count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }));
  }, [eventsThisWeek, t]);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const eventsToday = useMemo(
    () => events.filter((e) => (e.timestamp || 0) >= startOfToday),
    [events, startOfToday]
  );

  const topAgentsToday = useMemo(() => {
    const byAccountId: Record<string, { account: Account; count: number }> = {};
    accounts.forEach((a) => {
      byAccountId[a.id] = { account: a, count: 0 };
    });
    eventsToday.forEach((e) => {
      const agentName = e.agentName?.trim();
      if (!agentName) return;
      const matched = accounts.find(
        (a) =>
          a.name?.toLowerCase() === agentName.toLowerCase() ||
          a.hebrewName?.toLowerCase() === agentName.toLowerCase()
      );
      if (matched && byAccountId[matched.id]) {
        byAccountId[matched.id].count++;
      }
    });

    return Object.entries(byAccountId)
      .map(([id, { account, count }]) => ({
        id,
        name: getDisplayName(account, isRtl),
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [accounts, eventsToday, isRtl, t]);

  const staffWithTasks = useMemo(() => {
    const pending = tasks.filter((t) => !t.isCompleted);
    const byAgent: Record<string, { name: string; pending: number }> = {};
    accounts.forEach((a) => {
      byAgent[a.id] = { name: getDisplayName(a, isRtl), pending: 0 };
    });
    pending.forEach((task) => {
      const key = task.agentId || 'unassigned';
      if (!byAgent[key]) {
        byAgent[key] = {
          name: task.agentName || t('unassigned'),
          pending: 0,
        };
      }
      byAgent[key].pending++;
    });
    return Object.entries(byAgent).map(([id, data]) => ({ id, ...data }));
  }, [accounts, tasks, isRtl]);

  const pendingRequests = requests.filter((r) => r.status !== 'fulfilled');

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">
          {t('loading')}
        </div>
      </div>
    );
  }

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AppLayout>
      <div
        className={`max-w-7xl ${isRtl ? 'text-right' : 'text-left'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Header: greeting + language toggle */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-10 animate-fade-in">
          <div className="space-y-1">
            <p className="text-mgsr-muted text-sm font-medium">
              {greeting},
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-mgsr-text font-display tracking-tight">
              {userName}
            </h1>
            <p className="text-mgsr-muted text-sm mt-1">{dateStr}</p>
          </div>
          <button
            onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
            className="px-4 py-2 rounded-lg border border-mgsr-border bg-mgsr-card text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition text-sm font-medium"
            aria-label={lang === 'en' ? 'Switch to Hebrew' : 'עברית לאנגלית'}
          >
            {lang === 'en' ? 'עברית' : 'English'}
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
          {[
            { href: '/players', count: players.length, label: t('players') },
            { href: '/contacts', count: contacts.length, label: t('contacts') },
            {
              href: '/requests',
              count: requests.length,
              label: t('requests'),
              badge: pendingRequests.length,
            },
            {
              href: '/tasks',
              count: tasks.filter((t) => !t.isCompleted).length,
              label: t('tasks'),
            },
            { href: '/shortlist', count: shortlistCount, label: t('shortlist') },
            { href: '/releases', count: null, label: t('releases'), arrow: true },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative p-5 bg-mgsr-card/80 border border-mgsr-border rounded-2xl hover:border-mgsr-teal/40 hover:bg-mgsr-card transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-3xl font-bold text-mgsr-teal font-display">
                {item.arrow ? '→' : item.count}
              </p>
              <p className="text-sm text-mgsr-muted mt-1">{item.label}</p>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-3 end-3 text-xs font-medium text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                  {item.badge} {t('pending')}
                </span>
              )}
            </Link>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-mgsr-text mb-5 font-display">
              {t('activity_this_week')}
            </h3>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityByDay}>
                  <defs>
                    <linearGradient
                      id="colorCount"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#4DB6AC"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="#4DB6AC"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#253545"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#8C999B"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#8C999B"
                    fontSize={11}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1A2736',
                      border: '1px solid #253545',
                      borderRadius: '12px',
                      padding: '10px 14px',
                    }}
                    labelStyle={{ color: '#E8EAED', fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#4DB6AC"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Event types - horizontal bar list (replaces broken pie) */}
          <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-mgsr-text mb-5 font-display">
              {t('event_types_this_week')}
            </h3>
            <div className="min-h-[208px]">
              {eventsByType.length > 0 ? (
                <div className="space-y-4">
                  {eventsByType.map((item, i) => (
                    <div key={item.type} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-mgsr-text font-medium truncate max-w-[70%]">
                          {item.name}
                        </span>
                        <span className="text-mgsr-muted shrink-0 ms-2">
                          {item.value} {item.pct > 0 && `(${item.pct}%)`}
                        </span>
                      </div>
                      <div className="h-1.5 bg-mgsr-dark rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.max(item.pct, 4)}%`,
                            backgroundColor:
                              CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-mgsr-muted text-sm">
                  {t('no_events_this_week')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Staff & This week */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
              {t('staff_tasks')}
            </h3>
            {staffWithTasks.length > 0 ? (
              <div className="space-y-3">
                {staffWithTasks.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-3 border-b border-mgsr-border/80 last:border-0"
                  >
                    <span className="text-mgsr-text">{s.name}</span>
                    <Link
                      href="/tasks"
                      className="text-sm text-mgsr-teal hover:underline font-medium"
                    >
                      {s.pending} {t('pending')}
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mgsr-muted">{t('no_staff_data')}</p>
            )}
          </div>

          <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
              {t('top_agents_this_week')}
            </h3>
            {topAgentsToday.length > 0 ? (
              <div className="space-y-3">
                {topAgentsToday.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between py-2 border-b border-mgsr-border/80 last:border-0"
                  >
                    <span className="text-mgsr-text font-medium truncate max-w-[70%]">
                      {agent.name}
                    </span>
                    <span className="text-mgsr-teal font-semibold shrink-0 ms-2">
                      {agent.count} {t('events')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mgsr-muted">{t('no_agent_activity')}</p>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
          {[
            { href: '/players/add', label: t('add_player') },
            { href: '/shortlist', label: t('shortlist') },
            { href: '/releases', label: t('releases') },
            { href: '/tasks', label: t('tasks') },
            { href: '/requests', label: t('requests') },
            { href: '/contacts', label: t('contacts') },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="p-4 bg-mgsr-card/60 border border-mgsr-border rounded-xl hover:border-mgsr-teal/50 hover:bg-mgsr-card transition text-center font-medium text-mgsr-teal"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Recent activity — timeline design */}
        <div className="relative">
          <h2 className="text-lg font-semibold text-mgsr-text mb-6 font-display">
            {t('recent_activity')}
          </h2>
          {eventsLoading ? (
            <div className="flex items-center gap-3 py-8 text-mgsr-muted">
              <div className="w-2 h-2 rounded-full bg-mgsr-teal/50 animate-pulse" />
              <span>{t('loading_feed')}</span>
            </div>
          ) : events.length === 0 ? (
            <div className="relative overflow-hidden p-12 bg-mgsr-card/40 border border-mgsr-border rounded-2xl text-center">
              <div className="absolute inset-0 bg-gradient-to-b from-mgsr-teal/5 to-transparent" />
              <p className="relative text-mgsr-muted">{t('no_recent_activity')}</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-mgsr-teal/30 via-mgsr-border to-transparent"
                style={{ [isRtl ? 'right' : 'left']: '19px' }}
              />
              <div className="space-y-0">
                {events.slice(0, 15).map((ev, i) => {
                  const color = getEventColor(ev.type || '');
                  const typeLabel = translateType(ev.type || '', t) || ev.type;
                  const cardContent = (
                    <div
                      className={`flex-1 min-w-0 rounded-xl border border-mgsr-border bg-mgsr-card/60 px-4 py-3 transition-all duration-200 ${
                        ev.playerTmProfile
                          ? 'hover:border-mgsr-teal/40 hover:bg-mgsr-card/80 cursor-pointer'
                          : ''
                      }`}
                      style={{
                        borderInlineStartWidth: '3px',
                        borderInlineStartColor: color,
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span
                            className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md mb-1.5"
                            style={{
                              backgroundColor: `${color}20`,
                              color,
                            }}
                          >
                            {typeLabel}
                          </span>
                          <p className="text-mgsr-text font-medium leading-snug">
                            {ev.playerName || ev.extraInfo || '—'}
                          </p>
                          {ev.oldValue && ev.newValue && (
                            <p className="text-sm text-mgsr-muted mt-1 font-mono">
                              {ev.oldValue}
                              <span className="mx-1.5 text-mgsr-teal/70">→</span>
                              {ev.newValue}
                            </p>
                          )}
                          {ev.agentName && (
                            <p className="text-xs text-mgsr-muted/90 mt-1">
                              {t('by')} {ev.agentName}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-mgsr-muted shrink-0 tabular-nums">
                          {formatTime(ev.timestamp, t, isRtl)}
                        </span>
                      </div>
                    </div>
                  );
                  return (
                    <div
                      key={ev.id}
                      className="group relative flex gap-5 py-4 animate-slide-up"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      {/* Timeline node */}
                      <div
                        className="relative z-10 shrink-0 flex items-center justify-center w-10 h-10 rounded-full border-2 border-mgsr-dark bg-mgsr-card shadow-lg"
                        style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}40` }}
                      >
                        {ev.playerImage ? (
                          <img
                            src={ev.playerImage}
                            alt=""
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span
                            className="text-sm font-bold font-display"
                            style={{ color }}
                          >
                            {(ev.playerName || typeLabel || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {/* Content card */}
                      {ev.playerTmProfile ? (
                        <Link
                          href={`/players/add?url=${encodeURIComponent(ev.playerTmProfile)}`}
                          className="flex-1 min-w-0 block"
                        >
                          {cardContent}
                        </Link>
                      ) : (
                        <div className="flex-1 min-w-0">{cardContent}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
