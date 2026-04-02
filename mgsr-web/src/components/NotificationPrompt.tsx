'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getNotificationStatus,
  requestNotificationPermission,
  saveWebFcmToken,
} from '@/lib/notifications';

const DISMISSED_KEY = 'mgsr_notif_prompt_dismissed';

async function findAccountId(email: string): Promise<string | null> {
  const snap = await getDocs(collection(db, 'Accounts'));
  const emailLower = email.toLowerCase();
  const doc = snap.docs.find(d => (d.data().email as string)?.toLowerCase() === emailLower);
  return doc?.id ?? null;
}

export default function NotificationPrompt() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only show if: browser supports notifications, permission is 'default' (not yet asked), and user hasn't dismissed
    const status = getNotificationStatus();
    if (status !== 'default') return;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;
    // Small delay so it doesn't flash immediately on page load
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleEnable = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const token = await requestNotificationPermission();
      if (token) {
        const accountId = await findAccountId(user.email);
        if (accountId) {
          await saveWebFcmToken(accountId, token);
          try {
            const { httpsCallable, getFunctions } = await import('firebase/functions');
            const functions = getFunctions(undefined, 'us-central1');
            const subscribe = httpsCallable(functions, 'subscribeToTopicCallable');
            await subscribe({ token, topic: 'mgsr_all' });
          } catch (e) {
            console.warn('Topic subscription failed:', e);
          }
        }
      }
    } finally {
      setLoading(false);
      setVisible(false);
    }
  }, [user]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleDismiss}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-8 space-y-5 animate-in fade-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-mgsr-teal/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-mgsr-teal">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-mgsr-text text-center">
          {t('notif_prompt_title')}
        </h2>

        {/* Description */}
        <p className="text-sm text-mgsr-muted text-center leading-relaxed">
          {t('notif_prompt_desc')}
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="w-full px-4 py-3 text-sm font-semibold bg-mgsr-teal text-mgsr-dark rounded-xl hover:bg-mgsr-teal/80 transition disabled:opacity-50"
          >
            {loading ? '...' : t('notif_prompt_enable')}
          </button>
          <button
            onClick={handleDismiss}
            disabled={loading}
            className="w-full px-4 py-2.5 text-sm text-mgsr-muted hover:text-mgsr-text transition rounded-xl"
          >
            {t('notif_prompt_later')}
          </button>
        </div>
      </div>
    </div>
  );
}
