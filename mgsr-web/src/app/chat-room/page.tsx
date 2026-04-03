'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import AppLayout from '@/components/AppLayout';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import {
  getCurrentAccountForShortlist,
  getAllAccounts,
  type AccountForShortlist,
} from '@/lib/accounts';
import { callChatRoomSend } from '@/lib/callables';
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
  targetAccountId?: string;
  createdAt: Timestamp | null;
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

function formatTime(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(ts: Timestamp | null): string {
  if (!ts) return '';
  const d = ts.toDate();
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function isSameDay(a: Timestamp | null, b: Timestamp | null): boolean {
  if (!a || !b) return false;
  return a.toDate().toDateString() === b.toDate().toDateString();
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

  /* @mention state */
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [collectedMentions, setCollectedMentions] = useState<PlayerMention[]>(
    []
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* scroll to bottom */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
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
    if (!text.trim() || !currentAccount || isSending) return;
    setIsSending(true);
    try {
      await callChatRoomSend({
        text: text.trim(),
        senderAccountId: currentAccount.id,
        senderName: currentAccount.name || '',
        senderNameHe: currentAccount.hebrewName || currentAccount.name || '',
        mentions: collectedMentions,
        targetAccountId: targetAccountId || undefined,
      });
      setText('');
      setCollectedMentions([]);
      setTargetAccountId(null);
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
              {accounts.length} members
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
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

              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="my-3 text-center">
                      <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-400">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    id={`msg-${msg.id}`}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 transition-all duration-500 ${
                        isHighlighted
                          ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-400/20'
                          : ''
                      } ${
                        isOwn
                          ? 'bg-gradient-to-br from-[var(--mgsr-teal)] to-teal-700 text-white'
                          : 'bg-white/5 text-gray-100'
                      }`}
                    >
                      {!isOwn && (
                        <p className="mb-0.5 text-xs font-semibold text-[var(--mgsr-teal)]">
                          {senderDisplayName(msg)}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed break-words">
                        {renderMessageText(msg)}
                      </p>
                      <p
                        className={`mt-1 text-[10px] ${
                          isOwn ? 'text-white/60' : 'text-gray-500'
                        } ${isRtl ? 'text-left' : 'text-right'}`}
                      >
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
                  No players found
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

        {/* Input bar */}
        <div className="flex items-center gap-2 border-t border-white/10 bg-[var(--mgsr-dark)] px-4 py-3">
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
            disabled={!text.trim() || isSending}
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
    </AppLayout>
  );
}
