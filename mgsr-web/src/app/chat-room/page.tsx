'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import AppLayout from '@/components/AppLayout';
import { db, storage } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  getCurrentAccountForShortlist,
  getAllAccounts,
  type AccountForShortlist,
} from '@/lib/accounts';
import { callChatRoomSend, callChatRoomEdit, callChatRoomDelete } from '@/lib/callables';
import Link from 'next/link';

/* ── Types ───────────────────────────────────────────────────────────── */

interface PlayerMention {
  playerId: string;
  playerName: string;
  playerNameHe: string;
  tmProfile: string;
}

interface ChatMessage {
  id: string;
  text: string;
  senderAccountId: string;
  senderName: string;
  senderNameHe: string;
  mentions: PlayerMention[];
  notifyAccountId?: string;
  createdAt: number;
  editedAt?: number;
  replyTo?: {
    messageId: string;
    text: string;
    senderName: string;
    senderNameHe: string;
  };
  attachments?: {
    url: string;
    name: string;
    type: string;
    size: number;
  }[];
}

interface PendingAttachment {
  file: File;
  previewUrl?: string;
}

interface Player {
  id: string;
  fullName?: string;
  fullNameHe?: string;
  tmProfile?: string;
  profileImage?: string;
  positions?: string[];
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateSeparator(ts: number, todayLabel = 'Today', yesterdayLabel = 'Yesterday'): string {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return todayLabel;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isSameDay(a: number, b: number): boolean {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function ChatRoomPage() {
  const { user } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const { platform } = usePlatform();
  const isHe = lang === 'he';

  /* state */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [accounts, setAccounts] = useState<AccountForShortlist[]>([]);
  const [currentAccount, setCurrentAccount] =
    useState<AccountForShortlist | null>(null);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);

  /* edit/delete state */
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [actionMenuMsgId, setActionMenuMsgId] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  /* @mention state */
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [collectedMentions, setCollectedMentions] = useState<PlayerMention[]>(
    []
  );

  /* reply state */
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);

  /* attachment state */
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* search state */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* online presence state */
  const [onlineAccountIds, setOnlineAccountIds] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* scroll to bottom — only if user is already near the bottom */
  const scrollToBottom = useCallback((force = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (force || isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const prevMsgCount = useRef(0);
  useEffect(() => {
    // Force-scroll on first load (0→N), gentle-scroll on new messages
    const isFirstLoad = prevMsgCount.current === 0 && messages.length > 0;
    scrollToBottom(isFirstLoad);
    prevMsgCount.current = messages.length;
  }, [messages.length, scrollToBottom]);

  /* highlight from URL */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const h = params.get('highlight');
    if (h) {
      setHighlightId(h);
      setTimeout(() => {
        document.getElementById(`msg-${h}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
      setTimeout(() => setHighlightId(null), 4000);
    }
  }, []);

  /* ── Data fetching ─────────────────────────────────────────────────── */

  /* Messages real-time */
  useEffect(() => {
    const q = query(
      collection(db, 'ChatRoom'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as ChatMessage)
        );
        setMessages(list);
        setLoading(false);
      },
      (err) => {
        console.error('ChatRoom snapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /* Players for @mention */
  useEffect(() => {
    const q = query(collection(db, 'Players'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Player)
      );
      setPlayers(list);
    });
    return () => unsub();
  }, []);

  /* Accounts */
  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then(setCurrentAccount);
    getAllAccounts().then(setAccounts);
  }, [user]);

  /* Online presence: write heartbeat + listen to others */
  useEffect(() => {
    if (!currentAccount) return;
    const presenceRef = doc(db, 'ChatRoomPresence', currentAccount.id);

    // Write initial presence
    const writePresence = () => {
      setDoc(presenceRef, {
        name: currentAccount.name || '',
        hebrewName: currentAccount.hebrewName || '',
        lastActive: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    };
    writePresence();
    const heartbeat = setInterval(writePresence, 60_000);

    // Listen to all presence docs
    const unsub = onSnapshot(collection(db, 'ChatRoomPresence'), (snap) => {
      const now = Date.now();
      const online = new Set<string>();
      for (const d of snap.docs) {
        const data = d.data();
        const ts = data.lastActive?.toMillis?.();
        // Pending serverTimestamp (local write) shows as null — treat as online
        if (ts === undefined || ts === null || (now - ts < 3 * 60_000)) {
          online.add(d.id);
        }
      }
      setOnlineAccountIds(online);
    });

    // Cleanup: remove presence on unmount
    return () => {
      clearInterval(heartbeat);
      unsub();
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [currentAccount]);

  /* @mention filtering */
  const filteredPlayers = useMemo(() => {
    if (!mentionQuery) return players.slice(0, 20);
    const q = mentionQuery.toLowerCase();
    return players
      .filter(
        (p) =>
          p.fullName?.toLowerCase().includes(q) ||
          p.fullNameHe?.includes(q)
      )
      .slice(0, 20);
  }, [players, mentionQuery]);

  /* Search filtering */
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((msg) => {
      if (msg.text?.toLowerCase().includes(q)) return true;
      if (msg.senderName?.toLowerCase().includes(q)) return true;
      if (msg.senderNameHe?.includes(q)) return true;
      if (msg.mentions?.some(m => m.playerName?.toLowerCase().includes(q) || m.playerNameHe?.includes(q))) return true;
      return false;
    });
  }, [messages, searchQuery]);

  /* Online count */
  const onlineCount = onlineAccountIds.size;

  /* ── Handlers ──────────────────────────────────────────────────────── */

  const handleTextChange = (value: string) => {
    setText(value);
    const lastAt = value.lastIndexOf('@');
    if (lastAt >= 0) {
      const afterAt = value.substring(lastAt + 1);
      if (!afterAt.includes(' ')) {
        setShowMentionDropdown(true);
        setMentionQuery(afterAt);
        return;
      }
    }
    setShowMentionDropdown(false);
    setMentionQuery('');
  };

  const handleSelectMention = (player: Player) => {
    const lastAt = text.lastIndexOf('@');
    const displayName = isHe ? player.fullNameHe || player.fullName : player.fullName || player.fullNameHe;
    const before = text.substring(0, lastAt);
    const newText = `${before}@${displayName} `;
    setText(newText);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setCollectedMentions((prev) => {
      if (prev.some((m) => m.playerId === player.id)) return prev;
      return [
        ...prev,
        {
          playerId: player.id,
          playerName: player.fullName || '',
          playerNameHe: player.fullNameHe || '',
          tmProfile: player.tmProfile || '',
        },
      ];
    });
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if ((!text.trim() && pendingAttachments.length === 0) || !currentAccount || isSending) return;
    setIsSending(true);
    try {
      // Upload pending attachments to Firebase Storage
      let uploadedAttachments: { url: string; name: string; type: string; size: number }[] | undefined;
      if (pendingAttachments.length > 0) {
        setIsUploading(true);
        uploadedAttachments = [];
        for (const pa of pendingAttachments) {
          const storagePath = `ChatRoom/${Date.now()}_${pa.file.name}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, pa.file);
          const downloadUrl = await getDownloadURL(storageRef);
          uploadedAttachments.push({
            url: downloadUrl,
            name: pa.file.name,
            type: pa.file.type || 'application/octet-stream',
            size: pa.file.size,
          });
        }
        setIsUploading(false);
      }

      // Build replyTo payload
      const replyTo = replyToMessage ? {
        messageId: replyToMessage.id,
        text: replyToMessage.text.substring(0, 200),
        senderName: replyToMessage.senderName,
        senderNameHe: replyToMessage.senderNameHe,
      } : undefined;

      await callChatRoomSend({
        text: text.trim(),
        senderAccountId: currentAccount.id,
        senderName: currentAccount.name || '',
        senderNameHe: currentAccount.hebrewName || currentAccount.name || '',
        mentions: collectedMentions.map((m) => ({
          playerId: m.playerId,
          playerName: m.playerName,
        })),
        notifyAccountId: targetAccountId || undefined,
        replyTo,
        attachments: uploadedAttachments,
      });
      setText('');
      setCollectedMentions([]);
      setTargetAccountId(null);
      setReplyToMessage(null);
      setPendingAttachments([]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setIsUploading(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showMentionDropdown && filteredPlayers.length > 0) {
        // Select first player from dropdown instead of sending
        handleSelectMention(filteredPlayers[0]);
        return;
      }
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: PendingAttachment[] = Array.from(files).map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setPendingAttachments((prev) => [...prev, ...newAttachments]);
    // Reset input so same file can be picked again
    e.target.value = '';
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => {
      const copy = [...prev];
      if (copy[index]?.previewUrl) URL.revokeObjectURL(copy[index].previewUrl!);
      copy.splice(index, 1);
      return copy;
    });
  };

  const scrollToMessage = (messageId: string) => {
    setHighlightId(messageId);
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightId(null), 2000);
  };

  const handleEditSave = async () => {
    if (!editingMessageId || !editText.trim() || !currentAccount || isEditSaving) return;
    setIsEditSaving(true);
    try {
      await callChatRoomEdit({
        messageId: editingMessageId,
        senderAccountId: currentAccount.id,
        newText: editText.trim(),
      });
    } catch (err) {
      console.error('Edit failed:', err);
    } finally {
      setIsEditSaving(false);
    }
    setEditingMessageId(null);
    setEditText('');
  };

  const handleDelete = async (messageId: string) => {
    if (!currentAccount || deletingMsgId) return;
    setDeletingMsgId(messageId);
    try {
      await callChatRoomDelete({
        messageId,
        senderAccountId: currentAccount.id,
      });
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingMsgId(null);
    }
    setActionMenuMsgId(null);
  };

  /* ── Render helpers ──────────────────────────────────────────────── */

  const senderDisplayName = (msg: ChatMessage) =>
    isHe ? msg.senderNameHe || msg.senderName : msg.senderName;

  const renderMessageText = (msg: ChatMessage) => {
    if (!msg.mentions?.length) return <span>{msg.text}</span>;

    let remaining = msg.text;
    const parts: React.ReactNode[] = [];
    let key = 0;

    for (const m of msg.mentions) {
      const mentionName = isHe
        ? m.playerNameHe || m.playerName
        : m.playerName || m.playerNameHe;
      const tag = `@${mentionName}`;
      const idx = remaining.indexOf(tag);
      if (idx === -1) continue;
      if (idx > 0) {
        parts.push(<span key={key++}>{remaining.substring(0, idx)}</span>);
      }
      parts.push(
        <Link
          key={key++}
          href={`/players/${m.playerId}?from=/chat-room`}
          className="inline-block rounded px-1 font-semibold text-[var(--mgsr-teal)] hover:underline"
        >
          {tag}
        </Link>
      );
      remaining = remaining.substring(idx + tag.length);
    }
    if (remaining) {
      parts.push(<span key={key++}>{remaining}</span>);
    }
    return <>{parts}</>;
  };

  const accountDisplayName = (acc: AccountForShortlist) =>
    isHe ? acc.hebrewName || acc.name || '?' : acc.name || '?';

  /* Per-agent colour palette */
  const SENDER_COLORS = [
    { accent: '#4DB6AC', bg: 'rgba(77,182,172,0.12)', bgOwn: 'rgba(77,182,172,0.18)', border: 'rgba(77,182,172,0.25)' },
    { accent: '#F59E0B', bg: 'rgba(245,158,11,0.10)', bgOwn: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.22)' },
    { accent: '#A855F7', bg: 'rgba(168,85,247,0.10)', bgOwn: 'rgba(168,85,247,0.16)', border: 'rgba(168,85,247,0.22)' },
    { accent: '#3B82F6', bg: 'rgba(59,130,246,0.10)', bgOwn: 'rgba(59,130,246,0.16)', border: 'rgba(59,130,246,0.22)' },
    { accent: '#06B6D4', bg: 'rgba(6,182,212,0.10)', bgOwn: 'rgba(6,182,212,0.16)', border: 'rgba(6,182,212,0.22)' },
    { accent: '#EC4899', bg: 'rgba(236,72,153,0.10)', bgOwn: 'rgba(236,72,153,0.16)', border: 'rgba(236,72,153,0.22)' },
    { accent: '#22C55E', bg: 'rgba(34,197,94,0.10)', bgOwn: 'rgba(34,197,94,0.16)', border: 'rgba(34,197,94,0.22)' },
    { accent: '#F97316', bg: 'rgba(249,115,22,0.10)', bgOwn: 'rgba(249,115,22,0.16)', border: 'rgba(249,115,22,0.22)' },
    { accent: '#E879F9', bg: 'rgba(232,121,249,0.10)', bgOwn: 'rgba(232,121,249,0.16)', border: 'rgba(232,121,249,0.22)' },
    { accent: '#818CF8', bg: 'rgba(129,140,248,0.10)', bgOwn: 'rgba(129,140,248,0.16)', border: 'rgba(129,140,248,0.22)' },
    { accent: '#34D399', bg: 'rgba(52,211,153,0.10)', bgOwn: 'rgba(52,211,153,0.16)', border: 'rgba(52,211,153,0.22)' },
    { accent: '#FBBF24', bg: 'rgba(251,191,36,0.10)', bgOwn: 'rgba(251,191,36,0.16)', border: 'rgba(251,191,36,0.22)' },
    { accent: '#38BDF8', bg: 'rgba(56,189,248,0.10)', bgOwn: 'rgba(56,189,248,0.16)', border: 'rgba(56,189,248,0.22)' },
    { accent: '#FB7185', bg: 'rgba(251,113,133,0.10)', bgOwn: 'rgba(251,113,133,0.16)', border: 'rgba(251,113,133,0.22)' },
  ];

  const senderColorMap = useMemo(() => {
    const map = new Map<string, typeof SENDER_COLORS[number]>();
    let idx = 0;
    for (const m of messages) {
      if (!map.has(m.senderAccountId)) {
        map.set(m.senderAccountId, SENDER_COLORS[idx % SENDER_COLORS.length]);
        idx++;
      }
    }
    return map;
  }, [messages]);

  /* ── Component ─────────────────────────────────────────────────────── */

  const displayMessages = searchQuery.trim() ? filteredMessages : messages;

  return (
    <AppLayout>
      {/* Google Fonts for Noir Editorial */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
        rel="stylesheet"
      />
      <style>{`
        .chat-noir-shell {
          --noir-bg: #06070a;
          --noir-surface: #0c0d12;
          --noir-card: #111318;
          --noir-elevated: #16181f;
          --noir-border: rgba(255,255,255,0.05);
          --noir-border-hover: rgba(255,255,255,0.1);
          --noir-text: #eaeaea;
          --noir-muted: rgba(255,255,255,0.25);
          --noir-gold: #C9A84C;
        }
        .chat-noir-shell * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.06) transparent; }
        .chat-noir-header-line::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 28px;
          right: 28px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(77,182,172,0.15), transparent);
        }
        @keyframes chat-noir-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes chat-noir-msg-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .chat-noir-msg-anim { animation: chat-noir-msg-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .chat-noir-search-enter { animation: chat-noir-search-slide 0.2s ease both; }
        @keyframes chat-noir-search-slide { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 60px; } }
      `}</style>

      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="chat-noir-shell flex h-[calc(100vh-64px)] flex-col"
        style={{ background: 'var(--noir-bg)' }}
      >
        {/* ═══ HEADER ═══ */}
        <div
          className="chat-noir-header-line relative flex items-center gap-4 px-7 py-5"
          style={{
            borderBottom: '1px solid var(--noir-border)',
            background: 'linear-gradient(180deg, rgba(17,19,24,0.95) 0%, var(--noir-surface) 100%)',
          }}
        >
          {/* Monogram */}
          <div
            className="flex h-11 w-11 items-center justify-center shrink-0"
            style={{
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(77,182,172,0.15), rgba(77,182,172,0.05))',
              border: '1px solid rgba(77,182,172,0.2)',
            }}
          >
            <span
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, fontStyle: 'italic', color: 'var(--mgsr-teal)' }}
            >
              M
            </span>
          </div>

          {/* Title + online count */}
          <div className="min-w-0">
            <h1
              style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, fontWeight: 400, fontStyle: 'italic', color: 'var(--noir-text)', letterSpacing: -0.3 }}
            >
              {t('chat_room_title')}
            </h1>
            <p
              className="flex items-center gap-1.5"
              style={{ fontSize: 11, color: 'var(--noir-muted)', letterSpacing: 0.8, textTransform: 'uppercase' as const, marginTop: 1 }}
            >
              <span
                className="inline-block shrink-0"
                style={{
                  width: 6,
                  height: 6,
                  background: onlineCount > 0 ? '#4DB6AC' : '#555',
                  borderRadius: '50%',
                  boxShadow: onlineCount > 0 ? '0 0 8px rgba(77,182,172,0.5)' : 'none',
                  animation: onlineCount > 0 ? 'chat-noir-pulse 2s ease infinite' : 'none',
                }}
              />
              {onlineCount > 0
                ? `${onlineCount} ${t('chat_room_online')}`
                : `${accounts.length} ${t('chat_room_members_count')}`}
            </p>
          </div>

