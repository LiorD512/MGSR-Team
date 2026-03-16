'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { extractPlayerIdFromUrl } from '@/lib/api';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { usePlatform } from '@/contexts/PlatformContext';
import { PlatformSwitcher } from '@/components/PlatformSwitcher';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import {
  FEED_EVENTS_COLLECTIONS,
  PLAYERS_COLLECTIONS,
  CONTACTS_COLLECTIONS,
  CLUB_REQUESTS_COLLECTIONS,
  AGENT_TASKS_COLLECTIONS,
  SHORTLISTS_COLLECTIONS,
} from '@/lib/platformCollections';

interface FeedEvent {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  playerWomenId?: string;
  playerYouthId?: string;
  oldValue?: string;
  newValue?: string;
  extraInfo?: string;
  timestamp?: number;
  agentName?: string;
}

/** Deduplicates feed events by (type, playerTmProfile) — keeps most recent. Fixes legacy duplicates. */
function deduplicateFeedEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Map<string, FeedEvent>();
  for (const ev of events) {
    const key =
      ev.type && (ev.playerTmProfile || ev.playerWomenId)
        ? `${ev.type}:${ev.playerTmProfile || ev.playerWomenId || ''}`
        : ev.id;
    const existing = seen.get(key);
    if (!existing || (ev.timestamp ?? 0) > (existing.timestamp ?? 0)) {
      seen.set(key, ev);
    }
  }
  return Array.from(seen.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
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
  tmProfile?: string;
  positions?: string[];
  age?: string;
  marketValue?: string;
  contractExpired?: string;
  haveMandate?: boolean;
  agency?: string;
  agencyUrl?: string;
  linkedContactId?: string;
}

interface ContactFull {
  id: string;
  name?: string;
  phoneNumber?: string;
  contactType?: string;
  agencyName?: string;
  agencyCountry?: string;
  agencyUrl?: string;
  clubName?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  clubLogo?: string;
  clubTmProfile?: string;
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

const resolveAgentDisplayName = (
  agentName: string | undefined,
  accounts: Account[],
  isRtl: boolean
): string => {
  if (!agentName?.trim()) return '';
  const matched = accounts.find(
    (a) =>
      a.name?.toLowerCase() === agentName.trim().toLowerCase() ||
      a.hebrewName?.toLowerCase() === agentName.trim().toLowerCase()
  );
  return matched ? getDisplayName(matched, isRtl) : agentName.trim();
};

/** Returns href for feed event click. Player events → player info; SHORTLIST_ADDED → shortlist with highlight. Includes scrollTo so back returns to same feed item. */
function getFeedEventLink(
  ev: FeedEvent,
  rosterPlayers: RosteredPlayer[],
  womenPlayers: WomanPlayer[],
  youthPlayers: YouthPlayer[],
  platform: string
): { href: string; hasLink: boolean } {
  const scrollTo = `scrollTo=${encodeURIComponent(ev.id)}`;
  const isShortlistAdded = ev.type === 'SHORTLIST_ADDED';
  if (isShortlistAdded && (ev.playerTmProfile || ev.playerWomenId || ev.playerYouthId)) {
    const highlight = ev.playerTmProfile || ev.playerWomenId || ev.playerYouthId || '';
    return { href: `/shortlist?highlight=${encodeURIComponent(highlight)}`, hasLink: true };
  }
  if (ev.playerWomenId) {
    return { href: `/players/women/${ev.playerWomenId}?from=/dashboard&${scrollTo}`, hasLink: true };
  }
  if (ev.playerYouthId) {
    return { href: `/players/youth/${ev.playerYouthId}?from=/dashboard&${scrollTo}`, hasLink: true };
  }
  if (ev.playerTmProfile && platform === 'men') {
    const tmId = extractPlayerIdFromUrl(ev.playerTmProfile);
    const rosterPlayer = tmId
      ? rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === tmId)
      : undefined;
    if (rosterPlayer) {
      return { href: `/players/${rosterPlayer.id}?from=/dashboard&${scrollTo}`, hasLink: true };
    }
    return { href: `/players/add?url=${encodeURIComponent(ev.playerTmProfile)}&from=/dashboard&${scrollTo}`, hasLink: true };
  }
  return { href: '', hasLink: false };
}

interface DashboardCache {
  events: FeedEvent[];
  players: { id: string }[];
  rosterPlayers: RosteredPlayer[];
  contacts: ContactFull[];
  requests: { id: string; status?: string }[];
  tasks: AgentTask[];
  shortlistCount: number;
  accounts: Account[];
  currentAccount: Account | null;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { lang, setLang, t, isRtl } = useLanguage();
  const { platform } = usePlatform();
  const isMobile = useIsMobile();
  const router = useRouter();
  const cached = user ? getScreenCache<DashboardCache>('dashboard', user.uid) : undefined;
  const [events, setEvents] = useState<FeedEvent[]>(cached?.events ?? []);
  const [eventsLoading, setEventsLoading] = useState(cached === undefined);
  const [players, setPlayers] = useState<{ id: string }[]>(cached?.players ?? []);
  const [rosterPlayers, setRosterPlayers] = useState<RosteredPlayer[]>(cached?.rosterPlayers ?? []);
  const [contacts, setContacts] = useState<ContactFull[]>(cached?.contacts ?? []);
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
  const [expandedWindowCountries, setExpandedWindowCountries] = useState<Set<string>>(new Set());
  const [womenPlayers, setWomenPlayers] = useState<WomanPlayer[]>([]);
  const [youthPlayers, setYouthPlayers] = useState<YouthPlayer[]>([]);
  const searchParams = useSearchParams();

