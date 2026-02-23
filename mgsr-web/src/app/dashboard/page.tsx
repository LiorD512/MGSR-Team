'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
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
import { getTransferWindows, type TransferWindow } from '@/lib/api';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { parseMarketValue, parseAge } from '@/lib/releases';

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

interface RosteredPlayer {
  id: string;
  positions?: string[];
  age?: string;
  marketValue?: string;
  contractExpired?: string;
  haveMandate?: boolean;
}

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK']),
  DEF: new Set(['CB', 'RB', 'LB']),
  MID: new Set(['CM', 'DM', 'AM']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS', 'AM']),
};

function parseContractDate(str: string | undefined): Date | null {
  if (!str || str === '-') return null;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m1 = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m1) return new Date(parseInt(m1[3]!, 10), parseInt(m1[2]!, 10) - 1, parseInt(m1[1]!, 10));
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return new Date(parseInt(m2[3]!, 10), parseInt(m2[2]!, 10) - 1, parseInt(m2[1]!, 10));
  const m3 = str.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (m3) {
    const mi = monthNames.indexOf(m3[1]!);
    if (mi >= 0) return new Date(parseInt(m3[3]!, 10), mi, parseInt(m3[2]!, 10));
  }
  return null;
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

interface DashboardCache {
  events: FeedEvent[];
  players: { id: string }[];
  rosterPlayers: RosteredPlayer[];
  contacts: { id: string }[];
  requests: { id: string; status?: string }[];
  tasks: AgentTask[];
  shortlistCount: number;
  accounts: Account[];
  currentAccount: Account | null;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { lang, setLang, t, isRtl } = useLanguage();
  const router = useRouter();
  const cached = user ? getScreenCache<DashboardCache>('dashboard', user.uid) : undefined;
  const [events, setEvents] = useState<FeedEvent[]>(cached?.events ?? []);
  const [eventsLoading, setEventsLoading] = useState(cached === undefined);
  const [players, setPlayers] = useState<{ id: string }[]>(cached?.players ?? []);
  const [rosterPlayers, setRosterPlayers] = useState<RosteredPlayer[]>(cached?.rosterPlayers ?? []);
  const [contacts, setContacts] = useState<{ id: string }[]>(cached?.contacts ?? []);
  const [requests, setRequests] = useState<{ id: string; status?: string }[]>(
    cached?.requests ?? []
  );
  const [tasks, setTasks] = useState<AgentTask[]>(cached?.tasks ?? []);
  const [shortlistCount, setShortlistCount] = useState(cached?.shortlistCount ?? 0);
  const [accounts, setAccounts] = useState<Account[]>(cached?.accounts ?? []);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(cached?.currentAccount ?? null);
  const [transferWindows, setTransferWindows] = useState<TransferWindow[]>([]);
  const [transferWindowsLoading, setTransferWindowsLoading] = useState(false);
  const [expandedConfederations, setExpandedConfederations] = useState<Set<string>>(new Set(['PRIORITY']));

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
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosteredPlayer));
      setPlayers(list.map((p) => ({ id: p.id })));
      setRosterPlayers(list);
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
    const unsub = onSnapshot(collection(db, 'ClubRequests'), (snap) => {
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

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      setTransferWindowsLoading(true);
      getTransferWindows()
        .then((windows) => {
          if (!cancelled) setTransferWindows(windows);
        })
        .catch(() => {
          if (!cancelled) setTransferWindows([]);
        })
        .finally(() => {
          if (!cancelled) setTransferWindowsLoading(false);
        });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const PRIORITY_COUNTRY_CODES = new Set(['il', 'gb-eng', 'de', 'es', 'it', 'fr']);
  const transferWindowGroups = useMemo(() => {
    const priority = transferWindows
      .filter((w) => PRIORITY_COUNTRY_CODES.has(w.countryCode))
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
    const rest = transferWindows
      .filter((w) => !PRIORITY_COUNTRY_CODES.has(w.countryCode))
      .reduce<Record<string, TransferWindow[]>>((acc, w) => {
        const conf = w.confederation || 'UEFA';
        if (!acc[conf]) acc[conf] = [];
        acc[conf].push(w);
        return acc;
      }, {});
    Object.keys(rest).forEach((k) => {
      rest[k].sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
    });
    const confOrder = ['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF', 'OFC'];
    const groups: Record<string, TransferWindow[]> = {};
    if (priority.length > 0) groups.PRIORITY = priority;
    confOrder.forEach((c) => {
      if (rest[c]?.length) groups[c] = rest[c];
    });
    return groups;
  }, [transferWindows]);

  const toggleTransferWindowGroup = (conf: string) => {
    setExpandedConfederations((prev) => {
      const next = new Set(prev);
      if (next.has(conf)) next.delete(conf);
      else next.add(conf);
      return next;
    });
  };

  useEffect(() => {
    if (!user) return;
    setScreenCache<DashboardCache>(
      'dashboard',
      {
        events,
        players,
        rosterPlayers,
        contacts,
        requests,
        tasks,
        shortlistCount,
        accounts,
        currentAccount,
      },
      user.uid
    );
  }, [user?.uid, events, players, rosterPlayers, contacts, requests, tasks, shortlistCount, accounts, currentAccount]);

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

  const positionByGroup = useMemo(() => {
    const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    rosterPlayers.forEach((p) => {
      const positions = p.positions?.filter(Boolean) ?? [];
      const matched = new Set<string>();
      for (const pos of positions) {
        const up = pos?.toUpperCase();
        for (const [group, codes] of Object.entries(POSITION_CODES)) {
          if (up && codes.has(up)) {
            matched.add(group);
            break;
          }
        }
      }
      matched.forEach((g) => { counts[g] = (counts[g] ?? 0) + 1; });
    });
    return POSITION_GROUPS.map((g) => ({
      name: t(`players_filter_position_${g.toLowerCase()}`),
      value: counts[g] ?? 0,
    })).filter((d) => d.value > 0);
  }, [rosterPlayers, t]);

  const ageByGroup = useMemo(() => {
    const buckets: Record<string, number> = {
      u21: 0,
      '22-25': 0,
      '26-29': 0,
      '30+': 0,
    };
    rosterPlayers.forEach((p) => {
      const age = parseAge(p.age);
      if (age === null) return;
      if (age < 22) buckets.u21++;
      else if (age <= 25) buckets['22-25']++;
      else if (age <= 29) buckets['26-29']++;
      else buckets['30+']++;
    });
    return [
      { name: t('roster_analytics_age_u21'), count: buckets.u21 },
      { name: t('roster_analytics_age_22_25'), count: buckets['22-25'] },
      { name: t('roster_analytics_age_26_29'), count: buckets['26-29'] },
      { name: t('roster_analytics_age_30_plus'), count: buckets['30+'] },
    ].filter((d) => d.count > 0);
  }, [rosterPlayers, t]);

  const valueByRange = useMemo(() => {
    const buckets: Record<string, number> = {
      unknown: 0,
      '0-500k': 0,
      '500k-1m': 0,
      '1m-5m': 0,
      '5m+': 0,
    };
    rosterPlayers.forEach((p) => {
      const v = parseMarketValue(p.marketValue);
      if (v <= 0) buckets.unknown++;
      else if (v < 500_000) buckets['0-500k']++;
      else if (v < 1_000_000) buckets['500k-1m']++;
      else if (v < 5_000_000) buckets['1m-5m']++;
      else buckets['5m+']++;
    });
    const labels: Record<string, string> = {
      unknown: t('roster_analytics_value_unknown'),
      '0-500k': t('roster_analytics_value_0_500k'),
      '500k-1m': t('roster_analytics_value_500k_1m'),
      '1m-5m': t('roster_analytics_value_1m_5m'),
      '5m+': t('roster_analytics_value_5m_plus'),
    };
    return Object.entries(buckets)
      .filter(([, c]) => c > 0)
      .map(([key, count]) => ({ name: labels[key], count }));
  }, [rosterPlayers, t]);

  const contractByMonth = useMemo(() => {
    const now = new Date();
    const byMonth: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      byMonth[d.toISOString().slice(0, 7)] = 0;
    }
    rosterPlayers.forEach((p) => {
      const date = parseContractDate(p.contractExpired);
      if (!date || date < now) return;
      const key = date.toISOString().slice(0, 7);
      if (byMonth[key] !== undefined) byMonth[key]++;
    });
    const locale = isRtl ? 'he-IL' : 'en-US';
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([, c]) => c > 0)
      .map(([month, count]) => ({
        month: new Date(month + '-01').toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
        count,
      }));
  }, [rosterPlayers, isRtl]);

  const mandateData = useMemo(() => {
    const withM = rosterPlayers.filter((p) => p.haveMandate === true).length;
    const without = rosterPlayers.length - withM;
    return [
      { name: t('roster_analytics_with_mandate'), value: withM, color: '#66BB6A' },
      { name: t('roster_analytics_without_mandate'), value: without, color: '#8D6E63' },
    ].filter((d) => d.value > 0);
  }, [rosterPlayers, t]);

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
            { href: '/requests', count: requests.length, label: t('requests') },
            {
              href: '/tasks',
              count: tasks.filter((t) => !t.isCompleted).length,
              label: t('tasks'),
            },
            { href: '/shortlist', count: shortlistCount, label: t('shortlist') },
            { href: '/releases', count: null, label: t('releases'), arrow: true },
            { href: '/contract-finisher', count: null, label: t('nav_contract_finisher'), arrow: true },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative p-4 sm:p-5 bg-mgsr-card/80 border border-mgsr-border rounded-2xl hover:border-mgsr-teal/40 hover:bg-mgsr-card transition-all duration-300 animate-slide-up min-h-[80px] flex flex-col justify-center"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-3xl font-bold text-mgsr-teal font-display">
                {item.arrow ? (isRtl ? '←' : '→') : item.count}
              </p>
              <p className="text-sm text-mgsr-muted mt-1">{item.label}</p>
              {'badge' in item && typeof item.badge === 'number' && item.badge > 0 && (
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

        {/* Roster Analytics */}
        {rosterPlayers.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-mgsr-text font-display">
                {t('roster_analytics_title')}
              </h2>
              <Link
                href="/players"
                className="text-sm font-medium text-mgsr-teal hover:text-mgsr-teal/80 transition flex items-center gap-1"
              >
                {t('players')}
                <span aria-hidden>{isRtl ? '←' : '→'}</span>
              </Link>
            </div>
            <div className="w-10 h-0.5 rounded-full bg-mgsr-teal mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {/* Position distribution */}
              <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
                  {t('roster_analytics_position')}
                </h3>
                <div className="h-48">
                  {positionByGroup.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={positionByGroup} margin={{ left: 8, right: 12, top: 8, bottom: 24 }}>
                        <XAxis
                          dataKey="name"
                          stroke="#8C999B"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#E8EAED' }}
                          interval={0}
                        />
                        <YAxis stroke="#8C999B" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1A2736',
                            border: '1px solid #253545',
                            borderRadius: '12px',
                            padding: '10px 14px',
                          }}
                        />
                        <Bar dataKey="value" fill="#4DB6AC" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Age distribution */}
              <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
                  {t('roster_analytics_age')}
                </h3>
                <div className="h-48">
                  {ageByGroup.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ageByGroup} margin={{ left: 8, right: 12, top: 8, bottom: 24 }}>
                        <XAxis dataKey="name" stroke="#8C999B" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#8C999B" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1A2736',
                            border: '1px solid #253545',
                            borderRadius: '12px',
                            padding: '10px 14px',
                          }}
                        />
                        <Bar dataKey="count" fill="#5C6BC0" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Market value distribution */}
              <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
                  {t('roster_analytics_value')}
                </h3>
                <div className="h-48">
                  {valueByRange.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={valueByRange} margin={{ left: 8, right: 12, top: 8, bottom: 24 }}>
                        <XAxis dataKey="name" stroke="#8C999B" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#8C999B" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1A2736',
                            border: '1px solid #253545',
                            borderRadius: '12px',
                            padding: '10px 14px',
                          }}
                        />
                        <Bar dataKey="count" fill="#FF7043" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Contracts expiring */}
              <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm md:col-span-2">
                <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
                  {t('roster_analytics_contracts')}
                </h3>
                <div className="h-48">
                  {contractByMonth.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={contractByMonth} margin={{ left: 8, right: 12, top: 8, bottom: 24 }}>
                        <XAxis dataKey="month" stroke="#8C999B" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#8C999B" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1A2736',
                            border: '1px solid #253545',
                            borderRadius: '12px',
                            padding: '10px 14px',
                          }}
                        />
                        <Bar dataKey="count" fill="#EC407A" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Mandate status */}
              <div className="p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
                  {t('roster_analytics_mandates')}
                </h3>
                <div className="min-h-[120px] flex flex-col justify-center">
                  {mandateData.length > 0 ? (
                    <div className="space-y-4">
                      {mandateData.map((entry, i) => {
                        const pct = rosterPlayers.length > 0
                          ? Math.round((entry.value / rosterPlayers.length) * 100)
                          : 0;
                        return (
                          <div key={entry.name} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-mgsr-text font-medium truncate">
                                {entry.name}
                              </span>
                              <span className="text-mgsr-muted shrink-0 ms-2">
                                {entry.value} {pct > 0 && `(${pct}%)`}
                              </span>
                            </div>
                            <div className="h-2 bg-mgsr-dark rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.max(pct, 2)}%`,
                                  backgroundColor: entry.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-8 flex items-center justify-center text-mgsr-muted text-sm">
                      —
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* Transfer Windows — Open worldwide (app-like design) */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-mgsr-text font-display">
              {t('transfer_windows_title')}
            </h2>
            {transferWindows.length > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-mgsr-teal/15 text-mgsr-teal text-sm font-semibold">
                {transferWindows.length}
              </span>
            )}
          </div>
          <div className="w-10 h-0.5 rounded-full bg-mgsr-teal mb-4" />
          {transferWindowsLoading ? (
            <div className="flex items-center gap-3 py-8 text-mgsr-muted">
              <div className="w-4 h-4 border-2 border-mgsr-teal/40 border-t-mgsr-teal rounded-full animate-spin" />
              <span className="text-sm">{t('loading')}</span>
            </div>
          ) : Object.keys(transferWindowGroups).length === 0 ? (
            <div className="py-8 px-6 rounded-2xl bg-mgsr-card/40 border border-mgsr-border text-center text-mgsr-muted">
              {t('transfer_windows_empty')}
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(transferWindowGroups).map(([conf, windows]) => {
                const isExpanded = expandedConfederations.has(conf);
                const closingSoonCount = windows.filter(
                  (w) => (w.daysLeft ?? 999) <= 7
                ).length;
                const confLabel =
                  conf === 'PRIORITY'
                    ? t('transfer_windows_group_priority')
                    : conf === 'UEFA'
                      ? t('transfer_windows_group_uefa')
                      : conf === 'CONMEBOL'
                        ? t('transfer_windows_group_conmebol')
                        : conf === 'CONCACAF'
                          ? t('transfer_windows_group_concacaf')
                          : conf === 'AFC'
                            ? t('transfer_windows_group_afc')
                            : conf === 'CAF'
                              ? t('transfer_windows_group_caf')
                              : conf === 'OFC'
                                ? t('transfer_windows_group_ofc')
                                : conf;
                const accentColor =
                  conf === 'PRIORITY'
                    ? '#4DB6AC'
                    : conf === 'UEFA'
                      ? '#5C6BC0'
                      : conf === 'CONMEBOL'
                        ? '#66BB6A'
                        : conf === 'CONCACAF'
                          ? '#FF7043'
                          : conf === 'AFC'
                            ? '#AB47BC'
                            : conf === 'CAF'
                              ? '#FDD835'
                              : '#8C999B';
                return (
                  <div
                    key={conf}
                    className="rounded-xl overflow-hidden"
                    style={{
                      backgroundColor: `${accentColor}14`,
                      borderColor: `${accentColor}30`,
                      borderWidth: 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTransferWindowGroup(conf)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-start hover:opacity-90 transition"
                    >
                      {conf === 'PRIORITY' && (
                        <span className="text-base" style={{ color: accentColor }}>
                          ★
                        </span>
                      )}
                      <span className="flex-1 font-semibold text-mgsr-text">
                        {confLabel}
                      </span>
                      {closingSoonCount > 0 && !isExpanded && (
                        <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-xs font-semibold">
                          {t('transfer_windows_closing_soon').replace(
                            '{n}',
                            String(closingSoonCount)
                          )}
                        </span>
                      )}
                      <span
                        className="px-2 py-0.5 rounded-md text-xs font-semibold"
                        style={{
                          backgroundColor: `${accentColor}25`,
                          color: accentColor,
                        }}
                      >
                        {windows.length}
                      </span>
                      <span
                        className={`inline-flex text-mgsr-muted transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-3 pt-0 space-y-1.5">
                        {windows.map((w) => {
                          const isClosingSoon =
                            (w.daysLeft ?? 999) <= 7;
                          const daysColor =
                            isClosingSoon
                              ? '#E53935'
                              : (w.daysLeft ?? 999) <= 14
                                ? '#FF7043'
                                : '#4DB6AC';
                          return (
                            <div
                              key={w.countryCode + w.countryName}
                              className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-mgsr-dark/60 border border-mgsr-border/50"
                              style={{
                                borderColor: isClosingSoon
                                  ? 'rgba(229, 57, 53, 0.3)'
                                  : undefined,
                              }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {w.flagUrl && (
                                  <img
                                    src={w.flagUrl}
                                    alt=""
                                    className="w-6 h-6 rounded-full object-cover shrink-0"
                                  />
                                )}
                                <span className="font-medium text-mgsr-text truncate">
                                  {w.countryName}
                                </span>
                              </div>
                              {w.daysLeft != null ? (
                                <span
                                  className={`shrink-0 text-sm font-medium ${
                                    isClosingSoon
                                      ? 'px-2 py-0.5 rounded-md bg-red-500/15 text-red-400'
                                      : ''
                                  }`}
                                  style={
                                    !isClosingSoon
                                      ? { color: daysColor }
                                      : undefined
                                  }
                                >
                                  {t('transfer_windows_days_left').replace(
                                    '{n}',
                                    String(w.daysLeft)
                                  )}
                                </span>
                              ) : (
                                <span className="text-sm text-mgsr-muted shrink-0">
                                  {t('transfer_windows_open')}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
          {[
            { href: '/players/add', label: t('add_player') },
            { href: '/shortlist', label: t('shortlist') },
            { href: '/releases', label: t('releases') },
            { href: '/contract-finisher', label: t('nav_contract_finisher') },
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