          {/* Header actions */}
          <div className={`flex gap-1 ${isRtl ? 'mr-auto' : 'ml-auto'}`}>
            {/* Search toggle */}
            <button
              onClick={() => {
                setShowSearch(!showSearch);
                if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
                if (showSearch) setSearchQuery('');
              }}
              className="flex h-9 w-9 items-center justify-center transition-all"
              style={{
                borderRadius: 10,
                border: `1px solid ${showSearch ? 'rgba(77,182,172,0.3)' : 'var(--noir-border)'}`,
                background: showSearch ? 'rgba(77,182,172,0.08)' : 'transparent',
                color: showSearch ? 'var(--mgsr-teal)' : 'var(--noir-muted)',
              }}
              onMouseEnter={e => { if (!showSearch) { e.currentTarget.style.borderColor = 'var(--noir-border-hover)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; } }}
              onMouseLeave={e => { if (!showSearch) { e.currentTarget.style.borderColor = 'var(--noir-border)'; e.currentTarget.style.color = 'var(--noir-muted)'; } }}
              title={t('chat_room_search')}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ═══ SEARCH BAR ═══ */}
        {showSearch && (
          <div
            className="chat-noir-search-enter flex items-center gap-3 px-7 py-3"
            style={{ borderBottom: '1px solid var(--noir-border)', background: 'rgba(77,182,172,0.02)' }}
          >
            <svg className="h-4 w-4 shrink-0" style={{ color: 'var(--noir-muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('chat_room_search_placeholder')}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--noir-text)', fontFamily: "'DM Sans', sans-serif" }}
            />
            {searchQuery && (
              <span className="text-xs shrink-0" style={{ color: 'var(--noir-muted)' }}>
                {filteredMessages.length} {t('chat_room_search_results')}
              </span>
            )}
            <button
              onClick={() => { setSearchQuery(''); setShowSearch(false); }}
              className="flex h-7 w-7 items-center justify-center shrink-0 transition-colors"
              style={{ borderRadius: 8, color: 'var(--noir-muted)' }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}

        {/* ═══ MESSAGES ═══ */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-7 py-6"
          style={{ background: 'var(--noir-bg)' }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--mgsr-teal)', borderTopColor: 'transparent' }} />
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              {searchQuery ? (
                <p className="text-sm" style={{ color: 'var(--noir-muted)' }}>{t('chat_room_search_no_results')}</p>
              ) : (
                <p style={{ color: 'var(--noir-muted)', fontSize: 13 }}>{t('chat_room_no_messages')}</p>
              )}
            </div>
          ) : (
            displayMessages.map((msg, idx) => {
              const isOwn = msg.senderAccountId === currentAccount?.id;
              const prevMsg = idx > 0 ? displayMessages[idx - 1] : null;
              const showDateSep = idx === 0 || !isSameDay(msg.createdAt, prevMsg?.createdAt || 0);
              const isHighlighted = highlightId === msg.id;
              const sc = senderColorMap.get(msg.senderAccountId) || SENDER_COLORS[0];
              const initials = senderDisplayName(msg).split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

              return (
                <div key={msg.id}>
                  {/* Date separator */}
                  {showDateSep && (
                    <div className="my-5 flex items-center gap-4">
                      <div className="flex-1 h-px" style={{ background: 'var(--noir-border)' }} />
                      <span style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--noir-muted)', whiteSpace: 'nowrap' }}>
                        {formatDateSeparator(msg.createdAt, t('chat_room_today'), t('chat_room_yesterday'))}
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'var(--noir-border)' }} />
                    </div>
                  )}

                  {/* Message bubble row */}
                  <div
                    id={`msg-${msg.id}`}
                    className={`chat-noir-msg-anim group flex gap-3 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}
                    style={{ maxWidth: '75%', marginInlineStart: isOwn ? 'auto' : undefined }}
                  >
                    {/* Avatar */}
                    <div
                      className="flex h-8 w-8 items-center justify-center shrink-0 mt-1"
                      style={{
                        borderRadius: 10,
                        background: sc.bg,
                        border: `1px solid ${sc.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        color: sc.accent,
                      }}
                    >
                      {initials}
                    </div>

                    {/* Content column */}
                    <div className="flex flex-col gap-1 min-w-0">
                      {/* Sender name */}
                      <div
                        className={`flex items-center gap-2 px-0.5 ${isOwn ? (isRtl ? 'justify-start' : 'justify-end') : ''}`}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3, color: sc.accent }}>
                          {senderDisplayName(msg)}
                        </span>
                      </div>

                      {/* Notification badge */}
                      {msg.notifyAccountId && (
                        <div className={`${isOwn ? (isRtl ? '' : 'self-end') : ''}`}>
                          <span
                            className="inline-flex items-center gap-1"
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              letterSpacing: 0.5,
                              padding: '3px 10px',
                              borderRadius: 20,
                              ...(msg.notifyAccountId === 'ALL'
                                ? { background: 'rgba(201,168,76,0.1)', color: 'var(--noir-gold)', border: '1px solid rgba(201,168,76,0.15)' }
                                : { background: 'rgba(77,182,172,0.08)', color: 'var(--mgsr-teal)', border: '1px solid rgba(77,182,172,0.12)' }),
                            }}
                          >
                            {msg.notifyAccountId === 'ALL'
                              ? t('chat_room_notified_everyone')
                              : (() => {
                                  const acc = accounts.find(a => a.id === msg.notifyAccountId);
                                  const name = acc ? (isHe ? acc.hebrewName || acc.name : acc.name) || '?' : '?';
                                  return `🔔 ${name}`;
                                })()}
                          </span>
                        </div>
                      )}

                      {/* Reply preview */}
                      {msg.replyTo && (
                        <div
                          className="flex gap-2 cursor-pointer transition-colors"
                          onClick={() => scrollToMessage(msg.replyTo!.messageId)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.02)',
                            borderLeft: isRtl ? 'none' : `2px solid ${sc.accent}`,
                            borderRight: isRtl ? `2px solid ${sc.accent}` : 'none',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        >
                          <div className="min-w-0">
                            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: sc.accent }}>
                              {isHe ? (msg.replyTo.senderNameHe || msg.replyTo.senderName) : (msg.replyTo.senderName || msg.replyTo.senderNameHe)}
                            </p>
                            <p className="truncate" style={{ fontSize: 11, color: 'var(--noir-muted)', maxWidth: 250 }}>
                              {msg.replyTo.text.substring(0, 80)}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Bubble */}
                      <div
                        className={`relative transition-all duration-500 ${isHighlighted ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20' : ''} ${deletingMsgId === msg.id ? 'opacity-40' : ''}`}
                        style={{
                          padding: '11px 16px',
                          borderRadius: isOwn
                            ? (isRtl ? '4px 14px 14px 14px' : '14px 4px 14px 14px')
                            : (isRtl ? '14px 4px 14px 14px' : '4px 14px 14px 14px'),
                          fontSize: 13.5,
                          lineHeight: 1.55,
                          color: 'var(--noir-text)',
                          background: isOwn ? 'rgba(77,182,172,0.10)' : sc.bg,
                          border: `1px solid ${isOwn ? 'rgba(77,182,172,0.18)' : sc.border}`,
                        }}
                      >
                        {deletingMsgId === msg.id && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--mgsr-teal)', borderTopColor: 'transparent' }} />
                          </div>
                        )}

                        {/* Hover action buttons */}
                        <div
                          className={`absolute -top-3.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${isOwn ? (isRtl ? 'right-0' : 'left-0') : (isRtl ? 'left-0' : 'right-0')}`}
                        >
                          <button
                            onClick={() => setReplyToMessage(msg)}
                            className="flex h-7 w-7 items-center justify-center transition-all"
                            style={{ borderRadius: 8, border: '1px solid var(--noir-border)', background: 'var(--noir-elevated)', color: 'var(--noir-muted)', cursor: 'pointer', fontSize: 13 }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--noir-border-hover)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--noir-border)'; e.currentTarget.style.color = 'var(--noir-muted)'; }}
                            title={t('chat_room_reply_action')}
                          >↩</button>
                          {isOwn && editingMessageId !== msg.id && (
                            <>
                              <button
                                onClick={() => { setEditingMessageId(msg.id); setEditText(msg.text); }}
                                disabled={!!deletingMsgId || isEditSaving}
                                className="flex h-7 w-7 items-center justify-center transition-all disabled:opacity-30"
                                style={{ borderRadius: 8, border: '1px solid var(--noir-border)', background: 'var(--noir-elevated)', color: 'var(--noir-muted)', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--noir-border-hover)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--noir-border)'; e.currentTarget.style.color = 'var(--noir-muted)'; }}
                                title={t('chat_room_edit_action')}
                              >✎</button>
                              <button
                                onClick={() => handleDelete(msg.id)}
                                disabled={!!deletingMsgId || isEditSaving}
                                className="flex h-7 w-7 items-center justify-center transition-all disabled:opacity-30"
                                style={{ borderRadius: 8, border: '1px solid var(--noir-border)', background: 'var(--noir-elevated)', color: 'var(--noir-muted)', cursor: 'pointer', fontSize: 13 }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#EF4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--noir-border)'; e.currentTarget.style.color = 'var(--noir-muted)'; }}
                                title={t('chat_room_delete_action')}
                              >✕</button>
                            </>
                          )}
                        </div>

                        {/* Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mb-2 space-y-1.5">
                            {msg.attachments.map((att, ai) => {
                              const isImage = att.type.startsWith('image/');
                              return isImage ? (
                                <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={att.url}
                                    alt={att.name}
                                    className="max-h-48 cursor-pointer hover:opacity-90 transition"
                                    style={{ borderRadius: 10, objectFit: 'cover' }}
                                  />
                                </a>
                              ) : (
                                <a
                                  key={ai}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2.5 transition-all"
                                  style={{
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--noir-border)',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--noir-border-hover)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--noir-border)'; }}
                                >
                                  <div
                                    className="flex h-8 w-8 items-center justify-center shrink-0"
                                    style={{ borderRadius: 8, background: 'rgba(77,182,172,0.08)' }}
                                  >
                                    <svg className="h-3.5 w-3.5" style={{ color: 'var(--mgsr-teal)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate" style={{ fontSize: 12, fontWeight: 500, color: 'var(--noir-text)' }}>{att.name}</p>
                                    <p style={{ fontSize: 10, color: 'var(--noir-muted)' }}>{(att.size / 1024).toFixed(0)} KB</p>
                                  </div>
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Message text / edit mode */}
                        {editingMessageId === msg.id ? (
                          <div className="flex flex-col gap-1">
                            <input
                              autoFocus
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleEditSave(); }
                                if (e.key === 'Escape') { setEditingMessageId(null); setEditText(''); }
                              }}
                              className="rounded-lg bg-black/30 px-3 py-1.5 text-sm outline-none"
                              style={{ color: 'var(--noir-text)', border: '1px solid rgba(77,182,172,0.3)' }}
                            />
                            <div className="flex gap-3 text-xs">
                              <button onClick={handleEditSave} disabled={isEditSaving} className="flex items-center gap-1 disabled:opacity-50" style={{ color: 'var(--mgsr-teal)' }}>
                                {isEditSaving && <span className="inline-block h-3 w-3 animate-spin rounded-full border border-t-transparent" style={{ borderColor: 'var(--mgsr-teal)', borderTopColor: 'transparent' }} />}
                                {t('chat_room_save')}
                              </button>
                              <button onClick={() => { if (!isEditSaving) { setEditingMessageId(null); setEditText(''); } }} className="disabled:opacity-50" style={{ color: 'var(--noir-muted)' }} disabled={isEditSaving}>{t('chat_room_cancel')}</button>
                            </div>
                          </div>
                        ) : msg.text ? (
                          <p className="text-sm leading-relaxed break-words">
                            {renderMessageText(msg)}
                          </p>
                        ) : null}
                      </div>

                      {/* Timestamp row */}
                      <div className={`flex items-center gap-1.5 px-0.5 ${isOwn ? (isRtl ? 'justify-start' : 'justify-end') : ''}`}>
                        {msg.editedAt && (
                          <span style={{ fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,0.18)' }}>{t('chat_room_edited')}</span>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--noir-muted)' }}>{formatTime(msg.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ═══ REPLY BAR ═══ */}
        {replyToMessage && (
          <div
            className="flex items-center gap-3 px-7 py-2.5"
            style={{
              borderTop: '1px solid var(--noir-border)',
              background: 'rgba(77,182,172,0.03)',
            }}
          >
            <div className="shrink-0" style={{ width: 3, height: 28, borderRadius: 2, background: 'var(--mgsr-teal)' }} />
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--mgsr-teal)' }}>
                {isHe ? (replyToMessage.senderNameHe || replyToMessage.senderName) : (replyToMessage.senderName || replyToMessage.senderNameHe)}
              </p>
              <p className="truncate" style={{ fontSize: 11, color: 'var(--noir-muted)' }}>
                {replyToMessage.text.substring(0, 80) || t('chat_room_attachment_fallback')}
              </p>
            </div>
            <button
              onClick={() => setReplyToMessage(null)}
              className="flex h-7 w-7 items-center justify-center shrink-0 transition-colors"
              style={{ borderRadius: 8, color: 'var(--noir-muted)' }}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}

        {/* ═══ NOTIFY BAR ═══ */}
        {accounts.length > 0 && (
          <div
            className="flex items-center gap-2 px-7 py-2.5 overflow-x-auto"
            style={{ borderTop: '1px solid var(--noir-border)', background: 'var(--noir-surface)', scrollbarWidth: 'none' }}
          >
            <span
              className="shrink-0"
              style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' as const, color: 'var(--noir-muted)', marginRight: 4 }}
            >
              {t('chat_room_notify_label')}
            </span>
            <button
              onClick={() => setTargetAccountId(targetAccountId === 'ALL' ? null : 'ALL')}
              className="shrink-0 transition-all"
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                border: `1px solid ${targetAccountId === 'ALL' ? 'rgba(201,168,76,0.4)' : 'var(--noir-border)'}`,
                color: targetAccountId === 'ALL' ? 'var(--noir-gold)' : 'rgba(255,255,255,0.5)',
                background: targetAccountId === 'ALL' ? 'rgba(201,168,76,0.12)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {t('chat_room_notify_all')}
            </button>
            {accounts
              .filter((a) => a.id !== currentAccount?.id)
              .map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setTargetAccountId(targetAccountId === acc.id ? null : acc.id)}
                  className="shrink-0 transition-all"
                  style={{
                    padding: '5px 14px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    border: `1px solid ${targetAccountId === acc.id ? 'rgba(77,182,172,0.4)' : 'var(--noir-border)'}`,
                    color: targetAccountId === acc.id ? 'var(--mgsr-teal)' : 'rgba(255,255,255,0.5)',
                    background: targetAccountId === acc.id ? 'rgba(77,182,172,0.08)' : 'transparent',
                  }}
                >
                  {accountDisplayName(acc)}
                </button>
              ))}
          </div>
        )}

        {/* ═══ @MENTION DROPDOWN ═══ */}
        {showMentionDropdown && (
          <div className="relative">
            <div
              className="absolute bottom-0 left-0 right-0 z-50 max-h-48 overflow-y-auto shadow-xl"
              style={{ borderTop: '1px solid var(--noir-border)', background: 'var(--noir-card)' }}
            >
              {filteredPlayers.length === 0 ? (
                <div className="p-3 text-center text-sm" style={{ color: 'var(--noir-muted)' }}>
                  {t('chat_room_no_players_found')}
                </div>
              ) : (
                filteredPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectMention(p)}
                    className="flex w-full items-center gap-3 px-7 py-2 transition"
                    style={{ textAlign: isRtl ? 'right' : 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {p.profileImage ? (
                      <img src={p.profileImage} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs" style={{ background: 'rgba(77,182,172,0.12)', color: 'var(--mgsr-teal)' }}>
                        {(p.fullName || '?')[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-sm" style={{ color: 'var(--noir-text)' }}>
                        {isHe ? p.fullNameHe || p.fullName : p.fullName || p.fullNameHe}
                      </p>
                      {p.positions?.[0] && (
                        <p style={{ fontSize: 11, color: 'var(--noir-muted)' }}>{p.positions[0]}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* ═══ COMPOSER ═══ */}
        <div style={{ borderTop: '1px solid var(--noir-border)', background: 'var(--noir-surface)' }}>
          {/* Pending attachments */}
          {pendingAttachments.length > 0 && (
            <div className="flex items-center gap-2 px-7 py-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--noir-border)' }}>
              {pendingAttachments.map((pa, i) => (
                <div
                  key={i}
                  className="relative shrink-0 h-14 w-14 overflow-hidden"
                  style={{ borderRadius: 10, border: '1px solid var(--noir-border)', background: 'rgba(255,255,255,0.03)' }}
                >
                  {pa.previewUrl ? (
                    <img src={pa.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg className="h-5 w-5" style={{ color: 'var(--mgsr-teal)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                  )}
                  <button
                    onClick={() => removePendingAttachment(i)}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-white text-[10px] hover:bg-red-500"
                    style={{ background: 'rgba(0,0,0,0.7)' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Uploading indicator */}
          {isUploading && (
            <div className="flex items-center gap-2 px-7 py-1" style={{ fontSize: 12, color: 'var(--noir-muted)' }}>
              <div className="h-3 w-3 animate-spin rounded-full border border-t-transparent" style={{ borderColor: 'var(--mgsr-teal)', borderTopColor: 'transparent' }} />
              {t('chat_room_uploading')}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2.5 px-7 py-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || isUploading}
              className="flex h-10 w-10 items-center justify-center shrink-0 transition-all disabled:opacity-40"
              style={{
                borderRadius: 12,
                border: '1px solid var(--noir-border)',
                background: 'transparent',
                color: 'var(--noir-muted)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--noir-border-hover)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--noir-border)'; e.currentTarget.style.color = 'var(--noir-muted)'; }}
              title={t('chat_room_attach_file')}
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,video/*,.doc,.docx,.xls,.xlsx"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat_room_type_message')}
              className="flex-1 outline-none transition-all"
              style={{
                padding: '11px 18px',
                borderRadius: 14,
                border: '1px solid var(--noir-border)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--noir-text)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13.5,
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'rgba(77,182,172,0.25)';
                e.currentTarget.style.background = 'rgba(77,182,172,0.03)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(77,182,172,0.06)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--noir-border)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <button
              onClick={handleSend}
              disabled={(!text.trim() && pendingAttachments.length === 0) || isSending || isUploading || (showMentionDropdown && filteredPlayers.length > 0)}
              className="flex h-10 w-10 items-center justify-center shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderRadius: 12,
                border: 'none',
                background: 'var(--mgsr-teal)',
                color: '#0a0b0f',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#5CC4BA'; e.currentTarget.style.boxShadow = '0 0 20px rgba(77,182,172,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--mgsr-teal)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              {isSending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#0a0b0f', borderTopColor: 'transparent' }} />
              ) : (
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
