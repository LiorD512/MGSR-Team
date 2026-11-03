'use client';

/** "Window target" switch for the men player profile (Status block). Any agent can toggle it. */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LEVEL_FOCUS_ENABLED } from '@/lib/featureFlags';
import type { PlayerTierDoc } from '@/lib/tiering/types';

export default function WindowTargetSwitch({ playerId }: { playerId: string }) {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [doc, setDoc] = useState<PlayerTierDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await user!.getIdToken();
      const res = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [user]
  );

  useEffect(() => {
    if (!user || !LEVEL_FOCUS_ENABLED) return;
    call(`/api/tiering?playerId=${encodeURIComponent(playerId)}`)
      .then((r: { items: PlayerTierDoc[] }) => setDoc(r.items[0] ?? { playerId }))
      .catch(() => setDoc({ playerId }));
  }, [user, call, playerId]);

  if (!LEVEL_FOCUS_ENABLED || !doc) return null;
  const on = !!doc.windowTarget;
  const toggle = async () => {
    setBusy(true);
    try {
      const r = (await call('/api/tiering/action', { method: 'POST', body: JSON.stringify({ playerId, action: on ? 'unmark' : 'mark' }) })) as { item: PlayerTierDoc };
      setDoc(r.item);
      if (!on) call('/api/tiering/run', { method: 'POST', body: JSON.stringify({ playerId }) }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const by = doc.windowTarget
    ? `${doc.windowTarget.by} · ${new Date(doc.windowTarget.at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short' })}`
    : t('pb_switch_sub');
  return (
    <div className="bp-switchrow">
      <div>
        <div className="lbl">★ {t('pb_window_target')}</div>
        <div className="sub">{by}</div>
      </div>
      <label className="bp-sw">
        <input type="checkbox" checked={on} disabled={busy} onChange={toggle} />
        <span className="track" />
      </label>
    </div>
  );
}