  // When returning from player page with scrollTo, scroll to that feed item
  const scrollToParam = searchParams.get('scrollTo');
  useEffect(() => {
    if (!scrollToParam || events.length === 0) return;
    const el = document.getElementById(`feed-event-${scrollToParam}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    // Clear scrollTo from URL after scrolling
    const t = setTimeout(() => {
      router.replace('/dashboard', { scroll: false });
    }, 600);
    return () => clearTimeout(t);
  }, [scrollToParam, events.length, router]);

  useEffect(() => {
    if (platform !== 'women') return;
    return subscribePlayersWomen(setWomenPlayers);
  }, [platform]);

  useEffect(() => {
    if (platform !== 'youth') return;
    return subscribePlayersYouth(setYouthPlayers);
  }, [platform]);

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
    const coll = FEED_EVENTS_COLLECTIONS[platform];
    const q = query(
      collection(db, coll),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      const raw = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FeedEvent));
      // Filter out cross-platform events that leaked due to legacy bugs
      const filtered = raw.filter((ev) => {
        if (platform === 'men') return !ev.playerWomenId && !ev.playerYouthId;
        if (platform === 'women') return !ev.playerYouthId;
        return true;
      });
      const deduped = deduplicateFeedEvents(filtered);
      setEvents(deduped);
      setEventsLoading(false);
    });
    return () => unsub();
  }, [platform]);

  useEffect(() => {
    if (platform === 'women' || platform === 'youth') return;
    const unsub = onSnapshot(collection(db, 'Players'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosteredPlayer));
      setPlayers(list.map((p) => ({ id: p.id })));
      setRosterPlayers(list);
    });
    return () => unsub();
  }, [platform]);

  useEffect(() => {
    const coll = CONTACTS_COLLECTIONS[platform];
    const unsub = onSnapshot(collection(db, coll), (snap) => {
      setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContactFull)));
    });
    return () => unsub();
  }, [platform]);

  useEffect(() => {
    const coll = CLUB_REQUESTS_COLLECTIONS[platform];
    const unsub = onSnapshot(collection(db, coll), (snap) => {
      setRequests(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as { id: string; status?: string }))
      );
    });
    return () => unsub();
  }, [platform]);

  useEffect(() => {
    const coll = AGENT_TASKS_COLLECTIONS[platform];
    const unsub = onSnapshot(collection(db, coll), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AgentTask)));
    });
    return () => unsub();
  }, [platform]);

  useEffect(() => {
    if (!user) return;
    const shortlistColl = SHORTLISTS_COLLECTIONS[platform];
    const unsub = onSnapshot(
      collection(db, shortlistColl),
      (snap) => {
        setShortlistCount(snap.docs.length);
      },
      () => setShortlistCount(0)
    );
    return () => unsub();
  }, [user, platform]);

  useEffect(() => {
    if (platform !== 'men') return; // Transfer windows only for men
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
  }, [platform]);

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

  const toggleWindowCountry = (countryKey: string) => {
    setExpandedWindowCountries((prev) => {
      const next = new Set(prev);
      if (next.has(countryKey)) next.delete(countryKey);
      else next.add(countryKey);
      return next;
    });
  };

  const clubContactsByCountry = useMemo(() => {
    const map: Record<string, ContactFull[]> = {};
    for (const c of contacts) {
      if (c.contactType !== 'CLUB' || !c.clubCountry) continue;
      const key = c.clubCountry.trim().toLowerCase();
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    // Sort each group by clubName
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.clubName || '').localeCompare(b.clubName || ''));
    }
    return map;
  }, [contacts]);

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
        name: translateType(type, t, platform),
        value: count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }));
  }, [eventsThisWeek, t, platform]);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const eventsToday = useMemo(
    () => events.filter((e) => (e.timestamp || 0) >= startOfToday),
    [events, startOfToday]
  );

  const topAgentsThisWeek = useMemo(() => {
    const byAccountId: Record<string, { account: Account; count: number }> = {};
    accounts.forEach((a) => {
      byAccountId[a.id] = { account: a, count: 0 };
    });
    eventsThisWeek.forEach((e) => {
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
  }, [accounts, eventsThisWeek, isRtl]);

  const leadingAgencies = useMemo(() => {
    const agencyContacts = contacts.filter(
      (c) => c.contactType === 'AGENCY' && (c.agencyName?.trim() ?? '').length > 0
    );
    const byAgency = new Map<
      string,
      { agencyName: string; agencyCountry?: string; contactNames: string[]; contactIds: string[]; agencyUrls: string[] }
    >();
    for (const c of agencyContacts) {
      const agencyName = c.agencyName!.trim();
      const key = agencyName.toLowerCase();
      const contactName = c.name?.trim();
      const agencyUrl = c.agencyUrl?.trim();
      if (!byAgency.has(key)) {
        byAgency.set(key, {
          agencyName,
          agencyCountry: c.agencyCountry?.trim() || undefined,
          contactNames: contactName ? [contactName] : [],
          contactIds: [c.id],
          agencyUrls: agencyUrl ? [agencyUrl] : [],
        });
      } else {
        const entry = byAgency.get(key)!;
        if (contactName && !entry.contactNames.includes(contactName)) {
          entry.contactNames.push(contactName);
        }
        entry.contactIds.push(c.id);
        if (agencyUrl && !entry.agencyUrls.includes(agencyUrl)) {
          entry.agencyUrls.push(agencyUrl);
        }
      }
    }
    const counts: { agencyName: string; agencyCountry?: string; contactNames: string[]; count: number }[] = [];
    for (const [key, entry] of Array.from(byAgency.entries())) {
      const count = rosterPlayers.filter((p) => {
        if (entry.contactIds.includes(p.linkedContactId ?? '')) return true;
        const playerUrl = p.agencyUrl?.trim();
        if (playerUrl && entry.agencyUrls.includes(playerUrl)) return true;
        const playerAgency = (p.agency?.trim() ?? '').toLowerCase();
        return playerAgency.length > 0 && playerAgency === key;
      }).length;
      counts.push({ agencyName: entry.agencyName, agencyCountry: entry.agencyCountry, contactNames: entry.contactNames, count });
    }
    const withPlayers = counts.filter((x) => x.count > 0);
    const maxCount = Math.max(...withPlayers.map((x) => x.count), 1);
    return withPlayers
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((item, i) => ({
        ...item,
        barPct: maxCount > 0 ? (item.count / maxCount) * 100 : 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [contacts, rosterPlayers]);

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

  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
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
        className={`max-w-7xl ${isRtl ? 'text-right' : 'text-left'} ${isWomen || isYouth ? 'relative' : ''}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Women: ambient gradient orbs */}
        {isWomen && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
            <div
              className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25"
              style={{ background: 'radial-gradient(circle, var(--women-rose) 0%, transparent 65%)' }}
            />
            <div
              className="absolute top-1/3 -left-16 w-72 h-72 rounded-full opacity-15"
              style={{ background: 'radial-gradient(circle, var(--women-blush) 0%, transparent 65%)' }}
            />
          </div>
        )}

        {/* Youth: ambient glassmorphism glow orbs */}
        {isYouth && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
            <div
              className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, var(--youth-cyan) 0%, transparent 65%)' }}
            />
            <div
              className="absolute top-1/3 -left-16 w-72 h-72 rounded-full opacity-15"
              style={{ background: 'radial-gradient(circle, var(--youth-violet) 0%, transparent 65%)' }}
            />
          </div>
        )}

        {/* Header: greeting + platform switch & language */}
        <div className={`flex flex-wrap items-start justify-between gap-3 sm:gap-4 mb-6 sm:mb-10 animate-fade-in ${isWomen || isYouth ? 'sm:mb-12' : ''}`}>
          <div className="space-y-1">
            <p className="text-mgsr-muted text-sm font-medium">
              {greeting},
            </p>
            <h1 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold font-display tracking-tight ${isWomen ? 'text-mgsr-text bg-clip-text' : 'text-mgsr-text'}`}>
              {userName}
            </h1>
            <p className="text-mgsr-muted text-sm mt-1">{dateStr}</p>
          </div>
          {/* Hide platform/lang controls on mobile — MobileHeader handles them */}
          <div className={`hidden lg:flex items-center gap-2 p-1 rounded-xl border bg-mgsr-card/80 relative ${isWomen ? 'border-[var(--women-rose)]/20 rounded-2xl' : isYouth ? 'border-[var(--youth-cyan)]/20 rounded-2xl' : 'border-mgsr-border'}`}>
            <PlatformSwitcher variant="grouped" />
            <span className={`w-px h-6 ${isYouth ? 'bg-[var(--youth-cyan)]/30' : isWomen ? 'bg-[var(--women-rose)]/30' : 'bg-mgsr-border/80'}`} aria-hidden />
            <button
              onClick={() => setLang(lang === 'en' ? 'he' : 'en')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isYouth ? 'text-mgsr-muted hover:text-[var(--youth-cyan)]' : isWomen ? 'text-mgsr-muted hover:text-[var(--women-rose)]' : 'text-mgsr-muted hover:text-mgsr-teal'}`}
              aria-label={lang === 'en' ? 'Switch to Hebrew' : 'עברית לאנגלית'}
            >
              {lang === 'en' ? 'עברית' : 'English'}
            </button>
          </div>
        </div>

        {/* Stats row — horizontally scrollable on phone, grid on tablet/desktop */}
        <div className={`mb-6 sm:mb-10 ${isWomen ? '' : ''}`}>
          <div className={`${isWomen || isYouth ? 'grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5' : 'flex lg:grid lg:grid-cols-6 gap-3 lg:gap-4 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0'}`}
               style={!isWomen && !isYouth ? { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } : undefined}>
          {(platform === 'youth'
            ? [
                { href: '/players', count: youthPlayers.length, label: t('nav_players_youth') },
                { href: '/tasks', count: tasks.filter((t) => !t.isCompleted).length, label: t('tasks') },
                { href: '/shortlist', count: shortlistCount, label: t('shortlist') },
                { href: '/contacts', count: contacts.length, label: t('contacts') },
                { href: '/requests', count: requests.length, label: t('requests') },
              ]
            : platform === 'women'
            ? [
                { href: '/players', count: womenPlayers.length, label: t('players_women') },
                { href: '/tasks', count: tasks.filter((t) => !t.isCompleted).length, label: t('tasks') },
              ]
            : [
                { href: '/players', count: players.length, label: t('players') },
                { href: '/contacts', count: contacts.length, label: t('contacts') },
                { href: '/requests', count: requests.length, label: t('requests') },
                { href: '/tasks', count: tasks.filter((t) => !t.isCompleted).length, label: t('tasks') },
                { href: '/shortlist', count: shortlistCount, label: t('shortlist') },
                { href: '/releases', count: null, label: t('releases'), arrow: true },
                { href: '/returnees', count: null, label: t('nav_returnee'), arrow: true },
                { href: '/contract-finisher', count: null, label: t('nav_contract_finisher'), arrow: true },
              ]
          ).map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative p-4 sm:p-5 border rounded-2xl transition-all duration-300 animate-slide-up min-h-[80px] flex flex-col justify-center shrink-0 ${
                !isWomen && !isYouth ? 'min-w-[140px] lg:min-w-0' : ''
              } ${
                isYouth
                  ? 'bg-mgsr-card/40 border-[var(--youth-cyan)]/15 hover:border-[var(--youth-cyan)]/40 hover:bg-mgsr-card/60 shadow-[0_0_30px_rgba(0,212,255,0.06)] backdrop-blur-sm'
                  : isWomen
                  ? 'bg-mgsr-card/60 border-[var(--women-rose)]/15 hover:border-[var(--women-rose)]/40 hover:bg-mgsr-card/80 shadow-[0_0_30px_rgba(232,160,191,0.06)]'
                  : 'bg-mgsr-card/80 border border-mgsr-border hover:border-[var(--mgsr-accent)]/40 hover:bg-mgsr-card'
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold font-display" style={{ color: isYouth ? 'var(--youth-cyan)' : isWomen ? 'var(--women-rose)' : 'var(--mgsr-accent)' }}>
                {item.arrow ? (isRtl ? '←' : '→') : item.count}
              </p>
              <p className="text-xs lg:text-sm text-mgsr-muted mt-1">{item.label}</p>
              {'badge' in item && typeof item.badge === 'number' && item.badge > 0 && (
                <span className="absolute top-3 end-3 text-xs font-medium text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                  {item.badge} {t('pending')}
                </span>
              )}
            </Link>
          ))}
          </div>
        </div>

        {/* Charts row (men only; women & youth have simplified dashboards) */}
        {platform === 'men' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-10">
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
                        stopColor="var(--mgsr-accent)"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--mgsr-accent)"
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
                    stroke="var(--mgsr-accent)"
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
        )}

        {/* Roster Analytics (men only) */}
        {platform === 'men' && rosterPlayers.length > 0 && (
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {/* Position distribution */}
              <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-3 md:mb-4 font-display">
                  {t('roster_analytics_position')}
                </h3>
                <div className={isMobile ? 'min-h-[140px]' : 'h-48'}>
                  {positionByGroup.length > 0 ? (
                    isMobile ? (
                      <div className="space-y-3">
                        {(() => {
                          const maxVal = Math.max(...positionByGroup.map((d) => d.value), 1);
                          return positionByGroup.map((item) => (
                            <div key={item.name} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <span className="text-sm text-mgsr-text font-medium truncate min-w-0">
                                  {item.name}
                                </span>
                                <span className="text-sm font-semibold text-mgsr-text tabular-nums shrink-0">
                                  {item.value}
                                </span>
                              </div>
                              <div className="h-6 bg-mgsr-dark rounded-lg overflow-hidden">
                                <div
                                  className="h-full rounded-lg bg-[#4DB6AC] transition-all duration-500"
                                  style={{ width: `${Math.max((item.value / maxVal) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={positionByGroup}
                          margin={{ left: 8, right: 12, top: 8, bottom: 24 }}
                        >
                          <XAxis dataKey="name" stroke="#8C999B" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#E8EAED' }} interval={0} />
                          <YAxis stroke="#8C999B" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
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
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm min-h-[80px]">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Age distribution */}
              <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-3 md:mb-4 font-display">
                  {t('roster_analytics_age')}
                </h3>
                <div className={isMobile ? 'min-h-[140px]' : 'h-48'}>
                  {ageByGroup.length > 0 ? (
                    isMobile ? (
                      <div className="space-y-3">
                        {(() => {
                          const maxCount = Math.max(...ageByGroup.map((d) => d.count), 1);
                          return ageByGroup.map((item) => (
                            <div key={item.name} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <span className="text-sm text-mgsr-text font-medium truncate min-w-0">
                                  {item.name}
                                </span>
                                <span className="text-sm font-semibold text-mgsr-text tabular-nums shrink-0">
                                  {item.count}
                                </span>
                              </div>
                              <div className="h-6 bg-mgsr-dark rounded-lg overflow-hidden">
                                <div
                                  className="h-full rounded-lg bg-[#5C6BC0] transition-all duration-500"
                                  style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={ageByGroup}
                          margin={{ left: 8, right: 12, top: 8, bottom: 24 }}
                        >
                          <XAxis dataKey="name" stroke="#8C999B" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#E8EAED' }} />
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
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm min-h-[80px]">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Market value distribution */}
              <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-3 md:mb-4 font-display">
                  {t('roster_analytics_value')}
                </h3>
                <div className={isMobile ? 'min-h-[140px]' : 'h-48'}>
                  {valueByRange.length > 0 ? (
                    isMobile ? (
                      <div className="space-y-3">
                        {(() => {
                          const maxCount = Math.max(...valueByRange.map((d) => d.count), 1);
                          return valueByRange.map((item) => (
                            <div key={item.name} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <span className="text-sm text-mgsr-text font-medium truncate min-w-0">
                                  {item.name}
                                </span>
                                <span className="text-sm font-semibold text-mgsr-text tabular-nums shrink-0">
                                  {item.count}
                                </span>
                              </div>
                              <div className="h-6 bg-mgsr-dark rounded-lg overflow-hidden">
                                <div
                                  className="h-full rounded-lg bg-[#FF7043] transition-all duration-500"
                                  style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={valueByRange}
                          margin={{ left: 8, right: 12, top: 8, bottom: 24 }}
                        >
                          <XAxis dataKey="name" stroke="#8C999B" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#E8EAED' }} />
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
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm min-h-[80px]">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Contracts expiring */}
              <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm md:col-span-2">
                <h3 className="text-sm font-semibold text-mgsr-text mb-3 md:mb-4 font-display">
                  {t('roster_analytics_contracts')}
                </h3>
                <div className={isMobile ? 'min-h-[120px]' : 'h-48'}>
                  {contractByMonth.length > 0 ? (
                    isMobile ? (
                      <div className="space-y-3">
                        {(() => {
                          const maxCount = Math.max(...contractByMonth.map((d) => d.count), 1);
                          return contractByMonth.map((item) => (
                            <div key={item.month} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 min-w-0">
                                <span className="text-sm text-mgsr-text font-medium truncate min-w-0">
                                  {item.month}
                                </span>
                                <span className="text-sm font-semibold text-mgsr-text tabular-nums shrink-0">
                                  {item.count}
                                </span>
                              </div>
                              <div className="h-6 bg-mgsr-dark rounded-lg overflow-hidden">
                                <div
                                  className="h-full rounded-lg bg-[#EC407A] transition-all duration-500"
                                  style={{ width: `${Math.max((item.count / maxCount) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={contractByMonth}
                          margin={{ left: 8, right: 12, top: 8, bottom: 24 }}
                        >
                          <XAxis dataKey="month" stroke="#8C999B" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#E8EAED' }} />
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
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-mgsr-muted text-sm min-h-[80px]">
                      —
                    </div>
                  )}
                </div>
              </div>

              {/* Mandate status */}
              <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-mgsr-text mb-3 md:mb-4 font-display">
                  {t('roster_analytics_mandates')}
                </h3>
                <div className="min-h-[120px] flex flex-col justify-center">
                  {mandateData.length > 0 ? (
                    isMobile ? (
                      <div className="grid grid-cols-2 gap-3">
                        {mandateData.map((entry) => {
                          const pct = rosterPlayers.length > 0
                            ? Math.round((entry.value / rosterPlayers.length) * 100)
                            : 0;
                          return (
                            <div
                              key={entry.name}
                              className="relative overflow-hidden rounded-xl border border-mgsr-border/80 p-4 transition-all duration-300"
                              style={{
                                backgroundColor: `${entry.color}12`,
                                borderColor: `${entry.color}40`,
                              }}
                            >
                              <p className="text-2xl font-bold font-display tabular-nums" style={{ color: entry.color }}>
                                {entry.value}
                              </p>
                              <p className="text-xs text-mgsr-muted mt-0.5 truncate">{entry.name}</p>
                              <span className="absolute top-3 end-3 text-[10px] font-semibold opacity-70" style={{ color: entry.color }}>
                                {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {mandateData.map((entry) => {
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
                    )
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

        {/* Staff, Top agents & Leading agencies (men only for top agents & agencies) */}
        <div className={`grid gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-10 ${isWomen || isYouth ? 'grid-cols-1 max-w-md' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
          <div className={`p-4 md:p-6 border rounded-2xl backdrop-blur-sm ${
            isYouth ? 'bg-mgsr-card/40 border-[var(--youth-cyan)]/20' : isWomen ? 'bg-mgsr-card/50 border-[var(--women-rose)]/20' : 'bg-mgsr-card/60 border border-mgsr-border'
          }`}>
            <h3 className={`text-sm font-semibold text-mgsr-text mb-4 font-display ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : ''}`}>
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
                      className={`text-sm hover:underline font-medium ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}
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

          {!isWomen && !isYouth && (
          <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-mgsr-text mb-4 font-display">
              {t('top_agents_this_week')}
            </h3>
            {topAgentsThisWeek.length > 0 ? (
              <div className="space-y-3">
                {topAgentsThisWeek.map((agent) => (
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
          )}

          {!isWomen && !isYouth && (
          <div className="p-4 md:p-6 bg-mgsr-card/60 border border-mgsr-border rounded-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-mgsr-text font-display">
                {t('leading_agencies_title')}
              </h3>
              <Link
                href="/contacts"
                className="text-xs font-medium text-mgsr-teal hover:text-mgsr-teal/80 transition flex items-center gap-1 shrink-0"
              >
                {t('contacts')}
                <span aria-hidden>{isRtl ? '←' : '→'}</span>
              </Link>
            </div>
            {leadingAgencies.length > 0 ? (
              <div className="space-y-3">
                {leadingAgencies.map((agency, i) => (
                  <div
                    key={`${agency.agencyName}-${i}`}
                    className="flex items-start gap-2 sm:gap-3 py-2 border-b border-mgsr-border/80 last:border-0 min-w-0"
                  >
                    <span
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-xs font-bold font-display shrink-0 flex-shrink-0"
                      style={{
                        backgroundColor: `${agency.color}40`,
                        color: agency.color,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-mgsr-text truncate">
                        {agency.agencyName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 min-w-0">
                        {agency.agencyCountry && (
                          <span className="text-xs text-mgsr-muted shrink-0">
                            {getCountryDisplayName(agency.agencyCountry, isRtl)}
                          </span>
                        )}
                        {agency.contactNames.length > 0 && (
                          <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-mgsr-teal/15 text-mgsr-teal font-medium truncate min-w-0">
                            {agency.contactNames.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1 bg-mgsr-dark rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(agency.barPct, 4)}%`,
                            backgroundColor: agency.color,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex-shrink-0">
                      <p className="text-sm font-bold text-mgsr-teal font-display tabular-nums">
                        {agency.count}
                      </p>
                      <p className="text-[10px] text-mgsr-muted">
                        {t('leading_agencies_players')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-mgsr-muted py-4">
                {t('leading_agencies_empty')}
              </p>
            )}
          </div>
          )}
        </div>

        {/* Transfer Windows — Open worldwide (men only) */}
        {platform === 'men' && (
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
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden bg-mgsr-card/30 border border-mgsr-border/50"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="h-4 w-4 rounded bg-mgsr-muted/40" />
                    <div className="h-4 flex-1 max-w-[140px] rounded bg-mgsr-muted/40" />
                    <div className="h-5 w-8 rounded-md bg-mgsr-muted/40" />
                  </div>
                  <div className="px-4 pb-3 pt-0 space-y-1.5">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <div
                        key={j}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-mgsr-muted/40 shrink-0" />
                          <div className="h-4 w-24 rounded bg-mgsr-muted/40" />
                        </div>
                        <div className="h-4 w-16 rounded bg-mgsr-muted/40 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
                          const countryKey = w.countryCode + w.countryName;
                          const matchingClubs = clubContactsByCountry[w.countryName.trim().toLowerCase()] || [];
                          const isCountryExpanded = expandedWindowCountries.has(countryKey);
                          return (
                            <div key={countryKey}>
                              <button
                                type="button"
                                onClick={() => { if (matchingClubs.length > 0) toggleWindowCountry(countryKey); }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-mgsr-dark/60 border border-mgsr-border/50 text-start transition ${matchingClubs.length > 0 ? 'hover:bg-mgsr-dark/80 cursor-pointer' : 'cursor-default'}`}
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
                                  {matchingClubs.length > 0 && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-mgsr-teal/15 text-mgsr-teal text-xs font-semibold">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                      {matchingClubs.length}
                                    </span>
                                  )}
                                  {matchingClubs.length > 0 && (
                                    <span
                                      className={`inline-flex text-mgsr-muted transition-transform duration-200 ${isCountryExpanded ? 'rotate-180' : ''}`}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="6 9 12 15 18 9" />
                                      </svg>
                                    </span>
                                  )}
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
                                    {w.daysLeft === 0
                                      ? t('transfer_windows_today')
                                      : t('transfer_windows_days_left').replace(
                                          '{n}',
                                          String(w.daysLeft)
                                        )}
                                  </span>
                                ) : (
                                  <span className="text-sm text-mgsr-muted shrink-0">
                                    {t('transfer_windows_open')}
                                  </span>
                                )}
                              </button>
                              {isCountryExpanded && matchingClubs.length > 0 && (
                                <div className={`mt-1 mb-1 ${isRtl ? 'mr-6' : 'ml-6'} space-y-1`}>
                                  {matchingClubs.map((contact) => {
                                    const waUrl = toWhatsAppUrl(contact.phoneNumber);
                                    return (
                                      <div
                                        key={contact.id}
                                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-mgsr-card/50 border border-mgsr-border/30"
                                      >
                                        {contact.clubLogo ? (
                                          <img
                                            src={contact.clubLogo}
                                            alt=""
                                            className="w-5 h-5 rounded object-contain shrink-0"
                                          />
                                        ) : (
                                          <span className="w-5 h-5 rounded bg-mgsr-muted/20 shrink-0 flex items-center justify-center text-[10px] text-mgsr-muted">🏟</span>
                                        )}
                                        <div className="flex flex-col min-w-0 flex-1 leading-tight">
                                          <span className="text-sm text-mgsr-text font-medium truncate">
                                            {contact.name || '—'}
                                          </span>
                                          <span className="text-xs text-mgsr-muted truncate">
                                            {contact.clubName || ''}
                                          </span>
                                        </div>
                                        {waUrl && (
                                          <a
                                            href={waUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="shrink-0 p-1 rounded-md hover:bg-green-500/15 transition-colors"
                                            title="WhatsApp"
                                          >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
                                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                            </svg>
                                          </a>
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
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Quick actions — scrollable on mobile */}
        <div className={`mb-6 sm:mb-10 ${platform === 'women' || platform === 'youth' ? '' : ''}`}>
          <div className={`${platform === 'women' || platform === 'youth' ? 'grid grid-cols-2 md:grid-cols-3 gap-4' : 'flex lg:grid lg:grid-cols-6 gap-3 lg:gap-4 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0'}`}
               style={platform === 'men' ? { scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } : undefined}>
          {(platform === 'youth'
            ? [
                { href: '/players', label: t('nav_players_youth') },
                { href: '/tasks', label: t('tasks') },
                { href: '/shortlist', label: t('shortlist') },
                { href: '/contacts', label: t('contacts') },
                { href: '/portfolio', label: t('nav_portfolio') },
              ]
            : platform === 'women'
            ? [
                { href: '/players', label: t('players_women') },
                { href: '/tasks', label: t('tasks') },
              ]
            : [
                { href: '/shortlist', label: t('shortlist') },
                { href: '/releases', label: t('releases') },
                { href: '/returnees', label: t('nav_returnee') },
                { href: '/contract-finisher', label: t('nav_contract_finisher') },
                { href: '/tasks', label: t('tasks') },
                { href: '/requests', label: t('requests') },
                { href: '/contacts', label: t('contacts') },
              ]
          ).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`p-4 border rounded-xl transition text-center font-medium shrink-0 ${
                platform === 'men' ? 'min-w-[120px] lg:min-w-0' : ''
              } ${
                isYouth
                  ? 'bg-mgsr-card/40 border-[var(--youth-cyan)]/20 hover:border-[var(--youth-cyan)]/50 hover:bg-mgsr-card/60 backdrop-blur-sm'
                  : isWomen
                  ? 'bg-mgsr-card/50 border-[var(--women-rose)]/20 hover:border-[var(--women-rose)]/50 hover:bg-mgsr-card/70'
                  : 'bg-mgsr-card/60 border border-mgsr-border hover:border-[var(--mgsr-accent)]/50 hover:bg-mgsr-card'
              }`}
              style={{ color: isYouth ? 'var(--youth-cyan)' : isWomen ? 'var(--women-rose)' : 'var(--mgsr-accent)' }}
            >
              {item.label}
            </Link>
          ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className={`relative ${isWomen || isYouth ? 'rounded-2xl' : ''}`}>
          <h2 className={`text-lg font-semibold text-mgsr-text mb-6 font-display ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : ''}`}>
            {t('recent_activity')}
          </h2>
          {eventsLoading ? (
            <div className="flex items-center gap-3 py-8 text-mgsr-muted">
              <div className={`w-2 h-2 rounded-full animate-pulse ${isYouth ? 'bg-[var(--youth-cyan)]/50' : isWomen ? 'bg-[var(--women-rose)]/50' : 'bg-mgsr-teal/50'}`} />
              <span>{t('loading_feed')}</span>
            </div>
          ) : events.length === 0 ? (
            <div className={`relative overflow-hidden p-12 bg-mgsr-card/40 border rounded-2xl text-center ${
              isYouth ? 'border-[var(--youth-cyan)]/20' : isWomen ? 'border-[var(--women-rose)]/20' : 'border border-mgsr-border'
            }`}>
              <div className={`absolute inset-0 ${isYouth ? 'bg-gradient-to-b from-[var(--youth-cyan)]/8 to-transparent' : isWomen ? 'bg-gradient-to-b from-[var(--women-rose)]/8 to-transparent' : 'bg-gradient-to-b from-mgsr-teal/5 to-transparent'}`} />
              <p className="relative text-mgsr-muted">{t(platform === 'youth' ? 'no_recent_activity' : platform === 'women' ? 'no_recent_activity_women' : 'no_recent_activity')}</p>
            </div>
          ) : isWomen ? (
            /* Women: timeline with rose styling */
            <div className="relative">
              <div
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-[var(--women-rose)]/50 via-[var(--women-rose)]/20 to-transparent"
                style={{ [isRtl ? 'right' : 'left']: '19px' }}
              />
              <div className="space-y-0">
                {events.slice(0, 15).map((ev, i) => {
                  const color = getEventColor(ev.type || '');
                  const typeLabel = translateType(ev.type || '', t, platform) || ev.type;
                  const { href, hasLink } = getFeedEventLink(ev, rosterPlayers, womenPlayers, youthPlayers, platform);
                  const cardContent = (
                    <div
                      className={`flex-1 min-w-0 rounded-xl border bg-mgsr-card/70 px-4 py-3.5 transition-all duration-200 ${
                        hasLink
                          ? 'border-[var(--women-rose)]/25 hover:border-[var(--women-rose)]/50 hover:bg-mgsr-card/90 cursor-pointer'
                          : 'border-mgsr-border/80'
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
                              backgroundColor: `${color}25`,
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
                              <span className="mx-1.5 text-[var(--women-rose)]/70">→</span>
                              {ev.newValue}
                            </p>
                          )}
                          {ev.agentName && (
                            <p className="text-xs text-mgsr-muted/90 mt-1">
                              {t('by')} {resolveAgentDisplayName(ev.agentName, accounts, isRtl)}
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
                      id={`feed-event-${ev.id}`}
                      className="group relative flex gap-3 sm:gap-5 py-3 sm:py-4 animate-slide-up"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div
                        className="relative z-10 shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-mgsr-dark bg-mgsr-card"
                        style={{
                          borderColor: color,
                          boxShadow: `0 0 0 1px ${color}40, 0 0 16px rgba(232,160,191,0.15)`,
                        }}
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
                      {hasLink ? (
                        <Link href={href} className="flex-1 min-w-0 block">
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
          ) : isYouth ? (
            /* Youth: timeline with cyan/violet glassmorphism */
            <div className="relative">
              <div
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-[var(--youth-cyan)]/50 via-[var(--youth-violet)]/20 to-transparent"
                style={{ [isRtl ? 'right' : 'left']: '19px' }}
              />
              <div className="space-y-0">
                {events.slice(0, 15).map((ev, i) => {
                  const color = getEventColor(ev.type || '');
                  const typeLabel = translateType(ev.type || '', t, platform) || ev.type;
                  const { href, hasLink } = getFeedEventLink(ev, rosterPlayers, womenPlayers, youthPlayers, platform);
                  const cardContent = (
                    <div
                      className={`flex-1 min-w-0 rounded-xl border bg-mgsr-card/40 backdrop-blur-sm px-4 py-3.5 transition-all duration-200 ${
                        hasLink ? 'border-[var(--youth-cyan)]/15 hover:border-[var(--youth-cyan)]/40 hover:bg-mgsr-card/60 cursor-pointer' : ''
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
                            style={{ backgroundColor: `${color}25`, color }}
                          >
                            {typeLabel}
                          </span>
                          <p className="text-mgsr-text font-medium leading-snug">
                            {ev.playerName || ev.extraInfo || '—'}
                          </p>
                          {ev.oldValue && ev.newValue && (
                            <p className="text-sm text-mgsr-muted mt-1 font-mono">
                              {ev.oldValue}
                              <span className="mx-1.5 text-[var(--youth-cyan)]/70">→</span>
                              {ev.newValue}
                            </p>
                          )}
                          {ev.agentName && (
                            <p className="text-xs text-mgsr-muted/90 mt-1">
                              {t('by')} {resolveAgentDisplayName(ev.agentName, accounts, isRtl)}
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
                      id={`feed-event-${ev.id}`}
                      className="group relative flex gap-3 sm:gap-5 py-3 sm:py-4 animate-slide-up"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div
                        className="relative z-10 shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-mgsr-dark bg-mgsr-card"
                        style={{
                          borderColor: color,
                          boxShadow: `0 0 0 1px ${color}40, 0 0 16px rgba(0,212,255,0.15)`,
                        }}
                      >
                        {ev.playerImage ? (
                          <img src={ev.playerImage} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold font-display" style={{ color }}>
                            {(ev.playerName || typeLabel || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {hasLink ? (
                        <Link href={href} className="flex-1 min-w-0 block">
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
          ) : (
            /* Men: timeline design */
            <div className="relative">
              <div
                className="absolute top-0 bottom-0 w-px bg-gradient-to-b from-mgsr-teal/30 via-mgsr-border to-transparent"
                style={{ [isRtl ? 'right' : 'left']: '19px' }}
              />
              <div className="space-y-0">
                {events.slice(0, 15).map((ev, i) => {
                  const color = getEventColor(ev.type || '');
                  const typeLabel = translateType(ev.type || '', t, platform) || ev.type;
                  const { href, hasLink } = getFeedEventLink(ev, rosterPlayers, womenPlayers, youthPlayers, platform);
                  const cardContent = (
                    <div
                      className={`flex-1 min-w-0 rounded-xl border border-mgsr-border bg-mgsr-card/60 px-4 py-3 transition-all duration-200 ${
                        hasLink ? 'hover:border-mgsr-teal/40 hover:bg-mgsr-card/80 cursor-pointer' : ''
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
                            style={{ backgroundColor: `${color}20`, color }}
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
                              {t('by')} {resolveAgentDisplayName(ev.agentName, accounts, isRtl)}
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
                    <div key={ev.id} id={`feed-event-${ev.id}`} className="group relative flex gap-3 sm:gap-5 py-3 sm:py-4 animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                      <div
                        className="relative z-10 shrink-0 flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-mgsr-dark bg-mgsr-card shadow-lg"
                        style={{ borderColor: color, boxShadow: `0 0 0 1px ${color}40` }}
                      >
                        {ev.playerImage ? (
                          <img src={ev.playerImage} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold font-display" style={{ color }}>
                            {(ev.playerName || typeLabel || '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {hasLink ? (
                        <Link href={href} className="flex-1 min-w-0 block">
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
