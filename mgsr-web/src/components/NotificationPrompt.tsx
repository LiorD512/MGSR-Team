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

const DISMISSED_KEY = 'mgsr_notif_prompt_dismissed_v2';

async function findAccountId(email: string): Promise<string | null> {
  const snap = await getDocs(collection(db, 'Accounts'));
  const emailLower = email.toLowerCase();
  const doc = snap.docs.find(d => (d.data().email as string)?.toLowerCase() === emailLower);
  return doc?.id ?? null;
}

export default function NotificationPrompt() {
  const { user } = useAuth();
  const { t, isRtl } = useLanguage();
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
    <div
      className="brit-room"
      dir={isRtl ? 'rtl' : 'ltr'}
      lang={isRtl ? 'he' : 'en'}
      style={{ position: 'static', inset: 'auto', background: 'transparent', zIndex: 'auto', overflow: 'visible' }}
    >
      <div className="brit-backdrop open" onClick={handleDismiss}>
        <div className="brit-modal brit-notif-modal" dir={isRtl ? 'rtl' : 'ltr'} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="brit-close"
            onClick={handleDismiss}
            disabled={loading}
            aria-label={isRtl ? 'סגור' : 'Close'}
          >
            ×
          </button>

          <div className="brit-notif-seal" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>

          <p className="brit-modal-kicker">{isRtl ? 'מרכז התראות' : 'Notification centre'}</p>
          <h2>{t('notif_prompt_title')}</h2>
          <p className="brit-notif-desc">{t('notif_prompt_desc')}</p>

          <div className="brit-notif-actions">
            <button
              type="button"
              className="brit-modal-action"
              onClick={handleEnable}
              disabled={loading}
            >
              {loading ? (isRtl ? 'מפעיל…' : 'Enabling…') : t('notif_prompt_enable')}
            </button>
            <button
              type="button"
              className="brit-modal-action brit-modal-action-secondary"
              onClick={handleDismiss}
              disabled={loading}
            >
              {t('notif_prompt_later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
