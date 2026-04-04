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

  return (
    <AppLayout>
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="flex h-[calc(100vh-64px)] flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-[var(--mgsr-dark)] px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mgsr-teal)]/20">
            <svg
              className="h-5 w-5 text-[var(--mgsr-teal)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">
              {t('chat_room_title')}
            </h1>
            <p className="text-xs text-gray-400">
              {accounts.length} {t('chat_room_members_count')}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--mgsr-teal)] border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-gray-500">{t('chat_room_no_messages')}</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isOwn = msg.senderAccountId === currentAccount?.id;
              const showDateSep =
                idx === 0 ||
                !isSameDay(msg.createdAt, messages[idx - 1].createdAt);
              const isHighlighted = highlightId === msg.id;
              const sc = senderColorMap.get(msg.senderAccountId) || SENDER_COLORS[0];

              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="my-3 text-center">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-400">
                        {formatDateSeparator(msg.createdAt, t('chat_room_today'), t('chat_room_yesterday'))}
                      </span>
                    </div>
                  )}
                  <div
                    id={`msg-${msg.id}`}
                    className={`group flex ${isOwn ? (isRtl ? 'justify-start' : 'justify-end') : (isRtl ? 'justify-end' : 'justify-start')}`}
                  >
                    {/* action buttons (left of bubble for own, right for others) */}
                    <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isOwn ? 'mr-2 order-first' : 'ml-2 order-last'}`}>
                      <button
                        onClick={() => setReplyToMessage(msg)}
                        className="rounded p-1 text-xs text-gray-400 hover:bg-white/10 hover:text-[var(--mgsr-teal)]"
                        title={t('chat_room_reply_action')}
                      >↩️</button>
                      {isOwn && editingMessageId !== msg.id && (
                        <>
                          <button
                            onClick={() => { setEditingMessageId(msg.id); setEditText(msg.text); }}
                            disabled={!!deletingMsgId || isEditSaving}
                            className="rounded p-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                            title={t('chat_room_edit_action')}
                          >✏️</button>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            disabled={!!deletingMsgId || isEditSaving}
                            className="rounded p-1 text-xs text-gray-400 hover:bg-red-500/20 hover:text-red-400 disabled:opacity-30"
                            title={t('chat_room_delete_action')}
                          >🗑️</button>
                        </>
                      )}
                    </div>
                    <div
                      className={`relative max-w-[70%] rounded-2xl px-4 py-2 transition-all duration-500 ${
                        isHighlighted
                          ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20'
                          : ''
                      } text-white ${deletingMsgId === msg.id ? 'opacity-40' : ''}`}
                      style={{
                        background: isOwn ? sc.bgOwn : sc.bg,
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: sc.border,
                      }}
                    >
                      {deletingMsgId === msg.id && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center">
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--mgsr-teal)] border-t-transparent" />
                        </div>
                      )}
                      {!isOwn && (
                        <p className="mb-0.5 text-xs font-semibold" style={{ color: sc.accent }}>
                          {senderDisplayName(msg)}
                        </p>
                      )}
                      {isOwn && (
                        <p className="mb-0.5 text-xs font-semibold text-white/70">
                          {senderDisplayName(msg)}
                        </p>
                      )}
                      {/* Notification indicator */}
                      {msg.notifyAccountId && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400 mb-1">
                          {msg.notifyAccountId === 'ALL'
                            ? t('chat_room_notified_everyone')
                            : (() => {
                                const acc = accounts.find(a => a.id === msg.notifyAccountId);
                                const name = acc ? (isHe ? acc.hebrewName || acc.name : acc.name) || '?' : '?';
                                return `🔔 ${name}`;
                              })()}
                        </span>
                      )}
                      {/* Reply-to preview */}
                      {msg.replyTo && (
                        <div
                          className="mb-1.5 rounded-md px-2 py-1.5 cursor-pointer"
                          style={{ background: 'rgba(255,255,255,0.06)', borderLeft: `3px solid ${sc.accent}` }}
                          onClick={() => scrollToMessage(msg.replyTo!.messageId)}
                        >
                          <p className="text-[10px] font-semibold" style={{ color: sc.accent }}>
                            {isHe ? (msg.replyTo.senderNameHe || msg.replyTo.senderName) : (msg.replyTo.senderName || msg.replyTo.senderNameHe)}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">{msg.replyTo.text.substring(0, 80)}</p>
                        </div>
                      )}
                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mb-1 space-y-1">
                          {msg.attachments.map((att, ai) => {
                            const isImage = att.type.startsWith('image/');
                            return isImage ? (
                              <a key={ai} href={att.url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={att.url}
                                  alt={att.name}
                                  className="max-h-48 rounded-lg object-cover cursor-pointer hover:opacity-90 transition"
                                />
                              </a>
                            ) : (
                              <a
                                key={ai}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-xs text-[var(--mgsr-teal)] hover:bg-white/10 transition"
                              >
                                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="truncate">{att.name}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
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
                            className="rounded bg-black/30 px-2 py-1 text-sm text-white outline-none ring-1 ring-[var(--mgsr-teal)]"
                          />
                          <div className="flex gap-2 text-xs">
                            <button onClick={handleEditSave} disabled={isEditSaving} className="text-[var(--mgsr-teal)] hover:underline disabled:opacity-50 flex items-center gap-1">
                              {isEditSaving && <span className="inline-block h-3 w-3 animate-spin rounded-full border border-[var(--mgsr-teal)] border-t-transparent" />}
                              {t('chat_room_save')}
                            </button>
                            <button onClick={() => { if (!isEditSaving) { setEditingMessageId(null); setEditText(''); } }} className="text-gray-400 hover:underline disabled:opacity-50" disabled={isEditSaving}>{t('chat_room_cancel')}</button>
                          </div>
                        </div>
                      ) : msg.text ? (
                        <p className="text-sm leading-relaxed break-words">
                          {renderMessageText(msg)}
                        </p>
                      ) : null}
                      <p
                        className={`mt-1 text-[10px] ${
                          isOwn ? 'text-white/60' : 'text-gray-500'
                        } ${isOwn ? (isRtl ? 'text-right' : 'text-left') : (isRtl ? 'text-left' : 'text-right')}`}
                      >
                        {msg.editedAt ? <span className="mr-1 italic">{t('chat_room_edited')}</span> : null}
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Target user selector */}
        {accounts.length > 0 && (
          <div className="flex items-center gap-2 border-t border-white/5 bg-[var(--mgsr-dark)] px-4 py-2 overflow-x-auto">
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {t('chat_room_notify_label')}
            </span>
            <button
              onClick={() =>
                setTargetAccountId(targetAccountId === 'ALL' ? null : 'ALL')
              }
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                targetAccountId === 'ALL'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {t('chat_room_notify_all')}
            </button>
            {accounts
              .filter((a) => a.id !== currentAccount?.id)
              .map((acc) => (
                <button
                  key={acc.id}
                  onClick={() =>
                    setTargetAccountId(
                      targetAccountId === acc.id ? null : acc.id
                    )
                  }
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                    targetAccountId === acc.id
                      ? 'bg-[var(--mgsr-teal)] text-white'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {accountDisplayName(acc)}
                </button>
              ))}
          </div>
        )}

        {/* @mention dropdown */}
        {showMentionDropdown && (
          <div className="relative">
            <div className="absolute bottom-0 left-0 right-0 z-50 max-h-48 overflow-y-auto border-t border-white/10 bg-[#1a2233] shadow-xl">
              {filteredPlayers.length === 0 ? (
                <div className="p-3 text-center text-sm text-gray-500">
                  {t('chat_room_no_players_found')}
                </div>
              ) : (
                filteredPlayers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectMention(p)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition"
                  >
                    {p.profileImage ? (
                      <img
                        src={p.profileImage}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--mgsr-teal)]/20 text-xs text-[var(--mgsr-teal)]">
                        {(p.fullName || '?')[0]}
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-white">
                        {isHe
                          ? p.fullNameHe || p.fullName
                          : p.fullName || p.fullNameHe}
                      </p>
                      {p.positions?.[0] && (
                        <p className="text-xs text-gray-500">
                          {p.positions[0]}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Reply preview + Pending attachments + Input bar */}
        <div className="border-t border-white/10 bg-[var(--mgsr-dark)]">
          {/* Reply preview bar */}
          {replyToMessage && (
            <div className="flex items-center gap-2 px-4 py-2 bg-[var(--mgsr-teal)]/5 border-b border-white/5">
              <div className="w-1 h-8 rounded-full bg-[var(--mgsr-teal)]" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--mgsr-teal)]">
                  {isHe ? (replyToMessage.senderNameHe || replyToMessage.senderName) : (replyToMessage.senderName || replyToMessage.senderNameHe)}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {replyToMessage.text.substring(0, 80) || t('chat_room_attachment_fallback')}
                </p>
              </div>
              <button onClick={() => setReplyToMessage(null)} className="text-gray-400 hover:text-white p-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Pending attachments preview */}
          {pendingAttachments.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 overflow-x-auto">
              {pendingAttachments.map((pa, i) => (
                <div key={i} className="relative shrink-0 h-14 w-14 rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                  {pa.previewUrl ? (
                    <img src={pa.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg className="h-5 w-5 text-[var(--mgsr-teal)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <button
                    onClick={() => removePendingAttachment(i)}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white text-[10px] hover:bg-red-500"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {/* Uploading indicator */}
          {isUploading && (
            <div className="flex items-center gap-2 px-4 py-1 text-xs text-gray-400">
              <div className="h-3 w-3 animate-spin rounded-full border border-[var(--mgsr-teal)] border-t-transparent" />
              {t('chat_room_uploading')}
            </div>
          )}

          {/* Input row */}
          <div className="flex items-center gap-2 px-4 py-3">
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || isUploading}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-[var(--mgsr-teal)] hover:bg-white/10 transition disabled:opacity-40"
              title={t('chat_room_attach_file')}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
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
              className="flex-1 rounded-full bg-white/5 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:ring-1 focus:ring-[var(--mgsr-teal)]"
            />
            <button
              onClick={handleSend}
              disabled={(!text.trim() && pendingAttachments.length === 0) || isSending || isUploading || (showMentionDropdown && filteredPlayers.length > 0)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mgsr-teal)] text-white transition hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
